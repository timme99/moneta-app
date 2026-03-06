-- ============================================================
-- Moneta-App | Supabase Datenbank-Schema
-- Führe dieses Skript im Supabase SQL-Editor aus.
-- ============================================================

-- ============================================================
-- 1. PROFILES – Wird automatisch via Trigger befüllt
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT,
  full_name    TEXT,
  avatar_url   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger-Funktion: neuen Auth-User → Profile-Eintrag
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only insert the two guaranteed columns so a schema mismatch never
  -- crashes this trigger and blocks the Magic Link / sign-up flow.
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Silent failure: log but never let a profiles insert error propagate
  -- to the auth layer and cause a 500 on Magic Link / signUp.
  RAISE WARNING '[handle_new_user] profile insert failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Trigger: feuert nach jedem neuen Auth-User
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- RLS aktivieren
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: User sieht nur sein eigenes Profil
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Policy: User aktualisiert nur sein eigenes Profil
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================================
-- 1b. NEWSLETTER-PRÄFERENZEN – Erweiterung der profiles-Tabelle
-- ============================================================
-- Canonical column names used throughout the codebase.
-- Run migration-profile-prefs.sql to migrate data from old column names.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_digest_enabled  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS newsletter_subscribed  BOOLEAN NOT NULL DEFAULT false;


-- ============================================================
-- 2. TICKER MAPPING – Globale Stammdaten (alle User teilen diese)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ticker_mapping (
  id                  SERIAL      PRIMARY KEY,
  symbol              TEXT        NOT NULL UNIQUE,          -- z. B. "SAP.DE", "AAPL"
  company_name        TEXT        NOT NULL,                 -- z. B. "SAP SE"
  sector              TEXT,                                 -- z. B. "Technology"
  industry            TEXT,                                 -- z. B. "Software"
  description_static  TEXT,                                 -- Kurzbeschreibung
  pe_ratio_static     NUMERIC(10, 2),                       -- KGV (statisch, manuell gepflegt)
  competitors         TEXT,                                 -- Kommagetrennte Wettbewerber, z. B. "MSFT, GOOGL"
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Competitors-Spalte für bestehende Installationen ergänzen
ALTER TABLE public.ticker_mapping
  ADD COLUMN IF NOT EXISTS competitors TEXT;

-- Jeder angemeldete User darf lesen; Schreiben nur via Service-Role (Server)
ALTER TABLE public.ticker_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticker_mapping_select_authenticated"
  ON public.ticker_mapping FOR SELECT
  TO authenticated
  USING (true);

-- *** 10 DAX-Beispiele als Default-Daten ***
INSERT INTO public.ticker_mapping
  (symbol, company_name, sector, industry, description_static, pe_ratio_static)
VALUES
  (
    'SAP.DE', 'SAP SE',
    'Technology', 'Software',
    'Europas größtes Softwareunternehmen; führend bei ERP-, Cloud- und Business-Intelligence-Lösungen.',
    32.50
  ),
  (
    'SIE.DE', 'Siemens AG',
    'Industrials', 'Industrial Conglomerates',
    'Globaler Technologiekonzern mit Schwerpunkten in Automatisierung, Digitalisierung und Infrastruktur.',
    18.20
  ),
  (
    'BAS.DE', 'BASF SE',
    'Materials', 'Chemicals',
    'Weltgrößter Chemiekonzern; breit aufgestellt von Petrochemie bis Pflanzenschutz.',
    12.80
  ),
  (
    'BMW.DE', 'Bayerische Motoren Werke AG',
    'Consumer Discretionary', 'Automobiles',
    'Premiumhersteller von Automobilen und Motorrädern; stark im Bereich Elektromobilität.',
    6.10
  ),
  (
    'MBG.DE', 'Mercedes-Benz Group AG',
    'Consumer Discretionary', 'Automobiles',
    'Weltbekannter Premiumautomobilhersteller (ehem. Daimler); Fokus auf Luxus-E-Fahrzeuge.',
    5.80
  ),
  (
    'VOW3.DE', 'Volkswagen AG',
    'Consumer Discretionary', 'Automobiles',
    'Einer der weltgrößten Automobilkonzerne; Portfolio reicht von VW über Audi bis Porsche.',
    4.20
  ),
  (
    'ALV.DE', 'Allianz SE',
    'Financials', 'Insurance',
    'Einer der größten Versicherungs- und Vermögensverwaltungskonzerne weltweit.',
    11.40
  ),
  (
    'DBK.DE', 'Deutsche Bank AG',
    'Financials', 'Banks',
    'Größte deutsche Bank; umfassendes Angebot in Investment Banking, Privat- und Firmenkundengeschäft.',
    7.30
  ),
  (
    'BAYN.DE', 'Bayer AG',
    'Health Care', 'Pharmaceuticals',
    'Globaler Life-Science-Konzern; stark in Pharmazeutika (Aspirin, Xarelto) und Pflanzenschutz.',
    9.60
  ),
  (
    'IFX.DE', 'Infineon Technologies AG',
    'Technology', 'Semiconductors',
    'Führender Halbleiterhersteller; Fokus auf Energieeffizienz, Automotive und IoT-Sicherheit.',
    22.10
  )
ON CONFLICT (symbol) DO NOTHING;


-- ============================================================
-- 3. HOLDINGS – User-Portfolio (symbol-basiert, kein ticker_id FK)
-- ============================================================
-- Watchlist-Einträge: shares und buy_price sind NULL
-- Echte Positionen:   shares und buy_price gesetzt
CREATE TABLE IF NOT EXISTS public.holdings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol      TEXT        NOT NULL,                          -- Börsensymbol, z. B. "AAPL", "SAP.DE"
  shares      NUMERIC(15, 6),                               -- NULL = Watchlist-Eintrag
  buy_price   NUMERIC(15, 4),                               -- NULL = Watchlist-Eintrag
  buy_date    DATE,                                         -- optionales Kaufdatum
  notes       TEXT,                                         -- Investment-These / Notizen
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, symbol)                                  -- Pro User nur eine Zeile je Symbol
);

