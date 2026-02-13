import { PortfolioAnalysisReport, PortfolioHealthReport, PortfolioSavingsReport } from './types';

function generatePerformanceHistory(): { date: string; portfolio: number; benchmark: number }[] {
  const data: { date: string; portfolio: number; benchmark: number }[] = [];
  let portfolio = 100;
  let benchmark = 100;
  const now = new Date();

  for (let i = 365; i >= 0; i -= 7) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    portfolio += (Math.random() - 0.42) * 2.5;
    benchmark += (Math.random() - 0.44) * 2.2;

    data.push({
      date: dateStr,
      portfolio: Math.round(portfolio * 100) / 100,
      benchmark: Math.round(benchmark * 100) / 100,
    });
  }
  return data;
}

export const DEMO_REPORT: PortfolioAnalysisReport = {
  totalValue: 127450,
  totalDailyChange: 342.80,
  totalDailyChangePercent: 0.27,
  weightedTER: 0.18,
  score: 74,
  summary: "Ihr Portfolio zeigt eine solide Grundstruktur mit Schwerpunkt auf globale Industrieländer-Aktien. Die Diversifikation über Regionen ist ausbaufähig – Schwellenländer und Anleihen sind untergewichtet. Die Kostenstruktur ist mit einem gewichteten TER von 0,18% wettbewerbsfähig. Die aktuelle Übergewichtung von US-Tech birgt Klumpenrisiken, die durch breitere Streuung gemindert werden könnten.",
  risk_level: 'medium',
  diversification_score: 6.5,
  context: "Analyse basierend auf aktuellen Marktdaten und KI-gestützter Bewertung.",
  strengths: [
    "Niedrige Gesamtkostenquote (TER Ø 0,18%) spart langfristig erhebliche Gebühren",
    "Breite Marktabdeckung durch MSCI World als Kernposition",
    "Solide Blue-Chip-Positionen (Apple, Allianz) mit starkem Cashflow",
    "Gute Balance zwischen Wachstum (Tech) und Stabilität (Versicherung)"
  ],
  considerations: [
    "US-Übergewichtung bei ~68% – Währungsrisiko und regionale Konzentration beachten",
    "Fehlende Schwellenländer-Allokation limitiert Wachstumspotenzial",
    "Kein Anleihen-Anteil – in Abschwungphasen fehlt die Absicherung",
    "Einzelaktien-Anteil (32%) erhöht das spezifische Risiko gegenüber reinem ETF-Portfolio"
  ],
  gaps: [
    "Schwellenländer (Emerging Markets) nicht vertreten – Empfehlung: 10-15% Allokation",
    "Anleihen/Bonds fehlen komplett – für mittleres Risikoprofil 20-30% empfohlen",
    "Immobilien-REITs könnten als Inflationsschutz und Diversifikator dienen",
    "Rohstoffe/Commodities als zusätzlicher Krisenschutz nicht vorhanden"
  ],
  riskMetrics: {
    volatility: 14.8,
    sharpeRatio: 1.12,
    maxDrawdown: -18.3,
    valueAtRisk: -4250,
    beta: 1.05,
    trackingError: 2.1,
    sortinoRatio: 1.45,
    informationRatio: 0.38,
  },
  holdings: [
    {
      name: "iShares Core MSCI World UCITS ETF",
      ticker: "EUNL",
      isin: "IE00B4L5Y983",
      weight: 40,
      decision: "Halten",
      reason: "Kernbaustein mit breiter Streuung über 1.500+ Unternehmen aus 23 Industrieländern. Niedrige TER und hohe Liquidität. Langfristig halten als Basisposition.",
      currentPrice: "85,42€",
      trend: "Stabil aufwärts",
      ter: 0.20,
      assetClass: "Aktien Welt",
      dailyChange: 0.34,
      totalReturn: 12.8,
      value: 50980,
    },
    {
      name: "iShares Core S&P 500 UCITS ETF",
      ticker: "SXR8",
      isin: "IE00B5BMR087",
      weight: 25,
      decision: "Halten",
      reason: "Starke Performance der US-Märkte getrieben durch Tech-Sektor. Sehr niedrige TER. Allerdings erhöht diese Position die US-Übergewichtung – bei Rebalancing prüfen.",
      currentPrice: "512,30€",
      trend: "Hoch",
      ter: 0.07,
      assetClass: "Aktien USA",
      dailyChange: 0.52,
      totalReturn: 22.4,
      value: 31862,
    },
    {
      name: "Apple Inc.",
      ticker: "AAPL",
      isin: "US0378331005",
      weight: 15,
      decision: "Halten",
      reason: "Starkes Ökosystem und Service-Revenue wächst. KGV bei 28x – fair bewertet. Position nicht weiter aufstocken wegen Klumpenrisiko im Tech-Sektor.",
      currentPrice: "198,50€",
      trend: "Hoch",
      assetClass: "Aktien USA / Tech",
      dailyChange: -0.18,
      totalReturn: 15.2,
      value: 19117,
    },
    {
      name: "Allianz SE",
      ticker: "ALV",
      isin: "DE0008404005",
      weight: 12,
      decision: "Kaufen",
      reason: "Unterbewertet vs. Sektor-Peers. Dividendenrendite >5% bietet stabilen Cashflow. Starke Solvenzquote. Guter Hedge gegen Tech-Korrektur.",
      currentPrice: "267,80€",
      trend: "Stabil aufwärts",
      assetClass: "Aktien Europa / Versicherung",
      dailyChange: 0.22,
      totalReturn: 8.5,
      value: 15294,
    },
    {
      name: "Mercedes-Benz Group AG",
      ticker: "MBG",
      isin: "DE0007100000",
      weight: 8,
      decision: "Verkaufen",
      reason: "Zunehmender Wettbewerb durch chinesische EV-Hersteller. Margendruck im Volumensegment. Dividende attraktiv, aber Kursrisiko überwiegt. Erlöse in EM-ETF umschichten.",
      currentPrice: "64,20€",
      trend: "Runter",
      assetClass: "Aktien Europa / Auto",
      dailyChange: -1.25,
      totalReturn: -6.3,
      value: 10196,
    },
  ],
  sectors: [
    { name: "Technologie", value: 35 },
    { name: "Finanzwesen", value: 20 },
    { name: "Gesundheit", value: 15 },
    { name: "Industrie", value: 12 },
    { name: "Automobil", value: 10 },
    { name: "Sonstige", value: 8 },
  ],
  regions: [
    { name: "Nordamerika", value: 55 },
    { name: "Europa", value: 28 },
    { name: "Asien-Pazifik", value: 12 },
    { name: "Schwellenländer", value: 3 },
    { name: "Sonstige", value: 2 },
  ],
  performance_history: generatePerformanceHistory(),
  news: [
    {
      title: "Fed signalisiert Zinspause – Märkte reagieren positiv",
      source: "Reuters",
      snippet: "Die US-Notenbank deutet an, die Leitzinsen vorerst stabil zu halten. Aktien- und Anleihenmärkte reagieren mit moderaten Kursgewinnen.",
      importance: "hoch",
      impact_emoji: "📈",
    },
    {
      title: "Apple meldet Rekord-Quartal bei Services-Umsatz",
      source: "Bloomberg",
      snippet: "Der Services-Bereich von Apple übertrifft die Erwartungen mit +18% YoY. Die Marge im Servicegeschäft liegt bei über 70%.",
      importance: "hoch",
      impact_emoji: "🍎",
    },
    {
      title: "EU verschärft CO₂-Vorgaben für Autoindustrie ab 2027",
      source: "Handelsblatt",
      snippet: "Strengere Emissionsziele könnten die Margen europäischer Autobauer weiter unter Druck setzen. Elektrifizierung muss beschleunigt werden.",
      importance: "mittel",
      impact_emoji: "🚗",
    },
    {
      title: "MSCI World Index erreicht neues Allzeithoch",
      source: "Financial Times",
      snippet: "Der breite Weltindex profitiert von starken US-Quartalszahlen und nachlassendem Inflationsdruck in Europa.",
      importance: "mittel",
      impact_emoji: "🌍",
    },
    {
      title: "Allianz erhöht Dividende um 8% – stärker als erwartet",
      source: "FAZ",
      snippet: "Der Versicherungskonzern hebt die Ausschüttung auf 13,80€ je Aktie an und kündigt ein neues Aktienrückkaufprogramm an.",
      importance: "hoch",
      impact_emoji: "💰",
    },
  ],
  nextSteps: [
    {
      action: "Schwellenländer-ETF aufbauen",
      description: "10-15% des Portfolios in einen EM-ETF (z.B. Xtrackers MSCI EM) umschichten, um regionale Diversifikation zu verbessern und vom Wachstum in Asien zu profitieren.",
    },
    {
      action: "Mercedes-Position reduzieren",
      description: "Erlöse aus Mercedes (8% Gewichtung) nutzen, um Schwellenländer-Position und Anleihen-Anteil aufzubauen. Timing: bei nächster Erholung über 66€.",
    },
    {
      action: "Anleihen-Komponente hinzufügen",
      description: "15-20% in einen globalen Anleihen-ETF (z.B. Vanguard Global Aggregate Bond) investieren, um das Risiko in Abschwungphasen zu reduzieren.",
    },
    {
      action: "Quartalsweises Rebalancing einrichten",
      description: "Alle 3 Monate die Gewichtungen überprüfen und bei >5% Abweichung vom Ziel automatisch zurücksetzen, um Risikodrift zu vermeiden.",
    },
  ],
};

