import { writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';

const id = createHash('sha256')
  .update(`${Date.now()}-${randomUUID()}`)
  .digest('hex')
  .slice(0, 16);

mkdirSync('public', { recursive: true });
writeFileSync(
  'public/build-id.json',
  JSON.stringify({ id, builtAt: new Date().toISOString() }),
);
console.log('[build-id]', id);
