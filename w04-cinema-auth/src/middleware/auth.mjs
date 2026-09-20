import jwt from 'jsonwebtoken';
import { db } from '../db.mjs';
import { API_ORIGIN, JWT_SECRET, CLIENTS } from '../config.mjs';
import { bearer, hash, now, httpError } from '../lib/security.mjs';

function resolveUser(req) {
  const token = bearer(req);
  // OAuth ใช้ opaque token; JWT ของระบบสมาชิกมีการตรวจลายเซ็น/issuer/audience แยกกัน.
  if (token.startsWith('oa_')) {
    const row = db.prepare(`SELECT t.*, u.username, u.role FROM oauth_tokens t
      JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?`).get(hash(token));
    if (!row || row.revoked || row.expires_at <= now() || !CLIENTS[row.client_id]) {
      throw httpError(401, 'OAuth Access Token ไม่ถูกต้อง หมดอายุ หรือถูกยกเลิก');
    }
    return { id: row.user_id, username: row.username, role: row.role,
      kind: 'oauth', clientId: row.client_id, scopes: row.scope.split(' ') };
  }
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'], issuer: API_ORIGIN, audience: 'cinema-member-api'
    });
  } catch {
    throw httpError(401, 'JWT ไม่ถูกต้องหรือหมดอายุ');
  }
  if (payload.token_use !== 'member' || !/^\d+$/.test(payload.sub || '')) {
    throw httpError(401, 'JWT ประเภทไม่ถูกต้อง');
  }
  const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(Number(payload.sub));
  if (!user) throw httpError(401, 'ไม่พบบัญชีผู้ใช้');
  return { ...user, kind: 'jwt', scopes: [] };
}

export function memberAccess(scope) {
  return (req, res, next) => {
    req.user = resolveUser(req);
    if (req.user.kind === 'oauth' && !req.user.scopes.includes(scope)) {
      throw httpError(403, `OAuth Token ไม่มีสิทธิ์ ${scope}`);
    }
    next();
  };
}

export function officeAccess(scope) {
  return (req, res, next) => {
    req.user = resolveUser(req);
    if (req.user.kind !== 'oauth' || req.user.clientId !== 'cinema-office' ||
        req.user.role !== 'admin' || !req.user.scopes.includes(scope)) {
      throw httpError(403, `ต้องใช้ OAuth ของ Cinema Office, บัญชี admin และสิทธิ์ ${scope}`);
    }
    next();
  };
}
