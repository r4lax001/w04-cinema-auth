import { loadEnvFile } from 'node:process';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');
loadEnvFile(path.join(ROOT, '.env'));
const number = (name, fallback, min, max) => {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  return value;
};
export const API_PORT = number('API_PORT', 3000, 1024, 65535);
export const CLIENT_PORT = number('CLIENT_PORT', 3001, 1024, 65535);
if (API_PORT === CLIENT_PORT) throw new Error('API_PORT and CLIENT_PORT must differ.');
export const API_ORIGIN = `http://localhost:${API_PORT}`;
export const CLIENT_ORIGIN = `http://localhost:${CLIENT_PORT}`;
export const JWT_SECRET = process.env.JWT_SECRET || '';
if (JWT_SECRET.length < 32) throw new Error('JWT_SECRET must contain at least 32 random characters. Run npm run setup.');
export const JWT_TTL = number('JWT_TTL_SECONDS', 3600, 30, 86400);
export const OAUTH_TTL = number('OAUTH_TTL_SECONDS', 900, 30, 3600);

// สองแอปจำลองเป็น browser client จึงใช้ PKCE และไม่มี client_secret ใน JavaScript.
export const CLIENTS = {
  'cinema-partner': {
    name: 'Cinema Partner (แอปภายนอก)',
    redirectUri: `${CLIENT_ORIGIN}/callback`,
    scopes: ['profile:read', 'bookings:read', 'bookings:write'],
    adminOnly: false
  },
  'cinema-office': {
    name: 'Cinema Office (ระบบภายใน)',
    redirectUri: `${CLIENT_ORIGIN}/callback`,
    scopes: ['users:read', 'bookings:read:all', 'reports:read'],
    adminOnly: true
  }
};
