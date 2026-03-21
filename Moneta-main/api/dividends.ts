/**
 * GET /api/dividends?symbols=AAPL,SAP.DE
 *
 * Cache-First Dividenden-Daten via Supabase stock_events.
 *
 * Ablauf:
 *  1. Lade alle gecachten Einträge aus stock_events für die übergebenen Symbole.
 *  2. Identifiziere das erste Symbol, das noch nie (oder vor >7 Tagen) gescannt wurde.
 *  3. Rufe Alpha Vantage OVERVIEW für dieses EINE Symbol auf.
 *     Falls AV fehlschlägt (Rate-Limit, kein Key, noData) → Gemini Web Research.
 *  4. Schreibe das Ergebnis in stock_events (Tabelle wächst bei jedem Aufruf).
 *  5. Gib gecachte + neue Daten zurück.
 *
 * Header: Authorization: Bearer <supabase-access-token>
 */

import { createClientWithToken, getSupabaseAdmin } from '../lib/supabaseClient.js';

const GEMINI_MODEL        = 'gemini-2.5-flash';
const AV_BASE_URL         = 'https://www.alphavantage.co/query';
const DIVIDEND_EVENT_TYPE = 'dividend_info';
const DIV_SCAN_SENTINEL   = '_div_scanned';   // Scan-Marker (analog zu earnings '_scanned')
const SENTINEL_DATE       = '1970-01-01';
const CACHE_TTL_MS        = 7 * 24 * 60 * 60 * 1000; // 7 Tage
const SCAN_TIMEOUT_MS     = 8_000;

export interface DividendInfo {
  symbol: string;
  dividendPerShare: number;
  exDividendDate: string;
  dividendDate: string;
  dividendYield: number;
  price: number;
  noData: boolean;
  isEstimated?: boolean; // true wenn aus Gemini-Fallback
}

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
  if (!rawSymbols) return res.status(400).json({ error: 'Parameter "symbols" fehlt.' });

  const symbols = rawSymbols
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);

  const admin = getSupabaseAdmin();

  // ── 1. Alle vorhandenen Zeilen für diese Symbole laden ────────────────────────
  const { data: allRows, error: dbErr } = await (admin as any)
    .from('stock_events')
    .select('symbol, event_type, event_date, details, last_updated')
    .in('symbol', symbols)
    .in('event_type', [DIVIDEND_EVENT_TYPE, DIV_SCAN_SENTINEL]);

  if (dbErr) {
    console.error('[dividends] DB-Fehler:', dbErr.message);
    return res.status(500).json({ error: 'Datenbankfehler.' });
  }

  const rows: any[] = allRows ?? [];

  // ── 2. Scan-Zeitstempel pro Symbol (Sentinel-Zeilen) ──────────────────────────
  const scanTimes = new Map<string, number>();
  for (const r of rows) {
    if (r.event_type === DIV_SCAN_SENTINEL) {
      const t = new Date(r.last_updated).getTime();
      if (t > (scanTimes.get(r.symbol) ?? 0)) scanTimes.set(r.symbol, t);
    }
  }

  // ── 3. Gecachte Dividenden-Daten zusammenstellen ──────────────────────────────
  const cachedMap = new Map<string, DividendInfo>();
  for (const r of rows) {
    if (r.event_type === DIVIDEND_EVENT_TYPE) {
      cachedMap.set(r.symbol, { symbol: r.symbol, ...(r.details as object) } as DividendInfo);
    }
  }

  // Stale-Symbole = nie gescannt ODER Scan vor >7 Tagen
  const staleSymbols = symbols.filter(s => {
    const last = scanTimes.get(s);
    return !last || Date.now() - last > CACHE_TTL_MS;
  });

  // ── 4. Genau EIN Symbol scannen ───────────────────────────────────────────────
  let scannedSymbol: string | null = null;

  if (staleSymbols.length > 0) {
    const sym = staleSymbols[0];
    scannedSymbol = sym;

    let info: DividendInfo | null = null;

    // a) Alpha Vantage versuchen
    const avKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (avKey) {
      try {
        info = await fetchDividendViaAlphaVantage(sym, avKey);
        if (info.noData) {
          // noData bedeutet: kein Fehler, aber keine Dividende – trotzdem cachen
          info.isEstimated = false;
        }
        console.log(`[dividends] ${sym}: Alpha Vantage OK (dividendPerShare=${info.dividendPerShare})`);
      } catch (avErr: any) {
        console.warn(`[dividends] ${sym}: Alpha Vantage fehlgeschlagen (${avErr?.message}) → Gemini-Fallback`);
        info = null;
      }
    }

    // b) Gemini-Fallback wenn AV fehlschlug oder nicht konfiguriert
    if (!info) {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (geminiKey) {
        try {
          info = await fetchDividendViaGemini(sym, geminiKey);
          info.isEstimated = true;
          console.log(`[dividends] ${sym}: Gemini-Fallback OK (dividendPerShare=${info.dividendPerShare})`);
        } catch (gemErr: any) {
          console.error(`[dividends] ${sym}: Gemini-Fallback fehlgeschlagen:`, gemErr?.message);
        }
      }
    }

    // c) Fallback-Fallback: noData-Eintrag damit Sentinel gesetzt wird
    if (!info) {
      info = { symbol: sym, dividendPerShare: 0, exDividendDate: '', dividendDate: '', dividendYield: 0, price: 0, noData: true };
    }

    // d) In stock_events schreiben (Tabelle wächst)
    const { symbol: _sym, ...details } = info;
    await (admin as any)
      .from('stock_events')
      .upsert(
        { symbol: sym, event_type: DIVIDEND_EVENT_TYPE, event_date: SENTINEL_DATE, quarter: null, details, last_updated: new Date().toISOString() },
        { onConflict: 'symbol,event_type,event_date' },
      );

    // Sentinel setzen
    await (admin as any)
      .from('stock_events')
      .upsert(
        { symbol: sym, event_type: DIV_SCAN_SENTINEL, event_date: SENTINEL_DATE, details: {}, last_updated: new Date().toISOString() },
        { onConflict: 'symbol,event_type,event_date' },
      );

    // In cachedMap aufnehmen für sofortige Antwort
    cachedMap.set(sym, info);
  }

  // ── 5. Antwort: alle Symbole mit Daten (oder noData) ─────────────────────────
  const results = symbols.map(s =>
    cachedMap.get(s) ?? {
      symbol: s, dividendPerShare: 0, exDividendDate: '', dividendDate: '',
      dividendYield: 0, price: 0, noData: true,
    }
  );

  return res.status(200).json({
    results,
    scannedSymbol,
    cacheStats: {
      total:  symbols.length,
      cached: symbols.length - staleSymbols.length,
      stale:  staleSymbols.length,
    },
  });
}

