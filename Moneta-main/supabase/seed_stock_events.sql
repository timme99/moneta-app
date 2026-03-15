-- ============================================================
-- Moneta – Investieren mit Durchblick
-- SEED: stock_events – Dividenden & Earnings
-- ============================================================
-- Führe dieses Skript im Supabase SQL-Editor aus.
-- Es ist idempotent (ON CONFLICT DO UPDATE).
--
-- Inhalt:
--   1. Tabelle erstellen (falls nicht vorhanden)
--   2. DAX 40 Dividenden 2026
--   3. DAX 40 Quartalszahlen Q1/Q2 2026
--   4. Wichtige internationale Dividenden-Zahler
--   5. Scan-Sentinels (verhindert doppeltes KI-Scannen)
--
-- HINWEIS: Alle Termine sind KI-Schätzungen basierend auf
--   historischen Mustern. Keine Anlageberatung.
-- ============================================================


-- ============================================================
-- 1. TABELLE ERSTELLEN
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stock_events (
  id           SERIAL      PRIMARY KEY,
  symbol       TEXT        NOT NULL,
  event_type   TEXT        NOT NULL,
  event_date   DATE        NOT NULL,
  quarter      TEXT,
  details      JSONB       NOT NULL DEFAULT '{}',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (symbol, event_type, event_date)
);

ALTER TABLE public.stock_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'stock_events'
      AND policyname = 'stock_events_select_authenticated'
  ) THEN
    CREATE POLICY "stock_events_select_authenticated"
      ON public.stock_events FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stock_events_symbol    ON public.stock_events (symbol);
CREATE INDEX IF NOT EXISTS idx_stock_events_date      ON public.stock_events (event_date);
CREATE INDEX IF NOT EXISTS idx_stock_events_type_date ON public.stock_events (event_type, event_date);


-- ============================================================
-- 2. DAX 40 – DIVIDENDEN 2026
--    Ex-Dividenden-Datum = Tag nach der Hauptversammlung
--    Alle Angaben: Schätzungen auf Basis historischer Daten
-- ============================================================

INSERT INTO public.stock_events (symbol, event_type, event_date, quarter, details, last_updated) VALUES

-- ── Finanzwerte ────────────────────────────────────────────

('ALV.DE',   'dividend', '2026-05-08', NULL,
  '{"company":"Allianz SE","dividendPerShare":14.40,"currency":"EUR","dividendYield":3.8,"paymentDate":"2026-05-11","agmDate":"2026-05-07","isEstimated":true,"note":"KI-Schätzung; historisch ~14 € Dividende; Beschluss auf HV"}',
  NOW()),

('MUV2.DE',  'dividend', '2026-05-07', NULL,
  '{"company":"Munich Re","dividendPerShare":16.00,"currency":"EUR","dividendYield":3.5,"paymentDate":"2026-05-08","agmDate":"2026-05-06","isEstimated":true,"note":"KI-Schätzung; Munich Re zahlt zuverlässig steigende Dividende"}',
  NOW()),

('DBK.DE',   'dividend', '2026-05-22', NULL,
  '{"company":"Deutsche Bank AG","dividendPerShare":0.68,"currency":"EUR","dividendYield":2.8,"paymentDate":"2026-05-25","agmDate":"2026-05-21","isEstimated":true,"note":"KI-Schätzung; Deutsche Bank hat Dividendenziel erhöht"}',
  NOW()),

('CBK.DE',   'dividend', '2026-05-15', NULL,
  '{"company":"Commerzbank AG","dividendPerShare":0.45,"currency":"EUR","dividendYield":2.5,"paymentDate":"2026-05-18","agmDate":"2026-05-14","isEstimated":true,"note":"KI-Schätzung; Commerzbank resumiert Dividendenzahlungen"}',
  NOW()),

('HNR1.DE',  'dividend', '2026-05-08', NULL,
  '{"company":"Hannover Rück SE","dividendPerShare":8.50,"currency":"EUR","dividendYield":3.4,"paymentDate":"2026-05-11","agmDate":"2026-05-07","isEstimated":true,"note":"KI-Schätzung; inkl. möglicher Sonderdividende"}',
  NOW()),

-- ── Automobil ──────────────────────────────────────────────

('MBG.DE',   'dividend', '2026-04-23', NULL,
  '{"company":"Mercedes-Benz Group AG","dividendPerShare":5.30,"currency":"EUR","dividendYield":8.2,"paymentDate":"2026-04-24","agmDate":"2026-04-22","isEstimated":true,"note":"KI-Schätzung; hohe Dividendenrendite durch günstige Bewertung"}',
  NOW()),

('BMW.DE',   'dividend', '2026-05-12', NULL,
  '{"company":"BMW AG","dividendPerShare":5.80,"currency":"EUR","dividendYield":4.1,"paymentDate":"2026-05-13","agmDate":"2026-05-11","isEstimated":true,"note":"KI-Schätzung; BMW-Stammaktie; Vorzüge ggf. abweichend"}',
  NOW()),

('VOW3.DE',  'dividend', '2026-05-07', NULL,
  '{"company":"Volkswagen AG Vorzüge","dividendPerShare":4.50,"currency":"EUR","dividendYield":7.9,"paymentDate":"2026-05-08","agmDate":"2026-05-06","isEstimated":true,"note":"KI-Schätzung; Vorzugsaktie VOW3; Stammaktie VOW abweichend"}',
  NOW()),

('DTG.DE',   'dividend', '2026-04-16', NULL,
  '{"company":"Daimler Truck Holding AG","dividendPerShare":1.90,"currency":"EUR","dividendYield":4.8,"paymentDate":"2026-04-17","agmDate":"2026-04-15","isEstimated":true,"note":"KI-Schätzung; Daimler Truck seit 2022 eigenständig notiert"}',
  NOW()),

('P911.DE',  'dividend', '2026-05-22', NULL,
  '{"company":"Porsche AG","dividendPerShare":1.01,"currency":"EUR","dividendYield":2.6,"paymentDate":"2026-05-25","agmDate":"2026-05-21","isEstimated":true,"note":"KI-Schätzung; Porsche Stammaktie (nicht Holding PAH3)"}',
  NOW()),

-- ── Chemie & Pharma ────────────────────────────────────────

('BAS.DE',   'dividend', '2026-04-30', NULL,
  '{"company":"BASF SE","dividendPerShare":3.40,"currency":"EUR","dividendYield":6.9,"paymentDate":"2026-05-04","agmDate":"2026-04-29","isEstimated":true,"note":"KI-Schätzung; BASF hält Dividende trotz Transformationsphase"}',
  NOW()),

('MRK.DE',   'dividend', '2026-04-30', NULL,
  '{"company":"Merck KGaA","dividendPerShare":2.20,"currency":"EUR","dividendYield":1.4,"paymentDate":"2026-05-04","agmDate":"2026-04-29","isEstimated":true,"note":"KI-Schätzung; Merck KGaA (Chemie/Pharma, nicht US-Merck)"}',
  NOW()),

('BAYN.DE',  'dividend', '2026-04-24', NULL,
  '{"company":"Bayer AG","dividendPerShare":0.11,"currency":"EUR","dividendYield":0.6,"paymentDate":"2026-04-27","agmDate":"2026-04-23","isEstimated":true,"note":"KI-Schätzung; Bayer hat Dividende stark gesenkt (Glyphosat-Belastung)"}',
  NOW()),

('SY1.DE',   'dividend', '2026-06-12', NULL,
  '{"company":"Symrise AG","dividendPerShare":1.15,"currency":"EUR","dividendYield":1.3,"paymentDate":"2026-06-15","agmDate":"2026-06-11","isEstimated":true,"note":"KI-Schätzung; Symrise wächst Dividende jährlich"}',
  NOW()),

-- ── Industrie & Technologie ────────────────────────────────

('SIE.DE',   'dividend', '2027-02-05', NULL,
  '{"company":"Siemens AG","dividendPerShare":5.20,"currency":"EUR","dividendYield":2.1,"paymentDate":"2027-02-06","agmDate":"2027-02-04","isEstimated":true,"note":"KI-Schätzung; Siemens FJ endet September → HV im Februar; 2026 bereits ausgezahlt"}',
  NOW()),

('SAP.DE',   'dividend', '2026-05-22', NULL,
  '{"company":"SAP SE","dividendPerShare":2.35,"currency":"EUR","dividendYield":1.0,"paymentDate":"2026-05-25","agmDate":"2026-05-21","isEstimated":true,"note":"KI-Schätzung; SAP zahlt jährliche Dividende nach HV"}',
  NOW()),

('IFX.DE',   'dividend', '2026-02-26', NULL,
  '{"company":"Infineon Technologies AG","dividendPerShare":0.35,"currency":"EUR","dividendYield":1.2,"paymentDate":"2026-02-27","agmDate":"2026-02-25","isEstimated":true,"note":"KI-Schätzung; Infineon FJ endet September → HV im Februar"}',
  NOW()),

('BNR.DE',   'dividend', '2026-06-05', NULL,
  '{"company":"Brenntag SE","dividendPerShare":1.85,"currency":"EUR","dividendYield":3.8,"paymentDate":"2026-06-08","agmDate":"2026-06-04","isEstimated":true,"note":"KI-Schätzung; Brenntag zahlt stetig wachsende Dividende"}',
  NOW()),

('HDMG.DE',  'dividend', '2026-05-07', NULL,
  '{"company":"HeidelbergMaterials AG","dividendPerShare":3.20,"currency":"EUR","dividendYield":3.3,"paymentDate":"2026-05-08","agmDate":"2026-05-06","isEstimated":true,"note":"KI-Schätzung; früher HeidelbergCement"}',
  NOW()),

