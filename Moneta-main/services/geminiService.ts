
/** Entfernt Markdown-Code-Fences aus der Gemini-Antwort, falls vorhanden. */
function stripJsonFences(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return m ? m[1].trim() : text.trim();
}

const wait = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Zentraler API-Proxy Aufruf
 */
const callProxy = async (type: string, payload: any, attempt = 0): Promise<any> => {
  const MAX_RETRIES = 2;
  const BASE_DELAY = 1000;

  // userId wird serverseitig aus dem Supabase-JWT extrahiert – kein localStorage-Fallback
  const userId = null;

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
    if (error.message.startsWith('LIMIT_REACHED:')) throw error;
    if (error.message.startsWith('API_ERROR:')) throw error;

    if (attempt < MAX_RETRIES) {
      await wait(BASE_DELAY * Math.pow(2, attempt));
      return callProxy(type, payload, attempt + 1);
    }
    throw new Error('NETWORK_ERROR:Keine Verbindung zum Server möglich.');
  }
};

const PORTFOLIO_SYSTEM_PROMPT = `Analysiere das Depot rein informativ und antworte NUR mit einem gültigen JSON-Objekt (kein anderer Text). Dies ist eine rein bildungsorientierte Analyse ohne Anlageberatungscharakter.

WICHTIG – Für jede Position (holding): gültiges Börsensymbol (ticker) setzen. Namen in Ticker umwandeln, z. B.: Apple → AAPL, Microsoft → MSFT, Mercedes/Daimler → DAI, MSCI World → EUNL, S&P 500 ETF → SXR8.

WICHTIG – Gib KEINE Kauf-, Halte- oder Verkaufsempfehlungen. Dies stellt keine Anlageberatung dar. Beschreibe stattdessen neutral beobachtbare Markttrends und Kennzahlen.

Das JSON MUSS folgende Felder enthalten:
- holdings: Array mit Objekten { name, ticker, weight (Zahl 0–100), sentiment ("Positiv"|"Neutral"|"Negativ"), reason (rein sachliche Beschreibung der Marktlage, KEINE Empfehlung) }
- sectors: Array mit { name (z. B. "Technologie", "Finanzen"), value (Zahl) } – Aufteilung nach Branchen
- regions: Array mit { name (z. B. "USA", "Europa"), value (Zahl) } – Aufteilung nach Regionen
- news: Array mit 3–5 relevanten Marktmeldungen zu den Depotwerten, je { title, source (z. B. "Reuters"), snippet (Kurzzitat), importance ("hoch"|"mittel"|"niedrig"), impact_emoji (z. B. "📉" oder "📈") }
- summary: Kurze sachliche Zusammenfassung der Depot-Zusammensetzung (keine Empfehlungen)
- score: Zahl 0–100 (Diversifikations-Score, kein Qualitätsurteil)
- strengths: Array von Strings (beobachtbare strukturelle Eigenschaften)
- considerations: Array von Strings (neutrale Hinweise auf mögliche Risiken zur Selbstrecherche)
- nextSteps: Array von { action: string, description: string } (allgemeine Informationshinweise, keine Handlungsempfehlungen)
- diversification_score: Zahl, risk_level: "low"|"medium"|"high", context: string, gaps: Array von Strings`;

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
    config: { temperature: 0.1 }
  });
  return JSON.parse(stripJsonFences(result.text));
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

const NEWS_IMPACT_PROMPT = (newsTitle: string, newsSnippet: string, holdingsList: string) =>
`Du bist ein Finanzanalyse-Assistent. Analysiere den Einfluss folgender Marktnachricht auf das Portfolio des Nutzers.

Nachricht: "${newsTitle}"
Details: "${newsSnippet}"

Portfolio-Positionen:
${holdingsList}

Antworte NUR mit einem gültigen JSON-Objekt exakt in diesem Format:
{
  "relevance": "high" | "medium" | "low",
  "impact_summary": "2–3 Sätze: Wie stark und warum betrifft diese Nachricht das Portfolio?",
  "context": "Hintergrundinformation: Was steckt hinter dieser Meldung?",
  "perspectives": {
    "bullish": "Optimistische Perspektive: Was spricht für eine positive Marktreaktion?",
    "bearish": "Pessimistische Perspektive: Was sind die Risiken?"
  },
  "affected_holdings": [
    { "ticker": "SYMBOL", "your_exposure": "Kurze Einschätzung zum Exposure dieser Position" }
  ],
  "educational_note": "Lehrreicher Hinweis: Was kann der Anleger aus dieser Situation lernen?"
}

Nur Positionen in affected_holdings aufführen, die wirklich betroffen sind. Kein anderer Text außer dem JSON.`;

