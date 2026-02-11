
import React from 'react';
import { TrendingUp, Wallet, Percent, ShieldCheck, Info, CheckCircle2, BarChart3 } from 'lucide-react';
import { PortfolioAnalysisReport, PortfolioHealthReport, PortfolioSavingsReport } from '../types';

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
}

const DashboardSummary: React.FC<Props> = ({ report, healthReport, savingsReport }) => {
  const score = healthReport ? `${healthReport.health_score}/10` : (report ? `${report.score}/10` : "...");
  const savings = savingsReport?.potential_savings || "0€";

  // Derive market trend from report data
  const holdingsCount = report?.holdings?.length || 0;
  const bullishCount = report?.holdings?.filter((h: any) => h.recommendation === 'Kaufen' || h.recommendation === 'Halten').length || 0;
  const trendRatio = holdingsCount > 0 ? bullishCount / holdingsCount : 0;
  const trendLabel = trendRatio > 0.7 ? 'Positiv' : trendRatio > 0.4 ? 'Neutral' : 'Vorsicht';
  const trendSubtext = `${holdingsCount} Positionen analysiert`;

  // Derive analysis depth from health report factors
  const factorCount = healthReport?.factors ? Object.keys(healthReport.factors).length : 0;
  const depthLabel = factorCount >= 4 ? 'Vollständig' : factorCount >= 2 ? 'Basis' : 'Schnellcheck';
  const depthSubtext = `${factorCount * 4} Metriken geprüft`;

  return (
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
        title="Portfolio-Trend"
        value={trendLabel}
        subtext={trendSubtext}
        icon={TrendingUp}
        color="blue"
        explanation="Gesamtbewertung basierend auf den Empfehlungen Ihrer Positionen."
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
        value={depthLabel}
        subtext={depthSubtext}
        icon={BarChart3}
        color="purple"
        explanation="Ihr Depot wurde anhand von Diversifikation, Kosten, Risiko und Balance geprüft."
      />
    </div>
  );
};

export default DashboardSummary;
