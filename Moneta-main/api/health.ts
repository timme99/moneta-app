/**
 * api/health.ts
 *
 * Diagnose-Endpoint: Prüft alle kritischen Konfigurationen und gibt
 * einen strukturierten Status zurück.
 *
 * Aufruf: GET https://<deine-app>.vercel.app/api/health
 */

import { GoogleGenAI } from '@google/genai';

export default async function handler(req: any, res: any) {
  const results: Record<string, { ok: boolean; message: string }> = {};

  // ── 1. Env-Variablen-Check ─────────────────────────────────────────────────
  const requiredVars = [
    'GEMINI_API_KEY',
    'MONETA_SUPABASE_URL',
    'MONETA_SUPABASE_ANON_KEY',
    'MONETA_SUPABASE_SERVICE_ROLE_KEY',
    'RAPIDAPI_KEY',
  ];

  for (const v of requiredVars) {
    const val = process.env[v];
    results[`env_${v}`] = val
      ? { ok: true,  message: `gesetzt (${val.slice(0, 6)}…)` }
      : { ok: false, message: 'FEHLT – bitte in Vercel setzen' };
  }

  // ── 2. Gemini API-Key Test ─────────────────────────────────────────────────
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: 'Antworte nur: OK' }] }],
      });
      const text = response.text ?? '';
      results['gemini_api'] = {
        ok: true,
        message: `Verbindung OK – Antwort: "${text.slice(0, 50)}"`,
      };
    } catch (e: any) {
      results['gemini_api'] = {
        ok: false,
        message: `Fehler: ${e?.message ?? 'unbekannt'} (HTTP ${e?.status ?? '?'})`,
      };
    }
  } else {
    results['gemini_api'] = { ok: false, message: 'GEMINI_API_KEY nicht gesetzt' };
  }

  // ── 3. Supabase URL-Format prüfen ──────────────────────────────────────────
  const supabaseUrl = process.env.MONETA_SUPABASE_URL ?? '';
  if (supabaseUrl) {
    const valid = supabaseUrl.startsWith('https://') && supabaseUrl.includes('.supabase.co');
    results['supabase_url_format'] = valid
      ? { ok: true,  message: 'URL-Format korrekt' }
      : { ok: false, message: `Unerwartetes Format: "${supabaseUrl.slice(0, 40)}"` };
  }

  // ── Zusammenfassung ────────────────────────────────────────────────────────
  const allOk = Object.values(results).every((r) => r.ok);

  return res.status(allOk ? 200 : 500).json({
    status: allOk ? 'OK' : 'FEHLER',
    checks: results,
    hint: allOk
      ? 'Alle Prüfungen bestanden.'
      : 'Bitte die fehlgeschlagenen Checks beheben und Vercel redeployen.',
  });
}
