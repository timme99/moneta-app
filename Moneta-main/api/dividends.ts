/**
 * GET /api/dividends?symbols=AAPL,SAP.DE
 *
 * Cache-First Dividenden-Daten via Supabase stock_events.
 *
 * Ablauf:
 *  1. Lade ALLE angefragten Symbole auf einmal aus stock_events (eine DB-Query).
 *  2. Trenne in "fresh" (innerhalb TTL) und "stale" (fehlt oder TTL abgelaufen).
 *  3. Fresh-Daten werden SOFORT im Response geliefert – kein API-Call.
 *  4. Stale: genau EIN Symbol pro Request scannen (Auto-Scan-Loop im Frontend):
 *       Stufe 1 – Yahoo Finance   (global, kein Key, US + DE + alle Märkte)
 *       Stufe 2 – Alpha Vantage  (US-Fallback, höhere Datenqualität)
 *       Stufe 3 – Gemini         (letzter Ausweg für unbekannte Symbole)
 *  5. Ergebnis in stock_events persistieren (isEstimated=false wenn echte Quelle).
 *  6. Response enthält fresh + neu gescannte Daten sowie Cache-Statistik.
 *     stale > 0 → Frontend-Loop ruft nach 2 s erneut auf, bis alles gescannt.
 *
 * Header: Authorization: Bearer <supabase-access-token>
 */

import { createClientWithToken, getSupabaseAdmin } from '../lib/supabaseClient.js';

const GEMINI_MODEL        = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const AV_BASE_URL         = 'https://www.alphavantage.co/query';
const DIVIDEND_EVENT_TYPE = 'dividend_info';
const DIV_SCAN_SENTINEL   = '_div_scanned';
const SENTINEL_DATE       = '1970-01-01';
const CACHE_TTL_MS        = 30 * 24 * 60 * 60 * 1000; // 30 Tage (bekannte Dividende)
const NODATA_TTL_MS       = 7  * 24 * 60 * 60 * 1000; // 7 Tage  (noData → retry)
const YF_TIMEOUT_MS       = 8_000;
const SCAN_TIMEOUT_MS     = 25_000;

export interface DividendInfo {
  symbol:           string;
  dividendPerShare: number;
  exDividendDate:   string;
  dividendDate:     string;
  dividendYield:    number;
  price:            number;
  noData:           boolean;
  isEstimated?:     boolean; // true = Gemini-Schätzung, false = echte Quelle
  isFromDb?:        boolean; // true = aus DB-Cache, false = live gescannt
}

function stripJsonFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1].trim();
  const first = text.indexOf('[');
  const last  = text.lastIndexOf(']');
  if (first !== -1 && last > first) return text.slice(first, last + 1);
  return text.trim();
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Nur GET erlaubt.' });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = ((req.headers.authorization ?? '') as string).replace('Bearer ', '').trim() || null;
  if (!token) return res.status(401).json({ error: 'Bearer-Token fehlt.' });

  try {
    const { data: { user }, error: authErr } = await createClientWithToken(token).auth.getUser();
    if (authErr || !user) return res.status(401).json({ error: 'Token ungültig oder abgelaufen.' });
  } catch {
    return res.status(500).json({ error: 'Auth-Initialisierung fehlgeschlagen.' });
  }

  // ── Parameter ─────────────────────────────────────────────────────────────
  const rawSymbols = ((req.query.symbols as string) ?? '').trim();
  if (!rawSymbols) return res.status(400).json({ error: 'Parameter "symbols" fehlt.' });

  // Format: "AAPL,MBG.DE:Mercedes-Benz Group,DHL.DE:Deutsche Post"
  // Firmennamen-Map aufbauen (für Gemini-Fallback bei unbekannten Symbolen)
  const nameMap = new Map<string, string>();
  for (const entry of rawSymbols.split(',')) {
    const colonIdx = entry.indexOf(':');
    if (colonIdx > -1) {
      const sym  = entry.slice(0, colonIdx).trim().toUpperCase();
      const name = decodeURIComponent(entry.slice(colonIdx + 1).trim());
      if (sym && name) nameMap.set(sym, name);
    }
  }

  const symbols = rawSymbols
    .split(',')
    .map(s => s.split(':')[0].trim().toUpperCase())
    .filter(Boolean);

  const admin = getSupabaseAdmin();

  // ── 1. ALLE vorhandenen Einträge für diese Symbole in einer Query laden ────
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

  // ── 2. Scan-Zeitstempel + noData-Flag pro Symbol aus Sentinels ───────────
  const scanTimes = new Map<string, number>();
  const noDataMap = new Map<string, boolean>();
  for (const r of rows) {
    if (r.event_type === DIV_SCAN_SENTINEL) {
      const t = new Date(r.last_updated).getTime();
      if (t > (scanTimes.get(r.symbol) ?? 0)) {
        scanTimes.set(r.symbol, t);
        noDataMap.set(r.symbol, r.details?.noData === true);
      }
    }
  }

  // ── 3. Gecachte Dividenden aus DB zusammenstellen (sofort nutzbar) ─────────
  const cachedMap = new Map<string, DividendInfo>();
  for (const r of rows) {
    if (r.event_type === DIVIDEND_EVENT_TYPE) {
      cachedMap.set(r.symbol, {
        symbol: r.symbol,
        ...(r.details as object),
        isFromDb: true,
      } as DividendInfo);
    }
  }

  // ── 3b. noDataMap aus dividend_info ergänzen ──────────────────────────────
  // Sentinel-Details können {} sein (alter Code schrieb kein noData-Flag) →
  // Fallback auf dividend_info.noData damit 7-Tage-TTL korrekt greift.
  for (const [sym, info] of cachedMap) {
    if (info.noData && !noDataMap.get(sym)) {
      noDataMap.set(sym, true);
    }
  }

  // ── 4. Stale-Symbole identifizieren ───────────────────────────────────────
  const staleSymbols = symbols.filter(s => {
    const last = scanTimes.get(s);
    if (!last) {
      // Kein Sentinel – aber valide Dividenden-Daten in DB? → nicht stale
      const existing = cachedMap.get(s);
      if (existing && !existing.noData && existing.dividendPerShare > 0) return false;
      return true; // noch nie gescannt
    }
    const ttl = noDataMap.get(s) ? NODATA_TTL_MS : CACHE_TTL_MS;
    return Date.now() - last > ttl;
  });

  // Sentinel-Backfill: Symbole mit validen Daten aber fehlendem Sentinel absichern.
  const missSentinels = symbols.filter(s => {
    const existing = cachedMap.get(s);
    return existing && !existing.noData && existing.dividendPerShare > 0 && !scanTimes.has(s);
  });
  if (missSentinels.length > 0) {
    const nowSentinel = new Date().toISOString();
    (admin as any).from('stock_events').upsert(
      missSentinels.map(sym => ({
        symbol: sym, event_type: DIV_SCAN_SENTINEL, event_date: SENTINEL_DATE,
        details: { noData: false }, last_updated: nowSentinel,
      })),
      { onConflict: 'symbol,event_type,event_date' },
    ).then(() =>
      console.log(`[dividends] Sentinel-Backfill für: ${missSentinels.join(', ')}`),
    ).catch((e: any) =>
      console.warn('[dividends] Sentinel-Backfill fehlgeschlagen:', e?.message),
    );
  }

  // ── 5. Genau EIN stale Symbol pro Request scannen ─────────────────────────
  // Reihenfolge: Yahoo Finance → Alpha Vantage → Gemini
  // Der Auto-Scan-Loop im Frontend (loadDividends, 2 s Pause) iteriert
  // durch alle stale Symbole bis stale === 0.
  const scannedSymbols: string[] = [];

  if (staleSymbols.length > 0) {
    const symToScan = staleSymbols[0];
    const avKey     = process.env.ALPHA_VANTAGE_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    let result: DividendInfo | null = null;

    // Stufe 1: Yahoo Finance (global, kein Key nötig)
    try {
      result = await fetchDividendViaYahooFinance(symToScan);
      result.isFromDb = false;
      console.log(`[dividends] ${symToScan}: Yahoo Finance OK (dps=${result.dividendPerShare})`);
    } catch (e: any) {
      console.warn(`[dividends] ${symToScan}: Yahoo Finance fehlgeschlagen (${e?.message}) → AV`);
    }

    // Stufe 2: Alpha Vantage (US-Fallback, höhere Datenqualität)
    if (!result && avKey) {
      try {
        result = await fetchDividendViaAlphaVantage(symToScan, avKey);
        result.isFromDb = false;
        console.log(`[dividends] ${symToScan}: Alpha Vantage OK (dps=${result.dividendPerShare})`);
      } catch (e: any) {
        console.warn(`[dividends] ${symToScan}: Alpha Vantage fehlgeschlagen (${e?.message}) → Gemini`);
      }
    }

    // Stufe 3: Gemini (letzter Ausweg)
    if (!result) {
      if (geminiKey) {
        try {
          const gemRes = await fetchDividendViaGemini(symToScan, geminiKey, nameMap);
          gemRes.isFromDb = false;
          result = gemRes;
          console.log(`[dividends] ${symToScan}: Gemini OK (dps=${result.dividendPerShare})`);
        } catch (e: any) {
          console.error(`[dividends] ${symToScan}: Gemini fehlgeschlagen (${e?.message})`);
        }
      } else {
        console.error('[dividends] GEMINI_API_KEY fehlt – alle Quellen erschöpft');
      }
    }

    // Fallback: noData wenn alle Quellen fehlschlagen
    if (!result) {
      result = {
        symbol: symToScan, dividendPerShare: 0, exDividendDate: '', dividendDate: '',
        dividendYield: 0, price: 0, noData: true, isEstimated: false, isFromDb: false,
      };
    }

    cachedMap.set(symToScan, result);
    scannedSymbols.push(symToScan);

    // Ergebnis in stock_events persistieren
    const now = new Date().toISOString();
    const { symbol: _s, isFromDb: _f, ...details } = result;
    await Promise.all([
      (admin as any).from('stock_events').upsert(
        [{ symbol: symToScan, event_type: DIVIDEND_EVENT_TYPE, event_date: SENTINEL_DATE,
           quarter: null, details, last_updated: now }],
        { onConflict: 'symbol,event_type,event_date' },
      ),
      (admin as any).from('stock_events').upsert(
        [{ symbol: symToScan, event_type: DIV_SCAN_SENTINEL, event_date: SENTINEL_DATE,
           details: { noData: result.noData ?? false }, last_updated: now }],
        { onConflict: 'symbol,event_type,event_date' },
      ),
    ]);
  }

  // ── 6. Response: alle Symbole (cached + frisch gescannt + noData-Fallback) ──
  const results = symbols.map(s =>
    cachedMap.get(s) ?? {
      symbol: s, dividendPerShare: 0, exDividendDate: '', dividendDate: '',
      dividendYield: 0, price: 0, noData: true, isFromDb: false,
    }
  );

  const freshCount = symbols.length - staleSymbols.length;
  return res.status(200).json({
    results,
    scannedSymbol:  scannedSymbols[0] ?? null,
    scannedSymbols,
    cacheStats: {
      total:  symbols.length,
      cached: freshCount + scannedSymbols.length,
      stale:  staleSymbols.length - scannedSymbols.length,
    },
  });
}

