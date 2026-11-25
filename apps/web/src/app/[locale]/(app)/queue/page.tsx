'use client';

import type { PatientDto } from '@shifo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCheck,
  Clock,
  ListOrdered,
  Megaphone,
  Monitor,
  Stethoscope,
  Ticket,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Field, Input, Select, Status, type Tone } from '@/components/ui/form';
import { EmptyState, PageHeader, Split, Toolbar } from '@/components/ui/page';
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
const ST: Record<Ticket['status'], { tone: Tone; icon: LucideIcon }> = {
  WAITING: { tone: 'warn', icon: Clock },
  CALLED: { tone: 'info', icon: Megaphone },
  IN_SERVICE: { tone: 'warn', icon: Stethoscope },
  DONE: { tone: 'ok', icon: CheckCheck },
  SKIPPED: { tone: 'danger', icon: UserX },
};

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
  const waiting = list.data?.items.filter((k) => k.status === 'WAITING').length ?? 0;

  const issuePanel = (
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
        icon={Ticket}
        disabled={!patient}
        loading={issue.isPending}
        onClick={() => {
          issue.mutate();
        }}
      >
        {t('issueButton')}
      </Button>
      <ErrorNote error={issue.error} />
    </Card>
  );

  return (
    <section>
      <PageHeader
        title={t('title')}
        sub={`${String(waiting)} ${t('status.WAITING').toLowerCase()}`}
      >
        {branch?.screenToken && (
          <a
            className="inline-flex h-9 items-center gap-2 rounded-control border border-line bg-surface px-3.5 text-[14px] text-ink no-underline hover:bg-row-hover hover:text-ink"
            href={`/screen/${branch.screenToken}`}
            target="_blank"
            rel="noreferrer"
          >
            <Monitor size={16} aria-hidden />
            {t('screenLink')}
          </a>
        )}
      </PageHeader>
      <Toolbar>
        <Field label={c('branch')} className="w-56">
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
        <Field label={t('cabinet')} className="w-28">
          <Input
            className="num"
            value={cabinet}
            onChange={(e) => {
              setCabinet(e.target.value);
            }}
          />
        </Field>
        <Button
          icon={Megaphone}
          disabled={!branchId}
          loading={callNext.isPending}
          onClick={() => {
            callNext.mutate();
          }}
        >
          {t('callNext')}
        </Button>
      </Toolbar>
      <ErrorNote error={list.error ?? callNext.error ?? setStatus.error} />

      <Split open panel={issuePanel}>
        <Card flush>
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-20">№</th>
                <th>{c('patient')}</th>
                <th>{c('status')}</th>
                <th className="r">{c('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((k) => {
                const st = ST[k.status];
                return (
                  <tr key={k.id}>
                    <td className="num text-[18px] font-semibold">{k.number}</td>
                    <td>{k.patientName}</td>
                    <td>
                      <Status tone={st.tone} icon={st.icon}>
                        {t(`status.${k.status}`)}
                      </Status>
                      {k.cabinet && <span className="num ml-2 text-ink-2">{k.cabinet}</span>}
                    </td>
                    <td className="r">
                      <span className="inline-flex gap-1.5">
                        {(k.status === 'CALLED' || k.status === 'WAITING') && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setStatus.mutate({ id: k.id, status: 'IN_SERVICE' });
                              }}
                            >
                              {t('status.IN_SERVICE')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setStatus.mutate({ id: k.id, status: 'SKIPPED' });
                              }}
                            >
                              {t('status.SKIPPED')}
                            </Button>
                          </>
                        )}
                        {k.status === 'IN_SERVICE' && (
                          <Button
                            size="sm"
                            variant="outline"
                            icon={CheckCheck}
                            onClick={() => {
                              setStatus.mutate({ id: k.id, status: 'DONE' });
                            }}
                          >
                            {t('status.DONE')}
                          </Button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.data?.items.length === 0 && (
            <EmptyState icon={ListOrdered}>{c('empty')}</EmptyState>
          )}
        </Card>
      </Split>
    </section>
  );
}
