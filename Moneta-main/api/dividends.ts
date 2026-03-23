/**
 * GET /api/dividends?symbols=AAPL,SAP.DE
 *
 * Cache-First Dividenden-Daten via Supabase stock_events.
 *
 * Ablauf (optimiert für 100+ DB-Einträge):
 *  1. Lade ALLE angefragten Symbole auf einmal aus stock_events (eine DB-Query).
 *  2. Trenne sofort in "fresh" (< 30 Tage alt) und "stale" (fehlt oder > 30 Tage).
 *  3. Fresh-Daten werden SOFORT im Response geliefert.
 *  4. Stale: Max. BATCH_SIZE (20) Symbole per Request:
 *       - Symbol 0: Alpha Vantage OVERVIEW (höchste Datenqualität)
 *       - Symbole 1–19: ein einziger Gemini-Batch-Prompt (alle auf einmal)
 *  noData-Ergebnisse: kürzere TTL (7 Tage statt 30) für schnelleres Re-Scan.
 *  5. Alle gescannten Ergebnisse in stock_events persistieren.
 *  6. Response enthält fresh + neu gescannte Daten sowie Cache-Statistik.
 *
 * Header: Authorization: Bearer <supabase-access-token>
 */

import { createClientWithToken, getSupabaseAdmin } from '../lib/supabaseClient.js';

const GEMINI_MODEL        = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
const AV_BASE_URL         = 'https://www.alphavantage.co/query';
const DIVIDEND_EVENT_TYPE = 'dividend_info';
const DIV_SCAN_SENTINEL   = '_div_scanned';
const SENTINEL_DATE       = '1970-01-01';
const CACHE_TTL_MS        = 30 * 24 * 60 * 60 * 1000; // 30 Tage (bekannte Dividende)
const NODATA_TTL_MS       = 7  * 24 * 60 * 60 * 1000; // 7 Tage  (noData → früher retry)
const SCAN_TIMEOUT_MS     = 25_000;
const BATCH_SIZE          = 20; // Max Symbole pro Gemini-Prompt

export interface DividendInfo {
  symbol:           string;
  dividendPerShare: number;
  exDividendDate:   string;
  dividendDate:     string;
  dividendYield:    number;
  price:            number;
  noData:           boolean;
  isEstimated?:     boolean; // true = Gemini-Schätzung, false = Alpha Vantage
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
  // Firmennamen-Map aufbauen (für bessere Gemini-Ergebnisse bei europäischen Symbolen)
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
  // noData-Ergebnisse werden nach 7 Tagen erneut geprüft (statt 30),
  // damit falsch-negative Gemini-Antworten schnell korrigiert werden.
  // Ausnahme: valide dividend_info ohne Sentinel (z. B. manuell eingefügt)
  // werden NICHT als stale markiert, um Gemini-Überschreibung zu verhindern.
  const staleSymbols = symbols.filter(s => {
    const last = scanTimes.get(s);
    if (!last) {
      // Kein Sentinel – aber valide Dividenden-Daten in DB? → nicht stale
      const existing = cachedMap.get(s);
      if (existing && !existing.noData && existing.dividendPerShare > 0) return false;
      return true; // wirklich noch nie gescannt
    }
    const ttl = noDataMap.get(s) ? NODATA_TTL_MS : CACHE_TTL_MS;
    return Date.now() - last > ttl;
  });

