-- 修正版 SQL：支援「重複執行」而不報錯
-- 1. 如果表不存在則建立 (If not exists)
create table if not exists public.profiles (
  user_id text primary key,
  display_name text,       -- LINE 暱稱
  custom_name text,        -- 管理員設定的備註
  last_seen_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. 確保欄位存在 (如果表已存在但缺欄位，會自動補上)
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists custom_name text;
alter table public.profiles add column if not exists last_seen_at timestamp with time zone default timezone('utc'::text, now());

-- 3. 確保 RLS 關閉
alter table public.profiles disable row level security;

-- 4. 智慧開啟 Realtime (檢查是否已開啟，避免重複報錯)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' 
    and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table profiles;
  end if;
end $$;