// ── Alpha Vantage OVERVIEW ────────────────────────────────────────────────────

async function fetchDividendViaAlphaVantage(symbol: string, apiKey: string): Promise<DividendInfo> {
  const url = new URL(AV_BASE_URL);
  url.searchParams.set('function', 'OVERVIEW');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('apikey', apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    if (!response.ok) throw new Error(`AV HTTP ${response.status}`);

    const data = await response.json();
    if (data['Note'] || data['Information'] || !data['Symbol']) {
      throw new Error(`AV Rate-Limit oder kein Symbol für "${symbol}"`);
    }

    const dividendPerShare = parseFloat(data['DividendPerShare'] || '0') || 0;
    const rawYield = parseFloat((data['DividendYield'] || '0').replace('%', '')) || 0;
    const price = parseFloat(data['AnalystTargetPrice'] || '0') || 0;

    return {
      symbol:          data['Symbol'] ?? symbol,
      dividendPerShare,
      exDividendDate:  data['ExDividendDate'] ?? '',
      dividendDate:    data['DividendDate'] ?? '',
      dividendYield:   rawYield * 100, // 0.0053 → 0.53 %
      price,
      noData:          dividendPerShare === 0,
      isEstimated:     false,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Gemini Web Research Fallback ──────────────────────────────────────────────

async function fetchDividendViaGemini(symbol: string, geminiKey: string): Promise<DividendInfo> {
  const year = new Date().getFullYear();

  const prompt =
`Du bist ein Finanzinformations-Assistent. Nenne die aktuellen Dividenden-Informationen für das Börsensymbol "${symbol}" für das Jahr ${year}.

Antworte NUR mit einem JSON-Objekt (kein anderer Text):
{
  "dividendPerShare": 0.96,
  "exDividendDate": "YYYY-MM-DD",
  "dividendDate": "YYYY-MM-DD",
  "dividendYield": 0.55,
  "noData": false
}

Regeln:
- dividendYield als Prozentzahl (z. B. 1.5 für 1,5 %)
- Falls die Aktie keine Dividende zahlt: noData: true, alle Zahlenwerte 0
- exDividendDate und dividendDate als YYYY-MM-DD oder leerer String
- Kein Text außer dem JSON-Objekt`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);

    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const parsed = JSON.parse(stripJsonFences(raw));

    return {
      symbol,
      dividendPerShare: Number(parsed.dividendPerShare) || 0,
      exDividendDate:   String(parsed.exDividendDate || ''),
      dividendDate:     String(parsed.dividendDate || ''),
      dividendYield:    Number(parsed.dividendYield) || 0,
      price:            0,
      noData:           parsed.noData === true || (Number(parsed.dividendPerShare) || 0) === 0,
      isEstimated:      true,
    };
  } finally {
    clearTimeout(timer);
  }
}
