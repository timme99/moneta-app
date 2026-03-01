import { GoogleGenAI } from "@google/genai";
import { getSupabaseAdmin } from '../lib/supabaseClient.js';
import type { InsertTables } from '../lib/supabase-types.js';

// Speicher für Rate-Limits (In-Memory, pro Nutzer/IP)
const limitStore = new Map<string, any>();

/** Limits pro Typ und Tag – über Umgebungsvariablen anpassbar (Kostenschutz). */
function getLimits(): Record<string, number> {
  return {
    analysis: Math.max(0, parseInt(process.env.GEMINI_LIMIT_ANALYSIS ?? '10', 10)),
    chat: Math.max(0, parseInt(process.env.GEMINI_LIMIT_CHAT ?? '30', 10)),
    news: Math.max(0, parseInt(process.env.GEMINI_LIMIT_NEWS ?? '15', 10)),
    resolve_ticker: Math.max(0, parseInt(process.env.GEMINI_LIMIT_RESOLVE_TICKER ?? '30', 10)),
  };
}

/** Optional: Gesamt-Anfragen pro Tag pro Nutzer (0 = deaktiviert). */
const DAILY_CAP = Math.max(0, parseInt(process.env.GEMINI_DAILY_CAP ?? '0', 10));

const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Speichert neu aufgelöste Ticker in die ticker_mapping-Tabelle (Server-seitig via Admin-Client).
 * Nutzt MONETA_SUPABASE_SERVICE_ROLE_KEY – bypasst RLS für den Schreibzugriff.
 */
async function upsertTickerMapping(tickers: Array<{
  ticker: string;
  company_name: string;
  sector?: string;
  industry?: string;
  description?: string;
  competitors?: string;
}>) {
  try {
    const supabase = getSupabaseAdmin();
    const rows: InsertTables<'ticker_mapping'>[] = tickers.map((t) => ({
      symbol:             t.ticker,
      company_name:       t.company_name,
      sector:             t.sector ?? null,
      industry:           t.industry ?? null,
      description_static: t.description ?? null,
      competitors:        t.competitors ?? null,
    }));
    const { error } = await supabase
      .from('ticker_mapping')
      .upsert(rows as any, { onConflict: 'symbol' });
    if (error) console.error('[gemini] ticker_mapping upsert:', error.message);
  } catch (e: any) {
    // Nicht-kritisch: Analyse läuft trotzdem weiter
    console.error('[gemini] ticker_mapping upsert Fehler:', e?.message);
  }
}

// ── News-Cache (DB, 6-Stunden-TTL) ───────────────────────────────────────────

const NEWS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Sortierte Ticker zu einem eindeutigen Cache-Key zusammenführen. */
function makeNewsCacheKey(tickers: string[]): string {
  return [...tickers].sort().map((t) => t.toUpperCase()).join(',');
}

/** Liefert gecachten News-Text oder null bei Cache-Miss / veraltetem Eintrag. */
async function getNewsFromCache(cacheKey: string): Promise<string | null> {
  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin
      .from('news_cache')
      .select('sentiment, summary, cached_at')
      .eq('ticker', cacheKey)
      .maybeSingle() as any;

    if (!data?.cached_at) return null;
    if (Date.now() - new Date(data.cached_at).getTime() > NEWS_CACHE_TTL_MS) return null;

    return JSON.stringify({ sentiment: data.sentiment, summary: data.summary, fromCache: true });
  } catch {
    return null; // Tabelle existiert noch nicht → graceful fallback
  }
}

/** Speichert Gemini-News-Ergebnis in der news_cache-Tabelle (fire & forget). */
async function saveNewsToCache(cacheKey: string, responseText: string): Promise<void> {
  try {
    let sentiment: string | null = null;
    let summary: string | null = null;
    try {
      const parsed = JSON.parse(responseText);
      sentiment = parsed.sentiment ?? parsed.overall_sentiment ?? null;
      summary   = parsed.summary   ?? parsed.text              ?? null;
      if (!summary) summary = responseText.slice(0, 2000);
    } catch {
      summary = responseText.slice(0, 2000);
    }
    const admin = getSupabaseAdmin();
    await admin
      .from('news_cache')
      .upsert(
        { ticker: cacheKey, sentiment, summary, cached_at: new Date().toISOString() } as any,
        { onConflict: 'ticker' }
      );
  } catch {
    // Nicht-kritisch: fehlgeschlagenes Caching bricht die Antwort nicht ab
  }
}

