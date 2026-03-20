-- Migration: name-Spalte zur holdings-Tabelle hinzufügen
-- Führe dieses Script im Supabase SQL-Editor aus.
--
-- Zweck: Speichert den Firmennamen direkt in der holdings-Tabelle,
-- sodass er unabhängig von ticker_mapping immer verfügbar ist.

ALTER TABLE public.holdings
  ADD COLUMN IF NOT EXISTS name TEXT;

-- Bestehende Einträge aus ticker_mapping befüllen (best-effort)
UPDATE public.holdings h
SET    name = t.company_name
FROM   public.ticker_mapping t
WHERE  h.symbol = t.symbol
  AND  h.name IS NULL;

COMMENT ON COLUMN public.holdings.name IS
  'Firmenname, z. B. "Apple Inc." – denormalisierter Cache aus ticker_mapping, '
  'damit der Name auch ohne ticker_mapping-Eintrag angezeigt werden kann.';