export const DEMO_HEALTH: PortfolioHealthReport = {
  health_score: 7,
  status: "Stabil – Optimierungspotenzial",
  color: "blue",
  summary: "Ihr Portfolio hat eine solide Grundstruktur, profitiert von niedrigen Kosten und breiter Marktabdeckung. Verbesserungspotenzial besteht bei der regionalen Diversifikation und dem fehlenden Anleihen-Anteil.",
  factors: {
    diversification: { score: 6, note: "Gute Branchenstreuung, aber regionale Konzentration auf USA/Europa. Schwellenländer und Alternative Assets unterrepräsentiert." },
    cost_efficiency: { score: 9, note: "Gewichtete TER von 0,18% ist deutlich unter dem Branchendurchschnitt von 0,45%. Einsparpotenzial bei Einzelaktien-Transaktionskosten." },
    risk_balance: { score: 7, note: "Moderates Risikoprofil durch ETF-Kern, aber Einzelaktien und fehlende Anleihen erhöhen die Volatilität in Stressphasen." },
    allocation_drift: { score: 7, note: "Aktuelle Gewichtungen weichen leicht vom Zielportfolio ab. Quartalsweises Rebalancing empfohlen." },
  },
  top_strength: "Exzellente Kostenstruktur mit Ø 0,18% TER – spart über 10 Jahre ca. 3.400€ gegenüber Durchschnittsfonds",
  top_consideration: "US-Übergewichtung von 68% birgt Klumpenrisiko – Zielallokation liegt bei max. 55%",
};

