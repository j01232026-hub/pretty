-- 1. Create 'avatars' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Create 'stores' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('stores', 'stores', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Enable RLS on storage.objects (usually enabled by default, but good to ensure)
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 4. Policies for 'avatars' bucket

-- Public Read
DROP POLICY IF EXISTS "Public Access Avatars" ON storage.objects;
CREATE POLICY "Public Access Avatars"
ON storage.objects FOR SELECT
USING ( bucket_id = 'avatars' );

-- Authenticated Upload
DROP POLICY IF EXISTS "Authenticated Upload Avatars" ON storage.objects;
CREATE POLICY "Authenticated Upload Avatars"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'avatars' AND auth.role() = 'authenticated' );

-- Authenticated Update
DROP POLICY IF EXISTS "Authenticated Update Avatars" ON storage.objects;
CREATE POLICY "Authenticated Update Avatars"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'avatars' AND auth.role() = 'authenticated' );

-- 5. Policies for 'stores' bucket

-- Public Read
DROP POLICY IF EXISTS "Public Access Stores" ON storage.objects;
CREATE POLICY "Public Access Stores"
ON storage.objects FOR SELECT
USING ( bucket_id = 'stores' );

-- Authenticated Upload
DROP POLICY IF EXISTS "Authenticated Upload Stores" ON storage.objects;
CREATE POLICY "Authenticated Upload Stores"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'stores' AND auth.role() = 'authenticated' );

-- Authenticated Update
DROP POLICY IF EXISTS "Authenticated Update Stores" ON storage.objects;
CREATE POLICY "Authenticated Update Stores"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'stores' AND auth.role() = 'authenticated' );
