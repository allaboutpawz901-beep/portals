import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEFAULT_TENANT_ID } from './supabaseConfig';

/**
 * Server-side Supabase client (service role). Lazy singleton — never throws
 * at module-eval time, so a misconfigured env degrades to a JSON error on
 * the request instead of a 500 HTML page that crashes client JSON parsers.
 */
let _client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _client;
}

export { DEFAULT_TENANT_ID };
