/**
 * holdingsService.ts
 *
 * Zentraler Service für alle Depot-Operationen mit Supabase.
 * Kapselt das Lesen und Schreiben von Holdings und Ticker-Mapping,
 * damit App.tsx und PortfolioInput.tsx dieselbe Logik nutzen.
 */

import { getSupabaseBrowser } from '../lib/supabaseBrowser';
import type { HoldingRow } from '../types';
import type { TickerEntry } from '../lib/supabase-types';

// ── Holdings laden ────────────────────────────────────────────────────────────

/**
 * Lädt alle Holdings eines Users aus Supabase und gibt sie als HoldingRow-Array zurück.
 * Gibt ein leeres Array zurück wenn kein Client oder kein User vorhanden.
 */
export async function loadUserHoldings(userId: string): Promise<HoldingRow[]> {
  const sb = getSupabaseBrowser();
  if (!sb || !userId) return [];

  const { data, error } = await sb
    .from('holdings')
    .select('id, shares, buy_price, watchlist, ticker_mapping(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[holdingsService] loadUserHoldings error:', error.message);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id:        row.id,
    ticker:    row.ticker_mapping as TickerEntry,
    shares:    row.shares,
    buy_price: row.buy_price,
    watchlist: row.watchlist,
  }));
}

// ── Ticker via Gemini + Supabase auflösen und als Holding speichern ───────────

export interface AddHoldingOptions {
  /** User-ID des eingeloggten Users */
  userId: string;
  /** ID des Eintrags in ticker_mapping */
  tickerId: number;
  /** Stückzahl (null = Watchlist-Eintrag) */
  shares?: number | null;
  /** Kaufpreis pro Stück (null = Watchlist-Eintrag) */
  buyPrice?: number | null;
}

export interface AddHoldingResult {
  success: boolean;
  error?: string;
}

/**
 * Fügt eine Holding in Supabase ein oder aktualisiert sie (upsert).
 * Gibt { success: true } bei Erfolg, { success: false, error } bei Fehler zurück.
 */
export async function addHolding(opts: AddHoldingOptions): Promise<AddHoldingResult> {
  const sb = getSupabaseBrowser();
  if (!sb) return { success: false, error: 'Supabase nicht konfiguriert.' };
  if (!opts.userId) return { success: false, error: 'Kein User eingeloggt.' };

  const isWatchlist = opts.shares == null || opts.buyPrice == null;

  const { error } = await sb.from('holdings').upsert(
    {
      user_id:   opts.userId,
      ticker_id: opts.tickerId,
      watchlist: isWatchlist,
      shares:    isWatchlist ? null : opts.shares,
      buy_price: isWatchlist ? null : opts.buyPrice,
    },
    { onConflict: 'user_id,ticker_id' }
  );

  if (error) {
    console.error('[holdingsService] addHolding error:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Löst eine Liste von Ticker-Namen/Symbolen über Gemini auf,
 * speichert sie in ticker_mapping (server-seitig via API) und
 * legt Watchlist-Einträge in holdings an.
 *
 * Gibt die Anzahl der erfolgreich hinzugefügten Holdings zurück.
 */
export async function addTickersByName(
  names: string[],
  userId: string
): Promise<{ count: number; error?: string }> {
  if (names.length === 0) return { count: 0 };

  const sb = getSupabaseBrowser();
  if (!sb) return { count: 0, error: 'Supabase nicht konfiguriert.' };
  if (!userId) return { count: 0, error: 'Nicht eingeloggt – bitte zuerst anmelden.' };

  // Schritt 1: Gemini löst Namen auf und speichert sie in ticker_mapping (awaited)
  let resolved: Array<{ ticker: string }> = [];
  try {
    const resp = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'resolve_ticker',
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

  // Schritt 2: Gültige Symbole aus der Antwort filtern (keine Leerzeichen = kein Klarname)
  const symbols = resolved
    .map((t) => t.ticker?.trim())
    .filter((s): s is string => !!s && !s.includes(' '));

  if (symbols.length === 0) return { count: 0 };

  // Schritt 3: IDs aus ticker_mapping holen (browser client, RLS: authenticated)
  const { data: mapped, error: mapErr } = await sb
    .from('ticker_mapping')
    .select('id, symbol')
    .in('symbol', symbols);

  if (mapErr) {
    console.error('[holdingsService] ticker_mapping SELECT error:', mapErr.message);
    return { count: 0, error: mapErr.message };
  }

  if (!mapped || mapped.length === 0) {
    return { count: 0, error: 'Keine passenden Ticker in der Datenbank gefunden.' };
  }

  // Schritt 4: Holdings als Watchlist-Einträge anlegen
  const rows = (mapped as Array<{ id: number; symbol: string }>).map((t) => ({
    user_id:   userId,
    ticker_id: t.id,
    watchlist: true,
    shares:    null,
    buy_price: null,
  }));

  const { error: insertErr } = await sb
    .from('holdings')
    .upsert(rows, { onConflict: 'user_id,ticker_id' });

  if (insertErr) {
    console.error('[holdingsService] holdings upsert error:', insertErr.message);
    return { count: 0, error: insertErr.message };
  }

  return { count: mapped.length };
}

/**
 * Löscht eine einzelne Holding aus Supabase.
 */
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