export const DEMO_SAVINGS: PortfolioSavingsReport = {
  current_annual_costs: "229,41€",
  optimized_annual_costs: "152,94€",
  potential_savings: "76,47€",
  savings_percentage: "33%",
  breakdown: [
    {
      current_etf: "iShares Core MSCI World",
      current_ter: "0,20%",
      alternative: "Amundi Prime Global",
      alternative_ter: "0,05%",
      annual_saving: "76,47€",
      your_amount: "50.980€",
    },
    {
      current_etf: "Allianz SE (Einzelaktie)",
      current_ter: "0,00%",
      alternative: "–",
      alternative_ter: "–",
      annual_saving: "0€",
      your_amount: "15.294€",
    },
    {
      current_etf: "iShares Core S&P 500",
      current_ter: "0,07%",
      alternative: "Invesco S&P 500 (Swap)",
      alternative_ter: "0,05%",
      annual_saving: "6,37€",
      your_amount: "31.862€",
    },
  ],
  explanation: "Die größte Einsparmöglichkeit liegt beim MSCI World ETF – ein Wechsel auf den Amundi Prime Global (TER 0,05%) spart bei Ihrem Volumen ca. 76€ pro Jahr. Über 20 Jahre mit Zinseszins ergibt das ca. 2.100€ Mehrrendite.",
  considerations: [
    "Beim Wechsel Spread-Kosten und mögliche Steuern auf realisierte Gewinne beachten",
    "Amundi Prime Global hat kleineres Fondsvolumen – Liquiditätsrisiko prüfen",
    "Transaktionskosten des Brokers beim Umschichten einkalkulieren",
  ],
};
