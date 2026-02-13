
import { GoogleGenAI } from '@google/genai';

const getApiKey = (): string | null => {
  try {
    const key = (process.env as any).GEMINI_API_KEY || (process.env as any).API_KEY || null;
    return key && key !== 'undefined' && key !== '' ? key : null;
  } catch {
    return null;
  }
};

/**
 * Direct Gemini API call (works in Vite dev and production without proxy)
 */
const callGeminiDirect = async (contents: any[], config: any): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('NO_KEY:Kein Gemini API-Key konfiguriert. Bitte GEMINI_API_KEY in .env setzen.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents,
    config: config || {},
  });

  return response.text || '';
};

/**
 * Try proxy first (Vercel production), fallback to direct API call (dev mode)
 */
const callProxy = async (type: string, payload: any): Promise<any> => {
  const userData = localStorage.getItem('moneta_db_mock');
  const userId = userData ? JSON.parse(userData).id : null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload, userId }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.status === 429) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`LIMIT_REACHED:Tageslimit für diese Funktion erreicht. Verfügbar in ca. ${errorData.resetIn || 1}h.`);
    }

    if (!response.ok) {
      throw new Error('PROXY_UNAVAILABLE');
    }

    return await response.json();
  } catch (error: any) {
    if (error.message.includes('LIMIT_REACHED')) throw error;

    // Proxy not available (dev mode) → call Gemini directly
    const text = await callGeminiDirect(payload.contents, payload.config || {});
    return { text };
  }
};

const ANALYSIS_SYSTEM_PROMPT = `Du bist ein professioneller Portfolio-Analyst und Vermögensberater. Analysiere das gegebene Depot/Portfolio und erstelle einen vollständigen Bericht als JSON.

WICHTIG: Antworte NUR mit validem JSON. Kein Markdown, kein Text drumherum.

Das JSON muss exakt dieses Format haben:
{
  "totalValue": <Geschätzter Gesamtwert in Euro als Zahl, schätze basierend auf aktuellen Marktpreisen>,
  "totalDailyChange": <Tagesänderung in Euro als Zahl>,
  "totalDailyChangePercent": <Tagesänderung in Prozent als Zahl>,
  "weightedTER": <Gewichtete TER als Dezimalzahl, z.B. 0.20>,
  "score": <Portfolio-Score 0-100 als Zahl>,
  "summary": "<Zusammenfassung der Analyse auf Deutsch, 2-3 Sätze>",
  "risk_level": "<low|medium|high>",
  "diversification_score": <1-10 als Zahl>,
  "context": "<Aktueller Marktkontext>",
  "strengths": ["<Stärke 1>", "<Stärke 2>", "<Stärke 3>"],
  "considerations": ["<Schwäche/Risiko 1>", "<Schwäche/Risiko 2>", "<Schwäche/Risiko 3>"],
  "gaps": ["<Fehlende Asset-Klasse oder Region 1>", "<Lücke 2>"],
  "riskMetrics": {
    "volatility": <Geschätzte annualisierte Volatilität in Prozent>,
    "sharpeRatio": <Geschätzte Sharpe Ratio>,
    "maxDrawdown": <Geschätzter Max Drawdown als negative Zahl in Prozent>,
    "valueAtRisk": <Geschätzter täglicher VaR bei 95% als negative Zahl in Euro>,
    "beta": <Geschätztes Beta zum MSCI World>,
    "trackingError": <Geschätzter Tracking Error in Prozent>,
    "sortinoRatio": <Geschätzte Sortino Ratio>,
    "informationRatio": <Geschätzte Information Ratio>
  },
  "holdings": [
    {
      "name": "<Vollständiger Name der Position>",
      "ticker": "<Ticker-Symbol>",
      "isin": "<ISIN wenn bekannt, sonst leer>",
      "weight": <Gewichtung in Prozent als Zahl, alle holdings zusammen = 100>,
      "decision": "<Kaufen|Halten|Verkaufen>",
      "reason": "<Begründung auf Deutsch, 1-2 Sätze>",
      "currentPrice": "<Geschätzter aktueller Preis mit €>",
      "trend": "<Hoch|Stabil|Stabil aufwärts|Runter>",
      "ter": <TER als Dezimalzahl, 0 bei Einzelaktien>,
      "assetClass": "<z.B. Aktien USA / Tech, Aktien Europa / Auto, ETF Welt>",
      "dailyChange": <Tagesänderung in Prozent als Zahl>,
      "totalReturn": <Geschätzte Gesamtrendite YTD in Prozent>,
      "value": <Geschätzter Wert dieser Position in Euro als Zahl>
    }
  ],
  "sectors": [{"name": "<Sektor auf Deutsch>", "value": <Prozent als Zahl>}],
  "regions": [{"name": "<Region auf Deutsch>", "value": <Prozent als Zahl>}],
  "performance_history": [],
  "news": [
    {
      "title": "<Relevante aktuelle Nachricht für dieses Portfolio>",
      "source": "<Quelle z.B. Reuters, Bloomberg, Handelsblatt>",
      "snippet": "<Kurzbeschreibung auf Deutsch>",
      "importance": "<hoch|mittel|niedrig>",
      "impact_emoji": "<Passendes Emoji>"
    }
  ],
  "nextSteps": [
    {
      "action": "<Konkrete Maßnahme auf Deutsch>",
      "description": "<Detaillierte Beschreibung was zu tun ist>"
    }
  ],
  "health_factors": {
    "div": <Diversifikations-Score 1-10>,
    "cost": <Kosten-Effizienz-Score 1-10>,
    "risk": <Risiko-Balance-Score 1-10>
  },
  "savings": <Geschätztes jährliches Sparpotenzial in Euro als Zahl>
}

Schätze realistische Werte basierend auf aktuellen Marktdaten. Alle Texte auf Deutsch.
Wenn der Nutzer nur Aktiennamen oder Ticker nennt, nimm gleiche Gewichtung an und schätze Werte basierend auf typischen Investmentbeträgen (z.B. 10.000-50.000€ Gesamtportfolio).`;

