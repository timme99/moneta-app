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
    .select('id, symbol, name, shares, buy_price, buy_date, notes')
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
    name:      (row.name as string | null) ?? tickerMap.get(row.symbol)?.company_name ?? null,
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
  userId:    string;
  symbol:    string;
  name?:     string | null;
  shares?:   number | null;
  buyPrice?: number | null;
  buyDate?:  string | null;
  notes?:    string | null;
}

export interface AddHoldingResult {
  success: boolean;
  error?: string;
}

/**
 * Speichert oder aktualisiert eine Holding in Supabase.
 *
 * Strategie (robust gegen verschiedene DB-Zustände):
 *  1. Optimistisch: upsert mit onConflict:'user_id,symbol' (benötigt UNIQUE-Constraint)
 *  2. Fallback:     SELECT → UPDATE oder INSERT (falls UNIQUE-Constraint noch fehlt)
 *
 * Tipp: Führe die Migration in supabase/schema.sql aus, um den UNIQUE-Constraint
 * anzulegen – dann ist nur Schritt 1 nötig und der DB-Roundtrip entfällt.
 */
export async function addHolding(opts: AddHoldingOptions): Promise<AddHoldingResult> {
  const sb = getSupabaseBrowser();
  if (!sb)          return { success: false, error: 'Supabase nicht konfiguriert.' };
  if (!opts.userId) return { success: false, error: 'Kein User eingeloggt.' };
  if (!opts.symbol) return { success: false, error: 'Kein Ticker-Symbol angegeben.' };

  const symbol = opts.symbol.trim().toUpperCase();
  const row = {
    user_id:   opts.userId,
    symbol,
    name:      opts.name?.trim() || null,
    shares:    opts.shares   ?? null,
    buy_price: opts.buyPrice ?? null,
    buy_date:  opts.buyDate  ?? null,
    notes:     opts.notes    ?? null,
  };

  // ── 1. Optimistischer Upsert (schnell, benötigt UNIQUE-Constraint) ──────────
  const { error: upsertErr } = await sb
    .from('holdings')
    .upsert(row, { onConflict: 'user_id,symbol' });

  if (!upsertErr) return { success: true };

  // ── 2. Fallback: manuelles Upsert ohne UNIQUE-Constraint ────────────────────
  // Tritt auf wenn die Migration noch nicht ausgeführt wurde.
  const needsFallback =
    upsertErr.message.includes('no unique or exclusion constraint') ||
    upsertErr.message.includes('PGRST116') ||
    (upsertErr as any).code === '42P10';

  if (needsFallback) {
    console.warn('[holdingsService] UNIQUE-Constraint fehlt – nutze SELECT+INSERT/UPDATE Fallback. Bitte Migration ausführen.');

    const { data: existing, error: selectErr } = await sb
      .from('holdings')
      .select('id')
      .eq('user_id', opts.userId)
      .eq('symbol', symbol)
      .maybeSingle();

    if (selectErr) {
      return { success: false, error: selectErr.message };
    }

    if (existing) {
      const { error: updateErr } = await sb
        .from('holdings')
        .update({
          name:      row.name,
          shares:    row.shares,
          buy_price: row.buy_price,
          buy_date:  row.buy_date,
          notes:     row.notes,
        })
        .eq('id', (existing as any).id)
        .eq('user_id', opts.userId);
      if (updateErr) return { success: false, error: updateErr.message };
    } else {
      const { error: insertErr } = await sb
        .from('holdings')
        .insert(row);
      if (insertErr) return { success: false, error: insertErr.message };
    }
    return { success: true };
  }

  // ── 3. Anderer Fehler: Klare Fehlermeldung ────────────────────────────────
  console.error('[holdingsService] addHolding error:', upsertErr.message);

  // Schema-Problem: Migration noch nicht ausgeführt
  if (
    upsertErr.message.includes('"symbol"') ||
    upsertErr.message.includes("'symbol'") ||
    upsertErr.message.includes('"ticker"') ||
    upsertErr.message.includes("'ticker'") ||
    upsertErr.message.includes('column') ||
    upsertErr.message.includes('schema cache')
  ) {
    return {
      success: false,
      error:
        'Datenbank-Schema veraltet: Bitte die Migration in supabase/schema.sql im Supabase SQL-Editor ausführen.',
    };
  }

  return { success: false, error: upsertErr.message };
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
  const rows = symbols.map((symbol) => ({
    user_id:   userId,
    symbol,
    shares:    null as null,
    buy_price: null as null,
  }));

  // Optimistisch: Upsert mit UNIQUE-Constraint
  const { error: insertErr } = await sb
    .from('holdings')
    .upsert(rows, { onConflict: 'user_id,symbol' });

  if (!insertErr) return { count: symbols.length };

  // Fallback: kein UNIQUE-Constraint → einzeln insert
  const needsFallback =
    insertErr.message.includes('no unique or exclusion constraint') ||
    insertErr.message.includes('PGRST116') ||
    (insertErr as any).code === '42P10';

  if (needsFallback) {
    console.warn('[holdingsService] Bulk-Upsert Fallback: UNIQUE-Constraint fehlt.');
    let inserted = 0;
    for (const r of rows) {
      const { data: ex } = await sb.from('holdings').select('id').eq('user_id', userId).eq('symbol', r.symbol).maybeSingle();
      if (!ex) {
        const { error: e2 } = await sb.from('holdings').insert(r);
        if (!e2) inserted++;
      } else {
        inserted++;
      }
    }
    return { count: inserted };
  }

  console.error('[holdingsService] holdings upsert error:', insertErr.message);

  if (
    insertErr.message.includes('"symbol"') ||
    insertErr.message.includes("'symbol'") ||
    insertErr.message.includes('"ticker"') ||
    insertErr.message.includes("'ticker'") ||
    insertErr.message.includes('column') ||
    insertErr.message.includes('schema cache')
  ) {
    return {
      count: 0,
      error: 'Datenbank-Schema veraltet: Bitte die Migration in supabase/schema.sql im Supabase SQL-Editor ausführen.',
    };
  }

  return { count: 0, error: insertErr.message };
}

