
import React, { useState } from 'react';
import { PortfolioAnalysisReport, NewsImpactReport, PortfolioHealthReport, PortfolioSavingsReport } from '../types';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  AreaChart,
} from 'recharts';
import {
  Newspaper,
  TrendingUp,
  TrendingDown,
  Globe,
  ShieldAlert,
  BarChart3,
  Zap,
  X,
  Loader2,
  ArrowRight,
  RefreshCcw,
  Coins,
  Sparkles,
  Info,
  AlertTriangle,
  Activity,
  Target,
  CheckCircle2,
  XCircle,
  Lightbulb,
  ArrowDownRight,
  ArrowUpRight,
  Percent,
  LineChart as LineChartIcon,
} from 'lucide-react';
import { analyzeNewsImpact } from '../services/geminiService';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val);

const SimpleHealthCard = ({ title, score, note, icon: Icon, explanation }: any) => (
  <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 flex flex-col gap-3">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-slate-400" />
        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</h4>
      </div>
      <div className="group/info relative">
        <Info className="w-3 h-3 text-slate-300 cursor-help" />
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-900 text-white text-[9px] rounded-lg opacity-0 group-hover/info:opacity-100 transition-opacity pointer-events-none z-50">
          {explanation}
        </div>
      </div>
    </div>
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-black text-slate-900 tracking-tighter">{score ?? '?'}/10</span>
      <span className="text-[10px] font-bold text-slate-400">Punkte</span>
    </div>
    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${
          (score ?? 0) >= 8 ? 'bg-emerald-500' : (score ?? 0) >= 5 ? 'bg-amber-500' : 'bg-rose-500'
        }`}
        style={{ width: `${((score ?? 0) / 10) * 100}%` }}
      />
    </div>
    <p className="text-[11px] text-slate-600 font-medium leading-relaxed">{note || 'Wird berechnet...'}</p>
  </div>
);

interface PortfolioDeepDiveProps {
  report: PortfolioAnalysisReport | null;
  healthReport: PortfolioHealthReport | null;
  savingsReport: PortfolioSavingsReport | null;
}

const PortfolioDeepDive: React.FC<PortfolioDeepDiveProps> = ({ report, healthReport, savingsReport }) => {
  const [analyzingNews, setAnalyzingNews] = useState<string | null>(null);
  const [newsImpact, setNewsImpact] = useState<NewsImpactReport | null>(null);

  if (!report) return null;

  const handleNewsClick = async (news: any) => {
    setAnalyzingNews(news.title);
    try {
      const impact = await analyzeNewsImpact(news, report.holdings);
      setNewsImpact(impact);
    } catch (e) {
      console.error("Fehler bei der Analyse der News", e);
    } finally {
      setAnalyzingNews(null);
    }
  };

  const factors = healthReport?.factors;
  const riskMetrics = report.riskMetrics;

  return (
    <div className="space-y-8 md:space-y-10 animate-in fade-in duration-700">

      {/* 0. ZUSAMMENFASSUNG & STÄRKEN/SCHWÄCHEN */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Summary */}
        <div className="lg:col-span-2 bg-white rounded-[32px] border border-slate-200 p-6 md:p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Lightbulb className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-black text-slate-900 tracking-tight">KI-Zusammenfassung</h3>
          </div>
          <p className="text-sm text-slate-700 font-medium leading-relaxed mb-6">{report.summary}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Stärken */}
            <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" /> Stärken
              </h4>
              <ul className="space-y-2">
                {report.strengths?.map((s, i) => (
                  <li key={i} className="text-[11px] text-emerald-800 font-medium leading-relaxed flex items-start gap-2">
                    <span className="text-emerald-500 mt-0.5 shrink-0">+</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            {/* Schwächen */}
            <div className="bg-amber-50 p-5 rounded-2xl border border-amber-100">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" /> Optimierungspotenzial
              </h4>
              <ul className="space-y-2">
                {report.considerations?.map((c, i) => (
                  <li key={i} className="text-[11px] text-amber-800 font-medium leading-relaxed flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5 shrink-0">!</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Gaps / Lücken */}
        {report.gaps && report.gaps.length > 0 && (
          <div className="bg-white rounded-[32px] border border-slate-200 p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <XCircle className="w-5 h-5 text-rose-500" />
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Lücken im Portfolio</h3>
            </div>
            <ul className="space-y-3">
              {report.gaps.map((g, i) => (
                <li key={i} className="bg-rose-50 p-4 rounded-xl border border-rose-100">
                  <p className="text-[11px] text-rose-800 font-medium leading-relaxed">{g}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 1. PERFORMANCE CHART */}
      {report.performance_history && report.performance_history.length > 0 && (
        <div className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-200 p-6 md:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
            <div className="flex items-center gap-3">
              <LineChartIcon className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">Performance vs. Benchmark</h3>
            </div>
            <div className="flex items-center gap-4 text-[10px] font-bold">
              <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-blue-600 inline-block" /> Portfolio</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-slate-300 inline-block" /> MSCI World (Benchmark)</span>
            </div>
          </div>
          <div className="h-72 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={report.performance_history} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickFormatter={(val: string) => {
                    const d = new Date(val);
                    return `${d.toLocaleDateString('de-DE', { month: 'short' })}`;
                  }}
                  interval={6}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickFormatter={(val: number) => `${val.toFixed(0)}`}
                  domain={['dataMin - 2', 'dataMax + 2']}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '16px',
                    border: 'none',
                    boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)',
                    fontSize: '11px',
                    fontWeight: '600',
                  }}
                  labelFormatter={(label: string) => new Date(label).toLocaleDateString('de-DE')}
                  formatter={(value: number, name: string) => [
                    `${value.toFixed(2)}%`,
                    name === 'portfolio' ? 'Portfolio' : 'Benchmark',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="portfolio"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  fill="url(#portfolioGrad)"
                />
                <Line
                  type="monotone"
                  dataKey="benchmark"
                  stroke="#cbd5e1"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 2. RISK ANALYTICS */}
      {riskMetrics && (
        <div className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-200 p-6 md:p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Activity className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">Risiko-Analyse</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <RiskMetricCard
              label="Volatilität"
              value={`${riskMetrics.volatility.toFixed(1)}%`}
              desc="Annualisierte Schwankungsbreite"
              status={riskMetrics.volatility <= 12 ? 'good' : riskMetrics.volatility <= 18 ? 'warn' : 'bad'}
            />
            <RiskMetricCard
              label="Sharpe Ratio"
              value={riskMetrics.sharpeRatio.toFixed(2)}
              desc="Rendite pro Risikoeinheit"
              status={riskMetrics.sharpeRatio >= 1 ? 'good' : riskMetrics.sharpeRatio >= 0.5 ? 'warn' : 'bad'}
            />
            <RiskMetricCard
              label="Max. Drawdown"
              value={`${riskMetrics.maxDrawdown.toFixed(1)}%`}
              desc="Größter Verlust vom Hoch"
              status={riskMetrics.maxDrawdown >= -15 ? 'good' : riskMetrics.maxDrawdown >= -25 ? 'warn' : 'bad'}
            />
            <RiskMetricCard
              label="Value at Risk (95%)"
              value={formatCurrency(riskMetrics.valueAtRisk)}
              desc="Max. Tagesverlust bei 95% Konf."
              status={riskMetrics.valueAtRisk >= -5000 ? 'good' : riskMetrics.valueAtRisk >= -10000 ? 'warn' : 'bad'}
            />
            <RiskMetricCard
              label="Beta"
              value={riskMetrics.beta.toFixed(2)}
              desc="Marktsensitivität vs. Index"
              status={riskMetrics.beta <= 1.1 ? 'good' : riskMetrics.beta <= 1.3 ? 'warn' : 'bad'}
            />
            <RiskMetricCard
              label="Tracking Error"
              value={`${riskMetrics.trackingError.toFixed(1)}%`}
              desc="Abweichung vom Benchmark"
              status={riskMetrics.trackingError <= 3 ? 'good' : riskMetrics.trackingError <= 6 ? 'warn' : 'bad'}
            />
            <RiskMetricCard
              label="Sortino Ratio"
              value={riskMetrics.sortinoRatio.toFixed(2)}
              desc="Rendite pro Abwärtsrisiko"
              status={riskMetrics.sortinoRatio >= 1.5 ? 'good' : riskMetrics.sortinoRatio >= 0.8 ? 'warn' : 'bad'}
            />
            <RiskMetricCard
              label="Information Ratio"
              value={riskMetrics.informationRatio.toFixed(2)}
              desc="Outperformance pro Tracking Error"
              status={riskMetrics.informationRatio >= 0.5 ? 'good' : riskMetrics.informationRatio >= 0.2 ? 'warn' : 'bad'}
            />
          </div>
        </div>
      )}

      {/* 3. PORTFOLIO ÜBERBLICK (Holdings) */}
      <div className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">Positionen im Detail</h3>
          </div>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
              {report.holdings?.length || 0} Positionen
            </span>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="block md:hidden divide-y divide-slate-100">
          {report.holdings?.map((holding, i) => (
            <div key={i} className="p-5 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-bold text-slate-900 text-sm leading-tight">{holding.name}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-mono text-slate-400">{holding.ticker || holding.isin || 'N/A'}</span>
                    {holding.assetClass && (
                      <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{holding.assetClass}</span>
                    )}
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shrink-0 ${
                  holding.decision === 'Kaufen' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                  holding.decision === 'Verkaufen' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                  'bg-slate-100 text-slate-600 border border-slate-200'
                }`}>
                  {holding.decision}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gewicht</p>
                  <p className="text-sm font-black text-slate-900">{holding.weight}%</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Wert</p>
                  <p className="text-sm font-black text-slate-900">{holding.value ? formatCurrency(holding.value) : '–'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Rendite</p>
                  <p className={`text-sm font-black ${(holding.totalReturn ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {holding.totalReturn != null ? `${holding.totalReturn >= 0 ? '+' : ''}${holding.totalReturn}%` : '–'}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl">
                <p className="text-[11px] font-medium text-slate-600 leading-relaxed italic">
                  <span className="font-black text-slate-400 mr-1 opacity-50">KI:</span>
                  {holding.reason}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="px-6 py-4">Position</th>
                <th className="px-4 py-4 text-right">Gewicht</th>
                <th className="px-4 py-4 text-right">Wert</th>
                <th className="px-4 py-4 text-right">Kurs</th>
                <th className="px-4 py-4 text-right">Tagesänderung</th>
                <th className="px-4 py-4 text-right">Gesamtrendite</th>
                <th className="px-4 py-4 text-center">Signal</th>
                <th className="px-4 py-4">KI-Bewertung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.holdings?.map((holding, i) => (
                <tr key={i} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900 text-sm">{holding.name}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-slate-400">{holding.ticker || holding.isin || 'N/A'}</span>
                        {holding.assetClass && (
                          <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{holding.assetClass}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 rounded-full" style={{ width: `${holding.weight}%` }} />
                      </div>
                      <span className="text-xs font-black text-slate-900 w-8 text-right">{holding.weight}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-5 text-right">
                    <span className="text-xs font-bold text-slate-900">
                      {holding.value ? formatCurrency(holding.value) : '–'}
                    </span>
                  </td>
                  <td className="px-4 py-5 text-right">
                    <span className="text-xs font-medium text-slate-600">{holding.currentPrice || '–'}</span>
                  </td>
                  <td className="px-4 py-5 text-right">
                    {holding.dailyChange != null ? (
                      <span className={`text-xs font-bold flex items-center justify-end gap-1 ${holding.dailyChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {holding.dailyChange >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {holding.dailyChange >= 0 ? '+' : ''}{holding.dailyChange.toFixed(2)}%
                      </span>
                    ) : <span className="text-xs text-slate-400">–</span>}
                  </td>
                  <td className="px-4 py-5 text-right">
                    {holding.totalReturn != null ? (
                      <span className={`text-xs font-black ${holding.totalReturn >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {holding.totalReturn >= 0 ? '+' : ''}{holding.totalReturn}%
                      </span>
                    ) : <span className="text-xs text-slate-400">–</span>}
                  </td>
                  <td className="px-4 py-5 text-center">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                      holding.decision === 'Kaufen' ? 'bg-emerald-50 text-emerald-600' :
                      holding.decision === 'Verkaufen' ? 'bg-rose-50 text-rose-600' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {holding.decision}
                    </span>
                  </td>
                  <td className="px-4 py-5">
                    <p className="text-[11px] font-medium text-slate-600 max-w-xs leading-relaxed">{holding.reason}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. CHARTS: Sektoren, Regionen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-[32px] border border-slate-200 p-6 md:p-8 shadow-sm">
          <h3 className="text-lg font-black text-slate-900 tracking-tight mb-6">Sektor-Verteilung</h3>
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={report.sectors || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {(report.sectors || []).map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`${value}%`, 'Anteil']}
                  itemStyle={{ fontSize: '11px', fontWeight: '700' }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={40}
                  wrapperStyle={{ fontSize: '10px', fontWeight: '600', paddingTop: '16px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-[32px] border border-slate-200 p-6 md:p-8 shadow-sm">
          <h3 className="text-lg font-black text-slate-900 tracking-tight mb-6">Regionale Verteilung</h3>
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={report.regions || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {(report.regions || []).map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`${value}%`, 'Anteil']}
                  itemStyle={{ fontSize: '11px', fontWeight: '700' }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={40}
                  wrapperStyle={{ fontSize: '10px', fontWeight: '600', paddingTop: '16px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 5. ANALYSE-WERTE (Health) */}
      {healthReport && (
        <div className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-200 p-6 md:p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <ShieldAlert className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">Portfolio-Gesundheit</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SimpleHealthCard
              title="Streuung"
              score={factors?.diversification?.score}
              note={factors?.diversification?.note}
              icon={Globe}
              explanation="Verteilung über Länder, Branchen und Anlageklassen."
            />
            <SimpleHealthCard
              title="Kosteneffizienz"
              score={factors?.cost_efficiency?.score}
              note={factors?.cost_efficiency?.note}
              icon={Coins}
              explanation="Wie hoch sind die laufenden Kosten im Vergleich zum Markt?"
            />
            <SimpleHealthCard
              title="Risiko-Balance"
              score={factors?.risk_balance?.score}
              note={factors?.risk_balance?.note}
              icon={TrendingUp}
              explanation="Verhältnis von Risiko zu erwarteter Rendite."
            />
            <SimpleHealthCard
              title="Allokations-Stabilität"
              score={factors?.allocation_drift?.score}
              note={factors?.allocation_drift?.note}
              icon={RefreshCcw}
              explanation="Wie stark weicht das Portfolio von der Zielallokation ab?"
            />
          </div>
        </div>
      )}

      {/* 6. KOSTENANALYSE */}
      {savingsReport && savingsReport.breakdown && savingsReport.breakdown.length > 0 && (
        <div className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-200 p-6 md:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
            <div className="flex items-center gap-3">
              <Percent className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">Kostenanalyse & Sparpotenzial</h3>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="bg-blue-50 px-4 py-2 rounded-xl border border-blue-100">
                <span className="text-[10px] font-black text-blue-700">Aktuell: {savingsReport.current_annual_costs} p.a.</span>
              </div>
              <div className="bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100">
                <span className="text-[10px] font-black text-emerald-700">Sparpotenzial: {savingsReport.potential_savings} p.a.</span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="px-5 py-3 rounded-l-xl">Position</th>
                  <th className="px-5 py-3 text-right">Volumen</th>
                  <th className="px-5 py-3 text-right">Aktuelle TER</th>
                  <th className="px-5 py-3">Alternative</th>
                  <th className="px-5 py-3 text-right">Alt. TER</th>
                  <th className="px-5 py-3 text-right rounded-r-xl">Ersparnis p.a.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {savingsReport.breakdown.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4 text-xs font-bold text-slate-900">{item.current_etf}</td>
                    <td className="px-5 py-4 text-xs text-slate-600 text-right">{item.your_amount || '–'}</td>
                    <td className="px-5 py-4 text-xs font-bold text-slate-900 text-right">{item.current_ter}</td>
                    <td className="px-5 py-4 text-xs text-blue-600 font-medium">{item.alternative}</td>
                    <td className="px-5 py-4 text-xs font-bold text-emerald-600 text-right">{item.alternative_ter}</td>
                    <td className="px-5 py-4 text-xs font-black text-emerald-600 text-right">{item.annual_saving}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 bg-slate-50 p-5 rounded-2xl border border-slate-100">
            <p className="text-[11px] text-slate-700 font-medium leading-relaxed">{savingsReport.explanation}</p>
            {savingsReport.considerations && savingsReport.considerations.length > 0 && (
              <ul className="mt-3 space-y-1">
                {savingsReport.considerations.map((c, i) => (
                  <li key={i} className="text-[10px] text-slate-500 font-medium flex items-start gap-1.5">
                    <span className="text-amber-500 mt-0.5 shrink-0">!</span> {c}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* 7. NEWS */}
      <div className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-200 p-6 md:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-3">
            <Newspaper className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">Portfolio-relevante News</h3>
          </div>
          <div className="bg-blue-50 px-4 py-1.5 rounded-full border border-blue-100 flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-blue-600" />
            <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest">KI-Relevanz-Filter</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {report.news?.length > 0 ? report.news.map((item, i) => (
            <div key={i} className="p-5 bg-slate-50 rounded-[24px] border border-slate-100 flex flex-col group hover:border-blue-200 transition-all hover:shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${
                  item.importance === 'hoch' ? 'bg-rose-100 text-rose-600' :
                  item.importance === 'mittel' ? 'bg-amber-100 text-amber-600' :
                  'bg-blue-100 text-blue-600'
                }`}>
                  {item.importance}e Relevanz
                </span>
                <span className="text-xl">{item.impact_emoji}</span>
              </div>

              <h4 className="font-bold text-slate-900 text-sm mb-2 group-hover:text-blue-600 transition-colors leading-snug">
                {item.title}
              </h4>

              <div className="bg-white/60 p-3 rounded-xl border border-white/40 mb-4 flex-1">
                <p className="text-[11px] text-slate-600 font-medium leading-relaxed italic">"{item.snippet}"</p>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-slate-400 uppercase">{item.source}</span>
                <button
                  onClick={() => handleNewsClick(item)}
                  disabled={!!analyzingNews}
                  className="py-2 px-4 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2 shadow-sm"
                >
                  {analyzingNews === item.title ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  Impact
                </button>
              </div>
            </div>
          )) : (
            <div className="col-span-full py-12 text-center bg-slate-50 rounded-[32px] border border-dashed border-slate-200">
              <p className="text-slate-400 text-sm font-medium">Keine kritischen Meldungen zu Ihren Positionen.</p>
            </div>
          )}
        </div>
      </div>

      {/* 8. NÄCHSTE SCHRITTE */}
      <div className="bg-blue-600 rounded-[32px] md:rounded-[40px] p-8 md:p-10 text-white relative overflow-hidden shadow-2xl shadow-blue-600/30">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <Zap className="w-6 h-6 text-amber-400" />
            <h3 className="text-xl md:text-2xl font-black tracking-tight">Empfohlene Maßnahmen</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.nextSteps?.map((step, i) => (
              <div key={i} className="bg-white/10 backdrop-blur-md border border-white/20 p-5 rounded-[24px] flex items-start gap-4">
                <div className="bg-white/20 p-2.5 rounded-xl shrink-0 flex items-center justify-center w-10 h-10">
                  <span className="text-white font-black text-sm">{i + 1}</span>
                </div>
                <div>
                  <h4 className="font-bold text-base mb-1">{step.action}</h4>
                  <p className="text-sm text-blue-100 font-medium leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* News Impact Modal */}
      {newsImpact && (
        <div className="fixed inset-0 z-[400] bg-slate-900/60 backdrop-blur-xl flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-[32px] sm:rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden border border-white/20 animate-in slide-in-from-bottom sm:zoom-in duration-300">
            <div className="p-6 md:p-8 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 p-2.5 rounded-xl text-white">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h2 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">Impact-Analyse</h2>
              </div>
              <button onClick={() => setNewsImpact(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            <div className="p-6 md:p-8 space-y-6 overflow-y-auto max-h-[70vh]">
              <div className={`p-5 rounded-2xl border ${
                newsImpact.relevance === 'high' ? 'bg-rose-50 border-rose-100 text-rose-900' :
                newsImpact.relevance === 'medium' ? 'bg-amber-50 border-amber-100 text-amber-900' :
                'bg-blue-50 border-blue-100 text-blue-900'
              }`}>
                <p className="font-bold text-sm leading-relaxed">{newsImpact.impact_summary}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Positiv</span>
                  <p className="text-xs text-slate-600 font-medium leading-relaxed mt-2">{newsImpact.perspectives?.bullish}</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-black uppercase tracking-widest text-rose-600">Negativ</span>
                  <p className="text-xs text-slate-600 font-medium leading-relaxed mt-2">{newsImpact.perspectives?.bearish}</p>
                </div>
              </div>
              <div className="bg-blue-600 p-5 rounded-2xl text-white">
                <p className="text-sm font-medium leading-relaxed italic">"{newsImpact.educational_note}"</p>
              </div>
            </div>
            <div className="p-6 bg-slate-50 text-center border-t border-slate-100">
              <button onClick={() => setNewsImpact(null)} className="w-full sm:w-auto px-12 py-3.5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-600 transition-all shadow-lg">Verstanden</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const RiskMetricCard = ({ label, value, desc, status }: {
  label: string;
  value: string;
  desc: string;
  status: 'good' | 'warn' | 'bad';
}) => {
  const statusColors = {
    good: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    warn: 'bg-amber-50 border-amber-100 text-amber-700',
    bad: 'bg-rose-50 border-rose-100 text-rose-700',
  };
  const dotColors = {
    good: 'bg-emerald-500',
    warn: 'bg-amber-500',
    bad: 'bg-rose-500',
  };

  return (
    <div className={`p-4 rounded-2xl border ${statusColors[status]}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full ${dotColors[status]}`} />
        <h4 className="text-[10px] font-black uppercase tracking-widest opacity-70">{label}</h4>
      </div>
      <p className="text-xl font-black tracking-tight">{value}</p>
      <p className="text-[10px] font-medium opacity-60 mt-1">{desc}</p>
    </div>
  );
};

export default PortfolioDeepDive;
