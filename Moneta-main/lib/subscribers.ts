/**
 * Abonnenten für Newsletter / KI-Wochenbericht / Tagesabschluss.
 * Nutzt getSupabaseAdmin (Service-Role-Key) – funktioniert ohne aktive User-Session.
 *
 * Filterung nach preferences-Keys erfolgt im JavaScript-Speicher (statt via
 * komplexer PostgREST-Typen), um TS2589 ("Type instantiation excessively deep")
 * zu vermeiden.
 */

import { getSupabaseAdmin } from './supabaseClient.js';

export interface NewsletterSubscriber {
  userId: string;
  email: string;
  name?: string;
  weeklyDigest?: boolean;
  dailyDigest?: boolean;
  autoNewsletter?: boolean;
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  preferences: Record<string, unknown> | null;
}

async function loadProfiles(): Promise<ProfileRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await (supabase
    .from('profiles')
    .select('id, email, full_name, preferences')
    .not('email', 'is', null) as unknown as Promise<{ data: ProfileRow[] | null; error: any }>);

  if (error) {
    console.error('[subscribers] loadProfiles:', error.message);
    return [];
  }
  return data ?? [];
}

export async function getSubscribersForDigest(): Promise<NewsletterSubscriber[]> {
  const rows = await loadProfiles();
  return rows
    .filter((r) => r.preferences?.weeklyReport === true)
    .map((r) => ({ userId: r.id, email: r.email, name: r.full_name ?? undefined, weeklyDigest: true }));
}

export async function getSubscribersForDailyDigest(): Promise<NewsletterSubscriber[]> {
  const rows = await loadProfiles();
  return rows
    .filter((r) => r.preferences?.dailyDigest === true)
    .map((r) => ({ userId: r.id, email: r.email, name: r.full_name ?? undefined, dailyDigest: true }));
}

export async function getSubscribersForNewsletter(): Promise<NewsletterSubscriber[]> {
  const rows = await loadProfiles();
  return rows
    .filter((r) => r.preferences?.autoNewsletter === true)
    .map((r) => ({ userId: r.id, email: r.email, name: r.full_name ?? undefined, autoNewsletter: true }));
}
