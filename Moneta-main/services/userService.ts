
import { getSupabaseBrowser } from '../lib/supabaseBrowser';
import { UserAccount, PortfolioAnalysisReport, PortfolioHealthReport, PortfolioSavingsReport } from '../types';

export const userService = {
  // ── User profile (always from Supabase, never localStorage) ─────────────

  /**
   * Builds a UserAccount from a Supabase auth user + their profiles row.
   * Called after sign-up or sign-in to get the canonical account object.
   */
  async authenticate(email: string, name: string, supabaseId: string): Promise<UserAccount> {
    const sb = getSupabaseBrowser();

    let weeklyDigest = false;
    let autoNewsletter = false;

    if (sb && supabaseId) {
      const { data } = await sb
        .from('profiles')
        .select('weekly_digest_enabled, newsletter_subscribed')
        .eq('id', supabaseId)
        .single();
      if (data) {
        weeklyDigest   = (data as any).weekly_digest_enabled  ?? false;
        autoNewsletter = (data as any).newsletter_subscribed  ?? false;
      }
    }

    return {
      id: supabaseId,
      email,
      name,
      isLoggedIn: true,
      settings: {
        autoNewsletter,
        weeklyDigest,
        cloudSync: true,
      },
    };
  },

  /**
   * Returns the current user from the active Supabase session (no localStorage).
   */
  async fetchUserData(): Promise<UserAccount | null> {
    const sb = getSupabaseBrowser();
    if (!sb) return null;

    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user) return null;

    const u = session.user;
    const name =
      u.user_metadata?.full_name ??
      u.user_metadata?.name ??
      u.email?.split('@')[0] ??
      'Nutzer';

    return this.authenticate(u.email ?? '', name, u.id);
  },

  // ── Portfolio persistence (no-op: holdings come from Supabase) ──────────

  async savePortfolio(
    _userId: string,
    _report: PortfolioAnalysisReport | null,
    _health: PortfolioHealthReport | null,
    _savings: PortfolioSavingsReport | null,
  ): Promise<void> {
    // Portfolio analysis is ephemeral; holdings are persisted in Supabase via holdingsService.
    // No localStorage write needed.
  },
};
