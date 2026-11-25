'use client';

import type { PatientDto } from '@shifo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCheck, FileText, FlaskConical, PackageCheck, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Field, Input, Select, Status, type Tone } from '@/components/ui/form';
import { EmptyState, PageHeader, Split, Toolbar } from '@/components/ui/page';
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

const TONE: Record<Order['status'], Tone> = {
  ORDERED: 'neutral',
  COLLECTED: 'info',
  RESULTED: 'warn',
  VALIDATED: 'ok',
  CANCELLED: 'danger',
};
const FLAG_TONE: Record<string, Tone> = {
  NORMAL: 'ok',
  LOW: 'warn',
  HIGH: 'warn',
  CRITICAL_LOW: 'danger',
  CRITICAL_HIGH: 'danger',
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

  const panel = (
    <div className="space-y-4">
      {o && (
        <Card
          title={o.barcode}
          actions={<Status tone={TONE[o.status]}>{t(`status.${o.status}`)}</Status>}
        >
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('test')}</th>
                <th>{t('result')}</th>
                <th>{t('ref')}</th>
              </tr>
            </thead>
            <tbody>
              {o.items?.map((i) => (
                <tr key={i.id}>
                  <td>{i.testName}</td>
                  <td>
                    {o.status === 'COLLECTED' || o.status === 'RESULTED' ? (
                      canEnter ? (
                        <Input
                          aria-label={i.testName}
                          className="num !w-24"
                          value={values[i.id] ?? i.value ?? ''}
                          onChange={(e) => {
                            setValues({ ...values, [i.id]: e.target.value });
                          }}
                        />
                      ) : (
                        (i.value ?? '—')
                      )
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <span className="num">
                          {i.value ?? '—'} {i.unit ?? ''}
                        </span>
                        {i.flag && i.flag !== 'NORMAL' && (
                          <Status tone={FLAG_TONE[i.flag] ?? 'neutral'}>{i.flag}</Status>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="num text-[13px] text-ink-2">
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
                icon={PackageCheck}
                onClick={() => {
                  act.mutate(`/lab/orders/${o.id}/collect`);
                }}
              >
                {t('collect')}
              </Button>
            )}
            {(o.status === 'ORDERED' || o.status === 'COLLECTED') && can('lab:write') && (
              <Button
                variant="outline"
                icon={Ban}
                onClick={() => {
                  act.mutate(`/lab/orders/${o.id}/cancel`);
                }}
              >
                {c('cancel')}
              </Button>
            )}
            {(o.status === 'COLLECTED' || o.status === 'RESULTED') && canEnter && (
              <Button
                icon={Save}
                loading={saveResults.isPending}
                disabled={Object.keys(values).length === 0}
                onClick={() => {
                  saveResults.mutate();
                }}
              >
                {t('saveResults')}
              </Button>
            )}
            {o.status === 'RESULTED' && can('lab:validate') && (
              <Button
                icon={CheckCheck}
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
                  variant="outline"
                  icon={FileText}
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
          <div className="flex flex-wrap gap-1.5">
            {tests.data?.map((x) => (
              <button
                key={x.id}
                type="button"
                aria-pressed={picked.includes(x.id)}
                title={x.nameUz}
                className="num rounded-control border border-line px-2.5 py-1 text-[13px] hover:bg-row-hover aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:font-medium aria-pressed:text-primary"
                onClick={() => {
                  setPicked(
                    picked.includes(x.id) ? picked.filter((p) => p !== x.id) : [...picked, x.id],
                  );
                }}
              >
                {x.code}
              </button>
            ))}
          </div>
          <Button
            loading={create.isPending}
            disabled={!patient || picked.length === 0}
            onClick={() => {
              create.mutate();
            }}
          >
            {c('create')}
          </Button>
        </Card>
      )}
    </div>
  );

  return (
    <section>
      <PageHeader title={t('title')} />
      <ErrorNote error={orders.error ?? create.error ?? act.error ?? saveResults.error} />
      <Toolbar>
        <Field label={c('status')} className="w-48">
          <Select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
            }}
          >
            <option value="">—</option>
            {(['ORDERED', 'COLLECTED', 'RESULTED', 'VALIDATED', 'CANCELLED'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
      </Toolbar>
      <Split open panel={panel}>
        <Card flush>
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('barcode')}</th>
                <th>{c('date')}</th>
                <th>{c('status')}</th>
              </tr>
            </thead>
            <tbody>
              {orders.data?.items.map((x) => (
                <tr
                  key={x.id}
                  className={`cursor-pointer ${selected === x.id ? 'bg-primary-soft' : ''}`}
                  onClick={() => {
                    setSelected(x.id);
                    setValues({});
                  }}
                >
                  <td className="num">{x.barcode}</td>
                  <td className="num">{fmtDateTime(x.createdAt)}</td>
                  <td>
                    <Status tone={TONE[x.status]}>{t(`status.${x.status}`)}</Status>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.data?.items.length === 0 && (
            <EmptyState icon={FlaskConical}>{c('empty')}</EmptyState>
          )}
        </Card>
      </Split>
    </section>
  );
}
