/**
 * lib/database.types.ts
 *
 * Einzige Quelle für alle Supabase-Tabellen-Typen der Moneta-App.
 * Wird von lib/supabase-types.ts re-exportiert → bestehende Imports bleiben gültig.
 *
 * Tipp: Typen automatisch aus dem Supabase-Projekt generieren:
 *   npx supabase gen types typescript --project-id <dein-project-id> > lib/database.types.ts
 *
 * WICHTIG: @supabase/postgrest-js ≥ 2.x (GenericTable) erfordert:
 *  - Database['public'] mit Views / Functions / Enums / CompositeTypes
 *  - Jede Tabelle mit `Relationships: []` – fehlt dieses Feld, löst TypeScript
 *    alle Insert/Update-Typen als `never` auf (kein Fehler beim Lesen, aber
 *    upsert/insert/update schlägt bei der Typ-Prüfung fehl).
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
        Relationships: [];
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
        Relationships: [];
      };

      // ── holdings ──────────────────────────────────────────────────────────
      // Watchlist-Einträge haben shares = null und buy_price = null.
      // Echte Positionen haben shares > 0 und buy_price > 0.
      holdings: {
        Row: {
          id: string;
          user_id: string;
          symbol: string;
          name: string | null;
          shares: number | null;
          buy_price: number | null;
          buy_date: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          symbol: string;
          name?: string | null;
          shares?: number | null;
          buy_price?: number | null;
          buy_date?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string | null;
          shares?: number | null;
          buy_price?: number | null;
          buy_date?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
      };

      // ── portfolio_snapshots ───────────────────────────────────────────────
      // Tägliche Depot-Wert-Snapshots für historische Performance.
      // total_value    = Depotwert zu Tagesschlusskursen
      // total_invested = Summe aller Einstandswerte
      portfolio_snapshots: {
        Row: {
          id: string;
          user_id: string;
          snapshot_date: string;  // DATE als ISO-String 'YYYY-MM-DD'
          total_value: number;
          total_invested: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          snapshot_date: string;
          total_value: number;
          total_invested?: number | null;
          created_at?: string;
        };
        Update: {
          total_value?: number;
          total_invested?: number | null;
        };
        Relationships: [];
      };

      // ── subscriptions ─────────────────────────────────────────────────────
      // Premium-Pläne; wird via Stripe-Webhook befüllt.
      // plan: 'free' | 'premium' | 'pro'
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan: 'free' | 'premium' | 'pro';
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          valid_until: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan?: 'free' | 'premium' | 'pro';
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          valid_until?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          plan?: 'free' | 'premium' | 'pro';
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          valid_until?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      // ── news_cache ────────────────────────────────────────────────────────
      // Cached Gemini-Ergebnisse für News-Sentiment pro Ticker-Kombination.
      // Cache-Key = kommaseparierte, sortierte Ticker-Symbole (z. B. "AAPL,MSFT").
      // TTL: 6 Stunden (geprüft im Code, nicht per DB-Constraint).
      news_cache: {
        Row: {
          id: number;
          ticker: string;
          sentiment: string | null;
          summary: string | null;
          cached_at: string;
        };
        Insert: {
          ticker: string;
          sentiment?: string | null;
          summary?: string | null;
          cached_at?: string;
        };
        Update: {
          sentiment?: string | null;
          summary?: string | null;
          cached_at?: string;
        };
        Relationships: [];
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
