import React, { useState, useEffect } from 'react';
import { TrendingUp, Percent, ShieldCheck, Info, CheckCircle2, Sparkles, Loader2, RefreshCcw, AlertTriangle } from 'lucide-react';
import { PortfolioAnalysisReport, PortfolioHealthReport, DashboardSummaryInsight, PortfolioSavingsReport, HoldingRow } from '../types';
import { generateHoldingTheses } from '../services/geminiService';

const SummaryCard = ({ title, value, subtext, icon: Icon, color, explanation }: any) => (
  <div className="bg-white p-6 rounded-[28px] shadow-sm border border-slate-200 flex items-start gap-4 relative group hover:shadow-md transition-all">
    <div className={`p-4 rounded-2xl bg-${color}-50`}>
      <Icon className={`w-6 h-6 text-${color}-600`} />
    </div>
    <div className="flex-1">
      <div className="flex items-center gap-1.5 mb-1">
        <h4 className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">{title}</h4>
        <div className="group/info relative">
          <Info className="w-3 h-3 text-slate-300 cursor-help" />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-900 text-white text-[9px] rounded-xl opacity-0 group-hover/info:opacity-100 transition-opacity pointer-events-none z-50">
            {explanation}
          </div>
        </div>
      </div>
      <p className="text-2xl font-black text-slate-900 tracking-tight">{value}</p>
      <p className="text-[11px] text-slate-500 font-medium mt-1">{subtext}</p>
    </div>
  </div>
);

interface Props {
  report: PortfolioAnalysisReport | null;
  healthReport: PortfolioHealthReport | null;
  savingsReport: PortfolioSavingsReport | null;
  insight: DashboardSummaryInsight | null;
  holdings?: HoldingRow[];
}

const DashboardSummary: React.FC<Props> = ({ report, healthReport, savingsReport, holdings }) => {
  const score = healthReport ? `${healthReport.health_score}/10` : (report ? `${report.score}/10` : "...");
  const savings = savingsReport?.potential_savings || "0€";

  const [theses, setTheses] = useState<{ ticker: string; thesis: string }[]>([]);
  const [thesesLoading, setThesesLoading] = useState(false);
  const [thesesLoaded, setThesesLoaded] = useState(false);

  // Holding-Daten normalisieren (aus Report oder direkt aus Holdings)
  const holdingInputs: { name: string; ticker: string; shares: number | null; buyPrice: number | null }[] =
    report?.holdings?.length
      ? report.holdings.map(h => ({
          name: h.name,
          ticker: h.ticker ?? h.name,
          shares: null,
          buyPrice: null,
        }))
      : (holdings ?? []).filter(h => !h.watchlist).map(h => ({
          name: h.ticker.company_name,
          ticker: h.ticker.symbol,
          shares: h.shares,
          buyPrice: h.buy_price,
        }));

  useEffect(() => {
    if (holdingInputs.length > 0 && !thesesLoaded) {
      loadTheses();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.holdings?.length, holdings?.length]);

  const loadTheses = async () => {
    if (holdingInputs.length === 0) return;
    setThesesLoading(true);
    try {
      const result = await generateHoldingTheses(holdingInputs.slice(0, 8));
      setTheses(result);
      setThesesLoaded(true);
    } catch {
      // Thesen sind optional – bei Fehler still
    } finally {
      setThesesLoading(false);
    }
  };

  const handleRefresh = () => {
    setThesesLoaded(false);
    loadTheses();
  };

  return (
    <div className="space-y-6">
      {/* ── Kennzahlen-Karten ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Sicherheit"
          value={score}
          subtext={healthReport?.status || "Check..."}
          icon={ShieldCheck}
          color="emerald"
          explanation="Dein Risiko-Mix aus Aktien und Anleihen."
        />
        <SummaryCard
          title="Markt-Trend"
          value="Neutral"
          subtext="Weltmarkt heute"
          icon={TrendingUp}
          color="blue"
          explanation="Aktuelle globale Wirtschaftslage basierend auf Index-Daten."
        />
        <SummaryCard
          title="Ersparnis"
          value={savings}
          subtext="Pro Jahr möglich"
          icon={Percent}
          color="amber"
          explanation="Potenzial durch Wechsel auf kostengünstigere Anlageklassen."
        />
        <SummaryCard
          title="Analysetiefe"
          value="Vollständig"
          subtext="Präzise Prüfung"
          icon={CheckCircle2}
          color="purple"
          explanation="Ihr Depot wurde anhand von über 15 Metriken validiert."
        />
      </div>

      {/* ── KI-Markteinschätzungen (Ghostwriter) ─────────────────────── */}
      {holdingInputs.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">
                KI-Markteinschätzungen
              </h3>
              <span className="text-[9px] font-black text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full uppercase tracking-widest">
                Bildungsinformation
              </span>
            </div>
            <button
              onClick={handleRefresh}
              disabled={thesesLoading}
              className="flex items-center gap-1.5 text-[9px] font-black text-blue-600 uppercase tracking-widest hover:text-slate-900 transition-colors disabled:opacity-40"
            >
              <RefreshCcw className={`w-3 h-3 ${thesesLoading ? 'animate-spin' : ''}`} />
              Neu laden
            </button>
          </div>

          {thesesLoading && (
            <div className="flex items-center justify-center gap-3 py-10">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                KI erstellt Markteinschätzungen...
              </span>
            </div>
          )}

          {!thesesLoading && theses.length === 0 && thesesLoaded && (
            <div className="px-6 py-8 text-center">
              <Sparkles className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-[11px] text-slate-400 font-medium">
                Keine Einschätzungen verfügbar. Bitte erneut versuchen.
              </p>
            </div>
          )}

          {!thesesLoading && theses.length > 0 && (
            <div className="divide-y divide-slate-50">
              {theses.map((t, i) => {
                const meta = holdingInputs.find(h => h.ticker === t.ticker);
                return (
                  <div key={i} className="px-6 py-4 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                        <span className="text-[9px] font-black text-blue-600 font-mono leading-none text-center">
                          {t.ticker.slice(0, 4)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-black text-slate-900">
                            {meta?.name ?? t.ticker}
                          </span>
                          <span className="text-[9px] font-mono text-slate-400">{t.ticker}</span>
                          {meta?.shares && (
                            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                              {meta.shares} Stk.
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-slate-600 leading-relaxed font-medium">
                          {t.thesis}
                        </p>
                        <p className="text-[9px] text-slate-400 mt-1.5 italic">
                          KI-generierte Information · keine Anlageberatung · {new Date().toLocaleDateString('de-DE')}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Permanenter Compliance-Hinweis ─────────────────────────────── */}
      <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 px-5 py-4 rounded-[20px]">
        <AlertTriangle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
          Alle Analysen basieren auf aktuellen Marktdaten und KI-Modellen und ersetzen keine professionelle Beratung durch einen zugelassenen Finanzberater. Kein Anlageberatungsangebot gemäß KWG/WpIG.
        </p>
      </div>
    </div>
  );
};

export default DashboardSummary;
