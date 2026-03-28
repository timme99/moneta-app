import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Calendar, Clock, TrendingUp, Loader2, RefreshCcw, AlertTriangle, Info, DollarSign, Database, Sparkles, ShieldCheck, Download } from 'lucide-react';
import { EarningsEvent, HoldingRow } from '../types';
import { getSupabaseBrowser } from '../lib/supabaseBrowser';


interface EarningsCalendarProps {
  holdings: HoldingRow[];
  isPremium?: boolean;
}

// ── Typen ──────────────────────────────────────────────────────────────────────

interface DividendInfo {
  symbol: string;
  dividendPerShare: number;
  exDividendDate: string;
  dividendDate: string;
  dividendYield: number;
  price: number;
  noData: boolean;
  isEstimated?: boolean; // true = Gemini-Schätzung, false = Yahoo Finance / Alpha Vantage
}

interface HoldingDividend {
  symbol: string;
  name: string;
  shares: number;
  dividendPerShare: number;
  annualIncome: number;
  exDividendDate: string;
  isPaid: boolean;      // Ex-Date in diesem Jahr bereits vergangen
  isEstimated: boolean; // true = Gemini-Schätzung, false = Alpha Vantage DB
  isFromDb: boolean;    // true = aus Datenbank-Cache
  noData: boolean;      // true = keine Dividende bekannt / nicht-ausschüttend
}

// ── Helper ─────────────────────────────────────────────────────────────────────

const timeOfDayColor = (t: string) => {
  if (t === 'vor Marktöffnung') return 'bg-amber-50 text-amber-700 border-amber-100';
  if (t === 'nach Marktschluss') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  return 'bg-slate-100 text-slate-500 border-slate-200';
};

