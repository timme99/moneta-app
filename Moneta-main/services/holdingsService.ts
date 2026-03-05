/**
 * holdingsService.ts
 *
 * Zentraler Service für alle Depot-Operationen mit Supabase.
 *
 * Schema der holdings-Tabelle:
 *   id UUID, user_id UUID, symbol TEXT, shares NUMERIC, buy_price NUMERIC,
 *   buy_date DATE, notes TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
 *   UNIQUE (user_id, symbol)
 *
 * Watchlist-Einträge: shares = null und buy_price = null
 * Echte Positionen:   shares > 0 und buy_price > 0
 */

import { getSupabaseBrowser } from '../lib/supabaseBrowser';
import type { HoldingRow } from '../types';
import type { TickerEntry } from '../lib/supabase-types';

// ── Holdings laden ────────────────────────────────────────────────────────────

/**
 * Lädt alle Holdings eines Users aus Supabase.
 * Führt anschließend einen Lookup in ticker_mapping (per symbol) durch,
 * um Metadaten (Firmenname, Sektor, …) zu ergänzen.
 */
export async function loadUserHoldings(userId: string): Promise<HoldingRow[]> {
  const sb = getSupabaseBrowser();
  if (!sb || !userId) return [];

  // Schritt 1: Holdings laden
  const { data: holdingsData, error } = await sb
    .from('holdings')
    .select('id, symbol, shares, buy_price, buy_date, notes')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[holdingsService] loadUserHoldings error:', error.message);
    return [];
  }
  if (!holdingsData || holdingsData.length === 0) return [];

  // Schritt 2: Ticker-Metadaten für alle Symbole laden
  const symbols = (holdingsData as any[]).map((h) => h.symbol as string);
  const { data: tickerData } = await sb
    .from('ticker_mapping')
    .select('*')
    .in('symbol', symbols);

  const tickerMap = new Map<string, TickerEntry>();
  (tickerData ?? []).forEach((t: any) => tickerMap.set(t.symbol, t as TickerEntry));

  // Schritt 3: Daten zusammenführen
  return (holdingsData as any[]).map((row) => ({
    id:        row.id as string,
    symbol:    row.symbol as string,
    ticker:    tickerMap.get(row.symbol) ?? null,
    shares:    row.shares as number | null,
    buy_price: row.buy_price as number | null,
    buy_date:  row.buy_date as string | null,
    notes:     row.notes as string | null,
    watchlist: row.shares == null || row.buy_price == null,
  }));
}

// ── Einzelne Holding speichern ────────────────────────────────────────────────

export interface AddHoldingOptions {
  userId:   string;
  symbol:   string;
  shares?:  number | null;
  buyPrice?: number | null;
  buyDate?: string | null;
  notes?:   string | null;
}

export interface AddHoldingResult {
  success: boolean;
  error?: string;
}

/**
 * Speichert oder aktualisiert eine Holding in Supabase (upsert auf user_id + symbol).
 */
export async function addHolding(opts: AddHoldingOptions): Promise<AddHoldingResult> {
  const sb = getSupabaseBrowser();
  if (!sb)         return { success: false, error: 'Supabase nicht konfiguriert.' };
  if (!opts.userId) return { success: false, error: 'Kein User eingeloggt.' };
  if (!opts.symbol) return { success: false, error: 'Kein Ticker-Symbol angegeben.' };

  const { error } = await sb.from('holdings').upsert(
    {
      user_id:   opts.userId,
      symbol:    opts.symbol.trim().toUpperCase(),
      shares:    opts.shares   ?? null,
      buy_price: opts.buyPrice ?? null,
      buy_date:  opts.buyDate  ?? null,
      notes:     opts.notes    ?? null,
    },
    { onConflict: 'user_id,symbol' }
  );

  if (error) {
    console.error('[holdingsService] addHolding error:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

// ── Bulk-Add: Namen → Gemini → ticker_mapping → holdings ────────────────────

/**
 * Löst eine Liste von Ticker-Namen/Symbolen über Gemini auf,
 * speichert sie in ticker_mapping (via Server-API) und legt
 * Watchlist-Einträge in holdings an.
 *
 * Gibt die Anzahl der erfolgreich hinzugefügten Holdings zurück.
 */
export async function addTickersByName(
  names: string[],
  userId: string
): Promise<{ count: number; error?: string }> {
  if (names.length === 0) return { count: 0 };

  const sb = getSupabaseBrowser();
  if (!sb)     return { count: 0, error: 'Supabase nicht konfiguriert.' };
  if (!userId) return { count: 0, error: 'Nicht eingeloggt – bitte zuerst anmelden.' };

  // Schritt 1: Gemini löst Namen → Symbole auf und schreibt in ticker_mapping (server-seitig)
  let resolved: Array<{ ticker: string }> = [];
  try {
    const resp = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type:    'resolve_ticker',
        payload: { names },
        userId,
      }),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      return { count: 0, error: body.error ?? 'Ticker-Auflösung fehlgeschlagen.' };
    }
    const data = await resp.json();
    resolved = data.tickers ?? [];
  } catch (e: any) {
    return { count: 0, error: e?.message ?? 'Netzwerkfehler bei Ticker-Auflösung.' };
  }

  if (resolved.length === 0) return { count: 0 };

  // Schritt 2: Gültige Börsensymbole filtern (kein Leerzeichen = kein Firmenname)
  const symbols = resolved
    .map((t) => t.ticker?.trim().toUpperCase())
    .filter((s): s is string => !!s && !s.includes(' '));

  if (symbols.length === 0) return { count: 0 };

  // Schritt 3: Direkt als Watchlist-Einträge in holdings speichern
  // (kein ticker_id-Lookup mehr nötig – symbol wird direkt gespeichert)
  const rows = symbols.map((symbol) => ({
    user_id:   userId,
    symbol,
    shares:    null,
    buy_price: null,
  }));

  const { error: insertErr } = await sb
    .from('holdings')
    .upsert(rows, { onConflict: 'user_id,symbol' });

  if (insertErr) {
    console.error('[holdingsService] holdings upsert error:', insertErr.message);
    return { count: 0, error: insertErr.message };
  }

  return { count: symbols.length };
}

// ── Holding löschen ───────────────────────────────────────────────────────────

export async function deleteHolding(holdingId: string, userId: string): Promise<AddHoldingResult> {
  const sb = getSupabaseBrowser();
  if (!sb) return { success: false, error: 'Supabase nicht konfiguriert.' };

  const { error } = await sb
    .from('holdings')
    .delete()
    .eq('id', holdingId)
    .eq('user_id', userId);

  if (error) {
    console.error('[holdingsService] deleteHolding error:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}
