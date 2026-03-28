/**
 * GET /api/options-data?symbol=AAPL
 *
 * Liefert den aktuellen Kurs und die implizite Volatilität (ATM IV)
 * aus dem Yahoo Finance Optionsmarkt für ein einzelnes Symbol.
 *
 * Ablauf:
 *  1. Yahoo Finance Options-Endpoint abfragen (/v7/finance/options/{symbol})
 *  2. Nächsten Call mit Strike ≈ aktuellem Kurs finden → ATM IV entnehmen
 *  3. Falls kein Optionsmarkt verfügbar (z. B. deutsche Aktien) → atmIV: 0
 *
 * Response:
 *  { symbol, price, atmIV, ivSource: 'options' | 'none', currency }
 *
 * Header: Authorization: Bearer <supabase-access-token>
 */

import { createClientWithToken } from '../lib/supabaseClient.js';

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
              + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

export default async function handler(req: any, res: any): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Nur GET erlaubt.' });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = ((req.headers.authorization ?? '') as string).replace('Bearer ', '').trim() || null;
  if (!token) return res.status(401).json({ error: 'Bearer-Token fehlt.' });

  try {
    const { data: { user }, error: authErr } = await createClientWithToken(token).auth.getUser();
    if (authErr || !user) return res.status(401).json({ error: 'Token ungültig.' });
  } catch {
    return res.status(500).json({ error: 'Auth-Fehler.' });
  }

  // ── Parameter ─────────────────────────────────────────────────────────────
  const symbol = ((req.query.symbol as string) ?? '').trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'Parameter "symbol" fehlt.' });

  // ── Yahoo Finance Options-Endpoint ────────────────────────────────────────
  try {
    const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
    const resp = await fetch(url, {
      headers: YF_HEADERS,
      signal: AbortSignal.timeout(8_000),
    });

    if (!resp.ok) {
      return res.status(200).json({ symbol, atmIV: 0, ivSource: 'none', price: 0 });
    }

    const data = await resp.json();
    const result = data?.optionChain?.result?.[0];

    if (!result) {
      return res.status(200).json({ symbol, atmIV: 0, ivSource: 'none', price: 0 });
    }

    const currentPrice: number = result.quote?.regularMarketPrice ?? 0;
    const currency: string     = result.quote?.currency ?? 'USD';
    const calls: any[]         = result.options?.[0]?.calls ?? [];

    if (calls.length === 0 || currentPrice <= 0) {
      return res.status(200).json({ symbol, atmIV: 0, ivSource: 'none', price: currentPrice, currency });
    }

    // ATM-Call: nächster Strike zum aktuellen Kurs
    const atmCall = calls.reduce((best: any, c: any) => {
      if (!best) return c;
      return Math.abs(c.strike - currentPrice) < Math.abs(best.strike - currentPrice) ? c : best;
    }, null as any);

    const rawIV: number = atmCall?.impliedVolatility ?? 0;
    if (rawIV <= 0) {
      return res.status(200).json({ symbol, atmIV: 0, ivSource: 'none', price: currentPrice, currency });
    }

    // Yahoo Finance liefert IV als Dezimalzahl (z. B. 0.285 → 28.5 %)
    const atmIV = Math.round(rawIV * 100 * 10) / 10; // auf 1 Dezimalstelle runden

    console.log(`[options-data] ${symbol}: ATM IV=${atmIV}% (strike=${atmCall.strike}, S=${currentPrice})`);

    return res.status(200).json({ symbol, atmIV, ivSource: 'options', price: currentPrice, currency });

  } catch (e: any) {
    console.warn(`[options-data] ${symbol}: Fehler – ${e?.message}`);
    return res.status(200).json({ symbol, atmIV: 0, ivSource: 'none', price: 0 });
  }
}
