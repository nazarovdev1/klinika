'use client';

import type { PatientDto } from '@shifo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, Card, ErrorNote, Field, Input, Select } from '@/components/ui/form';
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

const TONE = {
  DRAFT: 'gray',
  ISSUED: 'blue',
  PARTIAL: 'amber',
  PAID: 'green',
  VOID: 'red',
} as const;
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

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <ErrorNote error={list.error ?? create.error ?? action.error ?? pay.error} />

      <Card title={t('shift')}>
        {shift.data ? (
          <div className="flex flex-wrap items-end gap-3">
            <p>
              {t('shiftOpen')}: {formatMoney(shift.data.openingFloat)}
            </p>
            <Field label={t('counted')}>
              <Input
                inputMode="numeric"
                value={counted}
                onChange={(e) => {
                  setCounted(e.target.value);
                }}
              />
            </Field>
            <Button
              type="button"
              variant="outline"
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
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('openingFloat')}>
              <Input
                inputMode="numeric"
                value={float}
                onChange={(e) => {
                  setFloat(e.target.value);
                }}
              />
            </Field>
            <Button
              type="button"
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
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label={c('status')}>
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
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2">№</th>
                <th>{c('total')}</th>
                <th>{t('balance')}</th>
                <th>{c('status')}</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((i) => (
                <tr
                  key={i.id}
                  className={`cursor-pointer border-b border-border hover:bg-muted ${selected === i.id ? 'bg-muted' : ''}`}
                  onClick={() => {
                    setSelected(i.id);
                  }}
                >
                  <td className="py-2">{i.number}</td>
                  <td>{formatMoney(i.total)}</td>
                  <td>{formatMoney(i.balance)}</td>
                  <td>
                    <Badge tone={TONE[i.status]}>{t(`status.${i.status}`)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data?.items.length === 0 && <p>{c('empty')}</p>}
        </div>

        <div className="space-y-6">
          {inv && (
            <Card title={`${inv.number} — ${t(`status.${inv.status}`)}`}>
              <table className="w-full text-left">
                <tbody>
                  {inv.lines?.map((l) => (
                    <tr key={l.id} className="border-b border-border">
                      <td className="py-1">
                        {l.description} × {l.qty}
                      </td>
                      <td className="text-right">{formatMoney(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                {c('total')}: <b>{formatMoney(inv.total)}</b> · {t('paid')}:{' '}
                {formatMoney(inv.paidAmount)} · {t('balance')}: <b>{formatMoney(inv.balance)}</b>
              </p>
              {inv.issuedAt && (
                <p className="text-sm text-muted-foreground">{fmtDate(inv.issuedAt)}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {inv.status === 'DRAFT' && (
                  <Button
                    type="button"
                    onClick={() => {
                      action.mutate({ path: `/invoices/${inv.id}/issue` });
                    }}
                  >
                    {t('issue')}
                  </Button>
                )}
                {(inv.status === 'DRAFT' ||
                  (inv.status === 'ISSUED' && inv.paidAmount === '0')) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      action.mutate({ path: `/invoices/${inv.id}/void` });
                    }}
                  >
                    {t('void')}
                  </Button>
                )}
              </div>
              {(inv.status === 'ISSUED' || inv.status === 'PARTIAL') && (
                <div className="grid max-w-md gap-3 sm:grid-cols-3">
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
                      inputMode="numeric"
                      value={amount}
                      placeholder={formatMoney(inv.balance)}
                      onChange={(e) => {
                        setAmount(e.target.value);
                      }}
                    />
                  </Field>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      disabled={pay.isPending || !parseMoney(amount)}
                      onClick={() => {
                        pay.mutate();
                      }}
                    >
                      {t('takePayment')}
                    </Button>
                  </div>
                </div>
              )}
              {inv.payments?.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 border-t border-border pt-2"
                >
                  <span>
                    {t(`m.${p.method}`)} · {formatMoney(p.amount)}
                  </span>
                  {p.refundedAmount !== '0' && (
                    <Badge tone="red">
                      {t('refunded')}: {formatMoney(p.refundedAmount)}
                    </Badge>
                  )}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      void openBlob(`/payments/${p.id}/receipt?lang=uz`);
                    }}
                  >
                    {t('receipt')}
                  </button>
                  {can('billing:refund') && BigInt(p.amount) > BigInt(p.refundedAmount) && (
                    <button
                      type="button"
                      className="underline"
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
                    </button>
                  )}
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
                <Button type="button" variant="outline" onClick={addService}>
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
                  placeholder={c('amount')}
                  inputMode="numeric"
                  value={customPrice}
                  onChange={(e) => {
                    setCustomPrice(e.target.value);
                  }}
                />
                <Button type="button" variant="outline" onClick={addCustom}>
                  {c('add')}
                </Button>
              </div>
              <ul>
                {lines.map((l, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="flex-1">{l.description ?? svcName(l.serviceId)}</span>
                    <Input
                      className="w-20"
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
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        setLines(lines.filter((_, j) => j !== i));
                      }}
                    >
                      {c('delete')}
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                disabled={!patient || lines.length === 0 || create.isPending}
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
