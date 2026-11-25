'use client';

import type { PatientDto } from '@shifo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCheck, FileText, FlaskConical, PackageCheck, Plus, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorNote, Field, Input, Select, Status, type Tone } from '@/components/ui/form';
import { EmptyState, Modal, PaneHead, PaneList, Pills, Row, Workspace } from '@/components/ui/page';
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
  patientName: string | null;
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
  const [filter, setFilter] = useState<'' | Order['status']>('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branches.data, branchId]);

  const orders = useQuery({
    queryKey: ['lab-orders', filter],
    queryFn: () =>
      api<{ items: Order[] }>(`/lab/orders?limit=25${filter ? `&status=${filter}` : ''}`),
    refetchInterval: 20_000,
  });
  const firstId = orders.data?.items[0]?.id;
  useEffect(() => {
    if (!selected && firstId) setSelected(firstId);
  }, [selected, firstId]);
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
      setValues({});
      setCreating(false);
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
    <Workspace
      list={
        <>
          <PaneHead
            title={t('title')}
            action={
              can('lab:write') && (
                <Button
                  icon={Plus}
                  aria-label={t('newOrder')}
                  onClick={() => {
                    setCreating(true);
                  }}
                >
                  {t('new')}
                </Button>
              )
            }
          >
            <Pills
              label={c('status')}
              value={filter}
              onChange={setFilter}
              options={[
                { id: '', label: c('all') },
                ...(['ORDERED', 'COLLECTED', 'RESULTED', 'VALIDATED', 'CANCELLED'] as const).map(
                  (s) => ({ id: s, label: t(`status.${s}`) }),
                ),
              ]}
            />
          </PaneHead>
          <PaneList>
            {orders.data?.items.map((x) => (
              <Row
                key={x.id}
                selected={selected === x.id}
                onSelect={() => {
                  setSelected(x.id);
                  setValues({});
                }}
                title={x.patientName ?? x.barcode}
                sub={`${fmtDateTime(x.createdAt)}, ${x.barcode}`}
                status={<Status tone={TONE[x.status]}>{t(`status.${x.status}`)}</Status>}
              />
            ))}
            {orders.data?.items.length === 0 && (
              <li>
                <EmptyState icon={FlaskConical}>{c('empty')}</EmptyState>
              </li>
            )}
          </PaneList>
        </>
      }
      side={
        <>
          <h2 className="text-[17px] font-semibold">{t('steps')}</h2>
          {o ? (
            <>
              <div className="flex flex-col gap-2">
                {o.status === 'ORDERED' && can('lab:write') && (
                  <Button
                    size="lg"
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
                    size="lg"
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
                    size="lg"
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
                    size="lg"
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
                      size="lg"
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
            </>
          ) : (
            <p className="text-ink-2">{c('selectHint')}</p>
          )}
        </>
      }
    >
      <ErrorNote
        error={orders.error ?? detail.error ?? create.error ?? act.error ?? saveResults.error}
      />
      {o && (
        <article className="overflow-x-auto rounded-card bg-surface p-6">
          <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[22px] font-semibold leading-tight tracking-tight">
                {o.patientName ?? o.barcode}
              </h2>
              <p className="num mt-1 text-[13px] text-ink-2">
                {t('barcode')} {o.barcode}, {fmtDateTime(o.createdAt)}
              </p>
            </div>
            <Status tone={TONE[o.status]}>{t(`status.${o.status}`)}</Status>
          </header>
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
                  <td className="text-[14px] font-medium">{i.testName}</td>
                  <td>
                    {o.status === 'COLLECTED' || o.status === 'RESULTED' ? (
                      canEnter ? (
                        <Input
                          aria-label={i.testName}
                          className="num !h-11 !w-36 text-[17px]"
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
                          <Status tone={FLAG_TONE[i.flag] ?? 'neutral'}>
                            {t(`flag.${i.flag}`)}
                          </Status>
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
        </article>
      )}
      {!o && !detail.isFetching && orders.isSuccess && (
        <EmptyState icon={FlaskConical}>{c('selectHint')}</EmptyState>
      )}
      {creating && (
        <Modal
          title={t('newOrder')}
          onClose={() => {
            setCreating(false);
          }}
        >
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
          <p className="text-[13px] font-medium text-ink-2">{t('tests')}</p>
          <div className="flex flex-wrap gap-1.5">
            {tests.data?.map((x) => (
              <button
                key={x.id}
                type="button"
                aria-pressed={picked.includes(x.id)}
                className="num rounded-full border border-line px-3 py-1.5 text-[13px] hover:bg-row-hover aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:font-medium aria-pressed:text-primary"
                onClick={() => {
                  setPicked(
                    picked.includes(x.id) ? picked.filter((p) => p !== x.id) : [...picked, x.id],
                  );
                }}
              >
                {x.nameUz}
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
        </Modal>
      )}
    </Workspace>
  );
}
