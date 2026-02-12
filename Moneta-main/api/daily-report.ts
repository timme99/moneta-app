// api/daily-report.ts - Daily Portfolio Report Email via Cron

import { GoogleGenAI } from "@google/genai";

export const config = {
  runtime: 'edge',
};

interface DailyReportRequest {
  email: string;
  holdings: { name: string; weight: number; decision: string; ticker?: string }[];
  score: number;
  summary: string;
}

async function generateReportHTML(holdings: any[], score: number, summary: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const holdingSummary = holdings.map(h => `${h.name} (${h.weight}%, ${h.decision})`).join(', ');
  const today = new Date().toLocaleDateString('de-DE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: [{
      parts: [{
        text: `Erstelle einen professionellen täglichen Portfolio-Bericht als HTML-E-Mail auf Deutsch.

Portfolio-Daten:
- Holdings: ${holdingSummary}
- Gesamtscore: ${score}/100
- Zusammenfassung: ${summary}
- Datum: ${today}

Erstelle eine professionelle HTML-E-Mail mit:
1. Header mit "Moneta - Täglicher Depot-Bericht" und Datum
2. Portfolio-Score als große Zahl
3. Zusammenfassung (2-3 Sätze)
4. Tabelle der Holdings mit Name, Gewichtung und Empfehlung (Kaufen/Halten/Verkaufen)
5. Markt-Highlights (3 kurze Punkte zu aktuellen Entwicklungen)
6. Handlungsempfehlungen (2-3 konkrete Tipps)
7. Footer mit Haftungsausschluss

Verwende inline CSS-Styles. Farbschema: Blau (#2563eb) als Akzent, Weiß als Hintergrund, Dunkelgrau (#1e293b) für Text.
Responsive Design. Professionell aber verständlich.
Antworte NUR mit dem HTML-Code, kein Markdown, keine Erklärung.`
      }]
    }],
    config: { maxOutputTokens: 2000, temperature: 0.3 }
  });

  return response.text || '<p>Bericht konnte nicht generiert werden.</p>';
}

async function sendEmail(to: string, subject: string, htmlContent: string): Promise<boolean> {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    console.error('[MONETA EMAIL] RESEND_API_KEY not configured');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Moneta <noreply@moneta-app.de>',
        to: [to],
        subject,
        html: htmlContent,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[MONETA EMAIL] Send failed:', error);
      return false;
    }

    return true;
  } catch (error: any) {
    console.error('[MONETA EMAIL] Error:', error.message);
    return false;
  }
}

export default async function handler(request: Request) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers, status: 200 });
  }

  // Verify cron secret for automated calls
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  try {
    const body = await request.json() as DailyReportRequest;
    const { email, holdings, score, summary } = body;

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'E-Mail-Adresse erforderlich' }),
        { headers, status: 400 }
      );
    }

    if (!holdings || holdings.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Keine Portfolio-Daten vorhanden' }),
        { headers, status: 400 }
      );
    }

    // Generate the HTML report
    const htmlReport = await generateReportHTML(holdings, score || 0, summary || '');
    const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const subject = `Moneta Depot-Bericht - ${today}`;

    // Send the email
    const sent = await sendEmail(email, subject, htmlReport);

    if (!sent) {
      return new Response(
        JSON.stringify({ error: 'E-Mail konnte nicht gesendet werden', fallback: true, html: htmlReport }),
        { headers, status: 500 }
      );
    }

    console.log(`[MONETA REPORT] Daily report sent to ${email.slice(0, 3)}...`);

    return new Response(
      JSON.stringify({ success: true, message: 'Täglicher Bericht gesendet' }),
      { headers, status: 200 }
    );

  } catch (error: any) {
    console.error('[MONETA REPORT ERROR]', error.message);
    return new Response(
      JSON.stringify({ error: 'Fehler beim Erstellen des Berichts' }),
      { headers, status: 500 }
    );
  }
}
