import { Resend } from 'resend';
import type { NewsletterSubscriber } from './subscribers';

const resend = new Resend(process.env.RESEND_API_KEY);

/** Absender – in Vercel z. B. setzen: FROM_EMAIL="Moneta <newsletter@deine-domain.de>" */
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'Moneta <onboarding@resend.dev>';

export function getResendClient(): Resend | null {
  return process.env.RESEND_API_KEY ? resend : null;
}

/**
 * Sendet eine einzelne E-Mail über Resend.
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

  const to = Array.isArray(params.to) ? params.to : [params.to];
  const { data, error } = await client.emails.send({
    from: params.from ?? FROM_EMAIL,
    to,
    subject: params.subject,
    html: params.html,
  });

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true, id: data?.id };
}

/**
 * Baut den HTML-Body für den KI-Wochenbericht (einfaches Template).
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
  <p style="margin-top:32px;font-size:12px;color:#64748b;">Sie erhalten diese E-Mail, weil Sie den KI-Wochenbericht aktiviert haben. Moneta – Ihr digitaler Vermögensberater.</p>
</body>
</html>
  `.trim();
}

/**
 * Sendet den Wochenbericht an eine Liste von Abonnenten.
 */
export async function sendDigestToSubscribers(
  subscribers: NewsletterSubscriber[],
  content: { subject?: string; summary?: string; highlights?: string[]; ctaUrl?: string }
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const subject = content.subject ?? 'Ihr KI-Wochenbericht – Moneta';
  const html = buildDigestHtml({
    userName: undefined,
    summary: content.summary,
    highlights: content.highlights,
    ctaUrl: content.ctaUrl,
  });

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const sub of subscribers) {
    const personalizedHtml = buildDigestHtml({
      userName: sub.name ?? undefined,
      summary: content.summary,
      highlights: content.highlights,
      ctaUrl: content.ctaUrl,
    });
    const result = await sendEmail({ to: sub.email, subject, html: personalizedHtml });
    if (result.success) sent++;
    else {
      failed++;
      if (result.error) errors.push(`${sub.email}: ${result.error}`);
    }
  }

  return { sent, failed, errors };
}
