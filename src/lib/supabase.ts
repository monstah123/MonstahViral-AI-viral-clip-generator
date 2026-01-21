// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Get environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Debug: Check if variables are loaded
console.log('Supabase URL loaded:', !!supabaseUrl);
console.log('Supabase Key loaded:', !!supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables!');
  console.error('Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local');
}

// Create and export Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Test connection
export const testSupabaseConnection = async () => {
  try {
    const { data, error } = await supabase.from('_dummy').select('*').limit(1);
    if (error && error.code !== '42P01') { // Ignore "table doesn't exist" error
      console.error('Supabase connection test failed:', error.message);
      return false;
    }
    console.log('✅ Supabase connected successfully!');
    return true;
  } catch (error) {
    console.error('Supabase connection error:', error);
    return false;
  }
};