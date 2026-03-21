
/**
 * Extrahiert den JSON-Block aus einer Gemini-Antwort – robust gegen
 * konversationellen Text, Markdown-Fences und führende/trailing Sätze.
 *
 * Strategie:
 *  1. Markdown-Code-Fence (```json … ```) → nimmt Inhalt der ersten Fence
 *  2. Sucht den ersten '{' oder '[' und schneidet bis zum zugehörigen
 *     letzten '}' bzw. ']' → entfernt vorangehenden / nachfolgenden Text
 *  3. Fallback: getrimmter Originaltext
 */
function extractJson(text: string): string {
  // 1. Markdown code-fence
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1].trim();

  // 2. Outermost JSON object or array
  const firstBrace   = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  const hasObj = firstBrace   !== -1;
  const hasArr = firstBracket !== -1;

  if (!hasObj && !hasArr) return text.trim();

  const useObj = hasObj && (!hasArr || firstBrace < firstBracket);
  const [open, close] = useObj ? ['{', '}'] : ['[', ']'];
  const start = useObj ? firstBrace : firstBracket;
  const end   = text.lastIndexOf(close);

  if (end > start) return text.slice(start, end + 1).trim();
  return text.trim();
}
/** @deprecated use extractJson */
const stripJsonFences = extractJson;

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
- news: Array mit 3–5 relevanten Marktmeldungen zu den Depotwerten, je { title, source (z. B. "Reuters"), snippet (Kurzzitat, sachlich), url (leer lassen ""), ticker (Kürzel der betroffenen Position oder ""), importance ("hoch"|"mittel"|"niedrig"), impact_emoji (z. B. "📉" oder "📈") } – rein faktisch, keine Prognosen
- summary: Kurze sachliche Zusammenfassung der Depot-Zusammensetzung (keine Empfehlungen)
- score: Zahl 0–100 (Diversifikations-Score, kein Qualitätsurteil)
- strengths: Array von Strings (beobachtbare strukturelle Eigenschaften)
- considerations: Array von Strings (neutrale Hinweise auf mögliche Risiken zur Selbstrecherche)
- nextSteps: Array von max. 3 { action: string, description: string } – NUR technische Hinweise wie "Diversifikation prüfen", "Sektorkonzentration beachten", "Kostenstruktur analysieren". KEINE Aktienempfehlungen, keine Kauf/Verkauf/Halte-Aussagen, keine Kursziele.
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

WICHTIG – Pflichtregeln (rechtlich):
- KEINE Kauf-, Halte- oder Verkaufsempfehlungen
- KEIN "sollte", "wird", "empfehlen", "raten"
- Nur beschreibbare Fakten: Marktstellung, Sektorzugehörigkeit, historische Fundamentaldaten
- Satz-Starters erlaubt: "Das Unternehmen ist bekannt für…", "Der Sektor zeigt…", "Die Position gehört zu…"
- Bei ETFs: TER, Replikationsmethode, Benchmark sachlich beschreiben

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
  try {
    return JSON.parse(extractJson(result.text));
  } catch {
    throw new Error('PARSE_ERROR:Gemini hat kein gültiges JSON zurückgegeben. Bitte erneut versuchen.');
  }
};

// ── Scenario Fallback ────────────────────────────────────────────────────────