('CON.DE',   'dividend', '2026-04-30', NULL,
  '{"company":"Continental AG","dividendPerShare":1.50,"currency":"EUR","dividendYield":3.5,"paymentDate":"2026-05-04","agmDate":"2026-04-29","isEstimated":true,"note":"KI-Schätzung; Continental reduzierte Dividende in Restrukturierungsphase"}',
  NOW()),

('SRT3.DE',  'dividend', '2026-03-26', NULL,
  '{"company":"Sartorius AG Vorzüge","dividendPerShare":0.74,"currency":"EUR","dividendYield":0.5,"paymentDate":"2026-03-27","agmDate":"2026-03-25","isEstimated":true,"note":"KI-Schätzung; Sartorius HV typisch März"}',
  NOW()),

-- ── Versorger & Immobilien ─────────────────────────────────

('RWE.DE',   'dividend', '2026-04-24', NULL,
  '{"company":"RWE AG","dividendPerShare":1.09,"currency":"EUR","dividendYield":3.5,"paymentDate":"2026-04-27","agmDate":"2026-04-23","isEstimated":true,"note":"KI-Schätzung; RWE plant Dividende von 1,09 € für 2025"}',
  NOW()),

('EOAN.DE',  'dividend', '2026-05-08', NULL,
  '{"company":"E.ON SE","dividendPerShare":0.55,"currency":"EUR","dividendYield":4.5,"paymentDate":"2026-05-11","agmDate":"2026-05-07","isEstimated":true,"note":"KI-Schätzung; E.ON zahlt verlässliche Dividende"}',
  NOW()),

('VNA.DE',   'dividend', '2026-04-30', NULL,
  '{"company":"Vonovia SE","dividendPerShare":1.22,"currency":"EUR","dividendYield":3.9,"paymentDate":"2026-05-04","agmDate":"2026-04-29","isEstimated":true,"note":"KI-Schätzung; Vonovia hat Dividende nach Restrukturierung stabilisiert"}',
  NOW()),

-- ── Telekommunikation & Post ───────────────────────────────

('DTE.DE',   'dividend', '2026-04-09', NULL,
  '{"company":"Deutsche Telekom AG","dividendPerShare":0.90,"currency":"EUR","dividendYield":3.6,"paymentDate":"2026-04-14","agmDate":"2026-04-08","isEstimated":true,"note":"KI-Schätzung; Telekom erhöht Dividende jährlich im Rahmen des Wachstumsprogramms"}',
  NOW()),

('DHL.DE',   'dividend', '2026-05-07', NULL,
  '{"company":"DHL Group","dividendPerShare":1.85,"currency":"EUR","dividendYield":4.7,"paymentDate":"2026-05-11","agmDate":"2026-05-06","isEstimated":true,"note":"KI-Schätzung; früher Deutsche Post, seit 2023 DHL Group"}',
  NOW()),

-- ── Konsumgüter ────────────────────────────────────────────

('BEI.DE',   'dividend', '2026-04-23', NULL,
  '{"company":"Beiersdorf AG","dividendPerShare":1.00,"currency":"EUR","dividendYield":0.9,"paymentDate":"2026-04-24","agmDate":"2026-04-22","isEstimated":true,"note":"KI-Schätzung; Beiersdorf konservative Dividendenpolitik (Nivea, Eucerin)"}',
  NOW()),

('HEN3.DE',  'dividend', '2026-04-17', NULL,
  '{"company":"Henkel AG & Co. KGaA Vorzüge","dividendPerShare":1.85,"currency":"EUR","dividendYield":2.5,"paymentDate":"2026-04-20","agmDate":"2026-04-16","isEstimated":true,"note":"KI-Schätzung; Henkel Vorzugsaktie HEN3"}',
  NOW()),

-- ── Gesundheit ─────────────────────────────────────────────

('FRE.DE',   'dividend', '2026-05-22', NULL,
  '{"company":"Fresenius SE & Co. KGaA","dividendPerShare":0.92,"currency":"EUR","dividendYield":2.4,"paymentDate":"2026-05-25","agmDate":"2026-05-21","isEstimated":true,"note":"KI-Schätzung; Fresenius stabilisiert Dividende nach Portfoliobereinigung"}',
  NOW()),

-- ── Rüstung & Luftfahrt ────────────────────────────────────

('AIR.DE',   'dividend', '2026-04-16', NULL,
  '{"company":"Airbus SE","dividendPerShare":1.80,"currency":"EUR","dividendYield":1.4,"paymentDate":"2026-04-17","agmDate":"2026-04-15","isEstimated":true,"note":"KI-Schätzung; Airbus zahlt einmal jährlich nach HV"}',
  NOW()),

('RHM.DE',   'dividend', '2026-05-07', NULL,
  '{"company":"Rheinmetall AG","dividendPerShare":5.70,"currency":"EUR","dividendYield":1.8,"paymentDate":"2026-05-08","agmDate":"2026-05-06","isEstimated":true,"note":"KI-Schätzung; Rheinmetall profitiert von Verteidigungsbudgeterhöhungen"}',
  NOW())

ON CONFLICT (symbol, event_type, event_date) DO UPDATE
  SET details      = EXCLUDED.details,
      last_updated = NOW();


-- ============================================================
-- 2b. DAX 40 + INTERNATIONAL – DIVIDENDEN 2025 (historisch)
--     Tatsächlich gezahlte Dividenden auf Basis FJ 2024
--     isEstimated: false für alle Einträge
-- ============================================================

INSERT INTO public.stock_events (symbol, event_type, event_date, quarter, details, last_updated)
VALUES

-- ── Feb 2025: FJ endet Sep (Siemens, Infineon) ────────────

('SIE.DE',  'dividend', '2025-02-06', NULL,
  '{"company":"Siemens AG","dividendPerShare":5.20,"currency":"EUR","dividendYield":2.0,"paymentDate":"2025-02-06","agmDate":"2025-02-05","isEstimated":false,"note":"FJ endet Sep 2024; HV Feb 2025"}',
  NOW()),

('IFX.DE',  'dividend', '2025-02-28', NULL,
  '{"company":"Infineon Technologies AG","dividendPerShare":0.35,"currency":"EUR","dividendYield":1.2,"paymentDate":"2025-02-28","agmDate":"2025-02-27","isEstimated":false,"note":"FJ endet Sep 2024; HV Feb 2025"}',
  NOW()),

-- ── Versicherungen ─────────────────────────────────────────

('ALV.DE',  'dividend', '2025-05-09', NULL,
  '{"company":"Allianz SE","dividendPerShare":15.40,"currency":"EUR","dividendYield":3.9,"paymentDate":"2025-05-09","agmDate":"2025-05-07","isEstimated":false,"note":"FJ 2024; Dividende auf 15,40 € erhöht"}',
  NOW()),

('MUV2.DE', 'dividend', '2025-05-08', NULL,
  '{"company":"Munich Re","dividendPerShare":15.00,"currency":"EUR","dividendYield":3.4,"paymentDate":"2025-05-08","agmDate":"2025-05-06","isEstimated":false,"note":"FJ 2024; starkes versicherungstechnisches Ergebnis"}',
  NOW()),

('HNR1.DE', 'dividend', '2025-05-08', NULL,
  '{"company":"Hannover Rück SE","dividendPerShare":7.20,"currency":"EUR","dividendYield":3.3,"paymentDate":"2025-05-08","agmDate":"2025-05-06","isEstimated":false,"note":"FJ 2024; inkl. Sonderkomponente"}',
  NOW()),

-- ── Banken ─────────────────────────────────────────────────

('DBK.DE',  'dividend', '2025-05-26', NULL,
  '{"company":"Deutsche Bank AG","dividendPerShare":0.45,"currency":"EUR","dividendYield":2.1,"paymentDate":"2025-05-26","agmDate":"2025-05-22","isEstimated":false,"note":"FJ 2024; Deutsche Bank erhöht Dividende"}',
  NOW()),

('CBK.DE',  'dividend', '2025-05-19', NULL,
  '{"company":"Commerzbank AG","dividendPerShare":0.35,"currency":"EUR","dividendYield":2.0,"paymentDate":"2025-05-19","agmDate":"2025-05-15","isEstimated":false,"note":"FJ 2024; Commerzbank mit deutlichem Gewinnwachstum"}',
  NOW()),

-- ── Automobil ──────────────────────────────────────────────

('MBG.DE',  'dividend', '2025-04-25', NULL,
  '{"company":"Mercedes-Benz Group AG","dividendPerShare":5.30,"currency":"EUR","dividendYield":8.0,"paymentDate":"2025-04-25","agmDate":"2025-04-23","isEstimated":false,"note":"FJ 2024; hohe Dividendenrendite trotz Gewinnrückgang"}',
  NOW()),

('BMW.DE',  'dividend', '2025-05-16', NULL,
  '{"company":"BMW AG","dividendPerShare":5.80,"currency":"EUR","dividendYield":4.1,"paymentDate":"2025-05-16","agmDate":"2025-05-14","isEstimated":false,"note":"FJ 2024; BMW Stammaktie"}',
  NOW()),

('VOW3.DE', 'dividend', '2025-05-08', NULL,
  '{"company":"Volkswagen AG Vorzüge","dividendPerShare":4.50,"currency":"EUR","dividendYield":7.8,"paymentDate":"2025-05-08","agmDate":"2025-05-06","isEstimated":false,"note":"FJ 2024; Vorzugsaktie VOW3"}',
  NOW()),

('DTG.DE',  'dividend', '2025-04-17', NULL,
  '{"company":"Daimler Truck Holding AG","dividendPerShare":1.90,"currency":"EUR","dividendYield":4.6,"paymentDate":"2025-04-17","agmDate":"2025-04-15","isEstimated":false,"note":"FJ 2024; Daimler Truck eigenständig seit 2022"}',
  NOW()),

