/**
 * api/financial-data.ts  –  Vercel Serverless Function (Node.js runtime)
 *
 * Smart-Data-Fetch: getFinancialData(input)
 *
 * Workflow:
 *  1. User-Check   – Supabase Auth via Bearer-Token
 *  2. Mapping-Phase – Suche Ticker in ticker_mapping (by symbol ODER company_name)
 *                     → Nicht gefunden? Gemini auflösen + global speichern
 *  3. Cache-Phase   – price_cache prüfen: Eintrag < 60 Min → direkt zurückgeben
 *  4. API-Phase     – Alpha Vantage (direkt, GLOBAL_QUOTE) aufrufen
 *  5. Update        – Neuen Kurs sofort in price_cache speichern
 *
 * GET /api/financial-data?q=Mercedes
 * Header: Authorization: Bearer <supabase-access-token>
 */

import { createClientWithToken, getSupabaseAdmin } from '../lib/supabaseClient.js';
import type { TickerEntry, FinancialDataResult } from '../lib/supabase-types.js';

// ── Konstanten ────────────────────────────────────────────────────────────────

const CACHE_TTL_MINUTES = 60;
const AV_BASE_URL       = 'https://www.alphavantage.co/query';
const GEMINI_MODEL      = 'gemini-1.5-flash';

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

  const rawInput = ((req.query.q as string) ?? '').trim();

  if (!rawInput) {
    return res.status(400).json({ error: 'Parameter "q" fehlt (z. B. ?q=Mercedes oder ?q=SAP.DE).' });
  }

  // ── 1. USER-CHECK ────────────────────────────────────────────────────────────

  const authHeader = (req.headers.authorization ?? '') as string;
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Nicht authentifiziert. Bearer-Token fehlt.' });
  }

  const userClient = createClientWithToken(token);
  const { data: { user }, error: authError } = await userClient.auth.getUser();

  if (authError || !user) {
    return res.status(401).json({ error: 'Ungültiges oder abgelaufenes Auth-Token.' });
  }

  // Ab hier: user.id ist validiert

  try {
    // ── 2. MAPPING-PHASE ──────────────────────────────────────────────────────

    const tickerEntry = await resolveTickerEntry(rawInput);

    // ── 3. CACHE-PHASE (60 Min.) ──────────────────────────────────────────────

    const admin = getSupabaseAdmin();

    const { data: cached } = await admin
      .from('price_cache')
      .select('price, last_updated')
      .eq('ticker_id', tickerEntry.id)
      .maybeSingle() as any;

    if (cached && cached.price !== null && cached.last_updated) {
      const ageMs = Date.now() - new Date(cached.last_updated).getTime();
      if (ageMs < CACHE_TTL_MINUTES * 60 * 1000) {
        const result: FinancialDataResult = buildResult(tickerEntry, cached.price, cached.last_updated, true);
        return res.status(200).json(result);
      }
    }

    // ── 4. API-PHASE (Alpha Vantage) ──────────────────────────────────────────

    const quote = await fetchFromAlphaVantage(tickerEntry.symbol);

    // ── 5. CACHE UPDATE ───────────────────────────────────────────────────────

    const nowIso = new Date().toISOString();
    await admin
      .from('price_cache')
      .upsert(
        { ticker_id: tickerEntry.id, price: quote.price, last_updated: nowIso } as any,
        { onConflict: 'ticker_id' }
      );

    const result: FinancialDataResult = {
      ...buildResult(tickerEntry, quote.price, nowIso, false),
      change       : quote.change,
      changePercent: quote.changePercent,
      volume       : quote.volume,
      currency     : quote.currency,
    };

    return res.status(200).json(result);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
    console.error('[financial-data]', msg);
    return res.status(500).json({ error: msg });
  }
}

// ── Mapping-Logik ─────────────────────────────────────────────────────────────

/**
 * Sucht einen ticker_mapping-Eintrag anhand von Symbol (z. B. "SAP.DE")
 * oder Unternehmensname (z. B. "Mercedes").
 *
 * Nicht gefunden → Gemini auflösen → Eintrag global speichern → zurückgeben.
 */
async function resolveTickerEntry(input: string): Promise<TickerEntry> {
  const admin      = getSupabaseAdmin();
  const upperInput = input.toUpperCase();

  // a) Exakter Symbol-Treffer
  const { data: bySymbol } = await admin
    .from('ticker_mapping')
    .select('*')
    .eq('symbol', upperInput)
    .maybeSingle() as any;

  if (bySymbol) return bySymbol;

  // b) Name-Suche (case-insensitive LIKE)
  const { data: byName } = await admin
    .from('ticker_mapping')
    .select('*')
    .ilike('company_name', `%${input}%`)
    .limit(1)
    .maybeSingle() as any;

  if (byName) return byName;

  // c) Kein Treffer → Gemini löst auf
  const resolved = await resolveWithGemini(input);

  // Neues Mapping global speichern (für alle User)
  const { data: inserted, error: insertError } = await admin
    .from('ticker_mapping')
    .insert({
      symbol      : resolved.symbol.toUpperCase(),
      company_name: resolved.company_name,
      sector      : resolved.sector ?? null,
      industry    : resolved.industry ?? null,
    } as any)
    .select('*')
    .single() as any;

  if (insertError || !inserted) {
    // Parallel-Race: anderer Request hat denselben Ticker schon eingefügt
    const { data: existing } = await admin
      .from('ticker_mapping')
      .select('*')
      .eq('symbol', resolved.symbol.toUpperCase())
      .single() as any;

    if (existing) return existing;
    throw new Error(`Ticker-Mapping konnte nicht gespeichert werden: ${insertError?.message}`);
  }

  return inserted;
}

