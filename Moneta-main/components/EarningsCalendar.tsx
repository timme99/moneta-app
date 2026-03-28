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

  // ── Earnings-Aufteilung ────────────────────────────────────────────────────

  const upcoming = events.filter(e => daysUntil(e.date) >= 0);
  const past = events.filter(e => daysUntil(e.date) < 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-emerald-900 p-4 md:p-8 rounded-[40px] text-white relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full -mr-16 -mt-16 blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-emerald-400" />
            <span className="text-emerald-400 font-black text-[10px] uppercase tracking-[0.3em]">Depot-Kalender</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-black mb-3 tracking-tighter">Earnings & Dividenden</h2>
          <p className="text-slate-400 font-medium leading-relaxed text-sm max-w-xl">
            Bevorstehende Quartalszahlen und Dividenden-Schätzungen für deine Depot-Positionen –{' '}
            <span className="text-white font-bold">Investieren mit Durchblick.</span>{' '}
            KI-Schätzungen auf Basis historischer Daten, rein informativ, keine Anlageberatung.
          </p>
        </div>
      </div>

      {/* Allgemeiner Disclaimer */}
      <div className="bg-amber-50 border border-amber-100 p-4 rounded-[20px] flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
          <strong>Hinweis:</strong> Alle Earnings- und Dividenden-Daten sind Schätzungen auf Basis historischer Daten
          und stellen keine verlässlichen Prognosen dar. Dividendenangaben sind keine Garantie für zukünftige Zahlungen.
          Offizielle Termine immer auf der Unternehmens-IR-Seite prüfen. Keine Anlageberatung.
        </p>
      </div>

      {/* ── Dividenden-Tracker ──────────────────────────────────────────────── */}

      {portfolioHoldings.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" /> Dividenden-Tracker {currentYear}
              {isDivFallback && !isDivLoading && (
                <span
                  title="Voraussichtliche Termine basierend auf KI-Analyse historischer Muster – keine offiziellen Daten verfügbar"
                  className="flex items-center gap-1 text-[9px] font-black bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-lg uppercase tracking-widest cursor-help"
                >
                  <Info className="w-3 h-3" /> KI-Schätzung
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {divCacheStats && !isDivLoading && (
                <div className="flex items-center gap-1 text-[9px] font-black text-slate-400 bg-slate-50 border border-slate-100 px-2 py-1 rounded-lg">
                  <Database className="w-2.5 h-2.5" />
                  {divCacheStats.cached}/{divCacheStats.total} gecacht
                  {scannedDivSymbol && <span className="text-emerald-500 ml-1">· {scannedDivSymbol}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Lade-Fortschritt */}
          {isDivLoading && (
            <div className="bg-white px-5 py-3 rounded-2xl shadow border border-slate-100 flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-black text-slate-700 block">
                  {divCacheStats && divCacheStats.stale > 0
                    ? `Aktualisiere ${divCacheStats.stale} Symbol${divCacheStats.stale > 1 ? 'e' : ''} via Yahoo Finance…`
                    : 'Lade Dividenden-Daten…'}
                </span>
                {divCacheStats && divCacheStats.total > 0 && (
                  <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((divCacheStats.cached / divCacheStats.total) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Drei Karten: Erhalten + Erwartet + Gesamt */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Erhalten */}
            <div className="bg-white border border-emerald-100 rounded-[24px] p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ex-Datum vergangen</p>
                  <p className="text-[9px] text-slate-300">{currentYear}</p>
                </div>
              </div>
              {isDivLoading && holdingDividends.length === 0 ? (
                <div className="h-7 bg-slate-100 rounded-lg animate-pulse" />
              ) : (
                <p className="text-xl font-black text-slate-900 tabular-nums">
                  {formatCurrency(receivedDividends)} <span className="text-xs font-medium text-slate-400">€</span>
                </p>
              )}
              {holdingDividends.filter(h => h.isPaid).length > 0 && (
                <p className="text-[9px] text-emerald-600 font-bold mt-1">
                  {holdingDividends.filter(h => h.isPaid).length} Position{holdingDividends.filter(h => h.isPaid).length !== 1 ? 'en' : ''}
                </p>
              )}
            </div>

            {/* Erwartet */}
            <div className="bg-white border border-blue-100 rounded-[24px] p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bevorstehend</p>
                  <p className="text-[9px] text-slate-300">Rest {currentYear}</p>
                </div>
              </div>
              {isDivLoading && holdingDividends.length === 0 ? (
                <div className="h-7 bg-slate-100 rounded-lg animate-pulse" />
              ) : (
                <p className="text-xl font-black text-slate-900 tabular-nums">
                  {formatCurrency(expectedDividends)} <span className="text-xs font-medium text-slate-400">€</span>
                </p>
              )}
              {holdingDividends.filter(h => !h.isPaid && h.exDividendDate).length > 0 && (
                <p className="text-[9px] text-blue-500 font-bold mt-1">
                  {holdingDividends.filter(h => !h.isPaid && h.exDividendDate && new Date(h.exDividendDate) > today).length} ausstehend
                </p>
              )}
            </div>

            {/* Gesamt p.a. */}
            <div className="bg-white border border-slate-100 rounded-[24px] p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 bg-slate-100 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-3.5 h-3.5 text-slate-600" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gesamt p.a.</p>
                  <p className="text-[9px] text-slate-300">alle Positionen</p>
                </div>
              </div>
              {isDivLoading && holdingDividends.length === 0 ? (
                <div className="h-7 bg-slate-100 rounded-lg animate-pulse" />
              ) : (
                <p className="text-xl font-black text-slate-900 tabular-nums">
                  {formatCurrency(totalAnnualDividend)} <span className="text-xs font-medium text-slate-400">€</span>
                </p>
              )}
              {holdingDividends.length > 0 && (
                <p className="text-[9px] text-slate-400 font-bold mt-1">
                  {holdingDividends.length} zahlen Dividende
                </p>
              )}
            </div>
          </div>

          {/* Sparerpauschbetrag-Vorschau */}
          {totalAnnualDividend > 0 && (
            <div className="bg-white border border-slate-200 rounded-[20px] p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">
                    Sparerpauschbetrag {currentYear}
                  </p>
                </div>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${
                  pauschbetragPct >= 100
                    ? 'bg-rose-50 text-rose-600 border border-rose-100'
                    : pauschbetragPct >= 70
                    ? 'bg-amber-50 text-amber-600 border border-amber-100'
                    : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                }`}>
                  {formatCurrency(Math.min(totalAnnualDividend, SPARERPAUSCHBETRAG))} / {SPARERPAUSCHBETRAG.toLocaleString('de-DE')} €
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    pauschbetragPct >= 100 ? 'bg-rose-400' : pauschbetragPct >= 70 ? 'bg-amber-400' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${pauschbetragPct}%` }}
                />
              </div>
              <p className="text-[9px] text-slate-400 mt-1.5">
                {pauschbetragPct >= 100
                  ? `Pauschbetrag durch geplante Dividenden überschritten (+${formatCurrency(totalAnnualDividend - SPARERPAUSCHBETRAG)} €)`
                  : `${pauschbetragPct.toFixed(0)} % ausgeschöpft · ${formatCurrency(SPARERPAUSCHBETRAG - Math.min(totalAnnualDividend, SPARERPAUSCHBETRAG))} € verbleibend`}
                {' '}· Keine Steuerberatung · Schätzung auf Basis der Jahresdividenden
              </p>
            </div>
          )}

          {/* Dividenden-Fehler */}
          {divError && !isDivLoading && (
            <div className="bg-rose-50 border border-rose-100 p-4 rounded-[16px] text-rose-700 text-xs font-medium">
              Dividenden-Daten konnten nicht geladen werden – {divError}
            </div>
          )}

          {/* Per-Position-Liste – alle Positionen, auch ohne Dividende */}
          {(portfolioHoldings.length > 0) && (
            <div className="bg-white border border-slate-200 rounded-[24px] overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Dividenden je Position</p>
                <p className="text-[9px] text-slate-400 font-mono">
                  {holdingDividends.filter(h => !h.noData).length} von {portfolioHoldings.length} zahlen Dividende
                </p>
              </div>

              <div className="divide-y divide-slate-100">
                {/* Alle Positionen – chronologisch, noData ans Ende */}
                {isDivLoading && holdingDividends.length === 0
                  ? portfolioHoldings.slice(0, 5).map((_, i) => (
                    <div key={`sk-${i}`} className="px-6 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-slate-200 animate-pulse" />
                        <div>
                          <div className="h-3.5 w-28 bg-slate-100 rounded animate-pulse mb-1" />
                          <div className="h-2.5 w-20 bg-slate-100 rounded animate-pulse" />
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="h-3.5 w-16 bg-slate-100 rounded animate-pulse mb-1" />
                        <div className="h-2.5 w-12 bg-slate-100 rounded animate-pulse" />
                      </div>
                    </div>
                  ))
                  : holdingDividends.map((h, i) => {
                  if (h.noData) {
                    const neverScanned = !divScanMap.has(h.symbol);
                    const isFetchingThis = fetchingDivSym === h.symbol;
                    return (
                      <div key={i} className="px-6 py-3 flex items-center justify-between gap-2 hover:bg-slate-50/50 transition-opacity">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`text-base font-light w-3.5 text-center shrink-0 ${neverScanned ? 'text-amber-300' : 'text-slate-300'}`}>
                            {neverScanned ? '?' : '–'}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-500 truncate">{h.name}</p>
                            <p className="text-[10px] font-mono text-slate-400 truncate">
                              {h.symbol} · {h.shares} Stk ·{' '}
                              {isDivLoading ? 'Wird geladen…' : neverScanned ? 'Noch nicht abgerufen' : 'Keine Dividende bekannt'}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => fetchDividendForSymbol(h.symbol)}
                          disabled={!!fetchingDivSym}
                          title={neverScanned ? 'Dividendendaten jetzt abrufen' : 'Neu laden (Yahoo Finance)'}
                          className={`flex items-center gap-1 text-[8px] font-black uppercase tracking-wide shrink-0 px-2 py-1 rounded-lg transition-colors disabled:opacity-40 ${
                            neverScanned
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'bg-slate-100 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                          }`}
                        >
                          {isFetchingThis
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Download className="w-3 h-3" />}
                          {neverScanned ? 'Abrufen' : 'Neu'}
                        </button>
                      </div>
                    );
                  }
                  const daysToEx = h.exDividendDate ? daysUntil(h.exDividendDate) : null;
                  const isSoon   = daysToEx !== null && daysToEx >= 0 && daysToEx <= 30;
                  return (
                    <div key={i} className={`px-6 py-4 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors ${isSoon ? 'bg-emerald-50/30' : ''}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Quelle-Icon: DB (grün) vs KI-Schätzung (amber) */}
                        <div title={h.isEstimated ? 'KI-Schätzung (Gemini)' : 'Echte Daten (Yahoo Finance / Alpha Vantage)'}>
                          {h.isEstimated
                            ? <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            : <Database className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          }
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-bold text-slate-800 truncate">{h.name}</p>
                            {isSoon && !h.isPaid && (
                              <span className="text-[8px] font-black bg-emerald-600 text-white px-1.5 py-0.5 rounded uppercase tracking-widest shrink-0">
                                Bald
                              </span>
                            )}
                            {h.isEstimated && (
                              <span className="text-[8px] font-black bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded uppercase tracking-widest shrink-0">
                                KI-Schätzung
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] font-mono text-slate-400 truncate">
                            {h.symbol} · {h.shares} Stk · {formatCurrency(h.dividendPerShare)} €/Aktie p.a.
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-slate-900 tabular-nums">{formatCurrency(h.annualIncome)} €</p>
                        <p className={`text-[9px] font-bold uppercase tracking-widest ${
                          h.isPaid ? 'text-slate-400' : isSoon ? 'text-emerald-600' : 'text-slate-500'
                        }`}>
                          {h.isPaid
                            ? '✓ Ex-Datum vergangen'
                            : daysToEx === 0 ? 'Ex-Datum heute'
                            : daysToEx !== null && daysToEx > 0
                              ? `Ex: ${formatDate(h.exDividendDate)} (in ${daysToEx}d)`
                              : h.exDividendDate ? `Ex: ${formatDate(h.exDividendDate)}` : 'Termin offen'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1 text-[9px] text-slate-400">
                  <Database className="w-3 h-3 text-emerald-500" /> Yahoo Finance / Alpha Vantage
                </span>
                <span className="flex items-center gap-1 text-[9px] text-slate-400">
                  <Sparkles className="w-3 h-3 text-amber-400" /> KI-Schätzung (Gemini)
                </span>
                <span className="text-[9px] text-slate-300">·</span>
                <span className="text-[9px] text-slate-400 italic">Alle Angaben ohne Gewähr · Keine Anlageberatung</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Earnings Calendar ───────────────────────────────────────────────── */}

      {tickers.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-[28px] p-12 text-center shadow-sm">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Füge Aktien oder Watchlist-Positionen hinzu, um deren Earnings-Termine anzuzeigen.</p>
        </div>
      )}

      {tickers.length > 0 && (
        <>
          {/* ── Header: Titel + Aktualisieren ──────────────────────────────── */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" /> Earnings-Kalender
              </h3>
              <span className="text-[9px] font-bold text-slate-400 bg-slate-50 border border-slate-100 px-2 py-1 rounded-lg">
                {portfolioSorted.length} Depot{watchlistSorted.length > 0 ? ` · ${watchlistSorted.length} Watchlist` : ''}
              </span>
            </div>
            <button
              onClick={() => { loadEarnings(); loadScanStatus(); }}
              disabled={isLoading}
              className="flex items-center gap-2 text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:text-slate-900 transition-colors disabled:opacity-50"
            >
              <RefreshCcw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              {lastFetch ? `Aktualisiert ${lastFetch.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'Laden'}
            </button>
          </div>

          {/* ── Ladefehler ─────────────────────────────────────────────────── */}
          {error && (
            <div className="bg-rose-50 border border-rose-100 p-4 rounded-[16px] text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          {/* ── Per-Aktie Status-Liste ──────────────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-[24px] overflow-hidden shadow-sm">

            {/* Legende + "Alle fehlenden abrufen" */}
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-4">
                <span className="text-[9px] text-slate-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0" /> Termin bekannt
                </span>
                <span className="text-[9px] text-slate-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-300 inline-block shrink-0" /> Kein Termin
                </span>
                <span className="text-[9px] text-slate-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shrink-0" /> Noch nicht abgerufen
                </span>
              </div>
              {(() => {
                const missing = tickers.filter(sym => !earnScanMap.has(sym) && !events.find(e => e.ticker === sym));
                if (missing.length === 0) return null;
                return (
                  <button
                    onClick={() => fetchEarningsForSymbol(missing[0])}
                    disabled={!!fetchingEarnSym || isLoading}
                    className="flex items-center gap-1.5 text-[9px] font-black bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-40"
                  >
                    {fetchingEarnSym ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                    {missing.length} fehlende abrufen
                  </button>
                );
              })()}
            </div>

            {/* Lade-Skeleton */}
            {isLoading && (
              <div className="px-5 py-4 flex items-center gap-3">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />
                <span className="text-xs font-medium text-slate-500">Lade Earnings-Daten aus Datenbank…</span>
              </div>
            )}

            {/* Per-Aktie Zeilen */}
            <div className="divide-y divide-slate-100">
              {tickers.map(sym => {
                const stockEvents = events.filter(e => e.ticker === sym);
                const hasEvent    = stockEvents.length > 0;
                const lastScan    = earnScanMap.get(sym);
                const isScanned   = !!lastScan;
                const isFetching  = fetchingEarnSym === sym;

                const holding = [...portfolioSorted, ...watchlistSorted].find(
                  h => (h.ticker?.symbol ?? h.symbol) === sym,
                );
                const name = holding?.ticker?.company_name ?? holding?.name ?? sym;

                if (hasEvent) {
                  // ── Termin(e) in DB vorhanden ──────────────────────────────
                  return stockEvents.map((event, idx) => {
                    const days = daysUntil(event.date);
                    const soon = days >= 0 && days <= 7;
                    return (
                      <div
                        key={`${sym}-${idx}`}
                        className={`px-5 py-3.5 flex items-start gap-3 hover:bg-slate-50 transition-colors ${soon ? 'bg-emerald-50/40' : ''}`}
                      >
                        <span className="mt-1 w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="text-xs font-black text-slate-900 font-mono">{sym}</span>
                            {name !== sym && <span className="text-[10px] text-slate-500 truncate">{name}</span>}
                            {soon && days >= 0 && (
                              <span className="text-[8px] font-black bg-emerald-600 text-white px-1.5 py-0.5 rounded uppercase tracking-widest shrink-0">
                                {days === 0 ? 'Heute' : `in ${days}d`}
                              </span>
                            )}
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase tracking-widest ${timeOfDayColor(event.timeOfDay)}`}>
                              {event.timeOfDay}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-slate-500 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />{formatDate(event.date)}
                            </span>
                            {event.epsEstimate && <span>EPS: <strong>{event.epsEstimate}</strong></span>}
                            {event.revenueEstimate && <span>Umsatz: <strong>{event.revenueEstimate}</strong></span>}
                            {event.quarter && <span className="text-slate-300">{event.quarter}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] font-mono text-slate-400">
                            {days >= 0 ? (days === 0 ? 'Heute' : `in ${days}d`) : `vor ${Math.abs(days)}d`}
                          </span>
                          <button
                            onClick={() => fetchEarningsForSymbol(sym)}
                            disabled={!!fetchingEarnSym}
                            title="Neu laden"
                            className="text-slate-300 hover:text-emerald-500 transition-colors disabled:opacity-30"
                          >
                            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    );
                  });
                } else if (isScanned) {
                  // ── Gescannt, kein bevorstehender Termin ──────────────────
                  const scanDate = new Date(lastScan!).toLocaleDateString('de-DE', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  });
                  return (
                    <div key={sym} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                      <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-600 font-mono">{sym}</span>
                          {name !== sym && <span className="text-[10px] text-slate-400 truncate">{name}</span>}
                        </div>
                        <p className="text-[10px] text-slate-400">Kein bevorstehender Termin bekannt · Scan: {scanDate}</p>
                      </div>
                      <button
                        onClick={() => fetchEarningsForSymbol(sym)}
                        disabled={!!fetchingEarnSym}
                        title="Neu laden (Yahoo Finance → KI)"
                        className="flex items-center gap-1 text-[8px] font-black text-slate-400 hover:text-emerald-600 uppercase tracking-wide transition-colors disabled:opacity-40 shrink-0 px-2 py-1 rounded-lg hover:bg-emerald-50"
                      >
                        {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                        Neu laden
                      </button>
                    </div>
                  );
                } else {
                  // ── Noch nie gescannt ─────────────────────────────────────
                  return (
                    <div key={sym} className="px-5 py-3 flex items-center gap-3 bg-amber-50/30 hover:bg-amber-50/60 transition-colors">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-700 font-mono">{sym}</span>
                          {name !== sym && <span className="text-[10px] text-slate-500 truncate">{name}</span>}
                        </div>
                        <p className="text-[10px] text-amber-600">Noch nicht abgerufen – kein Eintrag in Datenbank</p>
                      </div>
                      <button
                        onClick={() => fetchEarningsForSymbol(sym)}
                        disabled={!!fetchingEarnSym}
                        className="flex items-center gap-1.5 text-[9px] font-black bg-emerald-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-40 shrink-0"
                      >
                        {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                        Jetzt abrufen
                      </button>
                    </div>
                  );
                }
              })}
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
              <p className="text-[9px] text-slate-400 italic">Daten aus Datenbank-Cache (Yahoo Finance / KI) · Keine Anlageberatung · Offizielle Termine beim Unternehmen prüfen</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default EarningsCalendar;
