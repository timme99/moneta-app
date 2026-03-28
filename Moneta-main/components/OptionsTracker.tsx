/**
 * OptionsTracker – Black-Scholes Optionspreis-Rechner mit Szenario-Simulation
 *
 * Berechnet Optionsschein-Preise (Call & Put) nach Black-Scholes.
 * Ermöglicht Szenario-Simulationen: Kursänderung, Vola-Änderung, Zeitablauf.
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { RotateCcw, Info, Loader2 } from 'lucide-react';
import { getSupabaseBrowser } from '../lib/supabaseBrowser';

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

/**
 * Black-Scholes-Merton mit kontinuierlicher Dividendenrendite q (Merton 1973).
 * Formel: S_adj = S * e^(-qT) ersetzt S im Standard-BS-Modell.
 * q = 0 → identisch mit klassischem Black-Scholes ohne Dividenden.
 */
function blackScholes(
  S: number, K: number, T: number, r: number, sigma: number,
  type: 'call' | 'put',
  q = 0,   // kontinuierliche Dividendenrendite p.a. (dezimal, z.B. 0.02 = 2 %)
): BSResult {
  if (T <= 0) {
    const intrinsic = type === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
    const delta = type === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
    return { price: intrinsic, delta, gamma: 0, theta: 0, vega: 0, rho: 0, d1: 0, d2: 0, Nd1: 0, Nd2: 0 };
  }
  // Merton-Anpassung: dividendenbereinigter Kurs
  const Sq = S * Math.exp(-q * T);
  const d1 = (Math.log(Sq / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const Nd1 = normCDF(d1), Nd2 = normCDF(d2);
  const nd1 = normPDF(d1);
  const Km  = K  * Math.exp(-r * T);

  let price: number, delta: number, theta: number, rho: number;
  if (type === 'call') {
    price = Sq * Nd1 - Km * Nd2;
    delta = Math.exp(-q * T) * Nd1;
    theta = (-(Sq * nd1 * sigma) / (2 * Math.sqrt(T)) + q * Sq * Nd1 - r * Km * Nd2) / 365;
    rho = Km * T * Nd2 / 100;
  } else {
    const Nnd1 = normCDF(-d1), Nnd2 = normCDF(-d2);
    price = Km * Nnd2 - Sq * Nnd1;
    delta = Math.exp(-q * T) * (Nd1 - 1);
    theta = (-(Sq * nd1 * sigma) / (2 * Math.sqrt(T)) - q * Sq * Nnd1 + r * Km * Nnd2) / 365;
    rho = -Km * T * Nnd2 / 100;
  }

  const gamma = nd1 / (Sq * sigma * Math.sqrt(T));
  const vega  = Sq * nd1 * Math.sqrt(T) / 100;
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

// ─── Impl. Vola Schätzung (rein regelbasiert, keine KI) ───────────────────────

/**
 * Sektorbasierte Schätzung der impliziten Volatilität (σ) in Prozent.
 * Regelbasiert auf historischen durchschnittlichen IV-Bereichen je Sektor (CBOE-Daten).
 * Wird automatisch gesetzt wenn ein Titel aus der Suche gewählt wird.
 */
function estimateImpliedVol(ticker: string, sector: string | null): number {
  const t = ticker.toUpperCase();
  // Breite Welt-ETFs (niedrigste Vola)
  if (/^(EUNL|IWDA|VWRL|VWCE|SXR8|CSPX|VUSA|VUAA|ISAC|SWRD|AWORLD|SPPW|SSAC|WEBG|LGGG|HMWO|FWRG)/.test(t)) return 13;
  // Wachstums-/Tech-ETFs
  if (/^(EQQQ|QQQ|QQQS|CNDX|IUIT|SXRP|TQQQ|XNAS|CNXT)/.test(t)) return 22;
  // Sektor-Heuristiken (aus ticker_mapping.sector)
  if (sector === 'Technology')                                    return 35;
  if (sector === 'Consumer Cyclical')                             return 32;
  if (sector === 'Communication Services')                        return 29;
  if (sector === 'Energy')                                        return 30;
  if (sector === 'Financial Services' || sector === 'Financials') return 25;
  if (sector === 'Healthcare')                                    return 23;
  if (sector === 'Industrials')                                   return 24;
  if (sector === 'Basic Materials')                               return 27;
  if (sector === 'Real Estate')                                   return 22;
  if (sector === 'Utilities')                                     return 17;
  if (sector === 'Consumer Defensive')                            return 18;
  // Geographische Heuristiken (Ticker-Suffix)
  if (t.includes('.DE'))                                          return 28;
  if (t.includes('.PA') || t.includes('.MI') || t.includes('.MC') || t.includes('.AS')) return 27;
  if (t.includes('.L'))                                           return 25;
  // Default: US Large-Cap ohne Sektor-Info
  return 28;
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

// React.memo verhindert Neuberechnungen der 80-Punkte-SVG-Kurve bei Szenario-Slider-
// Bewegungen, die S/K/premium/ratio/type NICHT verändern (z.B. scenPricePct-Änderungen).
const PayoffChart = React.memo(function PayoffChart({ S, K, premium, ratio, type }: {
  S: number; K: number; premium: number; ratio: number; type: 'call' | 'put';
}) {
  const W = 300, H = 110;
  const spots = React.useMemo(
    () => Array.from({ length: 80 }, (_, i) => S * (0.65 + i * 0.009)),
    [S],
  );
  const payoffs = React.useMemo(
    () => spots.map(s => {
      const intrinsic = type === 'call' ? Math.max(0, s - K) : Math.max(0, K - s);
      return intrinsic / ratio - premium;
    }),
    [spots, K, ratio, premium, type],
  );
  const minP = Math.min(...payoffs, -premium * 1.2);
  const maxP = Math.max(...payoffs, premium * 0.5);
  const range = maxP - minP || 1;

  const toY = (v: number) => H - 8 - ((v - minP) / range) * (H - 16);
  const toX = (i: number) => (i / (spots.length - 1)) * W;
  const zeroY = toY(0);

  const linePath = spots.map((_, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(payoffs[i])}`).join(' ');
  const beIdx   = payoffs.findIndex(p => p >= 0);
  const beX     = beIdx > 0 ? toX(beIdx) : null;
  const bePrice = beIdx > 0 ? spots[beIdx] : null;
  const currentX = toX(spots.findIndex(s => s >= S));
  const kIdx    = spots.findIndex(s => s >= K);
  const kX      = kIdx >= 0 && kIdx < spots.length - 1 ? toX(kIdx) : null;

  return (
    <div className="mt-5 pt-4 border-t border-slate-700">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
        Auszahlungsprofil bei Fälligkeit
      </p>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
        {/* Verlustzone – rote Fläche unter der Nulllinie */}
        <rect x={0} y={zeroY} width={W} height={Math.max(0, H - zeroY - 4)} fill="#ef444409" />

        {/* Nulllinie */}
        <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="#475569" strokeWidth="1" strokeDasharray="4,3" />

        {/* Basispreis K (violett) */}
        {kX !== null && (
          <line x1={kX} y1={0} x2={kX} y2={H} stroke="#a78bfa66" strokeWidth="1" strokeDasharray="2,3" />
        )}

        {/* Break-Even (orange) */}
        {beX && <line x1={beX} y1={0} x2={beX} y2={H} stroke="#f59e0b77" strokeWidth="1" strokeDasharray="3,3" />}

        {/* Aktueller Kurs S (grün) */}
        {currentX > 0 && <line x1={currentX} y1={0} x2={currentX} y2={H} stroke="#10b98166" strokeWidth="1" strokeDasharray="3,3" />}

        <defs>
          <linearGradient id="optGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${linePath} L${W},${H} L0,${H} Z`} fill="url(#optGrad)" />
        <path d={linePath} fill="none" stroke="#10b981" strokeWidth="1.5" />

        {/* Zonen-Labels */}
        {maxP > 0 && (
          <text x={W - 4} y={12} fontSize="8" fill="#10b981" fontFamily="monospace" textAnchor="end">▲ Gewinn</text>
        )}
        {minP < 0 && (
          <text x={4} y={H - 4} fontSize="8" fill="#ef4444" fontFamily="monospace">▼ Verlust</text>
        )}

        {/* Nulllinie Label */}
        <text x={4} y={zeroY - 3} fontSize="7.5" fill="#64748b" fontFamily="monospace">0 €</text>

        {/* Break-Even mit Kurswert */}
        {beX !== null && bePrice !== null && (
          <text x={Math.min(beX + 3, W - 72)} y={zeroY - 4} fontSize="7.5" fill="#f59e0b" fontFamily="monospace">
            {`BE: ${bePrice.toFixed(0)} €`}
          </text>
        )}

        {/* K-Beschriftung */}
        {kX !== null && (
          <text x={kX + 2} y={H - 10} fontSize="7" fill="#a78bfa" fontFamily="monospace">
            {`K=${K.toFixed(0)}`}
          </text>
        )}

        {/* Aktueller Kurs */}
        {currentX > 0 && (
          <text x={currentX + 3} y={H - 2} fontSize="7.5" fill="#10b981" fontFamily="monospace">
            {`S=${S.toFixed(0)}`}
          </text>
        )}
      </svg>

      {/* Legende */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        <span className="text-[8px] text-slate-400 font-mono flex items-center gap-1.5">
          <span className="inline-block w-4 border-t border-emerald-500" />Auszahlung
        </span>
        <span className="text-[8px] text-amber-400 font-mono flex items-center gap-1.5">
          <span className="inline-block w-4 border-t border-dashed border-amber-400" />Break-Even
        </span>
        <span className="text-[8px] text-emerald-400 font-mono flex items-center gap-1.5">
          <span className="inline-block w-4 border-t border-dashed border-emerald-400" />Akt. Kurs
        </span>
        <span className="text-[8px] text-violet-400 font-mono flex items-center gap-1.5">
          <span className="inline-block w-4 border-t border-dashed border-violet-400" />Basispreis K
        </span>
      </div>
      <p className="text-[8px] text-slate-600 font-mono mt-1">
        X-Achse: Kurs bei Fälligkeit · Y-Achse: Gewinn / Verlust (€)
      </p>
    </div>
  );
});

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
  const [isFetchingMarketData, setIsFetchingMarketData] = useState(false);
  const [priceSource, setPriceSource] = useState<'api' | 'manual'>('manual');
  const [ivSource, setIvSource]       = useState<'options' | 'estimated' | 'manual'>('manual');
  const [r,          setR]          = useState(2.5);
  const [q,          setQ]          = useState(0);    // Dividendenrendite p.a. in %
  const [ratio,      setRatio]      = useState(1);

  // ── Szenario-Parameter ─────────────────────────────────────────────────────
  const [scenPricePct, setScenPricePct] = useState(10);
  const [scenVolaPct,  setScenVolaPct]  = useState(-15);
  const [scenDays,     setScenDays]     = useState(0);
  const [activePreset, setActivePreset] = useState<string | null>('bullish');

  // ── Symbol-Suche (DB-first → AV-Fallback) ─────────────────────────────────
  const sb = getSupabaseBrowser();
  const [symbolQuery,      setSymbolQuery]      = useState('');
  const [suggestions,      setSuggestions]      = useState<{symbol: string; company_name: string; sector: string | null}[]>([]);
  const [showDrop,         setShowDrop]         = useState(false);
  const [isFetchingSymbol, setIsFetchingSymbol] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropRef     = useRef<HTMLDivElement>(null);

  const searchTickers = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim() || q.length < 2) { setSuggestions([]); setShowDrop(false); return; }
    debounceRef.current = setTimeout(async () => {
      setIsFetchingSymbol(true);
      // Phase 1: Supabase ticker_mapping (DB-first)
      const { data } = sb
        ? await sb.from('ticker_mapping').select('symbol, company_name, sector')
            .or(`symbol.ilike.%${q}%,company_name.ilike.%${q}%`).limit(6)
        : { data: [] as any[] };
      if (data && data.length > 0) {
        setSuggestions(data);
        setShowDrop(true);
        setIsFetchingSymbol(false);
      } else {
        // Phase 2: /api/financial-data Fallback (Gemini → Alpha Vantage)
        try {
          const res = await fetch(`/api/financial-data?q=${encodeURIComponent(q)}`);
          if (res.ok) {
            const json = await res.json();
            if (json.ticker) {
              setSuggestions([{ symbol: json.ticker, company_name: json.companyName ?? json.ticker }]);
              setShowDrop(true);
            }
          }
        } catch { /* ignorieren */ }
        setIsFetchingSymbol(false);
      }
    }, 300);
  }, [sb]);

  const handleSymbolSelect = async (sym: string, sector: string | null) => {
    setSymbol(sym);
    setSymbolQuery(sym);
    setSuggestions([]);
    setShowDrop(false);
    setIsFetchingMarketData(true);
    setPriceSource('manual');
    setIvSource('manual');

    // Auth-Token für options-data API
    let authHeader = '';
    try {
      if (sb) {
        const { data: { session } } = await sb.auth.getSession();
        if (session?.access_token) authHeader = `Bearer ${session.access_token}`;
      }
    } catch { /* kein Auth */ }

    // Kurs + IV in einem einzigen API-Call (?iv=1 holt ATM-Volatilität dazu)
    try {
      const res = await fetch(
        `/api/financial-data?q=${encodeURIComponent(sym)}&iv=1`,
        authHeader ? { headers: { Authorization: authHeader } } : {},
      );
      if (res.ok) {
        const data = await res.json();

        // Kurs anwenden
        if (data?.price > 0) {
          const price = parseFloat(Number(data.price).toFixed(2));
          setS(price);
          setK(Math.round(price));
          setPriceSource('api');
        }

        // Impl. Vola aus Optionsmarkt oder Sektor-Schätzung
        if (data?.atmIV > 0 && data?.ivSource === 'options') {
          setSigma(data.atmIV);
          setIvSource('options');
        } else {
          setSigma(estimateImpliedVol(sym, sector));
          setIvSource('estimated');
        }
      } else {
        setSigma(estimateImpliedVol(sym, sector));
        setIvSource('estimated');
      }
    } catch {
      setSigma(estimateImpliedVol(sym, sector));
      setIvSource('estimated');
    }

    setIsFetchingMarketData(false);
  };

  // Dropdown bei Klick außerhalb schließen
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Berechnungen ───────────────────────────────────────────────────────────
  const TY = T / 365;
  const bs = useMemo(
    () => blackScholes(S, K, TY, r / 100, sigma / 100, optionType, q / 100),
    [S, K, TY, r, sigma, optionType, q],
  );
  const optPrice = bs.price / ratio;

  const scenS     = S * (1 + scenPricePct / 100);
  const scenSigma = Math.max(1, sigma * (1 + scenVolaPct / 100));
  const scenT     = Math.max(0, T - scenDays) / 365;
  const bsScen = useMemo(
    () => blackScholes(scenS, K, scenT, r / 100, scenSigma / 100, optionType, q / 100),
    [scenS, K, scenT, r, scenSigma, optionType, q],
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
          Kein Anlageberatungsangebot. Black-Scholes-Merton-Modell (europäische Optionen, kontinuierliche Dividendenrendite q nach Merton 1973). Alle Angaben ohne Gewähr.
        </p>
      </div>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="bg-slate-900 rounded-[28px] px-6 py-5">
        {/* Erste Zeile: Titel + Symbol-Suche + Call/Put */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-black text-slate-100 tracking-tight">Optionspreis-Tracker</h1>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5 uppercase tracking-widest">Black-Scholes · Greeks · Quick-Szenarien</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Symbol-Suche mit Autocomplete (DB-first → AV-Fallback) */}
            <div className="relative flex-1 sm:flex-none" ref={dropRef}>
              <input
                type="text"
                value={symbolQuery}
                onChange={e => {
                  const v = e.target.value.toUpperCase();
                  setSymbolQuery(v);
                  searchTickers(v);
                }}
                placeholder="Symbol suchen (AAPL, SAP…)"
                maxLength={20}
                className="bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 font-mono text-sm rounded-xl px-4 py-2.5 w-full sm:w-52 focus:outline-none focus:border-emerald-500 transition-colors pr-9"
              />
              {isFetchingSymbol && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin pointer-events-none" />
              )}
              {showDrop && suggestions.length > 0 && (
                <div className="absolute top-full mt-1 w-full sm:w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                  {suggestions.map(s => (
                    <button
                      key={s.symbol}
                      onMouseDown={e => { e.preventDefault(); handleSymbolSelect(s.symbol, s.sector ?? null); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-700 transition-colors flex items-center justify-between gap-2"
                    >
                      <span className="text-xs font-black text-emerald-400 font-mono shrink-0">{s.symbol}</span>
                      <span className="text-[10px] text-slate-400 truncate">{s.company_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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

        {/* Marktdaten-Infostreifen (sichtbar sobald ein Symbol gewählt ist) */}
        {symbol && (
          <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-slate-800">
            {isFetchingMarketData ? (
              <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Marktdaten werden geladen…
              </span>
            ) : (
              <>
                <span className="text-[10px] font-mono text-slate-400">
                  Kurs (S):&nbsp;
                  <span className="text-slate-100 font-black tabular-nums">
                    {S.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </span>
                  <span className={`ml-1.5 text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-wide ${
                    priceSource === 'api'
                      ? 'bg-emerald-900/60 text-emerald-400'
                      : 'bg-slate-800 text-slate-500'
                  }`}>
                    {priceSource === 'api' ? 'Live' : 'Manuell'}
                  </span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  Impl. Vola (σ):&nbsp;
                  <span className="text-slate-100 font-black tabular-nums">{sigma.toFixed(1)} %</span>
                  <span className={`ml-1.5 text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-wide ${
                    ivSource === 'options'
                      ? 'bg-sky-900/60 text-sky-400'
                      : ivSource === 'estimated'
                      ? 'bg-amber-900/60 text-amber-400'
                      : 'bg-slate-800 text-slate-500'
                  }`}>
                    {ivSource === 'options' ? 'Optionsmarkt' : ivSource === 'estimated' ? 'Schätzung' : 'Manuell'}
                  </span>
                </span>
              </>
            )}
          </div>
        )}

        {/* Zweite Zeile: Quick-Szenario-Buttons + Ergebnis-Badge */}
        <div className="flex flex-wrap items-center gap-2 pt-3 mt-4 border-t border-slate-800">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 mr-1">Szenarien:</span>
          {PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border ${
                activePreset === p.id
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-emerald-500 hover:text-emerald-300'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => { setScenPricePct(0); setScenVolaPct(0); setScenDays(0); setActivePreset(null); }}
            className="px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center gap-1"
          >
            <RotateCcw className="w-2.5 h-2.5" /> Reset
          </button>
          {/* Live-Ergebnis-Badge */}
          {activePreset && (
            <span className={`ml-auto text-xs font-black font-mono tabular-nums px-3 py-1.5 rounded-lg border ${
              diff >= 0
                ? 'text-emerald-400 bg-emerald-950 border-emerald-800'
                : 'text-rose-400 bg-rose-950 border-rose-800'
            }`}>
              {symbol && <span className="text-slate-400 font-normal mr-1">{symbol}</span>}
              {fmtEur(scenPrice)} € &nbsp;
              ({diff >= 0 ? '+' : ''}{diffPct.toFixed(1)} %)
            </span>
          )}
        </div>
      </div>

      {/* ── Haupt-Grid: Parameter | Ergebnisse ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Linke Spalte: Schieberegler + Payoff-Chart ────────────────────── */}
        <div className="bg-slate-900 rounded-[28px] p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-5">Parameter</p>

          <ParamSlider label="Kurs (S)"              value={S}     min={1}   max={Math.max(500, Math.ceil(S / 50) * 100)}  step={S > 100 ? 1 : 0.5}  unit="€"  onChange={v => { setS(v); setPriceSource('manual'); }}     />
          <ParamSlider label="Basispreis (K)"         value={K}     min={1}   max={Math.max(500, Math.ceil(S / 50) * 100)}  step={S > 100 ? 1 : 0.5}  unit="€"  onChange={setK}     />
          <ParamSlider label="Restlaufzeit (T)"       value={T}     min={1}   max={730}  step={1}    unit="Tage" onChange={setT}   />
          <ParamSlider label="Impl. Volatilität (σ)"  value={sigma} min={1}   max={150}  step={0.5}  unit="%"
            onChange={v => { setSigma(v); setIvSource('manual'); }} />
          {ivSource !== 'manual' && (
            <p className={`text-[9px] font-mono -mt-4 mb-5 ${ivSource === 'options' ? 'text-sky-400' : 'text-amber-400'}`}>
              {ivSource === 'options'
                ? '↑ Optionsmarkt (Yahoo Finance) – manuell anpassbar'
                : '↑ Sektorbasierte Schätzung – manuell anpassbar'}
            </p>
          )}
          <ParamSlider label="Zinssatz (r)"           value={r}     min={0}   max={10}   step={0.1}  unit="%"  onChange={setR}     />
          <ParamSlider label="Dividendenrendite (q)" value={q}     min={0}   max={15}   step={0.1}  unit="%"  onChange={setQ}     />
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
                  ? (K + optPrice).toLocaleString('de-DE', { maximumFractionDigits: 2 })
                  : (K - optPrice).toLocaleString('de-DE', { maximumFractionDigits: 2 })} €
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

          {/* ── Kompakte Szenario-Attribution (nur wenn Preset aktiv) ───────── */}
          {activePreset && (
            <div className="bg-slate-900 rounded-[28px] p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">
                Szenario-Attribution · {PRESETS.find(p => p.id === activePreset)?.label}
              </p>
              <div className="divide-y divide-slate-800">
                {[
                  { label: 'Δ Delta-Effekt',  val: deltaContrib, color: 'text-sky-400' },
                  { label: 'ν Vega-Effekt',   val: vegaContrib,  color: 'text-emerald-400' },
                  { label: 'Θ Theta-Effekt',  val: thetaContrib, color: 'text-rose-400' },
                  { label: '∑ Gesamt',        val: diff,         color: diff >= 0 ? 'text-emerald-300' : 'text-rose-300', bold: true },
                ].map(row => (
                  <div key={row.label} className={`flex items-center justify-between py-2 ${row.bold ? 'pt-3 mt-1' : ''}`}>
                    <p className={`text-[10px] font-black ${row.bold ? 'text-slate-300' : 'text-slate-500'}`}>{row.label}</p>
                    <p className={`text-xs font-black font-mono tabular-nums ${row.color}`}>
                      {row.val >= 0 ? '+' : ''}{fmtEur(row.val)} €
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
