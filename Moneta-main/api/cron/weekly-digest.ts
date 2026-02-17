import { getSubscribersForDigest } from '../../lib/subscribers';
import { sendDigestToSubscribers } from '../../lib/email';

/**
 * GET /api/cron/weekly-digest
 *
 * Wird von Vercel Cron aufgerufen (z. B. wöchentlich).
 * In Vercel: CRON_SECRET setzen (min. 16 Zeichen); wird als Authorization: Bearer <CRON_SECRET> gesendet.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET;
  const auth = req.headers?.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!secret || secret.length < 16) {
    return res.status(503).json({ error: 'CRON_SECRET nicht konfiguriert (min. 16 Zeichen)' });
  }
  if (token !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const subscribers = await getSubscribersForDigest();
    if (subscribers.length === 0) {
      return res.status(200).json({
        ok: true,
        message: 'Keine Abonnenten für den Wochenbericht.',
        sent: 0,
      });
    }

    const result = await sendDigestToSubscribers(subscribers, {
      subject: 'Ihr KI-Wochenbericht – Moneta',
      summary: 'Ihre wöchentliche Depot-Übersicht von Moneta.',
      highlights: [
        'KI-gestützte Analyse Ihres Depots',
        'Nächste Schritte und Empfehlungen in der App einsehen',
      ],
      ctaUrl: process.env.APP_URL ?? undefined,
    });

    return res.status(200).json({
      ok: true,
      sent: result.sent,
      failed: result.failed,
      errors: result.errors.length ? result.errors : undefined,
    });
  } catch (e: any) {
    console.error('[cron/weekly-digest]', e?.message || e);
    return res.status(500).json({ error: 'Fehler beim Versand des Wochenberichts' });
  }
}
