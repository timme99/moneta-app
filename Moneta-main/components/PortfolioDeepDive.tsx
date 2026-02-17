
import React, { useState, useEffect } from 'react';
import { PortfolioAnalysisReport, NewsImpactReport, PortfolioHealthReport, PortfolioSavingsReport } from '../types';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  Legend
} from 'recharts';
import { 
  Newspaper, 
  TrendingUp, 
  Globe, 
  ShieldAlert, 
  BarChart3, 
  Zap, 
  X, 
  Loader2, 
  TrendingDown, 
  ArrowRight, 
  RefreshCcw, 
  Coins,
  Sparkles,
  Info,
  AlertTriangle,
  Info as InfoIcon
} from 'lucide-react';
import { analyzeNewsImpact } from '../services/geminiService';
import { stockService } from '../services/stockService';
import { Alert, AlertTitle, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

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
    <p className="text-[11px] text-slate-600 font-medium leading-relaxed">{note || 'Wird berechnet...'}</p>
  </div>
);

type NewsItem = PortfolioAnalysisReport['news'] extends (infer T)[] ? T : never;

interface PortfolioDeepDiveProps {
  report: PortfolioAnalysisReport | null;
  healthReport: PortfolioHealthReport | null;
  savingsReport: PortfolioSavingsReport | null;
  selectedNewsFromTicker?: NewsItem | null;
  onClearSelectedNews?: () => void;
}

const CACHED_PRICE_LABEL = '08:00 Uhr';

