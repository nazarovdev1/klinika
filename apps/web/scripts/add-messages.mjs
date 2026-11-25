// Merges a compact translation file into messages/uz.json and messages/ru.json.
// Input format: { "namespace": { "key": ["uz text", "ru text"] } }
// Usage: node scripts/add-messages.mjs path/to/file.json
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, stdout } from 'node:process';

const input = JSON.parse(readFileSync(argv[2], 'utf8'));
for (const [i, locale] of ['uz', 'ru'].entries()) {
  const path = new URL(`../messages/${locale}.json`, import.meta.url);
  const messages = JSON.parse(readFileSync(path, 'utf8'));
  for (const [ns, keys] of Object.entries(input)) {
    messages[ns] = { ...messages[ns], ...Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, v[i]])) };
  }
  writeFileSync(path, JSON.stringify(messages, null, 2) + '\n');
}
stdout.write('messages merged\n');
