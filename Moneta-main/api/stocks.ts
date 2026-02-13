// api/stocks.ts - Yahoo Finance Integration via RapidAPI
export const config = {
  runtime: 'edge', // Optimiert für Vercel Edge Runtime
};

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
    const symbol = searchParams.get('symbol') || 'AAPL';
    const mode = searchParams.get('mode') || 'quote'; // 'quote' für Preise, 'chat' für Diskussionen

    // Nutze deinen neuen Key-Namen aus Vercel
    const apiKey = process.env.RAPIDAPI_KEY; 
    const apiHost = 'yh-finance.p.rapidapi.com';

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API Key nicht konfiguriert' }), { headers, status: 500 });
    }

    // Wähle die URL basierend auf deinem cURL-Beispiel oder Preisdaten
    const url = mode === 'chat' 
      ? `https://${apiHost}/conversations/list?symbol=${symbol}&region=US`
      : `https://${apiHost}/stock/v2/get-summary?symbol=${symbol}&region=US`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': apiHost,
        'x-rapidapi-key': apiKey,
      },
    });

    const data = await response.json();

    // Formatierung für deine App "Moneta"
    if (mode === 'chat') {
      // Extrahiere nur die relevanten Kommentare aus deinem cURL-Beispiel
      const comments = data.conversations?.map((c: any) => c.content) || [];
      return new Response(JSON.stringify({ symbol, comments }), { headers, status: 200 });
    } else {
      // Extrahiere Preisdaten aus der Summary-API
      const priceData = {
        symbol: symbol,
        price: data.price?.regularMarketPrice?.raw || 0,
        change: data.price?.regularMarketChange?.raw || 0,
        changePercent: data.price?.regularMarketChangePercent?.fmt || "0%",
        name: data.price?.shortName || symbol,
        currency: data.price?.currency || 'USD'
      };
      return new Response(JSON.stringify(priceData), { headers, status: 200 });
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Interner Serverfehler' }), { headers, status: 500 });
  }
}
