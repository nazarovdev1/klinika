'use client';

import type { PatientDto } from '@shifo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Banknote,
  FileText,
  LockKeyhole,
  Plus,
  Receipt,
  Send,
  Trash2,
  Undo2,
  Wallet,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Field, Input, Select, Status, type Tone } from '@/components/ui/form';
import { EmptyState, PageHeader, Split, Toolbar } from '@/components/ui/page';
import { api, openBlob } from '@/lib/api';
import { fmtDate, formatMoney, parseMoney } from '@/lib/format';
import { PatientPicker, useBranches, useServices } from '@/lib/queries';
import { useSession } from '@/lib/session';

interface Invoice {
  id: string;
  number: string;
  status: 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID' | 'VOID';
  patientId: string;
  total: string;
  paidAmount: string;
  balance: string;
  issuedAt: string | null;
  version: number;
  lines?: { id: string; description: string; qty: number; unitPrice: string; total: string }[];
  payments?: { id: string; method: string; amount: string; refundedAmount: string }[];
}
interface Shift {
  id: string;
  openingFloat: string;
  branchId: string;
}
type Line = { serviceId?: string; description?: string; unitPrice?: string; qty: number };

const TONE: Record<Invoice['status'], Tone> = {
  DRAFT: 'neutral',
  ISSUED: 'info',
  PARTIAL: 'warn',
  PAID: 'ok',
  VOID: 'danger',
};
const METHODS = ['CASH', 'CARD'] as const;

