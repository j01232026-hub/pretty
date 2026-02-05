
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists birthday date;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists is_complete boolean default false;
