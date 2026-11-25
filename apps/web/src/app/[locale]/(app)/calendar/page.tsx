'use client';

import type { PatientDto } from '@shifo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  CalendarPlus,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Stethoscope,
  UserCheck,
  UserX,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Field, Input, Select, Status, type Tone } from '@/components/ui/form';
import { PageHeader, Split, Toolbar } from '@/components/ui/page';
import { api, ApiError } from '@/lib/api';
import { fmtTime, today } from '@/lib/format';
import { PatientPicker, useBranches, useDoctors, useServices, type DoctorRow } from '@/lib/queries';
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
const STATUS: Record<string, { tone: Tone; icon: LucideIcon }> = {
  BOOKED: { tone: 'info', icon: Clock },
  CONFIRMED: { tone: 'info', icon: CircleCheck },
  ARRIVED: { tone: 'warn', icon: UserCheck },
  IN_PROGRESS: { tone: 'warn', icon: Stethoscope },
  COMPLETED: { tone: 'ok', icon: CheckCheck },
  CANCELLED: { tone: 'danger', icon: Ban },
  NO_SHOW: { tone: 'danger', icon: UserX },
};
/** Muted, desaturated doctor tags (never neon, never violet). */
const TAGS = [
  '#5e8c8a',
  '#6f8faf',
  '#a38b6a',
  '#7e9a6c',
  '#b0836f',
  '#6c8e9e',
  '#9a8f6b',
  '#8c7b72',
];

const DAY_START = 8; // grid hours (local)
const DAY_END = 19;
const ROW = 44; // px per 30 minutes
const HOURS = Array.from({ length: (DAY_END - DAY_START) * 2 }, (_, i) => i);

