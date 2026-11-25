'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCheck, ClipboardList, FilePenLine, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Status } from '@/components/ui/form';
import { EmptyState, PageHeader } from '@/components/ui/page';
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
  status: 'OPEN' | 'SIGNED' | 'CANCELLED';
  startedAt: string;
  signedAt: string | null;
}

export default function VisitsPage() {
  const t = useTranslations('visits');
  const c = useTranslations('common');
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
    <section className="space-y-4">
      <PageHeader title={t('title')} sub={isDoctor ? user?.fullName : undefined} />
      <ErrorNote error={todayAppts.error ?? recent.error ?? start.error} />

      {isDoctor && (
        <Card title={t('today')} flush>
          <ul className="divide-y divide-line">
            {list.map((a) => (
              <li key={a.id} className="flex items-center gap-4 px-4 py-2.5">
                <span className="num w-14 text-[15px] font-medium">{fmtTime(a.startsAt)}</span>
                <span className="flex-1 text-[15px]">{a.patientName}</span>
                {a.status === 'COMPLETED' ? (
                  <Status tone="ok" icon={CheckCheck}>
                    {a.status}
                  </Status>
                ) : (
                  <>
                    <Status tone={a.status === 'ARRIVED' ? 'warn' : 'info'}>{a.status}</Status>
                    <Button
                      size="sm"
                      icon={Play}
                      disabled={start.isPending}
                      onClick={() => {
                        start.mutate(a);
                      }}
                    >
                      {t('start')}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {list.length === 0 && <EmptyState icon={ClipboardList}>{c('empty')}</EmptyState>}
        </Card>
      )}

      <Card title={t('recent')} flush>
        <table className="tbl">
          <thead>
            <tr>
              <th>{c('date')}</th>
              <th>{c('status')}</th>
              <th className="r">{c('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {recent.data?.items.map((e) => (
              <tr key={e.id}>
                <td className="num">{fmtDateTime(e.signedAt ?? e.startedAt)}</td>
                <td>
                  <Status
                    tone={e.status === 'SIGNED' ? 'ok' : 'warn'}
                    icon={e.status === 'SIGNED' ? CheckCheck : FilePenLine}
                  >
                    {t(`status.${e.status}`)}
                  </Status>
                </td>
                <td className="r">
                  <Link href={`/visits/${e.id}`}>{c('open')}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {recent.data?.items.length === 0 && (
          <EmptyState icon={ClipboardList}>{c('empty')}</EmptyState>
        )}
      </Card>
    </section>
  );
}