export const analyzeNewsImpact = async (news: any, holdings: any[]) => {
  const holdingsList = holdings
    .map(h => `- ${h.name} (${h.ticker || 'N/A'}), Gewichtung: ${h.weight ?? '?'}%`)
    .join('\n');

  const result = await callProxy('news', {
    contents: [{ parts: [{ text: NEWS_IMPACT_PROMPT(news.title, news.snippet || '', holdingsList) }] }],
    config: { temperature: 0.3 }
  });
  return JSON.parse(stripJsonFences(result.text));
};

export const compareETFs = async (isins: string[]) => {
  const result = await callProxy('analysis', {
    contents: [{ parts: [{ text: `Vergleiche diese ETFs basierend auf ISINs: ${isins.join(', ')}. Gib die Antwort als JSON im Format der Schnittstelle ETFComparison zurück.` }] }],
    config: {}
  });
  return JSON.parse(stripJsonFences(result.text));
};

export const explainStrategy = async (name: string) => {
  const result = await callProxy('chat', {
    contents: [{ parts: [{ text: `Erkläre die Anlagestrategie "${name}" detailliert. Gib die Antwort als JSON im Format der Schnittstelle StrategyExplanation zurück.` }] }],
    config: {}
  });
  return JSON.parse(stripJsonFences(result.text));
};

export const generatePortfolioSuggestion = async (data: any) => {
  const result = await callProxy('analysis', {
    contents: [{ parts: [{ text: `${PORTFOLIO_SYSTEM_PROMPT}\n\nErstelle einen personalisierten Portfolio-Vorschlag basierend auf: ${JSON.stringify(data)}. Gib die Antwort als JSON im Format PortfolioAnalysisReport zurück. Jedes holding mit name und ticker (z. B. AAPL, EUNL, VWRL).` }] }],
    config: {}
  });
  return JSON.parse(stripJsonFences(result.text));
};

const HOLDING_THESES_PROMPT = (holdings: { name: string; ticker: string; shares: number | null; buyPrice: number | null }[]) =>
`Du bist ein neutraler Finanzinformations-Assistent. Erstelle für jede der folgenden Positionen eine kurze, sachliche Markteinschätzung (genau 2 Sätze).

WICHTIG:
- KEINE Kauf- oder Verkaufsempfehlungen
- Beschreibe nur beobachtbare Marktlage, Fundamentaldaten oder Branchenkontext
- Neutral formulieren ("Das Unternehmen... ist bekannt für... / operiert in...")
- Falls kein Kaufdatum/Kaufpreis bekannt: aktuelle Markteinschätzung zur Branchenstellung geben

Positionen:
${holdings.map((h, i) => `${i + 1}. ${h.name} (${h.ticker})${h.shares ? ` · ${h.shares} Stk. · Kaufpreis ${h.buyPrice?.toFixed(2)} €` : ' · Nur Marktbeobachtung'}`).join('\n')}

Antworte NUR mit einem gültigen JSON-Array:
[
  {
    "ticker": "SYMBOL",
    "thesis": "Erster Satz zur Unternehmens-/Branchenstellung. Zweiter Satz zu aktuellem Marktumfeld oder Kennzahl."
  }
]

Kein anderer Text außer dem JSON-Array.`;

export const generateHoldingTheses = async (
  holdings: { name: string; ticker: string; shares: number | null; buyPrice: number | null }[]
): Promise<{ ticker: string; thesis: string }[]> => {
  if (holdings.length === 0) return [];
  const result = await callProxy('chat', {
    contents: [{ parts: [{ text: HOLDING_THESES_PROMPT(holdings) }] }],
    config: { temperature: 0.4, maxOutputTokens: 2000 }
  });
  try {
    return JSON.parse(stripJsonFences(result.text));
  } catch {
    return [];
  }
};

