/**
 * Supabase server client (service-role).
 *
 * Server-only. Never import from a client component. The service-role key
 * grants full DB access — keep behind API routes / server actions.
 *
 * V1 single-user: Kevin is the only authorized account (per Agent 37 privacy
 * spec). Multi-tenant RLS audit happens at v2.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Supabase server client requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
