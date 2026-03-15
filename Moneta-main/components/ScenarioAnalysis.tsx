import React, { useState } from 'react';
import { FlaskConical, Loader2, AlertTriangle, ChevronRight, BarChart3, History, Sparkles, Flame, Percent, Info } from 'lucide-react';
import { analyzeScenario } from '../services/geminiService';
import { ScenarioResult, HoldingRow, PortfolioAnalysisReport } from '../types';
import { PLAN_LIMITS } from '../lib/useSubscription';

interface ScenarioAnalysisProps {
  holdings: HoldingRow[];
  report: PortfolioAnalysisReport | null;
  isPremium: boolean;
}

// ── Regelbasierte Szenario-Engine (Free-Tier, kein KI-Aufruf) ─────────────────

type AssetClass = 'tech' | 'growth_etf' | 'broad_etf' | 'energy' | 'financials' | 'defensive' | 'european' | 'general';

/** Historische Sektor-Impacts in % pro Szenario (Quelle: Bloomberg/Morningstar-Daten). */
const SCENARIO_IMPACTS: Record<string, Record<AssetClass, number>> = {
  market_crash_30:     { tech: -35, growth_etf: -35, broad_etf: -30, energy: -22, financials: -32, defensive: -15, european: -27, general: -30 },
  rate_hike_3:         { tech: -22, growth_etf: -20, broad_etf: -12, energy:  +8, financials: +12, defensive:  -5, european: -10, general: -12 },
  inflation_surge:     { tech: -18, growth_etf: -15, broad_etf:  -8, energy: +28, financials:  +5, defensive:  +3, european:  -5, general:  -8 },
  tech_selloff:        { tech: -40, growth_etf: -35, broad_etf: -15, energy:  +5, financials:  +3, defensive:  +2, european:  -8, general: -12 },
  recession:           { tech: -25, growth_etf: -25, broad_etf: -20, energy: -15, financials: -28, defensive:  -5, european: -20, general: -20 },
  geopolitical_crisis: { tech: -15, growth_etf: -12, broad_etf: -10, energy: +30, financials:  -8, defensive:  +5, european: -12, general: -10 },
};

const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  tech: 'Technologie', growth_etf: 'Wachstums-ETF', broad_etf: 'Welt-ETF',
  energy: 'Energie/Rohstoff', financials: 'Finanzen', defensive: 'Defensiv',
  european: 'Europ. Aktie', general: 'Allgemein',
};

const SCENARIO_EXPLANATIONS: Record<string, string> = {
  market_crash_30:     'Breite Marktkorrekturen führen historisch zu gleichmäßigen Verlusten. Tech und Wachstumswerte fallen überproportional, Defensivwerte (Pharma, Konsumgüter) halten sich besser.',
  rate_hike_3:         'Zinssteigerungen belasten Wachstumsaktien durch höhere Diskontierungssätze. Finanzwerte profitieren von steigenden Zinsmargen, Anleihen-Substitute wie REITs leiden.',
  inflation_surge:     'Hohe Inflation begünstigt Rohstoff- und Energiewerte als Realwertschutz. Wachstumsunternehmen mit fernen Cashflows verlieren durch steigende Realzinsen.',
  tech_selloff:        'Sektorspezifische Korrekturen treffen Tech-ETFs und Einzelwerte hart. Defensive Sektoren und Energie sind relative Outperformer in dieser Phase.',
  recession:           'Rezessionen belasten Finanztitel und Zykliker stärker als Konsumgüter oder Pharma. Breit diversifizierte Portfolios dämpfen den Effekt spürbar.',
  geopolitical_crisis: 'Geopolitische Schocks treiben Energiepreise und Rüstungswerte. Globale Wachstumswerte leiden unter Risikoaversion, Rohstoffproduzenten profitieren.',
};

