/**
 * PerformanceChart – Historische Depot-Performance als Linechart.
 *
 * Zeigt:
 *  - Depotwert-Verlauf (portfolio_snapshots)
 *  - Einstandswert-Linie (total_invested) für Performance-Delta
 *
 * Premium-Gate: Free-User sehen nur 7 Tage, Premium 12 Monate.
 * Wenn weniger als 2 Datenpunkte vorhanden sind, wird eine Hinweis-Card
 * angezeigt ("Daten werden morgen verfügbar sein").
 */

import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Loader2, Lock, Info } from 'lucide-react';
import { getSupabaseBrowser } from '../lib/supabaseBrowser';
import { useSubscription, PLAN_LIMITS } from '../lib/useSubscription';

interface PerformanceChartProps {
  userId: string | null | undefined;
  onUpgradeClick: () => void;
  totalInvested?: number;
  positionCount?: number;
  watchlistCount?: number;
}

interface SnapshotRow {
  snapshot_date: string;
  total_value: number;
  total_invested: number | null;
}

interface ChartPoint {
  date: string;
  value: number;
  invested: number | null;
}

const fmt = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const val = payload.find((p: any) => p.dataKey === 'value')?.value;
  const inv = payload.find((p: any) => p.dataKey === 'invested')?.value;
  const perf = val && inv && inv > 0 ? ((val - inv) / inv) * 100 : null;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-lg text-xs">
      <p className="font-black text-slate-500 mb-1">{label}</p>
      <p className="font-bold text-slate-900">Depotwert: {val != null ? fmt(val) + ' €' : '—'}</p>
      {inv != null && <p className="font-medium text-slate-400">Einstand: {fmt(inv)} €</p>}
      {perf != null && (
        <p className={`font-black mt-1 ${perf >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
          {perf >= 0 ? '+' : ''}{perf.toFixed(2)} %
        </p>
      )}
    </div>
  );
};

const PerformanceChart: React.FC<PerformanceChartProps> = ({ userId, onUpgradeClick, totalInvested, positionCount, watchlistCount }) => {
  const sub = useSubscription(userId);
  const [data, setData] = useState<ChartPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const maxDays = PLAN_LIMITS[sub.plan].performanceDays;

  useEffect(() => {
    if (!userId || sub.isLoading) return;

    const sb = getSupabaseBrowser();
    if (!sb) { setIsLoading(false); return; }

    const since = maxDays === Infinity
      ? new Date(0).toISOString().slice(0, 10)
      : new Date(Date.now() - maxDays * 86_400_000).toISOString().slice(0, 10);

    sb.from('portfolio_snapshots')
      .select('snapshot_date, total_value, total_invested')
      .eq('user_id', userId)
      .gte('snapshot_date', since)
      .order('snapshot_date', { ascending: true })
      .then(({ data: rows }) => {
        setData(
          (rows ?? []).map((r: SnapshotRow) => ({
            date:     fmtDate(r.snapshot_date),
            value:    r.total_value,
            invested: r.total_invested,
          }))
        );
        setIsLoading(false);
      });
  }, [userId, sub.isLoading, sub.plan, maxDays]);

  if (isLoading || sub.isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-[24px] p-6 flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
      </div>
    );
  }

  // Weniger als 2 Datenpunkte → Hinweis
  if (data.length < 2) {
    return (
      <div className="bg-white border border-slate-200 rounded-[24px] p-6">
        <div className="flex items-center gap-3 mb-3">
          <TrendingUp className="w-5 h-5 text-emerald-600 shrink-0" />
          <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.15em]">
            Performance-Chart
          </h3>
        </div>
        <div className="flex items-start gap-3 bg-emerald-50 rounded-2xl p-4">
          <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-emerald-600 font-medium leading-relaxed">
            Dein erster Snapshot wird heute Nacht erstellt. Ab morgen siehst du hier
            die historische Entwicklung deines Depots.
          </p>
        </div>
        {/* Stat-Badges */}
        {positionCount != null && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[9px] font-black text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
              {positionCount} Position{positionCount !== 1 ? 'en' : ''}
              {watchlistCount != null && watchlistCount > 0 && ` · ${watchlistCount} Watchlist`}
            </span>
          </div>
        )}
      </div>
    );
  }

  const latest   = data[data.length - 1];
  const first    = data[0];
  const perfAbs  = latest.value - first.value;
  const perfPct  = first.value > 0 ? (perfAbs / first.value) * 100 : 0;
  const isUp     = perfAbs >= 0;

  // Premium-Teaser für Free-User (zeige nur 7 Tage, danach Lock)
  const showLock = !sub.isPremium && data.length >= PLAN_LIMITS.free.performanceDays;

  return (
    <div className="bg-white border border-slate-200 rounded-[24px] overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-6 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isUp
              ? <TrendingUp className="w-4 h-4 text-emerald-500" />
              : <TrendingDown className="w-4 h-4 text-rose-500" />}
            <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.15em]">
              Performance-Chart
            </h3>
          </div>
          <div className="text-right">
            <p className="text-sm font-black text-slate-900">{fmt(latest.value)} €</p>
            <p className={`text-[9px] font-bold ${isUp ? 'text-emerald-600' : 'text-rose-500'}`}>
              {isUp ? '+' : ''}{fmt(perfAbs)} € ({isUp ? '+' : ''}{perfPct.toFixed(2)} %)
            </p>
          </div>
        </div>
        {/* Stat-Badges */}
        {(totalInvested != null || positionCount != null) && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {totalInvested != null && totalInvested > 0 && (
              <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">
                Einstand {totalInvested.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €
              </span>
            )}
            {positionCount != null && (
              <span className="inline-flex items-center gap-1 text-[9px] font-black text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
                {positionCount} Position{positionCount !== 1 ? 'en' : ''}
                {watchlistCount != null && watchlistCount > 0 && ` · ${watchlistCount} Watchlist`}
              </span>
            )}
            {totalInvested != null && positionCount != null && positionCount > 0 && totalInvested > 0 && (
              <span className="inline-flex items-center gap-1 text-[9px] font-black text-slate-500 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg">
                Ø {Math.round(totalInvested / positionCount).toLocaleString('de-DE')} € / Position
              </span>
            )}
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="px-2 py-4 h-48 relative">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}
              width={48}
            />
            <Tooltip content={<CustomTooltip />} />
            {data[0]?.invested != null && (
              <Line
                dataKey="invested"
                stroke="#cbd5e1"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
              />
            )}
            <Line
              dataKey="value"
              stroke={isUp ? '#10b981' : '#f43f5e'}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: isUp ? '#10b981' : '#f43f5e' }}
            />
          </LineChart>
        </ResponsiveContainer>

        {/* Premium-Overlay für Free-User */}
        {showLock && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-[2px] rounded-b-[24px]">
            <Lock className="w-5 h-5 text-slate-400 mb-2" />
            <p className="text-[10px] font-bold text-slate-600 mb-3">
              Mehr als 7 Tage Historie = Premium
            </p>
            <button
              onClick={onUpgradeClick}
              className="text-[9px] font-black text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl transition-colors uppercase tracking-widest"
            >
              Jetzt upgraden
            </button>
          </div>
        )}
      </div>

      {/* Legende */}
      <div className="px-6 pb-4 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className={`w-3 h-0.5 rounded-full ${isUp ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <span className="text-[9px] font-bold text-slate-400">Depotwert</span>
        </div>
        {data[0]?.invested != null && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-slate-300 rounded-full" style={{ borderTop: '2px dashed #cbd5e1' }} />
            <span className="text-[9px] font-bold text-slate-400">Einstand</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PerformanceChart;