('P911.DE', 'dividend', '2025-05-26', NULL,
  '{"company":"Porsche AG","dividendPerShare":1.01,"currency":"EUR","dividendYield":2.5,"paymentDate":"2025-05-26","agmDate":"2025-05-21","isEstimated":false,"note":"FJ 2024; Porsche Stammaktie"}',
  NOW()),

-- ── Chemie & Pharma ────────────────────────────────────────

('BAS.DE',  'dividend', '2025-05-02', NULL,
  '{"company":"BASF SE","dividendPerShare":3.40,"currency":"EUR","dividendYield":6.8,"paymentDate":"2025-05-02","agmDate":"2025-04-29","isEstimated":false,"note":"FJ 2024; BASF hält Dividende trotz Restrukturierung"}',
  NOW()),

('MRK.DE',  'dividend', '2025-05-02', NULL,
  '{"company":"Merck KGaA","dividendPerShare":2.20,"currency":"EUR","dividendYield":1.3,"paymentDate":"2025-05-02","agmDate":"2025-04-29","isEstimated":false,"note":"FJ 2024; Merck KGaA (Chemie/Pharma)"}',
  NOW()),

('BAYN.DE', 'dividend', '2025-04-25', NULL,
  '{"company":"Bayer AG","dividendPerShare":0.11,"currency":"EUR","dividendYield":0.6,"paymentDate":"2025-04-25","agmDate":"2025-04-23","isEstimated":false,"note":"FJ 2024; Bayer stark gesenkt durch Glyphosat-Belastungen"}',
  NOW()),

('SY1.DE',  'dividend', '2025-06-16', NULL,
  '{"company":"Symrise AG","dividendPerShare":1.15,"currency":"EUR","dividendYield":1.3,"paymentDate":"2025-06-16","agmDate":"2025-06-12","isEstimated":false,"note":"FJ 2024; Symrise mit stetiger Dividendenerhöhung"}',
  NOW()),

-- ── Technologie ────────────────────────────────────────────

('SAP.DE',  'dividend', '2025-05-26', NULL,
  '{"company":"SAP SE","dividendPerShare":2.35,"currency":"EUR","dividendYield":1.0,"paymentDate":"2025-05-26","agmDate":"2025-05-21","isEstimated":false,"note":"FJ 2024; SAP wächst als Cloud-Unternehmen"}',
  NOW()),

-- ── Industrie ──────────────────────────────────────────────

('BNR.DE',  'dividend', '2025-06-09', NULL,
  '{"company":"Brenntag SE","dividendPerShare":1.85,"currency":"EUR","dividendYield":3.7,"paymentDate":"2025-06-09","agmDate":"2025-06-05","isEstimated":false,"note":"FJ 2024; Brenntag mit stabiler Dividende"}',
  NOW()),

('HDMG.DE', 'dividend', '2025-05-08', NULL,
  '{"company":"HeidelbergMaterials AG","dividendPerShare":3.20,"currency":"EUR","dividendYield":3.2,"paymentDate":"2025-05-08","agmDate":"2025-05-06","isEstimated":false,"note":"FJ 2024; früher HeidelbergCement"}',
  NOW()),

('CON.DE',  'dividend', '2025-04-28', NULL,
  '{"company":"Continental AG","dividendPerShare":2.20,"currency":"EUR","dividendYield":4.0,"paymentDate":"2025-04-28","agmDate":"2025-04-24","isEstimated":false,"note":"FJ 2024; Continental unter Transformationsdruck"}',
  NOW()),

('SRT3.DE', 'dividend', '2025-05-02', NULL,
  '{"company":"Sartorius AG Vorzüge","dividendPerShare":0.74,"currency":"EUR","dividendYield":0.5,"paymentDate":"2025-05-02","agmDate":"2025-04-29","isEstimated":false,"note":"FJ 2024; Sartorius Vorzugsaktie SRT3"}',
  NOW()),

-- ── Energie & Versorger ────────────────────────────────────

('RWE.DE',  'dividend', '2025-04-28', NULL,
  '{"company":"RWE AG","dividendPerShare":1.09,"currency":"EUR","dividendYield":3.5,"paymentDate":"2025-04-28","agmDate":"2025-04-24","isEstimated":false,"note":"FJ 2024; RWE mit stabilem Versorgergeschäft"}',
  NOW()),

('EOAN.DE', 'dividend', '2025-05-09', NULL,
  '{"company":"E.ON SE","dividendPerShare":0.53,"currency":"EUR","dividendYield":4.3,"paymentDate":"2025-05-09","agmDate":"2025-05-07","isEstimated":false,"note":"FJ 2024; E.ON zahlt verlässliche Dividende"}',
  NOW()),

('VNA.DE',  'dividend', '2025-05-02', NULL,
  '{"company":"Vonovia SE","dividendPerShare":0.90,"currency":"EUR","dividendYield":3.0,"paymentDate":"2025-05-02","agmDate":"2025-04-29","isEstimated":false,"note":"FJ 2024; Vonovia nach Restrukturierung stabilisiert"}',
  NOW()),

-- ── Telekommunikation & Post ───────────────────────────────

('DTE.DE',  'dividend', '2025-04-11', NULL,
  '{"company":"Deutsche Telekom AG","dividendPerShare":0.90,"currency":"EUR","dividendYield":3.5,"paymentDate":"2025-04-11","agmDate":"2025-04-09","isEstimated":false,"note":"FJ 2024; Telekom erhöht Dividende kontinuierlich"}',
  NOW()),

('DHL.DE',  'dividend', '2025-05-08', NULL,
  '{"company":"DHL Group","dividendPerShare":1.85,"currency":"EUR","dividendYield":4.6,"paymentDate":"2025-05-08","agmDate":"2025-05-06","isEstimated":false,"note":"FJ 2024; DHL Group (früher Deutsche Post)"}',
  NOW()),

-- ── Konsumgüter ────────────────────────────────────────────

('BEI.DE',  'dividend', '2025-04-24', NULL,
  '{"company":"Beiersdorf AG","dividendPerShare":1.00,"currency":"EUR","dividendYield":0.9,"paymentDate":"2025-04-24","agmDate":"2025-04-23","isEstimated":false,"note":"FJ 2024; Beiersdorf konservative Dividendenpolitik"}',
  NOW()),

('HEN3.DE', 'dividend', '2025-04-17', NULL,
  '{"company":"Henkel AG & Co. KGaA Vorzüge","dividendPerShare":1.85,"currency":"EUR","dividendYield":2.5,"paymentDate":"2025-04-17","agmDate":"2025-04-16","isEstimated":false,"note":"FJ 2024; Henkel Vorzugsaktie HEN3"}',
  NOW()),

-- ── Gesundheit ─────────────────────────────────────────────

('FRE.DE',  'dividend', '2025-05-26', NULL,
  '{"company":"Fresenius SE & Co. KGaA","dividendPerShare":0.92,"currency":"EUR","dividendYield":2.3,"paymentDate":"2025-05-26","agmDate":"2025-05-22","isEstimated":false,"note":"FJ 2024; Fresenius stabilisiert Dividende"}',
  NOW()),

-- ── Rüstung & Luftfahrt ────────────────────────────────────

('AIR.DE',  'dividend', '2025-04-17', NULL,
  '{"company":"Airbus SE","dividendPerShare":1.80,"currency":"EUR","dividendYield":1.4,"paymentDate":"2025-04-17","agmDate":"2025-04-16","isEstimated":false,"note":"FJ 2024; Airbus zahlt einmal jährlich"}',
  NOW()),

('RHM.DE',  'dividend', '2025-05-08', NULL,
  '{"company":"Rheinmetall AG","dividendPerShare":5.70,"currency":"EUR","dividendYield":1.3,"paymentDate":"2025-05-08","agmDate":"2025-05-06","isEstimated":false,"note":"FJ 2024; Rheinmetall profitiert von Verteidigungsbudgets"}',
  NOW()),

-- ── US-Aktien: quartalsweise 2025 ──────────────────────────
-- Apple Inc. (AAPL) – Feb / Mai / Aug / Nov

('AAPL', 'dividend', '2025-02-13', NULL,
  '{"company":"Apple Inc.","dividendPerShare":0.25,"currency":"USD","dividendYield":0.5,"paymentDate":"2025-02-13","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('AAPL', 'dividend', '2025-05-15', NULL,
  '{"company":"Apple Inc.","dividendPerShare":0.25,"currency":"USD","dividendYield":0.5,"paymentDate":"2025-05-15","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('AAPL', 'dividend', '2025-08-14', NULL,
  '{"company":"Apple Inc.","dividendPerShare":0.26,"currency":"USD","dividendYield":0.5,"paymentDate":"2025-08-14","isEstimated":false,"frequency":"quarterly","note":"Q3 2025; Dividende erhöht"}',
  NOW()),
