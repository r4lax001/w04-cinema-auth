import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, transaction } from '../db.mjs';
import { API_ORIGIN, CLIENTS, OAUTH_TTL } from '../config.mjs';
import { randomToken, hash, challenge, equal, now, escapeHtml as esc } from '../lib/security.mjs';

export const oauthRoutes = Router();
const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: false, path: '/oauth/authorize' };
const fail = (res, error, description, status = 400) => res.status(status).json({ error, error_description: description });
function redirectResult(res, request, values) {
  const target = new URL(request.redirect_uri);
  for (const [key, value] of Object.entries({ ...values, state: request.state })) target.searchParams.set(key, value);
  res.redirect(303, target.href);
}
function consentPage(requestId, request, error = '') {
  const client = CLIENTS[request.client_id];
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>อนุญาตการเข้าถึง | Cinema Auth</title><link rel="stylesheet" href="/style.css"></head><body>
    <main class="narrow"><p class="eyebrow">CINEMA AUTH · AUTHORIZATION SERVER</p><h1>อนุญาตให้แอปเข้าถึงข้อมูล</h1>
    <section class="card"><h2>${esc(client.name)}</h2><p>แอปนี้ขอสิทธิ์ต่อไปนี้จากบัญชีของคุณ</p>
    <ul>${request.scope.split(' ').map(scope => `<li><code>${esc(scope)}</code></li>`).join('')}</ul>
    <p>กรอกรหัสผ่านบน Cinema Auth เพื่อยืนยันตัวตน แล้วเลือกอนุญาตหรือปฏิเสธ</p>
    ${client.adminOnly ? '<p><strong>แอปภายในนี้ใช้ได้เฉพาะบัญชี admin</strong></p>' : ''}
    <p class="error" role="alert">${esc(error)}</p><form action="/oauth/authorize" method="post">
    <input type="hidden" name="request_id" value="${esc(requestId)}">
    <label>Username<input name="username" autocomplete="username" maxlength="30"></label>
    <label>Password<input name="password" type="password" autocomplete="current-password"></label>
    <div class="actions"><button name="decision" value="approve">อนุญาต</button>
    <button class="secondary" name="decision" value="deny" formnovalidate>ปฏิเสธ</button></div></form>
    <p class="muted">รหัสผ่านจะถูกตรวจโดย Cinema Auth และไม่ส่งไปให้แอปที่ขอสิทธิ์</p></section></main></body></html>`;
}

// ขั้นที่ 1: ตรวจ client, callback, scope, state และ PKCE ก่อนแสดงหน้า login/consent.
oauthRoutes.get('/authorize', (req, res) => {
  const { client_id, redirect_uri, response_type, scope, state, code_challenge, code_challenge_method } = req.query;
  const client = typeof client_id === 'string' && Object.hasOwn(CLIENTS, client_id) ? CLIENTS[client_id] : null;
  if (!client || redirect_uri !== client.redirectUri) return fail(res, 'invalid_request', 'Unknown client or redirect_uri mismatch');
  const request = { client_id, redirect_uri, state: typeof state === 'string' ? state : '' };
  if (response_type !== 'code') return redirectResult(res, request, { error: 'unsupported_response_type' });
  if (typeof state !== 'string' || state.length < 16 || state.length > 256 ||
    code_challenge_method !== 'S256' || typeof code_challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code_challenge)) {
    return redirectResult(res, request, { error: 'invalid_request', error_description: 'Require random state and S256 PKCE challenge' });
  }
  const scopes = typeof scope === 'string' ? [...new Set(scope.trim().split(/\s+/))] : [];
  if (!scopes.length || scopes.some(item => !client.scopes.includes(item))) {
    return redirectResult(res, request, { error: 'invalid_scope' });
  }
  request.scope = scopes.join(' ');
  const requestId = randomToken();
  const browserToken = randomToken();
  db.prepare('DELETE FROM oauth_requests WHERE expires_at <= ?').run(now());
  db.prepare(`INSERT INTO oauth_requests
    (request_hash, browser_hash, client_id, redirect_uri, scope, state, code_challenge, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(hash(requestId), hash(browserToken), client_id, redirect_uri, request.scope, state, code_challenge, now() + 600);
  res.cookie('cinema_oauth_browser', browserToken, { ...cookieOptions, maxAge: 600000 });
  res.type('html').send(consentPage(requestId, request));
});

