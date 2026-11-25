'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge, Card, ErrorNote } from '@/components/ui/form';
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

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <ErrorNote error={todayAppts.error ?? recent.error ?? start.error} />

      {isDoctor && (
        <Card title={`${t('today')} — ${user?.fullName ?? ''}`}>
          <ul className="divide-y divide-border">
            {todayAppts.data?.items
              .filter((a) => !['CANCELLED', 'NO_SHOW'].includes(a.status))
              .map((a) => (
                <li key={a.id} className="flex items-center gap-4 py-2">
                  <span className="w-16 font-medium">{fmtTime(a.startsAt)}</span>
                  <span className="flex-1">{a.patientName}</span>
                  <Badge
                    tone={
                      a.status === 'ARRIVED' ? 'amber' : a.status === 'COMPLETED' ? 'green' : 'blue'
                    }
                  >
                    {a.status}
                  </Badge>
                  {a.status !== 'COMPLETED' && (
                    <Button
                      type="button"
                      disabled={start.isPending}
                      onClick={() => {
                        start.mutate(a);
                      }}
                    >
                      {t('start')}
                    </Button>
                  )}
                </li>
              ))}
          </ul>
          {todayAppts.data?.items.length === 0 && <p>{c('empty')}</p>}
        </Card>
      )}

      <Card title={t('recent')}>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2">{c('date')}</th>
              <th>{c('status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {recent.data?.items.map((e) => (
              <tr key={e.id} className="border-b border-border">
                <td className="py-2">{fmtDateTime(e.signedAt ?? e.startedAt)}</td>
                <td>
                  <Badge tone={e.status === 'SIGNED' ? 'green' : 'amber'}>
                    {t(`status.${e.status}`)}
                  </Badge>
                </td>
                <td>
                  <Link className="underline" href={`/visits/${e.id}`}>
                    {c('open')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {recent.data?.items.length === 0 && <p>{c('empty')}</p>}
      </Card>
    </section>
  );
}
