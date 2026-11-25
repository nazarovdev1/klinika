// Regenerates the permission table in docs/rbac-matrix.md from ROLE_PERMISSIONS (the source of truth).
// Usage: pnpm docs:rbac   (needs `pnpm --filter @shifo/contracts build`)
import { readFileSync, writeFileSync } from 'node:fs';
import { stdout } from 'node:process';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from '../packages/contracts/dist/index.js';

const file = new URL('../docs/rbac-matrix.md', import.meta.url);
const text = readFileSync(file, 'utf8');
const pad = (s, n) => s.padEnd(n);
const width = Math.max(...PERMISSIONS.map((p) => p.length), 10);
const head = `| ${pad('Permission', width)} | ${ROLES.map((r) => r.padEnd(9)).join(' | ')} |`;
const sep = `| ${'-'.repeat(width)} | ${ROLES.map(() => ':-------:').join(' | ')} |`;
const rows = PERMISSIONS.map(
  (p) =>
    `| ${pad(p, width)} | ${ROLES.map((r) => (ROLE_PERMISSIONS[r].includes(p) ? 'x' : ' ').padStart(5).padEnd(9)).join(' | ')} |`,
);
const table = [head, sep, ...rows].join('\n');
const start = '<!-- rbac:begin -->';
const end = '<!-- rbac:end -->';
const next = text.includes(start)
  ? text.replace(new RegExp(`${start}[\\s\\S]*?${end}`), `${start}\n${table}\n${end}`)
  : text.replace(/\| Permission[\s\S]*?\n\n/, `${start}\n${table}\n${end}\n\n`);
writeFileSync(file, next);
stdout.write('docs/rbac-matrix.md updated\n');
