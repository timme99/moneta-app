/**
 * api/dividends.ts  –  Vercel Serverless Function (Node.js runtime)
 *
 * Ruft Dividenden-Informationen für eine Liste von Ticker-Symbolen via
 * Alpha Vantage OVERVIEW ab und gibt sie zurück.
 *
 * GET /api/dividends?symbols=AAPL,MSFT,SAP.DE
 * Header: Authorization: Bearer <supabase-access-token>
 *
 * Response: DividendInfo[]
 */

import { createClientWithToken } from '../lib/supabaseClient.js';

const AV_BASE_URL = 'https://www.alphavantage.co/query';

export interface DividendInfo {
  symbol: string;
  /** Jährliche Dividende pro Aktie (USD/EUR je nach Börse) */
  dividendPerShare: number;
  /** Ex-Dividenden-Datum (ISO-String oder leer) */
  exDividendDate: string;
  /** Dividenden-Zahlungsdatum (ISO-String oder leer) */
  dividendDate: string;
  /** Dividenden-Rendite in % */
  dividendYield: number;
  /** Letzter bekannter Kurs (für Kontext) */
  price: number;
  /** true wenn kein Dividenden-Datum oder DividendPerShare = 0 */
  noData: boolean;
  /** true wenn Daten aus Gemini-Fallback (KI-Schätzung) statt Alpha Vantage */
  isEstimated?: boolean;
}

// ── Haupt-Handler ─────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Nur GET erlaubt.' });
  }

  const rawSymbols = ((req.query.symbols as string) ?? '').trim();
  if (!rawSymbols) {
    return res.status(400).json({ error: 'Parameter "symbols" fehlt (z. B. ?symbols=AAPL,MSFT).' });
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const authHeader = (req.headers.authorization ?? '') as string;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Nicht authentifiziert. Bearer-Token fehlt.' });
  }

  try {
    const userClient = createClientWithToken(token);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return res.status(401).json({ error: 'Ungültiges oder abgelaufenes Auth-Token.' });
    }
  } catch {
    return res.status(500).json({ error: 'Supabase-Client konnte nicht erstellt werden.' });
  }

  // ── Symbol-Liste aufbereiten ──────────────────────────────────────────────────
  const symbols = rawSymbols
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 10); // max. 10 Symbole (Rate-Limit-Schutz)

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ALPHA_VANTAGE_API_KEY nicht konfiguriert.' });
  }

  // ── Dividenden-Daten für jedes Symbol abrufen ─────────────────────────────────
  // Sequenziell, um Alpha Vantage Rate-Limit (5 Req/Min, 25 Req/Tag) zu schonen.
  const results: DividendInfo[] = [];

  for (const symbol of symbols) {
    try {
      const info = await fetchDividendInfo(symbol, apiKey);
      results.push(info);
    } catch (err) {
      // Bei Fehler: noData-Eintrag zurückgeben (nicht den ganzen Request abbrechen)
      results.push({
        symbol,
        dividendPerShare: 0,
        exDividendDate: '',
        dividendDate: '',
        dividendYield: 0,
        price: 0,
        noData: true,
      });
    }
    // Kurze Pause zwischen Requests (Alpha Vantage Free-Tier: 5 Req/Min)
    if (symbols.length > 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return res.status(200).json(results);
}

// ── Alpha Vantage OVERVIEW ────────────────────────────────────────────────────

async function fetchDividendInfo(symbol: string, apiKey: string): Promise<DividendInfo> {
  const url = new URL(AV_BASE_URL);
  url.searchParams.set('function', 'OVERVIEW');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('apikey', apiKey);

  const response = await fetch(url.toString(), { method: 'GET' });

  if (!response.ok) {
    throw new Error(`Alpha Vantage Fehler ${response.status}`);
  }

  const data = await response.json();

  // Rate-Limit oder leere Antwort
  if (data['Note'] || data['Information'] || !data['Symbol']) {
    throw new Error(`Keine OVERVIEW-Daten für "${symbol}"`);
  }

  const dividendPerShare = parseFloat(data['DividendPerShare'] || '0') || 0;
  const dividendYield = parseFloat((data['DividendYield'] || '0').replace('%', '')) || 0;
  const price = parseFloat(data['AnalystTargetPrice'] || '0') || 0;

  return {
    symbol: data['Symbol'] ?? symbol,
    dividendPerShare,
    exDividendDate: data['ExDividendDate'] ?? '',
    dividendDate: data['DividendDate'] ?? '',
    dividendYield: dividendYield * 100, // als Prozentwert (0.0053 → 0.53)
    price,
    noData: dividendPerShare === 0,
  };
}
