/*
  # Production Tracking System Database Schema

  ## Overview
  Creates comprehensive database structure for hourly production tracking system with summary analytics.

  ## 1. New Tables

  ### `production_records`
  Main table storing hourly production entries
  - `id` (uuid, primary key) - Unique record identifier
  - `date` (date) - Production date
  - `hour` (integer) - Hour of production (0-23)
  - `units_produced` (integer) - Actual units produced
  - `target_units` (integer) - Target units for the hour
  - `operator_name` (text) - Name of the operator
  - `team` (text) - Team name/identifier
  - `remarks` (text) - Optional remarks/notes
  - `efficiency` (numeric) - Auto-calculated efficiency percentage
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ## 2. Security
  - Enable RLS on all tables
  - Add policies for authenticated users to manage production records
  
  ## 3. Indexes
  - Index on date and hour for fast querying
  - Index on created_at for realtime ordering

  ## 4. Functions
  - Trigger to auto-calculate efficiency on insert/update
*/

-- Create production_records table
CREATE TABLE IF NOT EXISTS production_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  hour numeric(4,2) NOT NULL CHECK (hour >= 0 AND hour <= 23.5),
  units_produced integer NOT NULL DEFAULT 0 CHECK (units_produced >= 0),
  target_units integer NOT NULL DEFAULT 0 CHECK (target_units >= 0),
  operator_name text NOT NULL,
  team text NOT NULL,
  remarks text DEFAULT '',
  efficiency numeric(5,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_production_records_date_hour ON production_records(date DESC, hour DESC);
CREATE INDEX IF NOT EXISTS idx_production_records_created_at ON production_records(created_at DESC);

-- Function to calculate efficiency
CREATE OR REPLACE FUNCTION calculate_efficiency()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.target_units > 0 THEN
    NEW.efficiency := ROUND((NEW.units_produced::numeric / NEW.target_units::numeric * 100), 2);
  ELSE
    NEW.efficiency := 0;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate efficiency
DROP TRIGGER IF EXISTS trigger_calculate_efficiency ON production_records;
CREATE TRIGGER trigger_calculate_efficiency
  BEFORE INSERT OR UPDATE ON production_records
  FOR EACH ROW
  EXECUTE FUNCTION calculate_efficiency();

-- Enable Row Level Security
ALTER TABLE production_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies for production_records
-- Allow authenticated users to view all records
CREATE POLICY "Authenticated users can view production records"
  ON production_records
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert records
CREATE POLICY "Authenticated users can insert production records"
  ON production_records
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update records
CREATE POLICY "Authenticated users can update production records"
  ON production_records
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to delete records
CREATE POLICY "Authenticated users can delete production records"
  ON production_records
  FOR DELETE
  TO authenticated
  USING (true);