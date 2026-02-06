
-- Add 'type' column to 'bookings' table
-- types: 'regular' (default, 一般預約), 'staff_booking' (代客預約), 'block' (卡位/休假)
ALTER TABLE bookings 
ADD COLUMN type VARCHAR(20) DEFAULT 'regular';

-- Update existing records to be 'regular'
UPDATE bookings 
SET type = 'regular' 
WHERE type IS NULL;

-- Make user_id nullable to support 'block' type where no customer is involved
ALTER TABLE bookings 
ALTER COLUMN user_id DROP NOT NULL;
