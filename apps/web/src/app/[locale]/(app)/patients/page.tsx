'use client';

import { createPatientSchema, type PatientDto } from '@shifo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Send, UserPlus, Users, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Field, Input, Notice, Select } from '@/components/ui/form';
import { EmptyState, PageHeader, Split, Toolbar } from '@/components/ui/page';
import { api, ApiError } from '@/lib/api';
import { fmtDate } from '@/lib/format';
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

function PatientDetail({ p, onClose }: { p: PatientDto; onClose: () => void }) {
  const t = useTranslations('patients');
  const c = useTranslations('common');
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
  const facts: [string, string][] = [
    [t('birthDate'), fmtDate(p.birthDate)],
    [t('phone'), p.phone],
    [t('pinfl'), p.pinfl ?? '—'],
    [t('passport'), p.passport ?? '—'],
    [t('allergies'), p.allergiesText ?? '—'],
  ];
  return (
    <Card
      title={`${p.lastName} ${p.firstName}`}
      actions={
        <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label={c('close')} />
      }
    >
      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[14px]">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-2">{k}</dt>
            <dd className="num">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-line pt-3">
        <h3 className="mb-2 text-[14px] font-semibold">{t('consents')}</h3>
        <ErrorNote error={setConsent.error ?? link.error} />
        <div className="space-y-2">
          {CONSENTS.map((k) => (
            <label key={k} className="flex items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#0b6e69]"
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
      </div>
      {can('patients:write') && (
        <div className="space-y-2 border-t border-line pt-3">
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
    </Card>
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
      return api('/patients', { method: 'POST', json: parsed.data });
    },
    onSuccess: async () => {
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
  const selected = list.data?.items.find((p) => p.id === open);

  const form = (
    <Card
      title={t('newPatient')}
      actions={
        <Button
          variant="ghost"
          size="sm"
          icon={X}
          aria-label={c('close')}
          onClick={() => {
            setCreating(false);
          }}
        />
      }
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
    </Card>
  );

  return (
    <section>
      <PageHeader title={t('title')}>
        {can('patients:write') && (
          <Button
            icon={UserPlus}
            onClick={() => {
              setCreating(true);
              setOpen(null);
            }}
          >
            {t('newPatient')}
          </Button>
        )}
      </PageHeader>
      <Toolbar>
        <div className="relative w-full max-w-md">
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-3 top-[11px] text-ink-2"
          />
          <Input
            type="search"
            className="pl-9"
            aria-label={t('search')}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
            }}
            placeholder={t('searchPlaceholder')}
          />
        </div>
      </Toolbar>
      <ErrorNote error={list.error} />
      <Split
        open={creating || Boolean(selected)}
        panel={
          creating
            ? form
            : selected && (
                <PatientDetail
                  p={selected}
                  onClose={() => {
                    setOpen(null);
                  }}
                />
              )
        }
      >
        <Card flush>
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('name')}</th>
                <th>{t('birthDate')}</th>
                <th>{t('phone')}</th>
                <th>{t('pinfl')}</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((p) => (
                <tr
                  key={p.id}
                  data-clickable="true"
                  aria-selected={open === p.id}
                  onClick={() => {
                    setOpen(open === p.id ? null : p.id);
                    setCreating(false);
                  }}
                >
                  <td className="font-medium">
                    {p.lastName} {p.firstName} {p.middleName ?? ''}
                  </td>
                  <td className="num">{fmtDate(p.birthDate)}</td>
                  <td className="num">{p.phone}</td>
                  <td className="num text-ink-2">{p.pinfl ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data?.items.length === 0 && !list.isFetching && (
            <EmptyState icon={Users}>{t('empty')}</EmptyState>
          )}
        </Card>
      </Split>
    </section>
  );
}