-- ── Migration für bestehende Installationen ───────────────────────────────────
-- Behandelt alle bekannten Vorgänger-Schemata:
--   a) Spalte 'ticker' TEXT (direkte Ticker-Speicherung) → umbenennen
--   b) Spalte 'ticker_id' INTEGER (FK auf ticker_mapping)  → nullable machen
--   c) Spalte 'symbol' fehlt noch                          → hinzufügen
--   d) UNIQUE-Constraint auf (user_id, symbol) fehlt       → hinzufügen
-- ─────────────────────────────────────────────────────────────────────────────

-- a) 'ticker' TEXT → 'symbol' umbenennen (wenn symbol noch nicht existiert)
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
    RAISE NOTICE 'holdings: Spalte ticker → symbol umbenannt';
  END IF;
END $$;

-- b) 'ticker_id' INTEGER → nullable + 'symbol' als Text-Spalte ergänzen
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'holdings'
      AND column_name = 'ticker_id'
  ) THEN
    ALTER TABLE public.holdings ALTER COLUMN ticker_id DROP NOT NULL;
    RAISE NOTICE 'holdings: ticker_id nullable gemacht';
  END IF;
END $$;

-- c) 'symbol' hinzufügen falls noch nicht vorhanden
ALTER TABLE public.holdings ADD COLUMN IF NOT EXISTS symbol TEXT;

-- c2) 'watchlist' boolean-Spalte entfernen falls vorhanden (jetzt UI-computed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'holdings'
      AND column_name = 'watchlist'
  ) THEN
    -- symbol aus watchlist ableiten falls leer (Fallback: id)
    UPDATE public.holdings SET symbol = COALESCE(symbol, id::text) WHERE symbol IS NULL;
    ALTER TABLE public.holdings DROP COLUMN IF EXISTS watchlist;
    RAISE NOTICE 'holdings: watchlist-Spalte entfernt';
  END IF;
END $$;

-- c3) symbol-Werte füllen (Fallback: UUID als Platzhalter, damit NOT NULL möglich)
UPDATE public.holdings SET symbol = COALESCE(symbol, id::text) WHERE symbol IS NULL;

-- c4) symbol NOT NULL setzen
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
ALTER TABLE public.holdings ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.holdings ALTER COLUMN shares DROP NOT NULL;
ALTER TABLE public.holdings ALTER COLUMN buy_price DROP NOT NULL;

-- e) Alte Check-Constraints entfernen (falls vorhanden)
ALTER TABLE public.holdings
  DROP CONSTRAINT IF EXISTS holdings_shares_check,
  DROP CONSTRAINT IF EXISTS holdings_buy_price_check,
  DROP CONSTRAINT IF EXISTS holdings_shares_watchlist_check,
  DROP CONSTRAINT IF EXISTS holdings_buy_price_watchlist_check;

-- f) UNIQUE-Constraint auf (user_id, symbol) hinzufügen falls nicht vorhanden
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
    ALTER TABLE public.holdings ADD CONSTRAINT holdings_user_symbol_unique UNIQUE (user_id, symbol);
    RAISE NOTICE 'holdings: UNIQUE(user_id, symbol) hinzugefügt';
  END IF;
END $$;

