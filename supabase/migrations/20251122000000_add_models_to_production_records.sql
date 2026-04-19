/*
  # Add Item to Production Records Migration

  ## Overview
  Adds an 'item' column to production_records table to store multiple items with quantities.

  ## Changes
  - Add 'item' column (JSONB) to production_records table
    - Array of objects: [{model: string, quantity: number}]
  - Update trigger to calculate units_produced from sum of item quantities
*/

-- Add item column
ALTER TABLE production_records ADD COLUMN item JSONB DEFAULT '[]'::jsonb;

-- Update the calculate_efficiency function to also calculate units_produced from item
CREATE OR REPLACE FUNCTION calculate_efficiency()
RETURNS TRIGGER AS $$
DECLARE
  total_units INTEGER := 0;
  item_record RECORD;
BEGIN
  -- Calculate total units from item if item exist
  IF NEW.item IS NOT NULL AND jsonb_array_length(NEW.item) > 0 THEN
    FOR item_record IN SELECT * FROM jsonb_array_elements(NEW.item)
    LOOP
      total_units := total_units + (item_record->>'quantity')::integer;
    END LOOP;
    NEW.units_produced := total_units;
  END IF;

  -- Calculate efficiency
  IF NEW.target_units > 0 THEN
    NEW.efficiency := ROUND((NEW.units_produced::numeric / NEW.target_units::numeric * 100), 2);
  ELSE
    NEW.efficiency := 0;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
