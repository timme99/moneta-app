
import { GoogleGenAI } from '@google/genai';

const wait = (ms: number) => new Promise(res => setTimeout(res, ms));

// API Key wird von Vite injiziert (vite.config.ts define)
const API_KEY = (process.env.GEMINI_API_KEY || process.env.API_KEY || '') as string;
const MODEL_NAME = 'gemini-2.0-flash';

let aiInstance: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!aiInstance) {
    if (!API_KEY) {
      throw new Error('CONFIG_ERROR:Gemini API-Key nicht konfiguriert. Bitte GEMINI_API_KEY in der .env.local setzen.');
    }
    aiInstance = new GoogleGenAI({ apiKey: API_KEY });
  }
  return aiInstance;
}

/**
 * Direkter Gemini SDK Aufruf mit Retry-Logik
 */
const callGemini = async (contents: any, config: any = {}, attempt = 0): Promise<string> => {
  const MAX_RETRIES = 2;
  const BASE_DELAY = 1500;

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents,
      config
    });

    const text = response.text || '';
    if (!text) {
      throw new Error('Leere Antwort von der KI.');
    }
    return text;

  } catch (error: any) {
    if (error.message?.includes('CONFIG_ERROR')) throw error;

    console.error(`[Moneta Gemini] Versuch ${attempt + 1} fehlgeschlagen:`, error.message);

    if (attempt < MAX_RETRIES) {
      await wait(BASE_DELAY * Math.pow(2, attempt));
      return callGemini(contents, config, attempt + 1);
    }

    if (error.message?.includes('API key')) {
      throw new Error('CONFIG_ERROR:Ungültiger API-Key. Bitte GEMINI_API_KEY prüfen.');
    }
    if (error.status === 429 || error.message?.includes('quota') || error.message?.includes('rate')) {
      throw new Error('LIMIT_REACHED:API-Limit erreicht. Bitte in einigen Minuten erneut versuchen.');
    }
    throw new Error('API_ERROR:Die KI-Analyse konnte nicht durchgeführt werden. Bitte versuche es erneut.');
  }
};

/**
 * JSON sicher parsen - versucht auch JSON aus Markdown zu extrahieren
 */
function safeParseJSON(text: string): any {
  // Erst direkt versuchen
  try {
    return JSON.parse(text);
  } catch {
    // Versuche JSON aus ```json ... ``` Markdown zu extrahieren
    const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (markdownMatch) {
      try {
        return JSON.parse(markdownMatch[1].trim());
      } catch { /* weiter versuchen */ }
    }

    // Versuche erstes JSON-Objekt zu extrahieren
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch { /* weiter versuchen */ }
    }

    // Versuche JSON-Array zu extrahieren
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch { /* aufgeben */ }
    }

    throw new Error('PARSE_ERROR:Die KI-Antwort konnte nicht als JSON verarbeitet werden.');
  }
}

