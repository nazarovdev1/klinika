'use client';

import type { StaffDto } from '@shifo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Power, Save, Trash2, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Field, Input, Select, Status } from '@/components/ui/form';
import { Modal, PaneHead, PaneNav, Workspace } from '@/components/ui/page';
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
  const [creating, setCreating] = useState(false);
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
      setCreating(false);
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
    <div>
      <div className="space-y-3">
        <div className="flex justify-end">
          <Button
            icon={Plus}
            onClick={() => {
              setCreating(true);
            }}
          >
            {t('newStaff')}
          </Button>
        </div>
        <ErrorNote error={staff.error ?? toggle.error} />
        <Card flush className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('fullName')}</th>
                <th>{t('login')}</th>
                <th>{t('role')}</th>
                <th>{c('status')}</th>
                <th className="r">{c('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {staff.data?.items.map((s) => (
                <tr key={s.id}>
                  <td>{s.fullName}</td>
                  <td className="num">{s.login}</td>
                  <td className="text-ink-2">{s.role}</td>
                  <td>
                    <Status tone={s.isActive ? 'ok' : 'danger'}>
                      {s.isActive ? t('active') : t('inactive')}
                    </Status>
                  </td>
                  <td className="r">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Power}
                      onClick={() => {
                        toggle.mutate(s);
                      }}
                    >
                      {s.isActive ? t('deactivate') : t('activate')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      {creating && (
        <Modal
          title={t('newStaff')}
          onClose={() => {
            setCreating(false);
          }}
        >
          <ErrorNote error={create.error} />
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
              className="num"
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
          <Button
            icon={UserPlus}
            loading={create.isPending}
            disabled={!f.fullName || !f.login || !f.password}
            onClick={() => {
              create.mutate();
            }}
          >
            {c('create')}
          </Button>
        </Modal>
      )}
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
  const [creating, setCreating] = useState(false);
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
      setCreating(false);
      await qc.invalidateQueries({ queryKey: ['services'] });
    },
  });
  const setPrice = useMutation({
    mutationFn: (v: { id: string; price: string }) =>
      api(`/services/${v.id}/prices`, { method: 'POST', json: { branchId, price: v.price } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
  return (
    <div>
      <div className="space-y-3">
        <ErrorNote error={setPrice.error} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Input
            placeholder={c('search')}
            aria-label={c('search')}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
            }}
            className="max-w-sm"
          />
          <Button
            icon={Plus}
            onClick={() => {
              setCreating(true);
            }}
          >
            {t('newService')}
          </Button>
        </div>
        <Card flush className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('code')}</th>
                <th>{c('service')}</th>
                <th>{t('price')}</th>
              </tr>
            </thead>
            <tbody>
              {services.data?.map((s) => (
                <tr key={s.id}>
                  <td className="num">{s.code}</td>
                  <td>{s.nameUz}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <Input
                        aria-label={`${s.nameUz} ${t('price')}`}
                        className="num !h-8 !w-36 text-right"
                        inputMode="numeric"
                        value={priceEdit[s.id] ?? formatMoney(s.price?.price)}
                        onChange={(e) => {
                          setPriceEdit({ ...priceEdit, [s.id]: e.target.value });
                        }}
                      />
                      {priceEdit[s.id] !== undefined && parseMoney(priceEdit[s.id] ?? '') && (
                        <Button
                          size="sm"
                          variant="outline"
                          icon={Check}
                          onClick={() => {
                            setPrice.mutate({
                              id: s.id,
                              price: parseMoney(priceEdit[s.id] ?? '') ?? '0',
                            });
                            setPriceEdit(
                              Object.fromEntries(
                                Object.entries(priceEdit).filter(([k]) => k !== s.id),
                              ),
                            );
                          }}
                        >
                          {c('save')}
                        </Button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      {creating && (
        <Modal
          title={t('newService')}
          onClose={() => {
            setCreating(false);
          }}
        >
          <ErrorNote error={create.error} />
          <Field label={t('code')}>
            <Input
              className="num"
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
              className="num"
              inputMode="numeric"
              value={f.price}
              onChange={(e) => {
                setF({ ...f, price: e.target.value });
              }}
            />
          </Field>
          <Button
            icon={Plus}
            loading={create.isPending}
            disabled={!f.code || !f.nameUz}
            onClick={() => {
              create.mutate();
            }}
          >
            {c('create')}
          </Button>
        </Modal>
      )}
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
    <div className="space-y-4">
      <ErrorNote error={add.error ?? del.error} />
      <Field label={c('doctor')} className="max-w-sm">
        <Select
          value={doctorId}
          onChange={(e) => {
            setDoctorId(e.target.value);
          }}
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
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card flush className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('weekday')}</th>
                  <th>{c('time')}</th>
                  <th>{t('slotMinutes')}</th>
                  <th className="r">{c('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.data?.map((r) => (
                  <tr key={r.id}>
                    <td>{t(`wd.${String(r.weekday)}`)}</td>
                    <td className="num">
                      {r.startTime}–{r.endTime}
                    </td>
                    <td className="num">{r.slotMinutes}′</td>
                    <td className="r">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Trash2}
                        onClick={() => {
                          del.mutate(r.id);
                        }}
                      >
                        {c('delete')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title={t('addHours')}>
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
            <div className="grid grid-cols-2 gap-3">
              <Field label={c('from')}>
                <Input
                  className="num"
                  type="time"
                  value={f.startTime}
                  onChange={(e) => {
                    setF({ ...f, startTime: e.target.value });
                  }}
                />
              </Field>
              <Field label={c('to')}>
                <Input
                  className="num"
                  type="time"
                  value={f.endTime}
                  onChange={(e) => {
                    setF({ ...f, endTime: e.target.value });
                  }}
                />
              </Field>
            </div>
            <Field label={t('slotMinutes')}>
              <Input
                className="num"
                inputMode="numeric"
                value={f.slotMinutes}
                onChange={(e) => {
                  setF({ ...f, slotMinutes: Number(e.target.value) || 30 });
                }}
              />
            </Field>
            <Button
              icon={Plus}
              loading={add.isPending}
              onClick={() => {
                add.mutate();
              }}
            >
              {c('add')}
            </Button>
          </Card>
        </div>
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
    <div className="space-y-4">
      <ErrorNote error={save.error ?? addBranch.error} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title={t('clinicData')}>
          {(['name', 'phone', 'address', 'licenseNumber'] as const).map((k) => (
            <Field key={k} label={t(`cl.${k}`)}>
              <Input
                className={k === 'phone' || k === 'licenseNumber' ? 'num' : undefined}
                value={val(k)}
                onChange={(e) => {
                  setF({ ...f, [k]: e.target.value });
                }}
              />
            </Field>
          ))}
          <Button
            icon={Save}
            loading={save.isPending}
            onClick={() => {
              save.mutate();
            }}
          >
            {c('save')}
          </Button>
        </Card>
        <Card title={t('branches')}>
          <ul className="divide-y divide-line rounded-control border border-line">
            {branches.data?.map((b) => (
              <li key={b.id} className="px-3 py-2 text-[15px]">
                {b.name}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input
              aria-label={t('branchName')}
              value={branchName}
              placeholder={t('branchName')}
              onChange={(e) => {
                setBranchName(e.target.value);
              }}
            />
            <Button
              icon={Plus}
              loading={addBranch.isPending}
              disabled={!branchName.trim()}
              onClick={() => {
                addBranch.mutate();
              }}
            >
              {c('add')}
            </Button>
          </div>
        </Card>
      </div>
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
  if (!active) return <p className="p-6 text-ink-2">{c('noAccess')}</p>;
  return (
    <Workspace
      list={
        <>
          <PaneHead title={t('title')} />
          <PaneNav
            items={allowed.map((x) => ({ id: x, label: t(`tab.${x}`) }))}
            value={active}
            onChange={setTab}
          />
        </>
      }
    >
      <h2 className="text-[22px] font-semibold leading-tight tracking-tight">
        {t(`tab.${active}`)}
      </h2>
      {active === 'staff' && <StaffTab />}
      {active === 'catalog' && <CatalogTab />}
      {active === 'schedule' && <ScheduleTab />}
      {active === 'clinic' && <ClinicTab />}
    </Workspace>
  );
}
