/**
 * Abonnenten für Newsletter / KI-Wochenbericht.
 * Liest Newsletter-Präferenzen direkt aus der Supabase profiles-Tabelle.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from './supabase-types';

export interface NewsletterSubscriber {
  email: string;
  name?: string;
  /** true = wöchentlicher KI-Digest gewünscht */
  weeklyDigest?: boolean;
  /** true = Newsletter bei Markt-Updates */
  autoNewsletter?: boolean;
}

function getAdminClient() {
  const url = process.env.MONETA_SUPABASE_URL;
  const key = process.env.MONETA_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase-Umgebungsvariablen fehlen (URL / SERVICE_ROLE_KEY)');
  return createClient<Database>(url, key);
}

/**
 * Holt alle User, die den wöchentlichen KI-Wochenbericht aktiviert haben.
 */
export async function getSubscribersForDigest(): Promise<NewsletterSubscriber[]> {
  const supabase = getAdminClient();
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
  const supabase = getAdminClient();
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
