
-- Add 'visible' column to 'stylists' table
ALTER TABLE stylists 
ADD COLUMN visible BOOLEAN DEFAULT true;

-- Update existing records to be visible
UPDATE stylists 
SET visible = true 
WHERE visible IS NULL;
