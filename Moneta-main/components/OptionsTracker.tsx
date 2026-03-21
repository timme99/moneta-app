/**
 * OptionsTracker – Black-Scholes Optionspreis-Rechner mit Szenario-Simulation
 *
 * Berechnet Optionsschein-Preise (Call & Put) nach Black-Scholes.
 * Ermöglicht Szenario-Simulationen: Kursänderung, Vola-Änderung, Zeitablauf.
 */

import React, { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Activity, ChevronRight, RotateCcw, Info } from 'lucide-react';

// ─── Black-Scholes Mathematik ─────────────────────────────────────────────────

function erf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function normCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

interface BSResult {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  d1: number;
  d2: number;
  Nd1: number;
  Nd2: number;
}

function blackScholes(
  S: number, K: number, T: number, r: number, sigma: number,
  type: 'call' | 'put',
): BSResult {
  if (T <= 0) {
    const intrinsic = type === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
    const delta = type === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
    return { price: intrinsic, delta, gamma: 0, theta: 0, vega: 0, rho: 0, d1: 0, d2: 0, Nd1: 0, Nd2: 0 };
  }
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const Nd1 = normCDF(d1), Nd2 = normCDF(d2);
  const nd1 = normPDF(d1);
  const Km = K * Math.exp(-r * T);

  let price: number, delta: number, theta: number, rho: number;
  if (type === 'call') {
    price = S * Nd1 - Km * Nd2;
    delta = Nd1;
    theta = (-(S * nd1 * sigma) / (2 * Math.sqrt(T)) - r * Km * Nd2) / 365;
    rho = Km * T * Nd2 / 100;
  } else {
    const Nnd1 = normCDF(-d1), Nnd2 = normCDF(-d2);
    price = Km * Nnd2 - S * Nnd1;
    delta = Nd1 - 1;
    theta = (-(S * nd1 * sigma) / (2 * Math.sqrt(T)) + r * Km * Nnd2) / 365;
    rho = -Km * T * Nnd2 / 100;
  }

  const gamma = nd1 / (S * sigma * Math.sqrt(T));
  const vega  = S * nd1 * Math.sqrt(T) / 100;
  return { price, delta, gamma, theta, vega, rho, d1, d2, Nd1, Nd2 };
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function moneynessLabel(S: number, K: number, type: 'call' | 'put') {
  const ratio = type === 'call' ? S / K : K / S;
  if (ratio > 1.02) return { label: 'Im Geld (ITM)', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  if (ratio < 0.98) return { label: 'Aus dem Geld (OTM)', cls: 'bg-rose-100 text-rose-700 border-rose-200' };
  return { label: 'Am Geld (ATM)', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
}

function fmt(v: number, decimals = 4): string {
  return v.toFixed(decimals);
}

function fmtEur(v: number): string {
  return v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Slider ───────────────────────────────────────────────────────────────────

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}

function ParamSlider({ label, value, min, max, step, unit, onChange }: SliderProps) {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  const display = value % 1 !== 0
    ? value.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : 1)
    : value.toLocaleString('de-DE');

  return (
    <div className="mb-5">
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
        <span className="text-sm font-black text-slate-100 font-mono tabular-nums">
          {display}<span className="text-xs text-slate-500 ml-1">{unit}</span>
        </span>
      </div>
      <div className="relative h-1.5 bg-slate-700 rounded-full">
        <div
          className="absolute left-0 top-0 h-full bg-emerald-500 rounded-full pointer-events-none"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </div>
    </div>
  );
}

// ─── Payoff Chart ─────────────────────────────────────────────────────────────

function PayoffChart({ S, K, premium, ratio, type }: {
  S: number; K: number; premium: number; ratio: number; type: 'call' | 'put';
}) {
  const W = 300, H = 110;
  const spots = Array.from({ length: 80 }, (_, i) => S * (0.65 + i * 0.009));
  const payoffs = spots.map(s => {
    const intrinsic = type === 'call' ? Math.max(0, s - K) : Math.max(0, K - s);
    return intrinsic / ratio - premium;
  });
  const minP = Math.min(...payoffs, -premium * 1.2);
  const maxP = Math.max(...payoffs, premium * 0.5);
  const range = maxP - minP || 1;

  const toY = (v: number) => H - 8 - ((v - minP) / range) * (H - 16);
  const toX = (i: number) => (i / (spots.length - 1)) * W;
  const zeroY = toY(0);

  const linePath = spots.map((_, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(payoffs[i])}`).join(' ');
  const beIdx = payoffs.findIndex(p => p >= 0);
  const beX = beIdx > 0 ? toX(beIdx) : null;
  const currentX = toX(spots.findIndex(s => s >= S));

  return (
    <div className="mt-5 pt-4 border-t border-slate-700">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
        Auszahlungsprofil bei Fälligkeit
      </p>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
        <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="#475569" strokeWidth="1" strokeDasharray="4,3" />
        {beX && <line x1={beX} y1={0} x2={beX} y2={H} stroke="#f59e0b55" strokeWidth="1" strokeDasharray="3,3" />}
        {currentX > 0 && <line x1={currentX} y1={0} x2={currentX} y2={H} stroke="#10b98155" strokeWidth="1" strokeDasharray="3,3" />}
        <defs>
          <linearGradient id="optGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${linePath} L${W},${H} L0,${H} Z`} fill="url(#optGrad)" />
        <path d={linePath} fill="none" stroke="#10b981" strokeWidth="1.5" />
        <text x={4} y={zeroY - 3} fontSize="8" fill="#64748b" fontFamily="monospace">0</text>
        {beX && <text x={beX + 3} y={10} fontSize="8" fill="#f59e0b" fontFamily="monospace">BE</text>}
        {currentX > 0 && <text x={currentX + 3} y={H - 4} fontSize="8" fill="#10b981" fontFamily="monospace">Jetzt</text>}
      </svg>
    </div>
  );
}

// ─── Szenarien ────────────────────────────────────────────────────────────────

const PRESETS = [
  { id: 'bullish',  label: '🚀 Bullish',        pricePct: +10, volaPct: -15, days: 0  },
  { id: 'bearish',  label: '📉 Kursrückgang',    pricePct: -10, volaPct: +20, days: 0  },
  { id: 'vola',     label: '⚡ Vola-Anstieg',    pricePct:   0, volaPct: +30, days: 0  },
  { id: 'decay',    label: '⏳ Zeitablauf 30T',  pricePct:   0, volaPct:   0, days: 30 },
  { id: 'crash',    label: '💥 Crash −25 %',     pricePct: -25, volaPct: +50, days: 0  },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OptionsTracker() {
  // ── Basisparameter ──────────────────────────────────────────────────────────
  const [symbol,     setSymbol]     = useState('');
  const [optionType, setOptionType] = useState<'call' | 'put'>('call');
  const [S,          setS]          = useState(100);
  const [K,          setK]          = useState(105);
  const [T,          setT]          = useState(90);
  const [sigma,      setSigma]      = useState(20);
  const [r,          setR]          = useState(2.5);
  const [ratio,      setRatio]      = useState(1);

  // ── Szenario-Parameter ─────────────────────────────────────────────────────
  const [scenPricePct, setScenPricePct] = useState(10);
  const [scenVolaPct,  setScenVolaPct]  = useState(-15);
  const [scenDays,     setScenDays]     = useState(0);
  const [activePreset, setActivePreset] = useState<string | null>('bullish');

  // ── Berechnungen ───────────────────────────────────────────────────────────
  const TY = T / 365;
  const bs = useMemo(
    () => blackScholes(S, K, TY, r / 100, sigma / 100, optionType),
    [S, K, TY, r, sigma, optionType],
  );
  const optPrice = bs.price / ratio;

  const scenS     = S * (1 + scenPricePct / 100);
  const scenSigma = Math.max(1, sigma * (1 + scenVolaPct / 100));
  const scenT     = Math.max(0, T - scenDays) / 365;
  const bsScen = useMemo(
    () => blackScholes(scenS, K, scenT, r / 100, scenSigma / 100, optionType),
    [scenS, K, scenT, r, scenSigma, optionType],
  );
  const scenPrice = bsScen.price / ratio;
  const diff      = scenPrice - optPrice;
  const diffPct   = optPrice > 0.001 ? (diff / optPrice) * 100 : 0;

  const moneyness = moneynessLabel(S, K, optionType);
  const intrinsic = optionType === 'call'
    ? Math.max(0, S - K) / ratio
    : Math.max(0, K - S) / ratio;
  const timeVal = Math.max(0, optPrice - intrinsic);

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setScenPricePct(preset.pricePct);
    setScenVolaPct(preset.volaPct);
    setScenDays(preset.days);
    setActivePreset(preset.id);
  };

  const greeks = [
    { symbol: 'Δ', name: 'Delta',  value: bs.delta / ratio, desc: 'Preisänd. pro 1 Einheit Kursbewegung', color: 'text-sky-400',    decimals: 4 },
    { symbol: 'Γ', name: 'Gamma',  value: bs.gamma / ratio * 100, desc: 'Δ-Änderung pro 100 Einh. Kurs', color: 'text-violet-400', decimals: 5 },
    { symbol: 'Θ', name: 'Theta',  value: bs.theta / ratio, desc: 'Zeitwertverlust pro Handelstag (€)',  color: 'text-rose-400',   decimals: 4 },
    { symbol: 'ν', name: 'Vega',   value: bs.vega  / ratio, desc: 'Preisänd. pro 1 % Vola-Anstieg',    color: 'text-emerald-400', decimals: 4 },
    { symbol: 'ρ', name: 'Rho',    value: bs.rho   / ratio, desc: 'Preisänd. pro 1 % Zinsänderung',    color: 'text-amber-400',  decimals: 5 },
  ];

  // ── Greek-Attribution für Szenario ─────────────────────────────────────────
  const deltaContrib = bs.delta / ratio * (scenS - S);
  const vegaContrib  = bs.vega  / ratio * (scenSigma - sigma);
  const thetaContrib = bs.theta / ratio * scenDays;
  const residual     = diff - deltaContrib - vegaContrib - thetaContrib;

  return (
    <div className="space-y-6">

      {/* ── Disclaimer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-2xl px-5 py-3">
        <Info className="w-4 h-4 text-amber-500 shrink-0" />
        <p className="text-[10px] text-amber-700 font-bold">
          Kein Anlageberatungsangebot. Black-Scholes gilt für europäische Optionen ohne Dividenden. Alle Angaben ohne Gewähr.
        </p>
      </div>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="bg-slate-900 rounded-[28px] px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-black text-slate-100 tracking-tight">Optionspreis-Tracker</h1>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5 uppercase tracking-widest">Black-Scholes · Greeks · Szenario-Simulation</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Symbol-Eingabe */}
          <input
            type="text"
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            placeholder="Symbol (z.B. AAPL)"
            maxLength={12}
            className="bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 font-mono text-sm rounded-xl px-4 py-2.5 w-44 focus:outline-none focus:border-emerald-500 transition-colors"
          />
          {/* Call / Put Toggle */}
          <div className="flex rounded-xl overflow-hidden border border-slate-700">
            {(['call', 'put'] as const).map(t => (
              <button
                key={t}
                onClick={() => setOptionType(t)}
                className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors ${
                  optionType === t
                    ? t === 'call'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-rose-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {t === 'call' ? '▲ Call' : '▼ Put'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Haupt-Grid: Parameter | Ergebnisse ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Linke Spalte: Schieberegler + Payoff-Chart ────────────────────── */}
        <div className="bg-slate-900 rounded-[28px] p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-5">Parameter</p>

          <ParamSlider label="Kurs (S)"              value={S}     min={1}   max={500}  step={0.5}  unit="€"  onChange={setS}     />
          <ParamSlider label="Basispreis (K)"         value={K}     min={1}   max={500}  step={0.5}  unit="€"  onChange={setK}     />
          <ParamSlider label="Restlaufzeit (T)"       value={T}     min={1}   max={730}  step={1}    unit="Tage" onChange={setT}   />
          <ParamSlider label="Impl. Volatilität (σ)"  value={sigma} min={1}   max={150}  step={0.5}  unit="%"  onChange={setSigma} />
          <ParamSlider label="Zinssatz (r)"           value={r}     min={0}   max={10}   step={0.1}  unit="%"  onChange={setR}     />
          <ParamSlider label="Bezugsverhältnis"       value={ratio} min={1}   max={1000} step={1}    unit=":1" onChange={setRatio} />

          <PayoffChart S={S} K={K} premium={optPrice} ratio={ratio} type={optionType} />
        </div>

        {/* ── Rechte Spalte: Preis + Greeks ─────────────────────────────────── */}
        <div className="space-y-4">

          {/* Preisbox */}
          <div className="bg-slate-900 rounded-[28px] p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Optionsschein-Preis</p>

            <div className="flex items-end justify-between mb-4">
              <div>
                <span className="text-5xl font-black text-slate-100 font-mono tabular-nums leading-none">
                  {fmtEur(optPrice)}
                </span>
                <span className="text-lg text-slate-500 ml-2">EUR</span>
              </div>
              <div className="text-right space-y-1">
                <div>
                  <p className="text-[9px] text-slate-500 font-mono uppercase">Innerer Wert</p>
                  <p className="text-base font-black text-emerald-400 font-mono">{fmtEur(intrinsic)} €</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 font-mono uppercase">Zeitwert</p>
                  <p className="text-base font-black text-sky-400 font-mono">{fmtEur(timeVal)} €</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className={`text-[10px] font-black px-3 py-1 rounded-lg border ${moneyness.cls}`}>
                {moneyness.label}
              </span>
              <span className="text-[10px] font-black px-3 py-1 rounded-lg border bg-slate-800 border-slate-700 text-slate-300">
                {T} Tage verbleibend
              </span>
              <span className="text-[10px] font-black px-3 py-1 rounded-lg border bg-slate-800 border-slate-700 text-slate-300">
                BE: {optionType === 'call'
                  ? (K + bs.price).toLocaleString('de-DE', { maximumFractionDigits: 2 })
                  : (K - bs.price).toLocaleString('de-DE', { maximumFractionDigits: 2 })} €
              </span>
            </div>
          </div>

          {/* Greeks */}
          <div className="bg-slate-900 rounded-[28px] p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Greeks</p>
            <div className="grid grid-cols-2 gap-3">
              {greeks.map(g => (
                <div key={g.name} className="bg-slate-800 rounded-2xl p-4 relative overflow-hidden">
                  <span className="absolute top-0 right-1 text-5xl font-serif italic text-slate-700 leading-none select-none">
                    {g.symbol}
                  </span>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">{g.name}</p>
                  <p className={`text-lg font-black font-mono ${g.color}`}>{fmt(g.value, g.decimals)}</p>
                  <p className="text-[9px] text-slate-500 mt-1 leading-tight">{g.desc}</p>
                </div>
              ))}
              {/* d1 / d2 */}
              <div className="bg-slate-800 rounded-2xl p-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">d₁ / d₂</p>
                <p className="text-base font-black font-mono text-slate-300">{fmt(bs.d1, 4)}</p>
                <p className="text-base font-black font-mono text-slate-400">{fmt(bs.d2, 4)}</p>
                <p className="text-[9px] text-slate-500 mt-1">N(d₁)={fmt(bs.Nd1, 3)} · N(d₂)={fmt(bs.Nd2, 3)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Szenario-Simulation ──────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-[28px] overflow-hidden shadow-sm">
        <div className="px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-emerald-600" />
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Szenario-Simulation</h2>
          </div>
          <p className="text-[10px] text-slate-400 font-medium mt-1">
            Simuliere Kursänderung, Volatilität und Zeitablauf – und sieh wie sich der Optionspreis verändert.
          </p>
        </div>

        <div className="p-6 space-y-6">

          {/* Preset-Buttons */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Schnell-Szenarien</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  className={`px-4 py-2 rounded-xl text-[11px] font-black transition-all border ${
                    activePreset === p.id
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => { setScenPricePct(0); setScenVolaPct(0); setScenDays(0); setActivePreset(null); }}
                className="px-4 py-2 rounded-xl text-[11px] font-black transition-all border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 flex items-center gap-1.5"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>
          </div>

          {/* Custom-Schieberegler */}
          <div className="bg-slate-900 rounded-2xl p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Eigenes Szenario</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8">
              <ParamSlider
                label="Kursänderung"
                value={scenPricePct}
                min={-60} max={60} step={1} unit="%"
                onChange={v => { setScenPricePct(v); setActivePreset(null); }}
              />
              <ParamSlider
                label="Vola-Änderung"
                value={scenVolaPct}
                min={-80} max={100} step={1} unit="%"
                onChange={v => { setScenVolaPct(v); setActivePreset(null); }}
              />
              <ParamSlider
                label="Zeitablauf"
                value={scenDays}
                min={0} max={Math.max(1, T - 1)} step={1} unit="Tage"
                onChange={v => { setScenDays(v); setActivePreset(null); }}
              />
            </div>

            {/* Szenario-Parameter Übersicht */}
            <div className="grid grid-cols-3 gap-3 mt-3">
              {[
                { label: 'Szenario-Kurs',   val: `${fmtEur(scenS)} €`,       sub: `${scenPricePct >= 0 ? '+' : ''}${scenPricePct} %` },
                { label: 'Szenario-Vola',   val: `${scenSigma.toFixed(1)} %`, sub: `${scenVolaPct >= 0 ? '+' : ''}${scenVolaPct} %` },
                { label: 'Szenario-Laufzeit', val: `${Math.max(0, T - scenDays)} Tage`, sub: `−${scenDays} Tage` },
              ].map(s => (
                <div key={s.label} className="bg-slate-800 rounded-xl px-4 py-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{s.label}</p>
                  <p className="text-sm font-black text-slate-200 font-mono mt-1">{s.val}</p>
                  <p className="text-[10px] text-slate-500 font-mono">{s.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Ergebnis-Vergleich */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Basis-Preis */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Basis (jetzt)</p>
              <p className="text-3xl font-black text-slate-900 font-mono tabular-nums">{fmtEur(optPrice)}</p>
              <p className="text-[10px] text-slate-400 font-mono mt-1">EUR</p>
            </div>

            {/* Pfeil */}
            <div className="hidden sm:flex items-center justify-center">
              <div className="flex flex-col items-center gap-1">
                <ChevronRight className="w-8 h-8 text-slate-300" />
                <span className="text-[9px] text-slate-400 font-mono uppercase tracking-widest">Szenario</span>
              </div>
            </div>

            {/* Szenario-Preis */}
            <div className={`rounded-2xl p-5 border ${
              diff > 0
                ? 'bg-emerald-50 border-emerald-200'
                : diff < 0
                  ? 'bg-rose-50 border-rose-200'
                  : 'bg-slate-50 border-slate-200'
            }`}>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Szenario-Preis</p>
              <p className={`text-3xl font-black font-mono tabular-nums ${
                diff > 0 ? 'text-emerald-700' : diff < 0 ? 'text-rose-700' : 'text-slate-900'
              }`}>{fmtEur(scenPrice)}</p>
              <div className="flex items-center gap-1.5 mt-1">
                {diff > 0
                  ? <TrendingUp className="w-3 h-3 text-emerald-500" />
                  : diff < 0
                    ? <TrendingDown className="w-3 h-3 text-rose-500" />
                    : null}
                <p className={`text-xs font-black font-mono ${
                  diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-slate-400'
                }`}>
                  {diff >= 0 ? '+' : ''}{fmtEur(diff)} EUR ({diffPct >= 0 ? '+' : ''}{diffPct.toFixed(1)} %)
                </p>
              </div>
            </div>
          </div>

          {/* Greek-Attribution */}
          <div className="border border-slate-100 rounded-2xl overflow-hidden">
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Preisänderungs-Attribution (näherungsweise)</p>
            </div>
            <div className="divide-y divide-slate-100">
              {[
                { label: 'Delta-Effekt',  desc: `Kurs ${scenPricePct >= 0 ? '+' : ''}${scenPricePct} %`,  val: deltaContrib, color: 'text-sky-600' },
                { label: 'Vega-Effekt',   desc: `Vola ${scenVolaPct >= 0 ? '+' : ''}${scenVolaPct} %`,    val: vegaContrib,  color: 'text-emerald-600' },
                { label: 'Theta-Effekt',  desc: `${scenDays} Tage Zeitablauf`,                             val: thetaContrib, color: 'text-rose-600' },
                { label: 'Residuum',      desc: 'Gamma & Kreuzeffekte',                                    val: residual,     color: 'text-violet-600' },
                { label: 'Gesamt',        desc: 'Summe aller Effekte',                                     val: diff,         color: diff >= 0 ? 'text-emerald-700' : 'text-rose-700', bold: true },
              ].map(row => (
                <div key={row.label} className={`flex items-center px-5 py-3 ${row.bold ? 'bg-slate-50' : ''}`}>
                  <div className="flex-1">
                    <p className={`text-xs font-black ${row.bold ? 'text-slate-900' : 'text-slate-700'}`}>{row.label}</p>
                    <p className="text-[10px] text-slate-400">{row.desc}</p>
                  </div>
                  <p className={`text-sm font-black font-mono tabular-nums ${row.color}`}>
                    {row.val >= 0 ? '+' : ''}{fmtEur(row.val)} €
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100">
          <p className="text-[9px] text-slate-400 font-mono">
            Black-Scholes Modell · Europäische Optionen · Keine Dividenden berücksichtigt · Keine Anlageberatung
          </p>
        </div>
      </div>
    </div>
  );
}