const EARNINGS_CALENDAR_PROMPT = (tickers: string[], today: string) =>
`Du bist ein Finanzinformations-Assistent. Erstelle auf Basis deines Wissensstands einen informativen Earnings-Kalender für die folgenden Börsensymbole: ${tickers.join(', ')}.

Heute ist: ${today}

WICHTIG: Dies sind Bildungsinformationen, keine Anlageberatung. Gib dein bestes Wissen zu typischen Quartalszeiträumen an. Falls du das exakte Datum nicht kennst, schätze auf Basis des üblichen Quartalszyklus.

Antworte NUR mit einem gültigen JSON-Array in diesem Format:
[
  {
    "ticker": "AAPL",
    "company": "Apple Inc.",
    "date": "YYYY-MM-DD",
    "quarter": "Q1 2026",
    "epsEstimate": "1,82 $",
    "revenueEstimate": "94,5 Mrd. $",
    "timeOfDay": "nach Marktschluss"
  }
]

timeOfDay muss einer dieser Werte sein: "vor Marktöffnung" | "nach Marktschluss" | "unbekannt"
Füge NUR Positionen ein, für die du sinnvolle Informationen hast. Kein anderer Text außer dem JSON-Array.`;

export const fetchEarningsCalendar = async (tickers: string[]) => {
  if (tickers.length === 0) return [];
  const today = new Date().toISOString().split('T')[0];
  const result = await callProxy('chat', {
    contents: [{ parts: [{ text: EARNINGS_CALENDAR_PROMPT(tickers, today) }] }],
    config: { temperature: 0.2, maxOutputTokens: 1500 }
  });
  try {
    return JSON.parse(stripJsonFences(result.text));
  } catch {
    return [];
  }
};

const SCENARIO_ANALYSIS_PROMPT = (scenario: string, scenarioDesc: string, holdings: { name: string; ticker: string; weight: number }[]) =>
`Du bist ein Finanzbildungs-Assistent. Analysiere rein informativ und ohne Anlageberatungscharakter, wie das folgende Szenario historisch ähnliche Portfolios beeinflusst hätte.

Szenario: "${scenario}"
Beschreibung: "${scenarioDesc}"

Portfolio:
${holdings.map(h => `- ${h.name} (${h.ticker}): ${h.weight}% Gewichtung`).join('\n')}

Antworte NUR mit einem gültigen JSON-Objekt:
{
  "scenario": "${scenario}",
  "description": "${scenarioDesc}",
  "estimatedImpact": "Kurze Zusammenfassung des möglichen Effekts",
  "impactPercent": -12.5,
  "affectedHoldings": [
    { "ticker": "SYMBOL", "name": "Firmenname", "impact": "Kurze Einschätzung der historischen Korrelation" }
  ],
  "explanation": "Ausführliche bildungsorientierte Erklärung des Szenarios und historischer Vergleiche",
  "historicalComparison": "Verweis auf historisch ähnliche Situationen (z. B. 2008, Dotcom-Blase)"
}

impactPercent als Zahl (negativ = Verlust, positiv = Gewinn). Nur sachliche, historisch fundierte Informationen. Keine Handlungsempfehlungen. Kein anderer Text außer dem JSON.`;

export const analyzeScenario = async (
  scenario: string,
  scenarioDesc: string,
  holdings: { name: string; ticker: string; weight: number }[]
) => {
  const result = await callProxy('chat', {
    contents: [{ parts: [{ text: SCENARIO_ANALYSIS_PROMPT(scenario, scenarioDesc, holdings) }] }],
    config: { temperature: 0.3, maxOutputTokens: 1500 }
  });
  return JSON.parse(stripJsonFences(result.text));
};

/** Namen (z. B. "Apple", "Mercedes") in Börsenticker umwandeln (AAPL, DAI). Nutzt Gemini. */
export const resolveStockNamesToTickers = async (names: string[]): Promise<{ name: string; ticker: string }[]> => {
  const input = names.map((n) => n.trim()).filter(Boolean);
  if (input.length === 0) return [];
  const result = await callProxy('resolve_ticker', { names: input });
  const tickers = result.tickers || (result.text ? JSON.parse(result.text).tickers : []);
  return Array.isArray(tickers) ? tickers : [];
};
