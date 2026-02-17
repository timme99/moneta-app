
const wait = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Zentraler API-Proxy Aufruf
 */
const callProxy = async (type: string, payload: any, attempt = 0): Promise<any> => {
  const MAX_RETRIES = 2;
  const BASE_DELAY = 1000;

  const userData = localStorage.getItem('moneta_db_mock');
  const userId = userData ? JSON.parse(userData).id : null;

  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload, userId })
    });

    if (response.status === 429) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`LIMIT_REACHED:Tageslimit für diese Funktion erreicht. Verfügbar in ca. ${errorData.resetIn || 1}h.`);
    }

    if (!response.ok) {
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await wait(BASE_DELAY * Math.pow(2, attempt)); 
        return callProxy(type, payload, attempt + 1);
      }
      throw new Error('API_ERROR:Der Server ist derzeit ausgelastet.');
    }

    return await response.json();

  } catch (error: any) {
    if (error.message.includes('LIMIT_REACHED')) throw error;
    
    if (attempt < MAX_RETRIES) {
      await wait(BASE_DELAY * Math.pow(2, attempt));
      return callProxy(type, payload, attempt + 1);
    }
    throw new Error('NETWORK_ERROR:Keine Verbindung zum Server möglich.');
  }
};

const PORTFOLIO_SYSTEM_PROMPT = `Analysiere das Depot und antworte NUR mit einem gültigen JSON-Objekt (kein anderer Text).

WICHTIG – Für jede Position (holding): gültiges Börsensymbol (ticker) setzen. Namen in Ticker umwandeln, z. B.: Apple → AAPL, Microsoft → MSFT, Mercedes/Daimler → DAI, MSCI World → EUNL, S&P 500 ETF → SXR8.

Das JSON MUSS folgende Felder enthalten:
- holdings: Array mit Objekten { name, ticker, weight (Zahl 0–100), decision ("Kaufen"|"Halten"|"Verkaufen"), reason }
- sectors: Array mit { name (z. B. "Technologie", "Finanzen"), value (Zahl) } – Aufteilung nach Branchen
- regions: Array mit { name (z. B. "USA", "Europa"), value (Zahl) } – Aufteilung nach Regionen
- news: Array mit 3–5 relevanten Marktmeldungen zu den Depotwerten, je { title, source (z. B. "Reuters"), snippet (Kurzzitat), importance ("hoch"|"mittel"|"niedrig"), impact_emoji (z. B. "📉" oder "📈") }
- summary: Kurze Textzusammenfassung der Analyse
- score: Zahl 0–100 (Gesamtbewertung)
- strengths: Array von Strings (Stärken)
- considerations: Array von Strings (Verbesserungsideen)
- nextSteps: Array von { action: string, description: string }
- diversification_score: Zahl, risk_level: "low"|"medium"|"high", context: string, gaps: Array von Strings
- ma_attractiveness_score: Zahl von 1 bis 10 – M&A-Attraktivitäts-Score des Depots. Berechne ihn aus: (1) KGV/P-E-Verhältnis der Positionen (niedriges KGV kann attraktiver sein), (2) Sektor-Mix (z. B. konsolidierungsreife Branchen), (3) aktuelle News (Übernahmegerüchte, Branchentrends). 1 = kaum attraktiv, 10 = sehr attraktiv für M&A.
- ma_attractiveness_note: Kurzer Satz (optional), der die Bewertung in einem Satz erklärt.`;

export const analyzePortfolio = async (input: { text?: string, fileBase64?: string, fileType?: string }) => {
  const contents: any[] = [{ 
    parts: [{ text: PORTFOLIO_SYSTEM_PROMPT + "\n\nAnalysiere dieses Depot. Antworte nur mit gültigem JSON." }] 
  }];
  contents[0].parts.push({ text: input.text || "" });
  if (input.fileBase64) {
    const data = input.fileBase64.includes(',') ? input.fileBase64.split(',')[1] : input.fileBase64;
    contents[0].parts.push({ inlineData: { mimeType: input.fileType || 'image/jpeg', data } });
  }

  const result = await callProxy('analysis', {
    contents,
    config: { responseMimeType: "application/json", temperature: 0.1 }
  });
  return JSON.parse(result.text);
};

export const getFinancialAdvice = async (message: string, history: any[]) => {
  const mappedHistory = history.map(h => ({
    ...h,
    role: h.role === 'assistant' ? 'model' : h.role
  }));

  const result = await callProxy('chat', {
    contents: [...mappedHistory.slice(-4), { role: 'user', parts: [{ text: message }] }],
    config: { maxOutputTokens: 500, temperature: 0.7 }
  });
  return result.text;
};

export const analyzeNewsImpact = async (news: any, holdings: any[]) => {
  const result = await callProxy('news', {
    contents: [{ parts: [{ text: `Impact News "${news.title}" auf ${JSON.stringify(holdings)}. JSON Output.` }] }],
    config: { responseMimeType: "application/json" }
  });
  return JSON.parse(result.text);
};

export const compareETFs = async (isins: string[]) => {
  const result = await callProxy('analysis', {
    contents: [{ parts: [{ text: `Vergleiche diese ETFs basierend auf ISINs: ${isins.join(', ')}. Gib die Antwort als JSON im Format der Schnittstelle ETFComparison zurück.` }] }],
    config: { responseMimeType: "application/json" }
  });
  return JSON.parse(result.text);
};

export const explainStrategy = async (name: string) => {
  const result = await callProxy('chat', {
    contents: [{ parts: [{ text: `Erkläre die Anlagestrategie "${name}" detailliert. Gib die Antwort als JSON im Format der Schnittstelle StrategyExplanation zurück.` }] }],
    config: { responseMimeType: "application/json" }
  });
  return JSON.parse(result.text);
};

export const generatePortfolioSuggestion = async (data: any) => {
  const result = await callProxy('analysis', {
    contents: [{ parts: [{ text: `${PORTFOLIO_SYSTEM_PROMPT}\n\nErstelle einen personalisierten Portfolio-Vorschlag basierend auf: ${JSON.stringify(data)}. Gib die Antwort als JSON im Format PortfolioAnalysisReport zurück. Jedes holding mit name und ticker (z. B. AAPL, EUNL, VWRL).` }] }],
    config: { responseMimeType: "application/json" }
  });
  return JSON.parse(result.text);
};

/** Namen (z. B. "Apple", "Mercedes") in Börsenticker umwandeln (AAPL, DAI). Nutzt Gemini. */
export const resolveStockNamesToTickers = async (names: string[]): Promise<{ name: string; ticker: string }[]> => {
  const input = names.map((n) => n.trim()).filter(Boolean);
  if (input.length === 0) return [];
  const result = await callProxy('resolve_ticker', { names: input });
  const tickers = result.tickers || (result.text ? JSON.parse(result.text).tickers : []);
  return Array.isArray(tickers) ? tickers : [];
};