// ── Broker-Import: strukturierte Transaktionen speichern ─────────────────────

/**
 * Eine einzelne, bereits aufgelöste Broker-Transaktion.
 * rawSymbol kann ein Börsensymbol (AAPL) ODER eine ISIN (US0378331005) sein.
 * shares und avgPrice sind bereits als gewichteter Durchschnitt aller Käufe berechnet.
 */
export interface BrokerPosition {
  rawSymbol: string;   // ISIN oder Ticker
  name?: string;       // Firmenname (optional, für ticker_mapping)
  shares: number;
  avgPrice: number;
  date?: string;       // frühestes Kaufdatum (ISO)
}

export interface AddBrokerResult {
  count: number;
  skipped: number;
  error?: string;
}

/**
 * Importiert vorverarbeitete Broker-Positionen in holdings.
 *
 * Ablauf:
 *  1. ISINs → Ticker auflösen (via Gemini, falls Symbol kein gültiger Ticker)
 *  2. Jede Position via addHolding speichern
 *
 * enrichOnly=true: überspringt Einträge, die bereits shares UND buy_price haben.
 *   Nützlich um Watchlist-Einträge nachträglich mit Kursdaten anzureichern,
 *   ohne bestehende vollständige Positionen zu überschreiben.
 */
export async function addBrokerHoldings(
  positions: BrokerPosition[],
  userId: string,
  enrichOnly = false,
): Promise<AddBrokerResult> {
  if (!positions.length) return { count: 0, skipped: 0 };

  const sb = getSupabaseBrowser();
  if (!sb)     return { count: 0, skipped: 0, error: 'Supabase nicht konfiguriert.' };
  if (!userId) return { count: 0, skipped: 0, error: 'Nicht eingeloggt.' };

  const ISIN_RE   = /^[A-Z]{2}[A-Z0-9]{10}$/i;
  const TICKER_RE = /^[A-Z0-9.]{1,7}$/;

  // Positionen klassifizieren: ISIN / gültiger Ticker / nur Name
  const isinPositions   = positions.filter((p) =>  ISIN_RE.test(p.rawSymbol.trim()));
  const tickerPositions = positions.filter((p) => !ISIN_RE.test(p.rawSymbol.trim()) &&  TICKER_RE.test(p.rawSymbol.trim().toUpperCase()));
  const namePositions   = positions.filter((p) => !ISIN_RE.test(p.rawSymbol.trim()) && !TICKER_RE.test(p.rawSymbol.trim().toUpperCase()));

  // ISINs über Gemini auflösen → ticker
  const resolvedMap = new Map<string, string>(); // rawSymbol.toUpperCase() → ticker

  if (isinPositions.length > 0) {
    try {
      const resp = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:    'resolve_ticker',
          payload: { names: isinPositions.map((p) => p.rawSymbol) },
          userId,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const tickers: Array<{ input?: string; ticker: string }> = data.tickers ?? [];
        tickers.forEach((t, i) => {
          const original = isinPositions[i]?.rawSymbol ?? t.input ?? '';
          if (t.ticker && TICKER_RE.test(t.ticker.trim().toUpperCase())) {
            resolvedMap.set(original.toUpperCase(), t.ticker.trim().toUpperCase());
          }
        });
      }
    } catch {
      // Weiter ohne ISIN-Auflösung
    }
  }

  // Namen ohne erkennbaren Ticker über Gemini auflösen → ticker
  if (namePositions.length > 0) {
    try {
      const resp = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:    'resolve_ticker',
          payload: { names: namePositions.map((p) => p.rawSymbol) },
          userId,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const tickers: Array<{ input?: string; ticker: string }> = data.tickers ?? [];
        tickers.forEach((t, i) => {
          const original = namePositions[i]?.rawSymbol ?? t.input ?? '';
          if (t.ticker && TICKER_RE.test(t.ticker.trim().toUpperCase())) {
            resolvedMap.set(original.toUpperCase(), t.ticker.trim().toUpperCase());
          }
        });
      }
    } catch {
      // Namen konnten nicht aufgelöst werden
    }
  }

  let count = 0;
  let skipped = 0;

  for (const pos of positions) {
    const raw = pos.rawSymbol.trim().toUpperCase();
    let symbol: string;

    if (ISIN_RE.test(raw)) {
      symbol = resolvedMap.get(raw) ?? raw;
    } else if (TICKER_RE.test(raw)) {
      symbol = raw;
    } else {
      // Name-Position: aufgelöster Ticker oder überspringen
      const resolved = resolvedMap.get(raw);
      if (!resolved) { skipped++; continue; }
      symbol = resolved;
    }

    // enrichOnly: bestehende vollständige Positionen nicht überschreiben
    if (enrichOnly) {
      const { data: existing } = await sb
        .from('holdings')
        .select('shares, buy_price')
        .eq('user_id', userId)
        .eq('symbol', symbol)
        .maybeSingle();
      if (existing && existing.shares != null && existing.buy_price != null) {
        skipped++;
        continue;
      }
    }

    const result = await addHolding({
      userId,
      symbol,
      name:     pos.name?.trim() || null,
      shares:   pos.shares,
      buyPrice: pos.avgPrice,
      buyDate:  pos.date ?? null,
    });

    if (result.success) count++;
    else skipped++;
  }

  // ticker_mapping für alle gespeicherten Ticker-Positionen befüllen
  // (ISINs wurden bereits via resolve_ticker oben angereichert)
  const tickerNamesToEnrich = tickerPositions.map((p) =>
    p.name?.trim() || p.rawSymbol.trim().toUpperCase()
  );
  if (tickerNamesToEnrich.length > 0) {
    try {
      await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:    'resolve_ticker',
          payload: { names: tickerNamesToEnrich },
          userId,
        }),
      });
    } catch {
      // ticker_mapping-Anreicherung ist best-effort
    }
  }

  return { count, skipped };
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
