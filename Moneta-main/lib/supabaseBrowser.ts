/**
 * lib/supabaseBrowser.ts
 *
 * Browser-seitiger Supabase-Client (Anon-Key, RLS aktiv).
 * Nutzt Vite-Umgebungsvariablen – in .env setzen:
 *   VITE_SUPABASE_URL=...
 *   VITE_SUPABASE_ANON_KEY=...
 *
 * ACHTUNG: Dieser Client ist NUR für den Browser gedacht (RLS schützt die Daten).
 * Für serverseitige Operationen → getSupabaseAdmin() aus supabaseClient.ts nutzen.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './supabase-types';

let _browserClient: SupabaseClient<Database> | null = null;

/**
 * Gibt den browser-seitigen Supabase-Client zurück.
 * Gibt null zurück, wenn die Umgebungsvariablen fehlen (z. B. noch nicht konfiguriert).
 */
export function getSupabaseBrowser(): SupabaseClient<Database> | null {
  if (_browserClient) return _browserClient;

  const url     = (import.meta as any).env?.VITE_SUPABASE_URL     as string | undefined;
  const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!url || !anonKey) {
    console.warn('[Moneta] VITE_SUPABASE_URL oder VITE_SUPABASE_ANON_KEY fehlt – Portfolio-Features deaktiviert.');
    return null;
  }

  _browserClient = createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  });

  return _browserClient;
}
