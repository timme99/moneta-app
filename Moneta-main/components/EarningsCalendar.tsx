import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Calendar, Clock, TrendingUp, Loader2, RefreshCcw, AlertTriangle, Info, DollarSign, TrendingDown, Database } from 'lucide-react';
import { EarningsEvent, HoldingRow } from '../types';
import { supabase as sb } from '../lib/supabaseClient';
import { PLAN_LIMITS } from '../lib/useSubscription';

const DIVIDEND_EVENT_TYPE = 'dividend_info';
const SENTINEL_DATE       = '1970-01-01';
const CACHE_TTL_MS        = 7 * 24 * 60 * 60 * 1000; // 7 Tage

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
  isEstimated?: boolean; // true wenn aus Gemini-Fallback
}

interface HoldingDividend {
  symbol: string;
  name: string;
  shares: number;
  dividendPerShare: number;
  annualIncome: number;
  exDividendDate: string;
  isPaid: boolean; // Ex-Date in diesem Jahr bereits vergangen
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

  // Portfolio-Positionen nach Positionsgröße (Stückzahl × Kaufpreis) sortieren
  const earningsLimit = isPremium
    ? PLAN_LIMITS.premium.maxEarningsHoldings
    : PLAN_LIMITS.free.maxEarningsHoldings;

  const portfolioSorted = holdings
    .filter(h => !h.watchlist && h.shares != null && h.buy_price != null)
    .sort((a, b) => (b.shares! * b.buy_price!) - (a.shares! * a.buy_price!));

  const watchlistSorted = holdings
    .filter(h => h.watchlist)
    .sort((a, b) => (a.ticker?.symbol ?? a.symbol ?? '').localeCompare(b.ticker?.symbol ?? b.symbol ?? ''));

  // Free: nur Top-N Portfolio-Positionen; Premium: alle; dann Watchlist alphabetisch
  const limitedPortfolio = Number.isFinite(earningsLimit)
    ? portfolioSorted.slice(0, earningsLimit)
    : portfolioSorted;

  const earningsHoldingsTrimmed = !isPremium && portfolioSorted.length > earningsLimit;

  const tickers = [...limitedPortfolio, ...watchlistSorted]
    .map(h => h.ticker?.symbol ?? h.symbol)
    .filter(Boolean)
    .slice(0, 12);

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

      // Noch unbekannte Symbole? → automatisch nächsten Scan auslösen (1,5 s Pause)
      if ((json.cacheStats?.stale ?? 0) > 0) {
        autoScanTimerRef.current = setTimeout(() => {
          isScanningRef.current = false;
          loadEarnings(true);
        }, 1500);
      } else {
        isScanningRef.current = false;
      }
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
    const portfolioTickers = [...portfolioHoldings]
      .sort((a, b) => (b.shares! * (b.buy_price ?? 0)) - (a.shares! * (a.buy_price ?? 0)))
      .map(h => h.ticker?.symbol ?? h.symbol)
      .filter(Boolean)
      .slice(0, 20) as string[];

