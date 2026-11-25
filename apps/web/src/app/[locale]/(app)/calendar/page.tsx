'use client';

import type { PatientDto } from '@shifo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, Card, ErrorNote, Field, Input, Select } from '@/components/ui/form';
import { api, ApiError } from '@/lib/api';
import { fmtTime, today } from '@/lib/format';
import { PatientPicker, useBranches, useDoctors, useServices } from '@/lib/queries';
import { useSession } from '@/lib/session';

interface Appt {
  id: string;
  branchId: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  version: number;
  note: string | null;
}
interface Slot {
  startsAt: string;
  endsAt: string;
  free: boolean;
}

const NEXT: Record<string, string[]> = {
  BOOKED: ['CONFIRMED', 'ARRIVED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['ARRIVED', 'CANCELLED', 'NO_SHOW'],
  ARRIVED: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED'],
};
const TONE: Record<string, 'gray' | 'green' | 'red' | 'amber' | 'blue'> = {
  BOOKED: 'blue',
  CONFIRMED: 'blue',
  ARRIVED: 'amber',
  IN_PROGRESS: 'amber',
  COMPLETED: 'green',
  CANCELLED: 'red',
  NO_SHOW: 'red',
};
// Tashkent has no DST (UTC+5): a local day is a fixed 24 h window.
const dayStart = (d: string) => new Date(d + 'T00:00:00+05:00').toISOString();
const nextDay = (d: string) =>
  new Date(new Date(`${d}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

export default function CalendarPage() {
  const t = useTranslations('calendar');
  const c = useTranslations('common');
  const { can } = useSession();
  const qc = useQueryClient();
  const branches = useBranches();
  const doctors = useDoctors();
  const [day, setDay] = useState(today());
  const [branchId, setBranchId] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('');
  const [patient, setPatient] = useState<PatientDto | null>(null);
  const [doctorId, setDoctorId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [slot, setSlot] = useState<Slot | null>(null);
  const [rescheduling, setRescheduling] = useState<Appt | null>(null);

  useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branches.data, branchId]);

  const range = { from: dayStart(day), to: dayStart(nextDay(day)) };
  const appts = useQuery({
    queryKey: ['appointments', branchId, doctorFilter, day],
    enabled: Boolean(branchId),
    queryFn: () =>
      api<{ items: Appt[] }>(
        `/appointments?branchId=${branchId}&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}${doctorFilter ? `&doctorId=${doctorFilter}` : ''}`,
      ),
    refetchInterval: 20_000,
  });
  const slots = useQuery({
    queryKey: ['slots', doctorId, day, branchId],
    enabled: Boolean(doctorId && branchId),
    queryFn: () =>
      api<{ items: Slot[] }>(`/doctors/${doctorId}/slots?date=${day}&branchId=${branchId}`),
  });
  const services = useServices(branchId);
  const doctorName = (id: string) => doctors.data?.find((d) => d.id === id)?.fullName ?? '';
  const canWrite = can('scheduling:write');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['appointments'] });
  const book = useMutation({
    mutationFn: async () => {
      if (!slot) throw new Error(t('pickSlot'));
      if (rescheduling) {
        return api(`/appointments/${rescheduling.id}`, {
          method: 'PATCH',
          json: {
            version: rescheduling.version,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            doctorId,
          },
        });
      }
      if (!patient) throw new Error(t('pickPatient'));
      return api('/appointments', {
        method: 'POST',
        json: {
          branchId,
          patientId: patient.id,
          doctorId,
          serviceId: serviceId || null,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
        },
      });
    },
    onSuccess: async () => {
      setSlot(null);
      setPatient(null);
      setRescheduling(null);
      await invalidate();
      await slots.refetch();
    },
  });
  const setStatus = useMutation({
    mutationFn: (v: { a: Appt; status: string }) =>
      api(`/appointments/${v.a.id}/status`, {
        method: 'POST',
        json: { version: v.a.version, status: v.status },
      }),
    onSuccess: invalidate,
  });

  const errText = (e: unknown) =>
    e instanceof ApiError && e.problem?.code === 'SLOT_TAKEN' ? new Error(t('slotTaken')) : e;

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
        <Field label={c('date')}>
          <Input
            type="date"
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              setSlot(null);
            }}
          />
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
        <Field label={c('doctor')}>
          <Select
            value={doctorFilter}
            onChange={(e) => {
              setDoctorFilter(e.target.value);
            }}
          >
            <option value="">{t('allDoctors')}</option>
            {doctors.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fullName}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <ErrorNote error={appts.error ?? setStatus.error} />
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2">{c('time')}</th>
            <th>{c('patient')}</th>
            <th>{c('doctor')}</th>
            <th>{c('status')}</th>
            <th>{c('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {appts.data?.items.map((a) => (
            <tr key={a.id} className="border-b border-border align-top">
              <td className="py-2 whitespace-nowrap">
                {fmtTime(a.startsAt)}–{fmtTime(a.endsAt)}
              </td>
              <td>{a.patientName}</td>
              <td>{doctorName(a.doctorId)}</td>
              <td>
                <Badge tone={TONE[a.status] ?? 'gray'}>{t(`status.${a.status}`)}</Badge>
              </td>
              <td className="space-x-2 py-1">
                {canWrite &&
                  (NEXT[a.status] ?? []).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted"
                      onClick={() => {
                        setStatus.mutate({ a, status: s });
                      }}
                    >
                      {t(`status.${s}`)}
                    </button>
                  ))}
                {canWrite && (a.status === 'BOOKED' || a.status === 'CONFIRMED') && (
                  <button
                    type="button"
                    className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted"
                    onClick={() => {
                      setRescheduling(a);
                      setDoctorId(a.doctorId);
                      setSlot(null);
                    }}
                  >
                    {t('reschedule')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {appts.data?.items.length === 0 && <p>{c('empty')}</p>}

      {canWrite && (
        <Card
          title={
            rescheduling ? `${t('reschedule')}: ${rescheduling.patientName}` : t('newAppointment')
          }
        >
          {!rescheduling && (
            <Field label={c('patient')}>
              <PatientPicker value={patient} onChange={setPatient} />
            </Field>
          )}
          <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
            <Field label={c('doctor')}>
              <Select
                value={doctorId}
                onChange={(e) => {
                  setDoctorId(e.target.value);
                  setSlot(null);
                }}
              >
                <option value="">—</option>
                {doctors.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}
                    {d.specialty ? ` (${d.specialty})` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            {!rescheduling && (
              <Field label={c('service')}>
                <Select
                  value={serviceId}
                  onChange={(e) => {
                    setServiceId(e.target.value);
                  }}
                >
                  <option value="">—</option>
                  {services.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameUz}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          {doctorId && (
            <div>
              <p className="mb-1 text-sm text-muted-foreground">{t('freeSlots')}</p>
              <div className="flex flex-wrap gap-2">
                {slots.data?.items.map((s) => (
                  <button
                    key={s.startsAt}
                    type="button"
                    disabled={!s.free}
                    aria-pressed={slot?.startsAt === s.startsAt}
                    className="rounded-md border border-border px-3 py-1 enabled:hover:bg-muted disabled:line-through disabled:opacity-40 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                    onClick={() => {
                      setSlot(s);
                    }}
                  >
                    {fmtTime(s.startsAt)}
                  </button>
                ))}
                {slots.data?.items.length === 0 && <p>{t('noSlots')}</p>}
              </div>
            </div>
          )}
          <ErrorNote error={book.error ? errText(book.error) : null} />
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={!slot || book.isPending || (!rescheduling && !patient)}
              onClick={() => {
                book.mutate();
              }}
            >
              {rescheduling ? c('save') : t('book')}
            </Button>
            {rescheduling && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRescheduling(null);
                }}
              >
                {c('cancel')}
              </Button>
            )}
          </div>
        </Card>
      )}
    </section>
  );
}
