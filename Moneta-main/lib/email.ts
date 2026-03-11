import { Resend } from 'resend';

let _resend: Resend | null = null;

/**
 * Initialisiert den Resend-Client mit dem API-Key aus den Umgebungsvariablen.
 */
export function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Erzeugt das hochprofessionelle HTML-Layout für die Moneta-Berichte.
 * Design-Features: Karten-Layout, Icons für verschiedene Kategorien, Responsive Design.
 */
function getEmailHtml(content: {
  title: string;
  userName: string;
  introduction: string;
  sections: { title: string; items: string[]; type?: 'news' | 'perf' | 'calendar' }[];
  ctaLink: string;
  ctaText: string;
}) {
  const sectionsHtml = content.sections.map(section => {
    // Auswahl von Icon und Farbe basierend auf dem Sektionstyp für den "Durchblick"
    let icon = '•';
    let accentColor = '#1e40af'; // Moneta Blau
    
    if (section.type === 'calendar') {
      icon = '📅';
      accentColor = '#0891b2'; // Cyan für Termine/HV
    } else if (section.type === 'news') {
      icon = '📰';
      accentColor = '#475569'; // Slate für Markt-News
    } else if (section.type === 'perf') {
      icon = '📈';
      accentColor = '#16a34a'; // Grün für Performance
    }

    return `
      <div style="margin-bottom: 24px; padding: 24px; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <h3 style="margin: 0 0 16px 0; font-size: 14px; font-weight: 700; color: ${accentColor}; text-transform: uppercase; letter-spacing: 0.1em; display: flex; align-items: center;">
          <span style="margin-right: 10px; font-size: 18px;">${icon}</span> ${section.title}
        </h3>
        <ul style="margin: 0; padding: 0; list-style: none;">
          ${section.items.map(item => `
            <li style="margin-bottom: 12px; line-height: 1.5; color: #334155; font-size: 15px; border-bottom: 1px solid #f8fafc; padding-bottom: 10px;">
              <span style="color: #3b82f6; margin-right: 8px;">•</span> ${item}
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @media only screen and (max-width: 600px) {
          .main-card { padding: 30px 20px !important; }
          .header-title { font-size: 28px !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 10px;">
        <tr>
          <td align="center">
            <table width="100%" style="max-width: 600px; border-spacing: 0;">
              <!-- Branding Header -->
              <tr>
                <td style="text-align: center; padding-bottom: 35px;">
                  <h1 class="header-title" style="margin: 0; color: #1e3a8a; font-size: 34px; font-weight: 800; letter-spacing: -1px;">Moneta</h1>
                  <p style="margin: 6px 0 0 0; color: #64748b; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 2.5px;">Investieren mit Durchblick</p>
                </td>
              </tr>
              
              <!-- Haupt-Inhaltskarte -->
              <tr>
                <td class="main-card" style="background: #ffffff; padding: 45px 35px; border-radius: 24px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
                  <h2 style="margin: 0 0 15px 0; color: #0f172a; font-size: 24px; font-weight: 700;">Hallo ${content.userName},</h2>
                  <p style="margin: 0 0 35px 0; color: #475569; font-size: 17px; line-height: 1.6;">${content.introduction}</p>
                  
                  ${sectionsHtml}

                  <!-- Call to Action -->
                  <div style="text-align: center; margin-top: 40px; padding-top: 30px; border-top: 2px dashed #f1f5f9;">
                    <p style="margin-bottom: 25px; color: #64748b; font-size: 15px;">Detaillierte Charts und Analysen findest du in deinem Dashboard.</p>
                    <a href="${content.ctaLink}" style="background: #2563eb; color: #ffffff; padding: 16px 36px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 16px; display: inline-block; box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.3);">
                      ${content.ctaText}
                    </a>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="text-align: center; padding-top: 40px;">
                  <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.8;">
                    &copy; ${new Date().getFullYear()} Moneta App. Alle Rechte vorbehalten.<br>
                    <strong>Investieren mit Durchblick.</strong><br>
                    Diese KI-gestützte Analyse ersetzt keine professionelle Anlageberatung.<br>
                    <a href="https://moneta-invest.de/settings" style="color: #3b82f6; text-decoration: none; font-weight: 600;">E-Mail-Einstellungen</a> • <a href="#" style="color: #3b82f6; text-decoration: none; font-weight: 600;">Abmelden</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

/**
 * Einzelner E-Mail-Versand mit Fehlerbehandlung für Rate-Limits (429).
 * Unterstützt 'daily' und 'weekly' Typen.
 */
export async function sendDigestEmail(params: {
  to: string;
  userName: string;
  type: 'daily' | 'weekly';
  analysis: any; 
}) {
  const resend = getResendClient();
  if (!resend) {
    console.warn('[lib/email] RESEND_API_KEY fehlt. Überspringe Versand.');
    return null;
  }

  const from = process.env.EMAIL_FROM || 'Moneta <onboarding@resend.dev>';
  const subject = params.type === 'weekly' 
    ? 'Dein KI-Wochenbericht – Investieren mit Durchblick'
    : 'Dein Markt-Update für heute – Moneta';

  const html = getEmailHtml({
    title: subject,
    userName: params.userName || 'Investor',
    introduction: params.analysis.intro || "Hier ist dein personalisiertes Markt-Update.",
    sections: params.analysis.sections || [],
    ctaLink: "https://moneta-invest.de/dashboard",
    ctaText: params.type === 'weekly' ? "Wochenanalyse ansehen" : "Dashboard öffnen"
  });

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: [params.to],
      subject,
      html,
    });

    if (error) {
      // Automatischer Retry bei Rate Limits (429)
      if ((error as any).statusCode === 429) {
        console.warn('[lib/email] Rate limit (429) erreicht. Warte 2s vor Retry...');
        await sleep(2000);
        return sendDigestEmail(params);
      }
      throw error;
    }

    // Kurze Pause, um das 2/s Limit von Resend sicher zu unterschreiten
    await sleep(600);
    return data;
  } catch (err) {
    console.error(`[lib/email] Fehler beim Versand an ${params.to}:`, err);
    throw err;
  }
}

/**
 * Hilfsfunktion für Massen-Mails in Cron-Jobs.
 * Versendet E-Mails nacheinander mit Delay, um Rate-Limits zu vermeiden.
 */
export async function sendDigestToSubscribers(subscribers: any[], type: 'daily' | 'weekly') {
  console.log(`[lib/email] Starte Versand an ${subscribers.length} Abonnenten (${type})...`);
  const results = { sent: 0, failed: 0, errors: [] as any[] };

  for (const sub of subscribers) {
    try {
      // Falls die Analyse bereits im Subscriber-Objekt enthalten ist, nutzen wir sie.
      // Andernfalls wird ein Standard-Fallback genutzt.
      await sendDigestEmail({
        to: sub.email,
        userName: sub.full_name,
        type,
        analysis: sub.analysis || {
          intro: "Dein Depot-Update.",
          sections: [{ title: "Update", items: ["Keine spezifischen News vorhanden."], type: "news" }]
        }
      });
      results.sent++;
      console.log(`[lib/email] ✓ Gesendet an ${sub.email}`);
    } catch (err: any) {
      results.failed++;
      results.errors.push({ email: sub.email, error: err.message });
      console.error(`[lib/email] ✗ Fehler bei ${sub.email}:`, err.message);
    }
  }

  return results;
}
