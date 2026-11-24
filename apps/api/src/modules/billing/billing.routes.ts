import {
  closeShiftSchema,
  createInvoiceSchema,
  createPaymentSchema,
  createRefundSchema,
  invoiceListSchema,
  openShiftSchema,
  receiptQuerySchema,
  replaceInvoiceLinesSchema,
} from '@shifo/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { authenticate, getAuth, requirePermission } from '../../core/auth.middleware.js';
import { AppError } from '../../core/errors.js';
import type { PdfRenderer } from '../documents/pdf.js';
import type { BillingService } from './billing.service.js';
import { ONLINE_PROVIDERS, providerStub } from './providers.js';
import { renderReceiptHtml } from './receipt.template.js';

const idParam = z.object({ id: z.uuid() });
const keyHeader = z.string().trim().min(8).max(100);

export function billingRouter(env: Env, service: BillingService, renderer: PdfRenderer): Router {
  const router = Router();
  const read = [authenticate(env), requirePermission('billing:read')];
  const write = [authenticate(env), requirePermission('billing:write')];
  const refund = [authenticate(env), requirePermission('billing:refund')];

  router.get('/invoices', ...read, async (req, res) => {
    res.json(await service.listInvoices(getAuth(req), invoiceListSchema.parse(req.query)));
  });
  router.post('/invoices', ...write, async (req, res) => {
    res
      .status(201)
      .json(await service.createInvoice(getAuth(req), createInvoiceSchema.parse(req.body)));
  });
  router.get('/invoices/:id', ...read, async (req, res) => {
    res.json(await service.getInvoice(getAuth(req), idParam.parse(req.params).id));
  });
  router.put('/invoices/:id/lines', ...write, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(
      await service.replaceLines(getAuth(req), id, replaceInvoiceLinesSchema.parse(req.body)),
    );
  });
  router.post('/invoices/:id/issue', ...write, async (req, res) => {
    res.json(await service.issue(getAuth(req), idParam.parse(req.params).id));
  });
  router.post('/invoices/:id/void', ...write, async (req, res) => {
    res.json(await service.voidInvoice(getAuth(req), idParam.parse(req.params).id));
  });

  router.post('/invoices/:id/payments', ...write, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const key = keyHeader.safeParse(req.header('idempotency-key'));
    if (!key.success) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Idempotency-Key header is required', [
        { path: 'Idempotency-Key', message: 'required, 8-100 characters' },
      ]);
    }
    const out = await service.pay(getAuth(req), id, createPaymentSchema.parse(req.body), key.data);
    res.status(out.replayed ? 200 : 201).json(out.payment);
  });

  router.post('/invoices/:id/online-payments/:provider', ...write, async (req, res) => {
    const p = z.object({ id: z.uuid(), provider: z.enum(ONLINE_PROVIDERS) }).parse(req.params);
    await providerStub(p.provider).createCheckout(p.id, 0n);
    res.status(204).end();
  });

  router.post('/payments/:id/refunds', ...refund, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res
      .status(201)
      .json(await service.refund(getAuth(req), id, createRefundSchema.parse(req.body)));
  });

  router.get('/payments/:id/receipt', ...read, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { lang } = receiptQuerySchema.parse(req.query);
    const { pay, inv, clinic, cashier } = await service.receiptData(getAuth(req), id);
    const html = renderReceiptHtml({
      lang,
      timeZone: 'Asia/Tashkent',
      clinicName: clinic.name,
      invoiceNumber: inv.number,
      cashierName: cashier.fullName,
      method: pay.method,
      paidAt: pay.createdAt,
      lines: inv.lines.map((l) => ({ description: l.description, qty: l.qty, total: l.total })),
      total: inv.total,
      amount: pay.amount,
      balance: inv.total - inv.paidAmount,
    });
    const pdf = await renderer.render(html, { widthMm: 80 });
    res
      .status(200)
      .type('application/pdf')
      .setHeader('content-disposition', `inline; filename="receipt-${id}.pdf"`)
      .send(pdf);
  });

  router.post('/cash-shifts', ...write, async (req, res) => {
    res.status(201).json(await service.openShift(getAuth(req), openShiftSchema.parse(req.body)));
  });
  router.get('/cash-shifts/current', ...read, async (req, res) => {
    res.json({ shift: await service.currentShift(getAuth(req)) });
  });
  router.post('/cash-shifts/current/close', ...write, async (req, res) => {
    res.json(await service.closeShift(getAuth(req), closeShiftSchema.parse(req.body)));
  });

  return router;
}
