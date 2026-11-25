import type { Db, TenantClient } from '@shifo/db';
import { recordAudit } from '../../core/audit.js';
import type { AuthContext } from '../../core/context.js';
import { AppError } from '../../core/errors.js';
import { patientNames } from '../../core/patient-names.js';
import { rooms, type Realtime } from '../../core/realtime.js';
import { callText } from '../../core/screen.js';
import { todayIn } from '../../core/time.js';

type Tx = Parameters<Parameters<TenantClient['$transaction']>[0]>[0];

export interface IssueTicketInput {
  branchId: string;
  patientId: string;
  doctorId?: string | null;
  appointmentId?: string | null;
}

export function queueService(db: Db, realtime: Realtime) {
  const tenant = (ctx: AuthContext) => db.forTenant(ctx.clinicId);

  const ticketDto = (t: {
    id: string;
    number: number;
    status: string;
    doctorId: string | null;
    patientId: string;
    appointmentId: string | null;
    cabinet: string | null;
    calledAt: Date | null;
    date: string;
    branchId: string;
  }) => ({
    id: t.id,
    branchId: t.branchId,
    date: t.date,
    number: t.number,
    status: t.status,
    doctorId: t.doctorId,
    patientId: t.patientId,
    appointmentId: t.appointmentId,
    cabinet: t.cabinet,
    calledAt: t.calledAt?.toISOString() ?? null,
  });

  async function branchOf(tx: Tx, branchId: string) {
    const branch = await tx.branch.findFirst({ where: { id: branchId } });
    if (!branch) throw new AppError(404, 'NOT_FOUND', 'Branch not found');
    return branch;
  }

  /** Issues a ticket inside the caller's transaction. The number comes from an atomic counter. */
  async function issueTicketTx(tx: Tx, ctx: AuthContext, input: IssueTicketInput) {
    const branch = await branchOf(tx, input.branchId);
    if (!(await tx.patient.findFirst({ where: { id: input.patientId, deletedAt: null } }))) {
      throw new AppError(404, 'NOT_FOUND', 'Patient not found');
    }
    const date = todayIn(branch.timezone);
    const seq = await tx.numberSequence.upsert({
      where: {
        clinicId_branchId_key_date: {
          clinicId: ctx.clinicId,
          branchId: branch.id,
          key: 'queue',
          date,
        },
      },
      create: { clinicId: ctx.clinicId, branchId: branch.id, key: 'queue', date, value: 1 },
      update: { value: { increment: 1 } },
    });
    const ticket = await tx.queueTicket.create({
      data: {
        clinicId: ctx.clinicId,
        branchId: branch.id,
        date,
        number: seq.value,
        patientId: input.patientId,
        doctorId: input.doctorId ?? null,
        appointmentId: input.appointmentId ?? null,
      },
    });
    await recordAudit(tx, ctx, {
      action: 'queue.ticket_issued',
      entityType: 'QueueTicket',
      entityId: ticket.id,
      after: { number: ticket.number, branchId: branch.id },
    });
    return ticket;
  }

  const notifyUpdated = (ctx: AuthContext, branchId: string): void => {
    realtime.emit(rooms.branchQueue(branchId), 'queue.updated', { branchId });
    realtime.emit(rooms.clinic(ctx.clinicId), 'queue.updated', { branchId });
  };

  return {
    issueTicketTx,

    async issueTicket(ctx: AuthContext, input: IssueTicketInput) {
      const ticket = await tenant(ctx).$transaction((tx) => issueTicketTx(tx, ctx, input));
      notifyUpdated(ctx, input.branchId);
      return ticketDto(ticket);
    },

    async list(ctx: AuthContext, branchId: string) {
      const t = tenant(ctx);
      const branch = await t.branch.findFirst({ where: { id: branchId } });
      if (!branch) throw new AppError(404, 'NOT_FOUND', 'Branch not found');
      const tickets = await t.queueTicket.findMany({
        where: {
          branchId,
          date: todayIn(branch.timezone),
          ...(ctx.role === 'DOCTOR' && { OR: [{ doctorId: ctx.userId }, { doctorId: null }] }),
        },
        orderBy: { number: 'asc' },
      });
      const names = await patientNames(
        t,
        tickets.map((x) => x.patientId),
      );
      return {
        items: tickets.map((x) => ({ ...ticketDto(x), patientName: names.get(x.patientId) ?? '' })),
      };
    },

    /** Doctor (or registrar) calls the next waiting ticket. Safe against two callers racing for one ticket. */
    async callNext(ctx: AuthContext, branchId: string, cabinet?: string) {
      const t = tenant(ctx);
      const branch = await t.branch.findFirst({ where: { id: branchId } });
      if (!branch) throw new AppError(404, 'NOT_FOUND', 'Branch not found');
      const date = todayIn(branch.timezone);
      const profile =
        ctx.role === 'DOCTOR'
          ? await t.doctorProfile.findFirst({ where: { userId: ctx.userId } })
          : null;
      const room = cabinet ?? profile?.cabinet ?? null;

      for (let attempt = 0; attempt < 5; attempt++) {
        const next = await t.queueTicket.findFirst({
          where: {
            branchId,
            date,
            status: 'WAITING',
            ...(ctx.role === 'DOCTOR' && { OR: [{ doctorId: ctx.userId }, { doctorId: null }] }),
          },
          orderBy: { number: 'asc' },
        });
        if (!next) throw new AppError(404, 'NOT_FOUND', 'No waiting tickets');
        const res = await t.queueTicket.updateMany({
          where: { id: next.id, status: 'WAITING' },
          data: {
            status: 'CALLED',
            calledAt: new Date(),
            cabinet: room,
            ...(ctx.role === 'DOCTOR' && { doctorId: ctx.userId }),
          },
        });
        if (res.count === 1) {
          const ticket = await t.queueTicket.findFirstOrThrow({ where: { id: next.id } });
          realtime.emit(rooms.branchQueue(branchId), 'queue.called', {
            branchId,
            number: ticket.number,
            cabinet: ticket.cabinet,
            text: callText(ticket.number, ticket.cabinet),
          });
          notifyUpdated(ctx, branchId);
          return ticketDto(ticket);
        }
      }
      throw new AppError(409, 'CONFLICT', 'Queue is busy, try again');
    },

    async setStatus(ctx: AuthContext, id: string, status: 'IN_SERVICE' | 'DONE' | 'SKIPPED') {
      const t = tenant(ctx);
      const existing = await t.queueTicket.findFirst({ where: { id } });
      if (!existing) throw new AppError(404, 'NOT_FOUND', 'Ticket not found');
      if (ctx.role === 'DOCTOR' && existing.doctorId && existing.doctorId !== ctx.userId) {
        throw new AppError(403, 'FORBIDDEN', 'This ticket belongs to another doctor');
      }
      await t.queueTicket.updateMany({ where: { id }, data: { status } });
      notifyUpdated(ctx, existing.branchId);
      return ticketDto(await t.queueTicket.findFirstOrThrow({ where: { id } }));
    },

    async regenerateScreenToken(ctx: AuthContext, branchId: string) {
      const token = crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '');
      await tenant(ctx).$transaction(async (tx) => {
        const res = await tx.branch.updateMany({
          where: { id: branchId },
          data: { screenToken: token },
        });
        if (res.count === 0) throw new AppError(404, 'NOT_FOUND', 'Branch not found');
        await recordAudit(tx, ctx, {
          action: 'branch.screen_token_regenerated',
          entityType: 'Branch',
          entityId: branchId,
        });
      });
      return { screenToken: token };
    },
  };
}
export type QueueService = ReturnType<typeof queueService>;