  // Sentinel-Backfill: Symbole mit validen Daten aber fehlendem Sentinel absichern.
  // Verhindert, dass manuelle/extern eingefügte dividend_info-Zeilen beim
  // nächsten Request von Gemini überschrieben werden.
  const missSentinels = symbols.filter(s => {
    const existing = cachedMap.get(s);
    return existing && !existing.noData && existing.dividendPerShare > 0 && !scanTimes.has(s);
  });
  if (missSentinels.length > 0) {
    const nowSentinel = new Date().toISOString();
    // Kein await – fire-and-forget, blockiert nicht den Response
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

  // ── 5. Batch-Scan: bis zu BATCH_SIZE stale Symbole pro Request ────────────
  const batchToScan = staleSymbols.slice(0, BATCH_SIZE);
  const scannedSymbols: string[] = [];

  if (batchToScan.length > 0) {
    const avKey     = process.env.ALPHA_VANTAGE_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!avKey)     console.warn('[dividends] ALPHA_VANTAGE_API_KEY fehlt');
    if (!geminiKey) console.error('[dividends] GEMINI_API_KEY fehlt – Gemini-Scan deaktiviert!');

    // a) Symbol 0: Alpha Vantage versuchen (höchste Qualität)
    let avResult: DividendInfo | null = null;
    if (avKey) {
      try {
        avResult = await fetchDividendViaAlphaVantage(batchToScan[0], avKey);
        avResult.isFromDb = false;
        scannedSymbols.push(batchToScan[0]);
        console.log(`[dividends] ${batchToScan[0]}: AV OK (dps=${avResult.dividendPerShare})`);
      } catch (e: any) {
        console.warn(`[dividends] ${batchToScan[0]}: AV fehlgeschlagen (${e?.message}) → Gemini-Batch`);
      }
    }

    // b) Symbole 1–9 (+ Symbol 0 falls AV fehlschlug): Gemini-Batch
    const geminiSymbols = avResult
      ? batchToScan.slice(1)           // Symbol 0 hat AV-Daten
      : batchToScan;                   // alle per Gemini

    if (geminiSymbols.length > 0 && geminiKey) {
      try {
        const batchResults = await fetchDividendsBatchViaGemini(geminiSymbols, geminiKey, nameMap);
        for (const [sym, info] of batchResults) {
          info.isFromDb = false;
          cachedMap.set(sym, info);
          scannedSymbols.push(sym);
        }
        console.log(`[dividends] Gemini-Batch: ${batchResults.size} Symbole gescannt`);
      } catch (e: any) {
        console.error('[dividends] Gemini-Batch fehlgeschlagen:', e?.message);
        // Fallback: noData für alle unbekannten Gemini-Symbole
        for (const sym of geminiSymbols) {
          if (!cachedMap.has(sym)) {
            cachedMap.set(sym, {
              symbol: sym, dividendPerShare: 0, exDividendDate: '', dividendDate: '',
              dividendYield: 0, price: 0, noData: true, isEstimated: false, isFromDb: false,
            });
            scannedSymbols.push(sym);
          }
        }
      }
    }

    // Wenn kein Gemini-Key: geminiSymbols als "nicht verfügbar" markieren
    // → verhindert Endlos-Retry (stale bleibt 0 statt > 0 für immer)
    if (geminiSymbols.length > 0 && !geminiKey) {
      for (const sym of geminiSymbols) {
        if (!cachedMap.has(sym)) {
          cachedMap.set(sym, {
            symbol: sym, dividendPerShare: 0, exDividendDate: '', dividendDate: '',
            dividendYield: 0, price: 0, noData: true, isEstimated: false, isFromDb: false,
          });
        }
        scannedSymbols.push(sym);
      }
    }

    // AV-Ergebnis in Map übernehmen (hat Prio über Gemini für Symbol 0)
    if (avResult) cachedMap.set(batchToScan[0], avResult);

    // c) Alle gescannten Symbole in stock_events persistieren
    const now = new Date().toISOString();
    const upsertRows: any[] = [];
    const sentinelRows: any[] = [];

    for (const sym of scannedSymbols) {
      const info = cachedMap.get(sym);
      if (!info) continue;
      const { symbol: _s, isFromDb: _f, ...details } = info;
      upsertRows.push({
        symbol: sym, event_type: DIVIDEND_EVENT_TYPE,
        event_date: SENTINEL_DATE, quarter: null,
        details, last_updated: now,
      });
      sentinelRows.push({
        symbol: sym, event_type: DIV_SCAN_SENTINEL,
        event_date: SENTINEL_DATE,
        details: { noData: info?.noData ?? false }, // für TTL-Logik beim nächsten Request
        last_updated: now,
      });
    }

    if (upsertRows.length > 0) {
      await Promise.all([
        (admin as any).from('stock_events').upsert(upsertRows,   { onConflict: 'symbol,event_type,event_date' }),
        (admin as any).from('stock_events').upsert(sentinelRows, { onConflict: 'symbol,event_type,event_date' }),
      ]);
    }
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
    scannedSymbol:  scannedSymbols[0] ?? null,   // Rückwärtskompatibilität
    scannedSymbols,
    cacheStats: {
      total:   symbols.length,
      cached:  freshCount + scannedSymbols.length,
      stale:   staleSymbols.length - scannedSymbols.length,
    },
  });
}

