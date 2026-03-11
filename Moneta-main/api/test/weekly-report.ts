import { sendEmail, buildDigestHtml, getResendClient } from '../../lib/email.js';

/**
 * GET /api/test/weekly-report
 * GET /api/test/weekly-report?secret=<CRON_SECRET>
 *
 * Sendet den KI-Wochenbericht sofort als Test an tim@moneta-invest.de –
 * unabhängig vom Wochentag.
 *
 * Authentifizierung (eines von beiden genügt):
 *   - Header:        Authorization: Bearer <CRON_SECRET>
 *   - Query-Param:   ?secret=<CRON_SECRET>   ← direkt im Browser aufrufbar
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Authentifizierung ────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET;

  if (!secret || secret.length < 16) {
    return res.status(503).json({ error: 'CRON_SECRET nicht konfiguriert (min. 16 Zeichen).' });
  }

  // Token aus Header ODER Query-Param
  const auth  = req.headers?.authorization ?? '';
  const fromHeader = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const fromQuery  = (req.query?.secret as string | undefined) ?? '';
  const token = fromHeader || fromQuery;

  if (token !== secret) {
    const masked = token.length >= 3 ? token.slice(0, 3) + '***' : '(leer)';
    console.warn(`[test/weekly-report] Auth fehlgeschlagen – Token: ${masked}`);
    return res.status(401).json({ error: 'Unauthorized – CRON_SECRET stimmt nicht überein.' });
  }

  // ── E-Mail-Dienst prüfen ─────────────────────────────────────────────────────
  if (!getResendClient()) {
    return res.status(503).json({ error: 'RESEND_API_KEY nicht konfiguriert.' });
  }

  const TEST_RECIPIENT = 'tim@moneta-invest.de';
  const ctaUrl = process.env.APP_URL ?? 'https://moneta-invest.de';

  const html = buildDigestHtml({
    userName: 'Tim',
    summary:
      'Dies ist eine Test-Vorschau deines wöchentlichen KI-Depot-Berichts. ' +
      'So würde die Mail deinen Abonnenten jeden Montag zugestellt.',
    highlights: [
      'KI-gestützte Depot-Analyse ist aktiv und bereit',
      'Bruchstück-Positionen werden korrekt erkannt und angezeigt',
      'Alle Abonnenten mit weeklyReport=true erhalten diese Mail',
      'Rate-Limit-Schutz (600 ms Pause, 429-Retry) aktiv',
    ],
    ctaUrl,
  });

  console.log(`[test/weekly-report] Sende Test-Mail an ${TEST_RECIPIENT}…`);

  const result = await sendEmail({
    to:      TEST_RECIPIENT,
    subject: '[TEST] Ihr KI-Wochenbericht – Moneta',
    html,
  });

  if (!result.success) {
    console.error('[test/weekly-report] Versand fehlgeschlagen:', result.error);
    return res.status(500).json({ error: result.error });
  }

  console.log(`[test/weekly-report] ✓ Test-Mail gesendet (id: ${result.id})`);
  return res.status(200).json({
    ok:  true,
    to:  TEST_RECIPIENT,
    id:  result.id,
    msg: 'Test-Mail erfolgreich versendet.',
  });
}
