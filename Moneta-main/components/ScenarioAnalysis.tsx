import React, { useState } from 'react';
import { FlaskConical, TrendingDown, TrendingUp, Loader2, AlertTriangle, ChevronRight, BarChart3, History } from 'lucide-react';
import { analyzeScenario, analyzeScenarioFallback } from '../services/geminiService';
import { ScenarioResult, HoldingRow, PortfolioAnalysisReport } from '../types';

interface ScenarioAnalysisProps {
  holdings: HoldingRow[];
  report: PortfolioAnalysisReport | null;
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

const ScenarioAnalysis: React.FC<ScenarioAnalysisProps> = ({ holdings, report }) => {
  const [selectedScenario, setSelectedScenario] = useState<PredefinedScenario | null>(null);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Alle Positionen mit Ticker-Daten einschließen – auch Watchlist-Einträge
  const allWithTicker = holdings.filter(h => h.ticker?.symbol);
  const activeHoldings = allWithTicker
    .map(h => ({
      name: h.ticker!.company_name ?? h.symbol,
      ticker: h.ticker!.symbol,
      weight: report?.holdings?.find(rh => rh.ticker === h.ticker!.symbol)?.weight ?? Math.round(100 / allWithTicker.length),
    }));

  const runScenario = async (scenario: PredefinedScenario) => {
    if (activeHoldings.length === 0) return;
    setSelectedScenario(scenario);
    setResult(null);
    setError(null);
    setIsFallback(false);
    setFallbackLoading(false);
    setIsLoading(true);
    try {
      const data = await analyzeScenario(scenario.name, scenario.description, activeHoldings);
      setResult(data as ScenarioResult);
    } catch {
      // Primär-Aufruf fehlgeschlagen → Gemini-Fallback mit vereinfachtem Prompt
      setIsLoading(false);
      setFallbackLoading(true);
      try {
        const fallbackData = await analyzeScenarioFallback(scenario.name, scenario.description, activeHoldings);
        setIsFallback(true);
        setResult(fallbackData as ScenarioResult);
      } catch (fallbackErr: any) {
        setError(
          fallbackErr?.message?.includes(':')
            ? fallbackErr.message.split(':')[1]
            : 'Szenario-Analyse vorübergehend nicht verfügbar. Bitte erneut versuchen.'
        );
      } finally {
        setFallbackLoading(false);
      }
      return;
    } finally {
      setIsLoading(false);
    }
  };

  const impactColor = (pct: number) => {
    if (pct <= -15) return 'text-rose-600';
    if (pct < 0) return 'text-amber-600';
    return 'text-emerald-600';
  };

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
            Bildungsorientierte Analyse: Wie hätten sich historisch ähnliche Marktszenarien auf dein Depot ausgewirkt? Rein informativ – keine Prognose, keine Anlageberatung.
          </p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-100 p-4 rounded-[20px] flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
          <strong>Bildungshinweis:</strong> Szenario-Analysen basieren auf historischen Daten und KI-Modellen. Sie stellen keine Prognosen für zukünftige Marktentwicklungen dar und sind keine Anlageberatung. Vergangene Wertentwicklungen sind kein verlässlicher Indikator für die Zukunft.
        </p>
      </div>

      {activeHoldings.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-[28px] p-12 text-center shadow-sm">
          <FlaskConical className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Füge Aktien oder Watchlist-Positionen hinzu, um Szenarien zu analysieren.</p>
        </div>
      )}

      {activeHoldings.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Scenario Picker */}
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] mb-4">Szenario wählen</h3>
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

          {/* Result Panel */}
          <div className="lg:col-span-3">
            {(isLoading || fallbackLoading) && (
              <div className="bg-white border border-slate-200 rounded-[28px] p-16 flex flex-col items-center justify-center shadow-sm h-full min-h-[400px]">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
                {fallbackLoading ? (
                  <>
                    <p className="text-sm font-black text-slate-900 uppercase tracking-widest">Offizielle Daten nicht verfügbar</p>
                    <p className="text-[11px] text-slate-400 mt-2">Lade KI-Prognose auf Basis historischer Muster…</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-black text-slate-900 uppercase tracking-widest">KI analysiert historische Daten...</p>
                    <p className="text-[11px] text-slate-400 mt-2">Vergleich mit historischen Marktszenarien</p>
                  </>
                )}
              </div>
            )}

            {error && !isLoading && (
              <div className="bg-rose-50 border border-rose-100 rounded-[28px] p-8 text-rose-700 text-sm font-medium shadow-sm">
                {error}
              </div>
            )}

            {!isLoading && !fallbackLoading && !result && !error && (
              <div className="bg-white border border-slate-200 rounded-[28px] p-16 flex flex-col items-center justify-center shadow-sm h-full min-h-[400px] text-center">
                <FlaskConical className="w-12 h-12 text-slate-200 mb-4" />
                <p className="text-slate-400 font-medium text-sm">Wähle links ein Szenario,<br />um die historische Analyse zu starten.</p>
              </div>
            )}

            {!isLoading && !fallbackLoading && result && (
              <div className="bg-white border border-slate-200 rounded-[28px] overflow-hidden shadow-sm">
                {/* Result Header */}
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">{selectedScenario?.icon}</span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <h3 className="font-black text-slate-900 text-lg">{result.scenario}</h3>
                        {isFallback && (
                          <span className="text-[9px] font-black bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-lg uppercase tracking-widest shrink-0">
                            KI-Schätzung (historisch)
                          </span>
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
                  {/* Affected Holdings */}
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

                  {/* Explanation */}
                  <div>
                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] mb-3">Hintergrundinformation</h4>
                    <p className="text-[12px] text-slate-600 leading-relaxed font-medium">{result.explanation}</p>
                  </div>

                  {/* Historical Comparison */}
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
                    Diese Analyse dient ausschließlich der Finanzbildung. Sie stellt keine Anlageberatung dar und ist keine Prognose zukünftiger Marktentwicklungen. Historische Wertentwicklungen sind kein verlässlicher Indikator für die Zukunft.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ScenarioAnalysis;
