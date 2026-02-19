/**
 * lib/supabaseClient.ts
 *
 * Zwei Supabase-Clients für die Moneta-App:
 *
 *  - supabase   → Anon-Key  | für Browser / clientseitigen Code (RLS greift)
 *  - supabaseAdmin → Service-Role-Key | NUR serverseitig! Bypasses RLS.
 *
 * Umgebungsvariablen (Moneta-App Projekt – NICHT das zweite Supabase-Projekt):
 *   MONETA_SUPABASE_URL
 *   MONETA_SUPABASE_ANON_KEY
 *   MONETA_SUPABASE_SERVICE_ROLE_KEY  ← nur serverseitig verwenden
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './supabase-types';

// ── Umgebungsvariablen ────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `[Moneta Supabase] Umgebungsvariable "${key}" fehlt. ` +
      `Bitte in .env (lokal) bzw. Vercel-Dashboard hinterlegen.`
    );
  }
  return value;
}

const SUPABASE_URL  = requireEnv('MONETA_SUPABASE_URL');
const ANON_KEY      = requireEnv('MONETA_SUPABASE_ANON_KEY');

// ── Public Client (Anon-Key, RLS aktiv) ──────────────────────────────────────

export const supabase: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  }
);

// ── Admin Client (Service-Role-Key, kein RLS) ─────────────────────────────────
// ACHTUNG: Nur in serverseitigem Code (Vercel Functions / API-Routes) nutzen!

let _adminClient: SupabaseClient<Database> | null = null;

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (_adminClient) return _adminClient;

  const serviceRoleKey = requireEnv('MONETA_SUPABASE_SERVICE_ROLE_KEY');

  _adminClient = createClient<Database>(SUPABASE_URL, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _adminClient;
}

// ── User-Session aus Authorization-Header ────────────────────────────────────

/**
 * Erstellt einen Supabase-Client, der mit dem JWT-Token des aktuellen Users
 * authentifiziert ist. Für serverseitige Auth-Checks in API-Routes.
 */
export function createClientWithToken(accessToken: string): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