// ── Gemini-Resolver ───────────────────────────────────────────────────────────

interface GeminiTickerResult {
  symbol      : string;
  company_name: string;
  sector      : string | null;
  industry    : string | null;
}

async function resolveWithGemini(input: string): Promise<GeminiTickerResult> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error('GEMINI_API_KEY nicht konfiguriert.');

  const prompt = `
Du bist ein Finanzmarkt-Experte. Ermittle den Börsenticker für "${input}".

Antworte NUR mit einem JSON-Objekt – kein weiterer Text, keine Backticks:
{
  "symbol": "TICKER.EXCHANGE",
  "company_name": "Offizieller Firmenname",
  "sector": "Sektor auf Englisch oder null",
  "industry": "Branche auf Englisch oder null"
}

Regeln:
- Für XETRA-Aktien: Suffix ".DE" anhängen (z. B. "SAP.DE", "MBG.DE")
- Für US-Aktien: kein Suffix (z. B. "AAPL", "MSFT")
- Falls unbekannt: symbol = "UNKNOWN"
`.trim();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
    {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature     : 0,
          maxOutputTokens : 200,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini-API Fehler: ${err}`);
  }

  const data = await response.json();
  const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

  let parsed: GeminiTickerResult;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Gemini hat kein gültiges JSON zurückgegeben: ${raw}`);
  }

  if (!parsed.symbol || parsed.symbol === 'UNKNOWN') {
    throw new Error(`Kein Ticker für "${input}" gefunden. Bitte Börsensymbol direkt eingeben.`);
  }

  return {
    symbol      : parsed.symbol,
    company_name: parsed.company_name ?? input,
    sector      : parsed.sector ?? null,
    industry    : parsed.industry ?? null,
  };
}

// ── Alpha Vantage (direkt) ────────────────────────────────────────────────────

interface AVQuote {
  price        : number;
  change       : number;
  changePercent: number;
  volume       : number;
  currency     : string;
}

/** Leitet die Währung aus dem Symbol-Suffix ab (Alpha Vantage gibt keine Währung zurück). */
function currencyFromSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper.endsWith('.DE') || upper.endsWith('.DEX') || upper.endsWith('.FRK')) return 'EUR';
  if (upper.endsWith('.LON'))                                                     return 'GBP';
  if (upper.endsWith('.TYO') || upper.endsWith('.TSE'))                           return 'JPY';
  return 'USD';
}

async function fetchFromAlphaVantage(symbol: string): Promise<AVQuote> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) throw new Error('ALPHA_VANTAGE_API_KEY nicht konfiguriert.');

  const url = new URL(AV_BASE_URL);
  url.searchParams.set('function', 'GLOBAL_QUOTE');
  url.searchParams.set('symbol',   symbol);
  url.searchParams.set('apikey',   apiKey);

  const response = await fetch(url.toString(), { method: 'GET' });

  if (!response.ok) {
    throw new Error(`Alpha Vantage Fehler ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();

  // Alpha Vantage signalisiert Rate-Limits im Body (HTTP bleibt 200)
  if (data['Note'] || data['Information']) {
    throw new Error(`Alpha Vantage Limit: ${data['Note'] ?? data['Information']}`);
  }

  const q = data['Global Quote'] as Record<string, string> | undefined;
  if (!q || Object.keys(q).length === 0) {
    throw new Error(`Keine Kursdaten für Symbol "${symbol}" gefunden.`);
  }

  const rawPct = (q['10. change percent'] || '0%').replace('%', '').replace(',', '.');

  return {
    price        : parseFloat(q['05. price']  || '0') || 0,
    change       : parseFloat(q['09. change'] || '0') || 0,
    changePercent: parseFloat(rawPct)                  || 0,
    volume       : parseInt(q['06. volume']   || '0', 10) || 0,
    currency     : currencyFromSymbol(symbol),
  };
}

// ── Result-Builder ────────────────────────────────────────────────────────────

function buildResult(
  ticker     : TickerEntry,
  price      : number,
  lastUpdated: string,
  fromCache  : boolean,
): FinancialDataResult {
  return {
    symbol      : ticker.symbol,
    company_name: ticker.company_name,
    sector      : ticker.sector,
    industry    : ticker.industry,
    description : ticker.description_static,
    pe_ratio    : ticker.pe_ratio_static,
    price,
    currency    : currencyFromSymbol(ticker.symbol),
    change      : 0,
    changePercent: 0,
    volume      : 0,
    fromCache,
    lastUpdated,
  };
}