const SCENARIO_HISTORICAL: Record<string, string> = {
  market_crash_30:     'Vergleichbar: Finanzkrise 2008/09 (S&P 500 -56%), COVID-Crash 2020 (-34% in 33 Tagen). Erholung nach COVID binnen 5 Monaten, nach 2008 dauerte es 4 Jahre.',
  rate_hike_3:         'Vergleichbar: 2022 – größter EZB/Fed-Straffungszyklus seit 40 Jahren (+4,5 % in 12 Monaten). Nasdaq -33%, 10-j. US-Treasuries -18%.',
  inflation_surge:     'Vergleichbar: 1970er Stagflation (US-Inflation peak 14,8 % in 1980). Energieaktien +500 % im Jahrzehnt, reale Aktienrenditen hingegen negativ.',
  tech_selloff:        'Vergleichbar: Dotcom-Blase 2000–2002 (Nasdaq -78%). Qualitätswerte erholten sich bis 2007; viele spekulativen Dotcoms verschwanden dauerhaft.',
  recession:           'Vergleichbar: 2001 (milde US-Rezession), 2008/09 (schwere globale Rezession). Historisch dauern US-Rezessionen ca. 11 Monate.',
  geopolitical_crisis: 'Vergleichbar: Russland-Ukraine-Krieg 2022 – Rohöl +60 % in 3 Monaten, europ. Aktien -20 %, Erholung diversifizierter Portfolios binnen 12 Monaten.',
};

const TECH_TICKERS = new Set(['AAPL','MSFT','NVDA','GOOGL','GOOG','META','AMZN','TSLA','NFLX','ADBE','CRM','NOW','SHOP','UBER','PYPL','COIN','SNOW','PLTR','AMD','INTC','QCOM','AVGO','ORCL','CSCO','SAP','ASML','BABA','JD','SE','GRAB','DELL','HPE','ACN','INFY','WIT']);
const BROAD_ETF_TICKERS = new Set(['EUNL','IWDA','VWRL','VWCE','SXR8','CSPX','VUSA','VUAA','ISAC','SPYI','SWRD','LCUW','FWRG','HMWO','LGGG','AWORLD','SPPW','SSAC','WEBG']);
const GROWTH_ETF_TICKERS = new Set(['EQQQ','QQQ','QQQS','CNDX','IUIT','SXRP','TQQQ','XNAS','CNXT']);
const ENERGY_TICKERS = new Set(['XOM','CVX','BP','SHEL','TTE','ENI','RIO','BHP','FCX','COP','OXY','SLB','PSX','MPC','VLO','KMI','WMB','DVN','HAL']);
const FINANCIAL_TICKERS = new Set(['JPM','BAC','GS','MS','C','WFC','V','MA','AXP','DBK','CBK','BNP','SAN','ING','UBS','BARC','HSBA','AIG','MET','BRK']);
const DEFENSIVE_TICKERS = new Set(['JNJ','PG','KO','PEP','MCD','WMT','COST','UNH','AZN','NVO','LLY','PFE','MRK','ABBV','NEE','DUK','SO','GIS','CPB','CL','EL','BMY','AMGN','GILD']);

function classifyTicker(ticker: string): AssetClass {
  const base = ticker.toUpperCase().split('.')[0];
  if (TECH_TICKERS.has(base))       return 'tech';
  if (BROAD_ETF_TICKERS.has(base))  return 'broad_etf';
  if (GROWTH_ETF_TICKERS.has(base)) return 'growth_etf';
  if (ENERGY_TICKERS.has(base))     return 'energy';
  if (FINANCIAL_TICKERS.has(base))  return 'financials';
  if (DEFENSIVE_TICKERS.has(base))  return 'defensive';
  if (ticker.includes('.DE') || ticker.includes('.PA') || ticker.includes('.AS') ||
      ticker.includes('.MI') || ticker.includes('.MC') || ticker.includes('.L'))  return 'european';
  return 'general';
}

function computeLocalScenario(
  scenario: PredefinedScenario,
  holdings: { name: string; ticker: string; weight: number }[],
): ScenarioResult {
  const impacts = SCENARIO_IMPACTS[scenario.id];
  let portfolioImpact = 0;

  const affectedHoldings = holdings.map((h) => {
    const cls = classifyTicker(h.ticker);
    const pct = impacts ? (impacts[cls] ?? impacts.general) : -20;
    portfolioImpact += (pct * h.weight) / 100;
    return {
      ticker: h.ticker,
      name: h.name,
      impact: `${pct > 0 ? '+' : ''}${pct}% · ${ASSET_CLASS_LABELS[cls]}`,
    };
  });

  const rounded = Math.round(portfolioImpact * 10) / 10;
  return {
    scenario: scenario.name,
    description: scenario.description,
    impactPercent: rounded,
    estimatedImpact: `Regelbasierte Schätzung auf Basis historischer Sektorbetas: ${rounded > 0 ? '+' : ''}${rounded}%. Keine KI – Werte dienen der Orientierung.`,
    affectedHoldings,
    explanation: SCENARIO_EXPLANATIONS[scenario.id] ?? '',
    historicalComparison: SCENARIO_HISTORICAL[scenario.id] ?? '',
  };
}

