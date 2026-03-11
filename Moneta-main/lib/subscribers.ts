/**
 * Abonnenten für Newsletter / KI-Wochenbericht.
 * Nutzt getSupabaseAdmin (Service-Role-Key) – funktioniert ohne aktive User-Session.
 *
 * Filterung nach preferences-Keys erfolgt im JavaScript-Speicher (statt via
 * komplexer PostgREST-Typen), um TS2589 ("Type instantiation excessively deep")
 * zu vermeiden.
 */

import { getSupabaseAdmin } from './supabaseClient.js';

export interface NewsletterSubscriber {
  email: string;
  name?: string;
  weeklyDigest?: boolean;
  autoNewsletter?: boolean;
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  preferences: Record<string, unknown> | null;
}

export async function getSubscribersForDigest(): Promise<NewsletterSubscriber[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await (supabase
    .from('profiles')
    .select('id, email, full_name, preferences')
    .not('email', 'is', null) as unknown as Promise<{ data: ProfileRow[] | null; error: any }>);

  if (error) {
    console.error('[subscribers] getSubscribersForDigest:', error.message);
    return [];
  }

  return (data ?? [])
    .filter((row) => row.preferences?.weeklyReport === true)
    .map((row) => ({
      email: row.email,
      name: row.full_name ?? undefined,
      weeklyDigest: true,
    }));
}

export async function getSubscribersForNewsletter(): Promise<NewsletterSubscriber[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await (supabase
    .from('profiles')
    .select('id, email, full_name, preferences')
    .not('email', 'is', null) as unknown as Promise<{ data: ProfileRow[] | null; error: any }>);

  if (error) {
    console.error('[subscribers] getSubscribersForNewsletter:', error.message);
    return [];
  }

  return (data ?? [])
    .filter((row) => row.preferences?.autoNewsletter === true)
    .map((row) => ({
      email: row.email,
      name: row.full_name ?? undefined,
      autoNewsletter: true,
    }));
}
