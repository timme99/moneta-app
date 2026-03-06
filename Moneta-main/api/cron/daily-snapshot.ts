/**
 * api/cron/daily-snapshot.ts
 *
 * Vercel Cron Job – täglich um 22:00 UTC ausführen.
 * Konfiguration in vercel.json:
 *   { "crons": [{ "path": "/api/cron/daily-snapshot", "schedule": "0 22 * * *" }] }
 *
 * Aufgabe:
 *  1. Alle User mit Holdings laden (via Service-Role)
 *  2. Für jeden User: Gesamtwert der Positionen berechnen (Alpha Vantage Kurse)
 *  3. Snapshot in portfolio_snapshots speichern (UPSERT auf user_id + snapshot_date)
 *
 * Rate-Limiting:
 *  - Alpha Vantage Free: 25 Anfragen/Tag → maximal 25 einzigartige Symbole pro Lauf
 *  - Symbole global gecacht (30min), daher nicht jeder User = eine API-Anfrage
 *
 * Authentifizierung: CRON_SECRET Header-Check (wie weekly-digest.ts)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = process.env.MONETA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_SERVICE  = process.env.MONETA_SUPABASE_SERVICE_ROLE_KEY ?? '';
const AV_API_KEY        = process.env.ALPHA_VANTAGE_API_KEY ?? '';
const CRON_SECRET       = process.env.CRON_SECRET ?? '';
const APP_BASE_URL      = process.env.APP_URL ?? '';

// In-Memory Preis-Cache für diesen Cron-Lauf (30 min TTL)
const priceCache = new Map<string, { price: number; fetchedAt: number }>();
const PRICE_TTL  = 30 * 60 * 1000;

async function fetchPrice(symbol: string): Promise<number | null> {
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < PRICE_TTL) return cached.price;

  // Intern /api/stocks aufrufen (nutzt bestehenden AV-Cache)
  const url = `${APP_BASE_URL}/api/stocks?symbol=${encodeURIComponent(symbol)}`;
  try {
    const resp = await fetch(url, { headers: { 'x-cron': '1' } });
    if (!resp.ok) return null;
    const data = await resp.json();
    const price = typeof data.price === 'number' && data.price > 0 ? data.price : null;
    if (price) priceCache.set(symbol, { price, fetchedAt: Date.now() });
    return price;
  } catch {
    // Direct AV fallback
    if (!AV_API_KEY) return null;
    try {
      const avUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${AV_API_KEY}`;
      const avResp = await fetch(avUrl);
      if (!avResp.ok) return null;
      const avData = await avResp.json();
      const q = avData['Global Quote'];
      if (!q) return null;
      const price = parseFloat(q['05. price'] ?? '0') || null;
      if (price) priceCache.set(symbol, { price, fetchedAt: Date.now() });
      return price;
    } catch {
      return null;
    }
  }
}

export default async function handler(req: any, res: any) {
  // Auth-Check
  const secret = req.headers['x-cron-secret'] ?? req.query.secret;
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE) {
    return res.status(500).json({ error: 'Supabase nicht konfiguriert.' });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

  // Alle Holdings laden (service_role umgeht RLS)
  const { data: allHoldings, error: holdingsErr } = await sb
    .from('holdings')
    .select('user_id, symbol, shares, buy_price')
    .not('shares', 'is', null);

  if (holdingsErr) {
    console.error('[daily-snapshot] holdings error:', holdingsErr.message);
    return res.status(500).json({ error: holdingsErr.message });
  }

  if (!allHoldings?.length) {
    return res.status(200).json({ message: 'Keine Holdings vorhanden.', snapshots: 0 });
  }

  // Pro User gruppieren
  const byUser = new Map<string, Array<{ symbol: string; shares: number; buy_price: number | null }>>();
  for (const h of allHoldings as any[]) {
    if (!h.shares || h.shares <= 0) continue;
    const arr = byUser.get(h.user_id) ?? [];
    arr.push({ symbol: h.symbol, shares: h.shares, buy_price: h.buy_price });
    byUser.set(h.user_id, arr);
  }

  let snapshotCount = 0;
  const snapshots: any[] = [];

  for (const [userId, positions] of byUser.entries()) {
    let totalValue    = 0;
    let totalInvested = 0;
    let priceCount    = 0;

    for (const pos of positions) {
      const price = await fetchPrice(pos.symbol);
      if (price && price > 0) {
        totalValue    += price * pos.shares;
        priceCount++;
      }
      if (pos.buy_price && pos.buy_price > 0) {
        totalInvested += pos.buy_price * pos.shares;
      }
    }

    // Nur speichern wenn mindestens ein Kurs verfügbar
    if (priceCount === 0 || totalValue <= 0) continue;

    snapshots.push({
      user_id:        userId,
      snapshot_date:  today,
      total_value:    Math.round(totalValue * 100) / 100,
      total_invested: totalInvested > 0 ? Math.round(totalInvested * 100) / 100 : null,
    });
    snapshotCount++;
  }

  if (!snapshots.length) {
    return res.status(200).json({ message: 'Keine Snapshots erstellt (keine Kursdaten).', snapshots: 0 });
  }

  // Batch-Upsert
  const { error: upsertErr } = await sb
    .from('portfolio_snapshots')
    .upsert(snapshots, { onConflict: 'user_id,snapshot_date' });

  if (upsertErr) {
    console.error('[daily-snapshot] upsert error:', upsertErr.message);
    return res.status(500).json({ error: upsertErr.message });
  }

  console.log(`[daily-snapshot] ${snapshotCount} Snapshots für ${today} gespeichert.`);
  return res.status(200).json({ message: 'OK', snapshots: snapshotCount, date: today });
}
