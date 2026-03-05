import React, { useState, useEffect } from 'react';
import { Calendar, Clock, TrendingUp, Loader2, RefreshCcw, AlertTriangle, Info } from 'lucide-react';
import { fetchEarningsCalendar } from '../services/geminiService';
import { EarningsEvent, HoldingRow } from '../types';

interface EarningsCalendarProps {
  holdings: HoldingRow[];
}

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
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    });
  } catch {
    return dateStr;
  }
};

const EarningsCalendar: React.FC<EarningsCalendarProps> = ({ holdings }) => {
  const [events, setEvents] = useState<EarningsEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const tickers = holdings
    .filter(h => !h.watchlist && h.ticker?.symbol)
    .map(h => h.ticker.symbol)
    .slice(0, 12);

  // Stabiler Key: neu laden wenn sich die Ticker-Menge ändert
  const tickerKey = tickers.slice().sort().join(',');

  const load = async () => {
    if (tickers.length === 0) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchEarningsCalendar(tickers);
      const sorted = (data as EarningsEvent[]).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      setEvents(sorted);
      setLastFetch(new Date());
    } catch (e: any) {
      setError(e?.message?.includes(':') ? e.message.split(':')[1] : 'Earnings-Daten konnten nicht geladen werden.');
    } finally {
      setIsLoading(false);
    }
  };

  // Neu laden wenn sich die Ticker-Zusammensetzung ändert (neue Aktie hinzugefügt / gelöscht)
  useEffect(() => {
    if (tickers.length > 0) {
      load();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey]);

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
          <h2 className="text-3xl md:text-4xl font-black mb-3 tracking-tighter">Earnings Calendar</h2>
          <p className="text-slate-400 font-medium leading-relaxed text-sm max-w-xl">
            Bevorstehende Quartalszahlen deiner Depot-Positionen. KI-Schätzungen auf Basis historischer Quartalsmuster – rein informativ, keine Anlageberatung.
          </p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-100 p-4 rounded-[20px] flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
          <strong>Hinweis:</strong> Alle Earnings-Daten sind KI-Schätzungen auf Basis historischer Quartalsmuster und stellen keine verlässlichen Prognosen dar. Offizielle Termine immer auf der Unternehmens-IR-Seite prüfen. Keine Anlageberatung.
        </p>
      </div>

      {tickers.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-[28px] p-12 text-center shadow-sm">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Füge Depot-Positionen hinzu, um deren Earnings-Termine anzuzeigen.</p>
        </div>
      )}

      {tickers.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            {tickers.length} Position{tickers.length !== 1 ? 'en' : ''} analysiert
          </p>
          <button
            onClick={load}
            disabled={isLoading}
            className="flex items-center gap-2 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-slate-900 transition-colors disabled:opacity-50"
          >
            <RefreshCcw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            {lastFetch ? `Aktualisiert ${lastFetch.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'Laden'}
          </button>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="bg-white px-6 py-4 rounded-2xl shadow-xl border border-slate-100 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-xs font-black text-slate-900 uppercase tracking-widest">KI analysiert Earnings-Kalender...</span>
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

      {!isLoading && events.length === 0 && tickers.length > 0 && !error && lastFetch && (
        <div className="bg-white border border-slate-200 rounded-[28px] p-12 text-center shadow-sm">
          <Info className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium text-sm">Keine Earnings-Daten verfügbar. Bitte erneut versuchen.</p>
        </div>
      )}
    </div>
  );
};

export default EarningsCalendar;