const PORTFOLIO_ANALYSIS_SCHEMA = `
Du bist ein professioneller Finanzanalyst. Analysiere das folgende Depot/Portfolio und gib eine detaillierte Analyse als JSON zurück.

WICHTIG: Antworte NUR mit validem JSON. Kein Markdown, kein Text drumherum.

Das JSON muss exakt dieses Format haben:
{
  "holdings": [
    {
      "name": "Vollständiger Name der Aktie/ETF",
      "weight": 25,
      "isin": "ISIN falls bekannt",
      "ticker": "Ticker-Symbol",
      "decision": "Halten",
      "reason": "Kurze Begründung der Empfehlung (1-2 Sätze)",
      "currentPrice": "123.45€",
      "trend": "Aufwärtstrend"
    }
  ],
  "sectors": [
    { "name": "Technologie", "value": 40 },
    { "name": "Gesundheit", "value": 20 },
    { "name": "Finanzen", "value": 15 },
    { "name": "Industrie", "value": 15 },
    { "name": "Sonstige", "value": 10 }
  ],
  "regions": [
    { "name": "USA", "value": 55 },
    { "name": "Europa", "value": 25 },
    { "name": "Asien", "value": 15 },
    { "name": "Sonstige", "value": 5 }
  ],
  "performance_history": [],
  "summary": "Zusammenfassende Bewertung des Portfolios in 2-3 Sätzen auf Deutsch.",
  "strengths": ["Stärke 1", "Stärke 2"],
  "considerations": ["Bedenken 1", "Bedenken 2"],
  "diversification_score": 7,
  "risk_level": "medium",
  "context": "Marktkontext-Beschreibung",
  "score": 72,
  "gaps": ["Fehlender Bereich 1"],
  "news": [
    {
      "title": "Relevante aktuelle Nachricht für dieses Depot",
      "source": "Marktanalyse",
      "snippet": "Kurze Beschreibung der Nachricht und warum sie relevant ist.",
      "importance": "hoch",
      "impact_emoji": "📈"
    },
    {
      "title": "Zweite relevante Nachricht",
      "source": "Branchentrend",
      "snippet": "Beschreibung der Nachricht.",
      "importance": "mittel",
      "impact_emoji": "⚡"
    },
    {
      "title": "Dritte relevante Nachricht",
      "source": "Wirtschaft",
      "snippet": "Beschreibung der Nachricht.",
      "importance": "niedrig",
      "impact_emoji": "📊"
    }
  ],
  "nextSteps": [
    {
      "action": "Konkrete Handlungsempfehlung",
      "description": "Detaillierte Beschreibung was zu tun ist und warum."
    },
    {
      "action": "Zweite Empfehlung",
      "description": "Detaillierte Beschreibung."
    },
    {
      "action": "Dritte Empfehlung",
      "description": "Detaillierte Beschreibung."
    }
  ],
  "health_factors": {
    "div": 7,
    "cost": 6,
    "risk": 7
  },
  "savings": 120
}

REGELN:
- "decision" muss einer von: "Kaufen", "Halten", "Verkaufen" sein
- "importance" muss einer von: "hoch", "mittel", "niedrig" sein
- "risk_level" muss einer von: "low", "medium", "high" sein
- "score" ist 0-100 (Gesamtbewertung des Portfolios)
- "weight" ist Prozent (alle weights zusammen ergeben 100)
- "sectors" und "regions" values ergeben jeweils 100
- "health_factors" scores sind 0-10
- Generiere mindestens 3 News-Items die aktuell zum Depot relevant sind
- Generiere mindestens 2 nextSteps mit konkreten Handlungsempfehlungen
- Alle Texte auf Deutsch
- impact_emoji soll ein passendes Emoji sein (📈📉⚡💰🏦📊🌍🔥⚠️)
- Wenn die Eingabe Aktiennamen, ISINs oder Ticker enthält, verwende echte aktuelle Marktdaten soweit möglich
- Schätze realistische aktuelle Preise und Trends basierend auf deinem Wissen
`;

