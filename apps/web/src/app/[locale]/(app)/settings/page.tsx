'use client';

import type { StaffDto } from '@shifo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, Card, ErrorNote, Field, Input, Select } from '@/components/ui/form';
import { api } from '@/lib/api';
import { formatMoney, parseMoney, today } from '@/lib/format';
import { useBranches, useDoctors, useServices } from '@/lib/queries';
import { useSession } from '@/lib/session';

const ROLES = ['OWNER', 'ADMIN', 'REGISTRAR', 'DOCTOR', 'NURSE', 'CASHIER', 'LAB'] as const;
const TABS = ['staff', 'catalog', 'schedule', 'clinic'] as const;
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

function StaffTab() {
  const t = useTranslations('settings');
  const c = useTranslations('common');
  const qc = useQueryClient();
  const branches = useBranches();
  const staff = useQuery({
    queryKey: ['staff'],
    queryFn: () => api<{ items: StaffDto[] }>('/staff?limit=100'),
  });
  const [f, setF] = useState({
    fullName: '',
    phone: '+998',
    login: '',
    password: '',
    role: 'REGISTRAR',
    specialty: '',
  });
  const create = useMutation({
    mutationFn: () =>
      api('/staff', {
        method: 'POST',
        json: {
          fullName: f.fullName,
          phone: f.phone,
          login: f.login,
          password: f.password,
          role: f.role,
          branchIds: branches.data?.map((b) => b.id).slice(0, 1) ?? [],
          ...(f.role === 'DOCTOR'
            ? { doctorProfile: { specialty: f.specialty || 'Terapevt' } }
            : {}),
        },
      }),
    onSuccess: async () => {
      setF({ ...f, fullName: '', login: '', password: '' });
      await qc.invalidateQueries({ queryKey: ['staff'] });
      await qc.invalidateQueries({ queryKey: ['doctors'] });
    },
  });
  const toggle = useMutation({
    mutationFn: (s: StaffDto) =>
      api(`/staff/${s.id}`, {
        method: 'PATCH',
        json: { version: s.version, isActive: !s.isActive },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
  return (
    <div className="space-y-6">
      <ErrorNote error={staff.error ?? create.error ?? toggle.error} />
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2">{t('fullName')}</th>
            <th>{t('login')}</th>
            <th>{t('role')}</th>
            <th>{c('status')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {staff.data?.items.map((s) => (
            <tr key={s.id} className="border-b border-border">
              <td className="py-2">{s.fullName}</td>
              <td>{s.login}</td>
              <td>{s.role}</td>
              <td>
                <Badge tone={s.isActive ? 'green' : 'red'}>
                  {s.isActive ? t('active') : t('inactive')}
                </Badge>
              </td>
              <td>
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    toggle.mutate(s);
                  }}
                >
                  {s.isActive ? t('deactivate') : t('activate')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Card title={t('newStaff')}>
        <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
          <Field label={t('fullName')}>
            <Input
              value={f.fullName}
              onChange={(e) => {
                setF({ ...f, fullName: e.target.value });
              }}
            />
          </Field>
          <Field label={t('phone')}>
            <Input
              value={f.phone}
              onChange={(e) => {
                setF({ ...f, phone: e.target.value });
              }}
            />
          </Field>
          <Field label={t('login')}>
            <Input
              value={f.login}
              onChange={(e) => {
                setF({ ...f, login: e.target.value });
              }}
            />
          </Field>
          <Field label={t('tempPassword')}>
            <Input
              type="password"
              autoComplete="new-password"
              value={f.password}
              onChange={(e) => {
                setF({ ...f, password: e.target.value });
              }}
            />
          </Field>
          <Field label={t('role')}>
            <Select
              value={f.role}
              onChange={(e) => {
                setF({ ...f, role: e.target.value });
              }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          {f.role === 'DOCTOR' && (
            <Field label={t('specialty')}>
              <Input
                value={f.specialty}
                onChange={(e) => {
                  setF({ ...f, specialty: e.target.value });
                }}
              />
            </Field>
          )}
        </div>
        <Button
          type="button"
          disabled={create.isPending || !f.fullName || !f.login || !f.password}
          onClick={() => {
            create.mutate();
          }}
        >
          {c('create')}
        </Button>
      </Card>
    </div>
  );
}

function CatalogTab() {
  const t = useTranslations('settings');
  const c = useTranslations('common');
  const qc = useQueryClient();
  const branches = useBranches();
  const branchId = branches.data?.[0]?.id;
  const [q, setQ] = useState('');
  const services = useServices(branchId, q);
  const [f, setF] = useState({ code: '', nameUz: '', nameRu: '', price: '' });
  const [priceEdit, setPriceEdit] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: async () => {
      const s = await api<{ id: string }>('/services', {
        method: 'POST',
        json: { code: f.code, nameUz: f.nameUz, nameRu: f.nameRu || f.nameUz },
      });
      const price = parseMoney(f.price);
      if (price && branchId)
        await api(`/services/${s.id}/prices`, { method: 'POST', json: { branchId, price } });
    },
    onSuccess: async () => {
      setF({ code: '', nameUz: '', nameRu: '', price: '' });
      await qc.invalidateQueries({ queryKey: ['services'] });
    },
  });
  const setPrice = useMutation({
    mutationFn: (v: { id: string; price: string }) =>
      api(`/services/${v.id}/prices`, { method: 'POST', json: { branchId, price: v.price } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
  return (
    <div className="space-y-6">
      <ErrorNote error={create.error ?? setPrice.error} />
      <Input
        placeholder={c('search')}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
        }}
        className="max-w-sm"
      />
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2">{t('code')}</th>
            <th>{c('service')}</th>
            <th>{t('price')}</th>
          </tr>
        </thead>
        <tbody>
          {services.data?.map((s) => (
            <tr key={s.id} className="border-b border-border">
              <td className="py-2">{s.code}</td>
              <td>{s.nameUz}</td>
              <td className="flex items-center gap-2 py-1">
                <Input
                  className="w-36"
                  inputMode="numeric"
                  value={priceEdit[s.id] ?? formatMoney(s.price?.price)}
                  onChange={(e) => {
                    setPriceEdit({ ...priceEdit, [s.id]: e.target.value });
                  }}
                />
                {priceEdit[s.id] !== undefined && parseMoney(priceEdit[s.id] ?? '') && (
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setPrice.mutate({
                        id: s.id,
                        price: parseMoney(priceEdit[s.id] ?? '') ?? '0',
                      });
                      setPriceEdit(
                        Object.fromEntries(Object.entries(priceEdit).filter(([k]) => k !== s.id)),
                      );
                    }}
                  >
                    {c('save')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Card title={t('newService')}>
        <div className="grid max-w-3xl gap-3 sm:grid-cols-4">
          <Field label={t('code')}>
            <Input
              value={f.code}
              onChange={(e) => {
                setF({ ...f, code: e.target.value });
              }}
            />
          </Field>
          <Field label="UZ">
            <Input
              value={f.nameUz}
              onChange={(e) => {
                setF({ ...f, nameUz: e.target.value });
              }}
            />
          </Field>
          <Field label="RU">
            <Input
              value={f.nameRu}
              onChange={(e) => {
                setF({ ...f, nameRu: e.target.value });
              }}
            />
          </Field>
          <Field label={t('price')}>
            <Input
              inputMode="numeric"
              value={f.price}
              onChange={(e) => {
                setF({ ...f, price: e.target.value });
              }}
            />
          </Field>
        </div>
        <Button
          type="button"
          disabled={create.isPending || !f.code || !f.nameUz}
          onClick={() => {
            create.mutate();
          }}
        >
          {c('create')}
        </Button>
      </Card>
    </div>
  );
}

function ScheduleTab() {
  const t = useTranslations('settings');
  const c = useTranslations('common');
  const qc = useQueryClient();
  const doctors = useDoctors();
  const branches = useBranches();
  const [doctorId, setDoctorId] = useState('');
  const branchId = branches.data?.[0]?.id ?? '';
  const [f, setF] = useState({ weekday: 1, startTime: '09:00', endTime: '17:00', slotMinutes: 30 });
  const rows = useQuery({
    queryKey: ['schedules', doctorId],
    enabled: Boolean(doctorId),
    queryFn: async () =>
      (
        await api<{
          items: {
            id: string;
            weekday: number;
            startTime: string;
            endTime: string;
            slotMinutes: number;
          }[];
        }>(`/doctors/${doctorId}/schedules`)
      ).items,
  });
  const add = useMutation({
    mutationFn: () =>
      api(`/doctors/${doctorId}/schedules`, {
        method: 'POST',
        json: { ...f, branchId, validFrom: today() },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/schedules/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  });
  return (
    <div className="space-y-6">
      <ErrorNote error={add.error ?? del.error} />
      <Field label={c('doctor')}>
        <Select
          value={doctorId}
          onChange={(e) => {
            setDoctorId(e.target.value);
          }}
          className="max-w-sm"
        >
          <option value="">—</option>
          {doctors.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.fullName}
            </option>
          ))}
        </Select>
      </Field>
      {doctorId && (
        <>
          <ul className="max-w-md divide-y divide-border">
            {rows.data?.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <span className="w-28">{t(`wd.${String(r.weekday)}`)}</span>
                <span className="flex-1">
                  {r.startTime}–{r.endTime} ({r.slotMinutes}′)
                </span>
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    del.mutate(r.id);
                  }}
                >
                  {c('delete')}
                </button>
              </li>
            ))}
          </ul>
          <Card title={t('addHours')}>
            <div className="grid max-w-3xl gap-3 sm:grid-cols-4">
              <Field label={t('weekday')}>
                <Select
                  value={f.weekday}
                  onChange={(e) => {
                    setF({ ...f, weekday: Number(e.target.value) });
                  }}
                >
                  {WEEKDAYS.map((w) => (
                    <option key={w} value={w}>
                      {t(`wd.${String(w)}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={c('from')}>
                <Input
                  type="time"
                  value={f.startTime}
                  onChange={(e) => {
                    setF({ ...f, startTime: e.target.value });
                  }}
                />
              </Field>
              <Field label={c('to')}>
                <Input
                  type="time"
                  value={f.endTime}
                  onChange={(e) => {
                    setF({ ...f, endTime: e.target.value });
                  }}
                />
              </Field>
              <Field label={t('slotMinutes')}>
                <Input
                  inputMode="numeric"
                  value={f.slotMinutes}
                  onChange={(e) => {
                    setF({ ...f, slotMinutes: Number(e.target.value) || 30 });
                  }}
                />
              </Field>
            </div>
            <Button
              type="button"
              disabled={add.isPending}
              onClick={() => {
                add.mutate();
              }}
            >
              {c('add')}
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}

function ClinicTab() {
  const t = useTranslations('settings');
  const c = useTranslations('common');
  const qc = useQueryClient();
  const clinic = useQuery({
    queryKey: ['clinic'],
    queryFn: () =>
      api<{
        name: string;
        phone: string | null;
        address: string | null;
        licenseNumber: string | null;
      }>('/clinic'),
  });
  const branches = useBranches();
  const [f, setF] = useState<Record<string, string>>({});
  const [branchName, setBranchName] = useState('');
  const val = (k: 'name' | 'phone' | 'address' | 'licenseNumber') => f[k] ?? clinic.data?.[k] ?? '';
  const save = useMutation({
    mutationFn: () =>
      api('/clinic', {
        method: 'PATCH',
        json: {
          name: val('name'),
          phone: val('phone') || null,
          address: val('address') || null,
          licenseNumber: val('licenseNumber') || null,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic'] }),
  });
  const addBranch = useMutation({
    mutationFn: () => api('/branches', { method: 'POST', json: { name: branchName } }),
    onSuccess: async () => {
      setBranchName('');
      await qc.invalidateQueries({ queryKey: ['branches'] });
    },
  });
  return (
    <div className="space-y-6">
      <ErrorNote error={save.error ?? addBranch.error} />
      <Card title={t('clinicData')}>
        <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
          {(['name', 'phone', 'address', 'licenseNumber'] as const).map((k) => (
            <Field key={k} label={t(`cl.${k}`)}>
              <Input
                value={val(k)}
                onChange={(e) => {
                  setF({ ...f, [k]: e.target.value });
                }}
              />
            </Field>
          ))}
        </div>
        <Button
          type="button"
          disabled={save.isPending}
          onClick={() => {
            save.mutate();
          }}
        >
          {c('save')}
        </Button>
      </Card>
      <Card title={t('branches')}>
        <ul>
          {branches.data?.map((b) => (
            <li key={b.id}>{b.name}</li>
          ))}
        </ul>
        <div className="flex max-w-md gap-2">
          <Input
            value={branchName}
            placeholder={t('branchName')}
            onChange={(e) => {
              setBranchName(e.target.value);
            }}
          />
          <Button
            type="button"
            disabled={!branchName.trim() || addBranch.isPending}
            onClick={() => {
              addBranch.mutate();
            }}
          >
            {c('add')}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const t = useTranslations('settings');
  const c = useTranslations('common');
  const { can } = useSession();
  const [tab, setTab] = useState<(typeof TABS)[number]>('staff');
  const allowed = TABS.filter((x) =>
    x === 'staff'
      ? can('staff:manage')
      : x === 'catalog'
        ? can('catalog:write')
        : can('settings:manage'),
  );
  const active = allowed.includes(tab) ? tab : allowed[0];
  if (!active) return <p>{c('noAccess')}</p>;
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <div role="tablist" className="flex gap-2 border-b border-border">
        {allowed.map((x) => (
          <button
            key={x}
            type="button"
            role="tab"
            aria-selected={active === x}
            className="px-4 py-2 aria-selected:border-b-2 aria-selected:border-primary aria-selected:font-semibold"
            onClick={() => {
              setTab(x);
            }}
          >
            {t(`tab.${x}`)}
          </button>
        ))}
      </div>
      {active === 'staff' && <StaffTab />}
      {active === 'catalog' && <CatalogTab />}
      {active === 'schedule' && <ScheduleTab />}
      {active === 'clinic' && <ClinicTab />}
    </section>
  );
}
