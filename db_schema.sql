-- ⚠️ WARNING: This script will DROP existing profiles and stores tables to resolve schema conflicts.
-- If you have important data, please back it up first.
-- The previous error "column id does not exist" was caused by an incompatible existing 'profiles' table (using user_id instead of id).

-- 1. Cleanup old conflicting tables
DROP TABLE IF EXISTS public.stores;
DROP TABLE IF EXISTS public.profiles;

-- 2. Create profiles table (Synced with Supabase Auth)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  birthday DATE,
  phone TEXT,
  avatar_url TEXT,
  is_onboarded BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create stores table
CREATE TABLE public.stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_name TEXT NOT NULL,
  address TEXT,
  store_phone TEXT,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for profiles
CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

-- 6. RLS Policies for stores
CREATE POLICY "Users can view their own stores" 
ON public.stores FOR SELECT 
USING (owner_id = auth.uid());

CREATE POLICY "Users can update their own stores" 
ON public.stores FOR UPDATE 
USING (owner_id = auth.uid());

CREATE POLICY "Users can insert their own stores" 
ON public.stores FOR INSERT 
WITH CHECK (owner_id = auth.uid());
