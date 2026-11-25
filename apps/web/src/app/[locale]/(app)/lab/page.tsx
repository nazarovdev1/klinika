'use client';

import type { PatientDto } from '@shifo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, Card, ErrorNote, Field, Input, Select } from '@/components/ui/form';
import { api, openBlob } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { PatientPicker, useBranches } from '@/lib/queries';
import { useSession } from '@/lib/session';

interface Item {
  id: string;
  testCode: string;
  testName: string;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  value: string | null;
  flag: string | null;
}
interface Order {
  id: string;
  barcode: string;
  patientId: string;
  status: 'ORDERED' | 'COLLECTED' | 'RESULTED' | 'VALIDATED' | 'CANCELLED';
  createdAt: string;
  items?: Item[];
}
interface Test {
  id: string;
  code: string;
  nameUz: string;
  unit: string | null;
}

const TONE = {
  ORDERED: 'gray',
  COLLECTED: 'blue',
  RESULTED: 'amber',
  VALIDATED: 'green',
  CANCELLED: 'red',
} as const;
const FLAG_TONE: Record<string, 'green' | 'amber' | 'red'> = {
  NORMAL: 'green',
  LOW: 'amber',
  HIGH: 'amber',
  CRITICAL_LOW: 'red',
  CRITICAL_HIGH: 'red',
};

