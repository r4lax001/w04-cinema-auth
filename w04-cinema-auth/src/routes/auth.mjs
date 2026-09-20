import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db.mjs';
import { JWT_SECRET, JWT_TTL, API_ORIGIN } from '../config.mjs';
import { httpError } from '../lib/security.mjs';

export const authRoutes = Router();
function credentials(body) {
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = body?.password;
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) throw httpError(400, 'username ใช้ a-z, A-Z, 0-9, _ จำนวน 3-30 ตัว');
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    throw httpError(400, 'password ต้องมีอย่างน้อย 8 ตัว และไม่เกิน 72 bytes');
  }
  return { username, password };
}
function response(user) {
  const token = jwt.sign({ role: user.role, token_use: 'member' }, JWT_SECRET, {
    algorithm: 'HS256', subject: String(user.id), issuer: API_ORIGIN,
    audience: 'cinema-member-api', expiresIn: JWT_TTL
  });
  return { token, token_type: 'Bearer', expires_in: JWT_TTL,
    user: { id: user.id, username: user.username, role: user.role } };
}

authRoutes.post('/register', async (req, res) => {
  const { username, password } = credentials(req.body);
  const passwordHash = await bcrypt.hash(password, 12);
  // ไม่รับ role จากผู้สมัคร: ทุกบัญชีใหม่เป็น member เสมอ.
  let result;
  try {
    result = db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'member')").run(username, passwordHash);
  } catch (error) {
    if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) throw httpError(409, 'username นี้มีผู้ใช้แล้ว');
    throw error;
  }
  res.status(201).json(response({ id: Number(result.lastInsertRowid), username, role: 'member' }));
});

authRoutes.post('/login', async (req, res) => {
  const { username, password } = credentials(req.body);
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !await bcrypt.compare(password, user.password_hash)) throw httpError(401, 'username หรือ password ไม่ถูกต้อง');
  res.json(response(user));
});