export default async function handler(req: any, res: any) {
  console.log("Check Key:", process.env.GEMINI_API_KEY ? "Vorhanden" : "FEHLT");

  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  // ── Auth-Check: CRON_SECRET oder regulärer User-Request ──────────────────
  const authHeader    = req.headers['authorization'] as string | undefined;
  const cronSecret    = process.env.CRON_SECRET;
  const isCronRequest = !!(cronSecret && cronSecret.length >= 16 && authHeader === `Bearer ${cronSecret}`);
  console.log("[MONETA] Auth-Typ:", isCronRequest ? "CRON (bypass)" : "USER (regulär)");
  // Kein harter Reject – die Route bleibt für alle offen; CRON überspringt Rate-Limits.

  try {

  const { type, payload, userId } = req.body ?? {};

  // req.socket kann in manchen Vercel-Umgebungen null sein → optional chaining
  const ip = req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'anonymous';

  const identifier = userId || ip;
  const now = Date.now();

  const LIMITS = getLimits();
  let userStats = limitStore.get(identifier);
  if (!userStats || (now - userStats.lastReset > WINDOW_MS)) {
    userStats = { analysis: 0, chat: 0, news: 0, resolve_ticker: 0, total: 0, lastReset: now };
  }

  const currentType = type as keyof typeof LIMITS;
  if (!(currentType in LIMITS)) return res.status(400).json({ error: 'Ungültiger Request-Typ' });

  const limitForType = LIMITS[currentType];
  if (!isCronRequest && limitForType > 0 && userStats[currentType] >= limitForType) {
    return res.status(429).json({
      error: `Tageslimit für ${type} erreicht.`,
      resetIn: Math.ceil((userStats.lastReset + WINDOW_MS - now) / 3600000),
    });
  }

  if (!isCronRequest && DAILY_CAP > 0 && userStats.total >= DAILY_CAP) {
    return res.status(429).json({
      error: 'Tageslimit für alle KI-Anfragen erreicht.',
      resetIn: Math.ceil((userStats.lastReset + WINDOW_MS - now) / 3600000),
    });
  }

  userStats[currentType]++;
  userStats.total = (userStats.total || 0) + 1;
  limitStore.set(identifier, userStats);

  const usagePercent = limitForType > 0 ? (userStats[currentType] / limitForType) * 100 : 0;
  const showWarning = limitForType > 0 && usagePercent >= 80;

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.error('[MONETA API] GEMINI_API_KEY ist nicht gesetzt.');
    return res.status(503).json({
      error: 'KI-Dienst nicht verfügbar – API-Key fehlt. Bitte GEMINI_API_KEY in den Umgebungsvariablen setzen.',
    });
  }
  console.log("[MONETA] Phase 1: Key vorhanden ✓");

  let ai: GoogleGenAI;
  try {
    ai = new GoogleGenAI({ apiKey: geminiKey, httpOptions: { apiVersion: 'v1beta' } });
    console.log("[MONETA] Phase 2: GoogleGenAI initialisiert ✓ (Modell: gemini-2.5-flash, API: v1beta)");
  } catch (error: any) {
    console.error('[MONETA INIT ERROR]', error);
    return res.status(500).json({ error: error.message, phase: "initialization" });
  }

  try {
    const modelName = 'gemini-2.5-flash'; // Gemini 2.5 Flash – v1 API
    console.log("[MONETA] Phase 3: Modell:", modelName, "| Typ:", type);
    let config = payload?.config;

    // Normalisierung: Gemini API erfordert role:"user"|"model" in jedem Content-Objekt.
    // Fehlendes role führt zu HTTP-400 und einem 500 beim Proxy.
    const normalizeContents = (raw: any[]): any[] =>
      raw.map((c: any) => ({
        role: c.role === 'model' ? 'model' : 'user',
        parts: Array.isArray(c.parts) ? c.parts : [{ text: String(c.parts ?? '') }],
      }));

    let contents = Array.isArray(payload?.contents)
      ? normalizeContents(payload.contents)
      : [];

    if (type === 'resolve_ticker') {
      const names = Array.isArray(payload?.names)
        ? payload.names
        : [String(payload?.names || '').trim()].filter(Boolean);
      // Erweiterter Prompt: Ticker + Metadaten für ticker_mapping-Upsert
      const prompt = `Wandle jede Bezeichnung in das offizielle Börsenticker-Symbol um und ergänze Metadaten.
Antworte NUR mit diesem JSON (kein anderer Text):
{"tickers":[{"name":"Original","ticker":"SYMBOL","company_name":"Vollständiger Firmenname","sector":"Sektor auf Englisch","industry":"Industrie auf Englisch","description":"Kurzbeschreibung auf Deutsch, max. 30 Wörter","competitors":"Kommagetrennte Hauptwettbewerber, z. B. MSFT, GOOGL"}]}

Bezeichnungen: ${names.join('; ')}
Beispiele: Apple→AAPL (Technology/Consumer Electronics), Microsoft→MSFT, Mercedes/Daimler→MBG.DE, MSCI World→EUNL, Vanguard All-World→VWRL.`;
      contents = [{ role: 'user', parts: [{ text: prompt }] }];
      config = { responseMimeType: 'application/json', temperature: 0.1 };
    }

    // News-Cache: DB-Treffer zurückgeben (6h TTL) wenn Tickers explizit übergeben
    if (type === 'news') {
      const tickersForCache = Array.isArray(payload?.tickers) ? (payload.tickers as string[]) : [];
      if (tickersForCache.length > 0) {
        const cacheKey = makeNewsCacheKey(tickersForCache);
        const cached = await getNewsFromCache(cacheKey);
        if (cached) {
          console.log('[MONETA] News aus Cache ✓ Key:', cacheKey);
          return res.status(200).json({
            text: cached,
            meta: { usage: 0, warning: null, fromCache: true },
          });
        }
      }
    }

    // Fallback: leerer contents-Array → sinnlose Anfrage vermeiden
    if (contents.length === 0) {
      return res.status(400).json({ error: 'Kein Inhalt für die KI-Anfrage übergeben.' });
    }
    console.log("[MONETA] Phase 4: Contents bereit | Anzahl:", contents.length, "| Erster Role:", contents[0]?.role);

    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config
    });

    let responseText = response.text || "";
    console.log("[MONETA] Phase 5: Antwort erhalten ✓ | Text-Länge:", responseText.length);

    // News-Ergebnis asynchron in DB cachen (fire & forget)
    if (type === 'news') {
      const tickersForCache = Array.isArray(payload?.tickers) ? (payload.tickers as string[]) : [];
      if (tickersForCache.length > 0) {
        saveNewsToCache(makeNewsCacheKey(tickersForCache), responseText).catch(() => {});
      }
    }

    if (type === 'resolve_ticker') {
      const parsed = JSON.parse(responseText);
      const tickers = parsed.tickers || [];

      // Neu aufgelöste Ticker in ticker_mapping speichern (awaited, damit Bulk-Import sie sofort findet)
      if (tickers.length > 0) {
        await upsertTickerMapping(tickers);
      }

      return res.status(200).json({
        text: responseText,
        tickers,
        meta: {
          usage: usagePercent,
          warning: showWarning ? `Achtung: Du hast ${userStats[currentType]}/${limitForType} deiner täglichen ${type}-Anfragen genutzt.` : null
        }
      });
    }

    // Sicherer Audit-Log ohne sensitive Inhalte
    console.log(`[MONETA AUDIT] ID: ${identifier.slice(0, 8)}... | Type: ${type} | Usage: ${usagePercent.toFixed(0)}%`);

    return res.status(200).json({
      text: responseText,
      meta: {
        usage: usagePercent,
        warning: showWarning ? `Achtung: Du hast ${userStats[currentType]}/${limitForType} deiner täglichen ${type}-Anfragen genutzt.` : null
      }
    });
  } catch (error: any) {
    const msg: string        = error?.message ?? '';
    const httpStatus: number = error?.status ?? error?.httpStatus ?? 0;
    const errorCode: string  = error?.code    ?? error?.errorCode ?? '';

    // ── Detailliertes Logging: Quelle, Status, Nachricht ─────────────────────
    console.error('[MONETA GEMINI ERROR]', {
      source:    'Gemini API Call',
      type,
      httpStatus,
      errorCode,
      message:   msg,
      errorType: error?.constructor?.name ?? '',
      stack:     error?.stack?.split('\n').slice(0, 4).join(' | ') ?? '',
    });

    // ── Auth-Fehler: NUR echter Key-/Permission-Fehler (401/403) ─────────────
    // 400 = Bad Request (Konfiguration) → KEIN Auth-Fehler!
    // 'not found' = Modell/Ressource nicht gefunden → KEIN Auth-Fehler!
    const isGeminiAuthError =
      httpStatus === 401 ||
      httpStatus === 403 ||
      msg.toLowerCase().includes('api key not valid') ||
      msg.toLowerCase().includes('api_key_invalid')   ||
      msg.toLowerCase().includes('invalid api key')   ||
      msg.toLowerCase().includes('api key expired')   ||
      (msg.toLowerCase().includes('permission') && !msg.toLowerCase().includes('not found'));

    if (isGeminiAuthError) {
      console.error('[MONETA] → Ursache: API-Key ungültig oder API nicht aktiviert (HTTP', httpStatus, ')');
      return res.status(401).json({
        error:   `Gemini API-Key-Fehler (HTTP ${httpStatus}): ${msg}`,
        hint:    'GEMINI_API_KEY in Vercel prüfen und sicherstellen, dass "Generative Language API" in der Google Cloud Console aktiviert ist.',
        source:  'google_auth',
      });
    }

    // ── Modell nicht verfügbar / Bad Request ─────────────────────────────────
    if (httpStatus === 400 || httpStatus === 404) {
      console.error('[MONETA] → Ursache: Modell/Konfigurationsfehler (HTTP', httpStatus, ')');
      return res.status(502).json({
        error:  `Gemini Modell-/Konfigurationsfehler (HTTP ${httpStatus}): ${msg}`,
        source: 'google_model',
      });
    }

    // ── Alle anderen Fehler ───────────────────────────────────────────────────
    return res.status(500).json({
      error:    'KI-Schnittstelle: unerwarteter Fehler.',
      message:  msg,
      httpStatus,
      source:   'google_api',
    });
  }

  } catch (error: any) {
    console.error('[MONETA OUTER ERROR]', error);
    return res.status(500).json({
      message: error?.message,
      stack: error?.stack,
      location: "API Route",
    });
  }
}
