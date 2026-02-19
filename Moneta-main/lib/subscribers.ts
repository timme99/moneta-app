/**
 * Abonnenten für Newsletter / KI-Wochenbericht.
 * Nutzt getSupabaseAdmin (Service-Role-Key) – funktioniert ohne aktive User-Session.
 */

import { getSupabaseAdmin } from './supabaseClient';

export interface NewsletterSubscriber {
  email: string;
  name?: string;
  /** true = wöchentlicher KI-Digest gewünscht */
  weeklyDigest?: boolean;
  /** true = Newsletter bei Markt-Updates */
  autoNewsletter?: boolean;
}

/**
 * Holt alle User, die den wöchentlichen KI-Wochenbericht aktiviert haben.
 * Nutzt den Admin-Client (MONETA_SUPABASE_SERVICE_ROLE_KEY), damit der
 * Cron-Job auch ohne aktive Nutzer-Session funktioniert.
 */
export async function getSubscribersForDigest(): Promise<NewsletterSubscriber[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('newsletter_weekly_digest', true)
    .not('email', 'is', null);

  if (error) {
    console.error('[subscribers] getSubscribersForDigest:', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    email: row.email!,
    name: row.full_name ?? undefined,
    weeklyDigest: true,
  }));
}

/**
 * Holt alle User, die allgemeine Markt-Updates abonniert haben.
 */
export async function getSubscribersForNewsletter(): Promise<NewsletterSubscriber[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('newsletter_auto_updates', true)
    .not('email', 'is', null);

  if (error) {
    console.error('[subscribers] getSubscribersForNewsletter:', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    email: row.email!,
    name: row.full_name ?? undefined,
    autoNewsletter: true,
  }));
}
