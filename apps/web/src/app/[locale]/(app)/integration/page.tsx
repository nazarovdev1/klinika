'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, PlugZap, RotateCw, Save, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Field, Input, Select, Status, type Tone } from '@/components/ui/form';
import { EmptyState, KpiStrip, PageHeader, Toolbar } from '@/components/ui/page';
import { api } from '@/lib/api';

interface DhpStatus {
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
const TONE: Record<SyncRecord['status'], Tone> = {
  PENDING: 'info',
  SENT: 'ok',
  FAILED: 'warn',
  DEAD: 'danger',
  SKIPPED: 'neutral',
};

export default function IntegrationPage() {
  const t = useTranslations('integration');
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>('');
  const [org, setOrg] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ['dhp-status'],
    queryFn: () => api<DhpStatus>('/integrations/dhp/status'),
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
    <section>
      <PageHeader title={t('title')}>
        {s && (
          <Status tone={s.reachable ? 'ok' : 'danger'} icon={s.reachable ? CheckCircle2 : XCircle}>
            {t('reachable')}: {s.reachable ? t('yes') : t('no')}
          </Status>
        )}
      </PageHeader>
      {(status.error || records.error) && <ErrorNote error={new Error(t('loadError'))} />}

      {s && (
        <>
          <KpiStrip items={STATUSES.map((k) => ({ label: k, value: s.counts[k] ?? 0 }))} />
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card title={t('mode')}>
              <p className="num text-[15px] font-medium">{s.mode}</p>
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate(org ?? s.dhpOrganizationId ?? '');
                }}
              >
                <Field label={t('orgId')} className="flex-1">
                  <Input
                    className="num"
                    value={org ?? s.dhpOrganizationId ?? ''}
                    onChange={(e) => {
                      setOrg(e.target.value);
                    }}
                  />
                </Field>
                <Button type="submit" icon={Save} loading={save.isPending}>
                  {t('save')}
                </Button>
              </form>
              {save.isSuccess && (
                <p role="status" className="flex items-center gap-1.5 text-[14px] text-ok-text">
                  <CheckCircle2 size={16} aria-hidden />
                  {t('saved')}
                </p>
              )}
            </Card>
          </div>
        </>
      )}

      <h2 className="mb-2 text-[16px] font-semibold">{t('records')}</h2>
      <Toolbar>
        <Field label={t('status')} className="w-48">
          <Select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
            }}
          >
            <option value="">{t('all')}</option>
            {STATUSES.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </Field>
      </Toolbar>
      <Card flush>
        <table className="tbl">
          <thead>
            <tr>
              <th>{t('entity')}</th>
              <th>{t('status')}</th>
              <th className="r">{t('attempts')}</th>
              <th>{t('error')}</th>
              <th className="r" />
            </tr>
          </thead>
          <tbody>
            {records.data?.items.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.entityType} <span className="num text-ink-2">{r.entityId.slice(0, 8)}</span>
                </td>
                <td>
                  <Status tone={TONE[r.status]}>{r.status}</Status>
                </td>
                <td className="r num">{r.attempts}</td>
                <td className="max-w-xs truncate text-ink-2">{r.lastError ?? '—'}</td>
                <td className="r">
                  {(r.status === 'FAILED' || r.status === 'DEAD') && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={RotateCw}
                      onClick={() => {
                        retry.mutate(r.id);
                      }}
                    >
                      {t('retry')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {records.data?.items.length === 0 && <EmptyState icon={PlugZap}>{t('empty')}</EmptyState>}
      </Card>
    </section>
  );
}