interface PredefinedScenario {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'Krise' | 'Makro' | 'Sektor' | 'Geopolitik';
  color: string;
}

const SCENARIOS: PredefinedScenario[] = [
  {
    id: 'market_crash_30',
    name: 'Marktkorrektur -30%',
    description: 'Breiter Markteinbruch von 30 % analog zu historischen Bärenmärkten (z. B. 2008/09, COVID-2020)',
    icon: '📉',
    category: 'Krise',
    color: 'rose',
  },
  {
    id: 'rate_hike_3',
    name: 'Zinsanstieg +3%',
    description: 'Schneller Anstieg der Leitzinsen um 3 Prozentpunkte – Auswirkungen auf Anleihen, Wachstumsaktien und REITs',
    icon: '📈',
    category: 'Makro',
    color: 'amber',
  },
  {
    id: 'inflation_surge',
    name: 'Inflationsschock',
    description: 'Anhaltende Inflation über 8 % – historische Auswirkungen auf Realrenditen und Sektorrotation',
    icon: '🔥',
    category: 'Makro',
    color: 'orange',
  },
  {
    id: 'tech_selloff',
    name: 'Tech-Selloff -40%',
    description: 'Massive Korrektur im Technologiesektor – vergleichbar mit Dotcom-Blase 2000–2002',
    icon: '💻',
    category: 'Sektor',
    color: 'purple',
  },
  {
    id: 'recession',
    name: 'Rezession (2 Quartale)',
    description: 'Zwei aufeinanderfolgende Quartale mit negativem BIP-Wachstum – historische Auswirkungen auf zyklische Sektoren',
    icon: '🏭',
    category: 'Makro',
    color: 'slate',
  },
  {
    id: 'geopolitical_crisis',
    name: 'Geopolitische Krise',
    description: 'Eskalation geopolitischer Spannungen – Auswirkungen auf Energie, Rohstoffe und Verteidigung',
    icon: '🌍',
    category: 'Geopolitik',
    color: 'blue',
  },
];

const categoryColors: Record<string, string> = {
  Krise: 'bg-rose-50 text-rose-600 border-rose-100',
  Makro: 'bg-amber-50 text-amber-600 border-amber-100',
  Sektor: 'bg-purple-50 text-purple-600 border-purple-100',
  Geopolitik: 'bg-blue-50 text-blue-600 border-blue-100',
};

// ── Slider helper ─────────────────────────────────────────────────────────────

