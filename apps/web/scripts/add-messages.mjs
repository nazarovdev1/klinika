// Merges a compact translation file into messages/uz.json and messages/ru.json.
// Input format: { "namespace": { "key": ["uz text", "ru text"] } }; dotted keys become nested objects
// (next-intl resolves "status.BOOKED" as messages.status.BOOKED).
// Usage: node scripts/add-messages.mjs path/to/file.json   (no argument = just normalize the files)
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, stdout } from 'node:process';
import { URL } from 'node:url';

function setDeep(obj, dotted, value) {
  const parts = dotted.split('.');
  let cur = obj;
  for (const p of parts.slice(0, -1)) {
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {};
    cur = cur[p];
  }
  cur[parts.at(-1)] = value;
}

function normalize(node) {
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    setDeep(out, k, typeof v === 'object' && v !== null ? normalize(v) : v);
  }
  return out;
}

const input = argv[2] ? JSON.parse(readFileSync(argv[2], 'utf8')) : {};
for (const [i, locale] of ['uz', 'ru'].entries()) {
  const path = new URL(`../messages/${locale}.json`, import.meta.url);
  const messages = JSON.parse(readFileSync(path, 'utf8'));
  for (const [ns, keys] of Object.entries(input)) {
    messages[ns] ??= {};
    for (const [k, v] of Object.entries(keys)) messages[ns][k] = v[i];
  }
  writeFileSync(path, JSON.stringify(normalize(messages), null, 2) + '\n');
}
stdout.write('messages merged\n');
