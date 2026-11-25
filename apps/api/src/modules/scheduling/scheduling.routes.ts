import {
  appointmentQuerySchema,
  createAppointmentSchema,
  exceptionInputSchema,
  scheduleInputSchema,
  setAppointmentStatusSchema,
  slotsQuerySchema,
  updateAppointmentSchema,
} from '@shifo/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { authenticate, getAuth, requirePermission } from '../../core/auth.middleware.js';
import type { SchedulingService } from './scheduling.service.js';

const idParam = z.object({ id: z.uuid() });

export function schedulingRouter(env: Env, service: SchedulingService): Router {
  const router = Router();
  const read = [authenticate(env), requirePermission('scheduling:read')];
  const write = [authenticate(env), requirePermission('scheduling:write')];
  // Schedules/exceptions are configuration: settings:manage.
  const manage = [authenticate(env), requirePermission('settings:manage')];

  // Doctor directory for the calendar/booking UI (registrars cannot list staff).
  router.get('/doctors', ...read, async (req, res) => {
    const ctx = getAuth(req);
    const users = await service.listDoctors(ctx);
    res.json({ items: users });
  });
  router.get('/doctors/:id/schedules', ...read, async (req, res) => {
    res.json({ items: await service.listSchedules(getAuth(req), idParam.parse(req.params).id) });
  });
  router.post('/doctors/:id/schedules', ...manage, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res
      .status(201)
      .json(await service.createSchedule(getAuth(req), id, scheduleInputSchema.parse(req.body)));
  });
  router.delete('/schedules/:id', ...manage, async (req, res) => {
    await service.deleteSchedule(getAuth(req), idParam.parse(req.params).id);
    res.status(204).end();
  });
  router.get('/doctors/:id/exceptions', ...read, async (req, res) => {
    res.json({ items: await service.listExceptions(getAuth(req), idParam.parse(req.params).id) });
  });
  router.post('/doctors/:id/exceptions', ...manage, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res
      .status(201)
      .json(await service.createException(getAuth(req), id, exceptionInputSchema.parse(req.body)));
  });
  router.get('/doctors/:id/slots', ...read, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const q = slotsQuerySchema.parse(req.query);
    res.json({ items: await service.slots(getAuth(req), id, q.date, q.branchId) });
  });

  router.get('/appointments', ...read, async (req, res) => {
    res.json(await service.list(getAuth(req), appointmentQuerySchema.parse(req.query)));
  });
  router.post('/appointments', ...write, async (req, res) => {
    res
      .status(201)
      .json(await service.create(getAuth(req), createAppointmentSchema.parse(req.body)));
  });
  router.patch('/appointments/:id', ...write, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await service.update(getAuth(req), id, updateAppointmentSchema.parse(req.body)));
  });
  // Doctors may start/complete their own appointments; the service enforces ownership.
  router.post(
    '/appointments/:id/status',
    authenticate(env),
    requirePermission('scheduling:read'),
    async (req, res) => {
      const { id } = idParam.parse(req.params);
      const body = setAppointmentStatusSchema.parse(req.body);
      const auth = getAuth(req);
      if (auth.role !== 'DOCTOR' && !auth.permissions.includes('scheduling:write')) {
        res.status(403).type('application/problem+json').json({
          type: 'about:blank',
          title: 'Forbidden',
          status: 403,
          code: 'FORBIDDEN',
          requestId: req.requestId,
        });
        return;
      }
      res.json(await service.setStatus(auth, id, body.version, body.status));
    },
  );
  return router;
}
