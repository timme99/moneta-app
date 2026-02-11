// API Route: /api/email
// Handles email subscription management and sending daily portfolio digests
// In production, integrate with SendGrid, Resend, or AWS SES

interface EmailRequest {
  action: 'subscribe' | 'unsubscribe' | 'send_digest';
  email: string;
  userId: string;
  portfolioSummary?: string;
  sendTime?: string;
}

// In-memory subscriber store (in production: use database)
const subscribers = new Map<string, { email: string; sendTime: string; active: boolean }>();

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body: EmailRequest = await req.json();

    switch (body.action) {
      case 'subscribe': {
        subscribers.set(body.userId, {
          email: body.email,
          sendTime: body.sendTime || '08:00',
          active: true,
        });
        return new Response(JSON.stringify({
          success: true,
          message: `Täglicher Report aktiviert für ${body.email} um ${body.sendTime || '08:00'} Uhr.`,
        }));
      }

      case 'unsubscribe': {
        const sub = subscribers.get(body.userId);
        if (sub) sub.active = false;
        return new Response(JSON.stringify({
          success: true,
          message: 'E-Mail-Benachrichtigungen deaktiviert.',
        }));
      }

      case 'send_digest': {
        // In production: Generate email content and send via email service
        const emailContent = generateDigestEmail(body.email, body.portfolioSummary || '');
        console.log('[Email API] Digest prepared for:', body.email);
        return new Response(JSON.stringify({
          success: true,
          message: 'Digest-E-Mail wird versendet.',
          preview: emailContent,
        }));
      }

      default:
        return new Response(JSON.stringify({ error: 'Unbekannte Aktion.' }), { status: 400 });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Interner Serverfehler.' }), { status: 500 });
  }
}

function generateDigestEmail(email: string, portfolioSummary: string): string {
  const date = new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return `
    Moneta Tagesbericht - ${date}

    Hallo,

    hier ist Ihr täglicher Portfolio-Report:

    ${portfolioSummary || 'Keine Portfolio-Daten verfügbar.'}

    ---
    Moneta - Ihr KI-Anlageassistent
    Dies ist eine automatische E-Mail. Abmelden in den Einstellungen.
  `.trim();
}

export const config = { runtime: 'edge' };
