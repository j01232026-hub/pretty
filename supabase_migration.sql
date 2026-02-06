
-- Add 'visible' column to 'stylists' table
ALTER TABLE stylists 
ADD COLUMN visible BOOLEAN DEFAULT true;

-- Update existing records to have visible = true
UPDATE stylists 
SET visible = true 
WHERE visible IS NULL;
