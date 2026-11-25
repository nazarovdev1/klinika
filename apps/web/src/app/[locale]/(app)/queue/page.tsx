'use client';

import type { PatientDto } from '@shifo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCheck,
  Clock,
  ListOrdered,
  Megaphone,
  Monitor,
  Plus,
  Stethoscope,
  Ticket,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorNote, Field, Input, Select, Status, type Tone } from '@/components/ui/form';
import { EmptyState, Modal, PaneHead, PaneList, Pills, Row, Workspace } from '@/components/ui/page';
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
  const [issuing, setIssuing] = useState(false);
  const [filter, setFilter] = useState<'active' | 'WAITING' | 'DONE' | 'all'>('active');
  const [selected, setSelected] = useState<string | null>(null);

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
      setIssuing(false);
      await refresh();
    },
  });
  const callNext = useMutation({
    mutationFn: () =>
      api<{ id: string }>('/queue/call-next', {
        method: 'POST',
        json: { branchId, cabinet: cabinet || undefined },
      }),
    onSuccess: async (k) => {
      setSelected(k.id);
      await refresh();
    },
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      api(`/queue/tickets/${v.id}`, { method: 'PATCH', json: { status: v.status } }),
    onSuccess: refresh,
  });
  const branch = branches.data?.find((b) => b.id === branchId);
  const all = list.data?.items ?? [];
  const order: Ticket['status'][] = ['IN_SERVICE', 'CALLED', 'WAITING'];
  const isActive = (k: Ticket) => order.includes(k.status);
  const shown = all.filter((k) =>
    filter === 'all' ? true : filter === 'active' ? isActive(k) : k.status === filter,
  );
  // Until someone picks a ticket, show the one closest to the doctor.
  const current =
    all.find((k) => k.id === selected) ??
    order.map((s) => all.find((k) => k.status === s)).find(Boolean) ??
    null;
  const waiting = list.data?.items.filter((k) => k.status === 'WAITING').length ?? 0;

  return (
    <Workspace
      list={
        <>
          <PaneHead
            title={t('title')}
            action={
              <Button
                variant="outline"
                icon={Plus}
                onClick={() => {
                  setIssuing(true);
                }}
              >
                {t('ticket')}
              </Button>
            }
          >
            <p className="text-[13px] text-ink-2">
              {t('status.WAITING')}: <b className="num font-semibold text-ink">{waiting}</b>
            </p>
            <Pills
              label={c('status')}
              value={filter}
              onChange={setFilter}
              options={[
                { id: 'active', label: t('active') },
                { id: 'WAITING', label: t('status.WAITING') },
                { id: 'DONE', label: t('status.DONE') },
                { id: 'all', label: c('all') },
              ]}
            />
          </PaneHead>
          <PaneList>
            {shown.map((k) => {
              const st = ST[k.status];
              return (
                <Row
                  key={k.id}
                  selected={current?.id === k.id}
                  onSelect={() => {
                    setSelected(k.id);
                  }}
                  title={k.patientName}
                  end={<span className="text-[18px]">{k.number}</span>}
                  sub={k.cabinet ? `${t('cabinet')} ${k.cabinet}` : ''}
                  status={
                    <Status tone={st.tone} icon={st.icon}>
                      {t(`status.${k.status}`)}
                    </Status>
                  }
                />
              );
            })}
            {list.isSuccess && shown.length === 0 && (
              <li>
                <EmptyState icon={ListOrdered}>{c('empty')}</EmptyState>
              </li>
            )}
          </PaneList>
        </>
      }
      side={
        <>
          <h2 className="text-[17px] font-semibold">{t('callNext')}</h2>
          <Field label={c('branch')}>
            <Select
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setSelected(null);
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
              className="num"
              value={cabinet}
              onChange={(e) => {
                setCabinet(e.target.value);
              }}
            />
          </Field>
          <Button
            size="lg"
            icon={Megaphone}
            disabled={!branchId || waiting === 0}
            loading={callNext.isPending}
            onClick={() => {
              callNext.mutate();
            }}
          >
            {t('callNext')}
          </Button>
          {branch?.screenToken && (
            <a
              className="inline-flex h-10 items-center justify-center gap-2 rounded-control border border-line text-[14px] text-ink no-underline hover:bg-row-hover hover:text-ink"
              href={`/screen/${branch.screenToken}`}
              target="_blank"
              rel="noreferrer"
            >
              <Monitor size={16} aria-hidden />
              {t('screenLink')}
            </a>
          )}
        </>
      }
    >
      <ErrorNote error={list.error ?? callNext.error ?? setStatus.error} />
      {current ? (
        <div className="mx-auto w-full max-w-[440px] drop-shadow-[0_8px_16px_rgba(20,36,95,0.12)]">
          <article className="receipt text-center">
            <p className="text-ink-2">{t('ticket')}</p>
            <p className="num text-[112px] font-semibold leading-none tracking-tighter text-primary">
              {current.number}
            </p>
            <hr />
            <h2 className="text-[20px] font-semibold">{current.patientName}</h2>
            {current.cabinet && (
              <p className="num mt-1 text-ink-2">
                {t('cabinet')} {current.cabinet}
              </p>
            )}
            <div className="mt-3">
              <Status tone={ST[current.status].tone} icon={ST[current.status].icon}>
                {t(`status.${current.status}`)}
              </Status>
            </div>
            {(current.status === 'CALLED' || current.status === 'WAITING') && (
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  icon={UserX}
                  disabled={setStatus.isPending}
                  onClick={() => {
                    setStatus.mutate({ id: current.id, status: 'SKIPPED' });
                  }}
                >
                  {t('skip')}
                </Button>
                <Button
                  icon={Stethoscope}
                  disabled={setStatus.isPending}
                  onClick={() => {
                    setSelected(current.id);
                    setStatus.mutate({ id: current.id, status: 'IN_SERVICE' });
                  }}
                >
                  {t('status.IN_SERVICE')}
                </Button>
              </div>
            )}
            {current.status === 'IN_SERVICE' && (
              <Button
                className="mt-5 w-full"
                icon={CheckCheck}
                disabled={setStatus.isPending}
                onClick={() => {
                  setSelected(null);
                  setStatus.mutate({ id: current.id, status: 'DONE' });
                }}
              >
                {t('status.DONE')}
              </Button>
            )}
          </article>
        </div>
      ) : (
        list.isSuccess && <EmptyState icon={ListOrdered}>{c('empty')}</EmptyState>
      )}
      {issuing && (
        <Modal
          title={t('issue')}
          onClose={() => {
            setIssuing(false);
          }}
        >
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
        </Modal>
      )}
    </Workspace>
  );
}
