/**
 * DashboardSummary – kompakte KPI-Karten (Score, Diversifikation, Risiko, Sparpotenzial)
 * KI-Einschätzungen je Position sind in App.tsx in die Portfolio-Tabelle integriert.
 */

import React from 'react';
import { ShieldCheck, PieChart, AlertTriangle, TrendingUp } from 'lucide-react';
import type {
  PortfolioAnalysisReport, PortfolioHealthReport,
  PortfolioSavingsReport, HoldingRow,
} from '../types';

interface Props {
  report:        PortfolioAnalysisReport | null;
  healthReport:  PortfolioHealthReport   | null;
  savingsReport: PortfolioSavingsReport  | null;
  insight:       null;
  holdings?:     HoldingRow[];
}

// Alle Scores auf 0-100 normiert
const scoreColor  = (s: number) => s >= 70 ? 'text-emerald-700' : s >= 50 ? 'text-amber-700' : 'text-rose-600';
const scoreBg     = (s: number) => s >= 70 ? 'bg-emerald-50'    : s >= 50 ? 'bg-amber-50'    : 'bg-rose-50';
const scoreBorder = (s: number) => s >= 70 ? 'border-emerald-200' : s >= 50 ? 'border-amber-200' : 'border-rose-200';

const RISK: Record<string, { label: string; sub: string; color: string; bg: string }> = {
  low:    { label: 'Konservativ', sub: 'Kapitalerhalt im Fokus', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  medium: { label: 'Ausgewogen',  sub: 'Rendite & Sicherheit',   color: 'text-amber-700',   bg: 'bg-amber-50'   },
  high:   { label: 'Wachstum',    sub: 'Maximales Wachstum',     color: 'text-rose-700',    bg: 'bg-rose-50'    },
};

const Metric: React.FC<{
  icon: React.ElementType; label: string; value: string;
  sub: string; color: string; bg: string; border: string;
}> = ({ icon: Icon, label, value, sub, color, bg, border }) => (
  <div className={`bg-white rounded-[22px] border ${border} p-5 flex items-center gap-4`}>
    <div className={`${bg} p-3 rounded-2xl shrink-0`}>
      <Icon className={`w-5 h-5 ${color}`} />
    </div>
    <div className="min-w-0">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.16em] mb-1">{label}</p>
      <p className={`text-xl font-black leading-none ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-400 font-medium mt-1 truncate">{sub}</p>
    </div>
  </div>
);

const DashboardSummary: React.FC<Props> = ({ report, healthReport, savingsReport }) => {
  // score: report.score ist 0-100, healthReport.health_score ist 0-10 → auf 100er-Skala normieren
  const score    = report?.score ?? (healthReport?.health_score != null ? healthReport.health_score * 10 : null);
  const divScore = report?.diversification_score ?? null;
  const riskKey  = report?.risk_level ?? 'medium';
  const risk     = RISK[riskKey] ?? RISK.medium;
  const sectors  = report?.sectors?.length ?? 0;
  const regions  = report?.regions?.length ?? 0;
  const savings  = savingsReport?.potential_savings ?? '';
  const hasSavings = savings && savings !== '0€' && savings !== '0' && !savings.startsWith('0');

  return (
    <div className={`grid gap-3 ${hasSavings ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}>
      {score != null && (
        <Metric
          icon={ShieldCheck}
          label="Portfolio-Score"
          value={`${score}/100`}
          sub={healthReport?.status ?? (score >= 70 ? 'Solide aufgestellt' : score >= 50 ? 'Verbesserungsbedarf' : 'Handlungsbedarf')}
          color={scoreColor(score)} bg={scoreBg(score)} border={scoreBorder(score)}
        />
      )}
      {divScore != null && (
        <Metric
          icon={PieChart}
          label="Diversifikation"
          value={`${divScore}/100`}
          sub={`${sectors} Sektor${sectors !== 1 ? 'en' : ''} · ${regions} Region${regions !== 1 ? 'en' : ''}`}
          color={scoreColor(divScore)} bg={scoreBg(divScore)} border={scoreBorder(divScore)}
        />
      )}
      <Metric
        icon={AlertTriangle}
        label="Risiko-Profil"
        value={risk.label}
        sub={risk.sub}
        color={risk.color} bg={risk.bg} border="border-slate-200"
      />
      {hasSavings && (
        <Metric
          icon={TrendingUp}
          label="Sparpotenzial p.a."
          value={savings}
          sub={savingsReport?.savings_percentage ? `${savingsReport.savings_percentage} durch ETF-Wechsel` : 'Durch günstigere ETFs'}
          color="text-emerald-700" bg="bg-emerald-50" border="border-emerald-200"
        />
      )}
    </div>
  );
};

export default DashboardSummary;
