/**
 * PortfolioInput – Smarte Aktieneingabe mit Autocomplete gegen ticker_mapping.
 *
 * - Sucht live in der Supabase ticker_mapping-Tabelle (Anon-Key, RLS)
 * - Optionale Felder: Stückzahl + Kaufpreis → echte Position
 * - Felder leer → Watchlist-Eintrag (watchlist = true, shares/buy_price = null)
 * - Auto-Berechnung: Stückzahl ↔ Gesamtwert via aktuellem Kurs (/api/stocks)
 * - Speichert Positionen in der holdings-Tabelle des eingeloggten Users
 * - "KI-Analyse starten" formatiert alle Positionen als reichhaltigen Text
 *   (inkl. Sektor, Beschreibung, Wettbewerber) und übergibt ihn an onAnalyze
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Plus, Trash2, Loader2, TrendingUp, BarChart3, BookMarked, Info,
  TrendingDown, RefreshCw, Pencil, MessageSquare, Camera, FileSpreadsheet,
  CheckCircle2, AlertCircle,
} from 'lucide-react';
import { getSupabaseBrowser } from '../lib/supabaseBrowser';
import type { TickerEntry } from '../lib/supabase-types';
import type { HoldingRow } from '../types';

interface PortfolioInputProps {
  onAnalyze: (portfolioText: string) => void;
  isLoading?: boolean;
  userAccount?: { id: string; name: string } | null;
  onSendToAssistant?: (text: string) => void;
  onHoldingsChange?: (holdings: HoldingRow[]) => void;
}

const PortfolioInput: React.FC<PortfolioInputProps> = ({ onAnalyze, isLoading, userAccount, onSendToAssistant, onHoldingsChange }) => {
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
  const [totalValue, setTotalValue]   = useState('');  // ≈ Gesamtwert (berechnet oder eingegeben)

  // Aktueller Kurs (live via /api/stocks)
  const [currentPrice, setCurrentPrice]     = useState<number | null>(null);
  const [isPriceFetching, setIsPriceFetching] = useState(false);

  // Depot-Liste
  const [holdings, setHoldings]           = useState<HoldingRow[]>([]);
  const [isLoadingHoldings, setIsLoadingH] = useState(true);
  const [isSaving, setIsSaving]           = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);

  // Bulk-Import (Screenshot / Excel)
  const [importState, setImportState] = useState<{ loading: boolean; message: string; error: string }>({
    loading: false, message: '', error: '',
  });

  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropRef      = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sb) { setAuthError(true); setIsLoadingH(false); return; }

    sb.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        // Echte Supabase-Session vorhanden
        setUserId(data.user.id);
      } else if (userAccount) {
        // Mock-User aus localStorage → Anonymous-Session erstellen, damit RLS greift
        const { data: anonData } = await sb.auth.signInAnonymously();
        if (anonData?.user) {
          setUserId(anonData.user.id);
        } else {
          setAuthError(true);
          setIsLoadingH(false);
        }
      } else {
        setAuthError(true);
        setIsLoadingH(false);
      }
    });
  }, [userAccount]);

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

    const newHoldings: HoldingRow[] = (data ?? []).map((row: any) => ({
      id:        row.id,
      ticker:    row.ticker_mapping as TickerEntry,
      shares:    row.shares,
      buy_price: row.buy_price,
      watchlist: row.watchlist,
    }));

    setHoldings(newHoldings);
    onHoldingsChange?.(newHoldings);
    setIsLoadingH(false);
  };

  // ── Aktuellen Kurs fetchen wenn Ticker ausgewählt ─────────────────────────
  useEffect(() => {
    if (!selected) {
      setCurrentPrice(null);
      return;
    }
    setIsPriceFetching(true);
    setCurrentPrice(null);

    fetch(`/api/stocks?symbol=${encodeURIComponent(selected.symbol)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setCurrentPrice(typeof d.price === 'number' && d.price > 0 ? d.price : null))
      .catch(() => setCurrentPrice(null))
      .finally(() => setIsPriceFetching(false));
  }, [selected]);

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
    setTotalValue('');
    searchTickers(v);
  };

  const handleSelect = (t: TickerEntry) => {
    setSelected(t);
    setQuery(`${t.company_name} (${t.symbol})`);
    setSuggestions([]);
    setShowDrop(false);
    // Kauffelder beim neuen Auswahl zurücksetzen
    setShares('');
    setBuyPrice('');
    setTotalValue('');
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

  // ── Bidirektionale Kalkulation ────────────────────────────────────────────

  /** Stückzahl geändert → Gesamtwert berechnen */
  const handleSharesChange = (val: string) => {
    setShares(val);
    const n = parseFloat(val.replace(',', '.'));
    if (!isNaN(n) && n > 0 && currentPrice) {
      setTotalValue((n * currentPrice).toFixed(2));
    } else if (!val.trim()) {
      setTotalValue('');
    }
  };

  /** Gesamtwert geändert → Stückzahl schätzen */
  const handleTotalValueChange = (val: string) => {
    setTotalValue(val);
    const n = parseFloat(val.replace(',', '.'));
    if (!isNaN(n) && n > 0 && currentPrice && currentPrice > 0) {
      setShares((n / currentPrice).toFixed(4).replace(/\.?0+$/, ''));
    } else if (!val.trim()) {
      setShares('');
    }
  };

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
      setTotalValue('');
      setCurrentPrice(null);
      setEditingId(null);
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
    if (editingId === id) {
      setEditingId(null);
      setSelected(null);
      setQuery('');
      setShares('');
      setBuyPrice('');
      setTotalValue('');
    }
  };

  // ── Bearbeiten ────────────────────────────────────────────────────────────
  const handleEdit = (h: HoldingRow) => {
    setEditingId(h.id);
    setSelected(h.ticker);
    setQuery(`${h.ticker.company_name} (${h.ticker.symbol})`);
    setShares(h.shares != null ? String(h.shares) : '');
    setBuyPrice(h.buy_price != null ? String(h.buy_price) : '');
    setTotalValue('');
    setSuggestions([]);
    setShowDrop(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Depot-Text für KI aufbereiten ─────────────────────────────────────────
  const buildDepotText = (): string => {
    if (holdings.length === 0) return '';
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

    return [
      'Depot-Analyse:',
      '',
      ...lines,
      '',
      'Bitte analysiere dieses Depot vollständig gemäß den Systemvorgaben.',
    ].join('\n');
  };

  const handleAnalyze = () => {
    if (holdings.length === 0) return;
    const text = buildDepotText();
    if (text) onAnalyze(text);
  };

  const handleSendToAssistant = () => {
    if (holdings.length === 0 || !onSendToAssistant) return;
    const text = buildDepotText();
    if (text) onSendToAssistant(text);
  };

  // ── Bild-Resize (Canvas, max. 1024 px) ───────────────────────────────────
  const resizeImage = (file: File): Promise<{ base64: string; mimeType: string }> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 1024;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else { width = Math.round((width * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { URL.revokeObjectURL(objectUrl); reject(new Error('Canvas nicht verfügbar')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(objectUrl);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Bild konnte nicht geladen werden')); };
      img.src = objectUrl;
    });

  // ── Bulk-Add: Ticker-Namen → Gemini → ticker_mapping → holdings ──────────
  const bulkAddTickers = async (names: string[]): Promise<number> => {
    if (!sb || !userId || names.length === 0) return 0;

    // Schritt 1: Gemini löst Namen auf und speichert sie in ticker_mapping (awaited)
    const resp = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'resolve_ticker', payload: { names }, userId }),
    });
    if (!resp.ok) throw new Error('Ticker-Auflösung fehlgeschlagen');
    const data = await resp.json();
    const resolved: Array<{ ticker: string }> = data.tickers ?? [];
    if (resolved.length === 0) return 0;

    // Schritt 2: IDs aus ticker_mapping holen
    const symbols = resolved.map((t) => t.ticker).filter(Boolean);
    const { data: mapped } = await sb
      .from('ticker_mapping')
      .select('id, symbol')
      .in('symbol', symbols);
    if (!mapped || mapped.length === 0) return 0;

    // Schritt 3: Als Watchlist-Einträge in holdings speichern
    const rows = (mapped as Array<{ id: string; symbol: string }>).map((t) => ({
      user_id: userId,
      ticker_id: t.id,
      watchlist: true,
      shares: null,
      buy_price: null,
    }));
    const { error } = await sb.from('holdings').upsert(rows, { onConflict: 'user_id,ticker_id' });
    if (error) throw new Error(error.message);

    await loadHoldings();
    return mapped.length;
  };

  // ── Screenshot-Import ────────────────────────────────────────────────────
  const handleImageImport = async (file: File) => {
    setImportState({ loading: true, message: '', error: '' });
    try {
      const { base64, mimeType } = await resizeImage(file);
      const resp = await fetch('/api/extract-from-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      if (!resp.ok) throw new Error('Bild-Analyse fehlgeschlagen');
      const { tickers } = await resp.json();
      if (!tickers || tickers.length === 0) {
        setImportState({ loading: false, message: '', error: 'Keine Ticker im Bild erkannt.' });
        return;
      }
      const count = await bulkAddTickers(tickers);
      setImportState({ loading: false, message: `${count} Ticker aus Screenshot importiert.`, error: '' });
    } catch (e: any) {
      setImportState({ loading: false, message: '', error: e?.message ?? 'Fehler beim Bild-Import.' });
    }
  };

  // ── Excel / CSV-Import ───────────────────────────────────────────────────
  const handleExcelImport = async (file: File) => {
    setImportState({ loading: true, message: '', error: '' });
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (rows.length === 0) {
        setImportState({ loading: false, message: '', error: 'Keine Daten in der Datei gefunden.' });
        return;
      }

      // Erkenne Spalte: Ticker, Symbol, Symbol/Ticker, ISIN, WKN
      const lowerHeaders = Object.keys(rows[0]).map((h) => h.trim().toLowerCase());
      const matchedLower = lowerHeaders.find(
        (h) => h === 'ticker' || h === 'symbol' || h === 'symbol/ticker' ||
               h === 'isin' || h === 'wkn' || h.includes('ticker') || h.includes('symbol'),
      );
      if (!matchedLower) {
        setImportState({ loading: false, message: '', error: 'Keine Spalte "Ticker", "Symbol" oder "ISIN" gefunden.' });
        return;
      }
      const origKey = Object.keys(rows[0]).find((k) => k.trim().toLowerCase() === matchedLower) ?? matchedLower;
      const values = rows.map((r: any) => String(r[origKey] ?? '').trim()).filter((v) => v.length >= 1);

      if (values.length === 0) {
        setImportState({ loading: false, message: '', error: 'Keine Werte in der Spalte gefunden.' });
        return;
      }

      const count = await bulkAddTickers(values);
      setImportState({ loading: false, message: `${count} Ticker aus Excel importiert.`, error: '' });
    } catch (e: any) {
      setImportState({ loading: false, message: '', error: e?.message ?? 'Fehler beim Excel-Import.' });
    }
  };

  // Hilfswert: ist die Eingabe nur Watchlist?
  const isWatchlistAdd = !shares.trim() || !buyPrice.trim();

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

        {/* ── Kaufdaten-Formular ─────────────────────────────────────────── */}
        {selected && (
          <div className="mt-3 bg-blue-50 border border-blue-100 rounded-[20px] p-4 space-y-4 animate-in fade-in duration-200">

            {/* Titel + aktueller Kurs */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest">
                  {selected.company_name}
                </span>
                <span className="text-[9px] text-blue-400 font-mono">({selected.symbol})</span>
              </div>

              {/* Kurs-Badge */}
              <div className="flex items-center gap-1.5">
                {isPriceFetching ? (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Kurs wird geladen…
                  </span>
                ) : currentPrice ? (
                  <span className="flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                    <TrendingUp className="w-3 h-3" />
                    Aktuell: {currentPrice.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                    <TrendingDown className="w-3 h-3" /> Kein Live-Kurs
                  </span>
                )}
              </div>
            </div>

            {/* Zeile 1: Stückzahl + Kaufpreis */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest">
                  Stückzahl <span className="font-medium normal-case text-blue-400">(optional)</span>
                </label>
                <input
                  type="number"
                  value={shares}
                  onChange={(e) => handleSharesChange(e.target.value)}
                  placeholder="z. B. 10"
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-[14px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                  min="0"
                  step="any"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest">
                  Kaufpreis/Stk, EUR <span className="font-medium normal-case text-blue-400">(optional)</span>
                </label>
                <input
                  type="number"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  placeholder="z. B. 130,00"
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-[14px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                  min="0"
                  step="any"
                />
              </div>
            </div>

            {/* Zeile 2: Gesamtwert (bidirektional mit Stückzahl) */}
            <div className="space-y-1">
              <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5">
                ≈ Gesamtwert, EUR
                <span className="font-medium normal-case text-blue-400">(optional)</span>
                {currentPrice && (
                  <span className="font-medium normal-case text-blue-300">
                    — Eingabe berechnet Stückzahl automatisch
                  </span>
                )}
              </label>
              <input
                type="number"
                value={totalValue}
                onChange={(e) => handleTotalValueChange(e.target.value)}
                placeholder={
                  currentPrice
                    ? `z. B. ${(10 * currentPrice).toFixed(0)} (= 10 Stk. × Kurs)`
                    : 'Kurs nicht verfügbar – Stückzahl direkt eingeben'
                }
                disabled={!currentPrice && !totalValue}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-[14px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                min="0"
                step="any"
              />
              {!currentPrice && (
                <p className="text-[9px] text-blue-400 font-medium">
                  Live-Kurs nicht verfügbar – Gesamtwert kann nicht automatisch berechnet werden.
                </p>
              )}
            </div>

            {/* Watchlist-Hinweis */}
            <p className="text-[9px] text-blue-500 font-medium flex items-center gap-1">
              <BookMarked className="w-3 h-3 shrink-0" />
              {isWatchlistAdd
                ? 'Felder leer → wird als Watchlist-Eintrag gespeichert (kein Bestand)'
                : 'Stückzahl & Kaufpreis → vollständige Portfolio-Position'}
            </p>

            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={isSaving}
                className="flex-1 bg-slate-900 text-white py-3 rounded-[14px] text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSaving
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Plus className="w-4 h-4" />}
                {editingId
                  ? 'Position aktualisieren'
                  : isWatchlistAdd ? 'Als Watchlist speichern' : 'Position ins Depot speichern'}
              </button>
              {editingId && (
                <button
                  onClick={() => { setEditingId(null); setSelected(null); setQuery(''); setShares(''); setBuyPrice(''); setTotalValue(''); }}
                  className="px-4 py-3 rounded-[14px] text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Abbrechen
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Schnell-Import (Screenshot / Excel) ──────────────────────── */}
      <div className="bg-slate-50 border border-slate-200 rounded-[24px] p-4 space-y-3">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">
          Schnell importieren
        </p>
        <div className="flex gap-3">
          {/* Screenshot-Button */}
          <button
            onClick={() => { setImportState({ loading: false, message: '', error: '' }); imageInputRef.current?.click(); }}
            disabled={importState.loading}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-purple-50 border border-purple-100 hover:bg-purple-100 rounded-[16px] text-[10px] font-black text-purple-700 uppercase tracking-widest transition-colors disabled:opacity-50"
          >
            <Camera className="w-4 h-4" />
            Screenshot
          </button>
          {/* Excel-Button */}
          <button
            onClick={() => { setImportState({ loading: false, message: '', error: '' }); excelInputRef.current?.click(); }}
            disabled={importState.loading}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 rounded-[16px] text-[10px] font-black text-emerald-700 uppercase tracking-widest transition-colors disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel / CSV
          </button>
        </div>

        {/* Status */}
        {importState.loading && (
          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Ticker werden erkannt und importiert…
          </div>
        )}
        {importState.message && !importState.loading && (
          <div className="flex items-center gap-2 text-[10px] text-emerald-700 font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {importState.message}
          </div>
        )}
        {importState.error && !importState.loading && (
          <div className="flex items-center gap-2 text-[10px] text-rose-600 font-bold">
            <AlertCircle className="w-3.5 h-3.5" />
            {importState.error}
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
                        {h.shares} Stk. · {h.buy_price?.toFixed(2)} €/Stk.
                      </span>
                    )}
                    {!h.watchlist && h.shares != null && h.buy_price != null && (
                      <span className="text-[10px] text-blue-500 font-bold">
                        = {(h.shares * h.buy_price).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € Einstand
                      </span>
                    )}
                    {h.ticker.sector && (
                      <span className="text-[9px] text-slate-400 font-medium">{h.ticker.sector}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(h)}
                    className={`p-2 rounded-xl transition-colors shrink-0 ${editingId === h.id ? 'bg-blue-100 text-blue-600' : 'hover:bg-blue-50 hover:text-blue-500 text-slate-300'}`}
                    title="Position bearbeiten"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(h.id)}
                    className="p-2 hover:bg-rose-50 hover:text-rose-500 text-slate-300 rounded-xl transition-colors shrink-0"
                    title="Position entfernen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Aktions-Buttons ───────────────────────────────────────────────── */}
      {holdings.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleAnalyze}
            disabled={isLoading}
            className="flex-1 bg-blue-600 text-white py-5 rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-3 hover:bg-slate-900 transition-all shadow-xl shadow-blue-600/20 disabled:opacity-50"
          >
            {isLoading
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : <BarChart3 className="w-5 h-5" />}
            KI-Analyse starten · {holdings.filter(h => !h.watchlist).length} Position
            {holdings.filter(h => !h.watchlist).length !== 1 ? 'en' : ''}
          </button>
          {onSendToAssistant && (
            <button
              onClick={handleSendToAssistant}
              disabled={isLoading}
              className="flex-1 sm:flex-none bg-slate-100 text-slate-700 py-5 px-6 rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-3 hover:bg-slate-200 transition-all disabled:opacity-50"
            >
              <MessageSquare className="w-5 h-5" />
              Mit Assistent besprechen
            </button>
          )}
        </div>
      )}

      {/* ── Versteckte File-Inputs ────────────────────────────────────────── */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageImport(f); e.target.value = ''; }}
      />
      <input
        ref={excelInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleExcelImport(f); e.target.value = ''; }}
      />
    </div>
  );
};

export default PortfolioInput;
