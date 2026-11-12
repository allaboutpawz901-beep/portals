import { createDecipheriv, createHash } from 'crypto';
import { supabaseAdmin, DEFAULT_TENANT_ID } from './supabaseAdmin';
import { SUPABASE_SERVICE_ROLE_KEY } from './supabaseConfig';

/**
 * Integration keys (AES-256-GCM, same scheme as the Unsaid platform).
 * Key material comes from INTEGRATIONS_ENCRYPTION_KEY when set, otherwise
 * the service-role key — server-side only, never sent to a client.
 * The stored values are what the Connections page saves; a missing key
 * resolves to "" and the caller reports it, never fakes a supplier call.
 */

function keyMaterial(): Buffer {
  const material =
    process.env.INTEGRATIONS_ENCRYPTION_KEY || SUPABASE_SERVICE_ROLE_KEY;
  if (!material) throw new Error('No encryption key material configured.');
  return createHash('sha256').update(material).digest();
}

export function decryptValue(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', keyMaterial(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

const cache = new Map<string, { value: string | null; at: number }>();
const TTL_MS = 30_000;

export async function getIntegrationKey(keyName: string): Promise<string> {
  const now = Date.now();
  const hit = cache.get(keyName);
  if (hit && now - hit.at < TTL_MS) return hit.value ?? process.env[keyName] ?? '';
  let value: string | null = null;
  try {
    const { data } = await supabaseAdmin()
      .from('integration_keys')
      .select('encrypted_value')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('key_name', keyName)
      .maybeSingle();
    if (data?.encrypted_value) value = decryptValue(data.encrypted_value as string);
  } catch {
    value = null;
  }
  cache.set(keyName, { value, at: now });
  return value ?? process.env[keyName] ?? '';
}
