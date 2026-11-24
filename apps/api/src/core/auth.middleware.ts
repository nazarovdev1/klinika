import { permissionsFor, type Permission } from '@shifo/contracts';
import type { Request, RequestHandler } from 'express';
import type { Env } from '../config/env.js';
import type { AuthContext } from './context.js';
import { AppError } from './errors.js';
import { verifyAccessToken } from './tokens.js';

export function authenticate(
  env: Env,
  opts: { allowMustChangePassword?: boolean } = {},
): RequestHandler {
  return (req, _res, next) => {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      next(new AppError(401, 'UNAUTHENTICATED', 'Missing access token'));
      return;
    }
    verifyAccessToken(token, env.JWT_ACCESS_SECRET)
      .then((claims) => {
        req.auth = {
          userId: claims.sub,
          clinicId: claims.clinicId,
          branchIds: claims.branchIds,
          role: claims.role,
          permissions: permissionsFor(claims.role),
          mustChangePassword: claims.mcp,
          ip: req.ip,
          userAgent: req.header('user-agent'),
          requestId: req.requestId,
        };
        if (claims.mcp && !opts.allowMustChangePassword) {
          next(new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Password change required'));
          return;
        }
        next();
      })
      .catch(() => {
        next(new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired access token'));
      });
  };
}

export function requirePermission(...needed: Permission[]): RequestHandler {
  return (req, _res, next) => {
    const auth = req.auth;
    if (!auth) {
      next(new AppError(401, 'UNAUTHENTICATED', 'Not authenticated'));
      return;
    }
    if (!needed.every((p) => auth.permissions.includes(p))) {
      next(new AppError(403, 'FORBIDDEN', 'Insufficient permissions'));
      return;
    }
    next();
  };
}

export function getAuth(req: Pick<Request, 'auth'>): AuthContext {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Not authenticated');
  return req.auth;
}
