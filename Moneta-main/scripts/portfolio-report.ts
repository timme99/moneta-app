#!/usr/bin/env node
/**
 * scripts/portfolio-report.ts
 *
 * Standalone-Script für GitHub Actions.
 * Lädt alle Nutzer-Portfolios aus Supabase, analysiert sie mit Gemini
 * und versendet personalisierte Portfolio- und Aktienberichte per E-Mail.
 *
 * Ausführung:
 *   npx tsx scripts/portfolio-report.ts --type daily
 *   npx tsx scripts/portfolio-report.ts --type weekly
 */

import { createClient } from '@supabase/supabase-js';
import { buildDailySnapshotHtml, buildDigestHtml, sendEmail } from '../lib/email.js';
import type { StockNewsItem } from '../lib/email.js';

// ── Umgebungsvariablen ────────────────────────────────────────────────────────

const SUPABASE_URL     = process.env.MONETA_SUPABASE_URL ?? '';
const SUPABASE_SERVICE = process.env.MONETA_SUPABASE_SERVICE_ROLE_KEY ?? '';
const AV_API_KEY       = process.env.ALPHA_VANTAGE_API_KEY ?? '';
const APP_URL          = process.env.APP_URL ?? 'https://moneta-invest.de';
const GEMINI_KEY       = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL     = 'gemini-2.5-flash';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── CLI-Argument ──────────────────────────────────────────────────────────────

const typeIdx = process.argv.indexOf('--type');
const REPORT_TYPE: 'daily' | 'weekly' =
  typeIdx !== -1 && process.argv[typeIdx + 1] === 'weekly' ? 'weekly' : 'daily';

console.log(`\n📊 Moneta Portfolio-Report – Typ: ${REPORT_TYPE}`);
console.log(`   Datum: ${new Date().toLocaleString('de-DE')}\n`);

// ── Supabase Admin Client ─────────────────────────────────────────────────────

if (!SUPABASE_URL || !SUPABASE_SERVICE) {
  console.error('❌ MONETA_SUPABASE_URL und MONETA_SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein.');
  process.exit(1);
}
if (!process.env.RESEND_API_KEY) {
  console.error('❌ RESEND_API_KEY muss gesetzt sein.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Kurs-Cache (in-memory für diesen Lauf) ────────────────────────────────────

const priceCache = new Map<string, { price: number; changePercent: number | null; fetchedAt: number }>();
const PRICE_TTL  = 30 * 60 * 1000;

async function fetchPrice(symbol: string): Promise<number | null> {
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < PRICE_TTL) return cached.price;

  if (!AV_API_KEY) return null;
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${AV_API_KEY}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json() as Record<string, any>;
    const q = data['Global Quote'];
    if (!q) return null;
    const price = parseFloat(q['05. price'] ?? '0') || null;
    const changePercent = parseFloat((q['10. change percent'] ?? '').replace('%', '')) || null;
    if (price) priceCache.set(symbol, { price, changePercent, fetchedAt: Date.now() });
    return price;
  } catch {
    return null;
  }
}

// ── Gemini: Aktien-News ───────────────────────────────────────────────────────

async function fetchStockNews(symbols: string[]): Promise<StockNewsItem[]> {
  if (!GEMINI_KEY || symbols.length === 0) return [];

  const symbolList = symbols.slice(0, 10).join(', ');
  const prompt =
`Du bist ein Finanzinformations-Assistent. Liefere 4 aktuelle Nachrichten zu diesen Aktien/ETFs: ${symbolList}.

Antworte NUR mit einem JSON-Array aus genau 4 Objekten:
- title: Kurze Überschrift (max. 80 Zeichen, auf Deutsch)
- source: Nachrichtenquelle (z.B. "Reuters", "Bloomberg", "Handelsblatt")
- snippet: Kerninhalt der Meldung (max. 120 Zeichen, auf Deutsch)
- importance: "hoch", "mittel" oder "niedrig"
- impact_emoji: Ein passendes Emoji (z.B. "📈", "📉", "⚠️", "💰")
- ticker: Das betroffene Symbol aus der Liste (oder null)

Keine Anlageberatung. Nur sachliche Marktinformationen.
[{"title":"...","source":"...","snippet":"...","importance":"mittel","impact_emoji":"📈","ticker":"AAPL"}]`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
        }),
        signal: AbortSignal.timeout(12_000),
      }
    );
    if (!resp.ok) return [];
    const data = await resp.json() as Record<string, any>;
    const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
    const stripped = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1]?.trim() ?? raw.trim();
    const parsed = JSON.parse(stripped);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 4).filter((item: any) =>
      typeof item?.title === 'string' && typeof item?.snippet === 'string'
    ) as StockNewsItem[];
  } catch (e) {
    console.warn('[gemini] fetchStockNews Fehler:', (e as Error).message);
    return [];
  }
}

