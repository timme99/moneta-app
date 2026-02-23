/**
 * lib/database.types.ts
 *
 * Einzige Quelle für alle Supabase-Tabellen-Typen der Moneta-App.
 * Wird von lib/supabase-types.ts re-exportiert → bestehende Imports bleiben gültig.
 *
 * Tipp: Typen automatisch aus dem Supabase-Projekt generieren:
 *   npx supabase gen types typescript --project-id <dein-project-id> > lib/database.types.ts
 *
 * WICHTIG: @supabase/postgrest-js ≥ 1.19 (PostgREST v12) erfordert, dass
 * Database['public'] die Felder Views / Functions / Enums / CompositeTypes
 * enthält. Fehlen sie, löst TypeScript ALLE Tabellen als `never` auf.
 */

export interface Database {
  public: {
    // ── Pflichtfelder für PostgREST v12 Typ-Inferenz ─────────────────────────
    // Leere Objekte sind ausreichend; ohne sie werden alle Tabellen als `never`
    // aufgelöst und man erhält "Property X does not exist on type 'never'".
    Views:          { [_ in never]: never };
    Functions:      { [_ in never]: never };
    Enums:          { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };

    Tables: {

      // ── profiles ──────────────────────────────────────────────────────────
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          newsletter_weekly_digest: boolean;
          newsletter_auto_updates: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          newsletter_weekly_digest?: boolean;
          newsletter_auto_updates?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          newsletter_weekly_digest?: boolean;
          newsletter_auto_updates?: boolean;
          updated_at?: string;
        };
      };

      // ── ticker_mapping ────────────────────────────────────────────────────
      ticker_mapping: {
        Row: {
          id: number;
          symbol: string;
          company_name: string;
          sector: string | null;
          industry: string | null;
          description_static: string | null;
          pe_ratio_static: number | null;
          competitors: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          symbol: string;
          company_name: string;
          sector?: string | null;
          industry?: string | null;
          description_static?: string | null;
          pe_ratio_static?: number | null;
          competitors?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          company_name?: string;
          sector?: string | null;
          industry?: string | null;
          description_static?: string | null;
          pe_ratio_static?: number | null;
          competitors?: string | null;
          updated_at?: string;
        };
      };

      // ── holdings ──────────────────────────────────────────────────────────
      holdings: {
        Row: {
          id: string;
          user_id: string;
          ticker_id: number;
          watchlist: boolean;
          shares: number | null;
          buy_price: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          ticker_id: number;
          watchlist?: boolean;
          shares?: number | null;
          buy_price?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          watchlist?: boolean;
          shares?: number | null;
          buy_price?: number | null;
          updated_at?: string;
        };
      };

      // ── price_cache ───────────────────────────────────────────────────────
      price_cache: {
        Row: {
          id: number;
          ticker_id: number;
          price: number | null;
          last_updated: string;
        };
        Insert: {
          ticker_id: number;
          price?: number | null;
          last_updated?: string;
        };
        Update: {
          price?: number | null;
          last_updated?: string;
        };
      };

      // ── subscribers ───────────────────────────────────────────────────────
      // Optionale dedizierte Tabelle für Newsletter-Abonnenten (ergänzt profiles).
      // Kann genutzt werden für externe Abonnenten ohne Moneta-Account.
      subscribers: {
        Row: {
          id: number;
          email: string;
          name: string | null;
          weekly_digest: boolean;
          auto_newsletter: boolean;
          confirmed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          email: string;
          name?: string | null;
          weekly_digest?: boolean;
          auto_newsletter?: boolean;
          confirmed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string | null;
          weekly_digest?: boolean;
          auto_newsletter?: boolean;
          confirmed?: boolean;
          updated_at?: string;
        };
      };
    };
  };
}

// ── Convenience-Typen ─────────────────────────────────────────────────────────

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
