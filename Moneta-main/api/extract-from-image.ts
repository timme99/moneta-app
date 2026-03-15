import { GoogleGenAI } from "@google/genai";

/** Entfernt Markdown-Code-Fences aus der Gemini-Antwort, falls vorhanden. */
function stripJsonFences(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return m ? m[1].trim() : text.trim();
}

/**
 * Konvertiert Gemini-Zahlenwerte robust zu float.
 * Behandelt deutsche Komma-Dezimaltrenner ("13,612357" → 13.612357)
 * und verhindert NaN-Werte, die Positionen stumm herausfiltern würden.
 */
function toFloat(v: any): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = String(v ?? '').replace(',', '.').replace(/[^\d.]/g, '');
  return parseFloat(s) || 0;
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


    const brokerPrompt = `Extrahiere Investment-Daten aus diesem Dokument (Bild/PDF/CSV). WICHTIG:
1. Erkenne Bruchstücke (z.B. 0.784621 oder "13,612357"). Konvertiere ALLE deutschen Kommas zu Punkten (13,612357 → 13.612357). Gib Zahlen IMMER als JSON-Number aus, niemals als String.
2. Extrahiere die ISIN falls vorhanden (z.B. "IE00B4L5Y983") – schreibe sie ins Feld "isin".
3. Finde den Yahoo Finance Ticker (z.B. "IWDA.AS" für Amsterdam, "EUNL.DE" für XETRA, "AAPL" für NASDAQ). Schreibe NUR den Ticker ins Feld "symbol" – NIEMALS die ISIN dort eintragen!
4. Gib ein JSON-Array zurück mit: name (string), symbol (Ticker, string), isin (string), quantity (Zahl), averagePrice (Zahl pro Stück).

Beispiel-Ausgabe:
[{"name":"iShares MSCI World","symbol":"IWDA.AS","isin":"IE00B4L5Y983","quantity":13.612357,"averagePrice":89.34}]

Regeln:
- symbol: Börsen-Ticker im Yahoo Finance Format – z.B. "BEI.DE", "AAPL", "IWDA.AS". Leer lassen ("") wenn wirklich nicht erkennbar.
- isin: 12-stelliger Code wie "IE00B4L5Y983". Leer lassen ("") wenn nicht vorhanden.
- quantity: Dezimalzahl mit Punkt (z.B. 13.612357). Kein String, kein Komma!
- averagePrice: Kaufpreis PRO STÜCK. Falls nur Gesamtbetrag: Betrag ÷ quantity. 0 wenn nicht erkennbar.
- Nur echte Positionen/Käufe – keine Verkäufe, Dividenden, Gebühren.
- Falls keine Positionen: []

Antworte NUR mit dem JSON-Array!`;

    let response: any;

    if (isCsv) {
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: `${brokerPrompt}\n\nCSV-Inhalt:\n${imageBase64}` }] }],
        config: { temperature: 0.1, maxOutputTokens: 2048 },
      });
    } else {
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [
          { text: brokerPrompt },
          { inlineData: { mimeType: mimeType as string, data: imageBase64 } },
        ]}],
        config: { temperature: 0.1, maxOutputTokens: 2048 },
      });
    }

    let positions: Array<{ symbol: string; isin: string; shares: number; price: number | null; name?: string }> = [];
    try {
      const parsed = JSON.parse(stripJsonFences(response.text ?? '[]'));
      positions = Array.isArray(parsed)
        ? parsed
            .map((p: any) => ({
              symbol: String(p.symbol ?? '').trim(),
              isin:   String(p.isin   ?? '').trim(),
              shares: toFloat(p.quantity ?? p.shares),
              price:  toFloat(p.averagePrice ?? p.price) || null,
              name:   p.name ? String(p.name).trim() : undefined,
            }))
            .filter((p: any) => p.symbol || p.isin)
        : [];
    } catch {
      positions = [];
    }
    console.log('[extract-from-image] KI Ergebnis:', JSON.stringify(positions));
    return res.status(200).json({ positions });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[extract-from-image]', msg);
    return res.status(500).json({ error: 'Fehler beim Bild-Scan.', detail: msg });
  }
}
