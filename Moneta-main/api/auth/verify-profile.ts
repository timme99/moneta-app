/**
 * GET /api/auth/verify-profile
 *
 * Verifies that the on_auth_user_created trigger is working:
 * counts rows in the profiles table using the service-role key (bypasses RLS).
 * Returns the total count and the most recently created profile for diagnostics.
 *
 * Protected by CRON_SECRET – only intended for automated tests / internal tooling.
 */
import { getSupabaseAdmin } from '../../lib/supabaseClient.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET;
  const auth   = req.headers?.authorization ?? '';
  const token  = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!secret || token !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Total profile count
    const { count, error: countErr } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    if (countErr) {
      return res.status(500).json({ error: countErr.message });
    }

    // Most recent profile (for diagnostic purposes – no sensitive fields returned)
    const { data: latest } = await supabase
      .from('profiles')
      .select('id, created_at, weekly_digest_enabled, newsletter_subscribed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return res.status(200).json({
      ok: true,
      profileCount: count ?? 0,
      triggerWorking: (count ?? 0) > 0,
      latestProfile: latest ?? null,
    });
  } catch (e: any) {
    console.error('[verify-profile]', e?.message || e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
