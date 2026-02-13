
import React from 'react';
import { TrendingUp, TrendingDown, Wallet, Percent, ShieldCheck, Info, Target, Activity } from 'lucide-react';
import { PortfolioAnalysisReport, PortfolioHealthReport, DashboardSummaryInsight, PortfolioSavingsReport } from '../types';

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val);

const KPICard = ({ title, value, subtext, icon: Icon, color, explanation, trend }: {
  title: string;
  value: string;
  subtext: string;
  icon: React.ElementType;
  color: string;
  explanation: string;
  trend?: 'up' | 'down' | 'neutral';
}) => {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100' },
    slate: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-100' },
  };
  const c = colorMap[color] || colorMap.slate;

  return (
    <div className="bg-white p-5 rounded-[24px] shadow-sm border border-slate-200 flex flex-col gap-3 relative group hover:shadow-md transition-all">
      <div className="flex items-center justify-between">
        <div className={`p-2.5 rounded-xl ${c.bg}`}>
          <Icon className={`w-4 h-4 ${c.text}`} />
        </div>
        <div className="group/info relative">
          <Info className="w-3 h-3 text-slate-300 cursor-help" />
          <div className="absolute bottom-full right-0 mb-2 w-52 p-3 bg-slate-900 text-white text-[10px] rounded-xl opacity-0 group-hover/info:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed">
            {explanation}
          </div>
        </div>
      </div>
      <div>
        <p className="text-slate-400 text-[9px] font-black uppercase tracking-[0.15em] mb-1">{title}</p>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-black text-slate-900 tracking-tight">{value}</p>
          {trend && trend !== 'neutral' && (
            <span className={`flex items-center gap-0.5 text-[10px] font-bold ${trend === 'up' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500 font-medium mt-0.5">{subtext}</p>
      </div>
    </div>
  );
};

interface Props {
  report: PortfolioAnalysisReport | null;
  healthReport: PortfolioHealthReport | null;
  savingsReport: PortfolioSavingsReport | null;
  insight: DashboardSummaryInsight | null;
}

const DashboardSummary: React.FC<Props> = ({ report, healthReport, savingsReport }) => {
  if (!report) return null;

  const totalValue = report.totalValue || 0;
  const dailyChange = report.totalDailyChange || 0;
  const dailyChangePct = report.totalDailyChangePercent || 0;
  const score = report.score || 0;
  const ter = report.weightedTER ?? 0;
  const diversScore = report.diversification_score || 0;
  const riskLevel = report.risk_level || 'medium';

  const riskLabelMap: Record<string, string> = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch' };
  const riskColorMap: Record<string, string> = { low: 'emerald', medium: 'amber', high: 'rose' };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      <KPICard
        title="Gesamtwert"
        value={totalValue > 0 ? formatCurrency(totalValue) : '–'}
        subtext={dailyChange >= 0 ? `+${formatCurrency(dailyChange)} heute` : `${formatCurrency(dailyChange)} heute`}
        icon={Wallet}
        color="blue"
        explanation="Aktueller Marktwert aller Positionen in Ihrem Portfolio."
        trend={dailyChange >= 0 ? 'up' : 'down'}
      />
      <KPICard
        title="Tagesperformance"
        value={`${dailyChangePct >= 0 ? '+' : ''}${dailyChangePct.toFixed(2)}%`}
        subtext="vs. Vortag"
        icon={dailyChangePct >= 0 ? TrendingUp : TrendingDown}
        color={dailyChangePct >= 0 ? 'emerald' : 'rose'}
        explanation="Prozentuale Wertveränderung Ihres Portfolios seit dem letzten Handelstag."
        trend={dailyChangePct >= 0 ? 'up' : 'down'}
      />
      <KPICard
        title="Portfolio-Score"
        value={`${score}/100`}
        subtext={score >= 75 ? 'Gut aufgestellt' : score >= 50 ? 'Optimierbar' : 'Handlungsbedarf'}
        icon={Target}
        color={score >= 75 ? 'emerald' : score >= 50 ? 'amber' : 'rose'}
        explanation="KI-basierter Gesamtscore auf Basis von Diversifikation, Kosten, Risiko und Allokation."
      />
      <KPICard
        title="Risikoprofil"
        value={riskLabelMap[riskLevel]}
        subtext={`Volatilität ${report.riskMetrics?.volatility?.toFixed(1) || '–'}%`}
        icon={Activity}
        color={riskColorMap[riskLevel]}
        explanation="Einschätzung des Gesamtrisikos basierend auf Volatilität, Konzentration und Asset-Allokation."
      />
      <KPICard
        title="Kosten (TER)"
        value={`${ter.toFixed(2)}%`}
        subtext={savingsReport ? `Sparpotenzial ${savingsReport.potential_savings}` : 'p.a. gewichtet'}
        icon={Percent}
        color={ter <= 0.2 ? 'emerald' : ter <= 0.5 ? 'amber' : 'rose'}
        explanation="Gewichtete Total Expense Ratio Ihres Portfolios. Unter 0,25% gilt als kosteneffizient."
      />
      <KPICard
        title="Diversifikation"
        value={`${diversScore}/10`}
        subtext={`${report.sectors?.length || 0} Sektoren · ${report.regions?.length || 0} Regionen`}
        icon={ShieldCheck}
        color={diversScore >= 7 ? 'emerald' : diversScore >= 5 ? 'amber' : 'rose'}
        explanation="Bewertung der Streuung über Anlageklassen, Sektoren und Regionen. Ab 7/10 gilt als gut diversifiziert."
      />
    </div>
  );
};

export default DashboardSummary;
