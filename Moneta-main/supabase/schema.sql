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
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
  )
  ON CONFLICT (id) DO NOTHING;
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
-- Spalten für Newsletter-Einstellungen (werden nach initialem CREATE TABLE ergänzt)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS newsletter_weekly_digest  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS newsletter_auto_updates   BOOLEAN NOT NULL DEFAULT false;


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
-- 3. HOLDINGS – User-Portfolio mit RLS (inkl. Watchlist-Support)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.holdings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker_id   INTEGER     NOT NULL REFERENCES public.ticker_mapping(id) ON DELETE RESTRICT,
  watchlist   BOOLEAN     NOT NULL DEFAULT false,            -- true = Watchlist-Eintrag ohne Kaufdaten
  shares      NUMERIC(15, 6) CHECK (watchlist = true OR (shares IS NOT NULL AND shares > 0)),
  buy_price   NUMERIC(15, 4) CHECK (watchlist = true OR (buy_price IS NOT NULL AND buy_price > 0)),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, ticker_id)  -- Pro User nur eine Zeile je Ticker
);

-- Watchlist-Spalte und angepasste Constraints für bestehende Installationen
ALTER TABLE public.holdings
  ADD COLUMN IF NOT EXISTS watchlist BOOLEAN NOT NULL DEFAULT false;
-- Alte strikte Constraints entfernen (falls vorhanden) und durch watchlist-kompatible ersetzen
ALTER TABLE public.holdings
  DROP CONSTRAINT IF EXISTS holdings_shares_check,
  DROP CONSTRAINT IF EXISTS holdings_buy_price_check;
ALTER TABLE public.holdings
  ALTER COLUMN shares DROP NOT NULL,
  ALTER COLUMN buy_price DROP NOT NULL;
ALTER TABLE public.holdings
  DROP CONSTRAINT IF EXISTS holdings_shares_watchlist_check,
  DROP CONSTRAINT IF EXISTS holdings_buy_price_watchlist_check;
ALTER TABLE public.holdings
  ADD CONSTRAINT holdings_shares_watchlist_check
    CHECK (watchlist = true OR (shares IS NOT NULL AND shares > 0)),
  ADD CONSTRAINT holdings_buy_price_watchlist_check
    CHECK (watchlist = true OR (buy_price IS NOT NULL AND buy_price > 0));

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
-- INDEX-Optimierungen
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ticker_mapping_symbol       ON public.ticker_mapping (symbol);
CREATE INDEX IF NOT EXISTS idx_ticker_mapping_company_name ON public.ticker_mapping (LOWER(company_name));
CREATE INDEX IF NOT EXISTS idx_holdings_user_id            ON public.holdings (user_id);
CREATE INDEX IF NOT EXISTS idx_price_cache_ticker_id       ON public.price_cache (ticker_id);
CREATE INDEX IF NOT EXISTS idx_price_cache_last_updated    ON public.price_cache (last_updated);
