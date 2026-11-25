'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CalendarPlus,
  CalendarX,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { RankBars, TrendChart } from '@/components/ui/chart';
import { ErrorNote, Status, type Tone } from '@/components/ui/form';
import { EmptyState, KpiStrip, PageHeader, Pills, Workspace } from '@/components/ui/page';
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
  const bill = useTranslations('billing');
  const set = useTranslations('settings');
  const [measure, setMeasure] = useState<'revenue' | 'visits'>('revenue');
  const { user, can } = useSession();
  const doctors = useDoctors();
  const d = today();
  // Fourteen full days up to yesterday, set against the fourteen before: weekdays line up two weeks apart.
  const back = (n: number) => iso(new Date(new Date(`${d}T00:00:00Z`).getTime() - n * DAY));
  const from28 = back(28);
  const from14 = back(14);
  const yesterday = back(1);
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
    queryKey: ['dash-revenue', from28, d],
    enabled: can('reports:read'),
    queryFn: () => api<Report>(`/reports/revenue?from=${from28}&to=${d}`),
  });
  const visits = useQuery({
    queryKey: ['dash-visits', from28, d],
    enabled: can('reports:read'),
    queryFn: () => api<Report>(`/reports/visits?from=${from28}&to=${d}`),
  });
  const byDoctor = useQuery({
    queryKey: ['dash-doctors', from14, yesterday],
    enabled: can('reports:read'),
    queryFn: () => api<Report>(`/reports/revenue-by-doctor?from=${from14}&to=${yesterday}`),
  });
  const debts = useQuery({
    queryKey: ['dash-debts'],
    enabled: can('reports:read'),
    queryFn: () => api<Report>(`/reports/debts?from=${d}&to=${d}`),
  });

  const items = appts.data?.items ?? [];
  const count = (...s: string[]) => items.filter((a) => s.includes(a.status)).length;
  const report = measure === 'revenue' ? revenue : visits;
  const valueOn = (r: Report | undefined, key: string, day: string) =>
    (r?.rows ?? []).filter((x) => x.date === day).reduce((sum, x) => sum + Number(x[key] ?? 0), 0);
  const trend = Array.from({ length: 14 }, (_, i) => 14 - i)
    .map((n) => {
      const day = back(n);
      const prev = back(n + 14);
      const short = `${day.slice(8)}.${day.slice(5, 7)}`;
      const key = measure === 'revenue' ? 'net' : 'visits';
      const weekday = new Date(`${day}T00:00:00Z`).getUTCDay() || 7;
      return {
        label: short,
        title: `${set(`wd.${String(weekday)}`)}, ${short}`,
        value: valueOn(report.data, key, day),
        before: valueOn(report.data, key, prev),
      };
    })
    // Days the clinic was closed in both periods (Sundays) say nothing about the trend.
    .filter((p) => p.value !== 0 || p.before !== 0);
  const total = trend.reduce((sum, p) => sum + p.value, 0);
  const totalBefore = trend.reduce((sum, p) => sum + p.before, 0);
  const change = totalBefore > 0 ? Math.round(((total - totalBefore) / totalBefore) * 100) : null;
  const money = (n: number) => formatMoney(String(Math.round(n)));
  const mln = (n: number) =>
    Math.abs(n) >= 1_000_000 ? `${String(Math.round(n / 100_000) / 10)} mln` : money(n);
  const methods = new Map<string, number>();
  for (const r of revenue.data?.rows ?? []) {
    const day = String(r.date);
    if (day >= from14 && day <= yesterday)
      methods.set(String(r.method), (methods.get(String(r.method)) ?? 0) + Number(r.net ?? 0));
  }
  const methodBars = [...methods]
    .map(([id, value]) => ({ id, label: bill.has(`m.${id}`) ? bill(`m.${id}`) : id, value }))
    .sort((a, b) => b.value - a.value);
  const doctorRows = (byDoctor.data?.rows ?? []).map((r) => ({
    id: String(r.doctorId),
    label: r.doctorId === 'unassigned' ? t('noDoctor') : String(r.doctor),
    value: Number(r.net ?? 0),
  }));
  // Every sum stays in the list so the shares add up: the tail folds into one row.
  const doctorBars =
    doctorRows.length <= 8
      ? doctorRows
      : [
          ...doctorRows.slice(0, 7),
          {
            id: 'rest',
            label: t('otherDoctors', { n: doctorRows.length - 7 }),
            value: doctorRows.slice(7).reduce((sum, r) => sum + r.value, 0),
          },
        ];
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
    <Workspace
      side={
        can('scheduling:read') && (
          <>
            <h2 className="text-[17px] font-semibold">{t('appointmentsToday')}</h2>
            <ul className="-mx-5 divide-y divide-line border-y border-line">
              {items.map((a) => (
                <li key={a.id} className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-2 px-5 py-3">
                  <span className="num font-semibold">{fmtTime(a.startsAt)}</span>
                  <span className="font-medium">{a.patientName}</span>
                  <span className="col-start-2 mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="truncate text-[13px] text-ink-2">
                      {doctors.data?.find((x) => x.id === a.doctorId)?.fullName ?? ''}
                    </span>
                    <Status tone={TONE[a.status] ?? 'neutral'}>{cal(`status.${a.status}`)}</Status>
                  </span>
                </li>
              ))}
            </ul>
            {appts.isSuccess && items.length === 0 && (
              <EmptyState icon={CalendarX}>{c('empty')}</EmptyState>
            )}
          </>
        )
      }
    >
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
      {can('reports:read') && (
        <>
          <ErrorNote error={report.error ?? byDoctor.error} />
          <section className="rounded-card bg-surface p-6">
            <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[14px] text-ink-2">
                  {measure === 'revenue' ? t('revenue14') : t('visits14')}
                </h2>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="num text-[32px] font-semibold leading-none tracking-tight">
                    {report.data ? money(total) : '…'}
                  </span>
                  {report.data && change !== null && (
                    <span
                      className={`num inline-flex items-center gap-1 text-[14px] font-medium ${change < 0 ? 'text-danger-text' : 'text-ok-text'}`}
                    >
                      {change < 0 ? (
                        <TrendingDown size={17} className="self-center" aria-hidden />
                      ) : (
                        <TrendingUp size={17} className="self-center" aria-hidden />
                      )}
                      {change > 0 ? '+' : ''}
                      {change}% {t('vsBefore')}
                    </span>
                  )}
                </p>
              </div>
              <Pills
                label={t('measure')}
                value={measure}
                onChange={setMeasure}
                options={[
                  { id: 'revenue', label: t('mRevenue') },
                  { id: 'visits', label: t('mVisits') },
                ]}
              />
            </header>
            {trend.length > 1 ? (
              <TrendChart
                label={measure === 'revenue' ? t('revenue14') : t('visits14')}
                data={trend}
                format={money}
                axisFormat={mln}
                now={t('last14')}
                before={t('before14')}
              />
            ) : (
              <div className="grid h-[320px] place-items-center">
                {report.isPending ? (
                  <p className="text-ink-2" role="status">
                    {c('loading')}
                  </p>
                ) : (
                  <EmptyState icon={CalendarX}>{c('empty')}</EmptyState>
                )}
              </div>
            )}
          </section>
          <div className="grid gap-4 xl:grid-cols-2">
            {[
              { title: t('byMethod'), bars: methodBars, pending: revenue.isPending },
              { title: t('byDoctor'), bars: doctorBars, pending: byDoctor.isPending },
            ].map((x) => (
              <section key={x.title} className="rounded-card bg-surface p-6">
                <h2 className="mb-4 text-[16px] font-semibold">{x.title}</h2>
                {x.bars.length > 0 ? (
                  <RankBars items={x.bars} format={money} />
                ) : (
                  <p className="text-ink-2">{x.pending ? c('loading') : c('empty')}</p>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </Workspace>
  );
}
