-- Phase 1: Database Multi-tenancy Refactoring

-- 1. Enhance 'stores' table to replace 'salon_info'
-- Add missing columns from salon_info to stores
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Refactor 'stylists' for multi-tenancy
-- Add store_id to stylists
ALTER TABLE public.stylists ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
-- Enable RLS for stylists
ALTER TABLE public.stylists ENABLE ROW LEVEL SECURITY;

-- 3. Refactor 'bookings' for multi-tenancy
-- Add store_id to bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
-- Enable RLS for bookings
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for Multi-tenancy Isolation

-- STYLISTS Policies
-- Public read access (for booking pages) - scoped by store_id if needed, but generally public is fine for now
-- However, we want to ensure isolation in Admin panel.
-- Ideally, admin users can only see stylists belonging to their store.
-- For now, let's allow public read, but restrict write.
DROP POLICY IF EXISTS "Public can view stylists" ON public.stylists;
CREATE POLICY "Public can view stylists" ON public.stylists FOR SELECT USING (true);

DROP POLICY IF EXISTS "Owners can manage their stylists" ON public.stylists;
CREATE POLICY "Owners can manage their stylists" ON public.stylists FOR ALL USING (
    store_id IN (
        SELECT id FROM public.stores WHERE owner_id = auth.uid()
    )
);

-- BOOKINGS Policies
-- Users can see their own bookings (via user_id in bookings table, if applicable)
-- But wait, bookings table has 'user_id' as text (line_id or auth id?). 
-- Current schema says user_id is text.
-- Owners can see bookings for their store.

DROP POLICY IF EXISTS "Owners can view their store bookings" ON public.bookings;
CREATE POLICY "Owners can view their store bookings" ON public.bookings FOR SELECT USING (
    store_id IN (
        SELECT id FROM public.stores WHERE owner_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Owners can manage their store bookings" ON public.bookings;
CREATE POLICY "Owners can manage their store bookings" ON public.bookings FOR ALL USING (
    store_id IN (
        SELECT id FROM public.stores WHERE owner_id = auth.uid()
    )
);

-- Note: We also need policies for public users (customers) to create bookings.
-- Usually, anyone can insert a booking, but they must provide a valid store_id.
DROP POLICY IF EXISTS "Public can create bookings" ON public.bookings;
CREATE POLICY "Public can create bookings" ON public.bookings FOR INSERT WITH CHECK (
    store_id IS NOT NULL
);

-- 5. Handle 'salon_info' deprecation (Optional data migration)
-- We don't migrate data automatically here as we don't know which store owns the legacy data.
-- Users should manually update their store info in the new Admin UI.

-- 6. Add store_id to other tables if they exist (e.g. services, members)
-- Checking 'messages' table from context
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view their store messages" ON public.messages;
CREATE POLICY "Owners can view their store messages" ON public.messages FOR SELECT USING (
    store_id IN (
        SELECT id FROM public.stores WHERE owner_id = auth.uid()
    )
);
