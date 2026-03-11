import { GoogleGenAI } from "@google/genai";

/** Entfernt Markdown-Code-Fences aus der Gemini-Antwort, falls vorhanden. */
function stripJsonFences(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return m ? m[1].trim() : text.trim();
}

/**
 * POST /api/extract-from-image
 *
 * Empfängt ein Base64-kodiertes Bild, PDF oder einen CSV-Rohtext und nutzt Gemini Vision
 * zum Extrahieren von Börsenticker-Symbolen (OCR) oder Broker-Positionen (PDF/CSV).
 *
 * Body:     { imageBase64: string; mimeType?: string }
 *   - mimeType 'text/csv':        imageBase64 enthält den rohen CSV-Text (kein Base64)
 *   - mimeType 'application/pdf': imageBase64 ist Base64-kodiertes PDF
 *   - sonstige mimeType:          imageBase64 ist Base64-kodiertes Bild
 *
 * Response (image): { tickers: string[] }
 * Response (pdf/csv): { positions: Array<{ symbol: string; isin: string; shares: number; price: number | null; name?: string }> }
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
    const isCsv = mimeType === 'text/csv';

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

    const brokerPrompt = `Extrahiere Investment-Daten aus diesem Dokument (Bild/PDF/CSV). WICHTIG:
1. Erkenne Bruchstücke (z.B. 0.784621). Konvertiere deutsche Kommas immer in Punkte (0,78 -> 0.78).
2. Extrahiere die ISIN (z.B. DE0005200000).
3. Finde zusätzlich den passenden Börsen-Ticker (z.B. BEI.DE oder IWDA).
4. Gib ein sauberes JSON-Array zurück mit: name, symbol (Ticker), isin, quantity (Zahl), averagePrice (Zahl).

Beispiel-Ausgabe:
[{"name":"Beiersdorf AG","symbol":"BEI.DE","isin":"DE0005200000","quantity":0.784621,"averagePrice":134.50}]

Regeln:
- symbol: Börsen-Ticker (z.B. "AAPL", "BEI.DE") – leer lassen falls nicht erkennbar
- isin: 12-stelliger ISIN-Code (z.B. "DE0005200000") – leer lassen falls nicht vorhanden
- quantity: Stückzahl als Dezimalzahl (Bruchstücke erlaubt!)
- averagePrice: Kaufpreis PRO STÜCK in EUR (falls Gesamtbetrag: Betrag ÷ Stückzahl)
- name: Firmenname (optional)
- Nur tatsächliche Positionen/Käufe – keine Verkäufe, Dividenden oder Gebühren
- Falls kein Preis erkennbar: "averagePrice": 0 setzen
- Falls keine Positionen erkennbar: []

Antworte NUR mit dem JSON-Array – kein anderer Text!`;

    let response: any;

    if (isCsv) {
      // CSV: imageBase64 enthält den rohen Text – kein inlineData nötig
      const csvText = imageBase64;
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { text: `${brokerPrompt}\n\nCSV-Inhalt:\n${csvText}` },
            ],
          },
        ],
        config: {
          temperature: 0.1,
          maxOutputTokens: 2048,
        },
      });
    } else {
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { text: isPdf ? brokerPrompt : imagePrompt },
              { inlineData: { mimeType: mimeType as string, data: imageBase64 } },
            ],
          },
        ],
        config: {
          temperature: 0.1,
          maxOutputTokens: isPdf ? 2048 : 512,
        },
      });
    }

    if (isPdf || isCsv) {
      // Parse broker positions from PDF or CSV
      let positions: Array<{ symbol: string; isin: string; shares: number; price: number | null; name?: string }> = [];
      try {
        const parsed = JSON.parse(stripJsonFences(response.text ?? '[]'));
        positions = Array.isArray(parsed)
          ? parsed
              .map((p: any) => ({
                symbol:   String(p.symbol   ?? '').trim(),
                isin:     String(p.isin     ?? '').trim(),
                // Accept both old field names (shares/price) and new (quantity/averagePrice)
                shares:   Number(p.quantity   ?? p.shares   ?? 0),
                price:    (Number(p.averagePrice ?? p.price ?? 0) > 0)
                            ? Number(p.averagePrice ?? p.price)
                            : null,
                name:     p.name ? String(p.name).trim() : undefined,
              }))
              .filter((p: any) => (p.symbol || p.isin) && p.shares > 0)
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
