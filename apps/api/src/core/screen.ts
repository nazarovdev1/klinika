import type { Db } from '@shifo/db';
import { AppError } from './errors.js';
import { todayIn } from './time.js';

/** Text a TTS engine on the waiting-room screen can read out (uz). */
export const callText = (number: number, cabinet: string | null): string =>
  `Navbat raqami ${number}${cabinet ? `, ${cabinet}-xona` : ''}`;

/**
 * Public, read-only view for the waiting-room display, addressed by the revocable branch screen token.
 * Lives in core because the token identifies the tenant (no tenant context yet). No patient data is exposed.
 */
export async function screenView(db: Db, token: string) {
  const prisma = db.system();
  const branch = await prisma.branch.findUnique({ where: { screenToken: token } });
  if (!branch?.isActive) throw new AppError(404, 'NOT_FOUND', 'Screen not found');
  const tickets = await prisma.queueTicket.findMany({
    where: {
      clinicId: branch.clinicId,
      branchId: branch.id,
      date: todayIn(branch.timezone),
      status: { in: ['CALLED', 'IN_SERVICE'] },
    },
    orderBy: { calledAt: 'desc' },
    take: 10,
  });
  return {
    branchName: branch.name,
    tickets: tickets.map((x) => ({
      number: x.number,
      cabinet: x.cabinet,
      status: x.status,
      calledAt: x.calledAt?.toISOString() ?? null,
      text: callText(x.number, x.cabinet),
    })),
  };
}
