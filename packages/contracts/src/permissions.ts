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

const ALL = PERMISSIONS;

/** Role -> permissions (MVP; no custom roles). Mirrored in docs/rbac-matrix.md. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL,
  REGISTRAR: ['patients:read', 'patients:write', 'billing:read', 'billing:write'],
  DOCTOR: ['patients:read', 'encounters:read', 'encounters:write', 'lab:write'],
  NURSE: ['patients:read', 'encounters:read', 'lab:write'],
  CASHIER: ['patients:read', 'billing:read', 'billing:write', 'billing:refund'],
  LAB: ['patients:read', 'lab:write', 'lab:validate'],
};

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
