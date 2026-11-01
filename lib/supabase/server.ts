import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

// Server-side Supabase client (Route Handlers, Server Components, Server
// Actions). Returns null when the public Supabase env vars are unset, so
// builds and guest-mode renders never crash on a missing configuration.
// The anon key is public by design; it can never delete auth users or read
// other users' rows (no service-role key is used anywhere in this repo).
export const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  if (!supabaseConfigured) return null;
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return jar.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => jar.set(name, value, options));
          } catch {
            // Called from a Server Component where set is a no-op; the
            // middleware refreshes the session cookies instead.
          }
        },
      },
    }
  );
}
