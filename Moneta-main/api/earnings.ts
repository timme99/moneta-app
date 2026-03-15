/**
 * GET /api/earnings?symbols=AAPL,SAP.DE
 *
 * Cache-First Earnings-Kalender via Supabase stock_events-Tabelle.
 *
 * Ablauf:
 *  1. Lade alle gecachten Einträge aus stock_events für die übergebenen Symbole.
 *  2. Identifiziere das erste Symbol, das noch nie (oder vor >30 Tagen) gescannt wurde.
 *  3. Rufe Gemini genau für dieses EINE Symbol auf (< 8 s, weit unter Vercel-Limit).
 *  4. Schreibe neue Termine sofort per upsert in stock_events.
 *  5. Gib gecachte + neue zukünftige Termine zurück.
 *
 *  Beim nächsten Seitenaufruf wird das nächste fehlende Symbol gescannt.
 *  Die Datenbank "füllt sich" so selbst – ohne jemals ein Timeout zu riskieren.
 *
 * Header: Authorization: Bearer <supabase-access-token>
 */

import { createClientWithToken, getSupabaseAdmin } from '../lib/supabaseClient.js';

const GEMINI_MODEL    = 'gemini-2.5-flash';
const CACHE_TTL_MS    = 30 * 24 * 60 * 60 * 1000; // 30 Tage
const SENTINEL_DATE   = '1970-01-01';               // Pseudo-Datum für Scan-Marker
const SCAN_TIMEOUT_MS = 8_000;                      // 8 s AbortController-Timeout