    try {
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

      // Noch stale Symbole? → auto-retry nach 2 s
      if ((stats?.stale ?? 0) > 0) {
        divScanTimerRef.current = setTimeout(() => {
          isDivScanningRef.current = false;
          loadDividends(true);
        }, 2000);
      } else {
        isDivScanningRef.current = false;
      }
    } catch (e: any) {
      isDivScanningRef.current = false;
      setDivError(e?.message ?? 'Dividenden-Daten konnten nicht geladen werden.');
    } finally {
      setIsDivLoading(false);
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
    if (dividendData.length === 0) return [];

    return portfolioHoldings
      .map(h => {
        const sym = h.ticker?.symbol ?? h.symbol;
        const divInfo = dividendData.find(d => d.symbol === sym);
        if (!divInfo || divInfo.noData || divInfo.dividendPerShare === 0) return null;

        const shares = h.shares ?? 0;
        const annualIncome = shares * divInfo.dividendPerShare;

        // Ex-Datum in aktuellem Jahr und bereits vergangen → "bezahlt"
        let isPaid = false;
        if (divInfo.exDividendDate) {
          const exDate = new Date(divInfo.exDividendDate);
          isPaid = exDate.getFullYear() === currentYear && exDate <= today;
        }

        return {
          symbol: sym,
          name: h.ticker?.company_name ?? h.name ?? sym,
          shares,
          dividendPerShare: divInfo.dividendPerShare,
          annualIncome,
          exDividendDate: divInfo.exDividendDate,
          isPaid,
        } as HoldingDividend;
      })
      .filter((x): x is HoldingDividend => x !== null)
      .sort((a, b) => b.annualIncome - a.annualIncome);
  }, [dividendData, portfolioHoldings, currentYear]);

  const totalAnnualDividend = holdingDividends.reduce((sum, h) => sum + h.annualIncome, 0);
  // "Erhalten": Ex-Datum dieses Jahr schon vergangen → schätzungsweise erhaltene Dividende
  const receivedDividends = holdingDividends
    .filter(h => h.isPaid)
    .reduce((sum, h) => sum + h.annualIncome / 4, 0); // ~1 Quartalszahlung als Schätzung
  // "Erwartet": Rest des Jahres basierend auf Jahresdividende
  const monthsRemaining = Math.max(0, 12 - (today.getMonth() + 1));
  const expectedDividends = totalAnnualDividend * (monthsRemaining / 12);

  // ── Earnings-Aufteilung ────────────────────────────────────────────────────

  const upcoming = events.filter(e => daysUntil(e.date) >= 0);
  const past = events.filter(e => daysUntil(e.date) < 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-emerald-900 p-8 md:p-12 rounded-[40px] text-white relative overflow-hidden shadow-2xl">
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
                    ? `Lade Dividenden · Symbol ${divCacheStats.cached + 1} von ${divCacheStats.total}…`
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

          {/* Zwei Karten: Erhalten + Erwartet */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Erhaltene Dividenden */}
            <div className="bg-white border border-emerald-100 rounded-[24px] p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Erhaltene Dividenden</p>
                  <p className="text-[9px] text-slate-400">{currentYear} (Schätzung)</p>
                </div>
              </div>
              {isDivLoading && holdingDividends.length === 0 ? (
                <div className="h-8 bg-slate-100 rounded-lg animate-pulse" />
              ) : holdingDividends.length > 0 ? (
                <p className="text-2xl font-black text-slate-900">
                  {formatCurrency(receivedDividends)} <span className="text-sm font-medium text-slate-400">€</span>
                </p>
              ) : (
                <p className="text-sm text-slate-400 font-medium">
                  {isDivLoading ? 'Wird geladen…' : 'Keine Dividenden-Daten'}
                </p>
              )}
              {holdingDividends.filter(h => h.isPaid).length > 0 && (
                <p className="text-[10px] text-emerald-600 font-medium mt-1">
                  {holdingDividends.filter(h => h.isPaid).length} Position{holdingDividends.filter(h => h.isPaid).length !== 1 ? 'en' : ''} mit Ex-Datum in {currentYear}
                </p>
              )}
            </div>

            {/* Erwartete Dividenden */}
            <div className="bg-white border border-emerald-100 rounded-[24px] p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <TrendingDown className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Erwartete Dividenden</p>
                  <p className="text-[9px] text-slate-400">Rest {currentYear} (Schätzung)</p>
                </div>
              </div>
              {isDivLoading && holdingDividends.length === 0 ? (
                <div className="h-8 bg-slate-100 rounded-lg animate-pulse" />
              ) : holdingDividends.length > 0 ? (
                <p className="text-2xl font-black text-slate-900">
                  {formatCurrency(expectedDividends)} <span className="text-sm font-medium text-slate-400">€</span>
                </p>
              ) : (
                <p className="text-sm text-slate-400 font-medium">
                  {isDivLoading ? 'Wird geladen…' : 'Keine Dividenden-Daten'}
                </p>
              )}
              {holdingDividends.length > 0 && (
                <p className="text-[10px] text-emerald-600 font-medium mt-1">
                  Gesamt p.a.: {formatCurrency(totalAnnualDividend)} €
                </p>
              )}
            </div>
          </div>

          {/* Dividenden-Fehler */}
          {divError && !isDivLoading && (
            <div className="bg-rose-50 border border-rose-100 p-4 rounded-[16px] text-rose-700 text-xs font-medium">
              Dividenden-Daten konnten nicht geladen werden – {divError}
            </div>
          )}

          {/* Per-Position-Liste */}
          {(holdingDividends.length > 0 || (isDivLoading && portfolioHoldings.length > 0)) && (
            <div className="bg-white border border-slate-200 rounded-[24px] overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100">
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Dividenden je Position</p>
              </div>

              <div className="divide-y divide-slate-100">
                {/* Positionen mit Dividenden-Daten */}
                {holdingDividends.map((h, i) => (
                  <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${h.isPaid ? 'bg-emerald-500' : 'bg-emerald-400'}`} />
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-bold text-slate-800">{h.name}</p>
                          {dividendData.find(d => d.symbol === h.symbol)?.isEstimated && (
                            <span className="text-[8px] font-black bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded uppercase tracking-widest">
                              KI-Schätzung
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] font-mono text-slate-400">
                          {h.symbol} · {h.shares} Stk · {formatCurrency(h.dividendPerShare)} €/Aktie p.a.
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-slate-900">{formatCurrency(h.annualIncome)} €</p>
                      <p className={`text-[9px] font-bold uppercase tracking-widest ${h.isPaid ? 'text-emerald-600' : 'text-emerald-500'}`}>
                        {h.isPaid ? 'Ex-Datum vergangen' : h.exDividendDate ? `Ex: ${formatDate(h.exDividendDate)}` : 'Termin offen'}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Skeleton für Positionen die noch geladen werden */}
                {isDivLoading && portfolioHoldings
                  .filter(h => !holdingDividends.find(d => d.symbol === (h.ticker?.symbol ?? h.symbol)))
                  .slice(0, 3)
                  .map((h, i) => (
                    <div key={`loading-${i}`} className="px-6 py-4 flex items-center justify-between">
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
                  ))}
              </div>

              <div className="px-6 py-3 bg-slate-50 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 italic">
                  {isDivFallback
                    ? '* Teilweise KI-Schätzungen basierend auf historischen Ausschüttungsmustern. Alle Angaben ohne Gewähr.'
                    : '* Daten via Alpha Vantage. Keine Garantie für Richtigkeit. Angaben in lokaler Währung des jeweiligen Börsenplatzes.'}
                </p>
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
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              {tickers.length} Position{tickers.length !== 1 ? 'en' : ''}
            </p>
            {cacheStats && (
              <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg">
                <Database className="w-2.5 h-2.5" />
                {cacheStats.cached}/{cacheStats.total} gecacht
                {scannedSymbol && (
                  <span className="text-emerald-500 ml-1">· {scannedSymbol} gescannt</span>
                )}
              </div>
            )}
            {earningsHoldingsTrimmed && (
              <div className="flex items-center gap-1 text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                <Lock className="w-2.5 h-2.5" />
                Top {earningsLimit} von {portfolioSorted.length} · Premium für alle
              </div>
            )}
          </div>
          <button
            onClick={() => { loadEarnings(); loadDividends(); }}
            disabled={isLoading || isDivLoading}
            className="flex items-center gap-2 text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:text-slate-900 transition-colors disabled:opacity-50"
          >
            <RefreshCcw className={`w-3 h-3 ${(isLoading || isDivLoading) ? 'animate-spin' : ''}`} />
            {lastFetch ? `Aktualisiert ${lastFetch.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'Laden'}
          </button>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="bg-white px-6 py-4 rounded-2xl shadow-xl border border-slate-100 flex items-center gap-3 max-w-sm w-full">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-black text-slate-900 uppercase tracking-widest block">
                {cacheStats && cacheStats.stale > 0
                  ? `Scanne Symbol ${cacheStats.cached + 1} von ${cacheStats.total}…`
                  : 'Lade Earnings-Kalender…'}
              </span>
              {cacheStats && cacheStats.total > 0 && (
                <div className="mt-2">
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((cacheStats.cached / cacheStats.total) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                    {cacheStats.cached}/{cacheStats.total} gecacht
                    {scannedSymbol ? ` · ${scannedSymbol} gescannt` : ''}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-100 p-5 rounded-[20px] text-rose-700 text-sm font-medium">
          {error}
        </div>
      )}

      {!isLoading && upcoming.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" /> Bevorstehende Earnings
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcoming.map((event, i) => {
              const days = daysUntil(event.date);
              const isVerySoon = days <= 7;
              return (
                <div
                  key={i}
                  className={`bg-white border rounded-[24px] p-6 shadow-sm transition-all hover:shadow-md ${
                    isVerySoon ? 'border-emerald-200 ring-1 ring-emerald-600' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-black text-slate-900 text-base">{event.company}</span>
                        {isVerySoon && (
                          <span className="text-[9px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-full uppercase tracking-widest">
                            Bald
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">{event.ticker} · {event.quarter}</span>
                    </div>
                    <span className="text-[10px] font-black text-slate-400 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg whitespace-nowrap">
                      {days === 0 ? 'Heute' : `in ${days} Tag${days !== 1 ? 'en' : ''}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-xs font-medium text-slate-600">{formatDate(event.date)}</span>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg border uppercase tracking-widest ${timeOfDayColor(event.timeOfDay)}`}>
                      {event.timeOfDay}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">EPS-Schätzung*</p>
                      <p className="text-sm font-black text-slate-800">{event.epsEstimate}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Umsatz-Schätzung*</p>
                      <p className="text-sm font-black text-slate-800">{event.revenueEstimate}</p>
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-2 italic">* KI-Schätzung · keine Anlageberatung · Datum beim Unternehmen prüfen</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isLoading && past.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Vergangene Earnings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {past.map((event, i) => (
              <div key={i} className="bg-slate-50 border border-slate-100 rounded-[20px] p-5 opacity-70">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-700 text-sm">{event.company}</span>
                    <span className="text-[10px] font-mono text-slate-400 ml-2">{event.ticker}</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">{event.quarter}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">{formatDate(event.date)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {events.length === 0 && tickers.length > 0 && !error && (
        <div className="bg-white border border-slate-200 rounded-[28px] p-12 text-center shadow-sm">
          <Info className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          {isLoading ? (
            <p className="text-slate-500 font-medium text-sm">
              Analysiere {tickers.map(t => <span key={t} className="font-mono font-bold text-emerald-600">{t}</span>).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, ', ', el], [])}…
            </p>
          ) : (
            <p className="text-slate-500 font-medium text-sm">
              {lastFetch ? 'Keine Earnings-Daten gefunden. Bitte erneut versuchen.' : 'Lade Earnings-Daten…'}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default EarningsCalendar;
