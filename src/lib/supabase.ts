import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface ProductionRecord {
  id?: string;
  date: string;
  hour: number;
  units_produced: number;
  target_units: number;
  manpower: number;
  operator_id?: number;
  operator_name: string;
  team: string;
  remarks?: string;
  efficiency?: number;
  item?: { model: string; quantity: number | string }[];
  created_at?: string;
  updated_at?: string;
}

export interface Operator {
  id: number;
  name: string;
  team: string;
  created_at?: string;
  updated_at?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  team: string;
  created_at?: string;
  updated_at?: string;
}
