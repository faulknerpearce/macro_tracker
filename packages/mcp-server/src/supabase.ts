import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@macro_tracker/shared'

export type MacroTrackerSupabase = SupabaseClient<Database>

export function createAuthenticatedSupabase(
  url: string,
  anonKey: string,
  accessToken: string,
): MacroTrackerSupabase {
  return createClient<Database>(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}