export const analyzePortfolio = async (input: { text?: string, fileBase64?: string, fileType?: string }) => {
  const parts: any[] = [
    { text: ANALYSIS_SYSTEM_PROMPT },
    { text: `\n\nDepot-Eingabe des Nutzers: ${input.text || "Keine Angabe"}` }
  ];

  if (input.fileBase64) {
    const data = input.fileBase64.includes(',') ? input.fileBase64.split(',')[1] : input.fileBase64;
    parts.push({ inlineData: { mimeType: input.fileType || 'image/jpeg', data } });
  }

  const result = await callProxy('analysis', {
    contents: [{ parts }],
    config: { responseMimeType: "application/json", temperature: 0.2 }
  });

  const text = result.text || '';
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned);
};

export const getFinancialAdvice = async (message: string, history: any[]) => {
  const mappedHistory = history.map(h => ({
    ...h,
    role: h.role === 'assistant' ? 'model' : h.role
  }));

  const result = await callProxy('chat', {
    contents: [
      ...mappedHistory.slice(-4),
      { role: 'user', parts: [{ text: `Beantworte diese Frage zu Finanzen/Depot auf Deutsch, kurz und präzise: ${message}` }] }
    ],
    config: { maxOutputTokens: 500, temperature: 0.7 }
  });
  return result.text;
};

export const analyzeNewsImpact = async (news: any, holdings: any[]) => {
  const holdingNames = holdings.map(h => h.name).join(', ');
  const result = await callProxy('news', {
    contents: [{
      parts: [{
        text: `Analysiere den Impact der Nachricht "${news.title}" auf diese Portfolio-Positionen: ${holdingNames}.
Antworte NUR als JSON: {"relevance":"high|medium|low","impact_summary":"...","context":"...","perspectives":{"bullish":"...","bearish":"..."},"affected_holdings":[{"ticker":"...","your_exposure":"..."}],"educational_note":"..."}`
      }]
    }],
    config: { responseMimeType: "application/json" }
  });
  const text = result.text || '';
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned);
};

export const compareETFs = async (isins: string[]) => {
  const result = await callProxy('analysis', {
    contents: [{ parts: [{ text: `Vergleiche diese ETFs basierend auf ISINs: ${isins.join(', ')}. Gib die Antwort als JSON im Format der Schnittstelle ETFComparison zurück.` }] }],
    config: { responseMimeType: "application/json" }
  });
  const text = result.text || '';
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned);
};

export const explainStrategy = async (name: string) => {
  const result = await callProxy('chat', {
    contents: [{ parts: [{ text: `Erkläre die Anlagestrategie "${name}" detailliert auf Deutsch. Gib die Antwort als JSON: {"strategy_name":"...","description":"...","typical_allocation":{"Aktien":"60%","Anleihen":"40%"},"common_reasons":["..."],"considerations":["..."],"historical_context":"...","alternatives":["..."]}` }] }],
    config: { responseMimeType: "application/json" }
  });
  const text = result.text || '';
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned);
};

export const generatePortfolioSuggestion = async (data: any) => {
  const result = await callProxy('analysis', {
    contents: [{ parts: [{ text: `Erstelle einen personalisierten Portfolio-Vorschlag basierend auf: ${JSON.stringify(data)}. Gib die Antwort als JSON im Format der Schnittstelle PortfolioAnalysisReport zurück.` }] }],
    config: { responseMimeType: "application/json" }
  });
  const text = result.text || '';
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned);
};
