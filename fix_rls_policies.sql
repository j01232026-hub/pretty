-- Fix RLS Policies for Customer Access

-- 1. Allow customers to view their own bookings
-- Note: 'user_id' in bookings is currently a TEXT field (stored from LIFF), not necessarily UUID linking to auth.users.
-- However, if we assume user_id matches auth.uid() (if they are logged in via Supabase Auth linked to LIFF), we can use it.
-- But the current system seems to pass user_id as a string.
-- If the user is authenticated via Supabase (auth.uid()), we can check against that.
-- Given the current implementation in spa-app.js uses App.state.currentUserId which comes from LIFF,
-- and the API uses that same ID.
-- For direct Supabase client access (if used in future), we need a policy.
-- If user_id column stores the LIFF User ID, and the user is authenticated with a custom token mapping to that ID, it works.
-- If not, and they are just "public" users with a LIFF ID, RLS is tricky.
-- BUT, for 'stores', it should definitely be public read.

-- Enable Public Read for Stores (Name, Address, etc. are public info)
DROP POLICY IF EXISTS "Public can view stores" ON public.stores;
CREATE POLICY "Public can view stores" ON public.stores FOR SELECT USING (true);

-- Allow authenticated users to view their own bookings
-- (Assuming user_id column holds the auth.uid() or we trust the claim)
DROP POLICY IF EXISTS "Users can view their own bookings" ON public.bookings;
CREATE POLICY "Users can view their own bookings" ON public.bookings FOR SELECT USING (
    auth.uid()::text = user_id -- Cast auth.uid() to text to match user_id column type
);
