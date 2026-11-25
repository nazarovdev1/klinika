'use client';

import { createPatientSchema, type PatientDto } from '@shifo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Send, UserPlus, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorNote, Field, Input, Notice, Select } from '@/components/ui/form';
import {
  EmptyState,
  Facts,
  Modal,
  PaneHead,
  PaneList,
  Row,
  SearchInput,
  Workspace,
} from '@/components/ui/page';
import { Link } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { useSession } from '@/lib/session';

const CONSENTS = ['DATA_PROCESSING', 'DHP_SHARING', 'SMS'] as const;
const EMPTY = {
  lastName: '',
  firstName: '',
  middleName: '',
  birthDate: '',
  sex: 'MALE',
  phone: '+998',
  pinfl: '',
  passport: '',
  address: '',
  allergiesText: '',
};

function PatientCard({ p }: { p: PatientDto }) {
  const t = useTranslations('patients');
  const v = useTranslations('visits');
  const c = useTranslations('common');
  const { can } = useSession();
  const visits = useQuery({
    queryKey: ['patient-visits', p.id],
    enabled: can('encounters:read'),
    queryFn: async () =>
      (
        await api<{ items: { id: string; status: string; startedAt: string }[] }>(
          `/encounters?patientId=${p.id}&limit=10`,
        )
      ).items,
  });
  return (
    <>
      <article className="rounded-card bg-surface p-6">
        <h2 className="mb-5 text-[22px] font-semibold leading-tight tracking-tight">
          {p.lastName} {p.firstName} {p.middleName ?? ''}
        </h2>
        <Facts
          items={[
            [t('birthDate'), fmtDate(p.birthDate)],
            [t('sex'), p.sex === 'MALE' ? t('male') : t('female')],
            [t('phone'), p.phone],
            [t('pinfl'), p.pinfl ?? '—'],
            [t('passport'), p.passport ?? '—'],
          ]}
        />
        {p.allergiesText && (
          <div className="mt-5">
            <Notice tone="danger">
              <b className="font-semibold">{t('allergies')}:</b> {p.allergiesText}
            </Notice>
          </div>
        )}
      </article>
      {can('encounters:read') && (
        <section className="rounded-card bg-surface p-6">
          <h3 className="mb-2 text-[16px] font-semibold">{t('visits')}</h3>
          <ErrorNote error={visits.error} />
          <ul className="divide-y divide-line">
            {visits.data?.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link className="num" href={`/visits/${x.id}`}>
                  {fmtDateTime(x.startedAt)}
                </Link>
                <span className="text-[13px] text-ink-2">{v(`status.${x.status}`)}</span>
              </li>
            ))}
          </ul>
          {visits.data?.length === 0 && <p className="text-ink-2">{c('empty')}</p>}
        </section>
      )}
    </>
  );
}

