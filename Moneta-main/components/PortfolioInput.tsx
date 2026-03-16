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
  CheckCircle2, AlertCircle, Zap, FileText,
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

// ── Excel-Engine: Synonyme ────────────────────────────────────────────────────
const EXCEL_SYNONYMS = {
  symbol: [
    'ticker', 'symbol', 'isin', 'wkn', 'wertpapier', 'kürzel', 'aktie',
    'bezeichnung', 'name', 'security', 'asset', 'instrument', 'valor',
  ],
  shares: [
    'stückzahl', 'stück', 'stck', 'anzahl', 'menge', 'bestand',
    'qty', 'quantity', 'shares', 'units', 'number of shares', 'nominal',
  ],
  price: [
    'kurs', 'preis', 'kaufpreis', 'kaufkurs', 'einstandskurs', 'einstandspreis',
    'price', 'buy price', 'purchase price', 'avg price', 'average price',
    'kurs in eur', 'preis in eur',
  ],
  total: [
    'gesamtwert', 'gesamtbetrag', 'wert', 'marktwert',
    'total', 'total value', 'market value', 'betrag', 'position value',
  ],
} as const;

function normalizeCell(v: any): string {
  return String(v ?? '').toLowerCase().trim().replace(/[^a-zäöüß0-9\s]/g, '').trim();
}

function scoreHeaderRow(row: any[]): number {
  const cells = row.map(normalizeCell);
  return Object.values(EXCEL_SYNONYMS).filter((syns) =>
    cells.some((c) => syns.some((s) => c === s || c.includes(s) || s.includes(c)))
  ).length;
}

