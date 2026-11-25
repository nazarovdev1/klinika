'use client';

import { REPORT_NAMES } from '@shifo/contracts';
import { useQuery } from '@tanstack/react-query';
import { Download, FileBarChart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Field, Input, Select } from '@/components/ui/form';
import { EmptyState, PageHeader, Toolbar } from '@/components/ui/page';
import { api, openBlob } from '@/lib/api';
import { formatMoney, today } from '@/lib/format';

interface Report {
  columns: string[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, string | number | null>;
}
const MONEY_COLUMNS = new Set([
  'received',
  'refunded',
  'net',
  'total',
  'paid',
  'balance',
  'expectedCash',
  'countedCash',
  'difference',
  'openingFloat',
]);

const monthStart = () => `${today().slice(0, 8)}01`;

export default function ReportsPage() {
  const t = useTranslations('reports');
  const c = useTranslations('common');
  const [name, setName] = useState<(typeof REPORT_NAMES)[number]>('revenue');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const qs = `from=${from}&to=${to}`;
  const report = useQuery({
    queryKey: ['report', name, from, to],
    queryFn: () => api<Report>(`/reports/${name}?${qs}`),
  });
  const cell = (col: string, v: string | number | null) =>
    v === null ? '—' : MONEY_COLUMNS.has(col) && typeof v === 'string' ? formatMoney(v) : String(v);
  const numeric = (col: string, v: string | number | null) =>
    MONEY_COLUMNS.has(col) || typeof v === 'number';

  return (
    <section>
      <PageHeader title={t('title')}>
        <Button
          variant="outline"
          icon={Download}
          onClick={() => {
            void openBlob(`/reports/${name}?${qs}&format=csv`, `${name}-${from}_${to}.csv`);
          }}
        >
          {t('exportCsv')}
        </Button>
      </PageHeader>
      <Toolbar>
        <Field label={t('report')} className="w-64">
          <Select
            value={name}
            onChange={(e) => {
              setName(e.target.value as typeof name);
            }}
          >
            {REPORT_NAMES.map((n) => (
              <option key={n} value={n}>
                {t(`r.${n}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={c('from')} className="w-40">
          <Input
            className="num"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
            }}
          />
        </Field>
        <Field label={c('to')} className="w-40">
          <Input
            className="num"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
            }}
          />
        </Field>
      </Toolbar>
      <ErrorNote error={report.error} />
      {report.isPending && <p className="text-[14px] text-ink-2">{c('loading')}</p>}
      {report.data && (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  {report.data.columns.map((col) => (
                    <th key={col} className={MONEY_COLUMNS.has(col) ? 'r' : undefined}>
                      {t(`col.${col}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.data.rows.map((r, i) => (
                  <tr key={i}>
                    {report.data.columns.map((col) => (
                      <td
                        key={col}
                        className={`num ${numeric(col, r[col] ?? null) && MONEY_COLUMNS.has(col) ? 'r' : ''}`}
                      >
                        {cell(col, r[col] ?? null)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {report.data.totals && (
                <tfoot>
                  <tr className="border-t border-line bg-bg font-semibold">
                    {report.data.columns.map((col, i) => (
                      <td
                        key={col}
                        className={`num px-3 py-2 ${MONEY_COLUMNS.has(col) ? 'text-right' : ''}`}
                      >
                        {i === 0 && !(col in (report.data.totals ?? {}))
                          ? c('total')
                          : cell(col, report.data.totals?.[col] ?? null) === '—'
                            ? ''
                            : cell(col, report.data.totals?.[col] ?? null)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {report.data.rows.length === 0 && (
            <EmptyState icon={FileBarChart}>{c('empty')}</EmptyState>
          )}
        </Card>
      )}
    </section>
  );
}
