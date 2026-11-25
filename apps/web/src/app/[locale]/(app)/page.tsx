'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, CalendarX, Stethoscope, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BarChart } from '@/components/ui/chart';
import { Card, Status, type Tone } from '@/components/ui/form';
import { EmptyState, KpiStrip, PageHeader } from '@/components/ui/page';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { formatMoney, fmtTime, today } from '@/lib/format';
import { useDoctors } from '@/lib/queries';
import { useSession } from '@/lib/session';

interface Report {
  rows: Record<string, string | number | null>[];
  totals?: Record<string, string | number>;
}
interface Appt {
  id: string;
  patientName: string;
  doctorId: string;
  startsAt: string;
  status: string;
}
const TONE: Record<string, Tone> = {
  BOOKED: 'info',
  CONFIRMED: 'info',
  ARRIVED: 'warn',
  IN_PROGRESS: 'warn',
  COMPLETED: 'ok',
  CANCELLED: 'danger',
  NO_SHOW: 'danger',
};
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const cal = useTranslations('calendar');
  const c = useTranslations('common');
  const { user, can } = useSession();
  const doctors = useDoctors();
  const d = today();
  const from14 = iso(new Date(new Date(`${d}T00:00:00Z`).getTime() - 13 * DAY));
  const from = new Date(`${d}T00:00:00+05:00`).toISOString();
  const to = new Date(new Date(from).getTime() + DAY).toISOString();

  const appts = useQuery({
    queryKey: ['dash-appts', d],
    enabled: can('scheduling:read'),
    queryFn: () =>
      api<{ items: Appt[] }>(
        `/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    refetchInterval: 30_000,
  });
  const revenue = useQuery({
    queryKey: ['dash-revenue', from14, d],
    enabled: can('reports:read'),
    queryFn: () => api<Report>(`/reports/revenue?from=${from14}&to=${d}`),
  });
  const visits = useQuery({
    queryKey: ['dash-visits', from14, d],
    enabled: can('reports:read'),
    queryFn: () => api<Report>(`/reports/visits?from=${from14}&to=${d}`),
  });
  const debts = useQuery({
    queryKey: ['dash-debts'],
    enabled: can('reports:read'),
    queryFn: () => api<Report>(`/reports/debts?from=${d}&to=${d}`),
  });

  const items = appts.data?.items ?? [];
  const count = (...s: string[]) => items.filter((a) => s.includes(a.status)).length;
  const days = Array.from({ length: 14 }, (_, i) =>
    iso(new Date(new Date(`${from14}T00:00:00Z`).getTime() + i * DAY)),
  );
  const netByDay = days.map((day) => ({
    label: day.slice(8) + '.' + day.slice(5, 7),
    value:
      revenue.data?.rows
        .filter((r) => r.date === day)
        .reduce((s, r) => s + Number(r.net ?? 0), 0) ?? 0,
  }));
  const visitsByDay = days.map((day) => ({
    label: day.slice(8) + '.' + day.slice(5, 7),
    value:
      visits.data?.rows
        .filter((r) => r.date === day)
        .reduce((s, r) => s + Number(r.visits ?? 0), 0) ?? 0,
  }));
  const net = (revenue.data?.rows ?? [])
    .filter((r) => r.date === d)
    .reduce((s, r) => s + BigInt(String(r.net ?? 0)), 0n);

  const kpis = [
    ...(can('scheduling:read')
      ? [
          { label: t('appointmentsToday'), value: items.length },
          { label: t('arrived'), value: count('ARRIVED', 'IN_PROGRESS') },
        ]
      : []),
    ...(can('reports:read')
      ? [
          { label: t('revenueToday'), value: `${formatMoney(net.toString())} so‘m` },
          {
            label: t('debts'),
            value: `${formatMoney(String(debts.data?.totals?.balance ?? '0'))} so‘m`,
          },
        ]
      : []),
  ];

  return (
    <section>
      <PageHeader title={t('hello', { name: user?.fullName ?? '' })}>
        {can('patients:write') && (
          <Link
            href="/patients"
            className="inline-flex h-9 items-center gap-2 rounded-control border border-line bg-surface px-3.5 text-[14px] text-ink no-underline hover:bg-row-hover hover:text-ink"
          >
            <UserPlus size={16} aria-hidden />
            {t('quickPatient')}
          </Link>
        )}
        {can('scheduling:write') && (
          <Link
            href="/calendar"
            className="inline-flex h-9 items-center gap-2 rounded-control border border-primary bg-primary px-3.5 text-[14px] text-white no-underline hover:bg-primary-hover hover:text-white"
          >
            <CalendarPlus size={16} aria-hidden />
            {t('quickBook')}
          </Link>
        )}
        {can('encounters:write') && (
          <Link
            href="/visits"
            className="inline-flex h-9 items-center gap-2 rounded-control border border-line bg-surface px-3.5 text-[14px] text-ink no-underline hover:bg-row-hover hover:text-ink"
          >
            <Stethoscope size={16} aria-hidden />
            {t('quickVisits')}
          </Link>
        )}
      </PageHeader>

      {kpis.length > 0 && <KpiStrip items={kpis} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {can('scheduling:read') && (
          <Card title={t('appointmentsToday')} flush>
            <table className="tbl">
              <thead>
                <tr>
                  <th className="w-20">{c('time')}</th>
                  <th>{c('patient')}</th>
                  <th className="max-sm:hidden">{c('doctor')}</th>
                  <th>{c('status')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td className="num">{fmtTime(a.startsAt)}</td>
                    <td>{a.patientName}</td>
                    <td className="text-ink-2">
                      {doctors.data?.find((x) => x.id === a.doctorId)?.fullName ?? ''}
                    </td>
                    <td>
                      <Status tone={TONE[a.status] ?? 'neutral'}>
                        {cal(`status.${a.status}`)}
                      </Status>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && <EmptyState icon={CalendarX}>{c('empty')}</EmptyState>}
          </Card>
        )}
        {can('reports:read') && (
          <div className="space-y-4">
            <Card title={t('revenue14')}>
              {netByDay.some((x) => x.value > 0) ? (
                <BarChart
                  label={t('revenue14')}
                  data={netByDay}
                  format={(n) =>
                    n >= 1_000_000
                      ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)} mln`
                      : formatMoney(String(Math.round(n)))
                  }
                />
              ) : (
                <EmptyState icon={CalendarX}>{c('empty')}</EmptyState>
              )}
            </Card>
            <Card title={t('visits14')}>
              {visitsByDay.some((x) => x.value > 0) ? (
                <BarChart label={t('visits14')} data={visitsByDay} />
              ) : (
                <EmptyState icon={CalendarX}>{c('empty')}</EmptyState>
              )}
            </Card>
          </div>
        )}
      </div>
    </section>
  );
}
