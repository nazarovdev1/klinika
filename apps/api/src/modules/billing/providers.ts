import { AppError } from '../../core/errors.js';

/**
 * Online payment providers. TODO(external-spec): the Click, Payme and Uzum merchant APIs (signing,
 * callbacks, statuses) are not specified in the brief, so nothing here is invented: each provider is a
 * stub that reports "not implemented". The Payment model already carries `method` and `providerRef`.
 */
export const ONLINE_PROVIDERS = ['CLICK', 'PAYME', 'UZUM'] as const;
export type OnlineProvider = (typeof ONLINE_PROVIDERS)[number];

export interface PaymentProvider {
  readonly name: OnlineProvider;
  createCheckout(invoiceId: string, amount: bigint): Promise<{ url: string }>;
}

export function providerStub(name: OnlineProvider): PaymentProvider {
  return {
    name,
    createCheckout() {
      return Promise.reject(
        new AppError(
          501,
          'NOT_IMPLEMENTED',
          `${name} integration is not configured (TODO(external-spec))`,
        ),
      );
    },
  };
}
