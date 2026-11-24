import type { Server as HttpServer } from 'node:http';
import type { Db } from '@shifo/db';
import { Server } from 'socket.io';
import type { Env } from '../config/env.js';
import { verifyAccessToken } from './tokens.js';

/** Fire-and-forget fan-out to rooms. Rooms: clinic:{id}, branch:{id}:queue, user:{id}. */
export interface Realtime {
  emit(room: string, event: string, payload: unknown): void;
}

export const noopRealtime: Realtime = { emit: () => undefined };

export const rooms = {
  clinic: (id: string) => `clinic:${id}`,
  branchQueue: (id: string) => `branch:${id}:queue`,
  user: (id: string) => `user:${id}`,
};

/**
 * Socket.IO attached to the API server.
 * - default namespace: staff, authenticated with the access token on the handshake
 * - `/screen`: public waiting-room display, authenticated by the revocable branch screen token (read-only)
 * TODO(phase-10): Redis adapter (`@socket.io/redis-adapter`) for multi-instance deployments.
 */
export function createSocketRealtime(
  httpServer: HttpServer,
  env: Env,
  db: Db,
): { realtime: Realtime; io: Server } {
  const io = new Server(httpServer, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: string }).token;
    if (!token) {
      next(new Error('UNAUTHENTICATED'));
      return;
    }
    verifyAccessToken(token, env.JWT_ACCESS_SECRET)
      .then(async (claims) => {
        await socket.join([rooms.clinic(claims.clinicId), rooms.user(claims.sub)]);
        await socket.join(claims.branchIds.map(rooms.branchQueue));
        next();
      })
      .catch(() => {
        next(new Error('UNAUTHENTICATED'));
      });
  });

  const screen = io.of('/screen');
  screen.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: string }).token;
    if (!token) {
      next(new Error('UNAUTHENTICATED'));
      return;
    }
    db.system()
      .branch.findUnique({ where: { screenToken: token } })
      .then(async (branch) => {
        if (!branch?.isActive) throw new Error('revoked');
        await socket.join(rooms.branchQueue(branch.id));
        next();
      })
      .catch(() => {
        next(new Error('UNAUTHENTICATED'));
      });
  });

  const realtime: Realtime = {
    emit(room, event, payload) {
      io.to(room).emit(event, payload);
      screen.to(room).emit(event, payload);
    },
  };
  return { realtime, io };
}
