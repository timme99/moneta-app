/**
 * POST /api/auth/delete-account
 *
 * Deletes the authenticated user's account completely:
 *   1. Verifies the caller's JWT (from Authorization: Bearer <token>)
 *   2. Deletes the user from auth.users via the admin client
 *      → ON DELETE CASCADE removes profiles + holdings automatically
 *
 * Only the authenticated user can delete their own account.
 * No CRON_SECRET required – the user's own JWT is the auth proof.
 */
import { getSupabaseAdmin, createClientWithToken } from '../../lib/supabaseClient.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 1. Extract the user's JWT from the Authorization header ─────────────
  const authHeader = req.headers?.authorization ?? '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!accessToken) {
    return res.status(401).json({ error: 'Kein Authentifizierungstoken gefunden.' });
  }

  // ── 2. Verify the JWT and get the user's id ───────────────────────────────
  let userId: string;
  try {
    // createClientWithToken passes the token in the Authorization header,
    // so getUser() validates it against Supabase's JWT secret.
    const userClient = createClientWithToken(accessToken);
    const { data: { user }, error } = await userClient.auth.getUser();

    if (error || !user) {
      return res.status(401).json({ error: 'Ungültiger oder abgelaufener Token.' });
    }
    userId = user.id;
  } catch (e: any) {
    console.error('[delete-account] token verification failed:', e?.message);
    return res.status(401).json({ error: 'Token-Verifizierung fehlgeschlagen.' });
  }

  // ── 3. Delete the user via the admin client ───────────────────────────────
  // auth.users DELETE cascades to public.profiles and public.holdings.
  try {
    const admin = getSupabaseAdmin();
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error('[delete-account] deleteUser error:', deleteError.message);
      return res.status(500).json({ error: `Konto konnte nicht gelöscht werden: ${deleteError.message}` });
    }

    console.log(`[delete-account] user ${userId} deleted successfully`);
    return res.status(200).json({ ok: true, deleted: userId });
  } catch (e: any) {
    console.error('[delete-account] unexpected error:', e?.message || e);
    return res.status(500).json({ error: 'Interner Fehler beim Löschen des Kontos.' });
  }
}
