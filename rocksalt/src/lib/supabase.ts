import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createDemoClient } from '@/lib/demoBackend'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Without Supabase credentials (e.g. the static GitHub Pages build) the app
// runs in demo mode: reports are kept in this browser only and never shared.
export const isDemoMode = !supabaseUrl || !supabaseAnonKey

export const supabase: SupabaseClient = isDemoMode
  ? createDemoClient()
  : createClient(supabaseUrl, supabaseAnonKey)

export function photoUrl(photoPath: string): string {
  if (isDemoMode) return photoPath
  return `${supabaseUrl}/storage/v1/object/public/sighting-photos/${photoPath}`
}