// ── Yahoo Finance quoteSummary (global, kein API-Key) ─────────────────────────

async function fetchDividendViaYahooFinance(symbol: string): Promise<DividendInfo> {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/`
            + `${encodeURIComponent(symbol)}?modules=summaryDetail`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                  + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(YF_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`Yahoo Finance HTTP ${resp.status}`);

  const data = await resp.json();
  const error = data?.quoteSummary?.error;
  if (error) throw new Error(`Yahoo Finance Fehler: ${error.description ?? error.code}`);

  const sd = data?.quoteSummary?.result?.[0]?.summaryDetail;
  if (!sd) throw new Error('Kein summaryDetail in Yahoo-Antwort');

  const dividendPerShare = sd.dividendRate?.raw   ?? 0;
  const dividendYield    = (sd.dividendYield?.raw ?? 0) * 100;
  const exDividendDate   = sd.exDividendDate?.fmt  ?? '';

  return {
    symbol,
    dividendPerShare,
    exDividendDate,
    dividendDate:  '',
    dividendYield,
    price:         sd.previousClose?.raw ?? 0,
    noData:        dividendPerShare === 0,
    isEstimated:   false,
  };
}

// ── Alpha Vantage OVERVIEW (einzelnes Symbol, höchste Qualität für US) ────────

async function fetchDividendViaAlphaVantage(symbol: string, apiKey: string): Promise<DividendInfo> {
  const url = new URL(AV_BASE_URL);
  url.searchParams.set('function', 'OVERVIEW');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('apikey', apiKey);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SCAN_TIMEOUT_MS);
  try {
    const resp = await fetch(url.toString(), { signal: ctrl.signal });
    if (!resp.ok) throw new Error(`AV HTTP ${resp.status}`);
    const data = await resp.json();
    if (data['Note'] || data['Information'] || !data['Symbol']) {
      throw new Error(`AV Rate-Limit oder kein Symbol für "${symbol}"`);
    }
    const dividendPerShare = parseFloat(data['DividendPerShare'] || '0') || 0;
    const rawYield = parseFloat((data['DividendYield'] || '0').replace('%', '')) || 0;
    return {
      symbol:          data['Symbol'] ?? symbol,
      dividendPerShare,
      exDividendDate:  data['ExDividendDate'] ?? '',
      dividendDate:    data['DividendDate']   ?? '',
      dividendYield:   rawYield * 100,
      price:           parseFloat(data['AnalystTargetPrice'] || '0') || 0,
      noData:          dividendPerShare === 0,
      isEstimated:     false,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Gemini (einzelnes Symbol, letzter Ausweg) ─────────────────────────────────

async function fetchDividendViaGemini(
  symbol: string,
  geminiKey: string,
  nameMap?: Map<string, string>,
): Promise<DividendInfo> {
  const year = new Date().getFullYear();
  const nameHint = nameMap?.get(symbol) ? ` (${nameMap.get(symbol)})` : '';
  const isEuropean = /\.(DE|PA|VI|AS|MI|MC|SW|L|ST|HE|CO|OL)$/.test(symbol);
  const exchangeHint = isEuropean
    ? `\nHinweis: "${symbol}" ist ein europäisches Börsensymbol. ` +
      `Gib die Jahresdividende (Summe aller Tranchen) als dividendPerShare an.\n`
    : '';

  const prompt =
`Du bist ein Finanzinformations-Assistent. Nenne die aktuellen Dividenden-Informationen für ${year}.
${exchangeHint}
Symbol: ${symbol}${nameHint}

Antworte NUR mit einem einzelnen JSON-Objekt (kein Array, kein anderer Text):
{
  "symbol": "${symbol}",
  "dividendPerShare": 0.96,
  "exDividendDate": "YYYY-MM-DD",
  "dividendDate": "YYYY-MM-DD",
  "dividendYield": 1.5,
  "noData": false
}

Regeln:
- dividendYield als Prozentzahl (z. B. 1.5 für 1,5 %)
- Falls keine Dividende bekannt: noData: true, alle Zahlenwerte 0
- Datum als YYYY-MM-DD oder leerer String ""
- Nur das JSON-Objekt als Antwort`;

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SCAN_TIMEOUT_MS);

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
        }),
        signal: ctrl.signal,
      },
    );
    if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}`);

    const data = await resp.json();
    const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

    // Unterstütze sowohl Objekt- als auch Array-Antwort
    let parsed: any;
    const stripped = stripJsonFences(raw);
    parsed = JSON.parse(stripped);
    if (Array.isArray(parsed)) parsed = parsed[0] ?? {};

    const dividendPerShare = Number(parsed.dividendPerShare) || 0;
    return {
      symbol,
      dividendPerShare,
      exDividendDate: String(parsed.exDividendDate || ''),
      dividendDate:   String(parsed.dividendDate   || ''),
      dividendYield:  Number(parsed.dividendYield)  || 0,
      price:          0,
      noData:         parsed.noData === true || dividendPerShare === 0,
      isEstimated:    true,
    };
  } finally {
    clearTimeout(timer);
  }
}
