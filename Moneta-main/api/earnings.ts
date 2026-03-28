/**
 * GET /api/earnings?symbols=AAPL,SAP.DE
 *
 * Cache-First Earnings-Kalender via Supabase earnings_cache + scan_log.
 *
 * Ablauf:
 *  1. Lade alle gecachten Einträge aus earnings_cache für die übergebenen Symbole.
 *  2. Identifiziere das erste Symbol, das noch nie (oder vor >30 Tagen) gescannt wurde.
 *  3. Rufe Yahoo Finance calendarEvents (0 Tokens!) für dieses EINE Symbol ab.
 *  4. Fallback: Gemini (nur wenn Yahoo Finance kein Ergebnis liefert).
 *  5. Schreibe neue Termine per upsert in earnings_cache, aktualisiere scan_log.
 *  6. Gib gecachte + neue zukünftige Termine zurück.
 *
 *  Beim nächsten Seitenaufruf wird das nächste fehlende Symbol gescannt.
 *  Die Datenbank "füllt sich" so selbst – ohne jemals ein Timeout zu riskieren.
 *
 * Header: Authorization: Bearer <supabase-access-token>
 */

import { createClientWithToken, getSupabaseAdmin } from '../lib/supabaseClient.js';

const GEMINI_MODEL    = 'gemini-2.5-flash';
const CACHE_TTL_MS    = 30 * 24 * 60 * 60 * 1000; // 30 Tage
const YF_TIMEOUT_MS   = 8_000;
const SCAN_TIMEOUT_MS = 8_000;

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
              + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

