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

    const imagePrompt = `Du bist ein Finanz-Experte. Analysiere dieses Bild und extrahiere alle sichtbaren Aktien, ETFs und Fonds.

Antworte NUR mit einem JSON-Array. Für jede Position ein Objekt:
- Falls du das Börsenkürzel sicher kennst: { "ticker": "AAPL" }
- Falls nur der Name sichtbar ist:         { "name": "RTL Group" }

Bekannte Kürzel (Pflichtliste):
Allianz→ALV.DE, Mercedes/Daimler→MBG.DE, VW/Volkswagen→VOW3.DE, SAP→SAP.DE,
Deutsche Bank→DBK.DE, Deutsche Telekom→DTE.DE, Siemens→SIE.DE, BASF→BAS.DE,
BMW→BMW.DE, Bayer→BAYN.DE, Münchener Rück→MUV2.DE, Infineon→IFX.DE,
Beiersdorf→BEI.DE, Puma→PUM.DE, RTL Group→RRTL.DE,
Apple→AAPL, Microsoft→MSFT, Amazon→AMZN, Google/Alphabet→GOOGL, Tesla→TSLA,
Barrick Gold→GOLD, Deutsche Bank→DBK.DE,
iShares Core MSCI World/EUNL→EUNL, iShares Core S&P 500→SXR8,
Vanguard FTSE All-World→VWRL, MSCI World ETF→EUNL,
Core MSCI EM IMI→IS3N.DE, iShares MSCI EM IMI→IS3N.DE,
Russell 2000→ZPRR.DE oder IWM, MSCI Robotics→2B76.DE

Beispiel-Output:
[{ "ticker": "AAPL" }, { "ticker": "ALV.DE" }, { "name": "Core MSCI EM IMI USD" }]

Falls nichts erkennbar: []
Kein anderer Text außer dem JSON-Array.`;

    const pdfPrompt = `Du bist ein Finanz-Experte. Analysiere diesen Broker-Depotauszug oder Kontoauszug (Trade Republic, Scalable Capital, Comdirect, DKB, ING oder ähnliche).

Extrahiere ALLE Wertpapier-Positionen und gib AUSSCHLIESSLICH ein JSON-Array zurück.

KRITISCH – Zahlenformat:
- Alle Zahlen MÜSSEN mit Punkt als Dezimaltrennzeichen angegeben werden (JSON-Standard)
- FALSCH: "shares": "0,784621" oder 0,784621
- RICHTIG: "shares": 0.784621
- Deutsche Komma-Schreibweise (z.B. "82,12" oder "0,784621") in Punkt umrechnen!

Format jeder Position:
{"symbol":"ISIN_ODER_KÜRZEL","shares":0.784621,"price":82.12,"name":"Firmenname"}

Regeln:
- symbol: ISIN (z.B. "DE0005200000") WENN kein Ticker bekannt, sonst Börsenkürzel (z.B. "BEI.DE")
- shares: Stückzahl/Nominale als Dezimalzahl MIT PUNKT (Pflicht, > 0)
- price: Kurs pro Stück als Dezimalzahl MIT PUNKT (Spalte "Kurs pro Stück" oder "Kurs")
  Falls nur Gesamtwert bekannt: Gesamtwert ÷ Stückzahl rechnen
- name: Wertpapierbezeichnung (optional aber hilfreich)
- Alle aktuellen Depot-Positionen einschließen
- Falls keine Positionen erkennbar: []

Beispiel Trade Republic:
[
  {"symbol":"DE0005200000","shares":0.784621,"price":82.12,"name":"Beiersdorf AG"},
  {"symbol":"IE00B4L5Y983","shares":13.612357,"price":113.00,"name":"iShares Core MSCI World"}
]

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
      // Normalise a raw value that may be a German-decimal string ("0,784621") or a number
      const toNum = (v: unknown): number => {
        if (typeof v === 'number') return v;
        const s = String(v ?? '').replace(',', '.').replace(/[^0-9.-]/g, '');
        return parseFloat(s) || 0;
      };

      let positions: Array<{ symbol: string; shares: number; price: number | null; name?: string }> = [];
      try {
        const parsed = JSON.parse(stripJsonFences(response.text ?? '[]'));
        positions = Array.isArray(parsed)
          ? parsed
              .filter((p: any) => p && typeof p.symbol === 'string' && p.symbol.trim().length > 0)
              .map((p: any) => {
                const shares = toNum(p.shares);
                const price  = p.price != null ? toNum(p.price) : null;
                return {
                  symbol: String(p.symbol).trim(),
                  shares,
                  price:  price && price > 0 ? price : null,
                  name:   p.name ? String(p.name).trim() : undefined,
                };
              })
              .filter((p: any) => p.shares > 0)
          : [];
      } catch {
        positions = [];
      }
      return res.status(200).json({ positions });
    }

    // Image: new format returns [{ ticker }, { name }] mixed array
    let tickers: string[] = [];
    let names: string[] = [];
    try {
      const parsed = JSON.parse(stripJsonFences(response.text ?? '[]'));
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'string') {
            // Legacy: plain string array
            const t = item.trim();
            if (t) tickers.push(t);
          } else if (item && typeof item === 'object') {
            const ticker = item.ticker?.trim();
            const name   = item.name?.trim();
            if (ticker) tickers.push(ticker);
            else if (name) names.push(name);
          }
        }
      }
    } catch {
      tickers = []; names = [];
    }

    return res.status(200).json({ tickers, names });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[extract-from-image]', msg);
    return res.status(500).json({ error: 'Fehler beim Bild-Scan.', detail: msg });
  }
}

