import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock, TrendingUp, Loader2, RefreshCcw, AlertTriangle, Info, DollarSign, TrendingDown, Database, Lock, Star } from 'lucide-react';
import { fetchDividendsFallback } from '../services/geminiService';
import { EarningsEvent, HoldingRow } from '../types';
import { supabase as sb } from '../lib/supabaseClient';

const DIVIDEND_EVENT_TYPE = 'dividend_info';
const SENTINEL_DATE       = '1970-01-01';
const CACHE_TTL_MS        = 7 * 24 * 60 * 60 * 1000; // 7 Tage

interface EarningsCalendarProps {
  holdings: HoldingRow[];
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
  if (t === 'nach Marktschluss') return 'bg-blue-50 text-blue-700 border-blue-100';
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

const EarningsCalendar: React.FC<EarningsCalendarProps> = ({ holdings }) => {
  const [events, setEvents] = useState<EarningsEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [scannedSymbol, setScannedSymbol] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState<{ total: number; cached: number; stale: number } | null>(null);

  // Dividenden-State
  const [dividendData, setDividendData] = useState<DividendInfo[]>([]);
  const [isDivLoading, setIsDivLoading] = useState(false);
  const [divError, setDivError] = useState<string | null>(null);
  const [isDivFallback, setIsDivFallback] = useState(false);
  // Positionen ohne Supabase-Cache → Premium-gesperrt
  const [lockedHoldings, setLockedHoldings] = useState<HoldingRow[]>([]);

  // Alle Positionen inkl. Watchlist – die KI braucht nur das Symbol für Earnings-Termine
  const tickers = holdings
    .map(h => h.ticker?.symbol ?? h.symbol)
    .filter(Boolean)
    .slice(0, 12);

  const tickerKey = tickers.slice().sort().join(',');

  // Nur Positionen mit Stückzahl für Dividenden-Berechnung
  const portfolioHoldings = holdings.filter(h => !h.watchlist && h.shares && h.shares > 0);

  // ── Earnings laden (Cache-First via /api/earnings) ──────────────────────────

  const loadEarnings = async () => {
    if (tickers.length === 0) return;
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
    } catch (e: any) {
      setError(e?.message?.includes(':') ? e.message.split(':')[1] : 'Earnings-Daten konnten nicht geladen werden.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Dividenden: erst Supabase-Cache, dann API für fehlende Symbole ─────────

  const loadDividends = async () => {
    if (portfolioHoldings.length === 0) return;
    setIsDivLoading(true);
    setDivError(null);
    setIsDivFallback(false);

    const portfolioTickers = portfolioHoldings
      .map(h => h.ticker?.symbol ?? h.symbol)
      .filter(Boolean)
      .slice(0, 20);

    // ── Schritt 1: Supabase-Cache lesen (sofort, kostenlos) ──────────────────
    const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
    const { data: cachedRows } = await sb
      .from('stock_events')
      .select('symbol, details, last_updated')
      .in('symbol', portfolioTickers)
      .eq('event_type', DIVIDEND_EVENT_TYPE)
      .eq('event_date', SENTINEL_DATE)
      .gte('last_updated', cutoff);

    const cachedSet = new Set((cachedRows ?? []).map(r => r.symbol as string));
    const cachedData: DividendInfo[] = (cachedRows ?? []).map(r => ({
      symbol: r.symbol as string,
      ...(r.details as Omit<DividendInfo, 'symbol'>),
    }));

    // Positionen ohne Cache-Eintrag → Premium-gesperrt anzeigen
    const locked = portfolioHoldings.filter(h => {
      const sym = h.ticker?.symbol ?? h.symbol;
      return !cachedSet.has(sym);
    });
    setLockedHoldings(locked);
    setDividendData(cachedData);

    // ── Schritt 2: Falls Cache leer → Gemini-Fallback für gecachte Werte ────
    // (nur wenn gar keine Daten im Cache – kein Alpha-Vantage-Call ohne Premium)
    if (cachedData.length === 0 && locked.length > 0) {
      try {
        const fallback = await fetchDividendsFallback(portfolioTickers.slice(0, 5));
        setDividendData(fallback as DividendInfo[]);
        setLockedHoldings([]);
        setIsDivFallback(true);
      } catch {
        // Kein Fallback verfügbar – alle Positionen bleiben gesperrt
      }
    }

    setIsDivLoading(false);
  };

  useEffect(() => {
    if (tickers.length > 0) {
      loadEarnings();
      loadDividends();
    } else {
      setLockedHoldings([]);
      setDividendData([]);
    }
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
      <div className="bg-gradient-to-br from-slate-900 to-blue-950 p-8 md:p-12 rounded-[40px] text-white relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full -mr-16 -mt-16 blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-blue-400" />
            <span className="text-blue-400 font-black text-[10px] uppercase tracking-[0.3em]">Depot-Kalender</span>
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
            {isDivLoading && (
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                <Loader2 className="w-3 h-3 animate-spin" />
                {isDivFallback ? 'Lade KI-Prognose…' : 'Lädt…'}
              </div>
            )}
          </div>

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
              {isDivLoading ? (
                <div className="h-8 bg-slate-100 rounded-lg animate-pulse" />
              ) : holdingDividends.length > 0 ? (
                <p className="text-2xl font-black text-slate-900">
                  {formatCurrency(receivedDividends)} <span className="text-sm font-medium text-slate-400">€</span>
                </p>
              ) : (
                <p className="text-sm text-slate-400 font-medium">Keine Dividenden-Daten</p>
              )}
              {holdingDividends.filter(h => h.isPaid).length > 0 && (
                <p className="text-[10px] text-emerald-600 font-medium mt-1">
                  {holdingDividends.filter(h => h.isPaid).length} Position{holdingDividends.filter(h => h.isPaid).length !== 1 ? 'en' : ''} mit Ex-Datum in {currentYear}
                </p>
              )}
            </div>

            {/* Erwartete Dividenden */}
            <div className="bg-white border border-blue-100 rounded-[24px] p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
                  <TrendingDown className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Erwartete Dividenden</p>
                  <p className="text-[9px] text-slate-400">Rest {currentYear} (Schätzung)</p>
                </div>
              </div>
              {isDivLoading ? (
                <div className="h-8 bg-slate-100 rounded-lg animate-pulse" />
              ) : holdingDividends.length > 0 ? (
                <p className="text-2xl font-black text-slate-900">
                  {formatCurrency(expectedDividends)} <span className="text-sm font-medium text-slate-400">€</span>
                </p>
              ) : (
                <p className="text-sm text-slate-400 font-medium">Keine Dividenden-Daten</p>
              )}
              {holdingDividends.length > 0 && (
                <p className="text-[10px] text-blue-600 font-medium mt-1">
                  Gesamt p.a.: {formatCurrency(totalAnnualDividend)} €
                </p>
              )}
            </div>
          </div>

          {/* Dividenden-Fehler */}
          {divError && !isDivLoading && !isDivFallback && (
            <div className="bg-rose-50 border border-rose-100 p-4 rounded-[16px] text-rose-700 text-xs font-medium">
              Offizielle Dividenden-Daten nicht verfügbar – {divError}
            </div>
          )}

          {/* Per-Position-Liste */}
          {(holdingDividends.length > 0 || lockedHoldings.length > 0) && !isDivLoading && (
            <div className="bg-white border border-slate-200 rounded-[24px] overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Dividenden je Position</p>
                {lockedHoldings.length > 0 && (
                  <span className="flex items-center gap-1 text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg uppercase tracking-widest">
                    <Lock className="w-2.5 h-2.5" />
                    {lockedHoldings.length} nur Premium
                  </span>
                )}
              </div>

              <div className="divide-y divide-slate-100">
                {/* ── Freigeschaltete Positionen (Daten im Cache) ─────────────── */}
                {holdingDividends.map((h, i) => (
                  <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${h.isPaid ? 'bg-emerald-500' : 'bg-blue-400'}`} />
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
                      <p className={`text-[9px] font-bold uppercase tracking-widest ${h.isPaid ? 'text-emerald-600' : 'text-blue-500'}`}>
                        {h.isPaid ? 'Ex-Datum vergangen' : h.exDividendDate ? `Ex: ${formatDate(h.exDividendDate)}` : 'Termin offen'}
                      </p>
                    </div>
                  </div>
                ))}

                {/* ── Premium-gesperrte Positionen (kein Cache-Eintrag) ────────── */}
                {lockedHoldings.map((h, i) => {
                  const sym = h.ticker?.symbol ?? h.symbol;
                  const name = h.ticker?.company_name ?? h.name ?? sym;
                  return (
                    <div key={`locked-${i}`} className="px-6 py-4 flex items-center justify-between bg-slate-50/60 relative overflow-hidden">
                      {/* Linker Inhalt – Name + Symbol sichtbar */}
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-slate-300" />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-bold text-slate-500">{name}</p>
                            <span className="flex items-center gap-0.5 text-[8px] font-black bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded uppercase tracking-widest">
                              <Star className="w-2 h-2" /> Premium
                            </span>
                          </div>
                          <p className="text-[10px] font-mono text-slate-400">
                            {sym} · {h.shares ?? '–'} Stk
                          </p>
                        </div>
                      </div>
                      {/* Rechter Inhalt – Dividendenzahlen unscharf */}
                      <div className="text-right select-none">
                        <p className="text-sm font-black text-slate-300 blur-[5px] pointer-events-none">
                          {formatCurrency(12.34)} €
                        </p>
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                          <Lock className="w-3 h-3 text-amber-500" />
                          <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">
                            Nur Premium
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="px-6 py-3 bg-slate-50 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 italic">
                  {isDivFallback
                    ? '* KI-Schätzung basierend auf historischen Ausschüttungsmustern. Keine offiziellen Daten – alle Angaben ohne Gewähr. Termine und Beträge beim Unternehmen prüfen.'
                    : '* Schätzungen basierend auf Alpha Vantage OVERVIEW-Daten (jährliche Dividende). Keine Garantie für zukünftige Zahlungen. Angaben in lokaler Währung des jeweiligen Börsenplatzes.'}
                </p>
              </div>
            </div>
          )}

          {/* Premium-Upsell-Banner (wenn mind. 1 Position gesperrt) */}
          {lockedHoldings.length > 0 && !isDivLoading && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-[20px] p-5 flex items-center gap-4">
              <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center shrink-0">
                <Star className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-slate-800">
                  {lockedHoldings.length} weitere Position{lockedHoldings.length !== 1 ? 'en' : ''} mit Premium freischalten
                </p>
                <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                  Dividendendaten für{' '}
                  {lockedHoldings.slice(0, 3).map(h => h.ticker?.symbol ?? h.symbol).join(', ')}
                  {lockedHoldings.length > 3 ? ` +${lockedHoldings.length - 3} weitere` : ''}{' '}
                  sind noch nicht im Cache verfügbar – Premium lädt sie live.
                </p>
              </div>
              <span className="text-[10px] font-black text-amber-700 bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-xl uppercase tracking-widest whitespace-nowrap shrink-0">
                Bald verfügbar
              </span>
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
                  <span className="text-blue-500 ml-1">· {scannedSymbol} gescannt</span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => { loadEarnings(); loadDividends(); }}
            disabled={isLoading || isDivLoading}
            className="flex items-center gap-2 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-slate-900 transition-colors disabled:opacity-50"
          >
            <RefreshCcw className={`w-3 h-3 ${(isLoading || isDivLoading) ? 'animate-spin' : ''}`} />
            {lastFetch ? `Aktualisiert ${lastFetch.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'Laden'}
          </button>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="bg-white px-6 py-4 rounded-2xl shadow-xl border border-slate-100 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600 shrink-0" />
            <div>
              <span className="text-xs font-black text-slate-900 uppercase tracking-widest block">Lade Earnings-Kalender…</span>
              <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
                Cache wird geprüft · ggf. 1 neue Aktie gescannt
              </span>
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
            <TrendingUp className="w-4 h-4 text-blue-600" /> Bevorstehende Earnings
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcoming.map((event, i) => {
              const days = daysUntil(event.date);
              const isVerySoon = days <= 7;
              return (
                <div
                  key={i}
                  className={`bg-white border rounded-[24px] p-6 shadow-sm transition-all hover:shadow-md ${
                    isVerySoon ? 'border-blue-200 ring-1 ring-blue-100' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-black text-slate-900 text-base">{event.company}</span>
                        {isVerySoon && (
                          <span className="text-[9px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-full uppercase tracking-widest">
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
              Analysiere {tickers.map(t => <span key={t} className="font-mono font-bold text-blue-600">{t}</span>).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, ', ', el], [])}…
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