const SCENARIO_FALLBACK_PROMPT = (
  scenario: string,
  scenarioDesc: string,
  holdings: { name: string; ticker: string; weight: number }[]
) =>
`Du bist ein Finanzbildungs-Assistent. Die primäre Datenquelle ist vorübergehend nicht verfügbar.
Erstelle eine bildungsorientierte Schätzung – ausschließlich basierend auf historischen Marktdaten und allgemeinem Finanzwissen – wie sich das folgende Szenario auf dieses Portfolio ausgewirkt hätte.

Szenario: "${scenario}"
Beschreibung: "${scenarioDesc}"

Portfolio:
${holdings.map(h => `- ${h.name} (${h.ticker}): ${h.weight}% Gewichtung`).join('\n')}

Antworte NUR mit einem gültigen JSON-Objekt (identisches Format zur normalen Szenario-Analyse):
{
  "scenario": "${scenario}",
  "description": "${scenarioDesc}",
  "estimatedImpact": "Kurze Zusammenfassung (historische KI-Schätzung ohne Echtzeit-Daten)",
  "impactPercent": -12.5,
  "affectedHoldings": [
    { "ticker": "SYMBOL", "name": "Firmenname", "impact": "Historische Sektorkorrelation und Einschätzung" }
  ],
  "explanation": "Bildungsorientierte Erklärung auf Basis historischer Muster und Sektoranalyse",
  "historicalComparison": "Verweis auf historisch ähnliche Situationen (z. B. 2008, Dotcom-Blase)"
}

Kein anderer Text außer dem JSON. Keine Anlageberatung. Nur sachliche historische Informationen.`;

export const analyzeScenarioFallback = async (
  scenario: string,
  scenarioDesc: string,
  holdings: { name: string; ticker: string; weight: number }[]
) => {
  const result = await callProxy('chat', {
    contents: [{ parts: [{ text: SCENARIO_FALLBACK_PROMPT(scenario, scenarioDesc, holdings) }] }],
    config: { temperature: 0.4, maxOutputTokens: 1200 }
  });
  try {
    return JSON.parse(extractJson(result.text));
  } catch {
    throw new Error('PARSE_ERROR:Gemini hat kein gültiges JSON zurückgegeben. Bitte erneut versuchen.');
  }
};

// ── Dividends Fallback ───────────────────────────────────────────────────────

const DIVIDENDS_FALLBACK_PROMPT = (tickers: string[], year: number) =>
`Du bist ein Finanzinformations-Assistent. Offizielle Dividenden-Daten sind vorübergehend nicht verfügbar.
Schätze für folgende Aktien basierend auf historischen Ausschüttungsmustern typische Dividenden-Informationen für ${year}:

${tickers.join(', ')}

Antworte NUR mit einem gültigen JSON-Array:
[
  {
    "symbol": "AAPL",
    "dividendPerShare": 0.96,
    "exDividendDate": "${year}-02-10",
    "dividendDate": "${year}-02-15",
    "dividendYield": 0.55,
    "price": 0,
    "noData": false
  }
]

Falls eine Aktie keine Dividende zahlt, setze noData: true und alle Zahlenwerte auf 0.
Nur Aktien aus der Liste aufführen. Kein anderer Text außer dem JSON-Array.`;

export const fetchDividendsFallback = async (tickers: string[]): Promise<any[]> => {
  if (tickers.length === 0) return [];
  const year = new Date().getFullYear();
  const result = await callProxy('chat', {
    contents: [{ parts: [{ text: DIVIDENDS_FALLBACK_PROMPT(tickers, year) }] }],
    config: { temperature: 0.2, maxOutputTokens: 1000 }
  });
  try {
    const parsed = JSON.parse(stripJsonFences(result.text));
    return Array.isArray(parsed) ? parsed.map(d => ({ ...d, isEstimated: true })) : [];
  } catch {
    return [];
  }
};

// ── Ticker Resolution ────────────────────────────────────────────────────────

/** Namen (z. B. "Apple", "Mercedes") in Börsenticker umwandeln (AAPL, DAI). Nutzt Gemini. */
export const resolveStockNamesToTickers = async (names: string[]): Promise<{ name: string; ticker: string }[]> => {
  const input = names.map((n) => n.trim()).filter(Boolean);
  if (input.length === 0) return [];
  const result = await callProxy('resolve_ticker', { names: input });
  const tickers = result.tickers || (result.text ? JSON.parse(result.text).tickers : []);
  return Array.isArray(tickers) ? tickers : [];
};
