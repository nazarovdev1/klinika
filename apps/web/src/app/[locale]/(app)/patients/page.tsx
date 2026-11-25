'use client';

import { createPatientSchema, type PatientDto } from '@shifo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Field, Input, Select } from '@/components/ui/form';
import { api, ApiError } from '@/lib/api';
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

function PatientDetail({ p }: { p: PatientDto }) {
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
    <Card title={t('consents')}>
      <ErrorNote error={setConsent.error ?? link.error} />
      <div className="flex flex-wrap gap-4">
        {CONSENTS.map((k) => (
          <label key={k} className="flex items-center gap-2">
            <input
              type="checkbox"
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
        <div className="space-y-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              link.mutate();
            }}
          >
            {t('telegramLink')}
          </Button>
          {link.data && (
            <p className="text-sm">
              {t('telegramCode')}: <code>/start {link.data.code}</code>
              {link.data.deepLink && (
                <>
                  {' '}
                  ·{' '}
                  <a className="underline" href={link.data.deepLink}>
                    {link.data.deepLink}
                  </a>
                </>
              )}
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
      if (!parsed.success)
        throw new Error(
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        );
      return api('/patients', { method: 'POST', json: parsed.data });
    },
    onSuccess: async () => {
      setF(EMPTY);
      setDupe(false);
      setFormError(null);
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

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <label className="block max-w-xl">
        <span className="mb-1 block">{t('search')}</span>
        <Input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
          }}
          placeholder={t('searchPlaceholder')}
        />
      </label>
      {list.error && <p role="alert">{t('loadError')}</p>}
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2">{t('name')}</th>
            <th>{t('birthDate')}</th>
            <th>{t('phone')}</th>
            <th>{t('pinfl')}</th>
          </tr>
        </thead>
        <tbody>
          {list.data?.items.map((p) => (
            <tr
              key={p.id}
              className="cursor-pointer border-b border-border hover:bg-muted"
              onClick={() => {
                setOpen(open === p.id ? null : p.id);
              }}
            >
              <td className="py-2">
                {p.lastName} {p.firstName} {p.middleName ?? ''}
              </td>
              <td>{p.birthDate.split('-').reverse().join('.')}</td>
              <td>{p.phone}</td>
              <td>{p.pinfl ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.data?.items.length === 0 && !list.isFetching && <p>{t('empty')}</p>}
      {open && list.data?.items.find((p) => p.id === open) && (
        <PatientDetail p={list.data.items.find((p) => p.id === open) as PatientDto} />
      )}

      {can('patients:write') && (
        <Card title={t('newPatient')}>
          <div className="grid max-w-4xl gap-3 sm:grid-cols-3">
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
              <Input value={f.phone} onChange={set('phone')} />
            </Field>
            <Field label={t('pinfl')}>
              <Input inputMode="numeric" value={f.pinfl} onChange={set('pinfl')} />
            </Field>
            <Field label={t('passport')}>
              <Input value={f.passport} onChange={set('passport')} placeholder="AA1234567" />
            </Field>
            <Field label={t('allergies')}>
              <Input value={f.allergiesText} onChange={set('allergiesText')} />
            </Field>
          </div>
          {formError && (
            <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">
              {formError}
            </p>
          )}
          <div className="flex gap-3">
            <Button
              type="button"
              disabled={create.isPending}
              onClick={() => {
                create.mutate(false);
              }}
            >
              {c('create')}
            </Button>
            {dupe && (
              <Button
                type="button"
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
      )}
    </section>
  );
}