const PortfolioDeepDive: React.FC<PortfolioDeepDiveProps> = ({ report, healthReport, savingsReport, selectedNewsFromTicker, onClearSelectedNews }) => {
  const [analyzingNews, setAnalyzingNews] = useState<string | null>(null);
  const [newsImpact, setNewsImpact] = useState<NewsImpactReport | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [priceFetchFailed, setPriceFetchFailed] = useState(false);

  useEffect(() => {
    const ticker = report?.holdings?.find((h) => h.ticker)?.['ticker'];
    if (!ticker) {
      setPriceLoading(false);
      return;
    }
    let cancelled = false;
    setPriceLoading(true);
    setPriceFetchFailed(false);
    stockService.getQuote(ticker).then((quote) => {
      if (cancelled) return;
      setPriceLoading(false);
      if (quote == null) setPriceFetchFailed(true);
    }).catch(() => {
      if (!cancelled) {
        setPriceLoading(false);
        setPriceFetchFailed(true);
      }
    });
    return () => { cancelled = true; };
  }, [report?.holdings]);

  const handleNewsClick = async (news: any) => {
    setAnalyzingNews(news.title);
    try {
      const impact = await analyzeNewsImpact(news, report!.holdings);
      setNewsImpact(impact);
    } catch (e) {
      console.error("Fehler bei der Analyse der News", e);
    } finally {
      setAnalyzingNews(null);
    }
  };

  useEffect(() => {
    if (!report || !selectedNewsFromTicker) return;
    document.getElementById('depot-news')?.scrollIntoView({ behavior: 'smooth' });
    (async () => {
      await handleNewsClick(selectedNewsFromTicker);
      onClearSelectedNews?.();
    })();
  }, [selectedNewsFromTicker]);

  if (!report) return null;

  const factors = healthReport?.factors;

  return (
    <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700">
      
      {/* 1. PORTFOLIO ÜBERBLICK */}
      <div className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">Depot-Überblick</h3>
          </div>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm self-stretch sm:self-auto justify-center min-w-[180px] min-h-[40px]">
            {priceLoading ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <>
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Börsen-Live-Daten</span>
              </>
            )}
          </div>
        </div>

        {(priceFetchFailed || priceLoading) && (
          <div className="px-6 md:px-8 pb-4">
            {priceLoading && (
              <div className="flex gap-3 items-center rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-4 flex-1 max-w-[200px] rounded" />
              </div>
            )}
            {priceFetchFailed && (
              <Alert className="border-slate-200 bg-slate-50 text-slate-700 mt-3">
                <InfoIcon className="h-4 w-4 text-slate-500" />
                <AlertTitle className="text-slate-800 text-xs font-semibold">Echtzeit-Daten vorübergehend nicht verfügbar</AlertTitle>
                <AlertDescription>
                  Echtzeit-Daten aktuell ausgelastet, nutze gecachte Werte von {CACHED_PRICE_LABEL}.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Mobile-Ansicht (Karten) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {report.holdings?.map((holding, i) => (
            <div key={i} className="p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  <span className="font-bold text-slate-900 text-sm leading-tight">{holding.name}</span>
                  <span className="text-[10px] font-mono text-slate-400 mt-0.5">{holding.ticker || holding.isin || 'N/A'}</span>
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shrink-0 ${
                  holding.decision === 'Kaufen' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                  holding.decision === 'Verkaufen' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                  'bg-slate-100 text-slate-600 border border-slate-200'
                }`}>
                  {holding.decision}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gewichtung</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600" style={{ width: `${holding.weight}%` }} />
                    </div>
                    <span className="text-xs font-black text-slate-900">{holding.weight}%</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Markttrend</p>
                  <p className={`text-xs font-black ${
                    holding.trend?.toLowerCase().includes('hoch') || holding.trend?.toLowerCase().includes('up') ? 'text-emerald-600' : 
                    holding.trend?.toLowerCase().includes('runter') || holding.trend?.toLowerCase().includes('down') ? 'text-rose-600' : 
                    'text-slate-600'
                  }`}>
                    {holding.trend || 'Stabil'}
                  </p>
                </div>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-2xl">
                <p className="text-[11px] font-medium text-slate-600 leading-relaxed italic">
                  <span className="font-black text-slate-400 mr-1 opacity-50">KI:</span>
                  {holding.reason}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop-Ansicht (Tabelle) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="px-8 py-4">Firma / Anlage</th>
                <th className="px-8 py-4">Gewichtung</th>
                <th className="px-8 py-4">KI-Check</th>
                <th className="px-8 py-4">Warum?</th>
                <th className="px-8 py-4">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.holdings?.map((holding, i) => (
                <tr key={i} className="group hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-6">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900 text-sm">{holding.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">{holding.ticker || holding.isin || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 w-12 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600" style={{ width: `${holding.weight}%` }} />
                      </div>
                      <span className="text-xs font-black text-slate-900">{holding.weight}%</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                      holding.decision === 'Kaufen' ? 'bg-emerald-50 text-emerald-600' :
                      holding.decision === 'Verkaufen' ? 'bg-rose-50 text-rose-600' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {holding.decision}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <p className="text-xs font-medium text-slate-600 max-w-xs leading-relaxed">{holding.reason}</p>
                  </td>
                  <td className="px-8 py-6">
                    <div className={`flex items-center gap-1 text-xs font-black ${
                      holding.trend?.toLowerCase().includes('hoch') || holding.trend?.toLowerCase().includes('up') ? 'text-emerald-600' : 
                      holding.trend?.toLowerCase().includes('runter') || holding.trend?.toLowerCase().includes('down') ? 'text-rose-600' : 
                      'text-slate-400'
                    }`}>
                      {holding.trend || 'Stabil'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. NEWS */}
      <div id="depot-news" className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-200 p-6 md:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-3">
            <Newspaper className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">Depot-News</h3>
          </div>
          <div className="bg-blue-50 px-4 py-1.5 rounded-full border border-blue-100 flex items-center gap-2 self-stretch sm:self-auto justify-center">
            <Sparkles className="w-3 h-3 text-blue-600" />
            <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest">Relevanz-Filter Aktiv</span>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {report.news?.length > 0 ? report.news.map((item, i) => (
            <div key={i} className="p-6 bg-slate-50 rounded-[28px] md:rounded-[32px] border border-slate-100 flex flex-col group hover:border-blue-200 transition-all hover:shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${
                  item.importance === 'hoch' ? 'bg-rose-100 text-rose-600' :
                  item.importance === 'mittel' ? 'bg-amber-100 text-amber-600' :
                  'bg-blue-100 text-blue-600'
                }`}>
                  {item.importance}e Relevanz
                </span>
                <span className="text-2xl">{item.impact_emoji}</span>
              </div>
              
              <h4 className="font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors leading-snug">
                {item.title}
              </h4>
              
              <div className="bg-white/60 p-4 rounded-2xl border border-white/40 mb-6 flex-1">
                <p className="text-xs text-slate-600 font-medium leading-relaxed italic">
                  "{item.snippet}"
                </p>
              </div>

              <button 
                onClick={() => handleNewsClick(item)}
                disabled={!!analyzingNews}
                className="w-full py-3.5 md:py-4 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                {analyzingNews === item.title ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                Impact-Check
              </button>
            </div>
          )) : (
            <div className="col-span-full py-12 text-center bg-slate-50 rounded-[32px] border border-dashed border-slate-200">
              <p className="text-slate-400 text-sm font-medium">Keine kritischen Meldungen zu deinen Werten.</p>
            </div>
          )}
        </div>
      </div>

      {/* 3. SICHERHEITS-CHECK */}
      {healthReport && (
        <div className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-200 p-6 md:p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <ShieldAlert className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">Analyse-Werte</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SimpleHealthCard 
              title="Streuung" 
              score={factors?.diversification?.score} 
              note={factors?.diversification?.note}
              icon={Globe}
              explanation="Verteilung über Länder und Branchen."
            />
            <SimpleHealthCard 
              title="Kosten" 
              score={factors?.cost_efficiency?.score} 
              note={factors?.cost_efficiency?.note}
              icon={Coins}
              explanation="Wie viel Gebühren fressen dein Vermögen?"
            />
            <SimpleHealthCard 
              title="Balance" 
              score={factors?.risk_balance?.score} 
              note={factors?.risk_balance?.note}
              icon={TrendingUp}
              explanation="Verhältnis von Sicherheit zu Rendite."
            />
            <SimpleHealthCard 
              title="Stabilität" 
              score={factors?.allocation_drift?.score} 
              note={factors?.allocation_drift?.note}
              icon={RefreshCcw}
              explanation="Treue zur gewählten Strategie."
            />
          </div>
        </div>
      )}

      {/* 4. CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        <div className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-200 p-6 md:p-8 shadow-sm">
          <h3 className="text-lg font-black text-slate-900 tracking-tight mb-8 text-center lg:text-left">Verteilung: Themen</h3>
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={report.sectors || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {(report.sectors || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontSize: '11px', fontWeight: '800' }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={40} 
                  wrapperStyle={{ fontSize: '10px', fontWeight: '600', paddingTop: '20px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-200 p-6 md:p-8 shadow-sm">
          <h3 className="text-lg font-black text-slate-900 tracking-tight mb-8 text-center lg:text-left">Verteilung: Regionen</h3>
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={report.regions || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {(report.regions || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontSize: '11px', fontWeight: '800' }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={40} 
                  wrapperStyle={{ fontSize: '10px', fontWeight: '600', paddingTop: '20px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 5. NÄCHSTE SCHRITTE */}
      <div className="bg-blue-600 rounded-[32px] md:rounded-[40px] p-8 md:p-12 text-white relative overflow-hidden shadow-2xl shadow-blue-600/30">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <Zap className="w-6 h-6 text-amber-400" />
            <h3 className="text-xl md:text-2xl font-black tracking-tight">Konkrete Schritte</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {report.nextSteps?.map((step, i) => (
              <div key={i} className="bg-white/10 backdrop-blur-md border border-white/20 p-6 rounded-[24px] md:rounded-[32px] flex items-start gap-4">
                <div className="bg-white/20 p-3 rounded-2xl shrink-0">
                  <ArrowRight className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="font-bold text-base md:text-lg mb-1">{step.action}</h4>
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
                <h2 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">Impact-Check</h2>
              </div>
              <button onClick={() => setNewsImpact(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            <div className="p-6 md:p-8 space-y-6 md:space-y-8 overflow-y-auto max-h-[70vh]">
              <div className={`p-6 rounded-[24px] md:rounded-[32px] border ${
                newsImpact.relevance === 'high' ? 'bg-rose-50 border-rose-100 text-rose-900' :
                newsImpact.relevance === 'medium' ? 'bg-amber-50 border-amber-100 text-amber-900' :
                'bg-blue-50 border-blue-100 text-blue-900'
              }`}>
                <p className="font-bold text-sm md:text-base leading-relaxed">{newsImpact.impact_summary}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="bg-slate-50 p-6 rounded-[24px] md:rounded-[32px] border border-slate-100">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Positiv</span>
                  <p className="text-xs text-slate-600 font-medium leading-relaxed mt-2">{newsImpact.perspectives?.bullish}</p>
                </div>
                <div className="bg-slate-50 p-6 rounded-[24px] md:rounded-[32px] border border-slate-100">
                  <span className="text-[10px] font-black uppercase tracking-widest text-rose-600">Negativ</span>
                  <p className="text-xs text-slate-600 font-medium leading-relaxed mt-2">{newsImpact.perspectives?.bearish}</p>
                </div>
              </div>

              <div className="bg-blue-600 p-6 md:p-8 rounded-[24px] md:rounded-[32px] text-white">
                <p className="text-sm font-medium leading-relaxed italic">"{newsImpact.educational_note}"</p>
              </div>
            </div>
            <div className="p-6 bg-slate-50 text-center border-t border-slate-100">
              <button onClick={() => setNewsImpact(null)} className="w-full sm:w-auto px-12 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-600 transition-all shadow-lg">Verstanden</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortfolioDeepDive;
