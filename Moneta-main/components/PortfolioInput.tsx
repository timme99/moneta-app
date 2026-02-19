/**
 * PortfolioInput – Smarte Aktieneingabe mit Autocomplete gegen ticker_mapping.
 *
 * - Sucht live in der Supabase ticker_mapping-Tabelle (Anon-Key, RLS)
 * - Optionale Felder: Stückzahl + Kaufpreis → echte Position
 * - Felder leer → Watchlist-Eintrag (watchlist = true, shares/buy_price = null)
 * - Speichert Positionen in der holdings-Tabelle des eingeloggten Users
 * - "KI-Analyse starten" formatiert alle Positionen als reichhaltigen Text
 *   (inkl. Sektor, Beschreibung, Wettbewerber) und übergibt ihn an onAnalyze
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Plus, Trash2, Loader2, TrendingUp, BarChart3, BookMarked, Info,
} from 'lucide-react';
import { getSupabaseBrowser } from '../lib/supabaseBrowser';
import type { TickerEntry } from '../lib/supabase-types';

interface HoldingRow {
  id: string;
  ticker: TickerEntry;
  shares: number | null;
  buy_price: number | null;
  watchlist: boolean;
}

interface PortfolioInputProps {
  onAnalyze: (portfolioText: string) => void;
  isLoading?: boolean;
}

const PortfolioInput: React.FC<PortfolioInputProps> = ({ onAnalyze, isLoading }) => {
  const sb = getSupabaseBrowser();

  const [userId, setUserId]           = useState<string | null>(null);
  const [authError, setAuthError]     = useState(false);

  // Suche
  const [query, setQuery]             = useState('');
  const [suggestions, setSuggestions] = useState<TickerEntry[]>([]);
  const [isFetching, setIsFetching]   = useState(false);
  const [selected, setSelected]       = useState<TickerEntry | null>(null);
  const [showDrop, setShowDrop]       = useState(false);

  // Kaufdaten (optional)
  const [shares, setShares]           = useState('');
  const [buyPrice, setBuyPrice]       = useState('');

  // Depot-Liste
  const [holdings, setHoldings]           = useState<HoldingRow[]>([]);
  const [isLoadingHoldings, setIsLoadingH] = useState(true);
  const [isSaving, setIsSaving]           = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropRef     = useRef<HTMLDivElement>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sb) { setAuthError(true); setIsLoadingH(false); return; }
    sb.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
      } else {
        setAuthError(true);
        setIsLoadingH(false);
      }
    });
  }, []);

  // ── Holdings laden ────────────────────────────────────────────────────────
  useEffect(() => {
    if (userId) loadHoldings();
  }, [userId]);

  const loadHoldings = async () => {
    if (!sb || !userId) return;
    setIsLoadingH(true);
    const { data } = await sb
      .from('holdings')
      .select('id, shares, buy_price, watchlist, ticker_mapping(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    setHoldings(
      (data ?? []).map((row: any) => ({
        id:        row.id,
        ticker:    row.ticker_mapping as TickerEntry,
        shares:    row.shares,
        buy_price: row.buy_price,
        watchlist: row.watchlist,
      }))
    );
    setIsLoadingH(false);
  };

  // ── Autocomplete ──────────────────────────────────────────────────────────
  const searchTickers = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!q.trim() || q.length < 2) { setSuggestions([]); setShowDrop(false); return; }

      debounceRef.current = setTimeout(async () => {
        if (!sb) return;
        setIsFetching(true);
        const { data } = await sb
          .from('ticker_mapping')
          .select('*')
          .or(`company_name.ilike.%${q}%,symbol.ilike.%${q}%`)
          .limit(8);
        setSuggestions(data ?? []);
        setShowDrop(true);
        setIsFetching(false);
      }, 300);
    },
    [sb]
  );

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    setSelected(null);
    searchTickers(v);
  };

  const handleSelect = (t: TickerEntry) => {
    setSelected(t);
    setQuery(`${t.company_name} (${t.symbol})`);
    setSuggestions([]);
    setShowDrop(false);
  };

  // Dropdown schließen bei Klick außerhalb
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Hinzufügen ────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!sb || !userId || !selected) return;
    setIsSaving(true);

    const sharesNum = shares.trim()   ? parseFloat(shares.replace(',', '.'))   : null;
    const priceNum  = buyPrice.trim() ? parseFloat(buyPrice.replace(',', '.')) : null;
    const isWatchlist = sharesNum === null || priceNum === null;

    const { error } = await sb.from('holdings').upsert(
      {
        user_id:   userId,
        ticker_id: selected.id,
        watchlist: isWatchlist,
        shares:    isWatchlist ? null : sharesNum,
        buy_price: isWatchlist ? null : priceNum,
      },
      { onConflict: 'user_id,ticker_id' }
    );

    if (!error) {
      setQuery('');
      setSelected(null);
      setShares('');
      setBuyPrice('');
      await loadHoldings();
    } else {
      console.error('[PortfolioInput] upsert error:', error.message);
    }
    setIsSaving(false);
  };

  // ── Löschen ───────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!sb) return;
    await sb.from('holdings').delete().eq('id', id);
    setHoldings((prev) => prev.filter((h) => h.id !== id));
  };

  // ── Analyse-Text formatieren ──────────────────────────────────────────────
  const handleAnalyze = () => {
    if (holdings.length === 0) return;

    const lines = holdings.map((h, i) => {
      const t   = h.ticker;
      const pos = h.watchlist
        ? 'Watchlist'
        : `${h.shares} Stück | Kaufpreis: ${h.buy_price?.toFixed(2)} €`;

      const meta = [
        t.sector      ? `Sektor: ${t.sector}`           : null,
        t.industry    ? `Industrie: ${t.industry}`       : null,
        t.competitors ? `Wettbewerber: ${t.competitors}` : null,
        t.pe_ratio_static != null ? `KGV: ${t.pe_ratio_static}` : null,
      ]
        .filter(Boolean)
        .join(' | ');

      const desc = t.description_static
        ? `\n   Beschreibung: ${t.description_static}`
        : '';

      return `${i + 1}. ${t.company_name} (${t.symbol}) | ${pos}${meta ? ` | ${meta}` : ''}${desc}`;
    });

    const text = [
      'Depot-Analyse:',
      '',
      ...lines,
      '',
      'Bitte analysiere dieses Depot vollständig gemäß den Systemvorgaben.',
      'Nutze Sektor-, Wettbewerber- und KGV-Daten für eine tiefgreifende M&A-Bewertung.',
    ].join('\n');

    onAnalyze(text);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (authError) {
    return (
      <div className="max-w-2xl mx-auto bg-amber-50 border border-amber-100 p-8 rounded-[32px] text-center space-y-3">
        <Info className="w-8 h-8 text-amber-500 mx-auto" />
        <p className="text-sm font-bold text-amber-800">
          Bitte zuerst einloggen, um das Depot zu verwalten.
        </p>
        <p className="text-xs text-amber-600 font-medium">
          Die Portfolio-Verwaltung benötigt ein Konto, damit deine Positionen sicher gespeichert werden.
        </p>
      </div>
    );
  }

  const isWatchlistAdd = !shares.trim() || !buyPrice.trim();

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* ── Suchfeld ────────────────────────────────────────────────────── */}
      <div className="relative" ref={dropRef}>
        <div className="bg-white border border-slate-200 rounded-[24px] p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Search className="w-5 h-5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={handleQueryChange}
              onFocus={() => suggestions.length > 0 && setShowDrop(true)}
              placeholder="Aktie oder ETF suchen (z. B. SAP, Apple, MSCI World…)"
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-900 placeholder:text-slate-400"
            />
            {isFetching && <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0" />}
          </div>

          {/* Dropdown */}
          {showDrop && suggestions.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3 space-y-0.5">
              {suggestions.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSelect(t)}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-blue-50 rounded-xl text-left transition-colors group"
                >
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-slate-900">{t.company_name}</span>
                    <span className="text-xs text-slate-400 ml-2 font-mono">{t.symbol}</span>
                  </div>
                  {t.sector && (
                    <span className="ml-2 shrink-0 text-[9px] font-black text-blue-600 bg-blue-50 group-hover:bg-white px-2 py-0.5 rounded-full uppercase tracking-widest transition-colors">
                      {t.sector}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Kaufdaten-Formular */}
        {selected && (
          <div className="mt-3 bg-blue-50 border border-blue-100 rounded-[20px] p-4 space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest">
                {selected.company_name}
              </span>
              <span className="text-[9px] text-blue-400 font-mono">({selected.symbol})</span>
            </div>

            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest">
                  Stückzahl
                </label>
                <input
                  type="number"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  placeholder="z. B. 10"
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-[14px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
                  min="0"
                  step="any"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest">
                  Kaufpreis (€)
                </label>
                <input
                  type="number"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  placeholder="z. B. 145,00"
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-[14px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
                  min="0"
                  step="any"
                />
              </div>
            </div>

            <p className="text-[9px] text-blue-500 font-medium flex items-center gap-1">
              <BookMarked className="w-3 h-3" />
              {isWatchlistAdd
                ? 'Felder leer → wird als Watchlist-Eintrag gespeichert'
                : 'Stückzahl & Kaufpreis → vollständige Portfolio-Position'}
            </p>

            <button
              onClick={handleAdd}
              disabled={isSaving}
              className="w-full bg-slate-900 text-white py-3 rounded-[14px] text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSaving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Plus className="w-4 h-4" />}
              {isWatchlistAdd ? 'Watchlist speichern' : 'Position hinzufügen'}
            </button>
          </div>
        )}
      </div>

      {/* ── Depot-Liste ──────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-[24px] overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">
            Mein Depot
          </h3>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            {holdings.length} Position{holdings.length !== 1 ? 'en' : ''}
          </span>
        </div>

        {isLoadingHoldings ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
          </div>
        ) : holdings.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <TrendingUp className="w-8 h-8 text-slate-200 mx-auto" />
            <p className="text-sm text-slate-400 font-medium">
              Noch keine Positionen – suche oben eine Aktie.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {holdings.map((h) => (
              <div
                key={h.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900 truncate">
                      {h.ticker.company_name}
                    </span>
                    {h.watchlist && (
                      <span className="shrink-0 text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-widest">
                        Watchlist
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-slate-400 font-mono">{h.ticker.symbol}</span>
                    {!h.watchlist && h.shares != null && (
                      <span className="text-[10px] text-slate-500 font-medium">
                        {h.shares} Stk. · {h.buy_price?.toFixed(2)} €
                      </span>
                    )}
                    {h.ticker.sector && (
                      <span className="text-[9px] text-blue-500 font-bold">{h.ticker.sector}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(h.id)}
                  className="p-2 hover:bg-rose-50 hover:text-rose-500 text-slate-300 rounded-xl transition-colors shrink-0"
                  title="Position entfernen"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Analysieren-Button ────────────────────────────────────────────── */}
      {holdings.length > 0 && (
        <button
          onClick={handleAnalyze}
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-5 rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-3 hover:bg-slate-900 transition-all shadow-xl shadow-blue-600/20 disabled:opacity-50"
        >
          {isLoading
            ? <Loader2 className="w-5 h-5 animate-spin" />
            : <BarChart3 className="w-5 h-5" />}
          KI-Analyse starten · {holdings.filter(h => !h.watchlist).length} Position
          {holdings.filter(h => !h.watchlist).length !== 1 ? 'en' : ''} + {holdings.filter(h => h.watchlist).length} Watchlist
        </button>
      )}
    </div>
  );
};

export default PortfolioInput;
