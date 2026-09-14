import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** True once real Supabase credentials are configured. */
export const supabaseConfigured = Boolean(url && anonKey)

if (!supabaseConfigured) {
  // Surfaced early so a missing .env.local is obvious during development.
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env.local and fill in your project values. ' +
      'The app will render, but authentication and data access will not work until then.',
  )
}

// Placeholder values keep createClient from throwing when env is absent, so the
// UI still boots during setup. Real credentials are required for auth/data.
const PLACEHOLDER_URL = 'https://placeholder.supabase.co'
const PLACEHOLDER_KEY = 'public-anon-placeholder'

// Typed with the generated Database schema (src/types/database.ts).
export const supabase = createClient<Database>(url || PLACEHOLDER_URL, anonKey || PLACEHOLDER_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
