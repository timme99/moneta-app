/**
 * GET /api/admin/system-check?task=<task>
 *
 * Consolidated admin/diagnostic endpoint – replaces the old
 *   api/auth/verify-profile  and  api/cron/test-digest
 * endpoints to stay within the Vercel Hobby 12-function limit.
 *
 * Tasks:
 *   ?task=verify-db    – count profiles rows and return the latest entry
 *                        (confirms on_auth_user_created trigger is working)
 *   ?task=test-email   – send a test digest email to the first profiles user
 *                        (confirms Resend + RESEND_API_KEY are wired up)
 *
 * All tasks require:  Authorization: Bearer <CRON_SECRET>
 */
import { getSupabaseAdmin } from '../lib/supabaseClient.js';
import { sendEmail, buildDigestHtml } from '../lib/email.js';

function requireSecret(req: any, res: any): boolean {
  const secret = process.env.CRON_SECRET ?? '';
  const auth   = req.headers?.authorization ?? '';
  const token  = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!secret || token !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// ── task=verify-db ────────────────────────────────────────────────────────────

async function verifyDb(res: any) {
  const supabase = getSupabaseAdmin();

  const { count, error: countErr } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  if (countErr) {
    return res.status(500).json({ error: countErr.message });
  }

  const { data: rows } = await supabase
    .from('profiles')
    .select('id, created_at, weekly_digest_enabled, newsletter_subscribed')
    .order('created_at', { ascending: false })
    .limit(1) as unknown as { data: any[] | null };

  const latest = rows?.[0] ?? null;

  return res.status(200).json({
    ok: true,
    task: 'verify-db',
    profileCount: count ?? 0,
    triggerWorking: (count ?? 0) > 0,
    latestProfile: latest,
  });
}

// ── task=test-email ───────────────────────────────────────────────────────────

async function testEmail(res: any) {
  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({ error: 'RESEND_API_KEY nicht konfiguriert' });
  }

  const supabase = getSupabaseAdmin();

  const { data: rows } = await supabase
    .from('profiles')
    .select('email, full_name, weekly_digest_enabled')
    .not('email', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1) as unknown as { data: any[] | null };

  const profile = rows?.[0];
  if (!profile) {
    return res.status(404).json({
      ok: false,
      task: 'test-email',
      message: 'Kein Profil in der Tabelle gefunden – Trigger eventuell nicht aktiv.',
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
    to: profile.email as string,
    subject: '[Test] Moneta Wochenbericht – Systemtest',
    html,
  });

  if (!result.success) {
    return res.status(500).json({ ok: false, task: 'test-email', error: result.error });
  }

  return res.status(200).json({
    ok: true,
    task: 'test-email',
    sentTo: profile.email,
    messageId: result.id,
    weeklyDigestEnabled: profile.weekly_digest_enabled ?? false,
  });
}

// ── Router ────────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireSecret(req, res)) return;

  const task = req.query?.task as string | undefined;

  try {
    switch (task) {
      case 'verify-db':
        return await verifyDb(res);
      case 'test-email':
        return await testEmail(res);
      default:
        return res.status(400).json({
          error: 'Unbekannter task. Gültige Werte: verify-db, test-email',
          available: ['verify-db', 'test-email'],
        });
    }
  } catch (e: any) {
    console.error(`[admin/system-check?task=${task}]`, e?.message || e);
    return res.status(500).json({ error: 'Interner Serverfehler' });
  }
}
