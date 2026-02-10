// api/stocks.ts - Alpha Vantage Integration for ETF & Stock Data

export const config = {
  runtime: 'edge',
};

interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  name?: string;
}

export default async function handler(request: Request) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers, status: 200 });
  }

  try {
    const url = new URL(request.url);
    const symbol = url.searchParams.get('symbol');
    const isin = url.searchParams.get('isin');

    if (!symbol && !isin) {
      return new Response(
        JSON.stringify({ error: 'Symbol or ISIN required' }),
        { headers, status: 400 }
      );
    }

    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { headers, status: 500 }
      );
    }

    // If ISIN provided, convert to symbol (simplified - you may need a mapping service)
    const searchSymbol = symbol || isin;

    // Get quote data from Alpha Vantage
    const avUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${searchSymbol}&apikey=${apiKey}`;
    
    const response = await fetch(avUrl);
    const data = await response.json();

    if (data['Error Message'] || data['Note']) {
      return new Response(
        JSON.stringify({ 
          error: 'API limit reached or invalid symbol',
          message: data['Note'] || data['Error Message']
        }),
        { headers, status: 429 }
      );
    }

    const quote = data['Global Quote'];
    
    if (!quote || !quote['05. price']) {
      return new Response(
        JSON.stringify({ error: 'No data found for symbol' }),
        { headers, status: 404 }
      );
    }

    // Parse and format the response
    const quoteData: QuoteData = {
      symbol: quote['01. symbol'],
      price: parseFloat(quote['05. price']),
      change: parseFloat(quote['09. change']),
      changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
      volume: parseInt(quote['06. volume']),
      name: searchSymbol,
    };

    return new Response(
      JSON.stringify(quoteData),
      { headers, status: 200 }
    );

  } catch (error) {
    console.error('Stock API error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { headers, status: 500 }
    );
  }
}
