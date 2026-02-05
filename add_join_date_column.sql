-- Add join_date and created_at columns to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS join_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
