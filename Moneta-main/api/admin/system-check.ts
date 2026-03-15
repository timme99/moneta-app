/**
 * GET /api/admin/system-check?task=<task>
 *
 * Consolidated admin/diagnostic endpoint.
 *
 * Tasks:
 *   ?task=verify-db        – count profiles rows and return the latest entry
 *   ?task=test-email       – send a test digest email to the first profiles user
 *   ?task=weekly-preview   – send the weekly digest preview to tim@moneta-invest.de
 *
 * Auth (one of):
 *   Authorization: Bearer <CRON_SECRET>
 *   ?secret=<CRON_SECRET>   ← directly callable from the browser
 */
import { getSupabaseAdmin } from '../../lib/supabaseClient';
import { sendEmail, buildDigestHtml, getResendClient } from '../../lib/email';

function requireSecret(req: any, res: any): boolean {
  const secret = process.env.CRON_SECRET ?? '';
  const auth   = req.headers?.authorization ?? '';
  const fromHeader = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const fromQuery  = (req.query?.secret as string | undefined) ?? '';
  const token = fromHeader || fromQuery;
  if (!secret || secret.length < 16 || token !== secret) {
    const masked = token.length >= 3 ? token.slice(0, 3) + '***' : '(leer)';
    console.warn(`[admin/system-check] Auth fehlgeschlagen – Token: ${masked}`);
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

// ── task=weekly-preview ───────────────────────────────────────────────────────

async function weeklyPreview(res: any) {
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

  console.log(`[admin/system-check?task=weekly-preview] Sende Test-Mail an ${TEST_RECIPIENT}…`);

  const result = await sendEmail({
    to:      TEST_RECIPIENT,
    subject: '[TEST] Ihr KI-Wochenbericht – Moneta',
    html,
  });

  if (!result.success) {
    console.error('[admin/system-check?task=weekly-preview] Versand fehlgeschlagen:', result.error);
    return res.status(500).json({ error: result.error });
  }

  console.log(`[admin/system-check?task=weekly-preview] ✓ Test-Mail gesendet (id: ${result.id})`);
  return res.status(200).json({
    ok:  true,
    task: 'weekly-preview',
    to:  TEST_RECIPIENT,
    id:  result.id,
    msg: 'Test-Mail erfolgreich versendet.',
  });
}

// ── Router ────────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
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
      case 'weekly-preview':
        return await weeklyPreview(res);
      default:
        return res.status(400).json({
          error: 'Unbekannter task. Gültige Werte: verify-db, test-email, weekly-preview',
          available: ['verify-db', 'test-email', 'weekly-preview'],
        });
    }
  } catch (e: any) {
    console.error(`[admin/system-check?task=${task}]`, e?.message || e);
    return res.status(500).json({ error: 'Interner Serverfehler' });
  }
}
