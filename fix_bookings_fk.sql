-- Fix Missing Foreign Key for Bookings
-- The API 500 Error "Could not find a relationship" indicates the Foreign Key is missing.

-- 1. Add Foreign Key if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'bookings_store_id_fkey'
    ) THEN
        ALTER TABLE public.bookings
        ADD CONSTRAINT bookings_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id)
        ON DELETE CASCADE;
    END IF;
END $$;

-- 2. Notify PostgREST to reload schema cache (just in case)
NOTIFY pgrst, 'reload schema';
