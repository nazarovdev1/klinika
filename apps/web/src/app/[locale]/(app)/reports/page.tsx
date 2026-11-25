'use client';

import { REPORT_NAMES } from '@shifo/contracts';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Field, Input, Select } from '@/components/ui/form';
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

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <div className="grid max-w-3xl gap-3 sm:grid-cols-4">
        <Field label={t('report')}>
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
        <Field label={c('from')}>
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
            }}
          />
        </Field>
        <Field label={c('to')}>
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
            }}
          />
        </Field>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void openBlob(`/reports/${name}?${qs}&format=csv`, `${name}-${from}_${to}.csv`);
            }}
          >
            {t('exportCsv')}
          </Button>
        </div>
      </div>
      <ErrorNote error={report.error} />
      {report.data && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border">
                  {report.data.columns.map((col) => (
                    <th key={col} className="py-2 pr-4">
                      {t(`col.${col}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.data.rows.map((r, i) => (
                  <tr key={i} className="border-b border-border">
                    {report.data.columns.map((col) => (
                      <td key={col} className="py-1 pr-4">
                        {cell(col, r[col] ?? null)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.data.rows.length === 0 && <p>{c('empty')}</p>}
          {report.data.totals && (
            <p className="font-medium">
              {c('total')}:{' '}
              {Object.entries(report.data.totals)
                .map(([k, v]) => `${t(`col.${k}`)} ${cell(k, v)}`)
                .join(' · ')}
            </p>
          )}
        </Card>
      )}
    </section>
  );
}
