import { sendEmail, getResendClient } from '../../lib/email';
import { getSubscribersForDigest } from '../../lib/subscribers';
import { sendDigestToSubscribers, buildDigestHtml } from '../../lib/email';

/**
 * POST /api/newsletter/send
 *
 * Body (optional):
 * - to: string[] – Test: nur an diese E-Mails senden
 * - subject: string
 * - html: string
 * - digest: boolean – wenn true, Abonnenten aus getSubscribersForDigest() nutzen (später DB)
 *
 * Ohne Body oder mit digest: true → sendet Platzhalter-Digest an alle Abonnenten (aktuell 0 bis DB da ist).
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = getResendClient();
  if (!client) {
    return res.status(503).json({
      error: 'Newsletter nicht konfiguriert',
      hint: 'RESEND_API_KEY in den Umgebungsvariablen setzen (z. B. in Vercel).',
    });
  }

  try {
    const body = typeof req.body === 'object' ? req.body : {};
    const { to: bodyTo, subject: bodySubject, html: bodyHtml, digest } = body;

    // Expliziter Aufruf: "Digest an alle Abonnenten senden"
    if (digest) {
      const subscribers = await getSubscribersForDigest();
      if (subscribers.length === 0) {
        return res.status(200).json({
          ok: true,
          message: 'Keine Abonnenten (DB später einbinden).',
          sent: 0,
          failed: 0,
        });
      }
      const result = await sendDigestToSubscribers(subscribers, {
        subject: bodySubject ?? 'Ihr KI-Wochenbericht – Moneta',
        summary: body.summary ?? 'Ihre wöchentliche Übersicht steht bereit.',
        highlights: body.highlights ?? ['Depot-Check durchgeführt', 'Nächste Schritte in der App'],
        ctaUrl: process.env.APP_URL ?? undefined,
      });
      return res.status(200).json({
        ok: true,
        sent: result.sent,
        failed: result.failed,
        errors: result.errors.length ? result.errors : undefined,
      });
    }

    // Einzelversand (z. B. zum Testen): body.to, body.subject, body.html
    if (bodyTo && Array.isArray(bodyTo) && bodyTo.length > 0) {
      const subject = bodySubject ?? 'Test – Moneta Newsletter';
      const html = bodyHtml ?? buildDigestHtml({ summary: 'Dies ist eine Test-E-Mail von Moneta.' });
      const result = await sendEmail({ to: bodyTo, subject, html });
      if (!result.success) {
        return res.status(500).json({ error: 'Versand fehlgeschlagen', detail: result.error });
      }
      return res.status(200).json({ ok: true, id: result.id, to: bodyTo });
    }

    return res.status(400).json({
      error: 'Ungültige Anfrage',
      hint: 'Body: { "to": ["email@example.com"], "subject": "...", "html": "..." } oder { "digest": true }',
    });
  } catch (e: any) {
    console.error('[newsletter/send]', e?.message || e);
    return res.status(500).json({ error: 'Interner Fehler beim Versand' });
  }
}
