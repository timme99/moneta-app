import { createClient } from '@supabase/supabase-js';
import { getSubscribersForDigest } from '../../lib/subscribers.js';
import { buildDigestHtml, sendEmail, getResendClient } from '../../lib/email.js';

const SUPABASE_URL     = process.env.MONETA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_SERVICE = process.env.MONETA_SUPABASE_SERVICE_ROLE_KEY ?? '';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * GET /api/cron/weekly-digest
 *
 * Vercel Cron (Montag 08:00 UTC).
 * Sendet personalisierten KI-Wochenbericht mit Depot-Performance an alle
 * Abonnenten mit preferences.weeklyReport = true.
 *
 * Auth: CRON_SECRET via Authorization: Bearer <secret>
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET;
  const auth   = req.headers?.authorization;
  const token  = auth?.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!secret || secret.length < 16) {
    return res.status(503).json({ error: 'CRON_SECRET nicht konfiguriert (min. 16 Zeichen)' });
  }
  if (token !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!getResendClient()) {
    console.error('[cron/weekly-digest] RESEND_API_KEY fehlt – Versand abgebrochen.');
    return res.status(503).json({ error: 'RESEND_API_KEY nicht konfiguriert.' });
  }

  try {
    const subscribers = await getSubscribersForDigest();
    console.log(`[cron/weekly-digest] ${subscribers.length} Abonnent(en) mit weeklyReport=true.`);

    if (subscribers.length === 0) {
      console.log('[cron/weekly-digest] Kein Versand – keine Abonnenten.');
      return res.status(200).json({ ok: true, message: 'Keine Abonnenten.', sent: 0 });
    }

    // ── Snapshot-Daten für Wochenvergleich ───────────────────────────────────
    let prevByUser = new Map<string, number>();
    let currByUser = new Map<string, number>();

    if (SUPABASE_URL && SUPABASE_SERVICE) {
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const today = new Date().toISOString().slice(0, 10);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const weekAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

      const userIds = subscribers.map((s) => s.userId);

      // Heutiger Snapshot (neuester pro User)
      const { data: currRows } = await sb
        .from('portfolio_snapshots')
        .select('user_id, total_value')
        .in('user_id', userIds)
        .eq('snapshot_date', today) as any;

      // Snapshot von vor 7 Tagen (oder nächstälterer)
      const { data: prevRows } = await sb
        .from('portfolio_snapshots')
        .select('user_id, total_value')
        .in('user_id', userIds)
        .eq('snapshot_date', weekAgoStr) as any;

      currByUser = new Map((currRows ?? []).map((r: any) => [r.user_id, r.total_value]));
      prevByUser = new Map((prevRows ?? []).map((r: any) => [r.user_id, r.total_value]));
    }

    // ── Personalisierte E-Mails senden ────────────────────────────────────────
    const ctaUrl = process.env.APP_URL ?? 'https://moneta-invest.de';
    const subject = 'Dein KI-Wochenbericht – Moneta';
    let sent = 0, failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < subscribers.length; i++) {
      const sub = subscribers[i];

      const totalValue     = currByUser.get(sub.userId);
      const prevValue      = prevByUser.get(sub.userId);
      const weeklyChange   = (totalValue !== undefined && prevValue !== undefined)
        ? totalValue - prevValue : undefined;
      const weeklyChangePct = (weeklyChange !== undefined && prevValue && prevValue > 0)
        ? (weeklyChange / prevValue) * 100 : undefined;

      const highlights = [
        'KI-gestützte Depot-Analyse – direkt in deiner App verfügbar',
        'Earnings-Kalender: nächste Quartalszahlen im Blick behalten',
        'Szenario-Analyse: simuliere Marktszenarien für dein Depot',
      ];

      const html = buildDigestHtml({
        userName:            sub.name,
        summary:             'hier ist deine wöchentliche Depot-Zusammenfassung.',
        highlights,
        ctaUrl,
        totalValue,
        weeklyChange,
        weeklyChangePercent: weeklyChangePct,
      });

      console.log(`[cron/weekly-digest] Sende an ${sub.email} (${i + 1}/${subscribers.length})…`);
      const result = await sendEmail({ to: sub.email, subject, html });

      if (result.success) {
        sent++;
        console.log(`[cron/weekly-digest] ✓ ${sub.email} (id: ${result.id})`);
      } else {
        failed++;
        const msg = `${sub.email}: ${result.error}`;
        errors.push(msg);
        console.error(`[cron/weekly-digest] ✗ ${msg}`);
      }

      if (i < subscribers.length - 1) await sleep(600);
    }

    console.log(`[cron/weekly-digest] Ergebnis: ${sent} versendet, ${failed} Fehler.`);
    errors.forEach((e) => console.error('[cron/weekly-digest] Versandfehler:', e));

    return res.status(200).json({
      ok: true, sent, failed,
      errors: errors.length ? errors : undefined,
    });

  } catch (e: any) {
    console.error('[cron/weekly-digest] Unerwarteter Fehler:', e?.message || e);
    return res.status(500).json({ error: 'Fehler beim Versand des Wochenberichts' });
  }
}
