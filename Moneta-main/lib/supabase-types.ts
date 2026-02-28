/**
 * lib/supabase-types.ts
 *
 * Re-exportiert alle Typen aus lib/database.types.ts – bestehende Imports
 * (`import type { Database } from './supabase-types'`) bleiben ohne Änderung gültig.
 *
 * Neue Importe bitte direkt aus './database.types' laden.
 */

export type {
  Database,
  Tables,
  InsertTables,
  UpdateTables,
} from './database.types.js';

import type { Database } from './database.types.js';

// ── Tabellen-Zeilentypen ──────────────────────────────────────────────────────

export type Profile      = Database['public']['Tables']['profiles']['Row'];
export type TickerEntry  = Database['public']['Tables']['ticker_mapping']['Row'];
export type Holding      = Database['public']['Tables']['holdings']['Row'];
export type PriceCache   = Database['public']['Tables']['price_cache']['Row'];
export type Subscriber   = Database['public']['Tables']['subscribers']['Row'];
export type NewsCache    = Database['public']['Tables']['news_cache']['Row'];

// ── API-Ergebnistypen ─────────────────────────────────────────────────────────

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