('AAPL', 'dividend', '2025-11-13', NULL,
  '{"company":"Apple Inc.","dividendPerShare":0.26,"currency":"USD","dividendYield":0.5,"paymentDate":"2025-11-13","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- Microsoft (MSFT) – Mär / Jun / Sep / Dez

('MSFT', 'dividend', '2025-03-13', NULL,
  '{"company":"Microsoft Corp.","dividendPerShare":0.75,"currency":"USD","dividendYield":0.8,"paymentDate":"2025-03-13","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('MSFT', 'dividend', '2025-06-12', NULL,
  '{"company":"Microsoft Corp.","dividendPerShare":0.75,"currency":"USD","dividendYield":0.8,"paymentDate":"2025-06-12","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('MSFT', 'dividend', '2025-09-11', NULL,
  '{"company":"Microsoft Corp.","dividendPerShare":0.83,"currency":"USD","dividendYield":0.9,"paymentDate":"2025-09-11","isEstimated":false,"frequency":"quarterly","note":"Q3 2025; Dividende erhöht"}',
  NOW()),
('MSFT', 'dividend', '2025-12-11', NULL,
  '{"company":"Microsoft Corp.","dividendPerShare":0.83,"currency":"USD","dividendYield":0.9,"paymentDate":"2025-12-11","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- Johnson & Johnson (JNJ) – Mär / Jun / Sep / Dez

('JNJ', 'dividend', '2025-03-04', NULL,
  '{"company":"Johnson & Johnson","dividendPerShare":1.24,"currency":"USD","dividendYield":3.2,"paymentDate":"2025-03-04","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('JNJ', 'dividend', '2025-06-03', NULL,
  '{"company":"Johnson & Johnson","dividendPerShare":1.24,"currency":"USD","dividendYield":3.2,"paymentDate":"2025-06-03","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('JNJ', 'dividend', '2025-09-02', NULL,
  '{"company":"Johnson & Johnson","dividendPerShare":1.30,"currency":"USD","dividendYield":3.3,"paymentDate":"2025-09-02","isEstimated":false,"frequency":"quarterly","note":"Q3 2025; Dividende erhöht"}',
  NOW()),
('JNJ', 'dividend', '2025-12-02', NULL,
  '{"company":"Johnson & Johnson","dividendPerShare":1.30,"currency":"USD","dividendYield":3.3,"paymentDate":"2025-12-02","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- Procter & Gamble (PG) – Feb / Mai / Aug / Nov

('PG', 'dividend', '2025-02-14', NULL,
  '{"company":"Procter & Gamble Co.","dividendPerShare":1.0568,"currency":"USD","dividendYield":2.3,"paymentDate":"2025-02-14","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('PG', 'dividend', '2025-05-15', NULL,
  '{"company":"Procter & Gamble Co.","dividendPerShare":1.0568,"currency":"USD","dividendYield":2.3,"paymentDate":"2025-05-15","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('PG', 'dividend', '2025-08-15', NULL,
  '{"company":"Procter & Gamble Co.","dividendPerShare":1.10,"currency":"USD","dividendYield":2.4,"paymentDate":"2025-08-15","isEstimated":false,"frequency":"quarterly","note":"Q3 2025; Dividende erhöht"}',
  NOW()),
('PG', 'dividend', '2025-11-14', NULL,
  '{"company":"Procter & Gamble Co.","dividendPerShare":1.10,"currency":"USD","dividendYield":2.4,"paymentDate":"2025-11-14","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- Coca-Cola (KO) – Jan / Apr / Jul / Okt

('KO', 'dividend', '2025-01-15', NULL,
  '{"company":"The Coca-Cola Co.","dividendPerShare":0.51,"currency":"USD","dividendYield":2.9,"paymentDate":"2025-01-15","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('KO', 'dividend', '2025-04-01', NULL,
  '{"company":"The Coca-Cola Co.","dividendPerShare":0.51,"currency":"USD","dividendYield":2.9,"paymentDate":"2025-04-01","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('KO', 'dividend', '2025-07-01', NULL,
  '{"company":"The Coca-Cola Co.","dividendPerShare":0.515,"currency":"USD","dividendYield":3.0,"paymentDate":"2025-07-01","isEstimated":false,"frequency":"quarterly","note":"Q3 2025; Dividende erhöht"}',
  NOW()),
('KO', 'dividend', '2025-10-01', NULL,
  '{"company":"The Coca-Cola Co.","dividendPerShare":0.515,"currency":"USD","dividendYield":3.0,"paymentDate":"2025-10-01","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- Verizon (VZ) – Feb / Mai / Aug / Nov

('VZ', 'dividend', '2025-02-03', NULL,
  '{"company":"Verizon Communications","dividendPerShare":0.6775,"currency":"USD","dividendYield":6.6,"paymentDate":"2025-02-03","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('VZ', 'dividend', '2025-05-01', NULL,
  '{"company":"Verizon Communications","dividendPerShare":0.6775,"currency":"USD","dividendYield":6.6,"paymentDate":"2025-05-01","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('VZ', 'dividend', '2025-08-01', NULL,
  '{"company":"Verizon Communications","dividendPerShare":0.6775,"currency":"USD","dividendYield":6.6,"paymentDate":"2025-08-01","isEstimated":false,"frequency":"quarterly","note":"Q3 2025"}',
  NOW()),
('VZ', 'dividend', '2025-11-03', NULL,
  '{"company":"Verizon Communications","dividendPerShare":0.6775,"currency":"USD","dividendYield":6.6,"paymentDate":"2025-11-03","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- AT&T (T) – Feb / Mai / Aug / Nov

('T', 'dividend', '2025-02-03', NULL,
  '{"company":"AT&T Inc.","dividendPerShare":0.2775,"currency":"USD","dividendYield":4.9,"paymentDate":"2025-02-03","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('T', 'dividend', '2025-05-01', NULL,
  '{"company":"AT&T Inc.","dividendPerShare":0.2775,"currency":"USD","dividendYield":4.9,"paymentDate":"2025-05-01","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('T', 'dividend', '2025-08-01', NULL,
  '{"company":"AT&T Inc.","dividendPerShare":0.2775,"currency":"USD","dividendYield":4.9,"paymentDate":"2025-08-01","isEstimated":false,"frequency":"quarterly","note":"Q3 2025"}',
  NOW()),
('T', 'dividend', '2025-11-03', NULL,
  '{"company":"AT&T Inc.","dividendPerShare":0.2775,"currency":"USD","dividendYield":4.9,"paymentDate":"2025-11-03","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- JPMorgan Chase (JPM) – Jan / Apr / Jul / Okt

('JPM', 'dividend', '2025-01-31', NULL,
  '{"company":"JPMorgan Chase & Co.","dividendPerShare":1.40,"currency":"USD","dividendYield":2.3,"paymentDate":"2025-01-31","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('JPM', 'dividend', '2025-04-30', NULL,
  '{"company":"JPMorgan Chase & Co.","dividendPerShare":1.40,"currency":"USD","dividendYield":2.3,"paymentDate":"2025-04-30","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('JPM', 'dividend', '2025-07-31', NULL,
  '{"company":"JPMorgan Chase & Co.","dividendPerShare":1.40,"currency":"USD","dividendYield":2.3,"paymentDate":"2025-07-31","isEstimated":false,"frequency":"quarterly","note":"Q3 2025"}',
  NOW()),
('JPM', 'dividend', '2025-10-31', NULL,
  '{"company":"JPMorgan Chase & Co.","dividendPerShare":1.40,"currency":"USD","dividendYield":2.3,"paymentDate":"2025-10-31","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- Exxon Mobil (XOM) – Mär / Jun / Sep / Dez

('XOM', 'dividend', '2025-03-10', NULL,
  '{"company":"Exxon Mobil Corp.","dividendPerShare":0.99,"currency":"USD","dividendYield":3.6,"paymentDate":"2025-03-10","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('XOM', 'dividend', '2025-06-10', NULL,
  '{"company":"Exxon Mobil Corp.","dividendPerShare":0.99,"currency":"USD","dividendYield":3.6,"paymentDate":"2025-06-10","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('XOM', 'dividend', '2025-09-10', NULL,
  '{"company":"Exxon Mobil Corp.","dividendPerShare":0.99,"currency":"USD","dividendYield":3.6,"paymentDate":"2025-09-10","isEstimated":false,"frequency":"quarterly","note":"Q3 2025"}',
  NOW()),
('XOM', 'dividend', '2025-12-10', NULL,
  '{"company":"Exxon Mobil Corp.","dividendPerShare":0.99,"currency":"USD","dividendYield":3.6,"paymentDate":"2025-12-10","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- Chevron (CVX) – Mär / Jun / Sep / Dez

('CVX', 'dividend', '2025-03-10', NULL,
  '{"company":"Chevron Corp.","dividendPerShare":1.71,"currency":"USD","dividendYield":4.5,"paymentDate":"2025-03-10","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('CVX', 'dividend', '2025-06-10', NULL,
  '{"company":"Chevron Corp.","dividendPerShare":1.71,"currency":"USD","dividendYield":4.5,"paymentDate":"2025-06-10","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('CVX', 'dividend', '2025-09-10', NULL,
  '{"company":"Chevron Corp.","dividendPerShare":1.71,"currency":"USD","dividendYield":4.5,"paymentDate":"2025-09-10","isEstimated":false,"frequency":"quarterly","note":"Q3 2025"}',
  NOW()),
('CVX', 'dividend', '2025-12-10', NULL,
  '{"company":"Chevron Corp.","dividendPerShare":1.71,"currency":"USD","dividendYield":4.5,"paymentDate":"2025-12-10","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- McDonald''s (MCD) – Mär / Jun / Sep / Dez

('MCD', 'dividend', '2025-03-17', NULL,
  '{"company":"McDonald''s Corp.","dividendPerShare":1.77,"currency":"USD","dividendYield":2.3,"paymentDate":"2025-03-17","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('MCD', 'dividend', '2025-06-16', NULL,
  '{"company":"McDonald''s Corp.","dividendPerShare":1.77,"currency":"USD","dividendYield":2.3,"paymentDate":"2025-06-16","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('MCD', 'dividend', '2025-09-15', NULL,
  '{"company":"McDonald''s Corp.","dividendPerShare":1.77,"currency":"USD","dividendYield":2.3,"paymentDate":"2025-09-15","isEstimated":false,"frequency":"quarterly","note":"Q3 2025"}',
  NOW()),
('MCD', 'dividend', '2025-12-15', NULL,
  '{"company":"McDonald''s Corp.","dividendPerShare":1.77,"currency":"USD","dividendYield":2.3,"paymentDate":"2025-12-15","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- Walmart (WMT) – Jan / Apr / Jul / Okt

('WMT', 'dividend', '2025-01-07', NULL,
  '{"company":"Walmart Inc.","dividendPerShare":0.235,"currency":"USD","dividendYield":1.0,"paymentDate":"2025-01-07","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('WMT', 'dividend', '2025-04-07', NULL,
  '{"company":"Walmart Inc.","dividendPerShare":0.235,"currency":"USD","dividendYield":1.0,"paymentDate":"2025-04-07","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('WMT', 'dividend', '2025-07-07', NULL,
  '{"company":"Walmart Inc.","dividendPerShare":0.235,"currency":"USD","dividendYield":1.0,"paymentDate":"2025-07-07","isEstimated":false,"frequency":"quarterly","note":"Q3 2025"}',
  NOW()),
('WMT', 'dividend', '2025-10-06', NULL,
  '{"company":"Walmart Inc.","dividendPerShare":0.235,"currency":"USD","dividendYield":1.0,"paymentDate":"2025-10-06","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- Abbott Laboratories (ABT) – Feb / Mai / Aug / Nov

('ABT', 'dividend', '2025-02-14', NULL,
  '{"company":"Abbott Laboratories","dividendPerShare":0.55,"currency":"USD","dividendYield":1.9,"paymentDate":"2025-02-14","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('ABT', 'dividend', '2025-05-15', NULL,
  '{"company":"Abbott Laboratories","dividendPerShare":0.55,"currency":"USD","dividendYield":1.9,"paymentDate":"2025-05-15","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('ABT', 'dividend', '2025-08-15', NULL,
  '{"company":"Abbott Laboratories","dividendPerShare":0.59,"currency":"USD","dividendYield":2.0,"paymentDate":"2025-08-15","isEstimated":false,"frequency":"quarterly","note":"Q3 2025; Dividende erhöht"}',
  NOW()),
('ABT', 'dividend', '2025-11-14', NULL,
  '{"company":"Abbott Laboratories","dividendPerShare":0.59,"currency":"USD","dividendYield":2.0,"paymentDate":"2025-11-14","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- Broadcom (AVGO) – Mär / Jun / Sep / Dez

('AVGO', 'dividend', '2025-03-31', NULL,
  '{"company":"Broadcom Inc.","dividendPerShare":5.25,"currency":"USD","dividendYield":1.4,"paymentDate":"2025-03-31","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('AVGO', 'dividend', '2025-06-30', NULL,
  '{"company":"Broadcom Inc.","dividendPerShare":5.25,"currency":"USD","dividendYield":1.4,"paymentDate":"2025-06-30","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('AVGO', 'dividend', '2025-09-30', NULL,
  '{"company":"Broadcom Inc.","dividendPerShare":5.25,"currency":"USD","dividendYield":1.4,"paymentDate":"2025-09-30","isEstimated":false,"frequency":"quarterly","note":"Q3 2025"}',
  NOW()),
('AVGO', 'dividend', '2025-12-31', NULL,
  '{"company":"Broadcom Inc.","dividendPerShare":5.25,"currency":"USD","dividendYield":1.4,"paymentDate":"2025-12-31","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- NextEra Energy (NEE) – Mär / Jun / Sep / Dez

('NEE', 'dividend', '2025-03-17', NULL,
  '{"company":"NextEra Energy Inc.","dividendPerShare":0.515,"currency":"USD","dividendYield":3.1,"paymentDate":"2025-03-17","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('NEE', 'dividend', '2025-06-16', NULL,
  '{"company":"NextEra Energy Inc.","dividendPerShare":0.515,"currency":"USD","dividendYield":3.1,"paymentDate":"2025-06-16","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('NEE', 'dividend', '2025-09-15', NULL,
  '{"company":"NextEra Energy Inc.","dividendPerShare":0.5425,"currency":"USD","dividendYield":3.2,"paymentDate":"2025-09-15","isEstimated":false,"frequency":"quarterly","note":"Q3 2025; Dividende erhöht"}',
  NOW()),
('NEE', 'dividend', '2025-12-15', NULL,
  '{"company":"NextEra Energy Inc.","dividendPerShare":0.5425,"currency":"USD","dividendYield":3.2,"paymentDate":"2025-12-15","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- AbbVie (ABBV) – Feb / Mai / Aug / Nov

('ABBV', 'dividend', '2025-02-14', NULL,
  '{"company":"AbbVie Inc.","dividendPerShare":1.64,"currency":"USD","dividendYield":3.5,"paymentDate":"2025-02-14","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('ABBV', 'dividend', '2025-05-15', NULL,
  '{"company":"AbbVie Inc.","dividendPerShare":1.64,"currency":"USD","dividendYield":3.5,"paymentDate":"2025-05-15","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('ABBV', 'dividend', '2025-08-15', NULL,
  '{"company":"AbbVie Inc.","dividendPerShare":1.78,"currency":"USD","dividendYield":3.8,"paymentDate":"2025-08-15","isEstimated":false,"frequency":"quarterly","note":"Q3 2025; Dividende erhöht"}',
  NOW()),
('ABBV', 'dividend', '2025-11-14', NULL,
  '{"company":"AbbVie Inc.","dividendPerShare":1.78,"currency":"USD","dividendYield":3.8,"paymentDate":"2025-11-14","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- Altria Group (MO) – Jan / Apr / Jul / Okt

('MO', 'dividend', '2025-01-31', NULL,
  '{"company":"Altria Group Inc.","dividendPerShare":1.02,"currency":"USD","dividendYield":7.5,"paymentDate":"2025-01-31","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('MO', 'dividend', '2025-04-30', NULL,
  '{"company":"Altria Group Inc.","dividendPerShare":1.02,"currency":"USD","dividendYield":7.5,"paymentDate":"2025-04-30","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('MO', 'dividend', '2025-07-31', NULL,
  '{"company":"Altria Group Inc.","dividendPerShare":1.02,"currency":"USD","dividendYield":7.5,"paymentDate":"2025-07-31","isEstimated":false,"frequency":"quarterly","note":"Q3 2025"}',
  NOW()),
('MO', 'dividend', '2025-10-31', NULL,
  '{"company":"Altria Group Inc.","dividendPerShare":1.02,"currency":"USD","dividendYield":7.5,"paymentDate":"2025-10-31","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- Goldman Sachs (GS) – Mär / Jun / Sep / Dez

('GS', 'dividend', '2025-03-27', NULL,
  '{"company":"Goldman Sachs Group Inc.","dividendPerShare":3.00,"currency":"USD","dividendYield":2.1,"paymentDate":"2025-03-27","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('GS', 'dividend', '2025-06-26', NULL,
  '{"company":"Goldman Sachs Group Inc.","dividendPerShare":3.00,"currency":"USD","dividendYield":2.1,"paymentDate":"2025-06-26","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('GS', 'dividend', '2025-09-25', NULL,
  '{"company":"Goldman Sachs Group Inc.","dividendPerShare":3.00,"currency":"USD","dividendYield":2.1,"paymentDate":"2025-09-25","isEstimated":false,"frequency":"quarterly","note":"Q3 2025"}',
  NOW()),
('GS', 'dividend', '2025-12-26', NULL,
  '{"company":"Goldman Sachs Group Inc.","dividendPerShare":3.00,"currency":"USD","dividendYield":2.1,"paymentDate":"2025-12-26","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- Alphabet (GOOGL) – Mär / Jun / Sep / Dez (Dividende seit Apr 2024)

('GOOGL', 'dividend', '2025-03-17', NULL,
  '{"company":"Alphabet Inc.","dividendPerShare":0.20,"currency":"USD","dividendYield":0.4,"paymentDate":"2025-03-17","isEstimated":false,"frequency":"quarterly","note":"Q1 2025; Alphabet zahlte erste Dividende Apr 2024"}',
  NOW()),
('GOOGL', 'dividend', '2025-06-16', NULL,
  '{"company":"Alphabet Inc.","dividendPerShare":0.20,"currency":"USD","dividendYield":0.4,"paymentDate":"2025-06-16","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('GOOGL', 'dividend', '2025-09-15', NULL,
  '{"company":"Alphabet Inc.","dividendPerShare":0.20,"currency":"USD","dividendYield":0.4,"paymentDate":"2025-09-15","isEstimated":false,"frequency":"quarterly","note":"Q3 2025"}',
  NOW()),
('GOOGL', 'dividend', '2025-12-15', NULL,
  '{"company":"Alphabet Inc.","dividendPerShare":0.20,"currency":"USD","dividendYield":0.4,"paymentDate":"2025-12-15","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- Meta Platforms (META) – Mär / Jun / Sep / Dez (Dividende seit Feb 2024)

('META', 'dividend', '2025-03-26', NULL,
  '{"company":"Meta Platforms Inc.","dividendPerShare":0.525,"currency":"USD","dividendYield":0.3,"paymentDate":"2025-03-26","isEstimated":false,"frequency":"quarterly","note":"Q1 2025; Meta zahlte erste Dividende Feb 2024"}',
  NOW()),
('META', 'dividend', '2025-06-25', NULL,
  '{"company":"Meta Platforms Inc.","dividendPerShare":0.525,"currency":"USD","dividendYield":0.3,"paymentDate":"2025-06-25","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('META', 'dividend', '2025-09-24', NULL,
  '{"company":"Meta Platforms Inc.","dividendPerShare":0.525,"currency":"USD","dividendYield":0.3,"paymentDate":"2025-09-24","isEstimated":false,"frequency":"quarterly","note":"Q3 2025"}',
  NOW()),
('META', 'dividend', '2025-12-24', NULL,
  '{"company":"Meta Platforms Inc.","dividendPerShare":0.525,"currency":"USD","dividendYield":0.3,"paymentDate":"2025-12-24","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW()),

-- ── Realty Income (O) – monatlich 2025 ────────────────────

('O', 'dividend', '2025-01-15', NULL,
  '{"company":"Realty Income Corp.","dividendPerShare":0.2660,"currency":"USD","dividendYield":5.8,"paymentDate":"2025-01-15","isEstimated":false,"frequency":"monthly","note":"Jan 2025"}',
  NOW()),
('O', 'dividend', '2025-02-14', NULL,
  '{"company":"Realty Income Corp.","dividendPerShare":0.2665,"currency":"USD","dividendYield":5.8,"paymentDate":"2025-02-14","isEstimated":false,"frequency":"monthly","note":"Feb 2025"}',
  NOW()),
('O', 'dividend', '2025-03-14', NULL,
  '{"company":"Realty Income Corp.","dividendPerShare":0.2665,"currency":"USD","dividendYield":5.8,"paymentDate":"2025-03-14","isEstimated":false,"frequency":"monthly","note":"Mär 2025"}',
  NOW()),
('O', 'dividend', '2025-04-15', NULL,
  '{"company":"Realty Income Corp.","dividendPerShare":0.2685,"currency":"USD","dividendYield":5.8,"paymentDate":"2025-04-15","isEstimated":false,"frequency":"monthly","note":"Apr 2025"}',
  NOW()),
('O', 'dividend', '2025-05-15', NULL,
  '{"company":"Realty Income Corp.","dividendPerShare":0.2685,"currency":"USD","dividendYield":5.8,"paymentDate":"2025-05-15","isEstimated":false,"frequency":"monthly","note":"Mai 2025"}',
  NOW()),
('O', 'dividend', '2025-06-13', NULL,
  '{"company":"Realty Income Corp.","dividendPerShare":0.2685,"currency":"USD","dividendYield":5.8,"paymentDate":"2025-06-13","isEstimated":false,"frequency":"monthly","note":"Jun 2025"}',
  NOW()),
('O', 'dividend', '2025-07-15', NULL,
  '{"company":"Realty Income Corp.","dividendPerShare":0.2685,"currency":"USD","dividendYield":5.8,"paymentDate":"2025-07-15","isEstimated":false,"frequency":"monthly","note":"Jul 2025"}',
  NOW()),
('O', 'dividend', '2025-08-15', NULL,
  '{"company":"Realty Income Corp.","dividendPerShare":0.2685,"currency":"USD","dividendYield":5.8,"paymentDate":"2025-08-15","isEstimated":false,"frequency":"monthly","note":"Aug 2025"}',
  NOW()),
('O', 'dividend', '2025-09-15', NULL,
  '{"company":"Realty Income Corp.","dividendPerShare":0.2685,"currency":"USD","dividendYield":5.8,"paymentDate":"2025-09-15","isEstimated":false,"frequency":"monthly","note":"Sep 2025"}',
  NOW()),
('O', 'dividend', '2025-10-15', NULL,
  '{"company":"Realty Income Corp.","dividendPerShare":0.2685,"currency":"USD","dividendYield":5.8,"paymentDate":"2025-10-15","isEstimated":false,"frequency":"monthly","note":"Okt 2025"}',
  NOW()),
('O', 'dividend', '2025-11-14', NULL,
  '{"company":"Realty Income Corp.","dividendPerShare":0.2685,"currency":"USD","dividendYield":5.8,"paymentDate":"2025-11-14","isEstimated":false,"frequency":"monthly","note":"Nov 2025"}',
  NOW()),
('O', 'dividend', '2025-12-15', NULL,
  '{"company":"Realty Income Corp.","dividendPerShare":0.2685,"currency":"USD","dividendYield":5.8,"paymentDate":"2025-12-15","isEstimated":false,"frequency":"monthly","note":"Dez 2025"}',
  NOW()),

-- ── Internationale Werte (EU / CH / DK) ───────────────────
-- ASML Holding – halbjährlich (Mai / Nov)

('ASML', 'dividend', '2025-05-14', NULL,
  '{"company":"ASML Holding N.V.","dividendPerShare":4.60,"currency":"EUR","dividendYield":0.9,"paymentDate":"2025-05-14","agmDate":"2025-04-23","isEstimated":false,"frequency":"semiannual","note":"Schlussdividende FJ 2024"}',
  NOW()),
('ASML', 'dividend', '2025-11-12', NULL,
  '{"company":"ASML Holding N.V.","dividendPerShare":1.52,"currency":"EUR","dividendYield":0.3,"paymentDate":"2025-11-12","isEstimated":false,"frequency":"semiannual","note":"Zwischendividende H1 2025"}',
  NOW()),

-- Novo Nordisk (NOVO-B.CO) – halbjährlich (Mär / Aug)

('NOVO-B.CO', 'dividend', '2025-03-26', NULL,
  '{"company":"Novo Nordisk A/S","dividendPerShare":4.50,"currency":"DKK","dividendYield":1.3,"paymentDate":"2025-03-26","isEstimated":false,"frequency":"semiannual","note":"Schlussdividende FJ 2024"}',
  NOW()),
('NOVO-B.CO', 'dividend', '2025-08-27', NULL,
  '{"company":"Novo Nordisk A/S","dividendPerShare":3.50,"currency":"DKK","dividendYield":1.0,"paymentDate":"2025-08-27","isEstimated":false,"frequency":"semiannual","note":"Zwischendividende H1 2025"}',
  NOW()),

-- Nestlé (NESN.SW) – jährlich (Apr)

('NESN.SW', 'dividend', '2025-04-25', NULL,
  '{"company":"Nestlé S.A.","dividendPerShare":3.00,"currency":"CHF","dividendYield":3.6,"paymentDate":"2025-04-25","agmDate":"2025-04-10","isEstimated":false,"frequency":"annual","note":"FJ 2024; jährliche Dividendenzahlung"}',
  NOW()),

-- Roche (ROG.SW) – jährlich (Apr)

('ROG.SW', 'dividend', '2025-04-01', NULL,
  '{"company":"Roche Holding AG","dividendPerShare":9.70,"currency":"CHF","dividendYield":3.9,"paymentDate":"2025-04-01","agmDate":"2025-03-18","isEstimated":false,"frequency":"annual","note":"FJ 2024; Inhaber-Genussschein"}',
  NOW()),

-- Novartis (NOVN.SW) – jährlich (Mär)

('NOVN.SW', 'dividend', '2025-03-07', NULL,
  '{"company":"Novartis AG","dividendPerShare":3.50,"currency":"CHF","dividendYield":3.5,"paymentDate":"2025-03-07","agmDate":"2025-03-04","isEstimated":false,"frequency":"annual","note":"FJ 2024; jährliche Dividendenzahlung"}',
  NOW()),

-- Santander (SAN.MC) – halbjährlich (Feb / Aug)

('SAN.MC', 'dividend', '2025-02-03', NULL,
  '{"company":"Banco Santander S.A.","dividendPerShare":0.10,"currency":"EUR","dividendYield":2.0,"paymentDate":"2025-02-03","isEstimated":false,"frequency":"semiannual","note":"Zwischendividende H2 2024"}',
  NOW()),
('SAN.MC', 'dividend', '2025-08-04', NULL,
  '{"company":"Banco Santander S.A.","dividendPerShare":0.10,"currency":"EUR","dividendYield":2.0,"paymentDate":"2025-08-04","isEstimated":false,"frequency":"semiannual","note":"Zwischendividende H1 2025"}',
  NOW()),

-- TotalEnergies (TTE.PA) – quartalsweise (Jan / Apr / Jul / Okt)

('TTE.PA', 'dividend', '2025-01-16', NULL,
  '{"company":"TotalEnergies SE","dividendPerShare":0.79,"currency":"EUR","dividendYield":4.9,"paymentDate":"2025-01-16","isEstimated":false,"frequency":"quarterly","note":"Q4 2024 Abschluss"}',
  NOW()),
('TTE.PA', 'dividend', '2025-04-17', NULL,
  '{"company":"TotalEnergies SE","dividendPerShare":0.79,"currency":"EUR","dividendYield":4.9,"paymentDate":"2025-04-17","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('TTE.PA', 'dividend', '2025-07-17', NULL,
  '{"company":"TotalEnergies SE","dividendPerShare":0.79,"currency":"EUR","dividendYield":4.9,"paymentDate":"2025-07-17","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('TTE.PA', 'dividend', '2025-10-16', NULL,
  '{"company":"TotalEnergies SE","dividendPerShare":0.79,"currency":"EUR","dividendYield":4.9,"paymentDate":"2025-10-16","isEstimated":false,"frequency":"quarterly","note":"Q3 2025"}',
  NOW()),

-- Shell (SHEL) – quartalsweise (Mär / Jun / Sep / Dez)

('SHEL', 'dividend', '2025-03-24', NULL,
  '{"company":"Shell plc","dividendPerShare":0.3440,"currency":"USD","dividendYield":3.9,"paymentDate":"2025-03-24","isEstimated":false,"frequency":"quarterly","note":"Q1 2025"}',
  NOW()),
('SHEL', 'dividend', '2025-06-23', NULL,
  '{"company":"Shell plc","dividendPerShare":0.3440,"currency":"USD","dividendYield":3.9,"paymentDate":"2025-06-23","isEstimated":false,"frequency":"quarterly","note":"Q2 2025"}',
  NOW()),
('SHEL', 'dividend', '2025-09-22', NULL,
  '{"company":"Shell plc","dividendPerShare":0.3590,"currency":"USD","dividendYield":4.0,"paymentDate":"2025-09-22","isEstimated":false,"frequency":"quarterly","note":"Q3 2025; Dividende erhöht"}',
  NOW()),
('SHEL', 'dividend', '2025-12-22', NULL,
  '{"company":"Shell plc","dividendPerShare":0.3590,"currency":"USD","dividendYield":4.0,"paymentDate":"2025-12-22","isEstimated":false,"frequency":"quarterly","note":"Q4 2025"}',
  NOW())

ON CONFLICT (symbol, event_type, event_date) DO UPDATE
  SET details      = EXCLUDED.details,
      last_updated = NOW();


-- ============================================================
-- 3. DAX 40 – QUARTALSZAHLEN Q1 / Q2 2026
-- ============================================================

INSERT INTO public.stock_events (symbol, event_type, event_date, quarter, details, last_updated) VALUES

('SAP.DE',   'earnings', '2026-04-22', 'Q1 2026',
  '{"company":"SAP SE","epsEstimate":"1,45 €","revenueEstimate":"9,8 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('ALV.DE',   'earnings', '2026-05-14', 'Q1 2026',
  '{"company":"Allianz SE","epsEstimate":"7,20 €","revenueEstimate":"41 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('MBG.DE',   'earnings', '2026-04-30', 'Q1 2026',
  '{"company":"Mercedes-Benz Group AG","epsEstimate":"2,80 €","revenueEstimate":"34 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('BMW.DE',   'earnings', '2026-05-06', 'Q1 2026',
  '{"company":"BMW AG","epsEstimate":"4,20 €","revenueEstimate":"36 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('BAS.DE',   'earnings', '2026-04-24', 'Q1 2026',
  '{"company":"BASF SE","epsEstimate":"0,72 €","revenueEstimate":"17 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('DTE.DE',   'earnings', '2026-05-08', 'Q1 2026',
  '{"company":"Deutsche Telekom AG","epsEstimate":"0,58 €","revenueEstimate":"33 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('SIE.DE',   'earnings', '2026-05-07', 'Q2 FY2026',
  '{"company":"Siemens AG","epsEstimate":"2,85 €","revenueEstimate":"20 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true,"note":"Siemens FJ endet September; Q2 = Jan–März 2026"}', NOW()),

('MUV2.DE',  'earnings', '2026-05-06', 'Q1 2026',
  '{"company":"Munich Re","epsEstimate":"12,50 €","revenueEstimate":"18 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('DHL.DE',   'earnings', '2026-05-07', 'Q1 2026',
  '{"company":"DHL Group","epsEstimate":"0,92 €","revenueEstimate":"20 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('DBK.DE',   'earnings', '2026-04-29', 'Q1 2026',
  '{"company":"Deutsche Bank AG","epsEstimate":"0,65 €","revenueEstimate":"7,8 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('VOW3.DE',  'earnings', '2026-05-07', 'Q1 2026',
  '{"company":"Volkswagen AG","epsEstimate":"3,90 €","revenueEstimate":"88 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('RWE.DE',   'earnings', '2026-05-13', 'Q1 2026',
  '{"company":"RWE AG","epsEstimate":"0,98 €","revenueEstimate":"7,2 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('EOAN.DE',  'earnings', '2026-05-08', 'Q1 2026',
  '{"company":"E.ON SE","epsEstimate":"0,48 €","revenueEstimate":"20 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('IFX.DE',   'earnings', '2026-05-06', 'Q2 FY2026',
  '{"company":"Infineon Technologies AG","epsEstimate":"0,28 €","revenueEstimate":"3,8 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true,"note":"Infineon FJ endet September"}', NOW()),

('MRK.DE',   'earnings', '2026-05-14', 'Q1 2026',
  '{"company":"Merck KGaA","epsEstimate":"2,45 €","revenueEstimate":"5,5 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('HNR1.DE',  'earnings', '2026-05-07', 'Q1 2026',
  '{"company":"Hannover Rück SE","epsEstimate":"5,80 €","revenueEstimate":"7,5 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('AIR.DE',   'earnings', '2026-04-30', 'Q1 2026',
  '{"company":"Airbus SE","epsEstimate":"1,85 €","revenueEstimate":"15 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('RHM.DE',   'earnings', '2026-05-06', 'Q1 2026',
  '{"company":"Rheinmetall AG","epsEstimate":"4,20 €","revenueEstimate":"3,1 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('BAYN.DE',  'earnings', '2026-04-29', 'Q1 2026',
  '{"company":"Bayer AG","epsEstimate":"1,15 €","revenueEstimate":"11,5 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('DTG.DE',   'earnings', '2026-05-07', 'Q1 2026',
  '{"company":"Daimler Truck Holding AG","epsEstimate":"0,95 €","revenueEstimate":"13 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('CBK.DE',   'earnings', '2026-05-07', 'Q1 2026',
  '{"company":"Commerzbank AG","epsEstimate":"0,58 €","revenueEstimate":"2,8 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('VNA.DE',   'earnings', '2026-05-05', 'Q1 2026',
  '{"company":"Vonovia SE","epsEstimate":"0,42 €","revenueEstimate":"1,6 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('BNR.DE',   'earnings', '2026-05-06', 'Q1 2026',
  '{"company":"Brenntag SE","epsEstimate":"1,05 €","revenueEstimate":"4,1 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('HDMG.DE',  'earnings', '2026-05-07', 'Q1 2026',
  '{"company":"HeidelbergMaterials AG","epsEstimate":"1,80 €","revenueEstimate":"5,0 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('CON.DE',   'earnings', '2026-04-30', 'Q1 2026',
  '{"company":"Continental AG","epsEstimate":"0,85 €","revenueEstimate":"9,8 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('FRE.DE',   'earnings', '2026-05-06', 'Q1 2026',
  '{"company":"Fresenius SE & Co. KGaA","epsEstimate":"0,55 €","revenueEstimate":"5,8 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('HEN3.DE',  'earnings', '2026-04-30', 'Q1 2026',
  '{"company":"Henkel AG & Co. KGaA Vorzüge","epsEstimate":"1,45 €","revenueEstimate":"5,5 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('BEI.DE',   'earnings', '2026-04-30', 'Q1 2026',
  '{"company":"Beiersdorf AG","epsEstimate":"1,15 €","revenueEstimate":"2,3 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('SY1.DE',   'earnings', '2026-05-07', 'Q1 2026',
  '{"company":"Symrise AG","epsEstimate":"0,88 €","revenueEstimate":"1,3 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('SRT3.DE',  'earnings', '2026-04-23', 'Q1 2026',
  '{"company":"Sartorius AG Vorzüge","epsEstimate":"0,52 €","revenueEstimate":"720 Mio. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('P911.DE',  'earnings', '2026-04-29', 'Q1 2026',
  '{"company":"Porsche AG","epsEstimate":"1,20 €","revenueEstimate":"9,8 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('BMW.DE',   'earnings', '2026-08-05', 'Q2 2026',
  '{"company":"BMW AG","epsEstimate":"4,80 €","revenueEstimate":"38 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW())

ON CONFLICT (symbol, event_type, event_date) DO UPDATE
  SET details      = EXCLUDED.details,
      quarter      = EXCLUDED.quarter,
      last_updated = NOW();


-- ============================================================
-- 4. INTERNATIONALE DIVIDENDEN-ZAHLER (USD)
-- ============================================================

INSERT INTO public.stock_events (symbol, event_type, event_date, quarter, details, last_updated) VALUES

-- ── US Tech (geringe Dividende) ────────────────────────────

('AAPL',  'dividend', '2026-05-09', NULL,
  '{"company":"Apple Inc.","dividendPerShare":0.25,"currency":"USD","dividendYield":0.5,"paymentDate":"2026-05-15","frequency":"quarterly","isEstimated":true}', NOW()),

('MSFT',  'dividend', '2026-05-14', NULL,
  '{"company":"Microsoft Corporation","dividendPerShare":0.83,"currency":"USD","dividendYield":0.8,"paymentDate":"2026-06-12","frequency":"quarterly","isEstimated":true}', NOW()),

-- ── US Dividenden-Champions ────────────────────────────────

('JNJ',   'dividend', '2026-06-11', NULL,
  '{"company":"Johnson & Johnson","dividendPerShare":1.24,"currency":"USD","dividendYield":3.3,"paymentDate":"2026-07-07","frequency":"quarterly","isEstimated":true}', NOW()),

('PG',    'dividend', '2026-04-24', NULL,
  '{"company":"Procter & Gamble Co.","dividendPerShare":1.00,"currency":"USD","dividendYield":2.4,"paymentDate":"2026-05-15","frequency":"quarterly","isEstimated":true}', NOW()),

('KO',    'dividend', '2026-06-12', NULL,
  '{"company":"The Coca-Cola Company","dividendPerShare":0.49,"currency":"USD","dividendYield":3.0,"paymentDate":"2026-07-01","frequency":"quarterly","isEstimated":true}', NOW()),

('VZ',    'dividend', '2026-04-10', NULL,
  '{"company":"Verizon Communications","dividendPerShare":0.665,"currency":"USD","dividendYield":6.8,"paymentDate":"2026-05-01","frequency":"quarterly","isEstimated":true}', NOW()),

('T',     'dividend', '2026-04-10', NULL,
  '{"company":"AT&T Inc.","dividendPerShare":0.2775,"currency":"USD","dividendYield":4.9,"paymentDate":"2026-05-01","frequency":"quarterly","isEstimated":true}', NOW()),

('JPM',   'dividend', '2026-04-03', NULL,
  '{"company":"JPMorgan Chase & Co.","dividendPerShare":1.25,"currency":"USD","dividendYield":2.2,"paymentDate":"2026-04-30","frequency":"quarterly","isEstimated":true}', NOW()),

('XOM',   'dividend', '2026-05-14', NULL,
  '{"company":"Exxon Mobil Corporation","dividendPerShare":0.99,"currency":"USD","dividendYield":3.5,"paymentDate":"2026-06-10","frequency":"quarterly","isEstimated":true}', NOW()),

('CVX',   'dividend', '2026-05-19', NULL,
  '{"company":"Chevron Corporation","dividendPerShare":1.71,"currency":"USD","dividendYield":4.2,"paymentDate":"2026-06-10","frequency":"quarterly","isEstimated":true}', NOW()),

('MCD',   'dividend', '2026-06-02', NULL,
  '{"company":"McDonald''s Corporation","dividendPerShare":1.77,"currency":"USD","dividendYield":2.4,"paymentDate":"2026-06-17","frequency":"quarterly","isEstimated":true}', NOW()),

('WMT',   'dividend', '2026-03-20', NULL,
  '{"company":"Walmart Inc.","dividendPerShare":0.235,"currency":"USD","dividendYield":1.0,"paymentDate":"2026-04-06","frequency":"quarterly","isEstimated":true}', NOW()),

('ABT',   'dividend', '2026-04-14', NULL,
  '{"company":"Abbott Laboratories","dividendPerShare":0.59,"currency":"USD","dividendYield":1.9,"paymentDate":"2026-05-15","frequency":"quarterly","isEstimated":true}', NOW()),

('AVGO',  'dividend', '2026-03-20', NULL,
  '{"company":"Broadcom Inc.","dividendPerShare":0.59,"currency":"USD","dividendYield":1.1,"paymentDate":"2026-03-31","frequency":"quarterly","isEstimated":true}', NOW()),

('NEE',   'dividend', '2026-06-01', NULL,
  '{"company":"NextEra Energy Inc.","dividendPerShare":0.515,"currency":"USD","dividendYield":3.3,"paymentDate":"2026-06-15","frequency":"quarterly","isEstimated":true}', NOW()),

('ABBV',  'dividend', '2026-04-14', NULL,
  '{"company":"AbbVie Inc.","dividendPerShare":1.64,"currency":"USD","dividendYield":3.5,"paymentDate":"2026-05-15","frequency":"quarterly","isEstimated":true}', NOW()),

('MO',    'dividend', '2026-03-25', NULL,
  '{"company":"Altria Group Inc.","dividendPerShare":1.02,"currency":"USD","dividendYield":7.8,"paymentDate":"2026-04-30","frequency":"quarterly","isEstimated":true}', NOW()),

('REALTY', 'dividend', '2026-03-28', NULL,
  '{"company":"Realty Income Corporation","dividendPerShare":0.2685,"currency":"USD","dividendYield":5.9,"paymentDate":"2026-04-15","frequency":"monthly","isEstimated":true,"note":"Realty Income zahlt monatlich"}', NOW()),

('O',     'dividend', '2026-03-28', NULL,
  '{"company":"Realty Income Corporation","dividendPerShare":0.2685,"currency":"USD","dividendYield":5.9,"paymentDate":"2026-04-15","frequency":"monthly","isEstimated":true,"note":"Realty Income – monatliche Dividende"}', NOW()),

-- ── Europäische Blue Chips (non-DAX) ──────────────────────

('ASML',  'dividend', '2026-04-30', NULL,
  '{"company":"ASML Holding N.V.","dividendPerShare":3.76,"currency":"EUR","dividendYield":1.1,"paymentDate":"2026-05-05","frequency":"quarterly","isEstimated":true}', NOW()),

('NOVO-B.CO', 'dividend', '2026-03-27', NULL,
  '{"company":"Novo Nordisk A/S","dividendPerShare":4.87,"currency":"DKK","dividendYield":2.0,"paymentDate":"2026-03-31","frequency":"semiannual","isEstimated":true}', NOW()),

('NESN.SW', 'dividend', '2026-04-24', NULL,
  '{"company":"Nestlé S.A.","dividendPerShare":3.00,"currency":"CHF","dividendYield":3.8,"paymentDate":"2026-04-28","frequency":"annual","isEstimated":true}', NOW()),

('ROG.SW', 'dividend', '2026-03-20', NULL,
  '{"company":"Roche Holding AG","dividendPerShare":9.70,"currency":"CHF","dividendYield":3.5,"paymentDate":"2026-03-24","frequency":"annual","isEstimated":true}', NOW()),

('NOVN.SW', 'dividend', '2026-03-13', NULL,
  '{"company":"Novartis AG","dividendPerShare":3.50,"currency":"USD","dividendYield":3.8,"paymentDate":"2026-03-17","frequency":"annual","isEstimated":true}', NOW()),

('SAN.MC', 'dividend', '2026-04-30', NULL,
  '{"company":"Banco Santander S.A.","dividendPerShare":0.10,"currency":"EUR","dividendYield":4.8,"paymentDate":"2026-05-05","frequency":"quarterly","isEstimated":true}', NOW()),

('TTE.PA', 'dividend', '2026-03-25', NULL,
  '{"company":"TotalEnergies SE","dividendPerShare":0.79,"currency":"EUR","dividendYield":3.8,"paymentDate":"2026-04-01","frequency":"quarterly","isEstimated":true}', NOW()),

('SHEL',  'dividend', '2026-05-14', NULL,
  '{"company":"Shell plc","dividendPerShare":0.344,"currency":"USD","dividendYield":4.0,"paymentDate":"2026-06-18","frequency":"quarterly","isEstimated":true}', NOW())

ON CONFLICT (symbol, event_type, event_date) DO UPDATE
  SET details      = EXCLUDED.details,
      last_updated = NOW();


-- ============================================================
-- 5. EARNINGS – INTERNATIONALE UNTERNEHMEN Q1/Q2 2026
-- ============================================================

INSERT INTO public.stock_events (symbol, event_type, event_date, quarter, details, last_updated) VALUES

('AAPL',  'earnings', '2026-05-07', 'Q2 FY2026',
  '{"company":"Apple Inc.","epsEstimate":"1,65 $","revenueEstimate":"95 Mrd. $","timeOfDay":"nach Marktschluss","isEstimated":true}', NOW()),

('MSFT',  'earnings', '2026-04-29', 'Q3 FY2026',
  '{"company":"Microsoft Corporation","epsEstimate":"3,20 $","revenueEstimate":"72 Mrd. $","timeOfDay":"nach Marktschluss","isEstimated":true}', NOW()),

('GOOGL', 'earnings', '2026-04-28', 'Q1 2026',
  '{"company":"Alphabet Inc.","epsEstimate":"2,11 $","revenueEstimate":"92 Mrd. $","timeOfDay":"nach Marktschluss","isEstimated":true}', NOW()),

('META',  'earnings', '2026-04-29', 'Q1 2026',
  '{"company":"Meta Platforms Inc.","epsEstimate":"6,80 $","revenueEstimate":"43 Mrd. $","timeOfDay":"nach Marktschluss","isEstimated":true}', NOW()),

('AMZN',  'earnings', '2026-05-01', 'Q1 2026',
  '{"company":"Amazon.com Inc.","epsEstimate":"1,38 $","revenueEstimate":"155 Mrd. $","timeOfDay":"nach Marktschluss","isEstimated":true}', NOW()),

('NVDA',  'earnings', '2026-05-27', 'Q1 FY2027',
  '{"company":"NVIDIA Corporation","epsEstimate":"0,93 $","revenueEstimate":"43 Mrd. $","timeOfDay":"nach Marktschluss","isEstimated":true}', NOW()),

('TSLA',  'earnings', '2026-04-22', 'Q1 2026',
  '{"company":"Tesla Inc.","epsEstimate":"0,48 $","revenueEstimate":"23 Mrd. $","timeOfDay":"nach Marktschluss","isEstimated":true}', NOW()),

('ASML',  'earnings', '2026-04-16', 'Q1 2026',
  '{"company":"ASML Holding N.V.","epsEstimate":"6,25 €","revenueEstimate":"8,0 Mrd. €","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('NOVO-B.CO', 'earnings', '2026-05-07', 'Q1 2026',
  '{"company":"Novo Nordisk A/S","epsEstimate":"9,80 DKK","revenueEstimate":"81 Mrd. DKK","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('JPM',   'earnings', '2026-04-14', 'Q1 2026',
  '{"company":"JPMorgan Chase & Co.","epsEstimate":"4,62 $","revenueEstimate":"45 Mrd. $","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('GS',    'earnings', '2026-04-14', 'Q1 2026',
  '{"company":"Goldman Sachs Group Inc.","epsEstimate":"11,80 $","revenueEstimate":"14 Mrd. $","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW()),

('NESN.SW', 'earnings', '2026-04-24', 'Q1 2026',
  '{"company":"Nestlé S.A.","epsEstimate":"2,10 CHF","revenueEstimate":"22 Mrd. CHF","timeOfDay":"vor Marktöffnung","isEstimated":true}', NOW())

ON CONFLICT (symbol, event_type, event_date) DO UPDATE
  SET details      = EXCLUDED.details,
      quarter      = EXCLUDED.quarter,
      last_updated = NOW();


-- ============================================================
-- 6. SCAN-SENTINELS – verhindert KI-Rescan für 30 Tage
--    für alle bereits geseedeten Symbole
-- ============================================================

INSERT INTO public.stock_events (symbol, event_type, event_date, details, last_updated)
SELECT DISTINCT symbol, '_scanned', '1970-01-01'::date, '{"seeded":true}'::jsonb, NOW()
FROM public.stock_events
WHERE event_type IN ('earnings', 'dividend')
ON CONFLICT (symbol, event_type, event_date) DO UPDATE
  SET last_updated = NOW();


-- ============================================================
-- FERTIG – Überprüfung
-- ============================================================

SELECT
  event_type,
  COUNT(*)              AS anzahl,
  MIN(event_date)       AS fruehestes_datum,
  MAX(event_date)       AS spaetestes_datum
FROM public.stock_events
WHERE event_type != '_scanned'
GROUP BY event_type
ORDER BY event_type;

SELECT COUNT(DISTINCT symbol) AS gescannte_symbole
FROM public.stock_events
WHERE event_type = '_scanned';
