/**
 * Abonnenten für Newsletter / KI-Wochenbericht.
 * Nutzt getSupabaseAdmin (Service-Role-Key) – funktioniert ohne aktive User-Session.
 *
 * `as unknown as` casts on every query prevent TS2589
 * ("Type instantiation is excessively deep") and the "property does not exist"
 * errors that occur when generated types lag behind the live DB schema.
 */

import { getSupabaseAdmin } from './supabaseClient.js';

export interface NewsletterSubscriber {
  email: string;
  name?: string;
  weeklyDigest?: boolean;
  autoNewsletter?: boolean;
}

interface ProfileRow {
  email: string;
  full_name: string | null;
}

export async function getSubscribersForDigest(): Promise<NewsletterSubscriber[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('weekly_digest_enabled', true)
    .not('email', 'is', null) as unknown as { data: ProfileRow[] | null; error: any };

  if (error) {
    console.error('[subscribers] getSubscribersForDigest:', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    email: row.email,
    name: row.full_name ?? undefined,
    weeklyDigest: true,
  }));
}

export async function getSubscribersForNewsletter(): Promise<NewsletterSubscriber[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('newsletter_subscribed', true)
    .not('email', 'is', null) as unknown as { data: ProfileRow[] | null; error: any };

  if (error) {
    console.error('[subscribers] getSubscribersForNewsletter:', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    email: row.email,
    name: row.full_name ?? undefined,
    autoNewsletter: true,
  }));
}
