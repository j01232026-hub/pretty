-- Phase 2: User Profiles Multi-tenancy Isolation

-- 1. Add store_id to profiles if missing
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;

-- 2. Ensure user_id column exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Rename/Add columns to match application code (display_name, picture_url)
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='full_name') THEN
    ALTER TABLE public.profiles RENAME COLUMN full_name TO display_name;
  ELSE
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='avatar_url') THEN
    ALTER TABLE public.profiles RENAME COLUMN avatar_url TO picture_url;
  ELSE
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS picture_url TEXT;
  END IF;
END $$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_complete BOOLEAN DEFAULT FALSE;

-- 4. Handle is_onboarded migration if exists
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_onboarded') THEN
    ALTER TABLE public.profiles RENAME COLUMN is_onboarded TO is_complete_legacy;
  END IF;
END $$;

-- 5. Add UNIQUE constraint for user_id + store_id
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_store_id_key;
-- Note: This might fail if there are duplicate rows. Please clean up duplicates first if needed.
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_store_id_key UNIQUE (user_id, store_id);

-- 6. Update RLS Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
