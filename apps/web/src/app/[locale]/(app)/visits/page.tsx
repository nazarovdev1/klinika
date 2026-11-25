'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCheck, ClipboardList, FilePenLine, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Status } from '@/components/ui/form';
import { EmptyState, PageHeader, PaneHead, PaneList, Workspace } from '@/components/ui/page';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { fmtDateTime, fmtTime, today } from '@/lib/format';
import { useSession } from '@/lib/session';

interface Appt {
  id: string;
  branchId: string;
  patientId: string;
  patientName: string;
  startsAt: string;
  status: string;
}
interface Enc {
  id: string;
  patientId: string;
  patientName: string | null;
  status: 'OPEN' | 'SIGNED' | 'CANCELLED';
  startedAt: string;
  signedAt: string | null;
}

export default function VisitsPage() {
  const t = useTranslations('visits');
  const c = useTranslations('common');
  const cal = useTranslations('calendar');
  const router = useRouter();
  const { can, user } = useSession();
  const isDoctor = can('encounters:write');
  const d = today();
  const from = new Date(`${d}T00:00:00+05:00`).toISOString();
  const to = new Date(new Date(from).getTime() + 86_400_000).toISOString();

  const todayAppts = useQuery({
    queryKey: ['my-appointments', d],
    enabled: isDoctor,
    queryFn: () =>
      api<{ items: Appt[] }>(
        `/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    refetchInterval: 15_000,
  });
  const recent = useQuery({
    queryKey: ['encounters', isDoctor],
    queryFn: () => api<{ items: Enc[] }>(`/encounters?limit=25${isDoctor ? '&mine=true' : ''}`),
  });
  const start = useMutation({
    mutationFn: (a: Appt) =>
      api<{ id: string }>('/encounters', {
        method: 'POST',
        json: { patientId: a.patientId, branchId: a.branchId, appointmentId: a.id },
      }),
    onSuccess: (e) => {
      router.push(`/visits/${e.id}`);
    },
  });
  const list =
    todayAppts.data?.items.filter((a) => !['CANCELLED', 'NO_SHOW'].includes(a.status)) ?? [];

  return (
    <Workspace
      list={
        isDoctor && (
          <>
            <PaneHead title={t('today')}>
              <p className="text-[13px] text-ink-2">{user?.fullName}</p>
            </PaneHead>
            <PaneList>
              {list.map((a) => (
                <li key={a.id} className="space-y-2 border-t border-line px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{a.patientName}</span>
                    <span className="num font-semibold">{fmtTime(a.startsAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Status
                      tone={
                        a.status === 'COMPLETED' ? 'ok' : a.status === 'ARRIVED' ? 'warn' : 'info'
                      }
                    >
                      {cal(`status.${a.status}`)}
                    </Status>
                    {a.status !== 'COMPLETED' && (
                      <Button
                        size="sm"
                        variant={a.status === 'ARRIVED' ? 'default' : 'outline'}
                        icon={Play}
                        disabled={start.isPending}
                        onClick={() => {
                          start.mutate(a);
                        }}
                      >
                        {t('start')}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
              {todayAppts.isSuccess && list.length === 0 && (
                <li>
                  <EmptyState icon={ClipboardList}>{c('empty')}</EmptyState>
                </li>
              )}
            </PaneList>
          </>
        )
      }
    >
      <PageHeader title={t('title')} sub={t('recent')} />
      <ErrorNote error={todayAppts.error ?? recent.error ?? start.error} />
      <Card flush className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>{c('patient')}</th>
              <th>{c('date')}</th>
              <th>{c('status')}</th>
            </tr>
          </thead>
          <tbody>
            {recent.data?.items.map((e) => (
              <tr
                key={e.id}
                data-clickable="true"
                onClick={() => {
                  router.push(`/visits/${e.id}`);
                }}
              >
                <td>
                  <Link
                    className="font-medium text-ink no-underline hover:text-primary"
                    href={`/visits/${e.id}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                    }}
                  >
                    {e.patientName ?? c('open')}
                  </Link>
                </td>
                <td className="num">{fmtDateTime(e.signedAt ?? e.startedAt)}</td>
                <td>
                  <Status
                    tone={e.status === 'SIGNED' ? 'ok' : 'warn'}
                    icon={e.status === 'SIGNED' ? CheckCheck : FilePenLine}
                  >
                    {t(`status.${e.status}`)}
                  </Status>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {recent.data?.items.length === 0 && (
          <EmptyState icon={ClipboardList}>{c('empty')}</EmptyState>
        )}
      </Card>
    </Workspace>
  );
}
