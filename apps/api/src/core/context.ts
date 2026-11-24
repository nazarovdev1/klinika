import type { Permission, Role } from '@shifo/contracts';

export interface AuthContext {
  userId: string;
  clinicId: string;
  branchIds: string[];
  role: Role;
  permissions: readonly Permission[];
  mustChangePassword: boolean;
  ip?: string;
  userAgent?: string;
  requestId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
