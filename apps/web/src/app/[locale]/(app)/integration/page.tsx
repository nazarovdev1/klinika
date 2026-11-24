'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api } from '@/lib/api';

interface Status {
  mode: string;
  reachable: boolean;
  dhpOrganizationId: string | null;
  counts: Record<string, number>;
}
interface SyncRecord {
  id: string;
  entityType: string;
  entityId: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'DEAD' | 'SKIPPED';
  attempts: number;
  lastError: string | null;
}

const STATUSES = ['PENDING', 'SENT', 'FAILED', 'DEAD', 'SKIPPED'] as const;

export default function IntegrationPage() {
  const t = useTranslations('integration');
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>('');
  const [org, setOrg] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ['dhp-status'],
    queryFn: () => api<Status>('/integrations/dhp/status'),
    refetchInterval: 10_000,
  });
  const records = useQuery({
    queryKey: ['dhp-records', filter],
    queryFn: () =>
      api<{ items: SyncRecord[] }>(`/integrations/dhp/records${filter ? `?status=${filter}` : ''}`),
    refetchInterval: 10_000,
  });
  const retry = useMutation({
    mutationFn: (id: string) => api(`/integrations/dhp/records/${id}/retry`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dhp-records'] }),
  });
  const save = useMutation({
    mutationFn: (v: string) =>
      api('/integrations/dhp/settings', {
        method: 'PUT',
        json: { dhpOrganizationId: v.trim() || null },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dhp-status'] }),
  });

  const s = status.data;
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      {(status.error || records.error) && <p role="alert">{t('loadError')}</p>}

      {s && (
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <p>
            {t('mode')}: <b>{s.mode}</b>
          </p>
          <p>
            {t('reachable')}: <b>{s.reachable ? t('yes') : t('no')}</b>
          </p>
          <ul className="flex flex-wrap gap-3 sm:col-span-2">
            {STATUSES.map((k) => (
              <li key={k} className="rounded-md border border-border px-3 py-1">
                {k}: <b>{s.counts[k] ?? 0}</b>
              </li>
            ))}
          </ul>
          <form
            className="flex items-end gap-2 sm:col-span-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(org ?? s.dhpOrganizationId ?? '');
            }}
          >
            <label className="flex-1">
              <span className="mb-1 block">{t('orgId')}</span>
              <input
                value={org ?? s.dhpOrganizationId ?? ''}
                onChange={(e) => {
                  setOrg(e.target.value);
                }}
                className="w-full rounded-md border border-border px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
            >
              {t('save')}
            </button>
            {save.isSuccess && <span role="status">{t('saved')}</span>}
          </form>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">{t('records')}</h2>
        <label className="block max-w-xs">
          <span className="mb-1 block">{t('status')}</span>
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
            }}
            className="w-full rounded-md border border-border px-3 py-2"
          >
            <option value="">{t('all')}</option>
            {STATUSES.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2">{t('entity')}</th>
              <th>{t('status')}</th>
              <th>{t('attempts')}</th>
              <th>{t('error')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {records.data?.items.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="py-2">
                  {r.entityType} {r.entityId.slice(0, 8)}
                </td>
                <td>{r.status}</td>
                <td>{r.attempts}</td>
                <td className="max-w-xs truncate">{r.lastError ?? '—'}</td>
                <td>
                  {(r.status === 'FAILED' || r.status === 'DEAD') && (
                    <button
                      type="button"
                      onClick={() => {
                        retry.mutate(r.id);
                      }}
                      className="rounded-md border border-border px-3 py-1"
                    >
                      {t('retry')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {records.data?.items.length === 0 && <p>{t('empty')}</p>}
      </div>
    </section>
  );
}
