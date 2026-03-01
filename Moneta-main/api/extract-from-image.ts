import { GoogleGenAI } from "@google/genai";

/** Entfernt Markdown-Code-Fences aus der Gemini-Antwort, falls vorhanden. */
function stripJsonFences(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return m ? m[1].trim() : text.trim();
}

/**
 * POST /api/extract-from-image
 *
 * Empfängt ein Base64-kodiertes Bild und nutzt Gemini Vision (gemini-2.5-flash)
 * zum Extrahieren von Börsenticker-Symbolen (OCR).
 *
 * Body:     { imageBase64: string; mimeType?: string }
 * Response: { tickers: string[] }
 */
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Nur POST erlaubt.' });
  }

  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body ?? {};

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'imageBase64 fehlt oder ist ungültig.' });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return res.status(503).json({ error: 'GEMINI_API_KEY nicht konfiguriert.' });
    }

    const ai = new GoogleGenAI({ apiKey: geminiKey, httpOptions: { apiVersion: 'v1' } });

    const prompt = `Du bist ein OCR-Experte für Finanzdaten. Analysiere dieses Bild und extrahiere alle erkennbaren Börsenticker-Symbole, Unternehmensnamen, ISINs oder WKNs.

Antworte NUR mit einem JSON-Array der gefundenen Werte – kein anderer Text, keine Erklärungen:
["AAPL","MSFT","SAP"]

Falls keine Ticker erkennbar sind, antworte mit: []

Akzeptiere: US-Ticker (AAPL, MSFT), europäische Ticker (SAP.DE, MBG.DE), ETF-Ticker (EUNL, VWRL), vollständige Firmennamen (Apple, Microsoft) sowie ISINs (US0378331005) oder WKNs (865985).`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mimeType as string, data: imageBase64 } },
          ],
        },
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 512,
      },
    });

    let tickers: string[] = [];
    try {
      const parsed = JSON.parse(stripJsonFences(response.text ?? '[]'));
      tickers = Array.isArray(parsed)
        ? parsed.filter((t: any) => typeof t === 'string' && t.trim().length > 0)
        : [];
    } catch {
      tickers = [];
    }

    return res.status(200).json({ tickers });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[extract-from-image]', msg);
    return res.status(500).json({ error: 'Fehler beim Bild-Scan.', detail: msg });
  }
}