function fuzzyFindCol(headers: string[], syns: readonly string[]): number | undefined {
  let bestIdx: number | undefined;
  let bestScore = 0;
  headers.forEach((h, i) => {
    for (const s of syns) {
      const score = h === s ? 3 : h.includes(s) ? 2 : s.includes(h) && h.length > 2 ? 1 : 0;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
  });
  return bestScore > 0 ? bestIdx : undefined;
}

/** Parst europäische Zahlen: '1.200,50' → 1200.50, '1,200.50' → 1200.50 */
function parseEuNumber(val: any): number {
  if (typeof val === 'number' && isFinite(val)) return val;
  const s = String(val ?? '').trim().replace(/\s/g, '');
  if (!s) return 0;
  // Europäisches Format: Punkt = Tausendertrennzeichen, Komma = Dezimal
  if (/^-?[\d.]+,\d{1,4}$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  // US-Format: Komma = Tausender, Punkt = Dezimal
  if (/^-?[\d,]+\.\d{1,4}$/.test(s)) return parseFloat(s.replace(/,/g, '')) || 0;
  // Fallback
  return parseFloat(s.replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
}

// ─────────────────────────────────────────────────────────────────────────────

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

  // Command Dock Focus-State
  const [isFocused, setIsFocused] = useState(false);

  // Excel-Import: Anreicherungs-Modus
  const [enrichMode, setEnrichMode] = useState(false);

  // Bulk-Import (Screenshot / Excel)
  const [importState, setImportState] = useState<{ loading: boolean; message: string; error: string }>({
    loading: false, message: '', error: '',
  });

  /** Robust float conversion – handles German comma decimals and string values from Gemini. */
  const safeFloat = (v: any): number => {
    if (typeof v === 'number' && isFinite(v)) return v;
    return parseFloat(String(v ?? '').replace(',', '.')) || 0;
  };

  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropRef       = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const brokerInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef   = useRef<HTMLInputElement>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  // Wenn userAccount.id gesetzt ist, hat App.tsx bereits die Supabase-Session geprüft.
  // Wir vertrauen dieser ID direkt und setzen userId sofort.
  // Falls keine userAccount vorhanden: eigene Session prüfen.
  useEffect(() => {
    if (!sb) { setAuthError(true); return; }

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

  // ── Bild-Resize (Canvas, max. 1920 px für lesbare Broker-Screenshots) ──────
  const resizeImage = (file: File): Promise<{ base64: string; mimeType: string }> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 1920; // höher als vorher (1024) – Gemini braucht mehr Auflösung für kleine Schrift
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
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92); // höhere Qualität für OCR
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

  // ── Analyst-Level Excel Engine ───────────────────────────────────────────
  /**
   * Parst einen rohen 2D-Array (XLSX { header:1 }) mit drei Stufen:
   *  1. Smart Header Discovery – scannt bis zu 30 Zeilen nach der echten Kopfzeile
   *  2. Fuzzy Column Mapping   – erkennt Scalable/Finanzen.net Broker-Spaltennamen
   *  3. cleanNumeric           – konvertiert deutsche Formate inkl. Währungstexten
   *
   * Mappings (Supabase-Spalten):
   *   'Stück/Nominal', 'Stückzahl', 'Qty' … → shares
   *   'Einstandskurs inkl. NK', 'Kurs', 'Preis' … → buy_price (= avgPrice)
   */
  const parseExcelBrokerData = (rawRows: any[][]): BrokerPosition[] | null => {
    if (!rawRows.length) return null;

    // ── 1. Smart Header Discovery ──────────────────────────────────────────
    const HEADER_KEYWORDS = [
      'isin', 'wkn', 'name', 'bezeichnung', 'wertpapier',
      // shares-Spalte – inkl. Scalable 'Stück/Nominal'
      'stück', 'stückzahl', 'nominal', 'stck', 'anzahl', 'menge', 'shares', 'qty',
      // buy_price-Spalte – inkl. Scalable 'Einstandskurs inkl. NK'
      'einstandskurs', 'einstand', 'kurs', 'preis', 'price',
      'einstandswert', 'gesamtwert', 'marktwert',
      'ticker', 'symbol',
    ];

    let headerIdx = -1;
    let headers: string[] = [];
    const scanLimit = Math.min(30, rawRows.length);

    for (let i = 0; i < scanLimit; i++) {
      const rowLow = rawRows[i].map((c: any) => String(c ?? '').toLowerCase().trim());
      const hits = rowLow.filter((cell: string) =>
        HEADER_KEYWORDS.some((kw) => cell.includes(kw))
      );
      if (hits.length >= 2) {
        headerIdx = i;
        headers = rawRows[i].map((c: any) => String(c ?? '').trim());
        break;
      }
    }

    if (headerIdx === -1) return null;

    // ── 2. Fuzzy Column Mapping ────────────────────────────────────────────
    const headersLow = headers.map((h) => h.toLowerCase());

    /** Returns first column index whose header includes any of the candidate strings (most-specific first). */
    const fuzzyIdx = (...candidates: string[]): number => {
      for (const c of candidates) {
        const i = headersLow.findIndex((h) => h.includes(c));
        if (i !== -1) return i;
      }
      return -1;
    };

    const isinIdx   = fuzzyIdx('isin');
    const wknIdx    = fuzzyIdx('wkn');
    const nameIdx   = fuzzyIdx('name', 'bezeichnung', 'wertpapier', 'description');
    // 'Stück/Nominal' → fuzzyIdx hits 'stück' (substring match on '/')
    const sharesIdx = fuzzyIdx('stückzahl', 'stück/nominal', 'stück', 'nominal', 'stck', 'anzahl', 'menge', 'shares', 'qty');
    // 'Einstandskurs inkl. NK' → most-specific first; 'kurs' excluded when 'aktuell'/'gesamt' precede it
    const priceIdx  = fuzzyIdx('einstandskurs inkl', 'einstandskurs', 'einstand', 'kurs', 'preis', 'price');
    const totalIdx  = fuzzyIdx('gesamtwert', 'einstandswert', 'marktwert', 'total');
    const typeIdx   = fuzzyIdx('transaktionstyp', 'transaktion', 'typ', 'art', 'type');
    const dateIdx   = fuzzyIdx('datum', 'date', 'buchungstag', 'handelsdatum', 'ausführungsdatum');

    const symbolIdx = isinIdx !== -1 ? isinIdx : wknIdx;
    if (symbolIdx === -1 || sharesIdx === -1 || (priceIdx === -1 && totalIdx === -1)) return null;

    // ── 3. cleanNumeric ────────────────────────────────────────────────────
    /**
     * Robuste Zahl-Konvertierung für deutsche Broker-Exporte:
     *   'EUR 1.200,50' → 1200.50   (Präfix-Währungstext)
     *   '1.200,50 EUR' → 1200.50   (Suffix-Währungstext)
     *   '1.200,50'     → 1200.50   (Tausenderpunkt + Dezimalkomma)
     *   '89,34'        → 89.34     (reines Dezimalkomma)
     *   '89.34'        → 89.34     (Standard)
     *   '0,784621'     → 0.784621  (Bruchstücke)
     */
    const cleanNumeric = (v: any): number => {
      const s = String(v ?? '')
        .replace(/[€$£¥₹]/g, '')   // Währungssymbole
        .replace(/[A-Za-z]+/g, '')  // Währungscodes (EUR, USD, CHF …) und sonstige Buchstaben
        .replace(/\s/g, '')         // Leerzeichen
        .trim();
      if (!s) return 0;
      // Europäisches Format: '1.234,56' (Tausenderpunkt, Dezimalkomma)
      if (/\d\.\d{3}(,|$)/.test(s)) {
        return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
      }
      // Reines Dezimalkomma ohne Tausenderpunkt: '89,34' oder '0,784621'
      if (s.includes(',') && !s.includes('.')) {
        return parseFloat(s.replace(',', '.')) || 0;
      }
      return parseFloat(s.replace(/[^0-9.-]/g, '')) || 0;
    };

    const BUY_TYPES  = ['kauf', 'buy', 'purchase', 'sparplan', 'einzahlung', 'wertpapierkauf'];
    const SELL_TYPES = ['verkauf', 'sell', 'sale'];

    const dataRows = rawRows.slice(headerIdx + 1);
    const bySymbol = new Map<string, { totalShares: number; totalCost: number; name?: string; date?: string }>();

    for (const row of dataRows) {
      if (typeIdx !== -1) {
        const t = String(row[typeIdx] ?? '').toLowerCase().trim();
        if (SELL_TYPES.some((s) => t.includes(s))) continue;
        if (t && !BUY_TYPES.some((b) => t.includes(b))) continue;
      }

      const rawSym = String(row[symbolIdx] ?? '').trim().replace(/\s/g, '');
      if (!rawSym || rawSym.length < 4) continue;

      const shares = cleanNumeric(row[sharesIdx]);
      if (!shares || shares <= 0) continue;

      let price = priceIdx !== -1 ? cleanNumeric(row[priceIdx]) : 0;
      if (!price && totalIdx !== -1) {
        const total = cleanNumeric(row[totalIdx]);
        if (total > 0) price = total / shares;
      }
      if (!price || price <= 0) continue;

      const existing = bySymbol.get(rawSym) ?? { totalShares: 0, totalCost: 0 };
      existing.totalShares += shares;
      existing.totalCost   += shares * price;

      if (!existing.name && nameIdx !== -1) {
        const n = String(row[nameIdx] ?? '').trim();
        if (n) existing.name = n;
      }
      if (!existing.date && dateIdx !== -1) {
        const rawDate = String(row[dateIdx] ?? '').trim();
        if (rawDate) {
          const parts = rawDate.split('.');
          if (parts.length === 3 && parts[0].length <= 2) {
            const [d, m, y] = parts;
            existing.date = `${y.length === 2 ? `20${y}` : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
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
      shares:   Math.round(agg.totalShares * 1e5) / 1e5,
      avgPrice: Math.round((agg.totalCost / agg.totalShares) * 1e4) / 1e4,
      date:     agg.date,
    }));
  };

  const handleBrokerImport = async (file: File) => {
    setImportState({ loading: true, message: '', error: '' });
    try {
      // CSV-Dateien direkt an die KI senden – robuster als starrer Spalten-Parser
      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);
        let resp: Response;
        try {
          resp = await fetch('/api/extract-from-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: text, mimeType: 'text/csv' }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }
        if (!resp.ok) throw new Error('CSV-Analyse fehlgeschlagen');
        const { positions } = await resp.json();
        console.log('KI Ergebnis:', positions);

        if (!positions || positions.length === 0) {
          setImportState({ loading: false, message: '', error: 'Keine Positionen in der CSV erkannt. Bitte stelle sicher, dass die Datei ein Broker-Export mit Stückzahl und Kurs ist.' });
          return;
        }

        const brokerPositions: BrokerPosition[] = positions
          .map((p: any) => ({
            rawSymbol: (p.symbol || p.isin || '').trim(),
            name:      p.name,
            shares:    safeFloat(p.quantity ?? p.shares),
            avgPrice:  safeFloat(p.averagePrice ?? p.price),
          }))
          .filter((bp: any) => bp.rawSymbol && bp.shares > 0);

        if (brokerPositions.length === 0) {
          setImportState({ loading: false, message: '', error: 'Keine gültigen Positionen in der CSV gefunden.' });
          return;
        }

        let effectiveUserId = userId;
        if (sb) {
          const { data: sessionData } = await sb.auth.getSession();
          effectiveUserId = sessionData?.session?.user?.id ?? userId;
        }
        if (!effectiveUserId) throw new Error('Nicht eingeloggt – bitte zuerst anmelden.');

        const { count, skipped, error } = await addBrokerHoldings(brokerPositions, effectiveUserId);
        if (error) throw new Error(error);

        if (effectiveUserId !== userId) setUserId(effectiveUserId);
        await onRefresh?.();
        setImportState({
          loading: false,
          message: `${count} Position${count !== 1 ? 'en' : ''} aus CSV importiert${skipped > 0 ? ` (${skipped} übersprungen)` : ''}.`,
          error: '',
        });
        return;
      }

      // Nicht-CSV (Excel): XLSX-Parser + parseExcelBrokerData
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // header:1 → raw 2D array so we can discover the actual header row ourselves
      const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (!rawRows.length) {
        setImportState({ loading: false, message: '', error: 'Keine Daten in der Datei gefunden.' });
        return;
      }

      const positions = parseExcelBrokerData(rawRows);

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
    setImportState({ loading: true, message: 'Screenshot wird analysiert …', error: '' });
    try {
      const { base64, mimeType } = await resizeImage(file);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60_000);
      let resp: Response;
      try {
        resp = await fetch('/api/extract-from-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mimeType }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!resp.ok) throw new Error('Bild-Analyse fehlgeschlagen');
      const { positions } = await resp.json();

      if (!positions || positions.length === 0) {
        setImportState({ loading: false, message: '', error: 'Keine Aktien erkannt. Bitte stelle sicher, dass der Screenshot gut lesbar ist und Aktien-/ETF-Positionen enthält.' });
        return;
      }

      // Positionen mit Stückzahl + Kurs → direkt als vollständige Depot-Positionen
      const fullPositions: BrokerPosition[] = positions
        .filter((p: any) => safeFloat(p.shares) > 0 && safeFloat(p.price) > 0)
        .map((p: any) => ({
          rawSymbol: (p.symbol || p.isin || p.name || '').trim(),
          name:      p.name,
          shares:    safeFloat(p.shares),
          avgPrice:  safeFloat(p.price),
        }))
        .filter((bp: BrokerPosition) => bp.rawSymbol);

      // Positionen ohne Finanzdaten → Watchlist
      const watchlistSymbols: string[] = positions
        .filter((p: any) => !(safeFloat(p.shares) > 0 && safeFloat(p.price) > 0))
        .map((p: any) => (p.symbol || p.isin || p.name || '').trim())
        .filter(Boolean);

      let effectiveUserId = userId;
      if (sb) {
        const { data: sessionData } = await sb.auth.getSession();
        effectiveUserId = sessionData?.session?.user?.id ?? userId;
      }
      if (!effectiveUserId) throw new Error('Nicht eingeloggt – bitte zuerst anmelden.');

      const parts: string[] = [];

      if (fullPositions.length > 0) {
        const { count, skipped, error } = await addBrokerHoldings(fullPositions, effectiveUserId);
        if (error) throw new Error(error);
        parts.push(`${count} Position${count !== 1 ? 'en' : ''} mit Einstandskurs importiert${skipped > 0 ? ` (${skipped} übersprungen)` : ''}`);
      }

      if (watchlistSymbols.length > 0) {
        const count = await bulkAddTickers(watchlistSymbols);
        parts.push(`${count} Ticker als Watchlist hinzugefügt`);
      } else {
        await onRefresh?.();
      }

      if (effectiveUserId !== userId) setUserId(effectiveUserId);
      setImportState({
        loading: false,
        message: parts.length > 0 ? parts.join(' · ') + '.' : 'Import abgeschlossen.',
        error: '',
      });
    } catch (e: any) {
      setImportState({ loading: false, message: '', error: e?.message ?? 'Fehler beim Bild-Import.' });
    }
  };

  // ── PDF Broker-Import ────────────────────────────────────────────────────
  const handlePdfImport = async (file: File) => {
    setImportState({ loading: true, message: '', error: '' });
    try {
      // Read PDF as base64 via FileReader (safer than manual btoa loop for binary data)
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);
      let resp: Response;
      try {
        resp = await fetch('/api/extract-from-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mimeType: 'application/pdf' }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!resp.ok) throw new Error('PDF-Analyse fehlgeschlagen');
      const { positions } = await resp.json();
      console.log('KI Ergebnis:', positions);

      if (!positions || positions.length === 0) {
        setImportState({
          loading: false, message: '',
          error: 'Keine Aktien erkannt. Bitte stelle sicher, dass das PDF ein Broker-Kontoauszug mit Wertpapierpositionen ist.',
        });
        return;
      }

      // Convert to BrokerPosition format (API returns: symbol, isin, shares, price, name)
      const brokerPositions = positions
        .map((p: any) => ({
          rawSymbol: (p.symbol || p.isin || '').trim(),
          name:      p.name,
          shares:    safeFloat(p.quantity ?? p.shares),
          avgPrice:  safeFloat(p.averagePrice ?? p.price),
        }))
        .filter((bp: any) => bp.rawSymbol && bp.shares > 0);

      let effectiveUserId = userId;
      if (sb) {
        const { data: sessionData } = await sb.auth.getSession();
        effectiveUserId = sessionData?.session?.user?.id ?? userId;
      }
      if (!effectiveUserId) throw new Error('Nicht eingeloggt – bitte zuerst anmelden.');

      const { count, skipped, error } = await addBrokerHoldings(brokerPositions, effectiveUserId);
      if (error) throw new Error(error);

      setImportState({
        loading: false,
        message: `${count} Position${count !== 1 ? 'en' : ''} aus PDF importiert${skipped > 0 ? ` (${skipped} übersprungen)` : ''}.`,
        error: '',
      });
      if (effectiveUserId !== userId) setUserId(effectiveUserId);
      await onRefresh?.();
    } catch (e: any) {
      setImportState({ loading: false, message: '', error: e?.message ?? 'Fehler beim PDF-Import.' });
    }
  };

  // ── Excel / CSV-Import (KI + regelbasierter Fallback) ───────────────────
  const handleExcelImport = async (file: File) => {
    setImportState({ loading: true, message: 'Datei wird analysiert …', error: '' });
    try {
      const XLSX = await import('xlsx');

      // ── 1. Datei einlesen (Excel + CSV) ────────────────────────────────
      let wb: ReturnType<typeof XLSX.read>;
      let csvText: string;

      if (file.name.toLowerCase().endsWith('.csv')) {
        csvText = await file.text();
        const firstLine = csvText.split('\n')[0] ?? '';
        const delim = (firstLine.match(/;/g) ?? []).length >= (firstLine.match(/,/g) ?? []).length ? ';' : ',';
        wb = XLSX.read(csvText, { type: 'string', FS: delim });
      } else {
        const buf = await file.arrayBuffer();
        wb = XLSX.read(buf, { type: 'array' });
        const ws0 = wb.Sheets[wb.SheetNames[0]];
        csvText = XLSX.utils.sheet_to_csv(ws0, { FS: ';' });
      }

      const ws = wb.Sheets[wb.SheetNames[0]];
      const allRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (allRows.length === 0) {
        setImportState({ loading: false, message: '', error: 'Keine Daten in der Datei gefunden.' });
        return;
      }

      // ── 2. KI-Analyse (primärer Weg) ────────────────────────────────────
      let aiPositions: any[] = [];
      try {
        const MAX_CHARS = 30_000;
        const payload = csvText.length > MAX_CHARS ? csvText.slice(0, MAX_CHARS) : csvText;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45_000);
        let resp: Response;
        try {
          resp = await fetch('/api/extract-from-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: payload, mimeType: 'text/csv' }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }
        if (resp.ok) {
          const data = await resp.json();
          aiPositions = Array.isArray(data.positions) ? data.positions : [];
        }
      } catch {
        // KI nicht erreichbar → Fallback
      }

      // ── 3. Regelbasierter Fallback wenn KI nichts liefert ───────────────
      if (aiPositions.length === 0) {
        const SCAN_LIMIT = Math.min(30, allRows.length);
        let headerIdx = 0, bestScore = 0;
        for (let i = 0; i < SCAN_LIMIT; i++) {
          const s = scoreHeaderRow(allRows[i]);
          if (s > bestScore) { bestScore = s; headerIdx = i; }
        }

        const headers = allRows[headerIdx].map(normalizeCell);
        const dataRows = allRows
          .slice(headerIdx + 1)
          .filter((r) => r.some((c) => String(c).trim() !== ''));

        let symbolColIdx = fuzzyFindCol(headers, EXCEL_SYNONYMS.symbol);
        const sharesColIdx = fuzzyFindCol(headers, EXCEL_SYNONYMS.shares);
        const priceColIdx  = fuzzyFindCol(headers, EXCEL_SYNONYMS.price);

        // ── Letzter Ausweg: erste Spalte mit Text-Inhalten = Namen/Symbole ──
        if (symbolColIdx === undefined && dataRows.length > 0) {
          for (let c = 0; c < (allRows[headerIdx]?.length ?? 0); c++) {
            const hasText = dataRows.some((r) => {
              const v = String(r[c] ?? '').trim();
              return v.length > 0 && isNaN(Number(v.replace(',', '.')));
            });
            if (hasText) { symbolColIdx = c; break; }
          }
        }

        if (symbolColIdx !== undefined && dataRows.length > 0) {
          if (sharesColIdx !== undefined && priceColIdx !== undefined) {
            // Vollständige Positionen
            const positions: BrokerPosition[] = dataRows
              .map((r) => {
                const sym = String(r[symbolColIdx!] ?? '').trim().replace(/\s/g, '');
                const sh  = parseEuNumber(r[sharesColIdx]);
                const pr  = parseEuNumber(r[priceColIdx]);
                if (!sym || sh <= 0 || pr <= 0) return null;
                return { rawSymbol: sym, shares: sh, avgPrice: pr } as BrokerPosition;
              })
              .filter((p): p is BrokerPosition => p !== null);

            if (positions.length > 0) {
              let effectiveUserId = userId;
              if (sb) {
                const { data: sessionData } = await sb.auth.getSession();
                effectiveUserId = sessionData?.session?.user?.id ?? userId;
              }
              if (!effectiveUserId) throw new Error('Nicht eingeloggt – bitte zuerst anmelden.');
              const { count, skipped, error } = await addBrokerHoldings(positions, effectiveUserId, enrichMode);
              if (error) throw new Error(error);
              if (effectiveUserId !== userId) setUserId(effectiveUserId);
              await onRefresh?.();
              setImportState({
                loading: false,
                message: enrichMode
                  ? `${count} Position${count !== 1 ? 'en' : ''} angereichert${skipped > 0 ? ` · ${skipped} übersprungen` : ''}.`
                  : `${count} Position${count !== 1 ? 'en' : ''} importiert${skipped > 0 ? ` (${skipped} übersprungen)` : ''}.`,
                error: '',
              });
              return;
            }
          }

          // Nur Symbole/Namen → Watchlist
          const values = dataRows
            .map((r) => String(r[symbolColIdx!] ?? '').trim())
            .filter((v) => v.length >= 1);

          if (values.length > 0) {
            const count = await bulkAddTickers(values);
            setImportState({ loading: false, message: `${count} Ticker aus Datei importiert.`, error: '' });
            return;
          }
        }

        // Wirklich gar nichts erkennbar
        setImportState({
          loading: false, message: '',
          error: 'Die Datei konnte nicht verarbeitet werden. Bitte prüfe ob die Datei Wertpapierdaten enthält.',
        });
        return;
      }

      // ── 4. KI-Ergebnis verarbeiten → Supabase ───────────────────────────
      const fullPositions: BrokerPosition[] = aiPositions
        .filter((p: any) => safeFloat(p.shares) > 0 && safeFloat(p.price) > 0)
        .map((p: any) => ({
          rawSymbol: (p.symbol || p.isin || p.name || '').trim(),
          name:      p.name,
          shares:    safeFloat(p.shares),
          avgPrice:  safeFloat(p.price),
          date:      p.buy_date || undefined,
        }))
        .filter((bp: BrokerPosition) => bp.rawSymbol);

      const watchlistSymbols: string[] = aiPositions
        .filter((p: any) => !(safeFloat(p.shares) > 0 && safeFloat(p.price) > 0))
        .map((p: any) => (p.symbol || p.isin || p.name || '').trim())
        .filter(Boolean);

      let effectiveUserId = userId;
      if (sb) {
        const { data: sessionData } = await sb.auth.getSession();
        effectiveUserId = sessionData?.session?.user?.id ?? userId;
      }
      if (!effectiveUserId) throw new Error('Nicht eingeloggt – bitte zuerst anmelden.');

      const parts: string[] = [];

      if (fullPositions.length > 0) {
        const { count, skipped, error } = await addBrokerHoldings(fullPositions, effectiveUserId, enrichMode);
        if (error) throw new Error(error);
        parts.push(
          enrichMode
            ? `${count} Position${count !== 1 ? 'en' : ''} angereichert${skipped > 0 ? ` · ${skipped} übersprungen` : ''}`
            : `${count} Position${count !== 1 ? 'en' : ''} importiert${skipped > 0 ? ` (${skipped} übersprungen)` : ''}`,
        );
      }

      if (watchlistSymbols.length > 0) {
        const count = await bulkAddTickers(watchlistSymbols);
        parts.push(`${count} Ticker als Watchlist hinzugefügt`);
      } else {
        await onRefresh?.();
      }

      if (effectiveUserId !== userId) setUserId(effectiveUserId);
      setImportState({
        loading: false,
        message: parts.length > 0 ? parts.join(' · ') + '.' : 'Import abgeschlossen.',
        error: '',
      });
    } catch (e: any) {
      setImportState({ loading: false, message: '', error: e?.message ?? 'Fehler beim Datei-Import.' });
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

      {/* ── Command Dock (sticky) ────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 -mx-0 pt-3 pb-2 bg-white/95 backdrop-blur-md">
      <div className="relative" ref={dropRef}>
        <div className={`bg-white border rounded-[24px] p-4 shadow-sm transition-all duration-300 ${
          isFocused
            ? 'border-blue-300 shadow-blue-500/15 shadow-xl ring-2 ring-blue-500/20'
            : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
        }`}>
          <div className="flex items-center gap-3">
            <Search className={`w-5 h-5 shrink-0 transition-colors duration-200 ${isFocused ? 'text-blue-500' : 'text-slate-400'}`} />
            <input
              type="text"
              value={query}
              onChange={handleQueryChange}
              onFocus={() => { setIsFocused(true); suggestions.length > 0 && setShowDrop(true); }}
              onBlur={() => setIsFocused(false)}
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
          {showDrop && !isFetching && suggestions.length === 0 && query.trim().length >= 2 && (() => {
            const q = query.trim();
            const isWkn = /^[A-Z0-9]{6}$/i.test(q);
            return (
              <div className="mt-3 border-t border-slate-100 pt-3">
                {isWkn && (
                  <p className="text-[9px] text-amber-600 font-bold px-3 pb-2">
                    WKN erkannt – wird über Gemini zum Ticker aufgelöst
                  </p>
                )}
                <button
                  onClick={async () => {
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
                    <span className="text-sm font-bold text-slate-700">
                      {isWkn ? `WKN ${q} auflösen & hinzufügen` : `„${q}" mit KI hinzufügen`}
                    </span>
                    <p className="text-[9px] text-slate-400 font-medium mt-0.5">
                      {isWkn
                        ? 'WKN → Yahoo Finance Ticker via Gemini'
                        : 'Nicht in Datenbank – Gemini löst Ticker auf und speichert ihn'}
                    </p>
                  </div>
                </button>
              </div>
            );
          })()}
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
      </div>{/* end sticky Command Dock */}

      {/* ── Schnell-Import (Screenshot / PDF / Excel / Broker) ──────────── */}
      <div className="bg-slate-50 border border-slate-200 rounded-[24px] p-4 space-y-3">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">
          Schnell importieren
        </p>

        {/* Row 1: Screenshot + Excel/CSV */}
        <div className="flex gap-3">
          <button
            onClick={() => { setImportState({ loading: false, message: '', error: '' }); imageInputRef.current?.click(); }}
            disabled={importState.loading}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-purple-50 border border-purple-100 hover:bg-purple-100 rounded-[16px] text-[10px] font-black text-purple-700 uppercase tracking-widest transition-colors disabled:opacity-50 min-h-[44px]"
          >
            <Camera className="w-4 h-4" />
            Screenshot
          </button>
          <button
            onClick={() => { setImportState({ loading: false, message: '', error: '' }); excelInputRef.current?.click(); }}
            disabled={importState.loading}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 rounded-[16px] text-[10px] font-black text-emerald-700 uppercase tracking-widest transition-colors disabled:opacity-50 min-h-[44px]"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel / CSV
          </button>
        </div>

        {/* Enrich-Mode Toggle */}
        <button
          type="button"
          onClick={() => setEnrichMode((v) => !v)}
          className={`w-full flex items-center justify-between px-4 py-2.5 rounded-[14px] border transition-colors text-[10px] font-bold ${
            enrichMode
              ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
              : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
          }`}
        >
          <span className="flex items-center gap-2">
            <Zap className={`w-3.5 h-3.5 ${enrichMode ? 'text-emerald-500' : 'text-slate-400'}`} />
            Nur fehlende Daten ergänzen
          </span>
          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
            enrichMode ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
          }`}>
            {enrichMode ? 'AN' : 'AUS'}
          </span>
        </button>
        {enrichMode && (
          <p className="text-[9px] text-emerald-600 font-medium px-1">
            Aktien, die bereits Stückzahl + Kurs haben, werden übersprungen. Nur Watchlist-Einträge und unvollständige Positionen werden angereichert.
          </p>
        )}

        {/* Row 2: PDF Broker statement */}
        <button
          onClick={() => { setImportState({ loading: false, message: '', error: '' }); pdfInputRef.current?.click(); }}
          disabled={importState.loading}
          className="w-full flex items-center justify-between px-4 py-3 bg-rose-50 border border-rose-100 hover:bg-rose-100 rounded-[16px] text-[10px] font-black text-rose-700 uppercase tracking-widest transition-colors disabled:opacity-50 min-h-[44px]"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            PDF Broker-Depot importieren
          </div>
          <span className="text-[8px] font-black text-rose-400 normal-case tracking-normal">
            Trade Republic · Scalable · Comdirect
          </span>
        </button>

        {/* Row 3: Broker transaction CSV/Excel */}
        <button
          onClick={() => { setImportState({ loading: false, message: '', error: '' }); brokerInputRef.current?.click(); }}
          disabled={importState.loading}
          className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 border border-blue-100 hover:bg-blue-100 rounded-[16px] text-[10px] font-black text-blue-700 uppercase tracking-widest transition-colors disabled:opacity-50 min-h-[44px]"
        >
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            Transaktionshistorie importieren
          </div>
          <span className="text-[8px] font-black text-blue-400 normal-case tracking-normal">
            CSV / Excel Export
          </span>
        </button>

        {/* Status */}
        {importState.loading && (
          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            KI analysiert Dokument (ISINs & Bruchstücke werden verarbeitet)...
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
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdfImport(f); e.target.value = ''; }}
      />
    </div>
  );
};

export default PortfolioInput;
