import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * /api/v1/files — the studio's asset store (design_assets).
 *   GET  ?kind=&q=&limit=  — the user's real assets, newest first.
 *   POST multipart { file, designId?, kind?, folder?, license? } — signed
 *        upload into the private `design-assets` bucket, tenant-scoped path,
 *        then a design_assets row. The returned asset id is what lands in
 *        placement_spec layers. Max 25 MB; PNG/JPG/SVG/WebP/PDF only.
 */
const BUCKET = 'design-assets';
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/webp',
  'application/pdf',
]);

function sanitize(name: string): string {
  return (name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'file');
}

async function signedUrl(path: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .storage.from(BUCKET)
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

function toAssetRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    kind: row.kind as string,
    storagePath: row.storage_path as string,
    bucket: row.bucket as string,
    mimeType: (row.mime_type as string | null) ?? null,
    width: (row.width as number | null) ?? null,
    height: (row.height as number | null) ?? null,
    prompt: (row.prompt as string | null) ?? null,
    provider: (row.provider as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    designId: (row.design_id as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const kind = params.get('kind');
    const q = params.get('q');
    const limit = Math.min(Math.max(parseInt(params.get('limit') ?? '50', 10) || 50, 1), 100);
    let query = supabaseAdmin()
      .from('design_assets')
      .select('id,kind,storage_path,bucket,mime_type,width,height,prompt,provider,metadata,design_id,created_at')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (kind) query = query.eq('kind', kind);
    if (q) query = query.or(`storage_path.ilike.%${q}%,prompt.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) throw new Error(`design_assets: ${error.message}`);
    const assets = await Promise.all(
      (data ?? []).map(async (row) => ({
        ...toAssetRow(row as Record<string, unknown>),
        url: await signedUrl(row.storage_path as string),
      })),
    );
    return NextResponse.json({ assets });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to list assets.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string' || !('arrayBuffer' in file)) {
      return apiError('No file uploaded (form field "file").', 400);
    }
    const upload = file as File;
    if (!ALLOWED_MIME.has(upload.type)) {
      return apiError(`Unsupported file type ${upload.type}. PNG, JPG, SVG, WebP, or PDF.`, 422);
    }
    if (upload.size > MAX_BYTES) {
      return apiError('File is over the 25 MB limit.', 422);
    }
    const kind = String(form.get('kind') ?? 'upload');
    if (!['upload', 'image', 'shape'].includes(kind)) {
      return apiError(`Unknown asset kind ${kind}.`, 422);
    }
    const designId = (form.get('designId') as string | null) || null;
    const folder = (form.get('folder') as string | null) || null;
    const license = (form.get('license') as string | null) || null;
    const storagePath = `${DEFAULT_TENANT_ID}/${kind}/${randomUUID()}-${sanitize(upload.name)}`;
    const bytes = Buffer.from(await upload.arrayBuffer());
    const { error: upErr } = await supabaseAdmin()
      .storage.from(BUCKET)
      .upload(storagePath, bytes, {
        contentType: upload.type,
        upsert: false,
      });
    if (upErr) throw new Error(`storage upload: ${upErr.message}`);
    const metadata: Record<string, unknown> = {
      originalName: upload.name,
      sizeBytes: upload.size,
    };
    if (folder) metadata.folder = folder;
    if (license) metadata.license = license;
    metadata.provenance = designId ? 'design-upload' : 'library-upload';
    const { data, error } = await supabaseAdmin()
      .from('design_assets')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        design_id: designId,
        kind,
        storage_path: storagePath,
        bucket: BUCKET,
        mime_type: upload.type,
        metadata,
      })
      .select('id,kind,storage_path,bucket,mime_type,width,height,prompt,provider,metadata,design_id,created_at')
      .single();
    if (error) throw new Error(`design_assets insert: ${error.message}`);
    return NextResponse.json(
      { asset: { ...toAssetRow(data as Record<string, unknown>), url: await signedUrl(storagePath) } },
      { status: 201 },
    );
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Upload failed.');
  }
}
