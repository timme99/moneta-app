-- ============================================================
-- Moneta – Profile Preferences Migration
-- Adds canonical boolean columns for user notification prefs.
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Add new canonical columns (idempotent)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_digest_enabled   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS newsletter_subscribed   BOOLEAN NOT NULL DEFAULT false;

-- 2. Migrate existing data from old columns (if they exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'newsletter_weekly_digest'
  ) THEN
    UPDATE public.profiles
    SET weekly_digest_enabled = newsletter_weekly_digest
    WHERE newsletter_weekly_digest IS NOT NULL;
    RAISE NOTICE 'profiles: newsletter_weekly_digest → weekly_digest_enabled migriert';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'newsletter_auto_updates'
  ) THEN
    UPDATE public.profiles
    SET newsletter_subscribed = newsletter_auto_updates
    WHERE newsletter_auto_updates IS NOT NULL;
    RAISE NOTICE 'profiles: newsletter_auto_updates → newsletter_subscribed migriert';
  END IF;
END $$;

-- 3. Rewrite on_auth_user_created to be silent on failure.
--    Only id + email are inserted so a missing column never crashes auth.
--    EXCEPTION block ensures the Magic Link / signUp flow succeeds even if
--    the profiles schema is temporarily out of sync.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[handle_new_user] profile insert failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- 4. Ensure RLS update policy covers the new columns (policy already covers the whole row)
-- No change needed – existing "profiles_update_own" policy allows updating any column.

-- 5. Verify result
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;
