// api/stocks.ts - Alpha Vantage (direkt) mit Rate-Limit & 24h-Cache

const AV_BASE_URL = 'https://www.alphavantage.co/query';

/** Alpha Vantage erwartet Ticker (z. B. AAPL, EUNL), keine ISINs. ISIN → Ticker für App-ETFs. */
const ISIN_TO_TICKER: Record<string, string> = {
  'IE00B4L5Y983': 'EUNL',   // iShares Core MSCI World
  'IE00B3RBWM25': 'VWRL',   // Vanguard FTSE All-World
  'IE00B5BMR087': 'IVV',    // iShares Core S&P 500 (US-Listing, AV-kompatibel; UCITS-Pendant: SXR8/CSPX)
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

// Free-Plan: 5 Anfragen/Minute, 25 Anfragen/Tag
// Premium-Plan: deutlich höher – Konstanten hier anpassen
const CACHE_TTL_MS    = 24 * 60 * 60 * 1000; // 24h
const LIMIT_PER_MINUTE = 5;
const LIMIT_PER_DAY    = 25;

// In-Memory: pro Node-Instance
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

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const rawInput = ((req.query.symbol ?? req.query.isin ?? '') as string).trim();
    if (!rawInput) {
      return res.status(400).json({ error: 'Parameter "symbol" oder "isin" fehlt.' });
    }
    const { symbol: alphaSymbol } = toAlphaVantageSymbol(rawInput);
    const mode = (req.query.mode as string) || 'quote';

    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ALPHA_VANTAGE_API_KEY nicht konfiguriert' });
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
        return res.status(200).json({ ...cached.data, _cached: true, _cachedAt: cached.fetchedAt });
      }

      // Limit erreicht: wenn wir (auch alte) Cache-Daten haben, trotzdem ausliefern
      if (atLimit && cached) {
        return res.status(200).json({
          ...cached.data,
          _limitReached: true,
          _cachedOnly: true,
          _cachedAt: cached.fetchedAt,
        });
      }

      // Limit erreicht und kein Cache: Client soll gecachte/alte Daten nutzen
      if (atLimit) {
        return res.status(429).json({
          error: 'Tageslimit für Kursabfragen erreicht. Bitte morgen erneut versuchen.',
          limitReached: true,
          useCached: false,
        });
      }
    }

    // Echter API-Aufruf (Alpha Vantage direkt)
    const url = new URL(AV_BASE_URL);
    url.searchParams.set('apikey', apiKey);
    url.searchParams.set('symbol', alphaSymbol);

    if (mode === 'chat') {
      url.searchParams.set('function', 'NEWS_SENTIMENT');
      url.searchParams.set('tickers', alphaSymbol);
      url.searchParams.set('limit', '10');
    } else {
      url.searchParams.set('function', 'GLOBAL_QUOTE');
    }

    const response = await fetch(url.toString(), { method: 'GET' });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.message || `Alpha Vantage Anfrage fehlgeschlagen (HTTP ${response.status})`,
        symbol: alphaSymbol,
      });
    }

    // Alpha Vantage gibt HTTP 200 auch bei Rate-Limit-Fehlern zurück – Body prüfen
    if (data['Note'] || data['Information']) {
      const msg = data['Note'] || data['Information'];
      return res.status(503).json({
        error: 'Alpha Vantage Rate-Limit erreicht. Bitte später erneut versuchen.',
        detail: msg,
        limitReached: true,
        symbol: alphaSymbol,
      });
    }

    if (mode === 'chat') {
      const items = data.feed || [];
      const comments = items
        .map((item: { title?: string; summary?: string }) => item.title || item.summary || '')
        .filter(Boolean);
      return res.status(200).json({ symbol: alphaSymbol, comments });
    }

    // Quote: zählen und cachen
    recordApiCall();
    const quote = data['Global Quote'];
    if (!quote || Object.keys(quote).length === 0) {
      return res.status(404).json({ error: 'Keine Kursdaten für dieses Symbol', symbol: alphaSymbol });
    }

    const priceData = buildPriceData(quote, alphaSymbol);
    quoteCache.set(alphaSymbol, { data: priceData, fetchedAt: Date.now() });

    return res.status(200).json(priceData);
  } catch (error: any) {
    return res.status(500).json({
      error: 'Interner Serverfehler beim Abruf der Kursdaten.',
      detail: error?.message ?? String(error),
    });
  }
}
