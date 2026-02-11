
import React, { useMemo } from 'react';
import { MOCK_ETFS } from '../constants';
import { ArrowUpRight, ArrowDownRight, Zap, Clock } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

const MiniChart = ({ color }: { color: string }) => {
  const data = useMemo(() => 
    Array.from({ length: 12 }, (_, i) => ({ 
      val: 80 + Math.random() * 20 + (i * 2)
    })), 
  []);

  return (
    <div className="h-10 w-28 group relative">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`polyGradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="val"
            stroke={color}
            strokeWidth={2}
            fillOpacity={1}
            fill={`url(#polyGradient-${color.replace('#', '')})`}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const ETFList: React.FC = () => {
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/30">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-slate-800">Top-Bewertete ETFs</h3>
            <div className="flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-[9px] font-black text-emerald-600 uppercase tracking-tighter">Live</span>
            </div>
          </div>
          <p className="text-xs text-slate-500">Wissenschaftlich fundierte Auswahl mit Echtzeit-Trends.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Update: Gerade eben</span>
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
              <th className="px-6 py-4">ETF / ISIN</th>
              <th className="px-6 py-4">Kategorie</th>
              <th className="px-6 py-4 text-center">Live Trend</th>
              <th className="px-6 py-4">1J Rendite</th>
              <th className="px-6 py-4">Visualisierung</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MOCK_ETFS.map((etf) => (
              <tr key={etf.id} className="hover:bg-slate-50/80 transition-colors group/row cursor-default">
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-sm text-slate-900 group-hover/row:text-blue-600 transition-colors">{etf.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono tracking-tighter uppercase">{etf.isin} · {etf.ticker}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-[10px] font-bold px-2 py-1 bg-blue-50 text-blue-700 rounded-lg">
                    {etf.category}
                  </span>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                    <Zap className={`w-3 h-3 ${etf.oneYearReturn >= 0 ? 'text-amber-500' : 'text-slate-400'}`} />
                    <span className="text-[10px] font-black uppercase tracking-tighter text-slate-700">Momentum</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1 text-xs font-bold ${etf.oneYearReturn >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {etf.oneYearReturn >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {etf.oneYearReturn.toFixed(1)}%
                  </span>
                </td>
                <td className="px-6 py-4">
                  <MiniChart color={etf.oneYearReturn >= 0 ? '#10b981' : '#f43f5e'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ETFList;
