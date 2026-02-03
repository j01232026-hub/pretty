-- 1. 建立 profiles 資料表 (儲存用戶暱稱與備註)
create table public.profiles (
  user_id text primary key,
  display_name text,       -- LINE 暱稱
  custom_name text,        -- 管理員設定的備註
  last_seen_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. 關閉 RLS (方便開發)
alter table public.profiles disable row level security;

-- 3. 開啟 Realtime (讓後台能即時看到名字變更)
alter publication supabase_realtime add table profiles;
