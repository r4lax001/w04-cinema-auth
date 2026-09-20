import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const now = () => Math.floor(Date.now() / 1000);
export const randomToken = () => randomBytes(32).toString('base64url');
export const hash = value => createHash('sha256').update(value).digest('hex');
export const challenge = value => createHash('sha256').update(value).digest('base64url');
export function equal(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}
export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
export function bearer(req) {
  const match = /^Bearer ([^\s]+)$/i.exec(req.get('authorization') || '');
  if (!match) throw httpError(401, 'ต้องส่ง Authorization: Bearer <token>');
  return match[1];
}
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}
