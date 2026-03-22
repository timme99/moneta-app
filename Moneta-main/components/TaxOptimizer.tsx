import React, { useState, useMemo, useCallback } from 'react';
import {
  Receipt, ChevronDown, ChevronUp, Info, TrendingUp, TrendingDown,
  Loader2, RefreshCw, AlertTriangle, Lightbulb, CheckCircle2,
} from 'lucide-react';
import type { HoldingRow } from '../types';
import { stockService } from '../services/stockService';

interface TaxOptimizerProps {
  holdings: HoldingRow[];
  isPremium: boolean;
}

// ── Steuer-Konstanten ────────────────────────────────────────────────────────
const ABGELTUNG_RATE  = 0.25;
const SOLI_RATE       = 0.055;  // 5,5 % der Abgeltungssteuer
const FREIBETRAG_SINGLE = 1000;
const FREIBETRAG_JOINT  = 2000;

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const fmtPct = (n: number) =>
  (n >= 0 ? '+' : '') + n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';

// ── Komponente ───────────────────────────────────────────────────────────────
const TaxOptimizer: React.FC<TaxOptimizerProps> = ({ holdings }) => {
  // ── Settings-State ────────────────────────────────────────────────────────
  const [veranlagung, setVeranlagung]     = useState<'single' | 'joint'>('single');
  const [genutzterFB, setGenutzterFB]     = useState(0);
  const [kirchenAktiv, setKirchenAktiv]   = useState(false);
  const [kirchenRate, setKirchenRate]     = useState<0.08 | 0.09>(0.09);
  const [settingsOpen, setSettingsOpen]   = useState(true);

  // ── Positions-State ───────────────────────────────────────────────────────
  const [sellPrices, setSellPrices]   = useState<Record<string, string>>({});
  const [sellShares, setSellShares]   = useState<Record<string, string>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [priceMsg, setPriceMsg]           = useState<string | null>(null);

  // Nur echte Positionen (keine Watchlist)
  const realHoldings = useMemo(
    () => holdings.filter(h => !h.watchlist && h.buy_price != null && h.shares != null),
    [holdings],
  );

  // ── Kurse laden ───────────────────────────────────────────────────────────
  const loadPrices = useCallback(async () => {
    setLoadingPrices(true);
    setPriceMsg(null);
    let loaded = 0;
    let failed = 0;
    const batch = realHoldings.slice(0, 5);
    for (const h of batch) {
      const quote = await stockService.getQuote(h.symbol);
      if (quote?.price) {
        setSellPrices(prev => ({ ...prev, [h.symbol]: String(quote.price) }));
        loaded++;
      } else {
        failed++;
      }
    }
    setLoadingPrices(false);
    if (realHoldings.length > 5) {
      setPriceMsg(`${loaded} von ${batch.length} Kursen geladen (API-Limit: max. 5 pro Aufruf). Weitere manuell eingeben.`);
    } else {
      setPriceMsg(loaded > 0 ? `${loaded} Kurs${loaded !== 1 ? 'e' : ''} geladen.` : 'Keine Kurse verfügbar (API-Limit erreicht).');
    }
    if (failed > 0 && loaded === 0) {
      setPriceMsg('API-Limit erreicht. Verkaufspreise bitte manuell eingeben.');
    }
  }, [realHoldings]);

  // ── Steuerberechnung ──────────────────────────────────────────────────────
  const computation = useMemo(() => {
    const freibetrag = (veranlagung === 'joint' ? FREIBETRAG_JOINT : FREIBETRAG_SINGLE) - genutzterFB;
    const verfügbarerFB = Math.max(0, freibetrag);

    const positions = realHoldings.map(h => {
      const kaufkurs  = h.buy_price!;
      const maxShares = h.shares!;
      const verkaufkurs = parseFloat(sellPrices[h.symbol] ?? '') || kaufkurs;
      const verkaufteStueck = Math.min(
        parseFloat(sellShares[h.symbol] ?? '') || maxShares,
        maxShares,
      );
      const investiert  = kaufkurs  * verkaufteStueck;
      const erlös       = verkaufkurs * verkaufteStueck;
      const gewinnVerlust = erlös - investiert;
      const pctChange   = kaufkurs > 0 ? ((verkaufkurs - kaufkurs) / kaufkurs) * 100 : 0;
      return {
        symbol:       h.symbol,
        name:         h.ticker?.company_name ?? h.name ?? h.symbol,
        kaufkurs,
        maxShares,
        verkaufteStueck,
        verkaufkurs,
        investiert,
        erlös,
        gewinnVerlust,
        pctChange,
      };
    });

    const totalErlös    = positions.reduce((s, p) => s + p.erlös, 0);
    const nettoGewinn   = positions.reduce((s, p) => s + p.gewinnVerlust, 0);
    const totalGewinne  = positions.filter(p => p.gewinnVerlust > 0).reduce((s, p) => s + p.gewinnVerlust, 0);
    const totalVerluste = positions.filter(p => p.gewinnVerlust < 0).reduce((s, p) => s + p.gewinnVerlust, 0);

    const steuerpflichtig    = Math.max(0, nettoGewinn - verfügbarerFB);
    const genutzterFreibetrag = Math.min(verfügbarerFB, Math.max(0, nettoGewinn));
    const abgeltungssteuer   = steuerpflichtig * ABGELTUNG_RATE;
    const soli               = abgeltungssteuer * SOLI_RATE;
    const kirchensteuer      = kirchenAktiv ? abgeltungssteuer * kirchenRate : 0;
    const gesamtSteuer       = abgeltungssteuer + soli + kirchensteuer;
    const nettoErlös         = totalErlös - gesamtSteuer;
    const effektivRate       = nettoGewinn > 0 ? (gesamtSteuer / nettoGewinn) * 100 : 0;

    return {
      positions,
      totalErlös,
      nettoGewinn,
      totalGewinne,
      totalVerluste,
      verfügbarerFB,
      genutzterFreibetrag,
      steuerpflichtig,
      abgeltungssteuer,
      soli,
      kirchensteuer,
      gesamtSteuer,
      nettoErlös,
      effektivRate,
    };
  }, [realHoldings, sellPrices, sellShares, veranlagung, genutzterFB, kirchenAktiv, kirchenRate]);

  // ── Optimierungshinweise ──────────────────────────────────────────────────
  const hints = useMemo(() => {
    const tips: { type: 'good' | 'info' | 'warn'; text: string }[] = [];
    const { verfügbarerFB, genutzterFreibetrag, nettoGewinn, totalVerluste, steuerpflichtig } = computation;

    if (verfügbarerFB > 0 && genutzterFreibetrag < verfügbarerFB) {
      const rest = verfügbarerFB - genutzterFreibetrag;
      tips.push({ type: 'good', text: `Freibetrag noch nicht ausgeschöpft: Du kannst noch ${fmt(rest)} Gewinn steuerfrei realisieren.` });
    }
    if (totalVerluste < 0 && nettoGewinn > 0) {
      const savings = Math.abs(totalVerluste) * ABGELTUNG_RATE * (1 + SOLI_RATE);
      tips.push({ type: 'info', text: `Verlustpositionen im Depot: Verkauf spart bis zu ${fmt(savings)} Steuern (Verlustverrechnung).` });
    }
    if (steuerpflichtig > 0 && totalVerluste < 0) {
      tips.push({ type: 'warn', text: 'Tipp: Verkaufe zuerst Verlustpositionen, um steuerpflichtigen Gewinn zu reduzieren.' });
    }
    if (nettoGewinn <= 0 && verfügbarerFB > 0) {
      tips.push({ type: 'good', text: 'Kein steuerpflichtiger Gewinn – du zahlst bei dieser Simulation keine Steuer.' });
    }
    return tips;
  }, [computation]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (realHoldings.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-[28px] p-12 text-center shadow-sm">
        <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <p className="text-sm font-bold text-slate-500">Keine Depot-Positionen vorhanden.</p>
        <p className="text-xs text-slate-400 mt-1">Füge Aktien oder ETFs hinzu, um die Steuer zu berechnen.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-800 via-teal-700 to-cyan-700 rounded-[32px] md:rounded-[40px] p-4 md:p-8 text-white shadow-2xl">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <Receipt className="w-7 h-7 text-emerald-200" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Steueroptimierung</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter mb-2">Steuerrechner</h1>
          <p className="text-emerald-100 text-sm max-w-xl">
            Simuliere deine Kapitalertragsteuer nach deutschem Recht. Passe Verkaufspreise und
            Stückzahlen an – die Steuer wird in Echtzeit berechnet.
          </p>
        </div>
        <div className="absolute -right-8 -top-8 w-48 h-48 rounded-full bg-white/5" />
        <div className="absolute -right-4 -bottom-12 w-64 h-64 rounded-full bg-white/5" />
      </div>

      {/* ── Disclaimer ── */}
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-2xl px-5 py-3">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
        <p className="text-[10px] text-amber-700 font-bold">
          Diese Berechnung dient nur zur Orientierung und ersetzt keine Steuerberatung. Individuelle Umstände (z. B. Verlustverrechnungstöpfe, Freistellungsaufträge bei anderen Banken) sind nicht berücksichtigt.
        </p>
      </div>

      {/* ── Einstellungen ── */}
      <div className="bg-white border border-slate-200 rounded-[28px] shadow-sm overflow-hidden">
        <button
          onClick={() => setSettingsOpen(v => !v)}
          className="w-full flex items-center justify-between px-6 py-5 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Receipt className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-black text-slate-900 uppercase tracking-widest">Steuereinstellungen</span>
          </div>
          {settingsOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {settingsOpen && (
          <div className="px-6 pb-6 space-y-6 border-t border-slate-100 pt-5">

            {/* Veranlagungsart */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Veranlagungsart</label>
              <div className="flex gap-2">
                {(['single', 'joint'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setVeranlagung(v)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                      veranlagung === v
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {v === 'single' ? `Einzelveranlagung (${FREIBETRAG_SINGLE.toLocaleString('de-DE')} €)` : `Zusammenveranlagung (${FREIBETRAG_JOINT.toLocaleString('de-DE')} €)`}
                  </button>
                ))}
              </div>
            </div>

            {/* Bereits genutzter Freibetrag */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Bereits genutzter Sparerpauschbetrag
                </label>
                <span className="text-sm font-black text-emerald-700">{genutzterFB.toLocaleString('de-DE')} €</span>
              </div>
              <input
                type="range"
                min={0}
                max={veranlagung === 'joint' ? FREIBETRAG_JOINT : FREIBETRAG_SINGLE}
                step={10}
                value={genutzterFB}
                onChange={e => setGenutzterFB(Number(e.target.value))}
                className="w-full accent-emerald-700"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>0 €</span>
                <span>{(veranlagung === 'joint' ? FREIBETRAG_JOINT : FREIBETRAG_SINGLE).toLocaleString('de-DE')} €</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Verbleibender Freibetrag: <strong className="text-emerald-700">{Math.max(0, (veranlagung === 'joint' ? FREIBETRAG_JOINT : FREIBETRAG_SINGLE) - genutzterFB).toLocaleString('de-DE')} €</strong>
              </p>
            </div>

            {/* Kirchensteuer */}
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setKirchenAktiv(v => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${kirchenAktiv ? 'bg-emerald-600' : 'bg-slate-200'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${kirchenAktiv ? 'translate-x-5' : ''}`} />
                </button>
                <span className="text-xs font-bold text-slate-700">Kirchensteuer</span>
              </div>
              {kirchenAktiv && (
                <div className="flex gap-2">
                  {([0.08, 0.09] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setKirchenRate(r)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                        kirchenRate === r
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {(r * 100).toFixed(0)} % (Bayern/BW: 8 %, sonst 9 %)
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* ── Positions-Tabelle ── */}
      <div className="bg-white border border-slate-200 rounded-[28px] shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Positionen simulieren</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">Passe Verkaufskurs und Stückzahl an</p>
          </div>
          <button
            onClick={loadPrices}
            disabled={loadingPrices}
            className="flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-colors disabled:opacity-50"
          >
            {loadingPrices
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
            Kurse laden (max. 5)
          </button>
        </div>

        {priceMsg && (
          <div className="mx-6 mt-4 flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2">
            <Info className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <p className="text-[10px] text-emerald-700">{priceMsg}</p>
          </div>
        )}

        {/* Desktop-Tabelle */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm hidden md:table">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="text-left px-6 py-3">Position</th>
                <th className="text-right px-4 py-3">Kaufkurs</th>
                <th className="text-right px-4 py-3">Stückzahl</th>
                <th className="text-right px-4 py-3">Verkaufskurs</th>
                <th className="text-right px-4 py-3">Gewinn/Verlust</th>
                <th className="text-right px-6 py-3">Steuer (est.)</th>
              </tr>
            </thead>
            <tbody>
              {computation.positions.map(pos => {
                const isGain = pos.gewinnVerlust > 0;
                const isLoss = pos.gewinnVerlust < 0;
                return (
                  <tr key={pos.symbol} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="font-bold text-slate-900 truncate max-w-[160px]">{pos.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{pos.symbol}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 font-mono text-xs">{fmt(pos.kaufkurs)}</td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min={0}
                        max={pos.maxShares}
                        step={1}
                        value={sellShares[pos.symbol] ?? pos.maxShares}
                        onChange={e => setSellShares(prev => ({ ...prev, [pos.symbol]: e.target.value }))}
                        className="w-20 text-right border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={sellPrices[pos.symbol] ?? pos.kaufkurs}
                        onChange={e => setSellPrices(prev => ({ ...prev, [pos.symbol]: e.target.value }))}
                        className="w-28 text-right border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </td>
                    <td className={`px-4 py-3 text-right font-bold text-xs font-mono ${isGain ? 'text-emerald-600' : isLoss ? 'text-rose-600' : 'text-slate-400'}`}>
                      <div className="flex items-center justify-end gap-1">
                        {isGain && <TrendingUp className="w-3 h-3" />}
                        {isLoss && <TrendingDown className="w-3 h-3" />}
                        {(isGain ? '+' : '') + fmt(pos.gewinnVerlust)}
                      </div>
                      <div className="text-[10px] font-normal mt-0.5 opacity-70">{fmtPct(pos.pctChange)}</div>
                    </td>
                    <td className="px-6 py-3 text-right text-xs font-mono text-slate-500">
                      {isGain ? fmt(pos.gewinnVerlust * ABGELTUNG_RATE * (1 + SOLI_RATE)) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile-Liste */}
          <div className="md:hidden divide-y divide-slate-100">
            {computation.positions.map(pos => {
              const isGain = pos.gewinnVerlust > 0;
              const isLoss = pos.gewinnVerlust < 0;
              return (
                <div key={pos.symbol} className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{pos.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{pos.symbol}</div>
                    </div>
                    <div className={`text-sm font-bold ${isGain ? 'text-emerald-600' : isLoss ? 'text-rose-600' : 'text-slate-400'}`}>
                      {(isGain ? '+' : '') + fmt(pos.gewinnVerlust)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Verkaufskurs</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={sellPrices[pos.symbol] ?? pos.kaufkurs}
                        onChange={e => setSellPrices(prev => ({ ...prev, [pos.symbol]: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Stückzahl</label>
                      <input
                        type="number"
                        min={0}
                        max={pos.maxShares}
                        step={1}
                        value={sellShares[pos.symbol] ?? pos.maxShares}
                        onChange={e => setSellShares(prev => ({ ...prev, [pos.symbol]: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Zusammenfassung ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Netto-Gewinn',
            value: fmt(computation.nettoGewinn),
            sub: `${fmt(computation.totalGewinne)} Gewinne / ${fmt(Math.abs(computation.totalVerluste))} Verluste`,
            color: computation.nettoGewinn >= 0 ? 'text-emerald-700' : 'text-rose-600',
            bg: computation.nettoGewinn >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100',
          },
          {
            label: 'Genutzter Freibetrag',
            value: fmt(computation.genutzterFreibetrag),
            sub: `von ${fmt(computation.verfügbarerFB)} verfügbar`,
            color: 'text-emerald-700',
            bg: 'bg-emerald-50 border-emerald-100',
          },
          {
            label: 'Steuer gesamt',
            value: fmt(computation.gesamtSteuer),
            sub: `effektiv ${computation.effektivRate.toFixed(1)} %`,
            color: 'text-amber-700',
            bg: 'bg-amber-50 border-amber-100',
          },
          {
            label: 'Netto-Erlös',
            value: fmt(computation.nettoErlös),
            sub: `nach Steuern (Verkaufswert − Steuer)`,
            color: 'text-slate-900',
            bg: 'bg-white border-slate-200',
            highlight: true,
          },
        ].map(card => (
          <div key={card.label} className={`border rounded-[20px] p-5 ${card.bg} ${card.highlight ? 'shadow-md ring-2 ring-emerald-200' : ''}`}>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">{card.label}</div>
            <div className={`text-xl font-black ${card.color} tracking-tight`}>{card.value}</div>
            <div className="text-[10px] text-slate-400 mt-1">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Steuer-Aufschlüsselung ── */}
      <div className="bg-white border border-slate-200 rounded-[28px] shadow-sm p-6">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">Steueraufschlüsselung</h3>
        <div className="space-y-2">
          {[
            { label: 'Steuerpflichtiger Betrag', value: fmt(computation.steuerpflichtig), muted: false },
            { label: 'Abgeltungssteuer (25 %)', value: fmt(computation.abgeltungssteuer), muted: false },
            { label: 'Solidaritätszuschlag (5,5 % der Abgeltungssteuer)', value: fmt(computation.soli), muted: false },
            ...(kirchenAktiv ? [{ label: `Kirchensteuer (${(kirchenRate * 100).toFixed(0)} %)`, value: fmt(computation.kirchensteuer), muted: false }] : []),
            { label: 'Gesamtsteuer', value: fmt(computation.gesamtSteuer), muted: false },
            { label: `Effektive Steuerquote auf realisierten Gewinn`, value: `${computation.effektivRate.toFixed(2)} %`, muted: true },
          ].map(row => (
            <div key={row.label} className={`flex items-center justify-between py-2 border-b border-slate-50 last:border-0 ${row.muted ? 'opacity-60' : ''}`}>
              <span className="text-xs text-slate-600">{row.label}</span>
              <span className="text-xs font-bold text-slate-900 font-mono">{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Optimierungshinweise ── */}
      {hints.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-[28px] shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Optimierungshinweise</h3>
          </div>
          <div className="space-y-3">
            {hints.map((hint, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-3 rounded-xl text-xs ${
                  hint.type === 'good' ? 'bg-emerald-50 text-emerald-800' :
                  hint.type === 'info' ? 'bg-emerald-50 text-emerald-800' :
                  'bg-amber-50 text-amber-800'
                }`}
              >
                {hint.type === 'good'
                  ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  : hint.type === 'info'
                  ? <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                <span>{hint.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default TaxOptimizer;
