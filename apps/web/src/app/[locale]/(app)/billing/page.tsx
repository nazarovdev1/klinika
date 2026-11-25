'use client';

import type { PatientDto } from '@shifo/contracts';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Ban,
  Banknote,
  CheckCircle2,
  CreditCard,
  Delete,
  FileText,
  LockKeyhole,
  Plus,
  Receipt,
  Search,
  Send,
  Trash2,
  Undo2,
  Wallet,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorNote, Field, Input, Select, Status, type Tone } from '@/components/ui/form';
import { EmptyState } from '@/components/ui/page';
import { api, openBlob } from '@/lib/api';
import { fmtDate, formatMoney, parseMoney } from '@/lib/format';
import { PatientPicker, useBranches, useServices } from '@/lib/queries';
import { useSession } from '@/lib/session';

interface Invoice {
  id: string;
  number: string;
  status: 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID' | 'VOID';
  patientId: string;
  patientName: string | null;
  branchId: string;
  createdAt: string;
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
const METHOD_ICON = { CASH: Banknote, CARD: CreditCard } as const;
const FILTERS = ['', 'due', 'PAID', 'DRAFT', 'VOID'] as const;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0'] as const;

export default function BillingPage() {
  const t = useTranslations('billing');
  const c = useTranslations('common');
  const qc = useQueryClient();
  const { can } = useSession();
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
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

  useEffect(() => {
    const id = setTimeout(() => {
      setQ(search.trim());
    }, 250);
    return () => {
      clearTimeout(id);
    };
  }, [search]);

  const list = useInfiniteQuery({
    queryKey: ['invoices', filter, q],
    initialPageParam: '',
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ limit: '30' });
      if (filter === 'due') p.set('due', '1');
      else if (filter) p.set('status', filter);
      if (q) p.set('q', q);
      if (pageParam) p.set('cursor', pageParam);
      return api<{ items: Invoice[]; nextCursor: string | null }>(`/invoices?${p.toString()}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const firstId = items[0]?.id;
  useEffect(() => {
    if (!selected && firstId) setSelected(firstId);
  }, [selected, firstId]);

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

  const pick = (id: string) => {
    payKey.current = crypto.randomUUID();
    action.reset();
    pay.reset();
    setSelected(id);
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
      pick(inv.id);
      dialog.current?.close();
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
      await refresh();
    },
  });

  const inv = detail.data;
  const payable = inv?.status === 'ISSUED' || inv?.status === 'PARTIAL';
  // The till proposes the full balance; the cashier only types when the patient pays a part.
  useEffect(() => {
    setAmount(inv?.balance && inv.balance !== '0' ? inv.balance : '');
  }, [inv?.id, inv?.balance]);
  const typed = parseMoney(amount) ?? '0';
  const tooMuch = inv ? BigInt(typed) > BigInt(inv.balance) : false;
  const needShift = method === 'CASH' && shift.data?.branchId !== inv?.branchId;
  const setDigits = (v: string) => {
    setAmount(v.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12));
  };
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
    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
      <span className="mr-auto flex items-center gap-2 text-[14px] font-medium">
        <Wallet size={16} aria-hidden />
        {t('shift')}
      </span>
      {shift.data ? (
        <>
          <Status tone="ok">{t('shiftOpen')}</Status>
          <span className="num text-[14px]">{formatMoney(shift.data.openingFloat)} so‘m</span>
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            {t('counted')}
            <Input
              className="num !w-28"
              inputMode="numeric"
              value={counted}
              onChange={(e) => {
                setCounted(e.target.value);
              }}
            />
          </label>
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
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            {t('openingFloat')}
            <Input
              className="num !w-28"
              inputMode="numeric"
              value={float}
              onChange={(e) => {
                setFloat(e.target.value);
              }}
            />
          </label>
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

  return (
    <section className="grid lg:h-screen lg:grid-cols-[300px_minmax(0,1fr)_320px] xl:grid-cols-[340px_minmax(0,1fr)_360px]">
      <div className="flex min-h-0 flex-col border-line bg-surface max-lg:border-b lg:border-r">
        <div className="space-y-3 px-4 pb-3 pt-5">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-[24px] font-semibold leading-tight tracking-tight">{t('title')}</h1>
            {can('billing:write') && (
              <Button
                icon={Plus}
                onClick={() => {
                  dialog.current?.showModal();
                }}
              >
                {t('newShort')}
              </Button>
            )}
          </div>
          <label className="relative block">
            <Search size={17} className="absolute left-3 top-[11px] text-ink-2" aria-hidden />
            <Input
              className="!pl-9"
              aria-label={t('searchInvoice')}
              placeholder={t('searchInvoice')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
            />
          </label>
          <div className="flex flex-wrap gap-0.5" role="group" aria-label={c('status')}>
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                className="rounded-full px-2 py-1.5 text-[13px] text-ink-2 hover:bg-row-hover aria-pressed:bg-primary aria-pressed:font-medium aria-pressed:text-white"
                onClick={() => {
                  setFilter(f);
                }}
              >
                {f === '' ? t('all') : f === 'due' ? t('due') : t(`status.${f}`)}
              </button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto max-lg:max-h-[320px]">
          {items.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                aria-current={selected === i.id}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t border-line px-4 py-3 text-left hover:bg-row-hover aria-[current=true]:bg-primary-soft"
                onClick={() => {
                  pick(i.id);
                }}
              >
                <span className="font-medium">{i.patientName ?? i.number}</span>
                <span className="num text-right font-semibold">
                  {formatMoney(i.balance !== '0' && i.status !== 'VOID' ? i.balance : i.total)}
                </span>
                <span className="num truncate text-[12px] text-ink-2">
                  {fmtDate(i.createdAt)}, №{i.number.split('-').at(-1)}
                </span>
                <span className="justify-self-end">
                  <Status tone={TONE[i.status]}>{t(`status.${i.status}`)}</Status>
                </span>
              </button>
            </li>
          ))}
          {list.isSuccess && items.length === 0 && (
            <li>
              <EmptyState icon={FileText}>{q || filter ? t('noMatch') : c('empty')}</EmptyState>
            </li>
          )}
          {list.isPending && (
            <li className="p-4 text-ink-2" role="status">
              {c('loading')}
            </li>
          )}
          {list.hasNextPage && (
            <li className="border-t border-line p-3">
              <Button
                variant="outline"
                className="w-full"
                loading={list.isFetchingNextPage}
                onClick={() => {
                  void list.fetchNextPage();
                }}
              >
                {c('loadMore')}
              </Button>
            </li>
          )}
        </ul>
      </div>

      <div className="flex min-h-0 min-w-0 flex-col items-center gap-5 overflow-y-auto p-4 xl:p-6">
        {shiftBar}
        <ErrorNote error={list.error ?? detail.error ?? shift.error ?? action.error ?? pay.error} />
        {inv ? (
          <div className="w-full max-w-[440px] drop-shadow-[0_8px_16px_rgba(20,36,95,0.12)]">
            <article className="receipt" aria-label={inv.number}>
              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[17px] font-semibold leading-snug">
                    {inv.patientName ?? inv.number}
                  </h2>
                  <p className="num text-[13px] text-ink-2">{inv.number}</p>
                  <p className="num text-[13px] text-ink-2">
                    {fmtDate(inv.issuedAt ?? inv.createdAt)}
                  </p>
                </div>
                <Status tone={TONE[inv.status]}>{t(`status.${inv.status}`)}</Status>
              </header>
              <hr />
              <ul className="space-y-2 text-[14px]">
                {inv.lines?.map((l) => (
                  <li key={l.id} className="flex justify-between gap-4">
                    <span>
                      {l.description}
                      {l.qty > 1 && <span className="num text-ink-2"> × {l.qty}</span>}
                    </span>
                    <span className="num whitespace-nowrap">{formatMoney(l.total)}</span>
                  </li>
                ))}
              </ul>
              <hr />
              <dl className="num grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[14px]">
                <dt>{c('total')}</dt>
                <dd className="text-right">{formatMoney(inv.total)}</dd>
                <dt>{t('paid')}</dt>
                <dd className="text-right">{formatMoney(inv.paidAmount)}</dd>
                <dt className="text-[17px] font-semibold">{t('balance')}</dt>
                <dd className="text-right text-[17px] font-semibold">{formatMoney(inv.balance)}</dd>
              </dl>
              {inv.payments && inv.payments.length > 0 && (
                <section className="mt-5">
                  <h3 className="mb-2 text-[13px] text-ink-2">{t('payments')}</h3>
                  {inv.payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center gap-2 border-t border-line py-2 text-[14px]"
                    >
                      <span className="num">
                        {t(`m.${p.method}`)}{' '}
                        <b className="font-semibold">{formatMoney(p.amount)}</b>
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
                                    amount: (
                                      BigInt(p.amount) - BigInt(p.refundedAmount)
                                    ).toString(),
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
                </section>
              )}
            </article>
          </div>
        ) : (
          !detail.isFetching &&
          !list.isPending && <EmptyState icon={Receipt}>{t('selectHint')}</EmptyState>
        )}
      </div>

      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto border-line bg-surface p-5 max-lg:border-t lg:border-l">
        <h2 className="text-[17px] font-semibold">{t('payTitle')}</h2>
        {inv?.status === 'DRAFT' && can('billing:write') && (
          <>
            <p className="text-ink-2">{t('draftHint')}</p>
            <Button
              className="h-12"
              icon={Send}
              loading={action.isPending}
              onClick={() => {
                action.mutate({ path: `/invoices/${inv.id}/issue` });
              }}
            >
              {t('issue')}
            </Button>
          </>
        )}
        {inv?.status === 'PAID' && (
          <p className="flex items-center gap-2 font-medium text-ok-text">
            <CheckCircle2 size={18} aria-hidden />
            {t('settled')}
          </p>
        )}
        {inv?.status === 'VOID' && <p className="text-ink-2">{t('isVoid')}</p>}
        {inv && payable && can('billing:write') && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!pay.isPending) pay.mutate();
            }}
          >
            <div
              className="grid grid-cols-2 gap-1 rounded-control border border-line bg-bg p-1"
              role="group"
              aria-label={t('method')}
            >
              {METHODS.map((m) => {
                const Icon = METHOD_ICON[m];
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={method === m}
                    className="flex h-10 items-center justify-center gap-2 rounded-[7px] text-ink-2 aria-pressed:bg-surface aria-pressed:font-medium aria-pressed:text-ink aria-pressed:shadow-sm"
                    onClick={() => {
                      setMethod(m);
                    }}
                  >
                    <Icon size={17} aria-hidden />
                    {t(`m.${m}`)}
                  </button>
                );
              })}
            </div>
            <label className="block rounded-control border-2 border-primary px-3.5 py-2.5">
              <span className="block text-[13px] text-ink-2">{c('amount')}</span>
              <input
                className="num w-full bg-transparent text-right text-[32px] font-semibold leading-tight tracking-tight outline-none"
                inputMode="numeric"
                autoComplete="off"
                value={amount ? formatMoney(amount) : ''}
                placeholder="0"
                onChange={(e) => {
                  setDigits(e.target.value);
                }}
              />
            </label>
            <div className="flex gap-2">
              {(
                [
                  ['full', inv.balance],
                  ['half', (BigInt(inv.balance) / BigInt(2)).toString()],
                ] as const
              ).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  className="rounded-full bg-primary-soft px-3.5 py-1.5 font-medium text-primary-hover"
                  onClick={() => {
                    setDigits(v);
                  }}
                >
                  {t(k)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="keypad"
                  onClick={() => {
                    setDigits(amount + k);
                  }}
                >
                  {k}
                </button>
              ))}
              <button
                type="button"
                aria-label={t('erase')}
                className="keypad"
                onClick={() => {
                  setDigits(amount.slice(0, -1));
                }}
              >
                <Delete size={21} aria-hidden />
              </button>
            </div>
            <Button
              type="submit"
              className="h-auto min-h-12 whitespace-normal py-2"
              loading={pay.isPending}
              disabled={typed === '0' || tooMuch || needShift}
            >
              {t('takePayment')}: {formatMoney(typed)}
            </Button>
            {(tooMuch || needShift) && (
              <p className="text-[13px] text-warn-text" role="status">
                {tooMuch ? `${t('tooMuch')}: ${formatMoney(inv.balance)}` : t('needShift')}
              </p>
            )}
          </form>
        )}
        {inv &&
          can('billing:write') &&
          (inv.status === 'DRAFT' || (inv.status === 'ISSUED' && inv.paidAmount === '0')) && (
            <Button
              variant="danger"
              icon={Ban}
              onClick={() => {
                action.mutate({ path: `/invoices/${inv.id}/void` });
              }}
            >
              {t('void')}
            </Button>
          )}
      </div>

      {can('billing:write') && (
        <dialog
          ref={dialog}
          aria-labelledby="new-invoice"
          className="m-auto w-[min(560px,calc(100vw-32px))] rounded-card bg-surface p-0 text-ink backdrop:bg-[#0a0d16]/50"
        >
          <section className="space-y-4 p-5">
            <header className="flex items-center justify-between">
              <h2 id="new-invoice" className="text-[18px] font-semibold">
                {t('newInvoice')}
              </h2>
              <button
                type="button"
                aria-label={c('close')}
                className="grid h-9 w-9 place-items-center rounded-control hover:bg-row-hover"
                onClick={() => {
                  dialog.current?.close();
                }}
              >
                <X size={18} aria-hidden />
              </button>
            </header>
            <ErrorNote error={create.error} />
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
                aria-label={t('customItem')}
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
                      aria-label={t('qty')}
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
          </section>
        </dialog>
      )}
    </section>
  );
}
