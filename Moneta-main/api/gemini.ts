import { GoogleGenAI } from "@google/genai";
import { getSupabaseAdmin } from '../lib/supabaseClient';

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
    const rows = tickers.map((t) => ({
      symbol:             t.ticker,
      company_name:       t.company_name,
      sector:             t.sector ?? null,
      industry:           t.industry ?? null,
      description_static: t.description ?? null,
      competitors:        t.competitors ?? null,
    }));
    const { error } = await supabase
      .from('ticker_mapping')
      .upsert(rows, { onConflict: 'symbol', ignoreDuplicates: false });
    if (error) console.error('[gemini] ticker_mapping upsert:', error.message);
  } catch (e: any) {
    // Nicht-kritisch: Analyse läuft trotzdem weiter
    console.error('[gemini] ticker_mapping upsert Fehler:', e?.message);
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const { type, payload, userId } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'anonymous';

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
  if (limitForType > 0 && userStats[currentType] >= limitForType) {
    return res.status(429).json({
      error: `Tageslimit für ${type} erreicht.`,
      resetIn: Math.ceil((userStats.lastReset + WINDOW_MS - now) / 3600000),
    });
  }

  if (DAILY_CAP > 0 && userStats.total >= DAILY_CAP) {
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

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

  try {
    const modelName = 'gemini-3-pro-preview';
    let contents = payload.contents;
    let config = payload.config;

    if (type === 'resolve_ticker') {
      const names = Array.isArray(payload.names) ? payload.names : [String(payload.names || '').trim()].filter(Boolean);
      // Erweiterter Prompt: Ticker + Metadaten für ticker_mapping-Upsert
      const prompt = `Wandle jede Bezeichnung in das offizielle Börsenticker-Symbol um und ergänze Metadaten.
Antworte NUR mit diesem JSON (kein anderer Text):
{"tickers":[{"name":"Original","ticker":"SYMBOL","company_name":"Vollständiger Firmenname","sector":"Sektor auf Englisch","industry":"Industrie auf Englisch","description":"Kurzbeschreibung auf Deutsch, max. 30 Wörter","competitors":"Kommagetrennte Hauptwettbewerber, z. B. MSFT, GOOGL"}]}

Bezeichnungen: ${names.join('; ')}
Beispiele: Apple→AAPL (Technology/Consumer Electronics), Microsoft→MSFT, Mercedes/Daimler→MBG.DE, MSCI World→EUNL, Vanguard All-World→VWRL.`;
      contents = [{ parts: [{ text: prompt }] }];
      config = { responseMimeType: 'application/json', temperature: 0.1 };
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config
    });

    let responseText = response.text || "";

    if (type === 'resolve_ticker') {
      const parsed = JSON.parse(responseText);
      const tickers = parsed.tickers || [];

      // Neu aufgelöste Ticker asynchron in ticker_mapping speichern (fire & forget)
      if (tickers.length > 0) {
        upsertTickerMapping(tickers).catch(() => {});
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
    // Verhindert das Loggen des kompletten Fehler-Objekts (welches den Request-Payload enthalten könnte)
    console.error(`[MONETA API ERROR] Type: ${type} | Message: ${error.message}`);
    return res.status(500).json({ error: 'KI-Schnittstelle überlastet oder Fehler bei der Verarbeitung.' });
  }
}
