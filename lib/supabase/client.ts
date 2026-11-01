"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Browser Supabase client. Returns null when the public env vars are unset
// (sign-in button is hidden in that case; see app/signin/page.tsx).
let browserClient: SupabaseClient | null | undefined;

export function createSupabaseBrowserClient(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  browserClient = url && anonKey ? createBrowserClient(url, anonKey) : null;
  return browserClient;
}

export async function supabaseSignOut(): Promise<void> {
  const client = createSupabaseBrowserClient();
  if (client) {
    await client.auth.signOut().catch(() => undefined);
  }
}
