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
  CheckCircle2, AlertCircle, Zap,
} from 'lucide-react';
import { getSupabaseBrowser } from '../lib/supabaseBrowser';
import type { TickerEntry } from '../lib/supabase-types';
import type { HoldingRow } from '../types';
import { addHolding, addTickersByName, deleteHolding, addBrokerHoldings, type BrokerPosition } from '../services/holdingsService';

interface PortfolioInputProps {
  /** Holdings aus App.tsx – Single Source of Truth */
  holdings: HoldingRow[];
  onAnalyze: (portfolioText: string) => void;
  isLoading?: boolean;
  userAccount?: { id: string; name: string } | null;
  onSendToAssistant?: (text: string) => void;
  /** Globaler Refresh: App.tsx lädt Holdings neu und aktualisiert alle Views */
  onRefresh?: () => Promise<void>;
}

const PortfolioInput: React.FC<PortfolioInputProps> = ({ holdings, onAnalyze, isLoading, userAccount, onSendToAssistant, onRefresh }) => {
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

  // Depot-Liste (kommt als Prop von App.tsx)
  const [isSaving, setIsSaving]           = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Bulk-Import (Screenshot / Excel)
  const [importState, setImportState] = useState<{ loading: boolean; message: string; error: string }>({
    loading: false, message: '', error: '',
  });

  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropRef       = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const brokerInputRef = useRef<HTMLInputElement>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  // Wenn userAccount.id gesetzt ist, hat App.tsx bereits die Supabase-Session geprüft.
  // Wir vertrauen dieser ID direkt und setzen userId sofort.
  // Falls keine userAccount vorhanden: eigene Session prüfen.
  useEffect(() => {
    if (!sb) { setAuthError(true); setIsLoadingH(false); return; }

    if (userAccount?.id) {
      // App.tsx hat den User bereits authentifiziert – ID direkt übernehmen
      setUserId(userAccount.id);
      setAuthError(false);
      return;
    }

    // Kein userAccount: direkt Supabase-Session prüfen
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        setUserId(session.user.id);
        setAuthError(false);
      } else {
        setAuthError(true);
        setIsLoadingH(false);
      }
    });
  }, [userAccount?.id]);

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
    if (!selected) return;
    setIsSaving(true);
    setSaveError(null);

    // Aktuelle Session direkt abfragen für zuverlässige user_id
    let effectiveUserId = userId;
    if (sb) {
      const { data: sessionData } = await sb.auth.getSession();
      effectiveUserId = sessionData?.session?.user?.id ?? userId;
    }

    if (!effectiveUserId) {
      setSaveError('Bitte zuerst anmelden, um Positionen zu speichern.');
      setIsSaving(false);
      return;
    }
    if (effectiveUserId !== userId) setUserId(effectiveUserId);

    const sharesNum = shares.trim()   ? parseFloat(shares.replace(',', '.'))   : null;
    const priceNum  = buyPrice.trim() ? parseFloat(buyPrice.replace(',', '.')) : null;

    if (sharesNum !== null && (isNaN(sharesNum) || sharesNum <= 0)) {
      setSaveError('Stückzahl muss größer als 0 sein.');
      setIsSaving(false);
      return;
    }
    if (priceNum !== null && (isNaN(priceNum) || priceNum <= 0)) {
      setSaveError('Kaufpreis muss größer als 0 sein.');
      setIsSaving(false);
      return;
    }

    const result = await addHolding({
      userId:    effectiveUserId,
      symbol:    selected.symbol,
      shares:    sharesNum,
      buyPrice:  priceNum,
    });

    if (result.success) {
      setSaveError(null);
      setQuery('');
      setSelected(null);
      setShares('');
      setBuyPrice('');
      setTotalValue('');
      setCurrentPrice(null);
      setEditingId(null);
      // App.tsx lädt Holdings neu → Cockpit, EarningsCalendar, ScenarioAnalysis aktualisiert
      await onRefresh?.();
    } else {
      console.error('[PortfolioInput] addHolding error:', result.error);
      setSaveError(`Speichern fehlgeschlagen: ${result.error}`);
    }
    setIsSaving(false);
  };

  // ── Löschen ───────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    let uid = userId;
    if (sb) {
      const { data: sessionData } = await sb.auth.getSession();
      uid = sessionData?.session?.user?.id ?? userId;
    }
    if (!uid) {
      console.error('[PortfolioInput] Delete: keine gültige Session');
      return;
    }
    const result = await deleteHolding(id, uid);
    if (!result.success) {
      console.error('[PortfolioInput] Delete error:', result.error);
      return;
    }
    if (editingId === id) {
      setEditingId(null);
      setSelected(null);
      setQuery('');
      setShares('');
      setBuyPrice('');
      setTotalValue('');
    }
    // App.tsx lädt Holdings neu → alle Views aktualisiert
    await onRefresh?.();
  };

  // ── Bearbeiten ────────────────────────────────────────────────────────────
  const handleEdit = (h: HoldingRow) => {
    setEditingId(h.id);
    // Falls kein ticker_mapping-Eintrag vorhanden, minimales Objekt erstellen
    // damit handleAdd() nicht durch `if (!selected) return` blockiert wird
    const tickerOrStub = h.ticker ?? ({
      id: 0, symbol: h.symbol, company_name: h.symbol,
      sector: null, industry: null, description_static: null,
      pe_ratio_static: null, competitors: null,
      created_at: '', updated_at: '',
    } as TickerEntry);
    setSelected(tickerOrStub);
    setQuery(h.ticker ? `${h.ticker.company_name} (${h.ticker.symbol})` : h.symbol);
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
      const displayName = t?.company_name ?? h.symbol;
      const pos = h.watchlist
        ? 'Watchlist'
        : `${h.shares} Stück | Kaufpreis: ${h.buy_price?.toFixed(2)} €`;

      const meta = t ? [
        t.sector      ? `Sektor: ${t.sector}`           : null,
        t.industry    ? `Industrie: ${t.industry}`       : null,
        t.competitors ? `Wettbewerber: ${t.competitors}` : null,
        t.pe_ratio_static != null ? `KGV: ${t.pe_ratio_static}` : null,
      ].filter(Boolean).join(' | ') : '';

      const desc = t?.description_static
        ? `\n   Beschreibung: ${t.description_static}`
        : '';
      const notesLine = h.notes ? `\n   Investment-These: ${h.notes}` : '';

      return `${i + 1}. ${displayName} (${h.symbol}) | ${pos}${meta ? ` | ${meta}` : ''}${desc}${notesLine}`;
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
  // Nutzt den zentralen holdingsService für zuverlässige DB-Operationen
  const bulkAddTickers = async (names: string[]): Promise<number> => {
    if (names.length === 0) return 0;

    // Aktuelle Auth-Session direkt abfragen
    let effectiveUserId = userId;
    if (sb) {
      const { data: sessionData } = await sb.auth.getSession();
      effectiveUserId = sessionData?.session?.user?.id ?? userId;
    }
    if (!effectiveUserId) throw new Error('Nicht eingeloggt – bitte zuerst anmelden.');

    const { count, error } = await addTickersByName(names, effectiveUserId);
    if (error) throw new Error(error);

    // userId-State korrigieren falls nötig
    if (effectiveUserId !== userId) setUserId(effectiveUserId);

    // App.tsx lädt Holdings neu → alle Views aktualisiert
    await onRefresh?.();
    return count;
  };

  // ── Broker CSV-Import (Trade Republic, Scalable Capital, Comdirect) ─────
  /**
   * Erkennt, ob ein Tabellen-Datensatz ein Broker-Export mit vollständigen
   * Transaktionsdaten ist (Stückzahl + Kurs vorhanden).
   * Gibt die gruppierten Positionen zurück oder null wenn kein Broker-Format.
   */
  const parseBrokerData = (rows: any[]): BrokerPosition[] | null => {
    if (!rows.length) return null;
    const headers = Object.keys(rows[0]);
    const lower = headers.map((h) => h.toLowerCase().trim());

    // Spalten-Mapping: suche nach passenden Spaltennamen
    const findCol = (...candidates: string[]) =>
      headers.find((h) => candidates.includes(h.toLowerCase().trim()));

    const sharesCol = findCol('stückzahl', 'stck', 'anzahl', 'menge', 'stück', 'shares', 'qty');
    const priceCol  = findCol('kurs', 'preis', 'kurs (€)', 'kurs (eur)', 'preis (€)', 'preis (eur)',
                              'ausführungskurs', 'price', 'kurs in eur', 'preis in eur');
    const symbolCol = findCol('ticker', 'symbol', 'isin', 'wkn');
    const nameCol   = findCol('name', 'unternehmen', 'bezeichnung', 'wertpapier', 'description');
    const typeCol   = findCol('typ', 'art', 'transaktion', 'type', 'beschreibung', 'transaktionstyp');
    const dateCol   = findCol('datum', 'date', 'buchungstag', 'ausführungsdatum', 'handelsdatum');

    // Broker-Format: braucht mindestens symbol + shares + price
    if (!sharesCol || !priceCol || !symbolCol) return null;

    // Nur Kauf-Transaktionen (keine Dividenden, Gebühren, Verkäufe)
    const BUY_TYPES = ['kauf', 'buy', 'purchase', 'sparplan', 'savings plan', 'einzahlung', 'wertpapierkauf'];
    const SELL_TYPES = ['verkauf', 'sell', 'sale'];

    const buys = rows.filter((r) => {
      if (!typeCol) return true; // kein Typ-Spalte → alle nehmen
      const t = String(r[typeCol] ?? '').toLowerCase().trim();
      if (SELL_TYPES.some((s) => t.includes(s))) return false;
      if (!t || BUY_TYPES.some((b) => t.includes(b))) return true;
      return false; // unbekannter Typ → überspringen
    });

    if (!buys.length) return null;

    // Transaktionen aggregieren (gewichteter Durchschnitt pro Symbol)
    const bySymbol = new Map<string, { totalShares: number; totalCost: number; name?: string; date?: string }>();

    for (const row of buys) {
      const rawSym = String(row[symbolCol] ?? '').trim().replace(/\s/g, '');
      if (!rawSym || rawSym.length < 1) continue;

      const sharesRaw = String(row[sharesCol] ?? '').replace(',', '.').replace(/[^0-9.]/g, '');
      const priceRaw  = String(row[priceCol]  ?? '').replace(',', '.').replace(/[^0-9.]/g, '');
      const sharesNum = parseFloat(sharesRaw);
      const priceNum  = parseFloat(priceRaw);
      if (isNaN(sharesNum) || sharesNum <= 0 || isNaN(priceNum) || priceNum <= 0) continue;

      const existing = bySymbol.get(rawSym) ?? { totalShares: 0, totalCost: 0 };
      existing.totalShares += sharesNum;
      existing.totalCost   += sharesNum * priceNum;
      if (!existing.name && nameCol) existing.name = String(row[nameCol] ?? '').trim() || undefined;
      if (!existing.date && dateCol) {
        const rawDate = String(row[dateCol] ?? '').trim();
        if (rawDate) {
          // DD.MM.YYYY oder DD.MM.YY → ISO YYYY-MM-DD (Supabase DATE-Spalte)
          const parts = rawDate.split('.');
          if (parts.length === 3 && parts[0].length <= 2) {
            const [d, m, y] = parts;
            const year = y.length === 2 ? `20${y}` : y;
            existing.date = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          } else {
            existing.date = rawDate;
          }
        }
      }
      bySymbol.set(rawSym, existing);
    }

    if (!bySymbol.size) return null;

    return Array.from(bySymbol.entries()).map(([rawSymbol, agg]) => ({
      rawSymbol,
      name:     agg.name,
      shares:   Math.round(agg.totalShares * 100000) / 100000,
      avgPrice: Math.round((agg.totalCost / agg.totalShares) * 10000) / 10000,
      date:     agg.date,
    }));
  };

  const handleBrokerImport = async (file: File) => {
    setImportState({ loading: true, message: '', error: '' });
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) {
        setImportState({ loading: false, message: '', error: 'Keine Daten in der Datei gefunden.' });
        return;
      }

      const positions = parseBrokerData(rows);

      if (!positions) {
        // Kein Broker-Format → regulären Excel-Import versuchen
        await handleExcelImport(file);
        return;
      }

      let effectiveUserId = userId;
      if (sb) {
        const { data: sessionData } = await sb.auth.getSession();
        effectiveUserId = sessionData?.session?.user?.id ?? userId;
      }
      if (!effectiveUserId) throw new Error('Nicht eingeloggt – bitte zuerst anmelden.');

      const { count, skipped, error } = await addBrokerHoldings(positions, effectiveUserId);

      if (error) throw new Error(error);

      setImportState({
        loading: false,
        message: `${count} Position${count !== 1 ? 'en' : ''} importiert${skipped > 0 ? ` (${skipped} übersprungen)` : ''}.`,
        error: '',
      });

      if (effectiveUserId !== userId) setUserId(effectiveUserId);
      await onRefresh?.();
    } catch (e: any) {
      setImportState({ loading: false, message: '', error: e?.message ?? 'Fehler beim Broker-Import.' });
    }
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

          {/* Dropdown – DB-Ergebnisse */}
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

          {/* Dropdown – Nicht in DB: KI-Vorschlag */}
          {showDrop && !isFetching && suggestions.length === 0 && query.trim().length >= 2 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <button
                onClick={async () => {
                  const q = query.trim();
                  setShowDrop(false);
                  setImportState({ loading: true, message: '', error: '' });
                  try {
                    const count = await bulkAddTickers([q]);
                    setQuery('');
                    setImportState({
                      loading: false,
                      message: count > 0 ? `„${q}" wurde erkannt und ins Depot übernommen.` : `„${q}" konnte nicht aufgelöst werden.`,
                      error: '',
                    });
                  } catch (e: any) {
                    setImportState({ loading: false, message: '', error: e?.message ?? 'KI-Auflösung fehlgeschlagen.' });
                  }
                }}
                className="w-full flex items-center gap-3 px-3 py-3 hover:bg-blue-50 rounded-xl text-left transition-colors group"
              >
                <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="text-sm font-bold text-slate-700">„{query.trim()}" mit KI hinzufügen</span>
                  <p className="text-[9px] text-slate-400 font-medium mt-0.5">
                    Nicht in Datenbank – Gemini löst Ticker auf und speichert ihn
                  </p>
                </div>
              </button>
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

            {saveError && (
              <div className="flex items-center gap-2 text-[10px] text-rose-600 font-bold bg-rose-50 px-4 py-3 rounded-[14px] border border-rose-100">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {saveError}
              </div>
            )}

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

      {/* ── Schnell-Import (Screenshot / Excel / Broker) ─────────────────── */}
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
        {/* Broker-Import-Button */}
        <button
          onClick={() => { setImportState({ loading: false, message: '', error: '' }); brokerInputRef.current?.click(); }}
          disabled={importState.loading}
          className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 border border-blue-100 hover:bg-blue-100 rounded-[16px] text-[10px] font-black text-blue-700 uppercase tracking-widest transition-colors disabled:opacity-50"
        >
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            Broker-Transaktionshistorie importieren
          </div>
          <span className="text-[8px] font-black text-blue-400 normal-case tracking-normal">
            Trade Republic · Scalable · Comdirect
          </span>
        </button>

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

        {holdings.length === 0 ? (
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
                      {h.ticker?.company_name ?? h.symbol}
                    </span>
                    {h.watchlist && (
                      <span className="shrink-0 text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-widest">
                        Watchlist
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-slate-400 font-mono">{h.symbol}</span>
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
                    {h.ticker?.sector && (
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
      <input
        ref={brokerInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBrokerImport(f); e.target.value = ''; }}
      />
    </div>
  );
};

export default PortfolioInput;
