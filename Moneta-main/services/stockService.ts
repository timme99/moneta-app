// services/stockService.ts - Frontend service for stock/ETF data

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  name?: string;
}

class StockService {
  private cache: Map<string, { data: StockQuote; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  async getQuote(symbolOrIsin: string): Promise<StockQuote | null> {
    try {
      // Check cache first
      const cached = this.cache.get(symbolOrIsin);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return cached.data;
      }

      // Determine if input is ISIN or symbol
      const isISIN = /^[A-Z]{2}[A-Z0-9]{10}$/.test(symbolOrIsin);
      const params = isISIN 
        ? `isin=${symbolOrIsin}`
        : `symbol=${symbolOrIsin}`;

      const response = await fetch(`/api/stocks?${params}`);
      
      if (!response.ok) {
        const error = await response.json();
        console.error('Stock API error:', error);
        return null;
      }

      const data: StockQuote = await response.json();

      // Cache the result
      this.cache.set(symbolOrIsin, {
        data,
        timestamp: Date.now(),
      });

      return data;
    } catch (error) {
      console.error('Error fetching stock quote:', error);
      return null;
    }
  }

  async getMultipleQuotes(symbols: string[]): Promise<(StockQuote | null)[]> {
    // To avoid hitting API limits, fetch sequentially with delay
    const quotes: (StockQuote | null)[] = [];
    
    for (const symbol of symbols) {
      const quote = await this.getQuote(symbol);
      quotes.push(quote);
      
      // Small delay to avoid rate limiting
      if (symbols.indexOf(symbol) < symbols.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return quotes;
  }

  clearCache() {
    this.cache.clear();
  }
}

export const stockService = new StockService();