// ── Gemini: Makrolage ─────────────────────────────────────────────────────────

async function fetchMacroNews(dateLabel: string): Promise<string[]> {
  if (!GEMINI_KEY) return [];

  const prompt =
`Du bist ein Finanzinformations-Assistent. Nenne 3 aktuelle makroökonomische Punkte für Aktieninvestoren heute (${dateLabel}).

Antworte NUR mit einem JSON-Array aus 3 kurzen deutschen Sätzen (max. 110 Zeichen pro Satz).
Keine Anlageberatung. Nur sachliche Marktinformationen (Zinsen, Konjunktur, Rohstoffe, Index-Trend).
["Punkt 1", "Punkt 2", "Punkt 3"]`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!resp.ok) return [];
    const data = await resp.json() as Record<string, any>;
    const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
    const stripped = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1]?.trim() ?? raw.trim();
    const parsed = JSON.parse(stripped);
    return Array.isArray(parsed)
      ? parsed.slice(0, 3).filter((s: unknown) => typeof s === 'string')
      : [];
  } catch (e) {
    console.warn('[gemini] fetchMacroNews Fehler:', (e as Error).message);
    return [];
  }
}

// ── Gemini: Wöchentliche Portfolio-Highlights ─────────────────────────────────

async function fetchWeeklyHighlights(symbols: string[], weeklyChangePct?: number): Promise<string[]> {
  if (!GEMINI_KEY || symbols.length === 0) {
    return [
      'KI-gestützte Szenario-Analyse für dein Depot jetzt verfügbar',
      'Earnings-Kalender: alle Quartalszahlen auf einen Blick',
      'Täglicher Depot-Überblick per E-Mail aktivierbar',
    ];
  }

  const perfText = weeklyChangePct !== undefined
    ? `Das Depot hat diese Woche ${weeklyChangePct >= 0 ? '+' : ''}${weeklyChangePct.toFixed(1)} % verändert.`
    : '';

  const prompt =
`Du bist ein Finanzberater-Assistent. ${perfText}
Das Depot enthält folgende Positionen: ${symbols.join(', ')}.

Erstelle 3 prägnante Wochenbericht-Highlights auf Deutsch (je max. 90 Zeichen).
Fokus: wichtige Marktentwicklungen dieser Woche, die diese Aktien/ETFs betreffen.
Keine Anlageberatung. Sachliche Informationen.

Antworte NUR mit einem JSON-Array aus 3 deutschen Strings:
["Highlight 1", "Highlight 2", "Highlight 3"]`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 300 },
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!resp.ok) return [];
    const data = await resp.json() as Record<string, any>;
    const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
    const stripped = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1]?.trim() ?? raw.trim();
    const parsed = JSON.parse(stripped);
    return Array.isArray(parsed)
      ? parsed.slice(0, 3).filter((s: unknown) => typeof s === 'string')
      : [];
  } catch (e) {
    console.warn('[gemini] fetchWeeklyHighlights Fehler:', (e as Error).message);
    return [];
  }
}

// ── Dividenden: Yahoo Finance ─────────────────────────────────────────────────

