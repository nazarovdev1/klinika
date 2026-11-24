import { z } from 'zod';

export const ROLES = ['OWNER', 'ADMIN', 'REGISTRAR', 'DOCTOR', 'NURSE', 'CASHIER', 'LAB'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/**
 * Permission strings, defined once. The role -> permission mapping
 * is added in Phase 1 together with docs/rbac-matrix.md.
 */
export const PERMISSIONS = [
  'patients:read',
  'patients:write',
  'encounters:read',
  'encounters:write',
  'billing:read',
  'billing:write',
  'billing:refund',
  'lab:write',
  'lab:validate',
  'reports:read',
  'staff:manage',
  'settings:manage',
] as const;
export const permissionSchema = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof permissionSchema>;
