-- ============================================================
-- Moneta – Holdings Migration Fix
-- Führe dieses Skript im Supabase SQL-Editor aus.
-- URL: https://app.supabase.com → Dein Projekt → SQL Editor → New query
-- ============================================================

-- a) 'ticker' TEXT → 'symbol' umbenennen (falls noch nicht passiert)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'holdings'
      AND column_name = 'ticker'
      AND data_type IN ('text', 'character varying')
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'holdings'
      AND column_name = 'symbol'
  ) THEN
    ALTER TABLE public.holdings RENAME COLUMN ticker TO symbol;
    RAISE NOTICE 'holdings: ticker → symbol umbenannt';
  END IF;
END $$;

-- b) 'ticker_id' nullable machen (falls Spalte existiert)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'holdings'
      AND column_name = 'ticker_id'
  ) THEN
    ALTER TABLE public.holdings ALTER COLUMN ticker_id DROP NOT NULL;
    RAISE NOTICE 'holdings: ticker_id nullable';
  END IF;
END $$;

-- c) 'symbol' Spalte hinzufügen falls fehlend
ALTER TABLE public.holdings ADD COLUMN IF NOT EXISTS symbol TEXT;

-- c2) 'watchlist' boolean-Spalte entfernen (jetzt computed aus shares IS NULL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'holdings'
      AND column_name = 'watchlist'
  ) THEN
    UPDATE public.holdings SET symbol = COALESCE(symbol, id::text) WHERE symbol IS NULL;
    ALTER TABLE public.holdings DROP COLUMN IF EXISTS watchlist;
    RAISE NOTICE 'holdings: watchlist-Spalte entfernt';
  END IF;
END $$;

-- c3) symbol-Werte füllen und NOT NULL setzen
UPDATE public.holdings SET symbol = COALESCE(symbol, id::text) WHERE symbol IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'holdings'
      AND column_name = 'symbol' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.holdings ALTER COLUMN symbol SET NOT NULL;
  END IF;
END $$;

-- d) Optionale Spalten ergänzen
ALTER TABLE public.holdings ADD COLUMN IF NOT EXISTS buy_date DATE;
ALTER TABLE public.holdings ADD COLUMN IF NOT EXISTS notes   TEXT;

-- e) shares + buy_price nullable machen (Watchlist-Einträge haben NULL)
ALTER TABLE public.holdings ALTER COLUMN shares    DROP NOT NULL;
ALTER TABLE public.holdings ALTER COLUMN buy_price DROP NOT NULL;

-- f) Alte Check-Constraints entfernen
ALTER TABLE public.holdings
  DROP CONSTRAINT IF EXISTS holdings_shares_check,
  DROP CONSTRAINT IF EXISTS holdings_buy_price_check,
  DROP CONSTRAINT IF EXISTS holdings_shares_watchlist_check,
  DROP CONSTRAINT IF EXISTS holdings_buy_price_watchlist_check;

-- g) UNIQUE(user_id, symbol) hinzufügen – das ist der kritische Constraint
--    ohne den der Upsert in holdingsService.ts fehlschlägt
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public' AND t.relname = 'holdings'
      AND c.contype = 'u'
      AND array_to_string(
            ARRAY(SELECT a.attname FROM pg_attribute a
                  WHERE a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
                  ORDER BY a.attnum), ',')
          = 'user_id,symbol'
  ) THEN
    -- Duplikate vorher bereinigen (behalte jeweils den ältesten Eintrag)
    DELETE FROM public.holdings h
    WHERE h.id NOT IN (
      SELECT DISTINCT ON (user_id, symbol) id
      FROM public.holdings
      ORDER BY user_id, symbol, created_at ASC
    );
    ALTER TABLE public.holdings
      ADD CONSTRAINT holdings_user_symbol_unique UNIQUE (user_id, symbol);
    RAISE NOTICE 'holdings: UNIQUE(user_id, symbol) hinzugefügt';
  END IF;
END $$;

-- h) RLS-Policies sicherstellen (idempotent)
ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holdings' AND policyname='holdings_select_own') THEN
    CREATE POLICY "holdings_select_own" ON public.holdings FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holdings' AND policyname='holdings_insert_own') THEN
    CREATE POLICY "holdings_insert_own" ON public.holdings FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holdings' AND policyname='holdings_update_own') THEN
    CREATE POLICY "holdings_update_own" ON public.holdings FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='holdings' AND policyname='holdings_delete_own') THEN
    CREATE POLICY "holdings_delete_own" ON public.holdings FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Fertig – prüfe das Ergebnis:
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'holdings'
ORDER BY ordinal_position;
