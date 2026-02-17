// services/stockService.ts - Frontend: 24h-Cache, Limit-Fallback, Namen→Ticker via Gemini

import { resolveStockNamesToTickers } from './geminiService';

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  name?: string;
}

const SERVER_META_KEYS = ['_cached', '_cachedAt', '_limitReached', '_cachedOnly'];

function toStockQuote(raw: Record<string, unknown>): StockQuote {
  const out = { ...raw };
  SERVER_META_KEYS.forEach((k) => delete out[k]);
  return out as unknown as StockQuote;
}

const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{10}$/;
/** Typisches Ticker-Format: 2–6 Zeichen, nur Großbuchstaben/Zahlen/Punkt (z. B. AAPL, EUNL.DE) */
const TICKER_REGEX = /^[A-Z0-9.]{2,6}$/;

/** True wenn Eingabe schon wie Ticker oder ISIN aussieht (nicht wie Firmenname z. B. "Apple"). */
function looksLikeTickerOrIsin(value: string): boolean {
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();
  if (ISIN_REGEX.test(upper)) return true;
  // Nur als Ticker werten, wenn die Eingabe bereits in Ticker-Schreibweise ist (keine Kleinbuchstaben)
  if (trimmed === upper && TICKER_REGEX.test(upper)) return true;
  return false;
}

class StockService {
  private cache: Map<string, { data: StockQuote; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 Stunden

  async getQuote(symbolOrIsinOrName: string): Promise<StockQuote | null> {
    const key = symbolOrIsinOrName.trim();
    try {
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return cached.data;
      }

      let symbolForApi = key;
      if (!looksLikeTickerOrIsin(key)) {
        const resolved = await resolveStockNamesToTickers([key]);
        if (resolved.length > 0 && resolved[0].ticker) {
          symbolForApi = resolved[0].ticker.trim().toUpperCase();
        }
      }

      const isISIN = ISIN_REGEX.test(symbolForApi);
      const params = isISIN ? `isin=${symbolForApi}` : `symbol=${symbolForApi}`;

      const response = await fetch(`/api/stocks?${params}`);

      if (response.status === 429) {
        const body = await response.json().catch(() => ({}));
        if (body.limitReached && cached) {
          return cached.data;
        }
        return cached?.data ?? null;
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error('Stock API error:', error);
        return cached?.data ?? null;
      }

      const raw = await response.json();
      const data = toStockQuote(raw);

      this.cache.set(key, {
        data,
        timestamp: Date.now(),
      });

      return data;
    } catch (error) {
      console.error('Error fetching stock quote:', error);
      const cached = this.cache.get(key);
      return cached?.data ?? null;
    }
  }

  async getMultipleQuotes(symbols: string[]): Promise<(StockQuote | null)[]> {
    const quotes: (StockQuote | null)[] = [];
    for (const symbol of symbols) {
      quotes.push(await this.getQuote(symbol));
      if (symbols.indexOf(symbol) < symbols.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    return quotes;
  }

  clearCache() {
    this.cache.clear();
  }
}

export const stockService = new StockService();
