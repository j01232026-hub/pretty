-- Add updated_at column to salon_info table
alter table public.salon_info add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now());