function stripJsonFences(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return m ? m[1].trim() : text.trim();
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Nur GET erlaubt.' });

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const authHeader = (req.headers.authorization ?? '') as string;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Bearer-Token fehlt.' });

  try {
    const userClient = createClientWithToken(token);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return res.status(401).json({ error: 'Token ungültig oder abgelaufen.' });
  } catch {
    return res.status(500).json({ error: 'Auth-Initialisierung fehlgeschlagen.' });
  }

  // ── Parameter ─────────────────────────────────────────────────────────────────
  const rawSymbols = ((req.query.symbols as string) ?? '').trim();
  if (!rawSymbols) return res.status(400).json({ error: 'Parameter "symbols" fehlt (z. B. ?symbols=AAPL,SAP.DE).' });

  const symbols = rawSymbols
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 15);

  const today = new Date().toISOString().split('T')[0];
  const admin = getSupabaseAdmin();

  // ── 1. Lade alle vorhandenen Zeilen für diese Symbole ────────────────────────
  const { data: allRows, error: dbErr } = await admin
    .from('stock_events')
    .select('symbol, event_type, event_date, quarter, details, last_updated')
    .in('symbol', symbols) as any;

  if (dbErr) {
    console.error('[earnings] DB-Fehler beim Lesen:', dbErr.message);
    return res.status(500).json({ error: 'Datenbankfehler.' });
  }

  const rows: any[] = allRows ?? [];

  // ── 2. Scan-Zeitstempel pro Symbol (aus '_scanned'-Sentinel-Zeilen) ──────────
  const scanTimes = new Map<string, number>();
  for (const r of rows) {
    if (r.event_type === '_scanned') {
      const t = new Date(r.last_updated).getTime();
      if (t > (scanTimes.get(r.symbol) ?? 0)) {
        scanTimes.set(r.symbol, t);
      }
    }
  }

  // Symbole, die noch nie oder vor > 30 Tagen gescannt wurden
  const staleSymbols = symbols.filter(s => {
    const last = scanTimes.get(s);
    return !last || Date.now() - last > CACHE_TTL_MS;
  });

  // ── 3. Genau EIN Symbol per Gemini-Aufruf scannen ───────────────────────────
  let scannedSymbol: string | null = null;

  if (staleSymbols.length > 0) {
    const sym = staleSymbols[0];
    scannedSymbol = sym;

    try {
      const newEvents = await scanSingleStock(sym, today);
      console.log(`[earnings] ${sym}: ${newEvents.length} neue Termine gefunden`);

      for (const evt of newEvents) {
        // Nur zukünftige Termine aufnehmen
        if (!evt.date || evt.date <= today) continue;

        await (admin
          .from('stock_events')
          .upsert({
            symbol:       sym,
            event_type:   'earnings',
            event_date:   evt.date,
            quarter:      evt.quarter ?? null,
            details: {
              company:         evt.company ?? sym,
              epsEstimate:     evt.epsEstimate ?? '',
              revenueEstimate: evt.revenueEstimate ?? '',
              timeOfDay:       evt.timeOfDay ?? 'unbekannt',
            },
            last_updated: new Date().toISOString(),
          } as any, { onConflict: 'symbol,event_type,event_date' }) as any);

        // Direkt in rows aufnehmen, damit der Aufruf das sofort zurückgibt
        rows.push({
          symbol:     sym,
          event_type: 'earnings',
          event_date: evt.date,
          quarter:    evt.quarter ?? null,
          details: {
            company:         evt.company ?? sym,
            epsEstimate:     evt.epsEstimate ?? '',
            revenueEstimate: evt.revenueEstimate ?? '',
            timeOfDay:       evt.timeOfDay ?? 'unbekannt',
          },
        });
      }
    } catch (scanErr: any) {
      console.error(`[earnings] Scan für ${sym} fehlgeschlagen:`, scanErr?.message);
      // Fehler beim Scan: Sentinel trotzdem setzen, damit nicht bei jedem Request neu versucht wird
    }

    // Sentinel immer aktualisieren (markiert den Scan-Zeitpunkt)
    await (admin
      .from('stock_events')
      .upsert({
        symbol:       sym,
        event_type:   '_scanned',
        event_date:   SENTINEL_DATE,
        details:      {},
        last_updated: new Date().toISOString(),
      } as any, { onConflict: 'symbol,event_type,event_date' }) as any);
  }

  // ── 4. Antwort: nur zukünftige echte Termine, dedupliziert, sortiert ──────────
  const seen = new Set<string>();
  const events = rows
    .filter(r => r.event_type === 'earnings' && r.event_date >= today)
    .filter(r => {
      const key = `${r.symbol}::${r.event_date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(r => ({
      ticker:          r.symbol,
      company:         r.details?.company ?? r.symbol,
      date:            r.event_date,
      quarter:         r.quarter ?? r.details?.quarter ?? '',
      epsEstimate:     r.details?.epsEstimate ?? '',
      revenueEstimate: r.details?.revenueEstimate ?? '',
      timeOfDay:       r.details?.timeOfDay ?? 'unbekannt',
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return res.status(200).json({
    events,
    scannedSymbol,
    cacheStats: {
      total:  symbols.length,
      cached: symbols.length - staleSymbols.length,
      stale:  staleSymbols.length,
    },
  });
}

// ── Gemini-Scan für genau ein Symbol ─────────────────────────────────────────

async function scanSingleStock(symbol: string, today: string): Promise<any[]> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error('GEMINI_API_KEY nicht konfiguriert.');

  const year = new Date().getFullYear();

  const prompt =
`Du bist ein Finanzinformations-Assistent. Nenne die nächsten geplanten Earnings-Veröffentlichungstermine für das Börsensymbol "${symbol}" ab heute (${today}) bis Ende ${year + 1}.

Antworte NUR mit einem JSON-Array (maximal 3 Einträge). Gib ein leeres Array [] zurück, wenn keine Termine bekannt sind.

[
  {
    "company": "Offizieller Firmenname",
    "date": "YYYY-MM-DD",
    "quarter": "Q1 ${year}",
    "epsEstimate": "1,82 $",
    "revenueEstimate": "94 Mrd. $",
    "timeOfDay": "nach Marktschluss"
  }
]

Regeln:
- timeOfDay: genau einer dieser Werte: "vor Marktöffnung" | "nach Marktschluss" | "unbekannt"
- Nur Termine nach ${today} aufnehmen
- Kein Text außer dem JSON-Array`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 400 },
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini HTTP ${response.status}`);
    }

    const data = await response.json();
    const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
    const parsed = JSON.parse(stripJsonFences(raw));
    return Array.isArray(parsed) ? parsed : [];

  } finally {
    clearTimeout(timer);
  }
}
