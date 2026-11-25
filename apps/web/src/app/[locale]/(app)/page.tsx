'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/form';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { formatMoney, today } from '@/lib/format';
import { useSession } from '@/lib/session';

interface Report {
  totals?: Record<string, string | number>;
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const { user, can } = useSession();
  const d = today();
  const from = new Date(`${d}T00:00:00+05:00`).toISOString();
  const to = new Date(new Date(from).getTime() + 86_400_000).toISOString();

  const appts = useQuery({
    queryKey: ['dash-appts', d],
    enabled: can('scheduling:read'),
    queryFn: () =>
      api<{ items: { status: string }[] }>(
        `/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    refetchInterval: 30_000,
  });
  const revenue = useQuery({
    queryKey: ['dash-revenue', d],
    enabled: can('reports:read'),
    queryFn: () => api<Report>(`/reports/revenue?from=${d}&to=${d}`),
  });
  const debts = useQuery({
    queryKey: ['dash-debts'],
    enabled: can('reports:read'),
    queryFn: () => api<Report>(`/reports/debts?from=${d}&to=${d}`),
  });

  const count = (s: string) => appts.data?.items.filter((a) => a.status === s).length ?? 0;
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('hello', { name: user?.fullName ?? '' })}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {can('scheduling:read') && (
          <>
            <Card title={t('appointmentsToday')}>
              <p className="text-3xl font-semibold">{appts.data?.items.length ?? '…'}</p>
            </Card>
            <Card title={t('arrived')}>
              <p className="text-3xl font-semibold">{count('ARRIVED') + count('IN_PROGRESS')}</p>
            </Card>
          </>
        )}
        {can('reports:read') && (
          <>
            <Card title={t('revenueToday')}>
              <p className="text-3xl font-semibold">
                {formatMoney(String(revenue.data?.totals?.net ?? '0'))}
              </p>
            </Card>
            <Card title={t('debts')}>
              <p className="text-3xl font-semibold">
                {formatMoney(String(debts.data?.totals?.balance ?? '0'))}
              </p>
            </Card>
          </>
        )}
      </div>
      <ul className="flex flex-wrap gap-4">
        {can('scheduling:write') && (
          <li>
            <Link className="underline" href="/calendar">
              {t('quickBook')}
            </Link>
          </li>
        )}
        {can('patients:write') && (
          <li>
            <Link className="underline" href="/patients">
              {t('quickPatient')}
            </Link>
          </li>
        )}
        {can('encounters:write') && (
          <li>
            <Link className="underline" href="/visits">
              {t('quickVisits')}
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}