const daysUntil = (dateStr: string): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const formatDate = (dateStr: string): string => {
  try {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

const formatCurrency = (value: number): string =>
  value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Komponente ─────────────────────────────────────────────────────────────────

const EarningsCalendar: React.FC<EarningsCalendarProps> = ({ holdings, isPremium = false }) => {
  const [events, setEvents] = useState<EarningsEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [scannedSymbol, setScannedSymbol] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState<{ total: number; cached: number; stale: number } | null>(null);
  const autoScanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScanningRef = useRef(false);

  // Dividenden-State
  const [dividendData, setDividendData] = useState<DividendInfo[]>([]);
  const [isDivLoading, setIsDivLoading] = useState(false);
  const [divError, setDivError] = useState<string | null>(null);
  const [isDivFallback, setIsDivFallback] = useState(false);
  const [divCacheStats, setDivCacheStats] = useState<{ total: number; cached: number; stale: number } | null>(null);
  const [scannedDivSymbol, setScannedDivSymbol] = useState<string | null>(null);
  const isDivScanningRef = useRef(false);
  const divScanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scan-Status direkt aus Supabase (für per-Symbol Statusanzeige)
  const [earnScanMap, setEarnScanMap] = useState<Map<string, string>>(new Map()); // sym → scanned_at ISO
  const [divScanMap,  setDivScanMap]  = useState<Map<string, string>>(new Map()); // sym → scanned_at ISO
  // Aktuell per-Symbol abgerufenes Symbol
  const [fetchingEarnSym, setFetchingEarnSym] = useState<string | null>(null);
  const [fetchingDivSym,  setFetchingDivSym]  = useState<string | null>(null);

  // Portfolio-Positionen nach Positionsgröße (Stückzahl × Kaufpreis) sortieren
  const portfolioSorted = holdings
    .filter(h => !h.watchlist && h.shares != null && h.buy_price != null)
    .sort((a, b) => (b.shares! * b.buy_price!) - (a.shares! * a.buy_price!));

  const watchlistSorted = holdings
    .filter(h => h.watchlist)
    .sort((a, b) => (a.ticker?.symbol ?? a.symbol ?? '').localeCompare(b.ticker?.symbol ?? b.symbol ?? ''));

  // Alle Portfolio-Positionen + Watchlist – kein Limit
  const tickers = [...portfolioSorted, ...watchlistSorted]
    .map(h => h.ticker?.symbol ?? h.symbol)
    .filter(Boolean) as string[];

  const tickerKey = tickers.slice().sort().join(',');

  // Nur Positionen mit Stückzahl für Dividenden-Berechnung
  const portfolioHoldings = holdings.filter(h => !h.watchlist && h.shares && h.shares > 0);

  // ── Earnings laden (Cache-First via /api/earnings) ──────────────────────────

  const loadEarnings = async (isAutoScan = false) => {
    if (tickers.length === 0) return;
    if (isAutoScan && isScanningRef.current) return; // Kein paralleler Aufruf
    isScanningRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      if (!sb) throw new Error('Supabase nicht verfügbar.');
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) throw new Error('Nicht angemeldet.');

      const res = await fetch(
        `/api/earnings?symbols=${encodeURIComponent(tickers.join(','))}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }

      const json = await res.json();
      const sorted = (json.events as EarningsEvent[]).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      setEvents(sorted);
      setScannedSymbol(json.scannedSymbol ?? null);
      setCacheStats(json.cacheStats ?? null);
      setLastFetch(new Date());

      isScanningRef.current = false;
    } catch (e: any) {
      isScanningRef.current = false;
      setError(e?.message?.includes(':') ? e.message.split(':')[1] : 'Earnings-Daten konnten nicht geladen werden.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Dividenden: Cache-First via /api/dividends (AV → Gemini Fallback) ───────

  const loadDividends = async (isAutoScan = false) => {
    if (portfolioHoldings.length === 0) return;
    if (isAutoScan && isDivScanningRef.current) return;
    isDivScanningRef.current = true;
    setIsDivLoading(true);
    setDivError(null);

    // Portfolio-Tickers nach Positionsgröße sortiert (größte zuerst)
    // Format: "SYMBOL:FirmennamUrlEncoded" – Firmenname hilft Gemini bei europäischen Symbolen
    const portfolioTickers = [...portfolioHoldings]
      .sort((a, b) => (b.shares! * (b.buy_price ?? 0)) - (a.shares! * (a.buy_price ?? 0)))
      .map(h => {
        const sym  = h.ticker?.symbol ?? h.symbol;
        const name = h.ticker?.company_name ?? h.name;
        if (sym && name && name !== sym) return `${sym}:${encodeURIComponent(name)}`;
        return sym;
      })
      .filter(Boolean) as string[];

    try {
      const sb = getSupabaseBrowser();
      if (!sb) throw new Error('Supabase nicht verfügbar.');
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) throw new Error('Nicht angemeldet.');

      // Alle Symbole an API senden – API verwaltet Cache + scannt 1 stale Symbol
      const res = await fetch(
        `/api/dividends?symbols=${encodeURIComponent(portfolioTickers.join(','))}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }

      const json = await res.json();
      const results: DividendInfo[] = json.results ?? [];
      const stats = json.cacheStats ?? null;

      setDividendData(results);
      setDivCacheStats(stats);
      setScannedDivSymbol(json.scannedSymbol ?? null);
      setIsDivFallback(results.some((r: DividendInfo) => r.isEstimated));

      isDivScanningRef.current = false;
    } catch (e: any) {
      isDivScanningRef.current = false;
      setDivError(e?.message ?? 'Dividenden-Daten konnten nicht geladen werden.');
    } finally {
      setIsDivLoading(false);
    }
  };

  // ── Scan-Status direkt aus Supabase laden ──────────────────────────────────

  const loadScanStatus = useCallback(async () => {
    if (tickers.length === 0) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const [{ data: earnData }, { data: divData }] = await Promise.all([
      sb.from('scan_log').select('symbol, scanned_at').in('symbol', tickers).eq('type', 'earnings'),
      sb.from('scan_log').select('symbol, scanned_at').in('symbol', tickers).eq('type', 'dividend'),
    ]);
    setEarnScanMap(new Map((earnData ?? []).map((r: any) => [r.symbol, r.scanned_at])));
    setDivScanMap(new Map((divData  ?? []).map((r: any) => [r.symbol, r.scanned_at])));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey]);

  // ── Per-Symbol manueller Abruf ─────────────────────────────────────────────

  const fetchEarningsForSymbol = async (sym: string) => {
    if (fetchingEarnSym) return;
    setFetchingEarnSym(sym);
    try {
      const sb = getSupabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) return;
      await fetch(`/api/earnings?symbols=${encodeURIComponent(sym)}&force=1`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      await Promise.all([loadEarnings(), loadScanStatus()]);
    } finally {
      setFetchingEarnSym(null);
    }
  };

  const fetchDividendForSymbol = async (sym: string) => {
    if (fetchingDivSym) return;
    setFetchingDivSym(sym);
    try {
      const sb = getSupabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) return;
      await fetch(`/api/dividends?symbols=${encodeURIComponent(sym)}&force=1`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      await Promise.all([loadDividends(), loadScanStatus()]);
    } finally {
      setFetchingDivSym(null);
    }
  };

  useEffect(() => {
    // Laufende Auto-Scans stoppen wenn sich Holdings ändern
    if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
    if (divScanTimerRef.current) clearTimeout(divScanTimerRef.current);
    isScanningRef.current = false;
    isDivScanningRef.current = false;

    if (tickers.length > 0) {
      loadEarnings();
      loadDividends();
      loadScanStatus();
    } else {
      setDividendData([]);
    }
    return () => {
      if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
      if (divScanTimerRef.current) clearTimeout(divScanTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey]);

  // ── Dividenden-Berechnungen ─────────────────────────────────────────────────

  const currentYear = new Date().getFullYear();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const holdingDividends: HoldingDividend[] = useMemo(() => {
    // Alle Portfolio-Positionen anzeigen – auch solche ohne Dividende
    return portfolioHoldings.map(h => {
      const sym     = h.ticker?.symbol ?? h.symbol;
      const divInfo = dividendData.find(d => d.symbol === sym);

      const shares           = h.shares ?? 0;
      const dividendPerShare = divInfo?.dividendPerShare ?? 0;
      const annualIncome     = shares * dividendPerShare;
      const noData           = !divInfo || divInfo.noData || dividendPerShare === 0;

      let isPaid = false;
      if (divInfo?.exDividendDate) {
        const exDate = new Date(divInfo.exDividendDate);
        isPaid = exDate.getFullYear() === currentYear && exDate <= today;
      }

      return {
        symbol:           sym,
        name:             h.ticker?.company_name ?? h.name ?? sym,
        shares,
        dividendPerShare,
        annualIncome,
        exDividendDate:   divInfo?.exDividendDate ?? '',
        isPaid,
        isEstimated:      divInfo?.isEstimated ?? false,
        isFromDb:         divInfo?.isFromDb    ?? false,
        noData,
      } as HoldingDividend;
    }).sort((a, b) => {
      // Positionen ohne Dividende ans Ende
      if (a.noData && !b.noData) return 1;
      if (!a.noData && b.noData) return -1;
      // Chronologisch nach Ex-Datum
      const hasA = Boolean(a.exDividendDate);
      const hasB = Boolean(b.exDividendDate);
      if (!hasA && !hasB) return b.annualIncome - a.annualIncome;
      if (!hasA) return 1;
      if (!hasB) return -1;
      const dateA   = new Date(a.exDividendDate).getTime();
      const dateB   = new Date(b.exDividendDate).getTime();
      const now     = today.getTime();
      const futureA = dateA >= now;
      const futureB = dateB >= now;
      if (futureA && futureB) return dateA - dateB;
      if (!futureA && !futureB) return dateB - dateA;
      return futureA ? -1 : 1;
    });
  }, [dividendData, portfolioHoldings, currentYear]);

  const totalAnnualDividend = holdingDividends.reduce((sum, h) => sum + h.annualIncome, 0);

  // "Erhalten": Positionen deren Ex-Datum in diesem Jahr bereits vergangen ist
  const receivedDividends = holdingDividends
    .filter(h => h.isPaid)
    .reduce((sum, h) => sum + h.annualIncome, 0);

  // "Erwartet": Positionen mit zukünftigem Ex-Datum in diesem Jahr
  const expectedDividends = holdingDividends
    .filter(h => {
      if (!h.exDividendDate || h.isPaid) return false;
      const exDate = new Date(h.exDividendDate);
      return exDate.getFullYear() === currentYear && exDate > today;
    })
    .reduce((sum, h) => sum + h.annualIncome, 0);

  // Sparerpauschbetrag (1.000 € ab 2023, Einzelperson)
  const SPARERPAUSCHBETRAG = 1000;
  const pauschbetragPct = Math.min(100, (totalAnnualDividend / SPARERPAUSCHBETRAG) * 100);

  // ── Unified Calendar Entries (Earnings + Ex-Dividenden) ─────────────────────

  const holdingNameMap = useMemo(() => {
    const m = new Map<string, string>();
    [...portfolioSorted, ...watchlistSorted].forEach(h => {
      const sym = h.ticker?.symbol ?? h.symbol;
      if (sym) m.set(sym, h.ticker?.company_name ?? h.name ?? sym);
    });
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey]);

  interface CalendarEntry {
    type: 'earnings' | 'ex-dividend';
    date: string;
    symbol: string;
    name: string;
    timeOfDay?: string;
    epsEstimate?: string;
    revenueEstimate?: string;
    quarter?: string;
    annualIncome?: number;
    dividendPerShare?: number;
    shares?: number;
    isEstimated?: boolean;
    isPast: boolean;
    daysFromNow: number;
  }

  const unifiedEntries = useMemo((): CalendarEntry[] => {
    const entries: CalendarEntry[] = [];

    for (const e of events) {
      const days = daysUntil(e.date);
      entries.push({
        type: 'earnings',
        date: e.date,
        symbol: e.ticker,
        name: holdingNameMap.get(e.ticker) ?? e.ticker,
        timeOfDay: e.timeOfDay,
        epsEstimate: e.epsEstimate,
        revenueEstimate: e.revenueEstimate,
        quarter: e.quarter,
        isPast: days < 0,
        daysFromNow: days,
      });
    }

    for (const h of holdingDividends) {
      if (h.noData || !h.exDividendDate) continue;
      const days = daysUntil(h.exDividendDate);
      entries.push({
        type: 'ex-dividend',
        date: h.exDividendDate,
        symbol: h.symbol,
        name: h.name,
        annualIncome: h.annualIncome,
        dividendPerShare: h.dividendPerShare,
        shares: h.shares,
        isEstimated: h.isEstimated,
        isPast: days < 0,
        daysFromNow: days,
      });
    }

    return entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events, holdingDividends, holdingNameMap]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Header mit integrierten KPI-Karten ──────────────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 to-emerald-900 p-5 md:p-7 rounded-[40px] text-white relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full -mr-16 -mt-16 blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-5 h-5 text-emerald-400" />
            <span className="text-emerald-400 font-black text-[10px] uppercase tracking-[0.3em]">Depot-Kalender</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black mb-4 tracking-tighter">Earnings & Dividenden</h2>

          {portfolioHoldings.length > 0 && (
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3">
                <p className="text-[8px] font-black text-emerald-300 uppercase tracking-widest mb-1">Ex-Datum vergangen</p>
                <p className="text-base font-black text-white tabular-nums">
                  {isDivLoading && holdingDividends.length === 0
                    ? <span className="opacity-40">–</span>
                    : `${formatCurrency(receivedDividends)} €`}
                </p>
                <p className="text-[8px] text-white/40 mt-0.5">{currentYear}</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3">
                <p className="text-[8px] font-black text-blue-300 uppercase tracking-widest mb-1">Bevorstehend</p>
                <p className="text-base font-black text-white tabular-nums">
                  {isDivLoading && holdingDividends.length === 0
                    ? <span className="opacity-40">–</span>
                    : `${formatCurrency(expectedDividends)} €`}
                </p>
                <p className="text-[8px] text-white/40 mt-0.5">Rest {currentYear}</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3">
                <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">Gesamt p.a.</p>
                <p className="text-base font-black text-white tabular-nums">
                  {isDivLoading && holdingDividends.length === 0
                    ? <span className="opacity-40">–</span>
                    : `${formatCurrency(totalAnnualDividend)} €`}
                </p>
                <p className="text-[8px] text-white/40 mt-0.5">
                  {holdingDividends.filter(h => !h.noData).length} Pos. zahlen Div.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Sparerpauschbetrag ──────────────────────────────────────────────── */}
      {totalAnnualDividend > 0 && (
        <div className="bg-white border border-slate-200 rounded-[20px] p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">
                Sparerpauschbetrag {currentYear}
              </span>
            </div>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${
              pauschbetragPct >= 100
                ? 'bg-rose-50 text-rose-600 border border-rose-100'
                : pauschbetragPct >= 70
                ? 'bg-amber-50 text-amber-600 border border-amber-100'
                : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
            }`}>
              {formatCurrency(Math.min(totalAnnualDividend, SPARERPAUSCHBETRAG))} / 1.000 €
            </span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                pauschbetragPct >= 100 ? 'bg-rose-400' : pauschbetragPct >= 70 ? 'bg-amber-400' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, pauschbetragPct)}%` }}
            />
          </div>
          <p className="text-[9px] text-slate-400 mt-1.5">
            {pauschbetragPct >= 100
              ? `Pauschbetrag überschritten · +${formatCurrency(totalAnnualDividend - SPARERPAUSCHBETRAG)} € steuerpflichtig (Schätzung)`
              : `${pauschbetragPct.toFixed(0)} % ausgeschöpft · ${formatCurrency(SPARERPAUSCHBETRAG - Math.min(totalAnnualDividend, SPARERPAUSCHBETRAG))} € verbleibend`}
            {' '}· Keine Steuerberatung
          </p>
        </div>
      )}

      {/* ── Unified Timeline ─────────────────────────────────────────────────── */}

      {tickers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-[28px] p-12 text-center shadow-sm">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Füge Aktien hinzu, um Earnings-Termine und Dividenden anzuzeigen.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-[24px] overflow-hidden shadow-sm">

          {/* Tabellen-Header */}
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Anstehende Events</h3>
              {(isLoading || isDivLoading) && (
                <span className="flex items-center gap-1 text-[9px] text-emerald-600">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Wird aktualisiert…
                </span>
              )}
            </div>
            <button
              onClick={() => { loadEarnings(); loadDividends(); loadScanStatus(); }}
              disabled={isLoading || isDivLoading}
              className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 hover:text-emerald-600 uppercase tracking-wide transition-colors disabled:opacity-50"
            >
              <RefreshCcw className={`w-3 h-3 ${isLoading || isDivLoading ? 'animate-spin' : ''}`} />
              {lastFetch
                ? lastFetch.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                : 'Laden'}
            </button>
          </div>

          {/* Fehler */}
          {(error || divError) && (
            <div className="mx-5 my-3 bg-rose-50 border border-rose-100 p-3 rounded-xl text-rose-700 text-xs">
              {error || divError}
            </div>
          )}

          {/* Spalten-Labels (Desktop) */}
          <div className="hidden md:grid md:grid-cols-[80px_100px_1fr_100px] px-5 py-2 bg-slate-50/60 border-b border-slate-100 gap-3">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Typ</p>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Datum</p>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Unternehmen</p>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-right">Betrag p.a.</p>
          </div>

          {/* Event-Zeilen */}
          {unifiedEntries.length === 0 && !isLoading && !isDivLoading ? (
            <div className="px-6 py-8 text-center">
              <p className="text-slate-400 text-sm">Noch keine Daten verfügbar.</p>
              <p className="text-slate-300 text-xs mt-1">Klicke auf „Laden" oder warte auf den Auto-Scan.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {unifiedEntries
                .filter(e => e.daysFromNow >= -90)
                .map((entry, i) => {
                  const isSoon  = !entry.isPast && entry.daysFromNow <= 7;
                  const isToday = entry.daysFromNow === 0;
                  return (
                    <div
                      key={`${entry.type}-${entry.symbol}-${entry.date}-${i}`}
                      className={`px-5 py-3 grid grid-cols-[80px_1fr] md:grid-cols-[80px_100px_1fr_100px] gap-3 items-center transition-colors ${
                        isToday      ? 'bg-emerald-50/60' :
                        isSoon       ? 'bg-emerald-50/20' :
                        entry.isPast ? 'opacity-40' :
                        'hover:bg-slate-50/60'
                      }`}
                    >
                      {/* Typ-Badge */}
                      <div>
                        {entry.type === 'earnings' ? (
                          <span className="inline-block text-[7px] font-black bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded-lg uppercase tracking-wide">
                            Earnings
                          </span>
                        ) : (
                          <span className="inline-block text-[7px] font-black bg-amber-50 text-amber-600 border border-amber-100 px-1.5 py-0.5 rounded-lg uppercase tracking-wide">
                            Ex-Div.
                          </span>
                        )}
                      </div>

                      {/* Datum (Desktop) */}
                      <div className="hidden md:block">
                        <p className="text-[10px] font-black text-slate-700 tabular-nums">
                          {new Date(entry.date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </p>
                        <p className={`text-[9px] tabular-nums ${
                          entry.isPast ? 'text-slate-300' : isSoon ? 'text-emerald-600 font-bold' : 'text-slate-400'
                        }`}>
                          {entry.isPast
                            ? `vor ${Math.abs(entry.daysFromNow)}d`
                            : isToday ? 'Heute'
                            : `in ${entry.daysFromNow}d`}
                        </p>
                      </div>

                      {/* Unternehmen + Details */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Mobile: Datum inline */}
                          <span className="md:hidden text-[9px] text-slate-400 font-mono tabular-nums">
                            {new Date(entry.date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}
                            {' · '}
                            {entry.isPast
                              ? `vor ${Math.abs(entry.daysFromNow)}d`
                              : isToday ? 'Heute'
                              : `in ${entry.daysFromNow}d`}
                          </span>
                          <span className="text-[10px] font-black text-slate-700 font-mono">{entry.symbol}</span>
                          {entry.name !== entry.symbol && (
                            <span className="text-[10px] text-slate-500 truncate max-w-[140px]">{entry.name}</span>
                          )}
                          {isSoon && !entry.isPast && (
                            <span className="text-[7px] font-black bg-emerald-600 text-white px-1 py-0.5 rounded uppercase tracking-widest shrink-0">
                              {isToday ? 'Heute' : 'Bald'}
                            </span>
                          )}
                          {entry.isEstimated && (
                            <span className="text-[7px] font-black bg-amber-50 text-amber-500 border border-amber-200 px-1 py-0.5 rounded uppercase tracking-widest shrink-0">KI</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {entry.type === 'earnings' && (
                            <>
                              {entry.quarter && <span className="text-[9px] text-slate-400">{entry.quarter}</span>}
                              {entry.timeOfDay && entry.timeOfDay !== 'unbekannt' && (
                                <span className={`text-[7px] font-black px-1 py-0.5 rounded ${timeOfDayColor(entry.timeOfDay)}`}>
                                  {entry.timeOfDay}
                                </span>
                              )}
                              {entry.epsEstimate && (
                                <span className="text-[9px] text-slate-400">EPS: <strong>{entry.epsEstimate}</strong></span>
                              )}
                            </>
                          )}
                          {entry.type === 'ex-dividend' && entry.shares != null && (
                            <span className="text-[9px] text-slate-400">
                              {entry.shares} Stk · {formatCurrency(entry.dividendPerShare ?? 0)} €/Aktie
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Betrag (Dividenden, Desktop) */}
                      <div className="hidden md:block text-right">
                        {entry.type === 'ex-dividend' && entry.annualIncome != null && (
                          <p className="text-sm font-black text-slate-800 tabular-nums">{formatCurrency(entry.annualIncome)} €</p>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Ausstehende Scans */}
          {(() => {
            const pendingEarnings = tickers.filter(sym => !earnScanMap.has(sym) && !events.find(e => e.ticker === sym));
            const pendingDivs = portfolioHoldings
              .map(h => h.ticker?.symbol ?? h.symbol)
              .filter((sym): sym is string => !!sym && !divScanMap.has(sym));
            const totalPending = pendingEarnings.length + pendingDivs.length;
            if (totalPending === 0) return null;
            return (
              <div className="px-5 py-3 bg-amber-50/50 border-t border-amber-100/60 flex items-center justify-between gap-3">
                <p className="text-[9px] text-amber-700 font-medium">
                  {pendingEarnings.length > 0 && `${pendingEarnings.length} Earnings`}
                  {pendingEarnings.length > 0 && pendingDivs.length > 0 && ' · '}
                  {pendingDivs.length > 0 && `${pendingDivs.length} Dividenden`}
                  {' '}noch nicht abgerufen
                </p>
                <button
                  onClick={() => {
                    if (pendingEarnings.length > 0) fetchEarningsForSymbol(pendingEarnings[0]);
                    else if (pendingDivs.length > 0) fetchDividendForSymbol(pendingDivs[0]);
                  }}
                  disabled={!!fetchingEarnSym || !!fetchingDivSym}
                  className="flex items-center gap-1 text-[9px] font-black bg-amber-500 text-white px-2.5 py-1 rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-40 shrink-0"
                >
                  {(fetchingEarnSym || fetchingDivSym)
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Download className="w-3 h-3" />}
                  Jetzt abrufen
                </button>
              </div>
            );
          })()}

          {/* Tabellen-Footer */}
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2 flex-wrap">
            <span className="text-[7px] font-black bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded uppercase">Earnings</span>
            <span className="text-[8px] text-slate-400">Quartalszahlen</span>
            <span className="mx-1 text-slate-200">·</span>
            <span className="text-[7px] font-black bg-amber-50 text-amber-600 border border-amber-100 px-1.5 py-0.5 rounded uppercase">Ex-Div.</span>
            <span className="text-[8px] text-slate-400">Ex-Dividenden-Datum</span>
            <span className="mx-1 text-slate-200">·</span>
            <span className="text-[8px] text-slate-400 italic">Yahoo Finance / KI · Keine Anlageberatung</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EarningsCalendar;