async function fetchYahooDividend(symbol: string): Promise<{ exDate: string; dps: number; yieldPct: number } | null> {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail`;
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const sd = data?.quoteSummary?.result?.[0]?.summaryDetail;
    if (!sd) return null;
    const dps = sd.dividendRate?.raw ?? 0;
    return {
      exDate:   sd.exDividendDate?.fmt ?? '',
      dps,
      yieldPct: (sd.dividendYield?.raw ?? 0) * 100,
    };
  } catch {
    return null;
  }
}

interface UpcomingDividend {
  symbol:   string;
  company:  string;
  exDate:   string;
  dps:      number;
  yieldPct: number;
}

async function fetchUpcomingDividends(
  symbols: string[],
  nameBySymbol: Map<string, string>,
): Promise<UpcomingDividend[]> {
  if (symbols.length === 0) return [];

  const today   = new Date().toISOString().slice(0, 10);
  const cutoff  = new Date();
  cutoff.setDate(cutoff.getDate() + 14);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // Lade dividend_cache für alle Symbole
  const { data: cachedRows } = await sb
    .from('dividend_cache')
    .select('symbol, dividend_per_share, ex_dividend_date, dividend_yield, no_data')
    .in('symbol', symbols) as unknown as {
      data: Array<{
        symbol: string;
        dividend_per_share: number;
        ex_dividend_date: string | null;
        dividend_yield: number;
        no_data: boolean;
      }> | null;
    };

  const cachedSet = new Set((cachedRows ?? []).map((r) => r.symbol));
  const uncached  = symbols.filter((s) => !cachedSet.has(s)).slice(0, 15);

  // Nicht gecachte Symbole frisch von Yahoo Finance holen
  const freshRows: Array<{
    symbol: string; dividend_per_share: number;
    ex_dividend_date: string | null; dividend_yield: number; no_data: boolean;
  }> = [];

  for (const sym of uncached) {
    const result = await fetchYahooDividend(sym);
    const now = new Date().toISOString();
    const row = {
      symbol:             sym,
      dividend_per_share: result?.dps      ?? 0,
      ex_dividend_date:   result?.exDate   || null,
      dividend_yield:     result?.yieldPct ?? 0,
      no_data:            !result || result.dps === 0,
    };
    freshRows.push(row);
    // In Cache persistieren
    await sb.from('dividend_cache').upsert(
      [{ ...row, source: 'yahoo_finance', last_updated: now }],
      { onConflict: 'symbol' },
    );
    await sb.from('scan_log').upsert(
      [{ symbol: sym, type: 'dividend', scanned_at: now }],
      { onConflict: 'symbol,type' },
    );
    await sleep(300);
  }

  const allRows = [...(cachedRows ?? []), ...freshRows];

  return allRows
    .filter((r) =>
      !r.no_data &&
      r.ex_dividend_date &&
      r.ex_dividend_date >= today &&
      r.ex_dividend_date <= cutoffStr
    )
    .map((r) => ({
      symbol:   r.symbol,
      company:  nameBySymbol.get(r.symbol) ?? r.symbol,
      exDate:   r.ex_dividend_date!,
      dps:      Number(r.dividend_per_share) || 0,
      yieldPct: Number(r.dividend_yield)     || 0,
    }))
    .sort((a, b) => a.exDate.localeCompare(b.exDate));
}

// ── Portfolio-Chart via QuickChart.io ─────────────────────────────────────────

function generatePortfolioChartUrl(positions: { symbol: string; value: number }[]): string {
  const top = positions.filter((p) => p.value > 0).slice(0, 8);
  if (top.length === 0) return '';

  const total = top.reduce((s, p) => s + p.value, 0);
  const colors = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#818cf8', '#60a5fa', '#34d399', '#fbbf24'];

  const config = {
    type: 'doughnut',
    data: {
      labels:   top.map((p) => `${p.symbol} ${((p.value / total) * 100).toFixed(1)}%`),
      datasets: [{
        data:            top.map((p) => parseFloat(p.value.toFixed(2))),
        backgroundColor: colors.slice(0, top.length),
        borderWidth:     0,
      }],
    },
    options: {
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#f1f5f9', font: { size: 11 }, padding: 10 },
        },
      },
      cutout: '55%',
    },
  };

  const encoded = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?c=${encoded}&bkg=%23070d1a&width=500&height=240`;
}

