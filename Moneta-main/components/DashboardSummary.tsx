import React from 'react';
import { TrendingUp, Wallet, Percent, ShieldCheck, Info, CheckCircle2, Building2 } from 'lucide-react';
import { PortfolioAnalysisReport, PortfolioHealthReport, DashboardSummaryInsight, PortfolioSavingsReport } from '../types';

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

function getMABadge(score: number): { label: string; bg: string; text: string; border: string } {
  if (score <= 3) return { label: 'Gering', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' };
  if (score <= 5) return { label: 'Moderat', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
  if (score <= 7) return { label: 'Attraktiv', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
  return { label: 'Sehr attraktiv', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
}

interface Props {
  report: PortfolioAnalysisReport | null;
  healthReport: PortfolioHealthReport | null;
  savingsReport: PortfolioSavingsReport | null;
  insight: DashboardSummaryInsight | null;
}

const DashboardSummary: React.FC<Props> = ({ report, healthReport, savingsReport }) => {
  const score = healthReport ? `${healthReport.health_score}/10` : (report ? `${report.score}/10` : "...");
  const savings = savingsReport?.potential_savings || "0€";
  const maScore = report?.ma_attractiveness_score;
  const maBadge = maScore != null ? getMABadge(maScore) : null;

  return (
    <div className="space-y-4">
      {maBadge != null && (
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl border font-black text-sm ${maBadge.bg} ${maBadge.text} ${maBadge.border}`}
            title={report?.ma_attractiveness_note}
          >
            <Building2 className="w-4 h-4" />
            M&A-Attraktivität: {maScore}/10 · {maBadge.label}
          </span>
          {report?.ma_attractiveness_note && (
            <span className="text-[11px] text-slate-500 font-medium max-w-md">{report.ma_attractiveness_note}</span>
          )}
        </div>
      )}
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
    </div>
  );
};

export default DashboardSummary;
