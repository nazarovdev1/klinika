import { createHash, randomBytes } from 'node:crypto';
import type { Role } from '@shifo/contracts';
import { jwtVerify, SignJWT } from 'jose';

export interface AccessClaims {
  sub: string;
  clinicId: string;
  role: Role;
  branchIds: string[];
  mcp: boolean;
}

const key = (secret: string): Uint8Array => new TextEncoder().encode(secret);

export function signAccessToken(
  claims: AccessClaims,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  return new SignJWT({
    clinicId: claims.clinicId,
    role: claims.role,
    branchIds: claims.branchIds,
    mcp: claims.mcp,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key(secret));
}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'] });
  return {
    sub: payload.sub ?? '',
    clinicId: payload.clinicId as string,
    role: payload.role as Role,
    branchIds: payload.branchIds as string[],
    mcp: payload.mcp as boolean,
  };
}

export const newRefreshToken = (): string => randomBytes(48).toString('base64url');
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
