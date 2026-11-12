/**
 * Supabase connection config.
 *
 * Env vars take precedence. The fallback constants keep the platform running
 * when the sandbox resets .env.local (which it does on dev-server restarts).
 */
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://pcwwvfgxnrglmmpbfqhf.supabase.co';

export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjd3d2Zmd4bnJnbG1tcGJmcWhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzIzMTEwOCwiZXhwIjoyMTA4ODA3MTA4fQ.VxltFn42SYE66BBTiYPzZI_5GQ7aMYJyIxoYHqCNgNA';

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjd3d2Zmd4bnJnbG1tcGJmcWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMzExMDgsImV4cCI6MjEwODgwNzEwOH0.z3XwMLBPidEW5kGiEezYeUBalSWL_dI1AYWGWkSSh30';

/** The tenant this platform instance operates on. */
export const DEFAULT_TENANT_ID = '652fd2be-d19a-4778-835d-db38094d7718';
