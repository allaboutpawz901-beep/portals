'use client';
/**
 * useTemplatesApi — data layer for the CRM Message Templates screen.
 *
 * Reads go through useList (cache-first: instant render, background
 * revalidation against /api/crm/templates). Mutations are fetchJson based,
 * return { ok, error } and NEVER toast — the screen decides the feedback.
 */
import { useCallback } from 'react';
import { useList, fetchJson } from '@/hooks/useCrmApi';

/** Row shape of Supabase `crm_message_templates`. */
export interface CrmTemplate {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string | null;
  variables: string[] | null;
  category: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Payload for create (POST) — channel is required alongside name. */
export interface TemplateInput {
  name: string;
  channel: string;
  subject?: string | null;
  body?: string | null;
  variables?: string[];
  category?: string | null;
}

/** Fields a PATCH may touch. */
export interface TemplateUpdates extends Partial<TemplateInput> {
  is_active?: boolean;
}

type MutationResult = { ok: boolean; error?: string };

/**
 * Cache-first list hook. Pass a channel ('email' | 'sms' | 'chat') to scope
 * the fetch server-side, or omit it for the full tenant list. The cache key
 * includes the channel so scoped and unscoped views never collide.
 */
export function useTemplates(channel?: string) {
  const params = new URLSearchParams();
  if (channel) params.set('channel', channel);
  const url = `/api/crm/templates${params.toString() ? '?' + params.toString() : ''}`;
  return useList<CrmTemplate>(`crmTemplates:${channel || 'all'}`, url);
}

/** Mutations — no toasts inside; callers own the feedback. */
export function useTemplateMutations() {
  const createTemplate = useCallback(async (input: TemplateInput): Promise<MutationResult> => {
    const res = await fetchJson<{ data: CrmTemplate }>('/api/crm/templates', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }, []);

  const updateTemplate = useCallback(async (
    id: string,
    updates: TemplateUpdates,
  ): Promise<MutationResult> => {
    const res = await fetchJson<{ data: CrmTemplate }>(`/api/crm/templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }, []);

  const deleteTemplate = useCallback(async (id: string): Promise<MutationResult> => {
    const res = await fetchJson<{ data: { id: string } }>(`/api/crm/templates/${id}`, {
      method: 'DELETE',
    });
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }, []);

  return { createTemplate, updateTemplate, deleteTemplate };
}
