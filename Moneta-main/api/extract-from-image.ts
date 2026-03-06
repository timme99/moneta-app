import { GoogleGenAI } from "@google/genai";

/** Entfernt Markdown-Code-Fences aus der Gemini-Antwort, falls vorhanden. */
function stripJsonFences(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return m ? m[1].trim() : text.trim();
}

/**
 * POST /api/extract-from-image
 *
 * Empfängt ein Base64-kodiertes Bild oder PDF und nutzt Gemini Vision (gemini-2.5-flash)
 * zum Extrahieren von Börsenticker-Symbolen (OCR) oder Broker-Positionen (PDF).
 *
 * Body:     { imageBase64: string; mimeType?: string }
 * Response (image): { tickers: string[] }
 * Response (pdf):   { positions: Array<{ symbol: string; shares: number; price: number; name?: string }> }
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

    const isPdf = mimeType === 'application/pdf';

    const imagePrompt = `Du bist ein Börsen-Experte für Ticker-Symbole. Deine einzige Aufgabe: Extrahiere alle Aktien, ETFs und Fonds aus diesem Bild und gib AUSSCHLIESSLICH die offiziellen Börsenkürzel zurück.

KRITISCH: NIEMALS Firmennamen oder Wörter zurückgeben – nur Börsensymbole!
Übersetze Namen ZWINGEND in Kürzel:
  "Allianz" → "ALV.DE"
  "Mercedes", "Daimler" → "MBG.DE"
  "Volkswagen", "VW" → "VOW3.DE"
  "Apple" → "AAPL"
  "Microsoft" → "MSFT"
  "MSCI World" → "EUNL"
  "Vanguard All-World" → "VWRL"
  "S&P 500 ETF" → "SXR8"

Antworte NUR mit einem JSON-Array der Börsenkürzel – kein anderer Text:
["AAPL","ALV.DE","EUNL"]

Falls nichts Erkennbares im Bild: []`;

    const pdfPrompt = `Du bist ein Finanz-Experte. Analysiere diesen Broker-Kontoauszug oder Depot-PDF (Trade Republic, Scalable Capital, Comdirect, DKB oder ähnliche).

Extrahiere ALLE Wertpapier-Positionen und gib AUSSCHLIESSLICH ein JSON-Array zurück:
[{"symbol":"AAPL","shares":10,"price":150.25,"name":"Apple Inc."},{"symbol":"DE0008404005","shares":5,"price":220.00}]

Regeln:
- symbol: Börsenkürzel (z.B. "AAPL", "ALV.DE") ODER ISIN (z.B. "DE0008404005") – bevorzuge Börsenkürzel
- shares: Stückzahl als Zahl (Pflicht)
- price: Kaufpreis PRO STÜCK in EUR als Zahl (falls Gesamtbetrag: Betrag ÷ Stückzahl)
- name: Firmenname (optional)
- Nur tatsächliche Positionen/Käufe – keine Verkäufe, Dividenden oder Gebühren
- Falls kein Preis erkennbar: "price": null setzen
- Falls keine Positionen erkennbar: []

Antworte NUR mit dem JSON-Array – kein anderer Text!`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: isPdf ? pdfPrompt : imagePrompt },
            { inlineData: { mimeType: mimeType as string, data: imageBase64 } },
          ],
        },
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: isPdf ? 2048 : 512,
      },
    });

    if (isPdf) {
      // Parse broker positions from PDF
      let positions: Array<{ symbol: string; shares: number; price: number | null; name?: string }> = [];
      try {
        const parsed = JSON.parse(stripJsonFences(response.text ?? '[]'));
        positions = Array.isArray(parsed)
          ? parsed.filter((p: any) =>
              p && typeof p.symbol === 'string' && p.symbol.trim().length > 0 &&
              typeof p.shares === 'number' && p.shares > 0
            ).map((p: any) => ({
              symbol: String(p.symbol).trim(),
              shares: Number(p.shares),
              price: (typeof p.price === 'number' && p.price > 0) ? Number(p.price) : null,
              name: p.name ? String(p.name).trim() : undefined,
            }))
          : [];
      } catch {
        positions = [];
      }
      return res.status(200).json({ positions });
    }

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