const SliderField = ({
  label,
  icon: Icon,
  value,
  min,
  max,
  step,
  unit,
  color,
  formatValue,
  onChange,
}: {
  label: string;
  icon: React.ElementType;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  color: string;
  formatValue?: (v: number) => string;
  onChange: (v: number) => void;
}) => {
  const pct = ((value - min) / (max - min)) * 100;
  const display = formatValue ? formatValue(value) : `${value > 0 ? '+' : ''}${value}${unit}`;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${color}`} />
          <span className="text-sm font-black text-slate-800">{label}</span>
        </div>
        <span className={`text-lg font-black tabular-nums ${color}`}>{display}</span>
      </div>
      <div className="relative h-2 bg-slate-100 rounded-full">
        <div
          className="absolute h-2 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-600 rounded-full shadow-sm transition-all pointer-events-none"
          style={{ left: `calc(${pct}% - 8px)` }}
        />
      </div>
      <div className="flex justify-between text-[9px] font-bold text-slate-400">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
};

// ── Hauptkomponente ───────────────────────────────────────────────────────────

const ScenarioAnalysis: React.FC<ScenarioAnalysisProps> = ({ holdings, report, isPremium }) => {
  const [selectedScenario, setSelectedScenario] = useState<PredefinedScenario | null>(null);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Makro-Szenario-Regler
  const [inflation, setInflation] = useState(3);
  const [interestRate, setInterestRate] = useState(2);

  const scenarioLimit = isPremium
    ? PLAN_LIMITS.premium.maxScenarioHoldings
    : PLAN_LIMITS.free.maxScenarioHoldings;

  const allWithTicker = holdings.filter(h => h.ticker?.symbol);
  const rawHoldings = allWithTicker.map(h => ({
    name: h.ticker!.company_name ?? h.symbol,
    ticker: h.ticker!.symbol,
    weight: report?.holdings?.find(rh => rh.ticker === h.ticker!.symbol)?.weight ?? 0,
  }));

  // Free-User: Top N nach Gewichtung; Premium: alle
  const holdingsTrimmed = !isPremium && rawHoldings.length > scenarioLimit;
  const sortedHoldings = [...rawHoldings].sort((a, b) => b.weight - a.weight);
  const limitedHoldings = holdingsTrimmed
    ? sortedHoldings.slice(0, scenarioLimit)
    : sortedHoldings;

  const totalWeight = limitedHoldings.reduce((s, h) => s + h.weight, 0);
  const activeHoldings = totalWeight > 0
    ? limitedHoldings.map(h => ({ ...h, weight: Math.round((h.weight / totalWeight) * 100) }))
    : limitedHoldings.map(h => ({ ...h, weight: Math.round(100 / limitedHoldings.length) }));

  const runAnalysis = async (name: string, description: string, custom?: PredefinedScenario) => {
    if (activeHoldings.length === 0) return;
    setSelectedScenario(custom ?? null);
    setResult(null);
    setError(null);
    setIsLoading(true);
    try {
      // Free-User + vordefiniertes Szenario → lokale regelbasierte Berechnung (kein KI-Aufruf)
      if (!isPremium && custom) {
        const localResult = computeLocalScenario(custom, activeHoldings);
        setResult(localResult);
        setIsLoading(false);
        return;
      }
      // Premium oder custom Makro-Szenario → KI
      const data = await analyzeScenario(name, description, activeHoldings);
      setResult(data as ScenarioResult);
    } catch (e: any) {
      setError(
        e?.message?.includes(':')
          ? e.message.split(':').slice(1).join(':').trim()
          : 'Szenario-Analyse vorübergehend nicht verfügbar. Bitte erneut versuchen.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const runCustomScenario = () => {
    const inflLabel = inflation >= 8 ? 'Hohe Inflation' : inflation >= 4 ? 'Erhöhte Inflation' : 'Moderate Inflation';
    const rateLabel = interestRate >= 5 ? 'Hohe Zinsen' : interestRate >= 3 ? 'Mittlere Zinsen' : 'Niedrige Zinsen';
    const name = `${inflLabel} (${inflation > 0 ? '+' : ''}${inflation}%) & ${rateLabel} (${interestRate > 0 ? '+' : ''}${interestRate}%)`;
    const description =
      `Makroökonomisches Szenario mit einer Inflationsrate von ${inflation} % und einem Leitzins von ${interestRate} %. ` +
      `Historisch ähnliche Phasen: ${inflation >= 8 ? '1970er Stagflation, 2022 EZB-Zinsschock' : inflation >= 4 ? '2021–2022 Inflationsanstieg' : '2015–2019 Niedrigzinsphase'}. ` +
      `Analysiere, wie diese Kombination das vorliegende Depot beeinflusst – insbesondere Wachstumsaktien, Anleihen-Substitute, Dividendentitel und Rohstoff-Exposure.`;
    runAnalysis(name, description);
  };

  const runScenario = (scenario: PredefinedScenario) =>
    runAnalysis(scenario.name, scenario.description, scenario);

  const impactColor = (pct: number) => {
    if (pct <= -15) return 'text-rose-600';
    if (pct < 0) return 'text-amber-600';
    return 'text-emerald-600';
  };

  if (allWithTicker.length === 0) {
    return (
      <div className="rounded-2xl bg-gray-800/60 border border-gray-700 p-8 text-center">
        <div className="text-4xl mb-3">📊</div>
        <h3 className="text-lg font-semibold text-white mb-2">Depot-Daten werden geladen</h3>
        <p className="text-gray-400 text-sm max-w-sm mx-auto">
          Die Szenario-Analyse benötigt Depot-Positionen mit zugeordneten Ticker-Symbolen.
          Bitte stelle sicher, dass dein Depot Wertpapiere enthält und die Seite vollständig geladen ist.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-purple-950 p-8 md:p-12 rounded-[40px] text-white relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full -mr-16 -mt-16 blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <FlaskConical className="w-5 h-5 text-purple-400" />
            <span className="text-purple-400 font-black text-[10px] uppercase tracking-[0.3em]">Was wäre wenn</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-black mb-3 tracking-tighter">Szenario-Analyse</h2>
          <p className="text-slate-400 font-medium leading-relaxed text-sm max-w-xl">
            Wie hätten sich historische Marktszenarien auf dein Depot ausgewirkt? Stelle eigene Makro-Parameter ein oder wähle ein vordefiniertes Szenario – <span className="text-white font-bold">Investieren mit Durchblick.</span>
          </p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-100 p-4 rounded-[20px] flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
          <strong>Bildungshinweis:</strong> Szenario-Analysen basieren auf historischen Daten und KI-Modellen. Sie stellen keine Prognosen für zukünftige Marktentwicklungen dar und sind keine Anlageberatung.
        </p>
      </div>

      {/* Free-User: Holdings-Cap-Hinweis */}
      {holdingsTrimmed && (
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-[20px] flex items-start gap-3">
          <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-blue-700 font-medium leading-relaxed">
            <strong>Free-Analyse:</strong> Es werden die Top-{scenarioLimit} Positionen nach Gewichtung analysiert ({allWithTicker.length} im Depot). Für alle {allWithTicker.length} Positionen mit KI-Analyse → Premium.
          </p>
        </div>
      )}

      {activeHoldings.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-[28px] p-12 text-center shadow-sm">
          <FlaskConical className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Füge Aktien oder Watchlist-Positionen hinzu, um Szenarien zu analysieren.</p>
        </div>
      )}

      {activeHoldings.length > 0 && (
        <div className="space-y-6">

          {/* ── Makro-Regler ──────────────────────────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-[32px] p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 bg-blue-50 rounded-2xl flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight">Eigenes Makro-Szenario</h3>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">Stelle Inflation und Leitzins ein – die KI analysiert dein Depot dagegen</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-8">
              <SliderField
                label="Inflation"
                icon={Flame}
                value={inflation}
                min={0}
                max={20}
                step={0.5}
                unit="%"
                color={inflation >= 8 ? 'text-rose-600' : inflation >= 4 ? 'text-amber-600' : 'text-emerald-600'}
                onChange={setInflation}
              />
              <SliderField
                label="Leitzins (EZB / Fed)"
                icon={Percent}
                value={interestRate}
                min={0}
                max={10}
                step={0.25}
                unit="%"
                color={interestRate >= 5 ? 'text-rose-600' : interestRate >= 3 ? 'text-amber-600' : 'text-emerald-600'}
                onChange={setInterestRate}
              />
            </div>

            {/* Kontext-Badge */}
            <div className="flex flex-wrap gap-2 mb-6">
              {inflation >= 8 && (
                <span className="text-[9px] font-black bg-rose-50 text-rose-600 border border-rose-100 px-2.5 py-1 rounded-lg uppercase tracking-widest">Stagflations-Risiko</span>
              )}
              {inflation >= 4 && inflation < 8 && (
                <span className="text-[9px] font-black bg-amber-50 text-amber-600 border border-amber-100 px-2.5 py-1 rounded-lg uppercase tracking-widest">Inflationsdruck</span>
              )}
              {interestRate >= 5 && (
                <span className="text-[9px] font-black bg-rose-50 text-rose-600 border border-rose-100 px-2.5 py-1 rounded-lg uppercase tracking-widest">Restriktive Geldpolitik</span>
              )}
              {interestRate >= 3 && interestRate < 5 && (
                <span className="text-[9px] font-black bg-amber-50 text-amber-600 border border-amber-100 px-2.5 py-1 rounded-lg uppercase tracking-widest">Normalisierte Zinsen</span>
              )}
              {inflation < 4 && interestRate < 3 && (
                <span className="text-[9px] font-black bg-emerald-50 text-emerald-600 border border-emerald-100 px-2.5 py-1 rounded-lg uppercase tracking-widest">Expansives Umfeld</span>
              )}
            </div>

            <button
              onClick={runCustomScenario}
              disabled={isLoading}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2.5 shadow-lg shadow-blue-600/20 transition-all hover:shadow-blue-600/30 hover:-translate-y-0.5 active:translate-y-0"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Durchblick generieren
            </button>
          </div>

          {/* ── Grid: Schnellauswahl + Ergebnis ──────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

            {/* Quick-Szenarien */}
            <div className="lg:col-span-2 space-y-3">
              <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] mb-4">Schnell-Szenarien</h3>
              {SCENARIOS.map(scenario => (
                <button
                  key={scenario.id}
                  onClick={() => runScenario(scenario)}
                  disabled={isLoading}
                  className={`w-full text-left p-5 rounded-[20px] border transition-all hover:shadow-md disabled:opacity-60 ${
                    selectedScenario?.id === scenario.id
                      ? 'border-blue-300 bg-blue-50 shadow-md ring-1 ring-blue-200'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none mt-0.5">{scenario.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-black text-slate-900 text-sm">{scenario.name}</span>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg border uppercase tracking-widest ${categoryColors[scenario.category]}`}>
                          {scenario.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed font-medium line-clamp-2">{scenario.description}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-1" />
                  </div>
                </button>
              ))}
            </div>

            {/* Ergebnis-Panel */}
            <div className="lg:col-span-3">
              {isLoading && (
                <div className="bg-white border border-slate-200 rounded-[28px] p-16 flex flex-col items-center justify-center shadow-sm h-full min-h-[400px]">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
                  <p className="text-sm font-black text-slate-900 uppercase tracking-widest">KI analysiert historische Daten…</p>
                  <p className="text-[11px] text-slate-400 mt-2">Investieren mit Durchblick – Bitte kurz warten</p>
                </div>
              )}

              {error && !isLoading && !result && (
                <div className="bg-rose-50 border border-rose-100 rounded-[28px] p-8 text-rose-700 text-sm font-medium shadow-sm">
                  {error}
                </div>
              )}

              {!isLoading && !result && !error && (
                <div className="bg-white border border-slate-200 rounded-[28px] p-16 flex flex-col items-center justify-center shadow-sm h-full min-h-[400px] text-center">
                  <FlaskConical className="w-12 h-12 text-slate-200 mb-4" />
                  <p className="text-slate-400 font-medium text-sm">Stelle oben dein Makro-Szenario ein<br />oder wähle links eine Schnellauswahl.</p>
                </div>
              )}

              {!isLoading && result && (
                <div className="bg-white border border-slate-200 rounded-[28px] overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-3xl">{selectedScenario?.icon ?? '🔭'}</span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <h3 className="font-black text-slate-900 text-lg">{result.scenario}</h3>
                          {!isPremium && selectedScenario && (
                            <span className="text-[8px] font-black bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-lg uppercase tracking-widest">Basisanalyse</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium">{result.description}</p>
                      </div>
                    </div>
                    <div className="flex items-baseline gap-3">
                      <span className={`text-4xl font-black tracking-tighter ${impactColor(result.impactPercent)}`}>
                        {result.impactPercent > 0 ? '+' : ''}{result.impactPercent?.toFixed(1)}%
                      </span>
                      <span className="text-sm font-bold text-slate-400">geschätzter Portfolioeffekt (historisch)</span>
                    </div>
                    <p className="text-xs font-medium text-slate-600 mt-3 leading-relaxed">{result.estimatedImpact}</p>
                  </div>

                  <div className="p-6 space-y-6">
                    {result.affectedHoldings?.length > 0 && (
                      <div>
                        <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                          <BarChart3 className="w-4 h-4 text-blue-600" /> Betroffene Positionen
                        </h4>
                        <div className="space-y-2">
                          {result.affectedHoldings.map((h, i) => (
                            <div key={i} className="flex items-start gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                              <span className="text-[10px] font-mono font-black text-blue-600 bg-blue-50 border border-blue-100 px-2 py-1 rounded-lg shrink-0">{h.ticker}</span>
                              <div>
                                <p className="text-xs font-bold text-slate-800 mb-0.5">{h.name}</p>
                                <p className="text-[11px] text-slate-500 leading-relaxed">{h.impact}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] mb-3">Hintergrundinformation</h4>
                      <p className="text-[12px] text-slate-600 leading-relaxed font-medium">{result.explanation}</p>
                    </div>

                    {result.historicalComparison && (
                      <div className="bg-slate-900 text-white p-6 rounded-[20px] relative overflow-hidden">
                        <History className="absolute -bottom-4 -right-4 w-24 h-24 text-white/5" />
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2 flex items-center gap-2">
                          <History className="w-3.5 h-3.5" /> Historische Vergleiche
                        </h4>
                        <p className="text-sm font-medium leading-relaxed text-slate-300 relative z-10">{result.historicalComparison}</p>
                      </div>
                    )}

                    <p className="text-[10px] text-slate-400 italic border-t border-slate-100 pt-4">
                      Moneta – Investieren mit Durchblick. Diese Analyse dient ausschließlich der Finanzbildung. Sie stellt keine Anlageberatung dar und ist keine Prognose zukünftiger Marktentwicklungen.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScenarioAnalysis;