const dayStart = (d: string) => new Date(`${d}T00:00:00+05:00`).toISOString(); // Tashkent is UTC+5, no DST
const shiftDay = (d: string, n: number) =>
  new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const minutesOfDay = (iso: string) => {
  const [h, m] = fmtTime(iso).split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export default function CalendarPage() {
  const t = useTranslations('calendar');
  const c = useTranslations('common');
  const { can } = useSession();
  const qc = useQueryClient();
  const branches = useBranches();
  const doctors = useDoctors();
  const [day, setDay] = useState(today());
  const [branchId, setBranchId] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [rescheduling, setRescheduling] = useState<Appt | null>(null);
  const [patient, setPatient] = useState<PatientDto | null>(null);
  const [doctorId, setDoctorId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [slot, setSlot] = useState<Slot | null>(null);

  useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branches.data, branchId]);

  const cols: DoctorRow[] = (doctors.data ?? []).filter(
    (d) => !branchId || d.branchIds.includes(branchId),
  );
  const tag = (id: string) =>
    TAGS[
      Math.max(
        0,
        cols.findIndex((d) => d.id === id),
      ) % TAGS.length
    ] ?? '#5e8c8a';

  const appts = useQuery({
    queryKey: ['appointments', branchId, day],
    enabled: Boolean(branchId),
    queryFn: () =>
      api<{ items: Appt[] }>(
        `/appointments?branchId=${branchId}&from=${encodeURIComponent(dayStart(day))}&to=${encodeURIComponent(dayStart(shiftDay(day, 1)))}`,
      ),
    refetchInterval: 20_000,
  });
  const slots = useQuery({
    queryKey: ['slots', doctorId, day, branchId],
    enabled: Boolean(doctorId && branchId && (booking || rescheduling)),
    queryFn: () =>
      api<{ items: Slot[] }>(`/doctors/${doctorId}/slots?date=${day}&branchId=${branchId}`),
  });
  const services = useServices(branchId);
  const canWrite = can('scheduling:write');
  const current = appts.data?.items.find((a) => a.id === selected);
  const doctorName = (id: string) => doctors.data?.find((d) => d.id === id)?.fullName ?? '';
  const invalidate = () => qc.invalidateQueries({ queryKey: ['appointments'] });

  const resetForm = () => {
    setBooking(false);
    setRescheduling(null);
    setPatient(null);
    setSlot(null);
    setServiceId('');
  };
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
      resetForm();
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

  const formOpen = booking || Boolean(rescheduling);
  const panel = formOpen ? (
    <Card
      title={rescheduling ? `${t('reschedule')}: ${rescheduling.patientName}` : t('newAppointment')}
      actions={
        <Button variant="ghost" size="sm" icon={X} aria-label={c('close')} onClick={resetForm} />
      }
    >
      {!rescheduling && (
        <Field label={c('patient')}>
          <PatientPicker value={patient} onChange={setPatient} />
        </Field>
      )}
      <Field label={c('doctor')}>
        <Select
          value={doctorId}
          onChange={(e) => {
            setDoctorId(e.target.value);
            setSlot(null);
          }}
        >
          <option value="">—</option>
          {cols.map((d) => (
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
      {doctorId && (
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink-2">
            {t('freeSlots')} · <span className="num">{day.split('-').reverse().join('.')}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {slots.data?.items.map((s) => (
              <button
                key={s.startsAt}
                type="button"
                disabled={!s.free}
                aria-pressed={slot?.startsAt === s.startsAt}
                className="num h-8 rounded-control border border-line bg-surface px-2.5 text-[13px] enabled:hover:bg-row-hover disabled:text-ink-2 disabled:line-through disabled:opacity-50 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-white"
                onClick={() => {
                  setSlot(s);
                }}
              >
                {fmtTime(s.startsAt)}
              </button>
            ))}
            {slots.data?.items.length === 0 && (
              <p className="text-[13px] text-ink-2">{t('noSlots')}</p>
            )}
          </div>
        </div>
      )}
      <ErrorNote error={book.error ? errText(book.error) : null} />
      <div className="flex gap-2">
        <Button
          loading={book.isPending}
          disabled={!slot || (!rescheduling && !patient)}
          onClick={() => {
            book.mutate();
          }}
        >
          {rescheduling ? c('save') : t('book')}
        </Button>
        <Button variant="outline" onClick={resetForm}>
          {c('cancel')}
        </Button>
      </div>
    </Card>
  ) : current ? (
    <Card
      title={current.patientName}
      actions={
        <Button
          variant="ghost"
          size="sm"
          icon={X}
          aria-label={c('close')}
          onClick={() => {
            setSelected(null);
          }}
        />
      }
    >
      <dl className="grid grid-cols-[90px_1fr] gap-y-1.5 text-[14px]">
        <dt className="text-ink-2">{c('time')}</dt>
        <dd className="num">
          {fmtTime(current.startsAt)}–{fmtTime(current.endsAt)}
        </dd>
        <dt className="text-ink-2">{c('doctor')}</dt>
        <dd>{doctorName(current.doctorId)}</dd>
        <dt className="text-ink-2">{c('status')}</dt>
        <dd>
          <Status
            tone={STATUS[current.status]?.tone ?? 'neutral'}
            icon={STATUS[current.status]?.icon}
          >
            {t(`status.${current.status}`)}
          </Status>
        </dd>
      </dl>
      {canWrite && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {(NEXT[current.status] ?? []).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={
                s === 'CANCELLED' || s === 'NO_SHOW'
                  ? 'danger'
                  : s === 'ARRIVED' || s === 'COMPLETED'
                    ? 'default'
                    : 'outline'
              }
              icon={STATUS[s]?.icon}
              disabled={setStatus.isPending}
              onClick={() => {
                setStatus.mutate({ a: current, status: s });
              }}
            >
              {t(`status.${s}`)}
            </Button>
          ))}
          {(current.status === 'BOOKED' || current.status === 'CONFIRMED') && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setRescheduling(current);
                setDoctorId(current.doctorId);
                setSlot(null);
              }}
            >
              {t('reschedule')}
            </Button>
          )}
        </div>
      )}
      <ErrorNote error={setStatus.error} />
    </Card>
  ) : null;

  return (
    <section>
      <PageHeader title={t('title')}>
        {canWrite && (
          <Button
            icon={CalendarPlus}
            onClick={() => {
              resetForm();
              setBooking(true);
              setSelected(null);
            }}
          >
            {t('newAppointment')}
          </Button>
        )}
      </PageHeader>
      <Toolbar>
        <div className="flex items-end gap-1">
          <Button
            variant="outline"
            icon={ChevronLeft}
            aria-label="−1"
            onClick={() => {
              setDay(shiftDay(day, -1));
              setSlot(null);
            }}
          />
          <Field label={c('date')} className="w-44">
            <Input
              type="date"
              value={day}
              onChange={(e) => {
                setDay(e.target.value);
                setSlot(null);
              }}
            />
          </Field>
          <Button
            variant="outline"
            icon={ChevronRight}
            aria-label="+1"
            onClick={() => {
              setDay(shiftDay(day, 1));
              setSlot(null);
            }}
          />
          <Button
            variant="outline"
            onClick={() => {
              setDay(today());
            }}
          >
            {t('todayBtn')}
          </Button>
        </div>
        <Field label={c('branch')} className="w-56">
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
      </Toolbar>
      <ErrorNote error={appts.error} />

      <Split open={Boolean(panel)} panel={panel}>
        <div
          className="overflow-auto rounded-card border border-line bg-surface"
          style={{ maxHeight: 'calc(100vh - 200px)' }}
        >
          <div
            className="grid min-w-max"
            style={{
              gridTemplateColumns: `56px repeat(${String(Math.max(cols.length, 1))}, minmax(168px, 1fr))`,
            }}
          >
            <div className="sticky left-0 top-0 z-20 border-b border-line bg-surface" />
            {cols.map((d) => (
              <div
                key={d.id}
                className="sticky top-0 z-10 border-b border-l border-line bg-surface px-3 py-2"
              >
                <p className="flex items-center gap-2 text-[13px] font-medium">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: tag(d.id) }}
                  />
                  <span className="truncate">{d.fullName}</span>
                </p>
                <p className="truncate pl-[18px] text-[12px] text-ink-2">
                  {d.specialty ?? ''}
                  {d.cabinet ? ` · ${d.cabinet}` : ''}
                </p>
              </div>
            ))}

            <div className="sticky left-0 z-10 bg-surface" style={{ height: HOURS.length * ROW }}>
              {HOURS.map((i) => (
                <div
                  key={i}
                  className="num border-b border-line pr-2 pt-0.5 text-right text-[12px] text-ink-2"
                  style={{ height: ROW }}
                >
                  {i % 2 === 0 ? `${String(DAY_START + i / 2).padStart(2, '0')}:00` : ''}
                </div>
              ))}
            </div>

            {cols.map((d) => (
              <div
                key={d.id}
                className="relative border-l border-line"
                style={{ height: HOURS.length * ROW }}
                onClick={(e) => {
                  if (e.target !== e.currentTarget || !canWrite) return;
                  resetForm();
                  setBooking(true);
                  setSelected(null);
                  setDoctorId(d.id);
                }}
              >
                {HOURS.map((i) => (
                  <div
                    key={i}
                    className={`pointer-events-none border-b ${i % 2 === 0 ? 'border-line' : 'border-dashed border-line/70'}`}
                    style={{ height: ROW }}
                  />
                ))}
                {appts.data?.items
                  .filter((a) => a.doctorId === d.id)
                  .map((a) => {
                    const top = ((minutesOfDay(a.startsAt) - DAY_START * 60) / 30) * ROW;
                    const h = Math.max(
                      ((minutesOfDay(a.endsAt) - minutesOfDay(a.startsAt)) / 30) * ROW,
                      28,
                    );
                    const st = STATUS[a.status];
                    const off = a.status === 'CANCELLED' || a.status === 'NO_SHOW';
                    const Icon = st?.icon ?? Clock;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        aria-pressed={selected === a.id}
                        aria-label={`${fmtTime(a.startsAt)} ${a.patientName} — ${t(`status.${a.status}`)}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          resetForm();
                          setSelected(a.id);
                        }}
                        className="absolute inset-x-1 overflow-hidden rounded-control border px-2 py-1 text-left text-[12px] leading-tight transition-colors hover:brightness-95 aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-primary"
                        style={{
                          top: top + 1,
                          height: h - 2,
                          borderColor: tag(d.id),
                          background: `color-mix(in srgb, ${tag(d.id)} 14%, white)`,
                          opacity: off ? 0.6 : 1,
                        }}
                      >
                        <span className="num flex items-center gap-1 font-medium">
                          <Icon size={12} aria-hidden />
                          {fmtTime(a.startsAt)}
                        </span>
                        <span className={`block truncate ${off ? 'line-through' : ''}`}>
                          {a.patientName}
                        </span>
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </Split>
    </section>
  );
}
