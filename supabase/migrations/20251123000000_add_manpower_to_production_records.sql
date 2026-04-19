-- Add manpower column to production_records table
ALTER TABLE production_records ADD COLUMN manpower INTEGER DEFAULT 0;

-- Update the calculate_efficiency function to include manpower in the logic if needed
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
