import type { Db } from '@shifo/db';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Env } from '../../config/env.js';
import { authenticate } from '../../core/auth.middleware.js';
import { authController } from './auth.controller.js';
import { authRepository } from './auth.repository.js';
import { authService } from './auth.service.js';

export function authRouter(env: Env, db: Db): Router {
  const router = Router();
  const c = authController(authService(authRepository(db), env), env);

  const loginLimiter = rateLimit({
    windowMs: 60_000,
    limit: env.LOGIN_RATE_LIMIT,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // per IP + login
    keyGenerator: (req) => {
      const body = req.body as { login?: unknown } | undefined;
      const login = typeof body?.login === 'string' ? body.login.toLowerCase() : '';
      return `${req.ip ?? 'unknown'}|${login}`;
    },
    validate: { keyGeneratorIpFallback: false },
    handler: (req, res) => {
      res.status(429).type('application/problem+json').json({
        type: 'about:blank',
        title: 'Too many attempts',
        status: 429,
        code: 'RATE_LIMITED',
        requestId: req.requestId,
      });
    },
  });

  const mayChange = authenticate(env, { allowMustChangePassword: true });
  router.post('/login', loginLimiter, c.login);
  router.post('/refresh', c.refresh);
  router.post('/logout', c.logout);
  router.post('/change-password', mayChange, c.changePassword);
  router.get('/me', mayChange, c.me);
  return router;
}
