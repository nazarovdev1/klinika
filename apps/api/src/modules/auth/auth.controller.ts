import { changePasswordRequestSchema, loginRequestSchema } from '@shifo/contracts';
import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import type { Env } from '../../config/env.js';
import { getAuth } from '../../core/auth.middleware.js';
import type { AuthService } from './auth.service.js';

export const REFRESH_COOKIE = 'refresh_token';

const meta = (req: Request) => ({
  ip: req.ip,
  userAgent: req.header('user-agent'),
  requestId: req.requestId,
});

export function authController(service: AuthService, env: Env) {
  const cookieOptions = (): CookieOptions => ({
    httpOnly: true,
    secure: env.COOKIE_SECURE || env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: env.REFRESH_TTL_DAYS * 86_400_000,
  });
  const send = (
    res: Response,
    result: { response: unknown; refreshToken: string },
    status = 200,
  ) => {
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions());
    res.status(status).json(result.response);
  };
  const refreshCookie = (req: Request): string | undefined =>
    (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE];

  return {
    login: (async (req, res) => {
      const body = loginRequestSchema.parse(req.body);
      send(res, await service.login(body.login, body.password, meta(req)));
    }) satisfies RequestHandler,
    refresh: (async (req, res) => {
      send(res, await service.refresh(refreshCookie(req), meta(req)));
    }) satisfies RequestHandler,
    logout: (async (req, res) => {
      await service.logout(refreshCookie(req));
      res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
      res.status(204).end();
    }) satisfies RequestHandler,
    changePassword: (async (req, res) => {
      const body = changePasswordRequestSchema.parse(req.body);
      const auth = getAuth(req);
      send(
        res,
        await service.changePassword(
          auth.userId,
          body.currentPassword,
          body.newPassword,
          meta(req),
        ),
      );
    }) satisfies RequestHandler,
    me: (async (req, res) => {
      res.json(await service.me(getAuth(req).userId));
    }) satisfies RequestHandler,
  };
}
