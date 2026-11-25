import type { Db, Prisma, TenantClient } from '@shifo/db';
import type { z } from 'zod';
import type {
  createAppointmentSchema,
  exceptionInputSchema,
  scheduleInputSchema,
  updateAppointmentSchema,
} from '@shifo/contracts';
import { recordAudit } from '../../core/audit.js';
import type { AuthContext } from '../../core/context.js';
import { AppError } from '../../core/errors.js';
import { patientNames } from '../../core/patient-names.js';
import { rooms, type Realtime } from '../../core/realtime.js';
import { dayOf, zonedToUtc } from '../../core/time.js';
import type { QueueService } from '../queue/queue.service.js';
import { computeSlots, fitsWorkingHours, workingWindows, type ScheduleRow } from './slots.js';

type Tx = Parameters<Parameters<TenantClient['$transaction']>[0]>[0];
type ScheduleInput = z.infer<typeof scheduleInputSchema>;
type ExceptionInput = z.infer<typeof exceptionInputSchema>;
type CreateAppointment = z.infer<typeof createAppointmentSchema>;
type UpdateAppointment = z.infer<typeof updateAppointmentSchema>;

type Status =
  'BOOKED' | 'CONFIRMED' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
const TRANSITIONS: Record<Status, readonly Status[]> = {
  BOOKED: ['CONFIRMED', 'ARRIVED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['ARRIVED', 'CANCELLED', 'NO_SHOW'],
  ARRIVED: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};
const ACTIVE: Status[] = ['BOOKED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];

/** Maps the Postgres exclusion-constraint violation (SQLSTATE 23P01) to 409 SLOT_TAKEN. */
function mapSlotTaken(err: unknown): never {
  const text = `${(err as { message?: string }).message ?? ''} ${JSON.stringify(
    (err as { meta?: unknown }).meta ?? {},
  )}`;
  if (/appointment_no_overlap|23P01|exclusion constraint/i.test(text)) {
    throw new AppError(409, 'SLOT_TAKEN', 'This time slot is already taken');
  }
  throw err;
}

const toDay = (d: Date): string => dayOf(d);
const apptDto = (a: {
  id: string;
  branchId: string;
  patientId: string;
  doctorId: string;
  serviceId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
  source: string;
  note: string | null;
  version: number;
}) => ({ ...a, startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString() });

export function schedulingService(db: Db, realtime: Realtime, queue: QueueService) {
  const tenant = (ctx: AuthContext) => db.forTenant(ctx.clinicId);

  async function assertDoctor(tx: Pick<Tx, 'user'>, doctorId: string): Promise<void> {
    if (
      !(await tx.user.findFirst({
        where: { id: doctorId, role: 'DOCTOR', isActive: true, deletedAt: null },
      }))
    ) {
      throw new AppError(404, 'NOT_FOUND', 'Doctor not found');
    }
  }

  async function loadRows(
    tx: Pick<Tx, 'doctorSchedule' | 'scheduleException'>,
    doctorId: string,
    branchId: string,
    day: string,
  ) {
    const [schedules, exception] = await Promise.all([
      tx.doctorSchedule.findMany({ where: { doctorId, branchId } }),
      tx.scheduleException.findFirst({
        where: { doctorId, branchId, date: new Date(`${day}T00:00:00Z`) },
      }),
    ]);
    const rows: ScheduleRow[] = schedules.map((s) => ({
      weekday: s.weekday,
      startTime: s.startTime,
      endTime: s.endTime,
      slotMinutes: s.slotMinutes,
      validFrom: toDay(s.validFrom),
      validTo: s.validTo ? toDay(s.validTo) : null,
    }));
    return { rows, exception: exception ?? undefined };
  }

  async function assertWithinHours(
    tx: Pick<Tx, 'doctorSchedule' | 'scheduleException' | 'branch'>,
    doctorId: string,
    branchId: string,
    startsAt: Date,
    endsAt: Date,
  ) {
    const branch = await tx.branch.findFirst({ where: { id: branchId } });
    if (!branch) throw new AppError(404, 'NOT_FOUND', 'Branch not found');
    // The appointment's wall-clock day in the branch time zone.
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: branch.timezone }).format(startsAt);
    const { rows, exception } = await loadRows(tx, doctorId, branchId, day);
    const windows = workingWindows(day, rows, exception);
    if (!fitsWorkingHours(day, branch.timezone, windows, startsAt, endsAt)) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Outside the doctor working hours', [
        { path: 'startsAt', message: 'doctor does not work at this time' },
      ]);
    }
  }

  const emitChanged = (
    ctx: AuthContext,
    a: { id: string; branchId: string; doctorId: string },
  ): void => {
    realtime.emit(rooms.clinic(ctx.clinicId), 'appointment.changed', a);
  };

  return {
    /** Active doctors with their profile (calendar/booking dropdowns). */
    async listDoctors(ctx: AuthContext) {
      const users = await tenant(ctx).user.findMany({
        where: { role: 'DOCTOR', isActive: true, deletedAt: null },
        include: { doctorProfile: true, branches: true },
        orderBy: { fullName: 'asc' },
      });
      return users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        specialty: u.doctorProfile?.specialty ?? null,
        cabinet: u.doctorProfile?.cabinet ?? null,
        color: u.doctorProfile?.color ?? null,
        defaultSlotMinutes: u.doctorProfile?.defaultSlotMinutes ?? 20,
        branchIds: u.branches.map((b) => b.branchId),
      }));
    },

    // ---- weekly templates and exceptions -------------------------------------------------------
    async listSchedules(ctx: AuthContext, doctorId: string) {
      const rows = await tenant(ctx).doctorSchedule.findMany({
        where: { doctorId },
        orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
      });
      return rows.map((s) => ({
        ...s,
        validFrom: toDay(s.validFrom),
        validTo: s.validTo ? toDay(s.validTo) : null,
      }));
    },

    async createSchedule(ctx: AuthContext, doctorId: string, input: ScheduleInput) {
      return tenant(ctx).$transaction(async (tx) => {
        await assertDoctor(tx, doctorId);
        if (!(await tx.branch.findFirst({ where: { id: input.branchId } }))) {
          throw new AppError(404, 'NOT_FOUND', 'Branch not found');
        }
        const s = await tx.doctorSchedule.create({
          data: {
            clinicId: ctx.clinicId,
            doctorId,
            branchId: input.branchId,
            weekday: input.weekday,
            startTime: input.startTime,
            endTime: input.endTime,
            slotMinutes: input.slotMinutes ?? 20,
            validFrom: new Date(`${input.validFrom}T00:00:00Z`),
            validTo: input.validTo ? new Date(`${input.validTo}T00:00:00Z`) : null,
          },
        });
        await recordAudit(tx, ctx, {
          action: 'schedule.created',
          entityType: 'DoctorSchedule',
          entityId: s.id,
          after: input,
        });
        return {
          ...s,
          validFrom: toDay(s.validFrom),
          validTo: s.validTo ? toDay(s.validTo) : null,
        };
      });
    },

    async deleteSchedule(ctx: AuthContext, id: string) {
      await tenant(ctx).$transaction(async (tx) => {
        const res = await tx.doctorSchedule.deleteMany({ where: { id } });
        if (res.count === 0) throw new AppError(404, 'NOT_FOUND', 'Schedule not found');
        await recordAudit(tx, ctx, {
          action: 'schedule.deleted',
          entityType: 'DoctorSchedule',
          entityId: id,
        });
      });
    },

    async createException(ctx: AuthContext, doctorId: string, input: ExceptionInput) {
      return tenant(ctx).$transaction(async (tx) => {
        await assertDoctor(tx, doctorId);
        const e = await tx.scheduleException.create({
          data: {
            clinicId: ctx.clinicId,
            doctorId,
            branchId: input.branchId,
            date: new Date(`${input.date}T00:00:00Z`),
            type: input.type,
            startTime: input.startTime ?? null,
            endTime: input.endTime ?? null,
            reason: input.reason ?? null,
          },
        });
        await recordAudit(tx, ctx, {
          action: 'schedule_exception.created',
          entityType: 'ScheduleException',
          entityId: e.id,
          after: input,
        });
        return { ...e, date: toDay(e.date) };
      });
    },

    async listExceptions(ctx: AuthContext, doctorId: string) {
      const rows = await tenant(ctx).scheduleException.findMany({
        where: { doctorId },
        orderBy: { date: 'asc' },
      });
      return rows.map((e) => ({ ...e, date: toDay(e.date) }));
    },

    // ---- free slots ----------------------------------------------------------------------------
    async slots(ctx: AuthContext, doctorId: string, day: string, branchId: string) {
      const t = tenant(ctx);
      const branch = await t.branch.findFirst({ where: { id: branchId } });
      if (!branch) throw new AppError(404, 'NOT_FOUND', 'Branch not found');
      const { rows, exception } = await loadRows(t, doctorId, branchId, day);
      const dayStart = zonedToUtc(day, '00:00', branch.timezone);
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);
      const busy = await t.appointment.findMany({
        where: {
          doctorId,
          status: { in: ACTIVE.filter((s) => s !== 'COMPLETED') },
          startsAt: { lt: dayEnd },
          endsAt: { gt: dayStart },
        },
        select: { startsAt: true, endsAt: true },
      });
      return computeSlots(day, branch.timezone, rows, exception, busy).map((s) => ({
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        free: s.free,
      }));
    },

    // ---- appointments --------------------------------------------------------------------------
    async list(
      ctx: AuthContext,
      q: { branchId?: string; doctorId?: string; patientId?: string; from: string; to: string },
    ) {
      const where: Prisma.AppointmentWhereInput = {
        startsAt: { gte: new Date(q.from), lt: new Date(q.to) },
        ...(q.branchId && { branchId: q.branchId }),
        ...(q.patientId && { patientId: q.patientId }),
        // Policy: a doctor only sees their own schedule.
        ...(ctx.role === 'DOCTOR'
          ? { doctorId: ctx.userId }
          : q.doctorId
            ? { doctorId: q.doctorId }
            : {}),
      };
      const t = tenant(ctx);
      const rows = await t.appointment.findMany({
        where,
        orderBy: { startsAt: 'asc' },
        take: 1000,
      });
      const names = await patientNames(
        t,
        rows.map((r) => r.patientId),
      );
      return {
        items: rows.map((r) => ({ ...apptDto(r), patientName: names.get(r.patientId) ?? '' })),
        nextCursor: null,
      };
    },

    async create(ctx: AuthContext, input: CreateAppointment) {
      const startsAt = new Date(input.startsAt);
      const endsAt = new Date(input.endsAt);
      if (endsAt <= startsAt) {
        throw new AppError(422, 'VALIDATION_ERROR', 'endsAt must be after startsAt', [
          { path: 'endsAt', message: 'must be after startsAt' },
        ]);
      }
      try {
        const created = await tenant(ctx).$transaction(async (tx) => {
          await assertDoctor(tx, input.doctorId);
          if (!(await tx.patient.findFirst({ where: { id: input.patientId, deletedAt: null } }))) {
            throw new AppError(404, 'NOT_FOUND', 'Patient not found');
          }
          await assertWithinHours(tx, input.doctorId, input.branchId, startsAt, endsAt);
          const a = await tx.appointment.create({
            data: {
              clinicId: ctx.clinicId,
              branchId: input.branchId,
              patientId: input.patientId,
              doctorId: input.doctorId,
              serviceId: input.serviceId ?? null,
              startsAt,
              endsAt,
              source: input.source ?? 'FRONT_DESK',
              note: input.note ?? null,
              createdByUserId: ctx.userId,
            },
          });
          await recordAudit(tx, ctx, {
            action: 'appointment.created',
            entityType: 'Appointment',
            entityId: a.id,
            after: { doctorId: a.doctorId, startsAt: input.startsAt },
          });
          // TODO(phase-8): schedule 24h/2h reminders through the outbox.
          return a;
        });
        emitChanged(ctx, created);
        return apptDto(created);
      } catch (err) {
        return mapSlotTaken(err);
      }
    },

    /** Reschedule / reassign. The exclusion constraint re-checks conflicts. */
    async update(ctx: AuthContext, id: string, input: UpdateAppointment) {
      try {
        const updated = await tenant(ctx).$transaction(async (tx) => {
          const before = await tx.appointment.findFirst({ where: { id } });
          if (!before) throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
          if (ctx.role === 'DOCTOR')
            throw new AppError(403, 'FORBIDDEN', 'Doctors cannot reschedule');
          if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(before.status)) {
            throw new AppError(409, 'CONFLICT', 'Appointment is closed');
          }
          const startsAt = input.startsAt ? new Date(input.startsAt) : before.startsAt;
          const endsAt = input.endsAt
            ? new Date(input.endsAt)
            : input.startsAt
              ? new Date(startsAt.getTime() + (before.endsAt.getTime() - before.startsAt.getTime()))
              : before.endsAt;
          const doctorId = input.doctorId ?? before.doctorId;
          if (input.doctorId) await assertDoctor(tx, doctorId);
          if (input.startsAt || input.endsAt || input.doctorId) {
            await assertWithinHours(tx, doctorId, before.branchId, startsAt, endsAt);
          }
          const res = await tx.appointment.updateMany({
            where: { id, version: input.version },
            data: {
              startsAt,
              endsAt,
              doctorId,
              ...(input.note !== undefined && { note: input.note }),
              version: { increment: 1 },
            },
          });
          if (res.count === 0)
            throw new AppError(409, 'CONFLICT', 'The record was modified by someone else');
          const after = await tx.appointment.findFirstOrThrow({ where: { id } });
          await recordAudit(tx, ctx, {
            action: 'appointment.rescheduled',
            entityType: 'Appointment',
            entityId: id,
            before: { startsAt: before.startsAt, doctorId: before.doctorId },
            after: { startsAt, doctorId },
          });
          return after;
        });
        emitChanged(ctx, updated);
        return apptDto(updated);
      } catch (err) {
        return mapSlotTaken(err);
      }
    },

    async setStatus(ctx: AuthContext, id: string, version: number, status: Status) {
      const result = await tenant(ctx).$transaction(async (tx) => {
        const before = await tx.appointment.findFirst({ where: { id } });
        if (!before) throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
        if (ctx.role === 'DOCTOR' && before.doctorId !== ctx.userId) {
          throw new AppError(403, 'FORBIDDEN', 'This appointment belongs to another doctor');
        }
        if (!TRANSITIONS[before.status].includes(status)) {
          throw new AppError(
            409,
            'CONFLICT',
            `Cannot change status from ${before.status} to ${status}`,
          );
        }
        const res = await tx.appointment.updateMany({
          where: { id, version },
          data: { status, version: { increment: 1 } },
        });
        if (res.count === 0)
          throw new AppError(409, 'CONFLICT', 'The record was modified by someone else');
        // Arrival automatically puts the patient into the walk-in queue.
        const ticket =
          status === 'ARRIVED'
            ? await queue.issueTicketTx(tx, ctx, {
                branchId: before.branchId,
                patientId: before.patientId,
                doctorId: before.doctorId,
                appointmentId: id,
              })
            : null;
        await recordAudit(tx, ctx, {
          action: 'appointment.status_changed',
          entityType: 'Appointment',
          entityId: id,
          before: { status: before.status },
          after: { status },
        });
        // TODO(phase-8): cancel pending reminders when CANCELLED / NO_SHOW.
        return { appointment: await tx.appointment.findFirstOrThrow({ where: { id } }), ticket };
      });
      emitChanged(ctx, result.appointment);
      if (result.ticket) {
        realtime.emit(rooms.branchQueue(result.appointment.branchId), 'queue.updated', {
          branchId: result.appointment.branchId,
        });
      }
      return { ...apptDto(result.appointment), ticketNumber: result.ticket?.number ?? null };
    },
  };
}
export type SchedulingService = ReturnType<typeof schedulingService>;
