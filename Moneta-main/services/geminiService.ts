
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
  const contents: any[] = [{
    parts: [{ text: PORTFOLIO_ANALYSIS_SCHEMA + "\n\nHier ist das zu analysierende Depot:\n" + (input.text || "Bitte analysiere ein allgemeines Beispiel-Depot.") }]
  }];
  if (input.fileBase64) {
    const data = input.fileBase64.includes(',') ? input.fileBase64.split(',')[1] : input.fileBase64;
    contents[0].parts.push({ inlineData: { mimeType: input.fileType || 'image/jpeg', data } });
  }

  const result = await callProxy('analysis', {
    contents,
    config: { responseMimeType: "application/json", temperature: 0.2 }
  });

  let parsed;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    // Try to extract JSON from the response if wrapped in markdown
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('PARSE_ERROR:Die KI-Antwort konnte nicht verarbeitet werden. Bitte versuche es erneut.');
    }
  }

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
    ...h,
    role: h.role === 'assistant' ? 'model' : h.role
  }));

  const systemPrompt = "Du bist Moneta, ein freundlicher und kompetenter KI-Finanzberater. Antworte auf Deutsch. " +
    "Gib hilfreiche, verständliche Finanzberatung. Weise bei konkreten Anlageempfehlungen immer darauf hin, " +
    "dass dies keine professionelle Anlageberatung ist. Halte Antworten kurz und prägnant (max 3-4 Absätze).";

  const result = await callProxy('chat', {
    contents: [
      ...mappedHistory.slice(-4),
      { role: 'user', parts: [{ text: systemPrompt + "\n\nNutzer-Frage: " + message }] }
    ],
    config: { maxOutputTokens: 800, temperature: 0.7 }
  });
  return result.text;
};

const NEWS_IMPACT_SCHEMA = `
Analysiere den Impact dieser Nachricht auf das Portfolio. Antworte NUR mit validem JSON:
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
`;

export const analyzeNewsImpact = async (news: any, holdings: any[]) => {
  const holdingNames = holdings.map(h => h.name).join(', ');
  const result = await callProxy('news', {
    contents: [{ parts: [{
      text: NEWS_IMPACT_SCHEMA +
        `\n\nNachricht: "${news.title}" - ${news.snippet}\n` +
        `Portfolio-Holdings: ${holdingNames}`
    }] }],
    config: { responseMimeType: "application/json", temperature: 0.2 }
  });

  let parsed;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  }

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

  const result = await callProxy('analysis', {
    contents: [{ parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json", temperature: 0.2 }
  });

  let parsed;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { etfs: [], comparison_summary: 'Vergleich fehlgeschlagen.' };
  }
  return parsed;
};

export const explainStrategy = async (name: string) => {
  const prompt = `Erkläre die Anlagestrategie "${name}" detailliert. Antworte NUR mit validem JSON:
{
  "strategy_name": "${name}",
  "description": "Beschreibung",
  "typical_allocation": { "Aktien": "60%", "Anleihen": "30%", "Sonstige": "10%" },
  "common_reasons": ["Grund 1"],
  "considerations": ["Bedenken 1"],
  "historical_context": "Historischer Kontext",
  "alternatives": ["Alternative 1"]
}`;

  const result = await callProxy('chat', {
    contents: [{ parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json", temperature: 0.3 }
  });

  let parsed;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { strategy_name: name, description: 'Erklärung nicht verfügbar.' };
  }
  return parsed;
};

export const generatePortfolioSuggestion = async (data: any) => {
  const prompt = PORTFOLIO_ANALYSIS_SCHEMA +
    `\n\nErstelle einen personalisierten Portfolio-Vorschlag basierend auf diesen Präferenzen:\n` +
    `Ziel: ${data.goal || 'Vermögensaufbau'}\n` +
    `Risikotoleranz: ${data.riskTolerance || 'balanced'}\n` +
    `Monatlicher Betrag: ${data.monthlyAmount || '500'}€\n` +
    `Anlagehorizont: ${data.timeHorizon || '10'} Jahre\n` +
    `Erstelle ein konkretes ETF/Aktien-Portfolio mit realen Wertpapieren.`;

  const result = await callProxy('analysis', {
    contents: [{ parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json", temperature: 0.3 }
  });

  let parsed;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  }
  return parsed;
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
    const result = await callProxy('news', {
      contents: [{ parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json", temperature: 0.4 }
    });

    let parsed;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      const jsonMatch = result.text.match(/\[[\s\S]*\]/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    }
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

  const result = await callProxy('chat', {
    contents: [{ parts: [{ text: prompt }] }],
    config: { maxOutputTokens: 1500, temperature: 0.5 }
  });
  return result.text;
};
