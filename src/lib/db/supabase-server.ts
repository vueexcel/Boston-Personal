import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env/server";

type GlobalSupabase = typeof globalThis & {
  __bostelSupabaseServer?: SupabaseClient;
};

/**
 * Returns a shared Supabase client (service role) for server-side reads/writes.
 * Never import this from client components.
 */
export function createServerSupabase(): SupabaseClient {
  const g = globalThis as GlobalSupabase;
  if (g.__bostelSupabaseServer) return g.__bostelSupabaseServer;

  const env = getServerEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  const client = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
  g.__bostelSupabaseServer = client;
  return client;
}