export default function BillingPage() {
  const t = useTranslations('billing');
  const c = useTranslations('common');
  const qc = useQueryClient();
  const { can } = useSession();
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [patient, setPatient] = useState<PatientDto | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [method, setMethod] = useState<(typeof METHODS)[number]>('CASH');
  const [amount, setAmount] = useState('');
  const [float, setFloat] = useState('0');
  const [counted, setCounted] = useState('');
  // One idempotency key per payment attempt: a double click or a retry cannot charge twice.
  const payKey = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branches.data, branchId]);
  const services = useServices(branchId);

  const list = useQuery({
    queryKey: ['invoices', statusFilter],
    queryFn: () =>
      api<{ items: Invoice[] }>(
        `/invoices?limit=25${statusFilter ? `&status=${statusFilter}` : ''}`,
      ),
  });
  const detail = useQuery({
    queryKey: ['invoice', selected],
    enabled: Boolean(selected),
    queryFn: () => api<Invoice>(`/invoices/${selected ?? ''}`),
  });
  const shift = useQuery({
    queryKey: ['shift'],
    queryFn: async () => (await api<{ shift: Shift | null }>('/cash-shifts/current')).shift,
  });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['invoices'] }),
      qc.invalidateQueries({ queryKey: ['invoice'] }),
      qc.invalidateQueries({ queryKey: ['shift'] }),
    ]);
  };

  const create = useMutation({
    mutationFn: () =>
      api<Invoice>('/invoices', {
        method: 'POST',
        json: { patientId: patient?.id, branchId, lines },
      }),
    onSuccess: async (inv) => {
      setLines([]);
      setPatient(null);
      setSelected(inv.id);
      await refresh();
    },
  });
  const action = useMutation({
    mutationFn: (v: { path: string; json?: unknown }) =>
      api(v.path, { method: 'POST', json: v.json }),
    onSuccess: refresh,
  });
  const pay = useMutation({
    mutationFn: () => {
      const a = parseMoney(amount);
      if (!a) throw new Error(c('required'));
      return api(`/invoices/${selected ?? ''}/payments`, {
        method: 'POST',
        headers: { 'Idempotency-Key': payKey.current },
        json: { method, amount: a },
      });
    },
    onSuccess: async () => {
      payKey.current = crypto.randomUUID();
      setAmount('');
      await refresh();
    },
  });

  const inv = detail.data;
  const addService = () => {
    if (serviceId) setLines([...lines, { serviceId, qty: 1 }]);
    setServiceId('');
  };
  const addCustom = () => {
    const p = parseMoney(customPrice);
    if (customDesc.trim() && p)
      setLines([...lines, { description: customDesc.trim(), unitPrice: p, qty: 1 }]);
    setCustomDesc('');
    setCustomPrice('');
  };
  const svcName = (id?: string) => services.data?.find((s) => s.id === id)?.nameUz ?? '';

  const shiftBar = (
    <div className="mb-3 flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface px-4 py-3">
      <span className="flex items-center gap-2 pb-2 text-[14px] font-medium">
        <Wallet size={16} aria-hidden />
        {t('shift')}
      </span>
      {shift.data ? (
        <>
          <Status tone="ok">{t('shiftOpen')}</Status>
          <span className="num pb-2 text-[14px]">{formatMoney(shift.data.openingFloat)} so‘m</span>
          <Field label={t('counted')} className="w-40">
            <Input
              className="num"
              inputMode="numeric"
              value={counted}
              onChange={(e) => {
                setCounted(e.target.value);
              }}
            />
          </Field>
          <Button
            variant="outline"
            icon={LockKeyhole}
            disabled={!parseMoney(counted) && counted !== '0'}
            onClick={() => {
              action.mutate({
                path: '/cash-shifts/current/close',
                json: { countedCash: parseMoney(counted) ?? '0' },
              });
            }}
          >
            {t('closeShift')}
          </Button>
        </>
      ) : (
        <>
          <Field label={t('openingFloat')} className="w-40">
            <Input
              className="num"
              inputMode="numeric"
              value={float}
              onChange={(e) => {
                setFloat(e.target.value);
              }}
            />
          </Field>
          <Button
            icon={Banknote}
            disabled={!branchId || !can('billing:write')}
            onClick={() => {
              action.mutate({
                path: '/cash-shifts',
                json: { branchId, openingFloat: parseMoney(float) ?? '0' },
              });
            }}
          >
            {t('openShift')}
          </Button>
        </>
      )}
    </div>
  );

  const panel = (
    <div className="space-y-4">
      {inv && (
        <Card
          title={inv.number}
          actions={<Status tone={TONE[inv.status]}>{t(`status.${inv.status}`)}</Status>}
        >
          <table className="tbl">
            <tbody>
              {inv.lines?.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.description} <span className="num text-ink-2">× {l.qty}</span>
                  </td>
                  <td className="r num">{formatMoney(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="num grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[14px]">
            <dt className="text-ink-2">{c('total')}</dt>
            <dd className="text-right font-semibold">{formatMoney(inv.total)}</dd>
            <dt className="text-ink-2">{t('paid')}</dt>
            <dd className="text-right">{formatMoney(inv.paidAmount)}</dd>
            <dt className="text-ink-2">{t('balance')}</dt>
            <dd className="text-right font-semibold">{formatMoney(inv.balance)}</dd>
          </dl>
          {inv.issuedAt && <p className="num text-[13px] text-ink-2">{fmtDate(inv.issuedAt)}</p>}
          <div className="flex flex-wrap gap-2">
            {inv.status === 'DRAFT' && (
              <Button
                icon={Send}
                onClick={() => {
                  action.mutate({ path: `/invoices/${inv.id}/issue` });
                }}
              >
                {t('issue')}
              </Button>
            )}
            {(inv.status === 'DRAFT' || (inv.status === 'ISSUED' && inv.paidAmount === '0')) && (
              <Button
                variant="outline"
                icon={Ban}
                onClick={() => {
                  action.mutate({ path: `/invoices/${inv.id}/void` });
                }}
              >
                {t('void')}
              </Button>
            )}
          </div>
          {(inv.status === 'ISSUED' || inv.status === 'PARTIAL') && (
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3 border-t border-line pt-3">
              <Field label={t('method')}>
                <Select
                  value={method}
                  onChange={(e) => {
                    setMethod(e.target.value as (typeof METHODS)[number]);
                  }}
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(`m.${m}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={c('amount')}>
                <Input
                  className="num"
                  inputMode="numeric"
                  value={amount}
                  placeholder={formatMoney(inv.balance)}
                  onChange={(e) => {
                    setAmount(e.target.value);
                  }}
                />
              </Field>
              <Button
                icon={Banknote}
                loading={pay.isPending}
                disabled={!parseMoney(amount)}
                onClick={() => {
                  pay.mutate();
                }}
              >
                {t('takePayment')}
              </Button>
            </div>
          )}
          {inv.payments?.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[14px]"
            >
              <span className="num">
                {t(`m.${p.method}`)} · {formatMoney(p.amount)}
              </span>
              {p.refundedAmount !== '0' && (
                <Status tone="danger" icon={Undo2}>
                  {t('refunded')}: {formatMoney(p.refundedAmount)}
                </Status>
              )}
              <span className="ml-auto inline-flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Receipt}
                  onClick={() => {
                    void openBlob(`/payments/${p.id}/receipt?lang=uz`);
                  }}
                >
                  {t('receipt')}
                </Button>
                {can('billing:refund') && BigInt(p.amount) > BigInt(p.refundedAmount) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Undo2}
                    onClick={() => {
                      const reason = window.prompt(t('refundReason'));
                      if (reason && reason.trim().length >= 3) {
                        action.mutate({
                          path: `/payments/${p.id}/refunds`,
                          json: {
                            amount: (BigInt(p.amount) - BigInt(p.refundedAmount)).toString(),
                            reason,
                          },
                        });
                      }
                    }}
                  >
                    {t('refund')}
                  </Button>
                )}
              </span>
            </div>
          ))}
        </Card>
      )}

      {can('billing:write') && (
        <Card title={t('newInvoice')}>
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
          <div className="flex gap-2">
            <Select
              value={serviceId}
              onChange={(e) => {
                setServiceId(e.target.value);
              }}
              aria-label={c('service')}
            >
              <option value="">{c('service')}…</option>
              {services.data
                ?.filter((s) => s.price)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nameUz} — {formatMoney(s.price?.price)}
                  </option>
                ))}
            </Select>
            <Button variant="outline" icon={Plus} onClick={addService}>
              {c('add')}
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder={t('customItem')}
              value={customDesc}
              onChange={(e) => {
                setCustomDesc(e.target.value);
              }}
            />
            <Input
              className="num !w-32 shrink-0"
              placeholder={c('amount')}
              inputMode="numeric"
              value={customPrice}
              onChange={(e) => {
                setCustomPrice(e.target.value);
              }}
            />
            <Button variant="outline" icon={Plus} onClick={addCustom}>
              {c('add')}
            </Button>
          </div>
          {lines.length > 0 && (
            <ul className="divide-y divide-line rounded-control border border-line">
              {lines.map((l, i) => (
                <li key={i} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="flex-1 text-[14px]">
                    {l.description ?? svcName(l.serviceId)}
                  </span>
                  <Input
                    aria-label="qty"
                    className="num !w-16"
                    inputMode="numeric"
                    value={l.qty}
                    onChange={(e) => {
                      setLines(
                        lines.map((x, j) =>
                          j === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x,
                        ),
                      );
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    onClick={() => {
                      setLines(lines.filter((_, j) => j !== i));
                    }}
                  >
                    {c('delete')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button
            loading={create.isPending}
            disabled={!patient || lines.length === 0}
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
      <ErrorNote error={list.error ?? create.error ?? action.error ?? pay.error} />
      {shiftBar}
      <Toolbar>
        <Field label={c('status')} className="w-48">
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
            }}
          >
            <option value="">—</option>
            {(['DRAFT', 'ISSUED', 'PARTIAL', 'PAID', 'VOID'] as const).map((s) => (
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
                <th>№</th>
                <th className="r">{c('total')}</th>
                <th className="r">{t('balance')}</th>
                <th>{c('status')}</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((i) => (
                <tr
                  key={i.id}
                  className={`cursor-pointer ${selected === i.id ? 'bg-primary-soft' : ''}`}
                  onClick={() => {
                    setSelected(i.id);
                  }}
                >
                  <td className="num">{i.number}</td>
                  <td className="r num">{formatMoney(i.total)}</td>
                  <td className="r num">{formatMoney(i.balance)}</td>
                  <td>
                    <Status tone={TONE[i.status]}>{t(`status.${i.status}`)}</Status>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data?.items.length === 0 && <EmptyState icon={FileText}>{c('empty')}</EmptyState>}
        </Card>
      </Split>
    </section>
  );
}
