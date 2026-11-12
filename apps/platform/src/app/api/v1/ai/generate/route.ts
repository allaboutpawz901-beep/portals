import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * POST /api/v1/ai/generate — generate art via Pollinations (no key needed)
 * into design_assets (kind 'ai', prompt stored). The generated asset is a
 * real stored file in our bucket, droppable onto the canvas like any upload.
 * Body: { prompt, style?, designId?, width?, height? }
 */
const BUCKET = 'design-assets';
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const prompt = String(body?.prompt ?? '').trim();
    if (!prompt) return apiError('A prompt is required.', 400);
    const style = String(body?.style ?? '').trim();
    const designId = (body?.designId as string | null) || null;
    const width = Math.min(Math.max(parseInt(body?.width ?? '1024', 10) || 1024, 256), 2048);
    const height = Math.min(Math.max(parseInt(body?.height ?? '1024', 10) || 1024, 256), 2048);
    const fullPrompt = style ? `${prompt}, ${style} style` : prompt;
    const seed = Math.floor(Math.random() * 1_000_000);
    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}` +
      `?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    let res: Response;
    try {
      res = await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      return apiError(`Art generation failed at the provider (${res.status}).`, 502);
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      return apiError('Art generation returned a non-image response.', 502);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
      return apiError('Art generation returned an unusable image.', 502);
    }
    const storagePath = `${DEFAULT_TENANT_ID}/ai/${randomUUID()}.png`;
    const { error: upErr } = await supabaseAdmin()
      .storage.from(BUCKET)
      .upload(storagePath, bytes, { contentType: 'image/png', upsert: false });
    if (upErr) throw new Error(`storage upload: ${upErr.message}`);
    const { data, error } = await supabaseAdmin()
      .from('design_assets')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        design_id: designId,
        kind: 'ai',
        storage_path: storagePath,
        bucket: BUCKET,
        mime_type: 'image/png',
        width,
        height,
        provider: 'pollinations',
        prompt,
        metadata: { style: style || null, model: 'flux', seed, source: 'pollinations' },
      })
      .select('id,kind,storage_path,bucket,mime_type,width,height,prompt,provider,metadata,design_id,created_at')
      .single();
    if (error) throw new Error(`design_assets insert: ${error.message}`);
    const { data: signed } = await supabaseAdmin()
      .storage.from(BUCKET)
      .createSignedUrl(storagePath, 3600);
    return NextResponse.json(
      {
        asset: {
          id: data.id,
          kind: data.kind,
          storagePath: data.storage_path,
          bucket: data.bucket,
          mimeType: data.mime_type,
          width: data.width,
          height: data.height,
          prompt: data.prompt,
          provider: data.provider,
          metadata: data.metadata ?? {},
          designId: data.design_id,
          createdAt: data.created_at,
          url: signed?.signedUrl ?? null,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Art generation failed.');
  }
}