function PatientSide({ p }: { p: PatientDto }) {
  const t = useTranslations('patients');
  const { can } = useSession();
  const qc = useQueryClient();
  const consents = useQuery({
    queryKey: ['consents', p.id],
    queryFn: async () =>
      (
        await api<{ items: { type: string; granted: boolean; revokedAt: string | null }[] }>(
          `/patients/${p.id}/consents`,
        )
      ).items,
  });
  const setConsent = useMutation({
    mutationFn: (v: { type: string; granted: boolean }) =>
      api(`/patients/${p.id}/consents/${v.type}`, { method: 'PUT', json: { granted: v.granted } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consents', p.id] }),
  });
  const link = useMutation({
    mutationFn: () =>
      api<{ code: string; deepLink: string | null }>(`/patients/${p.id}/telegram-link`, {
        method: 'POST',
      }),
  });
  const active = (type: string) => {
    const row = consents.data?.find((x) => x.type === type);
    return Boolean(row?.granted && !row.revokedAt);
  };
  return (
    <>
      <h2 className="text-[17px] font-semibold">{t('consents')}</h2>
      <ErrorNote error={setConsent.error ?? link.error} />
      <div className="space-y-2">
        {CONSENTS.map((k) => (
          <label key={k} className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              disabled={!can('patients:write')}
              checked={active(k)}
              onChange={(e) => {
                setConsent.mutate({ type: k, granted: e.target.checked });
              }}
            />
            {t(`consent.${k}`)}
          </label>
        ))}
      </div>
      {can('patients:write') && (
        <div className="space-y-2 border-t border-line pt-4">
          <Button
            variant="outline"
            size="sm"
            icon={Send}
            onClick={() => {
              link.mutate();
            }}
          >
            {t('telegramLink')}
          </Button>
          {link.data && (
            <p className="text-[13px] text-ink-2">
              {t('telegramCode')}:{' '}
              <code className="num rounded-control bg-row-hover px-1">/start {link.data.code}</code>
            </p>
          )}
        </div>
      )}
    </>
  );
}

export default function PatientsPage() {
  const t = useTranslations('patients');
  const c = useTranslations('common');
  const { can } = useSession();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [dupe, setDupe] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['patients', q],
    queryFn: () =>
      api<{ items: PatientDto[]; nextCursor: string | null }>(
        `/patients?limit=25${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
  });
  const create = useMutation({
    mutationFn: (confirmDuplicate: boolean) => {
      const nul = (v: string) => (v.trim() ? v.trim() : null);
      const parsed = createPatientSchema.safeParse({
        lastName: f.lastName,
        firstName: f.firstName,
        middleName: nul(f.middleName),
        birthDate: f.birthDate,
        sex: f.sex,
        phone: f.phone,
        pinfl: nul(f.pinfl),
        passport: nul(f.passport),
        address: nul(f.address),
        allergiesText: nul(f.allergiesText),
        confirmDuplicate,
      });
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        );
      }
      return api<PatientDto>('/patients', { method: 'POST', json: parsed.data });
    },
    onSuccess: async (created) => {
      setOpen(created.id);
      setQ('');
      setF(EMPTY);
      setDupe(false);
      setFormError(null);
      setCreating(false);
      await qc.invalidateQueries({ queryKey: ['patients'] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.problem?.code === 'DUPLICATE_PATIENT') {
        const hard = err.problem.errors?.some((e) => e.path === 'pinfl');
        setDupe(!hard);
        setFormError(hard ? t('dupHard') : t('dupSoft'));
      } else {
        setDupe(false);
        setFormError(err.message);
      }
    },
  });
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => {
    setF({ ...f, [k]: e.target.value });
  };
  const items = list.data?.items ?? [];
  const selected = items.find((p) => p.id === open) ?? items[0];

  return (
    <Workspace
      list={
        <>
          <PaneHead
            title={t('title')}
            action={
              can('patients:write') && (
                <Button
                  icon={Plus}
                  aria-label={t('newPatient')}
                  onClick={() => {
                    setCreating(true);
                  }}
                >
                  {t('new')}
                </Button>
              )
            }
          >
            <SearchInput
              aria-label={t('search')}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
              }}
              placeholder={t('searchPlaceholder')}
            />
          </PaneHead>
          <PaneList>
            {items.map((p) => (
              <Row
                key={p.id}
                selected={selected?.id === p.id}
                onSelect={() => {
                  setOpen(p.id);
                }}
                title={[p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ')}
                sub={p.phone}
                status={<span className="num text-[12px] text-ink-2">{fmtDate(p.birthDate)}</span>}
              />
            ))}
            {items.length === 0 && !list.isFetching && (
              <li>
                <EmptyState icon={Users}>{t('empty')}</EmptyState>
              </li>
            )}
          </PaneList>
        </>
      }
      side={selected ? <PatientSide key={selected.id} p={selected} /> : undefined}
    >
      <ErrorNote error={list.error} />
      {selected && <PatientCard p={selected} />}
      {!selected && list.isSuccess && <EmptyState icon={Users}>{t('empty')}</EmptyState>}
      {creating && (
        <Modal
          title={t('newPatient')}
          onClose={() => {
            setCreating(false);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('lastName')}>
              <Input value={f.lastName} onChange={set('lastName')} />
            </Field>
            <Field label={t('firstName')}>
              <Input value={f.firstName} onChange={set('firstName')} />
            </Field>
            <Field label={t('middleName')}>
              <Input value={f.middleName} onChange={set('middleName')} />
            </Field>
            <Field label={t('birthDate')}>
              <Input type="date" value={f.birthDate} onChange={set('birthDate')} />
            </Field>
            <Field label={t('sex')}>
              <Select value={f.sex} onChange={set('sex')}>
                <option value="MALE">{t('male')}</option>
                <option value="FEMALE">{t('female')}</option>
              </Select>
            </Field>
            <Field label={t('phone')}>
              <Input className="num" value={f.phone} onChange={set('phone')} />
            </Field>
            <Field label={t('pinfl')}>
              <Input className="num" inputMode="numeric" value={f.pinfl} onChange={set('pinfl')} />
            </Field>
            <Field label={t('passport')}>
              <Input
                className="num"
                value={f.passport}
                onChange={set('passport')}
                placeholder="AA1234567"
              />
            </Field>
            <Field label={t('allergies')} className="col-span-2">
              <Input value={f.allergiesText} onChange={set('allergiesText')} />
            </Field>
          </div>
          {formError && <Notice tone="warn">{formError}</Notice>}
          <div className="flex gap-2">
            <Button
              icon={UserPlus}
              loading={create.isPending}
              onClick={() => {
                create.mutate(false);
              }}
            >
              {c('create')}
            </Button>
            {dupe && (
              <Button
                variant="outline"
                disabled={create.isPending}
                onClick={() => {
                  create.mutate(true);
                }}
              >
                {t('createAnyway')}
              </Button>
            )}
          </div>
        </Modal>
      )}
    </Workspace>
  );
}