export const analyzePortfolio = async (input: { text?: string, fileBase64?: string, fileType?: string }) => {
  const userPrompt = PORTFOLIO_ANALYSIS_SCHEMA + "\n\nHier ist das zu analysierende Depot:\n" + (input.text || "Bitte analysiere ein allgemeines Beispiel-Depot.");

  let contents: any;
  if (input.fileBase64) {
    const data = input.fileBase64.includes(',') ? input.fileBase64.split(',')[1] : input.fileBase64;
    contents = [
      {
        role: 'user',
        parts: [
          { text: userPrompt },
          { inlineData: { mimeType: input.fileType || 'image/jpeg', data } }
        ]
      }
    ];
  } else {
    contents = userPrompt;
  }

  const responseText = await callGemini(contents, {
    responseMimeType: "application/json",
    temperature: 0.2
  });

  const parsed = safeParseJSON(responseText);

  // Ensure required fields have defaults
  return {
    holdings: parsed.holdings || [],
    sectors: parsed.sectors || [],
    regions: parsed.regions || [],
    performance_history: parsed.performance_history || [],
    summary: parsed.summary || "Analyse abgeschlossen.",
    strengths: parsed.strengths || [],
    considerations: parsed.considerations || [],
    diversification_score: parsed.diversification_score || 5,
    risk_level: parsed.risk_level || 'medium',
    context: parsed.context || '',
    score: parsed.score || 50,
    gaps: parsed.gaps || [],
    news: (parsed.news || []).map((n: any) => ({
      title: n.title || 'Nachricht',
      source: n.source || 'Marktanalyse',
      snippet: n.snippet || '',
      importance: n.importance || 'mittel',
      impact_emoji: n.impact_emoji || '📊',
      url: n.url,
      ticker: n.ticker
    })),
    nextSteps: (parsed.nextSteps || parsed.next_steps || []).map((s: any) => ({
      action: s.action || 'Empfehlung',
      description: s.description || ''
    })),
    health_factors: parsed.health_factors || { div: 5, cost: 5, risk: 5 },
    savings: parsed.savings || 0,
    textResponse: parsed.summary
  };
};

export const getFinancialAdvice = async (message: string, history: any[]) => {
  const mappedHistory = history.map(h => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.parts?.[0]?.text || h.content || '' }]
  }));

  const systemPrompt = "Du bist Moneta, ein freundlicher und kompetenter KI-Finanzberater. Antworte auf Deutsch. " +
    "Gib hilfreiche, verständliche Finanzberatung. Weise bei konkreten Anlageempfehlungen immer darauf hin, " +
    "dass dies keine professionelle Anlageberatung ist. Halte Antworten kurz und prägnant (max 3-4 Absätze).";

  const contents = [
    ...mappedHistory.slice(-4),
    { role: 'user', parts: [{ text: systemPrompt + "\n\nNutzer-Frage: " + message }] }
  ];

  return await callGemini(contents, { maxOutputTokens: 800, temperature: 0.7 });
};

export const analyzeNewsImpact = async (news: any, holdings: any[]) => {
  const holdingNames = holdings.map(h => h.name).join(', ');
  const prompt = `Analysiere den Impact dieser Nachricht auf das Portfolio. Antworte NUR mit validem JSON:
{
  "relevance": "high",
  "impact_summary": "Zusammenfassung des Impacts auf Deutsch",
  "context": "Marktkontext",
  "perspectives": {
    "bullish": "Positive Perspektive",
    "bearish": "Negative Perspektive"
  },
  "affected_holdings": [
    { "ticker": "SYMBOL", "your_exposure": "Beschreibung der Betroffenheit" }
  ],
  "educational_note": "Lehrreicher Hinweis für den Anleger"
}
"relevance" muss "high", "medium" oder "low" sein.

Nachricht: "${news.title}" - ${news.snippet}
Portfolio-Holdings: ${holdingNames}`;

  const responseText = await callGemini(prompt, {
    responseMimeType: "application/json",
    temperature: 0.2
  });

  const parsed = safeParseJSON(responseText);

  return {
    relevance: parsed.relevance || 'medium',
    impact_summary: parsed.impact_summary || 'Analyse nicht verfügbar.',
    context: parsed.context || '',
    perspectives: {
      bullish: parsed.perspectives?.bullish || 'Keine positive Perspektive identifiziert.',
      bearish: parsed.perspectives?.bearish || 'Keine negative Perspektive identifiziert.'
    },
    affected_holdings: parsed.affected_holdings || [],
    educational_note: parsed.educational_note || 'Diversifikation bleibt der wichtigste Schutz.'
  };
};