-- Automatisches updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS holdings_set_updated_at ON public.holdings;
CREATE TRIGGER holdings_set_updated_at
  BEFORE UPDATE ON public.holdings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS: User sieht/ändert nur eigene Positionen
ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holdings_select_own"
  ON public.holdings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "holdings_insert_own"
  ON public.holdings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "holdings_update_own"
  ON public.holdings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "holdings_delete_own"
  ON public.holdings FOR DELETE
  USING (auth.uid() = user_id);


-- ============================================================
-- 4. PRICE CACHE – Smart Cache (global, TTL 60 Min.)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.price_cache (
  id            SERIAL      PRIMARY KEY,
  ticker_id     INTEGER     NOT NULL UNIQUE REFERENCES public.ticker_mapping(id) ON DELETE CASCADE,
  price         NUMERIC(15, 4),
  last_updated  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Jeder Auth-User darf lesen; Schreiben nur via Service-Role
ALTER TABLE public.price_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_cache_select_authenticated"
  ON public.price_cache FOR SELECT
  TO authenticated
  USING (true);


-- ============================================================
-- 5. SUBSCRIBERS – Newsletter-Abonnenten (auch ohne Moneta-Account)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscribers (
  id              SERIAL      PRIMARY KEY,
  email           TEXT        NOT NULL UNIQUE,
  name            TEXT,
  weekly_digest   BOOLEAN     NOT NULL DEFAULT false,
  auto_newsletter BOOLEAN     NOT NULL DEFAULT false,
  confirmed       BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: Schreiben nur via Service-Role; Lesen gesperrt für normale User
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 6. NEWS CACHE – Gemini News-Sentiment (6-Stunden-TTL)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.news_cache (
  id          SERIAL      PRIMARY KEY,
  ticker      TEXT        NOT NULL UNIQUE,     -- kommaseparierte, sortierte Ticker-Symbole
  sentiment   TEXT,                            -- z. B. "positiv", "negativ", "neutral"
  summary     TEXT,                            -- KI-generierter Nachrichtentext
  cached_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: Lesen für authentifizierte User; Schreiben nur via Service-Role
ALTER TABLE public.news_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "news_cache_select_authenticated"
  ON public.news_cache FOR SELECT
  TO authenticated
  USING (true);


-- ============================================================
-- 7. PORTFOLIO SNAPSHOTS – Tägliche Depot-Wert-Historie
-- ============================================================
-- Ein Eintrag pro User und Tag (via Cron-Job).
-- total_value    = Gesamtwert des Depots zu Schlusskursen
-- total_invested = Summe aller Einstandswerte (Stückzahl × Kaufpreis)
-- Differenz → Performance (absolut + %)
CREATE TABLE IF NOT EXISTS public.portfolio_snapshots (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date  DATE        NOT NULL,
  total_value    NUMERIC(15, 2) NOT NULL,
  total_invested NUMERIC(15, 2),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, snapshot_date)
);

-- RLS: User sieht/ändert nur eigene Snapshots
ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshots_select_own"
  ON public.portfolio_snapshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "snapshots_insert_own"
  ON public.portfolio_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "snapshots_service_role"
  ON public.portfolio_snapshots FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- 8. SUBSCRIPTIONS – Premium-Pläne (Stripe)
-- ============================================================
-- plan: 'free' | 'premium' | 'pro'
-- valid_until NULL = läuft nicht ab (z. B. Jahres-Abo via Stripe managed)
-- stripe_customer_id + stripe_subscription_id für Webhook-Reconciliation
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan                   TEXT        NOT NULL DEFAULT 'free'
                           CHECK (plan IN ('free', 'premium', 'pro')),
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  valid_until            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at-Trigger
DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS: User liest eigene; Schreiben nur via Service-Role (Stripe Webhook)
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_select_own"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "subscriptions_service_role"
  ON public.subscriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- INDEX-Optimierungen
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ticker_mapping_symbol       ON public.ticker_mapping (symbol);
CREATE INDEX IF NOT EXISTS idx_ticker_mapping_company_name ON public.ticker_mapping (LOWER(company_name));
CREATE INDEX IF NOT EXISTS idx_holdings_user_id            ON public.holdings (user_id);
CREATE INDEX IF NOT EXISTS idx_price_cache_ticker_id       ON public.price_cache (ticker_id);
CREATE INDEX IF NOT EXISTS idx_price_cache_last_updated    ON public.price_cache (last_updated);
CREATE INDEX IF NOT EXISTS idx_news_cache_ticker           ON public.news_cache (ticker);
CREATE INDEX IF NOT EXISTS idx_news_cache_cached_at        ON public.news_cache (cached_at);
CREATE INDEX IF NOT EXISTS idx_snapshots_user_date         ON public.portfolio_snapshots (user_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user          ON public.subscriptions (user_id);
