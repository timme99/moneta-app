/**
 * lib/supabase-types.ts
 *
 * TypeScript-Typen für das Moneta-App Supabase-Schema.
 * Passen zum Schema in supabase/schema.sql.
 *
 * Tipp: Für vollständige Auto-Generated Types nutze:
 *   npx supabase gen types typescript --project-id <dein-project-id> > lib/supabase-types.ts
 */

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
      };

      ticker_mapping: {
        Row: {
          id: number;
          symbol: string;
          company_name: string;
          sector: string | null;
          industry: string | null;
          description_static: string | null;
          pe_ratio_static: number | null;
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
        };
        Update: {
          company_name?: string;
          sector?: string | null;
          industry?: string | null;
          description_static?: string | null;
          pe_ratio_static?: number | null;
          updated_at?: string;
        };
      };

      holdings: {
        Row: {
          id: string;
          user_id: string;
          ticker_id: number;
          shares: number;
          buy_price: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          ticker_id: number;
          shares: number;
          buy_price: number;
        };
        Update: {
          shares?: number;
          buy_price?: number;
          updated_at?: string;
        };
      };

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
    };
  };
}

// ── Hilfstypen ────────────────────────────────────────────────────────────────

export type Profile      = Database['public']['Tables']['profiles']['Row'];
export type TickerEntry  = Database['public']['Tables']['ticker_mapping']['Row'];
export type Holding      = Database['public']['Tables']['holdings']['Row'];
export type PriceCache   = Database['public']['Tables']['price_cache']['Row'];

/** Vollständige Kursantwort, die getFinancialData zurückgibt */
export interface FinancialDataResult {
  symbol: string;
  company_name: string;
  sector: string | null;
  industry: string | null;
  description: string | null;
  pe_ratio: number | null;
  price: number;
  currency: string;
  change: number;
  changePercent: number;
  volume: number;
  /** true = Daten kamen aus dem 60-Min-Cache */
  fromCache: boolean;
  /** ISO-Zeitstempel der letzten Preisaktualisierung */
  lastUpdated: string;
}
