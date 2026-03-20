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


    const brokerPrompt = `Du bist ein Finanz-Daten-Extraktor. Analysiere das folgende Dokument und extrahiere ALLE Investment-Positionen (Aktien, ETFs, Fonds).

═══ SCHRITT 1: SPALTEN DURCH INHALT ERKENNEN ═══
Ignoriere zunächst die Spaltenüberschriften. Analysiere den ZELLENINHALT jeder Spalte:

• Firmennamen / ETF-Bezeichnungen (z. B. "Apple Inc.", "iShares MSCI World", "Volkswagen") → name
• Ticker-Kürzel (z. B. "AAPL", "SAP", "EUNL.DE", "BEI.DE") → symbol (Yahoo Finance Format)
• ISIN-Codes (2 Großbuchstaben + 10 Zeichen, z. B. "IE00B4L5Y983") → isin
• WKN-Codes (genau 6 alphanumerische Zeichen, z. B. "716460", "A0F602"):
  WKN NIEMALS direkt als symbol eintragen! Leite den Yahoo-Ticker daraus ab.
  Wenn nicht sicher: isin-Feld nutzen oder symbol leer lassen, name IMMER befüllen.
• Ganze Zahlen oder Dezimalzahlen typisch für Stückzahlen (1–100.000) → shares
• Preise / Kurswerte (typisch 5–5.000, z. B. "89,34", "1.234,56") → buy_price
• Gesamtwerte (größere Beträge) → Gesamtbetrag → buy_price = Gesamtbetrag ÷ shares
• Datumsangaben (DD.MM.YYYY, YYYY-MM-DD, MM/DD/YYYY) → buy_date

Bekannte Spaltenbezeichnungen (als Hilfe, nicht als Pflicht):
  Stück / Nominal / Anzahl / Qty / Bestand / Menge / Units    → shares
  Einstand / Einstandskurs / Kaufkurs / Kaufpreis / Kurs / Preis / Avg Price → buy_price
  Bezeichnung / Name / Wertpapier / Titel / Aktie / Security  → name
  Ticker / Symbol / Kürzel / WKN                               → symbol
  ISIN                                                          → isin
  Kaufdatum / Datum / Date / Trade Date                        → buy_date

═══ SCHRITT 2: YAHOO FINANCE TICKER ABLEITEN ═══
Nutze dein Wissen um aus Firmennamen den Yahoo Finance Ticker abzuleiten:
  "Apple" / "Apple Inc."           → "AAPL"
  "SAP" / "SAP SE"                 → "SAP.DE"
  "iShares MSCI World"             → "IWDA.AS"  (oder "EUNL.DE" je nach ISIN)
  "Volkswagen" / "VW"              → "VOW3.DE"
  "Tesla"                          → "TSLA"
  "Microsoft"                      → "MSFT"
  "Allianz"                        → "ALV.DE"
  "Deutsche Telekom"               → "DTE.DE"
  Bei ISIN vorhanden: Ticker daraus ableiten
  Bei Unsicherheit: symbol = "" lassen, name IMMER befüllen

═══ AUSGABE-FORMAT ═══
Exakt diese JSON-Keys verwenden:
  "name"      → Wertpapiername (immer ausfüllen wenn erkennbar)
  "symbol"    → Yahoo Finance Ticker oder "" wenn unklar
  "isin"      → ISIN-Code oder ""
  "shares"    → Stückzahl als Zahl (0 wenn nicht vorhanden)
  "buy_price" → Einstandskurs PRO STÜCK als Zahl (0 wenn nicht vorhanden)
  "buy_date"  → ISO YYYY-MM-DD oder ""

ZAHLENFORMAT:
- Deutsche Kommas zu Punkten: "1.200,50" → 1200.50, "89,34" → 89.34
- Zahlen immer als JSON-Number, NIEMALS als String
- Währungssymbole (€, $) und Tausendertrennzeichen entfernen

Beispiel-Ausgabe:
[{"name":"iShares MSCI World","symbol":"IWDA.AS","isin":"IE00B4L5Y983","shares":13.612357,"buy_price":89.34,"buy_date":"2023-04-15"},{"name":"Apple Inc.","symbol":"AAPL","isin":"","shares":10,"buy_price":150.00,"buy_date":""}]

REGELN:
- Jeden erkennbaren Wertpapier-Eintrag ausgeben – auch wenn nur name ODER nur symbol bekannt ist
- Nur echte Bestands-Positionen (keine Verkäufe, Dividenden, Gebühren, Summenzeilen)
- NIEMALS ISIN als symbol eintragen wenn ein Ticker erkennbar ist
- Falls wirklich nichts erkennbar ist: []

Antworte NUR mit dem JSON-Array – kein anderer Text!`;

    let response: any;

    if (isCsv) {
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: `${brokerPrompt}\n\nCSV-Inhalt:\n${imageBase64}` }] }],
        config: { temperature: 0.1, maxOutputTokens: 8192 },
      });
    } else {
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [
          { text: brokerPrompt },
          { inlineData: { mimeType: mimeType as string, data: imageBase64 } },
        ]}],
        config: { temperature: 0.1, maxOutputTokens: 8192 },
      });
    }

    const rawText = response.text ?? '';
    let positions: Array<{ symbol: string; isin: string; shares: number; price: number | null; name?: string; buy_date?: string }> = [];
    let parseError: string | undefined;
    try {
      const parsed = JSON.parse(stripJsonFences(rawText));
      positions = Array.isArray(parsed)
        ? parsed
            .map((p: any) => ({
              symbol:   String(p.symbol ?? '').trim(),
              isin:     String(p.isin   ?? '').trim(),
              shares:   toFloat(p.shares    ?? p.quantity),
              price:    toFloat(p.buy_price ?? p.averagePrice ?? p.price) || null,
              name:     p.name     ? String(p.name).trim()     : undefined,
              buy_date: p.buy_date ? String(p.buy_date).trim() : undefined,
            }))
            .filter((p: any) => p.symbol || p.isin || p.name)
        : [];
    } catch (e) {
      parseError = String(e);
      positions = [];
    }
    if (parseError) console.warn('[extract-from-image] parse error:', parseError);
    return res.status(200).json({ positions });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[extract-from-image]', msg);
    return res.status(500).json({ error: 'Fehler beim Bild-Scan.', detail: msg });
  }
}