// ── Alpha Vantage OVERVIEW (einzelnes Symbol, höchste Qualität) ────────────────

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

// ── Gemini Batch (bis zu 20 Symbole in einem Prompt) ─────────────────────────

async function fetchDividendsBatchViaGemini(
  symbols: string[],
  geminiKey: string,
  nameMap?: Map<string, string>,
): Promise<Map<string, DividendInfo>> {
  const year = new Date().getFullYear();

  // Firmennamen-Hints in Symbollist einbauen (z.B. "MBG.DE (Mercedes-Benz Group AG)")
  const symbolsWithNames = symbols.map(s => {
    const name = nameMap?.get(s);
    return name ? `${s} (${name})` : s;
  });
  const symbolList = symbolsWithNames.join(', ');

  // Europäische Börsen-Hinweise falls .DE/.PA/.VI/... in der Liste
  const hasEuropean = symbols.some(s => /\.(DE|PA|VI|AS|MI|MC|SW|L|ST|HE|CO|OL)$/.test(s));
  const exchangeHint = hasEuropean
    ? `\nWICHTIG – Europäische Börsen-Suffixe:\n` +
      `".DE" = XETRA Frankfurt (MBG.DE=Mercedes-Benz, DHL.DE=Deutsche Post/DHL Group, ` +
      `EOAN.DE=E.ON, DWS.DE=DWS Group, BAS.DE=BASF, ADS.DE=adidas, SIE.DE=Siemens, ` +
      `ALV.DE=Allianz, BMW.DE=BMW, DBK.DE=Deutsche Bank, SAP.DE=SAP, VOW3.DE=Volkswagen)\n` +
      `".PA" = Euronext Paris | ".VI" = Wien | ".AS" = Amsterdam | ".L" = London\n` +
      `Für europäische Symbole: Gib die Jahresdividende (Summe aller Tranchen) als dividendPerShare an.\n`
    : '';

  const prompt =
`Du bist ein Finanzinformations-Assistent. Nenne für JEDES der folgenden Börsensymbole die aktuellen Dividenden-Informationen für ${year}.
${exchangeHint}
Symbole: ${symbolList}

Antworte NUR mit einem JSON-Array (kein anderer Text, keine Erklärungen):
[
  {
    "symbol": "SYMBOL",
    "dividendPerShare": 0.96,
    "exDividendDate": "YYYY-MM-DD",
    "dividendDate": "YYYY-MM-DD",
    "dividendYield": 1.5,
    "noData": false
  }
]

Regeln:
- Für JEDES Symbol EINEN Eintrag im Array, in gleicher Reihenfolge wie die Eingabe
- dividendYield als Prozentzahl (z. B. 1.5 für 1,5 %)
- Falls keine Dividende bekannt: noData: true, alle Zahlenwerte 0
- Datum als YYYY-MM-DD oder leerer String ""
- symbol exakt wie in der Eingabe übernehmen (ohne den Firmennamen in Klammern)
- Nur das JSON-Array als Antwort`;

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
          generationConfig: { temperature: 0.1, maxOutputTokens: 1500 },
        }),
        signal: ctrl.signal,
      },
    );
    if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}`);

    const data = await resp.json();
    const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
    const parsed: any[] = JSON.parse(stripJsonFences(raw));

    const result = new Map<string, DividendInfo>();
    for (const item of parsed) {
      if (!item?.symbol) continue;
      const sym = String(item.symbol).toUpperCase();
      result.set(sym, {
        symbol:          sym,
        dividendPerShare: Number(item.dividendPerShare) || 0,
        exDividendDate:  String(item.exDividendDate || ''),
        dividendDate:    String(item.dividendDate    || ''),
        dividendYield:   Number(item.dividendYield)  || 0,
        price:           0,
        noData:          item.noData === true || (Number(item.dividendPerShare) || 0) === 0,
        isEstimated:     true,
      });
    }

    // Symbole die Gemini vergessen hat → noData-Fallback
    for (const sym of symbols) {
      if (!result.has(sym)) {
        result.set(sym, {
          symbol: sym, dividendPerShare: 0, exDividendDate: '', dividendDate: '',
          dividendYield: 0, price: 0, noData: true, isEstimated: true,
        });
      }
    }

    return result;
  } finally {
    clearTimeout(timer);
  }
}
