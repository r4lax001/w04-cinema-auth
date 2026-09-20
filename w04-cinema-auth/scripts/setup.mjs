import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const envPath = path.join(root, '.env');
let content = readFileSync(existsSync(envPath) ? envPath : path.join(root, '.env.example'), 'utf8');
if (!/^JWT_SECRET=.+$/m.test(content)) {
  const line = `JWT_SECRET=${randomBytes(48).toString('hex')}`;
  content = /^JWT_SECRET=.*$/m.test(content)
    ? content.replace(/^JWT_SECRET=.*$/m, line)
    : `${content}\n${line}\n`;
  writeFileSync(envPath, content, { mode: 0o600 });
  console.log('Created local .env with a random JWT signing secret.');
} else if (!existsSync(envPath)) {
  writeFileSync(envPath, content, { mode: 0o600 });
}
