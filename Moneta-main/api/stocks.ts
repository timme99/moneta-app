// api/stocks.ts - Alpha Vantage via RapidAPI mit Rate-Limit & 24h-Cache
export const config = {
  runtime: 'edge',
};

const RAPIDAPI_HOST = 'alpha-vantage.p.rapidapi.com';

/** Alpha Vantage erwartet Ticker (z. B. AAPL, EUNL), keine ISINs. ISIN → Ticker für App-ETFs. */
const ISIN_TO_TICKER: Record<string, string> = {
  'IE00B4L5Y983': 'EUNL',   // iShares Core MSCI World
  'IE00B3RBWM25': 'VWRL',   // Vanguard FTSE All-World
  'IE00B5BMR087': 'SXR8',   // iShares Core S&P 500
  'IE00BTJRMP35': 'XMME',   // Xtrackers MSCI Emerging Markets
  'IE00BG47KH54': 'VAGP',   // Vanguard Global Aggregate Bond
};

const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{10}$/;

/** Liefert das für Alpha Vantage gültige Symbol (Ticker). */
function toAlphaVantageSymbol(symbolOrIsin: string): { symbol: string; isIsin: boolean } {
  const raw = (symbolOrIsin || '').trim().toUpperCase();
  if (ISIN_REGEX.test(raw)) {
    const ticker = ISIN_TO_TICKER[raw];
    if (ticker) return { symbol: ticker, isIsin: true };
    return { symbol: raw, isIsin: true }; // unbekannte ISIN → durchreichen (API wird ggf. fehlschlagen)
  }
  return { symbol: raw || 'AAPL', isIsin: false };
}
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1x pro Tag pro Symbol
const LIMIT_PER_MINUTE = 25;
const LIMIT_PER_DAY = 500;

// In-Memory: pro Edge-Instance (bei mehreren Instanzen je Instanz eigenes Limit)
type CachedQuote = { data: Record<string, unknown>; fetchedAt: number };
const quoteCache = new Map<string, CachedQuote>();
const apiCallTimestamps: number[] = [];

function getMinuteCount(): number {
  const now = Date.now();
  const cutoff = now - 60_000;
  return apiCallTimestamps.filter((t) => t > cutoff).length;
}

function getDayCount(): number {
  const now = new Date();
  const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  return apiCallTimestamps.filter((t) => {
    const d = new Date(t);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return key === today;
  }).length;
}

function recordApiCall(): void {
  const now = Date.now();
  apiCallTimestamps.push(now);
  // Alte Einträge grob ausdünnen (nur letzte 24h behalten)
  const cutoff = now - 24 * 60 * 60 * 1000;
  while (apiCallTimestamps.length > 0 && apiCallTimestamps[0] < cutoff) {
    apiCallTimestamps.shift();
  }
}

function buildPriceData(quote: Record<string, string>, symbol: string) {
  const rawChangePercent = quote['10. change percent'] || '0%';
  const changePercentNum = parseFloat(String(rawChangePercent).replace('%', '').replace(',', '.')) || 0;
  return {
    symbol: quote['01. symbol'] || symbol,
    price: parseFloat(quote['05. price'] || '0') || 0,
    change: parseFloat(quote['09. change'] || '0') || 0,
    changePercent: changePercentNum,
    volume: parseInt(quote['06. volume'] || '0', 10) || 0,
    name: quote['01. symbol'] || symbol,
    currency: 'USD',
  };
}

export default async function handler(request: Request) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers, status: 200 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const rawInput = searchParams.get('symbol') ?? searchParams.get('isin') ?? 'AAPL';
    const { symbol: alphaSymbol } = toAlphaVantageSymbol(rawInput);
    const mode = searchParams.get('mode') || 'quote';

    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API Key nicht konfiguriert' }), { headers, status: 500 });
    }

    // Nur für Kurse: 24h-Cache und Rate-Limits (Cache-Key = Alpha-Vantage-Ticker)
    if (mode === 'quote') {
      const cacheKey = alphaSymbol;
      const cached = quoteCache.get(cacheKey);
      const now = Date.now();
      const cacheValid = cached && now - cached.fetchedAt < CACHE_TTL_MS;
      const limitMinute = getMinuteCount() >= LIMIT_PER_MINUTE;
      const limitDay = getDayCount() >= LIMIT_PER_DAY;
      const atLimit = limitMinute || limitDay;

      // Cache-Treffer: keine API-Anfrage, sofort ausliefern
      if (cacheValid) {
        return new Response(
          JSON.stringify({ ...cached.data, _cached: true, _cachedAt: cached.fetchedAt }),
          { headers, status: 200 }
        );
      }

      // Limit erreicht: wenn wir (auch alte) Cache-Daten haben, trotzdem ausliefern
      if (atLimit && cached) {
        return new Response(
          JSON.stringify({
            ...cached.data,
            _limitReached: true,
            _cachedOnly: true,
            _cachedAt: cached.fetchedAt,
          }),
          { headers, status: 200 }
        );
      }

      // Limit erreicht und kein Cache: Client soll gecachte/alte Daten nutzen
      if (atLimit) {
        return new Response(
          JSON.stringify({
            error: 'Tageslimit für Kursabfragen erreicht. Bitte morgen erneut versuchen.',
            limitReached: true,
            useCached: false,
          }),
          { headers, status: 429 }
        );
      }
    }

    // Echter API-Aufruf (Alpha Vantage erwartet Ticker, z. B. AAPL oder EUNL)
    const url = new URL(`https://${RAPIDAPI_HOST}/query`);
    url.searchParams.set('function', mode === 'chat' ? 'NEWS_SENTIMENT' : 'GLOBAL_QUOTE');
    url.searchParams.set('symbol', alphaSymbol);
    if (mode === 'chat') {
      url.searchParams.set('limit', '10');
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': apiKey,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: data.message || 'Alpha Vantage Anfrage fehlgeschlagen' }),
        { headers, status: response.status }
      );
    }

    if (mode === 'chat') {
      const items = data.feed || [];
      const comments = items
        .map((item: { title?: string; summary?: string }) => item.title || item.summary || '')
        .filter(Boolean);
      return new Response(JSON.stringify({ symbol: alphaSymbol, comments }), { headers, status: 200 });
    }

    // Quote: zählen und cachen
    recordApiCall();
    const quote = data['Global Quote'];
    if (!quote || Object.keys(quote).length === 0) {
      return new Response(
        JSON.stringify({ error: 'Keine Kursdaten für dieses Symbol', symbol: alphaSymbol }),
        { headers, status: 404 }
      );
    }

    const priceData = buildPriceData(quote, alphaSymbol);
    quoteCache.set(alphaSymbol, { data: priceData, fetchedAt: Date.now() });

    return new Response(JSON.stringify(priceData), { headers, status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Interner Serverfehler' }), { headers, status: 500 });
  }
}