// ── Nutzer-Daten aus Supabase laden ──────────────────────────────────────────

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  preferences: Record<string, unknown> | null;
}

async function loadProfiles(): Promise<ProfileRow[]> {
  const { data, error } = await (sb
    .from('profiles')
    .select('id, email, full_name, preferences')
    .not('email', 'is', null) as unknown as Promise<{ data: ProfileRow[] | null; error: any }>);

  if (error) {
    console.error('[supabase] loadProfiles Fehler:', error.message);
    return [];
  }
  return data ?? [];
}

interface HoldingRow {
  user_id: string;
  symbol: string;
  shares: number;
  buy_price: number | null;
}

async function loadAllHoldings(): Promise<HoldingRow[]> {
  const { data, error } = await (sb
    .from('holdings')
    .select('user_id, symbol, shares, buy_price')
    .not('shares', 'is', null) as unknown as Promise<{ data: HoldingRow[] | null; error: any }>);

  if (error) {
    console.error('[supabase] loadAllHoldings Fehler:', error.message);
    return [];
  }
  return (data ?? []).filter((h) => h.shares && h.shares > 0);
}

// ── Tagesbericht ──────────────────────────────────────────────────────────────

async function runDailyReport(): Promise<void> {
  console.log('🔄 Lade Nutzerprofile…');
  const profiles = await loadProfiles();
  const subscribers = profiles.filter((p) => p.preferences?.dailyDigest === true);
  console.log(`   ${subscribers.length} Abonnent(en) mit dailyDigest=true`);

  if (subscribers.length === 0) {
    console.log('ℹ️  Kein Versand – keine Abonnenten.');
    return;
  }

  console.log('🔄 Lade Holdings…');
  const allHoldings = await loadAllHoldings();
  console.log(`   ${allHoldings.length} Positionen geladen`);

  // Pro User gruppieren
  const byUser = new Map<string, HoldingRow[]>();
  for (const h of allHoldings) {
    const arr = byUser.get(h.user_id) ?? [];
    arr.push(h);
    byUser.set(h.user_id, arr);
  }

  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  // Preise für alle einzigartigen Symbole abrufen
  const allSymbols = [...new Set(allHoldings.map((h) => h.symbol))];
  console.log(`🔄 Rufe Kurse ab für ${allSymbols.length} Symbole…`);
  for (const sym of allSymbols) {
    const price = await fetchPrice(sym);
    if (price) console.log(`   ✓ ${sym}: ${price}`);
    await sleep(250); // AV rate-limit schonen
  }

  // Portfolio-Werte berechnen und Snapshots speichern
  const snapshots: Array<{ user_id: string; snapshot_date: string; total_value: number; total_invested: number | null }> = [];
  for (const [userId, positions] of byUser.entries()) {
    let totalValue = 0, totalInvested = 0, priceCount = 0;
    for (const pos of positions) {
      const price = priceCache.get(pos.symbol)?.price;
      if (price && price > 0) { totalValue += price * pos.shares; priceCount++; }
      if (pos.buy_price && pos.buy_price > 0) totalInvested += pos.buy_price * pos.shares;
    }
    if (priceCount === 0 || totalValue <= 0) continue;
    snapshots.push({
      user_id:        userId,
      snapshot_date:  today,
      total_value:    Math.round(totalValue * 100) / 100,
      total_invested: totalInvested > 0 ? Math.round(totalInvested * 100) / 100 : null,
    });
  }

  if (snapshots.length > 0) {
    const { error } = await sb
      .from('portfolio_snapshots')
      .upsert(snapshots, { onConflict: 'user_id,snapshot_date' });
    if (error) console.error('[supabase] upsert snapshots Fehler:', error.message);
    else console.log(`✅ ${snapshots.length} Portfolio-Snapshots für ${today} gespeichert`);
  }

  // Gestrige Snapshots für Vergleich laden
  const subscriberIds = subscribers.map((s) => s.id);
  const { data: prevRows } = await sb
    .from('portfolio_snapshots')
    .select('user_id, total_value')
    .in('user_id', subscriberIds)
    .eq('snapshot_date', yesterdayStr) as unknown as { data: Array<{ user_id: string; total_value: number }> | null };

  const prevByUser = new Map<string, number>(
    (prevRows ?? []).map((r) => [r.user_id, r.total_value])
  );
  const todayByUser = new Map<string, number>(
    snapshots.map((s) => [s.user_id, s.total_value])
  );

  // Ticker-Namen laden
  const { data: tickerRows } = await sb
    .from('ticker_mapping')
    .select('symbol, company_name')
    .in('symbol', allSymbols) as unknown as { data: Array<{ symbol: string; company_name: string }> | null };
  const nameBySymbol = new Map<string, string>(
    (tickerRows ?? []).map((t) => [t.symbol, t.company_name])
  );

  const dateLabel = new Date().toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // Gemini-Calls (EINMALIG für alle User)
  console.log('🤖 Generiere Markt-News via Gemini…');
  const macroNews  = await fetchMacroNews(dateLabel);
  const stockNews  = await fetchStockNews(allSymbols);
  console.log(`   Makro: ${macroNews.length} Punkte | Aktien: ${stockNews.length} Artikel`);

  // E-Mails versenden
  console.log(`\n📧 Versende Tagesberichte…`);
  let sent = 0, skipped = 0, failed = 0;

  for (const sub of subscribers) {
    const totalValue = todayByUser.get(sub.id);
    if (!totalValue) { skipped++; continue; }

    const prevValue      = prevByUser.get(sub.id) ?? totalValue;
    const dailyChange    = totalValue - prevValue;
    const dailyChangePct = prevValue > 0 ? (dailyChange / prevValue) * 100 : 0;

    const userPositions = (byUser.get(sub.id) ?? [])
      .map((h) => ({
        symbol:        h.symbol,
        name:          nameBySymbol.get(h.symbol),
        value:         (priceCache.get(h.symbol)?.price ?? 0) * h.shares,
        changePercent: priceCache.get(h.symbol)?.changePercent ?? null,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const userSymbols   = new Set(userPositions.map((p) => p.symbol));
    const relevantNews  = [
      ...stockNews.filter((n) => n.ticker && userSymbols.has(n.ticker)),
      ...stockNews.filter((n) => !n.ticker || !userSymbols.has(n.ticker)),
    ].slice(0, 4);

    const sign    = dailyChange >= 0 ? '+' : '';
    const subject = `📊 Depot heute: ${sign}${dailyChangePct.toFixed(1)} % | Moneta`;

    const html = buildDailySnapshotHtml({
      userName:           sub.full_name ?? undefined,
      totalValue,
      dailyChange,
      dailyChangePercent: dailyChangePct,
      ctaUrl:             APP_URL,
      dateLabel,
      macroNews,
      topHoldings:        userPositions,
      stockNews:          relevantNews,
    });

    const result = await sendEmail({ to: sub.email, subject, html });
    if (result.success) {
      sent++;
      console.log(`   ✓ ${sub.email}`);
    } else {
      failed++;
      console.error(`   ✗ ${sub.email}: ${result.error}`);
    }
    await sleep(600);
  }

  console.log(`\n✅ Tagesbericht abgeschlossen: ${sent} versendet, ${skipped} übersprungen, ${failed} Fehler`);
}

// ── Wochenbericht ─────────────────────────────────────────────────────────────

async function runWeeklyReport(): Promise<void> {
  console.log('🔄 Lade Nutzerprofile…');
  const profiles = await loadProfiles();
  const subscribers = profiles.filter((p) => p.preferences?.weeklyReport === true);
  console.log(`   ${subscribers.length} Abonnent(en) mit weeklyReport=true`);

  if (subscribers.length === 0) {
    console.log('ℹ️  Kein Versand – keine Abonnenten.');
    return;
  }

  const today       = new Date().toISOString().slice(0, 10);
  const sevenAgo    = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 7);
  const weekAgoStr  = sevenAgo.toISOString().slice(0, 10);
  const nextWeek    = new Date(); nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().slice(0, 10);

  const subscriberIds = subscribers.map((s) => s.id);

  // Aktuelle Snapshots
  const { data: currRows } = await sb
    .from('portfolio_snapshots')
    .select('user_id, total_value')
    .in('user_id', subscriberIds)
    .eq('snapshot_date', today) as unknown as { data: Array<{ user_id: string; total_value: number }> | null };

  // Snapshots von vor 7 Tagen
  const { data: prevRows } = await sb
    .from('portfolio_snapshots')
    .select('user_id, total_value')
    .in('user_id', subscriberIds)
    .eq('snapshot_date', weekAgoStr) as unknown as { data: Array<{ user_id: string; total_value: number }> | null };

  const currByUser = new Map<string, number>((currRows ?? []).map((r) => [r.user_id, r.total_value]));
  const prevByUser = new Map<string, number>((prevRows ?? []).map((r) => [r.user_id, r.total_value]));

  // Holdings für Earnings-Filterung
  const { data: holdingsData } = await sb
    .from('holdings')
    .select('user_id, symbol')
    .in('user_id', subscriberIds)
    .not('shares', 'is', null) as unknown as { data: Array<{ user_id: string; symbol: string }> | null };

  const symbolsByUser = new Map<string, string[]>();
  for (const h of holdingsData ?? []) {
    const arr = symbolsByUser.get(h.user_id) ?? [];
    if (!arr.includes(h.symbol)) arr.push(h.symbol);
    symbolsByUser.set(h.user_id, arr);
  }

  // Earnings der nächsten 7 Tage
  const allSymbols = [...new Set((holdingsData ?? []).map((h) => h.symbol))];
  const earningsBySymbol = new Map<string, { ticker: string; company: string; date: string; timeOfDay?: string; quarter?: string }>();

  if (allSymbols.length > 0) {
    const { data: earningsRows } = await sb
      .from('stock_events')
      .select('symbol, event_date, quarter, details')
      .eq('event_type', 'earnings')
      .gte('event_date', today)
      .lte('event_date', nextWeekStr)
      .in('symbol', allSymbols) as unknown as { data: Array<{ symbol: string; event_date: string; quarter: string | null; details: any }> | null };

    for (const row of earningsRows ?? []) {
      earningsBySymbol.set(row.symbol, {
        ticker:    row.symbol,
        company:   row.details?.company ?? row.symbol,
        date:      row.event_date,
        timeOfDay: row.details?.timeOfDay,
        quarter:   row.quarter ?? undefined,
      });
    }
    console.log(`   ${earningsBySymbol.size} Earnings-Termine für nächste Woche`);
  }

  // Ticker-Namen für Dividenden-Beschriftung laden
  const { data: tickerRows } = await sb
    .from('ticker_mapping')
    .select('symbol, company_name')
    .in('symbol', allSymbols) as unknown as { data: Array<{ symbol: string; company_name: string }> | null };
  const nameBySymbol = new Map<string, string>(
    (tickerRows ?? []).map((t) => [t.symbol, t.company_name])
  );

  // Aktuelle Kurse für Portfolio-Chart abrufen
  if (AV_API_KEY && allSymbols.length > 0) {
    console.log(`🔄 Rufe Kurse ab für ${allSymbols.length} Symbole (Chart)…`);
    for (const sym of allSymbols) {
      await fetchPrice(sym);
      await sleep(250);
    }
  }

  // Dividenden der nächsten 14 Tage für alle Symbole laden
  console.log('🔄 Lade Dividenden-Daten…');
  const allUpcomingDividends = await fetchUpcomingDividends(allSymbols, nameBySymbol);
  console.log(`   ${allUpcomingDividends.length} bevorstehende Dividende(n) gefunden`);

  // Auch für den Wochenbericht müssen wir Holdings laden (shares für Chart-Wert)
  const { data: weeklyHoldingsData } = await sb
    .from('holdings')
    .select('user_id, symbol, shares')
    .in('user_id', subscriberIds)
    .not('shares', 'is', null) as unknown as { data: Array<{ user_id: string; symbol: string; shares: number }> | null };

  const holdingsByUser = new Map<string, Array<{ symbol: string; shares: number }>>();
  for (const h of weeklyHoldingsData ?? []) {
    const arr = holdingsByUser.get(h.user_id) ?? [];
    arr.push({ symbol: h.symbol, shares: h.shares });
    holdingsByUser.set(h.user_id, arr);
  }

  // E-Mails versenden
  console.log(`\n📧 Versende Wochenberichte…`);
  const subject = 'Dein KI-Wochenbericht – Moneta';
  let sent = 0, failed = 0;

  for (let i = 0; i < subscribers.length; i++) {
    const sub = subscribers[i];

    const totalValue     = currByUser.get(sub.id);
    const prevValue      = prevByUser.get(sub.id);
    const weeklyChange   = totalValue !== undefined && prevValue !== undefined
      ? totalValue - prevValue : undefined;
    const weeklyChangePct = weeklyChange !== undefined && prevValue && prevValue > 0
      ? (weeklyChange / prevValue) * 100 : undefined;

    const userSymbols     = symbolsByUser.get(sub.id) ?? [];
    const upcomingEarnings = userSymbols
      .filter((s) => earningsBySymbol.has(s))
      .map((s) => earningsBySymbol.get(s)!)
      .sort((a, b) => a.date.localeCompare(b.date));

    // Dividenden für diesen User (nur eigene Symbole)
    const userSymbolSet = new Set(userSymbols);
    const userDividends = allUpcomingDividends.filter((d) => userSymbolSet.has(d.symbol));

    // Portfolio-Chart: Positionen mit aktuellem Kurswert
    const userHoldings = holdingsByUser.get(sub.id) ?? [];
    const chartPositions = userHoldings
      .map((h) => ({
        symbol: h.symbol,
        value:  (priceCache.get(h.symbol)?.price ?? 0) * h.shares,
      }))
      .filter((p) => p.value > 0)
      .sort((a, b) => b.value - a.value);
    const chartUrl = generatePortfolioChartUrl(chartPositions);

    // KI-Highlights für diesen User generieren
    const highlights = await fetchWeeklyHighlights(userSymbols, weeklyChangePct);

    const html = buildDigestHtml({
      userName:            sub.full_name ?? undefined,
      summary:             'hier ist deine wöchentliche Depot-Zusammenfassung.',
      highlights,
      ctaUrl:              APP_URL,
      totalValue,
      weeklyChange,
      weeklyChangePercent: weeklyChangePct,
      upcomingEarnings:    upcomingEarnings.length > 0 ? upcomingEarnings : undefined,
      upcomingDividends:   userDividends.length   > 0 ? userDividends   : undefined,
      portfolioChartUrl:   chartUrl                  || undefined,
    });

    console.log(`   Sende an ${sub.email} (${i + 1}/${subscribers.length})…`);
    const result = await sendEmail({ to: sub.email, subject, html });

    if (result.success) {
      sent++;
      console.log(`   ✓ ${sub.email}`);
    } else {
      failed++;
      console.error(`   ✗ ${sub.email}: ${result.error}`);
    }
    if (i < subscribers.length - 1) await sleep(600);
  }

  console.log(`\n✅ Wochenbericht abgeschlossen: ${sent} versendet, ${failed} Fehler`);
}

// ── Einstiegspunkt ────────────────────────────────────────────────────────────

(async () => {
  try {
    if (REPORT_TYPE === 'weekly') {
      await runWeeklyReport();
    } else {
      await runDailyReport();
    }
    console.log('\n🎉 Fertig.\n');
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ Unerwarteter Fehler:', err?.message ?? err);
    process.exit(1);
  }
})();