export default function LabPage() {
  const t = useTranslations('lab');
  const c = useTranslations('common');
  const qc = useQueryClient();
  const { can, user } = useSession();
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [patient, setPatient] = useState<PatientDto | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branches.data, branchId]);

  const orders = useQuery({
    queryKey: ['lab-orders', filter],
    queryFn: () =>
      api<{ items: Order[] }>(`/lab/orders?limit=25${filter ? `&status=${filter}` : ''}`),
    refetchInterval: 20_000,
  });
  const detail = useQuery({
    queryKey: ['lab-order', selected],
    enabled: Boolean(selected),
    queryFn: () => api<Order>(`/lab/orders/${selected ?? ''}`),
  });
  const tests = useQuery({
    queryKey: ['lab-tests'],
    queryFn: async () => (await api<{ items: Test[] }>('/lab/tests')).items,
  });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['lab-orders'] }),
      qc.invalidateQueries({ queryKey: ['lab-order'] }),
    ]);
  };
  const create = useMutation({
    mutationFn: () =>
      api<Order>('/lab/orders', {
        method: 'POST',
        json: { patientId: patient?.id, branchId, testIds: picked },
      }),
    onSuccess: async (o) => {
      setPicked([]);
      setPatient(null);
      setSelected(o.id);
      await refresh();
    },
  });
  const act = useMutation({
    mutationFn: (path: string) => api(path, { method: 'POST' }),
    onSuccess: refresh,
  });
  const saveResults = useMutation({
    mutationFn: () =>
      api(`/lab/orders/${selected ?? ''}/results`, {
        method: 'PUT',
        json: {
          items: Object.entries(values)
            .filter(([, v]) => v.trim() !== '')
            .map(([itemId, value]) => ({ itemId, value })),
        },
      }),
    onSuccess: async () => {
      setValues({});
      await refresh();
    },
  });

  const o = detail.data;
  const canEnter = ['LAB', 'OWNER', 'ADMIN'].includes(user?.role ?? '');

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <ErrorNote error={orders.error ?? create.error ?? act.error ?? saveResults.error} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label={c('status')}>
            <Select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
              }}
            >
              <option value="">—</option>
              {(['ORDERED', 'COLLECTED', 'RESULTED', 'VALIDATED', 'CANCELLED'] as const).map(
                (s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ),
              )}
            </Select>
          </Field>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2">{t('barcode')}</th>
                <th>{c('date')}</th>
                <th>{c('status')}</th>
              </tr>
            </thead>
            <tbody>
              {orders.data?.items.map((x) => (
                <tr
                  key={x.id}
                  className={`cursor-pointer border-b border-border hover:bg-muted ${selected === x.id ? 'bg-muted' : ''}`}
                  onClick={() => {
                    setSelected(x.id);
                    setValues({});
                  }}
                >
                  <td className="py-2">{x.barcode}</td>
                  <td>{fmtDateTime(x.createdAt)}</td>
                  <td>
                    <Badge tone={TONE[x.status]}>{t(`status.${x.status}`)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.data?.items.length === 0 && <p>{c('empty')}</p>}
        </div>

        <div className="space-y-6">
          {o && (
            <Card title={`${o.barcode} — ${t(`status.${o.status}`)}`}>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-1">{t('test')}</th>
                    <th>{t('result')}</th>
                    <th>{t('ref')}</th>
                  </tr>
                </thead>
                <tbody>
                  {o.items?.map((i) => (
                    <tr key={i.id} className="border-b border-border">
                      <td className="py-1">{i.testName}</td>
                      <td>
                        {o.status === 'COLLECTED' || o.status === 'RESULTED' ? (
                          canEnter ? (
                            <Input
                              className="w-28"
                              value={values[i.id] ?? i.value ?? ''}
                              onChange={(e) => {
                                setValues({ ...values, [i.id]: e.target.value });
                              }}
                            />
                          ) : (
                            (i.value ?? '—')
                          )
                        ) : (
                          <>
                            {i.value ?? '—'} {i.unit ?? ''}{' '}
                            {i.flag && i.flag !== 'NORMAL' && (
                              <Badge tone={FLAG_TONE[i.flag] ?? 'gray'}>{i.flag}</Badge>
                            )}
                          </>
                        )}
                      </td>
                      <td className="text-sm text-muted-foreground">
                        {i.refLow ?? ''}
                        {i.refLow != null || i.refHigh != null ? ' – ' : ''}
                        {i.refHigh ?? ''} {i.unit ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap gap-2">
                {o.status === 'ORDERED' && can('lab:write') && (
                  <Button
                    type="button"
                    onClick={() => {
                      act.mutate(`/lab/orders/${o.id}/collect`);
                    }}
                  >
                    {t('collect')}
                  </Button>
                )}
                {(o.status === 'ORDERED' || o.status === 'COLLECTED') && can('lab:write') && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      act.mutate(`/lab/orders/${o.id}/cancel`);
                    }}
                  >
                    {c('cancel')}
                  </Button>
                )}
                {(o.status === 'COLLECTED' || o.status === 'RESULTED') && canEnter && (
                  <Button
                    type="button"
                    disabled={Object.keys(values).length === 0 || saveResults.isPending}
                    onClick={() => {
                      saveResults.mutate();
                    }}
                  >
                    {t('saveResults')}
                  </Button>
                )}
                {o.status === 'RESULTED' && can('lab:validate') && (
                  <Button
                    type="button"
                    onClick={() => {
                      act.mutate(`/lab/orders/${o.id}/validate`);
                    }}
                  >
                    {t('validate')}
                  </Button>
                )}
                {o.status === 'VALIDATED' &&
                  (['uz', 'ru'] as const).map((l) => (
                    <Button
                      key={l}
                      type="button"
                      variant="outline"
                      onClick={() => {
                        void openBlob(`/lab/orders/${o.id}/pdf?lang=${l}`);
                      }}
                    >
                      {c('pdf')} {l.toUpperCase()}
                    </Button>
                  ))}
              </div>
            </Card>
          )}

          {can('lab:write') && (
            <Card title={t('newOrder')}>
              <Field label={c('patient')}>
                <PatientPicker value={patient} onChange={setPatient} />
              </Field>
              <Field label={c('branch')}>
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
              <div className="flex flex-wrap gap-2">
                {tests.data?.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    aria-pressed={picked.includes(x.id)}
                    className="rounded-full border border-border px-3 py-1 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                    onClick={() => {
                      setPicked(
                        picked.includes(x.id)
                          ? picked.filter((p) => p !== x.id)
                          : [...picked, x.id],
                      );
                    }}
                  >
                    {x.code}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                disabled={!patient || picked.length === 0 || create.isPending}
                onClick={() => {
                  create.mutate();
                }}
              >
                {c('create')}
              </Button>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}