function stripJsonFences(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return m ? m[1].trim() : text.trim();
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Nur GET erlaubt.' });

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const authHeader = (req.headers.authorization ?? '') as string;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Bearer-Token fehlt.' });

  try {
    const userClient = createClientWithToken(token);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return res.status(401).json({ error: 'Token ungültig oder abgelaufen.' });
  } catch {
    return res.status(500).json({ error: 'Auth-Initialisierung fehlgeschlagen.' });
  }

  // ── Parameter ─────────────────────────────────────────────────────────────────
  const rawSymbols = ((req.query.symbols as string) ?? '').trim();
  if (!rawSymbols) return res.status(400).json({ error: 'Parameter "symbols" fehlt (z. B. ?symbols=AAPL,SAP.DE).' });

  const symbols = rawSymbols
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 100);

  const force = req.query.force === '1' || req.query.force === 'true';
  const today = new Date().toISOString().split('T')[0];
  const admin = getSupabaseAdmin();

  // ── 1. Lade earnings_cache + scan_log für alle Symbole ────────────────────
  const [{ data: cacheRows, error: cacheErr }, { data: scanRows, error: scanErr }] =
    await Promise.all([
      (admin as any).from('earnings_cache')
        .select('symbol, event_date, quarter, company, eps_estimate, revenue_estimate, time_of_day')
        .in('symbol', symbols)
        .gte('event_date', today),
      (admin as any).from('scan_log')
        .select('symbol, scanned_at')
        .in('symbol', symbols)
        .eq('type', 'earnings'),
    ]);

  if (cacheErr) {
    console.error('[earnings] earnings_cache Fehler:', cacheErr.message);
    return res.status(500).json({ error: 'Datenbankfehler.' });
  }

  const rows: any[] = cacheRows ?? [];

  // ── 2. Scan-Zeitstempel pro Symbol aus scan_log ──────────────────────────
  const scanMap = new Map<string, number>();
  for (const r of (scanRows ?? [])) {
    scanMap.set(r.symbol, new Date(r.scanned_at).getTime());
  }

  // Symbole, die noch nie oder vor > 30 Tagen gescannt wurden (oder force=1)
  const staleSymbols = force
    ? symbols.slice(0, 1)  // force: immer das erste Symbol neu scannen
    : symbols.filter(s => {
        const last = scanMap.get(s);
        return !last || Date.now() - last > CACHE_TTL_MS;
      });

  // ── 3. Genau EIN Symbol scannen (Yahoo Finance → Gemini Fallback) ─────────
  let scannedSymbol: string | null = null;

  if (staleSymbols.length > 0) {
    const sym = staleSymbols[0];
    scannedSymbol = sym;

    let newEvents: any[] = [];
    let source = 'gemini';

    // Stufe 1: Yahoo Finance calendarEvents (0 Tokens)
    try {
      newEvents = await fetchEarningsViaYahooFinance(sym, today);
      if (newEvents.length > 0) {
        source = 'yahoo_finance';
        console.log(`[earnings] ${sym}: Yahoo Finance OK (${newEvents.length} Termine)`);
      } else {
        console.log(`[earnings] ${sym}: Yahoo Finance – keine Termine, versuche Gemini`);
      }
    } catch (e: any) {
      console.warn(`[earnings] ${sym}: Yahoo Finance fehlgeschlagen (${e?.message}) → Gemini`);
    }

    // Stufe 2: Gemini (Fallback wenn YF kein Ergebnis)
    if (newEvents.length === 0) {
      try {
        newEvents = await fetchEarningsViaGemini(sym, today);
        console.log(`[earnings] ${sym}: Gemini OK (${newEvents.length} Termine)`);
      } catch (scanErr: any) {
        console.error(`[earnings] ${sym}: Gemini fehlgeschlagen:`, scanErr?.message);
      }
    }

    // Alte Termine für dieses Symbol aufräumen
    // Bei force=1: alle Einträge löschen (inkl. zukünftige) + aus rows entfernen
    if (force) {
      await (admin as any).from('earnings_cache').delete().eq('symbol', sym);
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].symbol === sym) rows.splice(i, 1);
      }
    } else {
      await (admin as any).from('earnings_cache')
        .delete()
        .eq('symbol', sym)
        .lt('event_date', today);
    }

    // Neue zukünftige Termine einfügen
    const now = new Date().toISOString();
    for (const evt of newEvents) {
      if (!evt.date || evt.date <= today) continue;

      await (admin as any).from('earnings_cache').upsert(
        [{
          symbol:          sym,
          event_date:      evt.date,
          quarter:         evt.quarter ?? null,
          company:         evt.company ?? sym,
          eps_estimate:    evt.epsEstimate ?? '',
          revenue_estimate: evt.revenueEstimate ?? '',
          time_of_day:     evt.timeOfDay ?? 'unbekannt',
          source,
          last_updated:    now,
        }],
        { onConflict: 'symbol,event_date' },
      );

      rows.push({
        symbol:          sym,
        event_date:      evt.date,
        quarter:         evt.quarter ?? null,
        company:         evt.company ?? sym,
        eps_estimate:    evt.epsEstimate ?? '',
        revenue_estimate: evt.revenueEstimate ?? '',
        time_of_day:     evt.timeOfDay ?? 'unbekannt',
      });
    }

    // Scan-Zeitstempel aktualisieren
    await (admin as any).from('scan_log').upsert(
      [{ symbol: sym, type: 'earnings', scanned_at: now }],
      { onConflict: 'symbol,type' },
    );
  }

  // ── 4. Antwort: nur zukünftige echte Termine, dedupliziert, sortiert ──────────
  const seen = new Set<string>();
  const events = rows
    .filter(r => r.event_date >= today)
    .filter(r => {
      const key = `${r.symbol}::${r.event_date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(r => ({
      ticker:          r.symbol,
      company:         r.company ?? r.symbol,
      date:            r.event_date,
      quarter:         r.quarter ?? '',
      epsEstimate:     r.eps_estimate ?? '',
      revenueEstimate: r.revenue_estimate ?? '',
      timeOfDay:       r.time_of_day ?? 'unbekannt',
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return res.status(200).json({
    events,
    scannedSymbol,
    cacheStats: {
      total:  symbols.length,
      cached: symbols.length - staleSymbols.length,
      stale:  staleSymbols.length,
    },
  });
}

// ── Yahoo Finance calendarEvents (0 Tokens, echte Daten) ─────────────────────

async function fetchEarningsViaYahooFinance(symbol: string, today: string): Promise<any[]> {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/`
            + `${encodeURIComponent(symbol)}?modules=calendarEvents`;

  const resp = await fetch(url, {
    headers: YF_HEADERS,
    signal: AbortSignal.timeout(YF_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`Yahoo Finance HTTP ${resp.status}`);

  const data = await resp.json();
  const error = data?.quoteSummary?.error;
  if (error) throw new Error(`Yahoo Finance Fehler: ${error.description ?? error.code}`);

  const ce = data?.quoteSummary?.result?.[0]?.calendarEvents?.earnings;
  if (!ce) return [];

  // earningsDate ist ein Array (Bandbreite); erstes Element = wahrscheinlichstes Datum
  const dates: string[] = (ce.earningsDate ?? [])
    .map((d: any) => d.fmt as string)
    .filter((d: string) => d && d > today);

  if (dates.length === 0) return [];

  // timeOfDay mapping
  const callTime = ce.earningsCallTime ?? '';
  let timeOfDay = 'unbekannt';
  if (callTime === 'afterHours' || callTime === 'After Market Close') {
    timeOfDay = 'nach Marktschluss';
  } else if (callTime === 'beforeHours' || callTime === 'Before Market Open') {
    timeOfDay = 'vor Marktöffnung';
  }

  const epsEstimate     = ce.earningsAverage?.fmt  ?? '';
  const revenueEstimate = ce.revenueAverage?.fmt   ?? '';

  return dates.map((date, i) => ({
    date,
    quarter:         '',   // Yahoo Finance liefert kein Quarter-Label
    company:         symbol,
    epsEstimate:     i === 0 ? epsEstimate     : '',
    revenueEstimate: i === 0 ? revenueEstimate : '',
    timeOfDay,
  }));
}

// ── Gemini-Scan für genau ein Symbol (Fallback) ───────────────────────────────

async function fetchEarningsViaGemini(symbol: string, today: string): Promise<any[]> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error('GEMINI_API_KEY nicht konfiguriert.');

  const year = new Date().getFullYear();

  const prompt =
`Du bist ein Finanzinformations-Assistent. Nenne die nächsten geplanten Earnings-Veröffentlichungstermine für das Börsensymbol "${symbol}" ab heute (${today}) bis Ende ${year + 1}.

Antworte NUR mit einem JSON-Array (maximal 3 Einträge). Gib ein leeres Array [] zurück, wenn keine Termine bekannt sind.

[
  {
    "company": "Offizieller Firmenname",
    "date": "YYYY-MM-DD",
    "quarter": "Q1 ${year}",
    "epsEstimate": "1,82 $",
    "revenueEstimate": "94 Mrd. $",
    "timeOfDay": "nach Marktschluss"
  }
]

Regeln:
- timeOfDay: genau einer dieser Werte: "vor Marktöffnung" | "nach Marktschluss" | "unbekannt"
- Nur Termine nach ${today} aufnehmen
- Kein Text außer dem JSON-Array`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 400 },
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini HTTP ${response.status}`);
    }

    const data = await response.json();
    const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
    const parsed = JSON.parse(stripJsonFences(raw));
    return Array.isArray(parsed) ? parsed : [];

  } finally {
    clearTimeout(timer);
  }
}
