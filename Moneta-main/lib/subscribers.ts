/**
 * Abonnenten für Newsletter / KI-Wochenbericht.
 * Schritt 2: Hier die DB-Anbindung einbauen (z. B. Prisma, Drizzle, Supabase).
 */

export interface NewsletterSubscriber {
  email: string;
  name?: string;
  /** true = wöchentlicher KI-Digest gewünscht */
  weeklyDigest?: boolean;
  /** true = Newsletter bei Markt-Updates */
  autoNewsletter?: boolean;
}

/**
 * Holt alle Abonnenten, die den Newsletter bzw. Wochenbericht erhalten sollen.
 * Aktuell: Platzhalter (leeres Array). Später: DB-Abfrage, z. B.:
 *   SELECT email, name, settings->weeklyDigest FROM users WHERE settings->weeklyDigest = true
 */
export async function getSubscribersForDigest(): Promise<NewsletterSubscriber[]> {
  // TODO: Datenbank einbinden, z. B.:
  // const db = await getDb();
  // return db.user.findMany({ where: { settings: { path: ['weeklyDigest'], equals: true } }, select: { email: true, name: true } });
  return [];
}

/**
 * Holt alle Abonnenten für allgemeine Newsletter (z. B. Markt-Updates).
 */
export async function getSubscribersForNewsletter(): Promise<NewsletterSubscriber[]> {
  // TODO: wie getSubscribersForDigest, Filter auf autoNewsletter
  return [];
}
