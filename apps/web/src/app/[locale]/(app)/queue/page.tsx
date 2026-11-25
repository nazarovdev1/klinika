'use client';

import type { PatientDto } from '@shifo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, Card, ErrorNote, Field, Input, Select } from '@/components/ui/form';
import { api } from '@/lib/api';
import { PatientPicker, useBranches, useDoctors } from '@/lib/queries';

interface Ticket {
  id: string;
  number: number;
  status: 'WAITING' | 'CALLED' | 'IN_SERVICE' | 'DONE' | 'SKIPPED';
  patientName: string;
  doctorId: string | null;
  cabinet: string | null;
}
const TONE = {
  WAITING: 'amber',
  CALLED: 'blue',
  IN_SERVICE: 'blue',
  DONE: 'green',
  SKIPPED: 'red',
} as const;

export default function QueuePage() {
  const t = useTranslations('queue');
  const c = useTranslations('common');
  const qc = useQueryClient();
  const branches = useBranches();
  const doctors = useDoctors();
  const [branchId, setBranchId] = useState('');
  const [cabinet, setCabinet] = useState('');
  const [patient, setPatient] = useState<PatientDto | null>(null);
  const [doctorId, setDoctorId] = useState('');

  useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branches.data, branchId]);

  const list = useQuery({
    queryKey: ['queue', branchId],
    enabled: Boolean(branchId),
    queryFn: () => api<{ items: Ticket[] }>(`/queue?branchId=${branchId}`),
    refetchInterval: 5_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['queue'] });
  const issue = useMutation({
    mutationFn: () =>
      api('/queue/tickets', {
        method: 'POST',
        json: { branchId, patientId: patient?.id, doctorId: doctorId || null },
      }),
    onSuccess: async () => {
      setPatient(null);
      await refresh();
    },
  });
  const callNext = useMutation({
    mutationFn: () =>
      api('/queue/call-next', {
        method: 'POST',
        json: { branchId, cabinet: cabinet || undefined },
      }),
    onSuccess: refresh,
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      api(`/queue/tickets/${v.id}`, { method: 'PATCH', json: { status: v.status } }),
    onSuccess: refresh,
  });
  const branch = branches.data?.find((b) => b.id === branchId);

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
        <Field label={c('branch')}>
          <Select
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
            }}
          >
            {branches.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('cabinet')}>
          <Input
            value={cabinet}
            onChange={(e) => {
              setCabinet(e.target.value);
            }}
          />
        </Field>
        <div className="flex items-end">
          <Button
            type="button"
            disabled={!branchId || callNext.isPending}
            onClick={() => {
              callNext.mutate();
            }}
          >
            {t('callNext')}
          </Button>
        </div>
      </div>
      {branch?.screenToken && (
        <p className="text-sm text-muted-foreground">
          {t('screenLink')}:{' '}
          <a
            className="underline"
            href={`/screen/${branch.screenToken}`}
            target="_blank"
            rel="noreferrer"
          >
            /screen/{branch.screenToken.slice(0, 8)}…
          </a>
        </p>
      )}
      <ErrorNote error={list.error ?? callNext.error ?? setStatus.error ?? issue.error} />

      <table className="w-full max-w-3xl border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2">№</th>
            <th>{c('patient')}</th>
            <th>{c('status')}</th>
            <th>{c('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {list.data?.items.map((k) => (
            <tr key={k.id} className="border-b border-border">
              <td className="py-2 text-xl font-semibold">{k.number}</td>
              <td>{k.patientName}</td>
              <td>
                <Badge tone={TONE[k.status]}>{t(`status.${k.status}`)}</Badge>
                {k.cabinet ? ` · ${k.cabinet}` : ''}
              </td>
              <td className="space-x-2">
                {(k.status === 'CALLED' || k.status === 'WAITING') && (
                  <>
                    <button
                      type="button"
                      className="rounded-md border border-border px-2 py-1 text-sm"
                      onClick={() => {
                        setStatus.mutate({ id: k.id, status: 'IN_SERVICE' });
                      }}
                    >
                      {t('status.IN_SERVICE')}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-border px-2 py-1 text-sm"
                      onClick={() => {
                        setStatus.mutate({ id: k.id, status: 'SKIPPED' });
                      }}
                    >
                      {t('status.SKIPPED')}
                    </button>
                  </>
                )}
                {k.status === 'IN_SERVICE' && (
                  <button
                    type="button"
                    className="rounded-md border border-border px-2 py-1 text-sm"
                    onClick={() => {
                      setStatus.mutate({ id: k.id, status: 'DONE' });
                    }}
                  >
                    {t('status.DONE')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.data?.items.length === 0 && <p>{c('empty')}</p>}

      <Card title={t('issue')}>
        <Field label={c('patient')}>
          <PatientPicker value={patient} onChange={setPatient} />
        </Field>
        <Field label={c('doctor')}>
          <Select
            value={doctorId}
            onChange={(e) => {
              setDoctorId(e.target.value);
            }}
          >
            <option value="">—</option>
            {doctors.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fullName}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          type="button"
          disabled={!patient || issue.isPending}
          onClick={() => {
            issue.mutate();
          }}
        >
          {t('issueButton')}
        </Button>
      </Card>
    </section>
  );
}
