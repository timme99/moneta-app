/**
 * GET /api/cron/test-digest
 *
 * Sends a test digest email to the FIRST user found in the profiles table.
 * This verifies that the Resend integration and the profiles → email pipeline work end-to-end.
 *
 * Protected by CRON_SECRET – only for internal testing, not exposed publicly.
 */
import { getSupabaseAdmin } from '../../lib/supabaseClient.js';
import { sendEmail, buildDigestHtml } from '../../lib/email.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET;
  const auth   = req.headers?.authorization ?? '';
  const token  = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!secret || secret.length < 16) {
    return res.status(503).json({ error: 'CRON_SECRET nicht konfiguriert (min. 16 Zeichen)' });
  }
  if (token !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Fetch the first user in profiles that has an email
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('email, full_name, weekly_digest_enabled, newsletter_subscribed')
      .not('email', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (error || !profile) {
      return res.status(404).json({
        ok: false,
        message: 'Kein Profil in der Tabelle gefunden – trigger eventuell nicht aktiv.',
      });
    }

    const html = buildDigestHtml({
      userName: profile.full_name ?? undefined,
      summary: 'Dies ist eine Test-E-Mail zur Verifizierung der Resend-Integration.',
      highlights: [
        'Die profiles-Tabelle ist korrekt befüllt',
        'Der on_auth_user_created Trigger funktioniert',
        'Resend sendet erfolgreich über die RESEND_API_KEY',
      ],
      ctaUrl: process.env.APP_URL ?? undefined,
    });

    const result = await sendEmail({
      to: profile.email!,
      subject: '[Test] Moneta Wochenbericht – Systemtest',
      html,
    });

    if (!result.success) {
      return res.status(500).json({ ok: false, error: result.error });
    }

    return res.status(200).json({
      ok: true,
      sentTo: profile.email,
      messageId: result.id,
      weeklyDigestEnabled: (profile as any).weekly_digest_enabled,
    });
  } catch (e: any) {
    console.error('[cron/test-digest]', e?.message || e);
    return res.status(500).json({ error: 'Interner Fehler beim Test-Versand' });
  }
}