// ขั้นที่ 2: ตรวจรหัสผ่านและความยินยอม ออก authorization code อายุ 2 นาที ใช้ได้ครั้งเดียว.
oauthRoutes.post('/authorize', async (req, res) => {
  const { request_id, username, password, decision } = req.body || {};
  if (typeof request_id !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(request_id)) return fail(res, 'invalid_request', 'Invalid consent request');
  const request = db.prepare('SELECT * FROM oauth_requests WHERE request_hash = ?').get(hash(request_id));
  const browserToken = /(?:^|;\s*)cinema_oauth_browser=([^;]+)/.exec(req.get('cookie') || '')?.[1];
  if (!request || request.expires_at <= now() || !browserToken || !equal(hash(browserToken), request.browser_hash) || req.get('origin') !== API_ORIGIN) {
    return fail(res, 'invalid_request', 'Consent expired or browser verification failed. Start again.');
  }
  const client = CLIENTS[request.client_id];
  if (!client) return fail(res, 'invalid_client', 'Unknown client');
  if (decision === 'deny') {
    db.prepare('DELETE FROM oauth_requests WHERE request_hash = ?').run(request.request_hash);
    res.clearCookie('cinema_oauth_browser', cookieOptions);
    return redirectResult(res, request, { error: 'access_denied' });
  }
  if (decision !== 'approve' || typeof username !== 'string' || typeof password !== 'string' || Buffer.byteLength(password) > 72) {
    return res.status(400).type('html').send(consentPage(request_id, request, 'กรอก username และ password ให้ถูกต้อง'));
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user || !await bcrypt.compare(password, user.password_hash)) {
    return res.status(401).type('html').send(consentPage(request_id, request, 'username หรือ password ไม่ถูกต้อง'));
  }
  if (client.adminOnly && user.role !== 'admin') {
    return res.status(403).type('html').send(consentPage(request_id, request, 'แอปนี้อนุญาตเฉพาะบัญชี admin'));
  }
  const code = randomToken();
  const created = transaction(() => {
    const removed = db.prepare('DELETE FROM oauth_requests WHERE request_hash = ? AND expires_at > ?').run(request.request_hash, now());
    if (removed.changes !== 1) return false;
    db.prepare(`INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, scope, code_challenge, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(hash(code), request.client_id, user.id, request.redirect_uri, request.scope, request.code_challenge, now() + 120);
    return true;
  });
  if (!created) return fail(res, 'invalid_request', 'Consent already used or expired');
  res.clearCookie('cinema_oauth_browser', cookieOptions);
  redirectResult(res, request, { code });
});

// ขั้นที่ 3: client แลก code + code_verifier เป็น OAuth Access Token.
oauthRoutes.post('/token', (req, res) => {
  const { grant_type, client_id, redirect_uri, code, code_verifier } = req.body || {};
  if (grant_type !== 'authorization_code') return fail(res, 'unsupported_grant_type', 'Use authorization_code');
  const client = typeof client_id === 'string' && Object.hasOwn(CLIENTS, client_id) ? CLIENTS[client_id] : null;
  if (!client) return fail(res, 'invalid_client', 'Unknown client');
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code) || typeof code_verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(code_verifier)) {
    return fail(res, 'invalid_grant', 'Invalid code or verifier');
  }
  const row = db.prepare('SELECT * FROM oauth_codes WHERE code_hash = ?').get(hash(code));
  if (!row || row.client_id !== client_id || row.redirect_uri !== redirect_uri || redirect_uri !== client.redirectUri ||
    !equal(challenge(code_verifier), row.code_challenge)) return fail(res, 'invalid_grant', 'Code or PKCE verification failed');
  // เมื่อพบการใช้ code ซ้ำ ให้ยกเลิก token ที่ออกจาก code นั้นด้วย.
  if (row.used) {
    db.prepare('UPDATE oauth_tokens SET revoked = 1 WHERE code_hash = ?').run(row.code_hash);
    return fail(res, 'invalid_grant', 'Authorization code was already used');
  }
  if (row.expires_at <= now()) return fail(res, 'invalid_grant', 'Authorization code expired');
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(row.user_id);
  if (!user || (client.adminOnly && user.role !== 'admin')) return fail(res, 'invalid_grant', 'User is no longer authorized');
  const accessToken = `oa_${randomToken()}`;
  transaction(() => {
    db.prepare('UPDATE oauth_codes SET used = 1 WHERE code_hash = ?').run(row.code_hash);
    db.prepare(`INSERT INTO oauth_tokens (token_hash, code_hash, client_id, user_id, scope, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(hash(accessToken), row.code_hash, client_id, row.user_id, row.scope, now() + OAUTH_TTL);
  });
  res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: OAUTH_TTL, scope: row.scope });
});

// ยกเลิก token ของ client ที่ออกให้ โดยไม่เปิดเผยว่า token ใดมีอยู่จริง.
oauthRoutes.post('/revoke', (req, res) => {
  const { token, client_id } = req.body || {};
  if (typeof client_id !== 'string' || !Object.hasOwn(CLIENTS, client_id)) return fail(res, 'invalid_client', 'Unknown client');
  if (typeof token !== 'string') return fail(res, 'invalid_request', 'token is required');
  db.prepare('UPDATE oauth_tokens SET revoked = 1 WHERE token_hash = ? AND client_id = ?').run(hash(token), client_id);
  res.status(200).end();
});
