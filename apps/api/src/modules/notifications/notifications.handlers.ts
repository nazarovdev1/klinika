import type { Db } from '@shifo/db';
import { pickChannel } from '../../core/notifications.js';
import type { OutboxHandler } from '../../core/outbox.js';

/** lab.validated -> "your results are ready" (no test names or values in the message). */
export function labReadyHandler(db: Db): OutboxHandler {
  return {
    type: 'lab.validated',
    async handle(ev) {
      const { labOrderId, patientId } = ev.payload as { labOrderId: string; patientId: string };
      const ch = await pickChannel(db, ev.clinicId, patientId);
      if (!ch) return;
      const clinic = await db.forTenant(ev.clinicId).clinic.findFirstOrThrow({ where: {} });
      try {
        await db.forTenant(ev.clinicId).notification.create({
          data: {
            clinicId: ev.clinicId,
            patientId,
            channel: ch.channel,
            template: 'lab.ready',
            params: { clinic: clinic.name },
            dedupeKey: `lab:${labOrderId}`,
          },
        });
      } catch (e) {
        if ((e as { code?: unknown }).code !== 'P2002') throw e; // already created: idempotent
      }
    },
  };
}
