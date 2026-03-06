import { GoogleGenAI } from "@google/genai";
import * as XLSX from "xlsx";

/** Strip markdown code fences from Gemini output */
function stripJsonFences(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return m ? m[1].trim() : text.trim();
}

type ImportPosition = {
  symbol: string;
  shares: number;
  price: number | null;
  name?: string;
};

/** Universal prompt for text/structured data (CSV rows, Excel JSON, PDF text) */
const STRUCTURED_PROMPT = `You are a financial data expert. Analyze this broker data (could be CSV rows, spreadsheet data, or extracted text from a bank statement / depot overview).

Identify ALL stock, ETF, and fund positions. Intelligently determine which fields represent:
- The stock symbol, ticker, or ISIN (e.g. "AAPL", "ALV.DE", "DE0008404005")
- The number of shares / units held
- The average buy price per share in EUR (if present)

Return ONLY a JSON array – no other text, no markdown:
[{"symbol":"AAPL","shares":10,"price":150.25,"name":"Apple Inc."},{"symbol":"ALV.DE","shares":5,"price":220.00}]

Rules:
- symbol: stock ticker (preferred) or ISIN – mandatory, no empty strings
- shares: quantity as a positive number – mandatory
- price: average buy price per share in EUR as a number, or null if unavailable
- name: company name (optional)
- Include only actual holdings / buy positions (skip sells, dividends, fees, cash balances)
- Aggregate multiple buy rows of the same symbol into a single weighted-average position
- If no valid positions are found: []`;

/** Prompt for screenshot / camera images – returns ticker symbols only */
const IMAGE_PROMPT = `Du bist ein Börsen-Experte für Ticker-Symbole. Extrahiere alle Aktien, ETFs und Fonds aus diesem Bild.

KRITISCH: Gib NUR die offiziellen Börsenkürzel zurück – keine Firmennamen!
Übersetze Namen zwingend in Ticker:
  "Allianz" → "ALV.DE"   "Mercedes" / "Daimler" → "MBG.DE"
  "Apple" → "AAPL"       "Microsoft" → "MSFT"
  "MSCI World" → "EUNL"  "Vanguard All-World" → "VWRL"   "S&P 500 ETF" → "SXR8"

Antworte NUR mit einem JSON-Array der Börsenkürzel – kein anderer Text:
["AAPL","ALV.DE","EUNL"]

Falls nichts erkennbar: []`;

/**
 * POST /api/import/process
 *
 * Universal import endpoint for images, PDFs, CSV, and Excel files.
 *
 * Body:   { data: string (base64), mimeType: string, fileName?: string }
 *
 * Response (image):    { tickers: string[] }
 * Response (pdf/csv/excel): { positions: ImportPosition[] }
 */
export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Nur POST erlaubt." });
  }

  try {
    const { data, mimeType = "image/jpeg", fileName = "" } = req.body ?? {};

    if (!data || typeof data !== "string") {
      return res.status(400).json({ error: "data (base64) fehlt oder ist ungültig." });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return res.status(503).json({ error: "GEMINI_API_KEY nicht konfiguriert." });
    }

    const name = (fileName as string).toLowerCase();
    const isImage = (mimeType as string).startsWith("image/");
    const isPdf   = mimeType === "application/pdf";
    const isCsv   = mimeType === "text/csv" || mimeType === "text/plain" || name.endsWith(".csv");
    const isExcel = /\.(xlsx|xls)$/i.test(name) ||
                    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                     "application/vnd.ms-excel"].includes(mimeType as string);

    const ai = new GoogleGenAI({ apiKey: geminiKey, httpOptions: { apiVersion: "v1" } });

    // ── CSV / Excel → parse to text, then Gemini text prompt ─────────────────
    if (isCsv || isExcel) {
      const buffer = Buffer.from(data, "base64");
      let textContent: string;

      if (isCsv) {
        // Detect delimiter (German exports often use semicolons)
        const raw = buffer.toString("utf-8");
        const firstLine = raw.split("\n")[0] ?? "";
        const commas = (firstLine.match(/,/g) ?? []).length;
        const semis  = (firstLine.match(/;/g) ?? []).length;
        // Re-parse with correct delimiter via XLSX for consistency
        const wb = XLSX.read(raw, { type: "string", FS: semis > commas ? ";" : "," });
        const ws = wb.Sheets[wb.SheetNames[0]];
        textContent = JSON.stringify(XLSX.utils.sheet_to_json(ws, { defval: "" }).slice(0, 300));
      } else {
        // Excel → JSON rows
        const wb = XLSX.read(buffer, { type: "buffer" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        textContent = JSON.stringify(XLSX.utils.sheet_to_json(ws, { defval: "" }).slice(0, 300));
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: `${STRUCTURED_PROMPT}\n\nData:\n${textContent}` }] }],
        config: { temperature: 0.1, maxOutputTokens: 2048 },
      });

      const positions = parsePositions(response.text ?? "[]");
      return res.status(200).json({ positions });
    }

    // ── Image → Gemini Vision, returns ticker array (watchlist) ──────────────
    if (isImage) {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          role: "user",
          parts: [
            { text: IMAGE_PROMPT },
            { inlineData: { mimeType: mimeType as string, data: data as string } },
          ],
        }],
        config: { temperature: 0.1, maxOutputTokens: 512 },
      });

      let tickers: string[] = [];
      try {
        const parsed = JSON.parse(stripJsonFences(response.text ?? "[]"));
        tickers = Array.isArray(parsed)
          ? parsed.filter((t: any) => typeof t === "string" && t.trim().length > 0)
          : [];
      } catch { tickers = []; }

      return res.status(200).json({ tickers });
    }

    // ── PDF → Gemini Vision with structured prompt, returns positions ─────────
    if (isPdf) {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          role: "user",
          parts: [
            { text: STRUCTURED_PROMPT },
            { inlineData: { mimeType: "application/pdf", data: data as string } },
          ],
        }],
        config: { temperature: 0.1, maxOutputTokens: 2048 },
      });

      const positions = parsePositions(response.text ?? "[]");
      return res.status(200).json({ positions });
    }

    return res.status(400).json({ error: `Nicht unterstützter Dateityp: ${mimeType}` });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[import/process]", msg);
    return res.status(500).json({ error: "Import fehlgeschlagen.", detail: msg });
  }
}

function parsePositions(raw: string): ImportPosition[] {
  try {
    const parsed = JSON.parse(stripJsonFences(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p: any) =>
        p &&
        typeof p.symbol === "string" && p.symbol.trim().length > 0 &&
        typeof p.shares === "number" && p.shares > 0
      )
      .map((p: any) => ({
        symbol: String(p.symbol).trim(),
        shares: Number(p.shares),
        price: typeof p.price === "number" && p.price > 0 ? Number(p.price) : null,
        name:   p.name ? String(p.name).trim() : undefined,
      }));
  } catch {
    return [];
  }
}
