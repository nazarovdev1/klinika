// Fails when a translation key used in a component is missing, or uz/ru differ.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exit, stdout } from 'node:process';
import { URL } from 'node:url';

const load = (l) =>
  JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));
const uz = load('uz');
const ru = load('ru');
const flat = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`],
  );
const get = (o, path) =>
  path.split('.').reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), o);

let bad = 0;
const fail = (m) => {
  bad++;
  stdout.write(`${m}\n`);
};
const a = new Set(flat(uz));
const b = new Set(flat(ru));
for (const k of a) if (!b.has(k)) fail(`missing in ru: ${k}`);
for (const k of b) if (!a.has(k)) fail(`missing in uz: ${k}`);

const files = [];
(function walk(d) {
  for (const f of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (p.endsWith('.tsx')) files.push(p);
  }
})(new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

for (const f of files) {
  const s = readFileSync(f, 'utf8');
  const vars = {};
  for (const m of s.matchAll(/const (\w+) = useTranslations\('(\w+)'\)/g)) vars[m[1]] = m[2];
  for (const [v, ns] of Object.entries(vars)) {
    const re = new RegExp(`\\b${v}\\(\\s*'([\\w.]+)'`, 'g');
    for (const m of s.matchAll(re))
      if (get(uz[ns], m[1]) === undefined) fail(`${f}: ${ns}.${m[1]}`);
    // dynamic keys like t(`status.${x}`) -> check that the prefix exists as an object
    const dyn = new RegExp(`\\b${v}\\(\\s*\`([\\w.]+)\\.\\$\\{`, 'g');
    for (const m of s.matchAll(dyn))
      if (typeof get(uz[ns], m[1]) !== 'object') fail(`${f}: ${ns}.${m[1]}.*`);
  }
}
stdout.write(bad ? `${bad} problem(s)\n` : 'messages ok\n');
exit(bad ? 1 : 0);
