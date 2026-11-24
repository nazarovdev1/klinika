import type { Db } from '@shifo/db';
import { catalogService } from '../../catalog/catalog.service.js';

/** Test helper: asks the catalog service for the price in force at an instant. */
export class CatalogProbe {
  constructor(
    private readonly db: Db,
    private readonly clinicId: string,
  ) {}

  async priceAt(serviceId: string, branchId: string, at: string): Promise<string | null> {
    const ctx = {
      userId: '00000000-0000-0000-0000-000000000000',
      clinicId: this.clinicId,
      branchIds: [branchId],
      role: 'OWNER' as const,
      permissions: [],
      mustChangePassword: false,
      requestId: 'probe',
    };
    const p = await catalogService(this.db).activePrice(ctx, serviceId, branchId, new Date(at));
    return p?.price ?? null;
  }
}
