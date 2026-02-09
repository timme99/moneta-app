
import { GoogleGenAI } from "@google/genai";

// Speicher für Rate-Limits (In-Memory)
const limitStore = new Map<string, any>();

const LIMITS: Record<string, number> = {
  'analysis': 10,
  'chat': 30,
  'news': 15
};

const WINDOW_MS = 24 * 60 * 60 * 1000;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const { type, payload, userId } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'anonymous';
  
  const identifier = userId || ip;
  const now = Date.now();

  let userStats = limitStore.get(identifier);
  if (!userStats || (now - userStats.lastReset > WINDOW_MS)) {
    userStats = { analysis: 0, chat: 0, news: 0, lastReset: now };
  }

  const currentType = type as keyof typeof LIMITS;
  if (!LIMITS[currentType]) return res.status(400).json({ error: 'Ungültiger Request-Typ' });

  if (userStats[currentType] >= LIMITS[currentType]) {
    return res.status(429).json({ 
      error: `Tageslimit für ${type} erreicht.`,
      resetIn: Math.ceil((userStats.lastReset + WINDOW_MS - now) / 3600000)
    });
  }

  userStats[currentType]++;
  limitStore.set(identifier, userStats);

  const usagePercent = (userStats[currentType] / LIMITS[currentType]) * 100;
  const showWarning = usagePercent >= 80;

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const modelName = 'gemini-3-pro-preview';
    const response = await ai.models.generateContent({
      model: modelName,
      contents: payload.contents,
      config: payload.config
    });

    const responseText = response.text || "";

    // Sicherer Audit-Log ohne sensitive Inhalte
    console.log(`[MONETA AUDIT] ID: ${identifier.slice(0, 8)}... | Type: ${type} | Usage: ${usagePercent.toFixed(0)}%`);

    return res.status(200).json({ 
      text: responseText,
      meta: {
        usage: usagePercent,
        warning: showWarning ? `Achtung: Du hast ${userStats[currentType]}/${LIMITS[currentType]} deiner täglichen ${type}-Anfragen genutzt.` : null
      }
    });
  } catch (error: any) {
    // Verhindert das Loggen des kompletten Fehler-Objekts (welches den Request-Payload enthalten könnte)
    console.error(`[MONETA API ERROR] Type: ${type} | Message: ${error.message}`);
    return res.status(500).json({ error: 'KI-Schnittstelle überlastet oder Fehler bei der Verarbeitung.' });
  }
}
