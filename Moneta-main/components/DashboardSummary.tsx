/**
 * DashboardSummary – Kennzahlen + KI-Markteinschätzungen
 *
 * Ausschließlich echte, daten-getriebene Metriken:
 *  1. Gesundheits-Score   (healthReport.health_score oder report.score)
 *  2. Diversifikation     (report.diversification_score + Sektoren/Regionen)
 *  3. Risiko-Profil       (report.risk_level → lesbare Bezeichnung)
 *  4. Sparpotenzial       (savingsReport, nur wenn > 0€)
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, PieChart, AlertTriangle, Sparkles,
  RefreshCcw, Loader2, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import type {
  PortfolioAnalysisReport, PortfolioHealthReport,
  PortfolioSavingsReport, HoldingRow,
} from '../types';
import { generateHoldingTheses } from '../services/geminiService';

interface Props {
  report:        PortfolioAnalysisReport | null;
  healthReport:  PortfolioHealthReport   | null;
  savingsReport: PortfolioSavingsReport  | null;
  insight:       null;
  holdings?:     HoldingRow[];
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

const scoreColor = (s: number) =>
  s >= 7 ? 'text-emerald-700' : s >= 5 ? 'text-amber-700' : 'text-rose-600';
const scoreBg = (s: number) =>
  s >= 7 ? 'bg-emerald-50' : s >= 5 ? 'bg-amber-50' : 'bg-rose-50';
const scoreBorder = (s: number) =>
  s >= 7 ? 'border-emerald-200' : s >= 5 ? 'border-amber-200' : 'border-rose-200';

const RISK: Record<string, { label: string; sub: string; color: string; bg: string }> = {
  low:    { label: 'Konservativ', sub: 'Kapitalerhalt im Fokus',  color: 'text-emerald-700', bg: 'bg-emerald-50' },
  medium: { label: 'Ausgewogen',  sub: 'Rendite & Sicherheit',    color: 'text-amber-700',   bg: 'bg-amber-50'   },
  high:   { label: 'Wachstum',    sub: 'Maximales Wachstum',      color: 'text-rose-700',    bg: 'bg-rose-50'    },
};

// ── Metric-Karte ──────────────────────────────────────────────────────────────

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

// ── Sentiment-Chip ────────────────────────────────────────────────────────────

const Sentiment: React.FC<{ s: string }> = ({ s }) => {
  const cfg = s === 'Positiv'
    ? { cls: 'bg-emerald-50 text-emerald-700', Icon: TrendingUp }
    : s === 'Negativ'
    ? { cls: 'bg-rose-50 text-rose-600',       Icon: TrendingDown }
    : { cls: 'bg-slate-100 text-slate-500',    Icon: Minus };
  const { cls, Icon } = cfg;
  return (
    <span className={`flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full ${cls}`}>
      <Icon className="w-3 h-3" />
      {s}
    </span>
  );
};

// ── Hauptkomponente ───────────────────────────────────────────────────────────

const DashboardSummary: React.FC<Props> = ({ report, healthReport, savingsReport, holdings }) => {

  // Metriken
  const score    = healthReport?.health_score ?? report?.score ?? null;
  const divScore = report?.diversification_score ?? null;
  const riskKey  = report?.risk_level ?? 'medium';
  const risk     = RISK[riskKey] ?? RISK.medium;
  const sectors  = report?.sectors?.length ?? 0;
  const regions  = report?.regions?.length ?? 0;
  const savings  = savingsReport?.potential_savings ?? '';
  const hasSavings = savings && savings !== '0€' && savings !== '0' && !savings.startsWith('0');

  // KI-Einschätzungen
  const inputs = (holdings ?? []).filter(h => !h.watchlist).map(h => ({
    name:     h.ticker?.company_name ?? h.name ?? h.symbol,
    ticker:   h.symbol,
    shares:   h.shares,
    buyPrice: h.buy_price,
  }));

  // Stabiler Schlüssel aus den tatsächlichen Symbolen – erkennt Änderungen auch bei
  // gleichbleibender Anzahl (z.B. Aktie gelöscht & neue hinzugefügt).
  const holdingsKey = (holdings ?? [])
    .filter(h => !h.watchlist)
    .map(h => h.symbol)
    .sort()
    .join(',');

  const [theses,  setTheses]  = useState<{ ticker: string; thesis: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded,  setLoaded]  = useState(false);

  useEffect(() => {
    if (inputs.length > 0) load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdingsKey]);

  const load = async () => {
    if (!inputs.length) return;
    setLoading(true);
    try {
      setTheses(await generateHoldingTheses(inputs.slice(0, 8)));
      setLoaded(true);
    } catch { /* silent */ } finally { setLoading(false); }
  };

  return (
    <div className="space-y-5">

      {/* ── Metriken ───────────────────────────────────────────────────────── */}
      <div className={`grid gap-4 ${hasSavings ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}>
        {score != null && (
          <Metric
            icon={ShieldCheck}
            label="Gesundheits-Score"
            value={`${score}/10`}
            sub={healthReport?.status ?? (score >= 7 ? 'Solide aufgestellt' : score >= 5 ? 'Verbesserungsbedarf' : 'Handlungsbedarf')}
            color={scoreColor(score)} bg={scoreBg(score)} border={scoreBorder(score)}
          />
        )}
        {divScore != null && (
          <Metric
            icon={PieChart}
            label="Diversifikation"
            value={`${divScore}/10`}
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

      {/* ── KI-Einschätzungen ──────────────────────────────────────────────── */}
      {inputs.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-[28px] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.18em]">
                KI-Einschätzungen
              </h3>
            </div>
            <button
              onClick={() => { setLoaded(false); load(); }}
              disabled={loading}
              className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 hover:text-emerald-600 uppercase tracking-widest transition-colors disabled:opacity-40"
            >
              <RefreshCcw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Aktualisieren
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-3 py-8">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                KI analysiert Positionen…
              </span>
            </div>
          )}

          {!loading && theses.length > 0 && (
            <div className="divide-y divide-slate-50">
              {theses.map((t, i) => {
                const inp = inputs.find(x => x.ticker === t.ticker);
                const rep = report?.holdings?.find(x => x.ticker === t.ticker || x.name === (inp?.name ?? ''));
                return (
                  <div key={i} className="px-6 py-4 flex items-start gap-4 hover:bg-slate-50/60 transition-colors">
                    <div className="shrink-0 w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center">
                      <span className="text-[8px] font-black text-slate-600 font-mono">
                        {t.ticker.slice(0, 4)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 truncate">
                          {inp?.name ?? t.ticker}
                        </span>
                        <span className="text-[9px] font-mono text-slate-400">{t.ticker}</span>
                        {rep?.sentiment && <Sentiment s={rep.sentiment} />}
                        {inp?.shares != null && (
                          <span className="text-[9px] text-slate-400 font-medium">{inp.shares} Stk.</span>
                        )}
                      </div>
                      <p className="text-[12px] text-slate-600 leading-relaxed">{t.thesis}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && theses.length === 0 && loaded && (
            <p className="px-6 py-8 text-center text-[11px] text-slate-400">
              Keine Einschätzungen verfügbar.
            </p>
          )}

          <div className="px-6 py-3 border-t border-slate-50 bg-slate-50/50">
            <p className="text-[9px] text-slate-400">
              KI-generiert · keine Anlageberatung · {new Date().toLocaleDateString('de-DE')}
            </p>
          </div>
        </div>
      )}

      {/* ── Compliance – einzeilig ─────────────────────────────────────────── */}
      <p className="text-[9px] text-slate-400 font-medium text-center px-4">
        Alle Analysen sind informativ und ersetzen keine Beratung durch einen zugelassenen Finanzberater · Kein Anlageberatungsangebot gemäß KWG/WpIG
      </p>
    </div>
  );
};

export default DashboardSummary;
