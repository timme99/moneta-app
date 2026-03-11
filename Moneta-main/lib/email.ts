import { Resend } from 'resend';
import type { NewsletterSubscriber } from './subscribers.js';

/**
 * Absender-Adresse.
 * Priorität: EMAIL_FROM → FROM_EMAIL → Resend-Sandbox-Default.
 * Beispiel in Vercel: EMAIL_FROM="Moneta <newsletter@moneta-invest.de>"
 */
const FROM_EMAIL =
  process.env.EMAIL_FROM ??
  process.env.FROM_EMAIL ??
  'Moneta <onboarding@resend.dev>';

/** Warte ms Millisekunden (für Rate-Limit-Schutz). */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Lazy-Init: Resend-Client wird erst bei erster Nutzung erzeugt.
// Verhindert "new Resend(undefined)" beim Laden des Moduls ohne API-Key.
let _resend: Resend | null = null;

export function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY nicht gesetzt – E-Mail-Versand nicht verfügbar.');
    return null;
  }
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

/**
 * Sendet eine einzelne E-Mail über Resend.
 * Bei Rate-Limit (429) wird einmalig 2 Sekunden gewartet und erneut versucht.
 */
export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const client = getResendClient();
  if (!client) {
    return { success: false, error: 'RESEND_API_KEY nicht konfiguriert' };
  }

  const from = params.from ?? FROM_EMAIL;
  const to = Array.isArray(params.to) ? params.to : [params.to];

  const trySend = () =>
    client.emails.send({ from, to, subject: params.subject, html: params.html });

  let { data, error } = await trySend();

  // 429 Rate-Limit: 2 Sekunden warten und einmalig wiederholen
  if (error) {
    const isRateLimit =
      (error as any).statusCode === 429 ||
      error.message?.includes('429') ||
      error.message?.toLowerCase().includes('rate limit');

    if (isRateLimit) {
      console.warn('[email] Rate-Limit (429) erkannt – warte 2s und versuche erneut…');
      await sleep(2000);
      ({ data, error } = await trySend());
    }
  }

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true, id: data?.id };
}

/**
 * Baut den HTML-Body für den KI-Wochenbericht.
 */
export function buildDigestHtml(options: {
  userName?: string;
  summary?: string;
  highlights?: string[];
  ctaUrl?: string;
}): string {
  const { userName, summary = 'Ihr wöchentlicher Depot-Überblick.', highlights = [], ctaUrl } = options;
  const greeting = userName ? `Hallo ${userName},` : 'Hallo,';
  const list = highlights.length
    ? `<ul style="margin:16px 0;padding-left:20px;">${highlights.map((h) => `<li>${h}</li>`).join('')}</ul>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b;">
  <h1 style="font-size:20px;color:#0f172a;">Ihr KI-Wochenbericht – Moneta</h1>
  <p style="line-height:1.6;">${greeting}</p>
  <p style="line-height:1.6;">${summary}</p>
  ${list}
  ${ctaUrl ? `<p style="margin-top:24px;"><a href="${ctaUrl}" style="color:#2563eb;font-weight:600;">Bericht in Moneta öffnen</a></p>` : ''}
  <hr style="margin-top:32px;border:none;border-top:1px solid #e2e8f0;">
  <p style="margin-top:16px;font-size:13px;color:#2563eb;font-weight:700;letter-spacing:0.03em;">
    Moneta – Investieren mit Durchblick.
  </p>
  <p style="margin-top:4px;font-size:11px;color:#94a3b8;">
    Sie erhalten diese E-Mail, weil Sie den KI-Wochenbericht aktiviert haben.
    Um sich abzumelden, deaktivieren Sie den Toggle in Ihren Einstellungen.
  </p>
</body>
</html>
  `.trim();
}

/**
 * Sendet den Wochenbericht an eine Liste von Abonnenten – nacheinander mit 600 ms Pause,
 * damit das Resend-Limit (2 Mails/s) niemals überschritten wird.
 * Loggt jeden Versand mit Fortschrittsanzeige.
 */
export async function sendDigestToSubscribers(
  subscribers: NewsletterSubscriber[],
  content: { subject?: string; summary?: string; highlights?: string[]; ctaUrl?: string }
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const subject = content.subject ?? 'Ihr KI-Wochenbericht – Moneta';

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const total = subscribers.length;

  for (let i = 0; i < total; i++) {
    const sub = subscribers[i];
    console.log(`[email] Sende Bericht an ${sub.email} (Abonnent ${i + 1} von ${total})…`);

    const html = buildDigestHtml({
      userName:   sub.name ?? undefined,
      summary:    content.summary,
      highlights: content.highlights,
      ctaUrl:     content.ctaUrl,
    });

    const result = await sendEmail({ to: sub.email, subject, html });

    if (result.success) {
      sent++;
      console.log(`[email] ✓ Gesendet: ${sub.email} (id: ${result.id})`);
    } else {
      failed++;
      const msg = `${sub.email}: ${result.error}`;
      errors.push(msg);
      console.error(`[email] ✗ Fehler: ${msg}`);
    }

    // 600 ms Pause zwischen den Mails – schützt vor Rate-Limit (2 Mails/s)
    if (i < total - 1) await sleep(600);
  }

  return { sent, failed, errors };
}