export const compareETFs = async (isins: string[]) => {
  const prompt = `Vergleiche diese ETFs basierend auf ISINs: ${isins.join(', ')}.
Antworte NUR mit validem JSON im folgenden Format:
{
  "etfs": [
    {
      "name": "ETF Name",
      "isin": "ISIN",
      "key_facts": { "ter": "0.20%", "size": "65 Mrd. €", "replication": "Physisch" },
      "strengths": ["Stärke 1"],
      "considerations": ["Bedenken 1"]
    }
  ],
  "comparison_summary": "Zusammenfassung auf Deutsch"
}`;

  const responseText = await callGemini(prompt, {
    responseMimeType: "application/json",
    temperature: 0.2
  });
  return safeParseJSON(responseText);
};

export const explainStrategy = async (name: string) => {
  const prompt = `Erkläre die Anlagestrategie "${name}" detailliert auf Deutsch. Antworte NUR mit validem JSON:
{
  "strategy_name": "${name}",
  "description": "Beschreibung",
  "typical_allocation": { "Aktien": "60%", "Anleihen": "30%", "Sonstige": "10%" },
  "common_reasons": ["Grund 1"],
  "considerations": ["Bedenken 1"],
  "historical_context": "Historischer Kontext",
  "alternatives": ["Alternative 1"]
}`;

  const responseText = await callGemini(prompt, {
    responseMimeType: "application/json",
    temperature: 0.3
  });
  return safeParseJSON(responseText);
};

export const generatePortfolioSuggestion = async (data: any) => {
  const prompt = PORTFOLIO_ANALYSIS_SCHEMA +
    `\n\nErstelle einen personalisierten Portfolio-Vorschlag basierend auf diesen Präferenzen:\n` +
    `Ziel: ${data.goal || 'Vermögensaufbau'}\n` +
    `Risikotoleranz: ${data.riskTolerance || 'balanced'}\n` +
    `Monatlicher Betrag: ${data.monthlyAmount || '500'}€\n` +
    `Anlagehorizont: ${data.timeHorizon || '10'} Jahre\n` +
    `Erstelle ein konkretes ETF/Aktien-Portfolio mit realen Wertpapieren.`;

  const responseText = await callGemini(prompt, {
    responseMimeType: "application/json",
    temperature: 0.3
  });
  return safeParseJSON(responseText);
};

export const fetchMarketNews = async (holdings: string[]): Promise<any[]> => {
  const holdingsList = holdings.join(', ');
  const prompt = `Generiere 5 aktuelle, relevante Finanznachrichten für ein Depot mit diesen Werten: ${holdingsList}.
Antworte NUR mit validem JSON-Array:
[
  {
    "title": "Nachrichtentitel",
    "source": "Quelle",
    "snippet": "Kurze Beschreibung (1-2 Sätze)",
    "importance": "hoch",
    "impact_emoji": "📈"
  }
]
"importance" muss "hoch", "mittel" oder "niedrig" sein.
Verwende realistische, aktuelle Marktnachrichten basierend auf deinem Wissen.`;

  try {
    const responseText = await callGemini(prompt, {
      responseMimeType: "application/json",
      temperature: 0.4
    });
    const parsed = safeParseJSON(responseText);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const generateDailyReport = async (holdings: any[], score: number, summary: string): Promise<string> => {
  const holdingSummary = holdings.map(h => `${h.name} (${h.weight}%, ${h.decision})`).join(', ');

  const prompt = `Erstelle einen kurzen, professionellen täglichen Portfolio-Bericht auf Deutsch als HTML-formatierten Text.

Portfolio-Daten:
- Holdings: ${holdingSummary}
- Gesamtscore: ${score}/100
- Zusammenfassung: ${summary}
- Datum: ${new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

Der Bericht soll enthalten:
1. Tagesüberblick (2-3 Sätze)
2. Wichtigste Marktbewegungen für die gehaltenen Werte
3. Eventuelle Handlungsempfehlungen
4. Kurzer Ausblick

Formatiere als sauberes HTML mit inline-Styles. Verwende eine professionelle, aber verständliche Sprache.
Antworte NUR mit dem HTML-String (kein JSON, kein Markdown).`;

  return await callGemini(prompt, { maxOutputTokens: 1500, temperature: 0.5 });
};
