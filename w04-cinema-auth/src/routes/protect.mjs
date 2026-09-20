import { Router } from 'express';
import { db, transaction } from '../db.mjs';
import { memberAccess } from '../middleware/auth.mjs';
import { httpError } from '../lib/security.mjs';

export const protectRoutes = Router();

// Protect API 1: JWT ของสมาชิก หรือ OAuth ที่ได้รับ profile:read.
protectRoutes.get('/profile', memberAccess('profile:read'), (req, res) => {
  const user = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json({ user, authenticated_by: req.user.kind });
});

// Protect API 2: อ่านเฉพาะการจองของเจ้าของ token ไม่รับ user_id จาก client.
protectRoutes.get('/bookings', memberAccess('bookings:read'), (req, res) => {
  const bookings = db.prepare(`SELECT b.*, m.title, s.starts_at, s.hall
    FROM bookings b JOIN showtimes s ON s.id = b.showtime_id JOIN movies m ON m.id = s.movie_id
    WHERE b.user_id = ? ORDER BY b.id DESC`).all(req.user.id);
  res.json({ bookings });
});

// Protect API 3: สร้างการจอง โดยคำนวณราคาที่ server และจองตั๋วใน transaction.
protectRoutes.post('/bookings', memberAccess('bookings:write'), (req, res) => {
  const { showtime_id, quantity } = req.body || {};
  if (!Number.isSafeInteger(showtime_id) || showtime_id < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 6) {
    throw httpError(400, 'ส่ง showtime_id เป็นเลขจำนวนเต็มบวก และ quantity เป็นเลข 1-6');
  }
  const booking = transaction(() => {
    const show = db.prepare('SELECT * FROM showtimes WHERE id = ?').get(showtime_id);
    if (!show) throw httpError(404, 'ไม่พบรอบฉาย');
    if (Date.parse(show.starts_at) <= Date.now()) throw httpError(409, 'รอบฉายนี้เริ่มแล้ว');
    const { sold } = db.prepare('SELECT COALESCE(SUM(quantity), 0) AS sold FROM bookings WHERE showtime_id = ?').get(showtime_id);
    if (sold + quantity > show.capacity) throw httpError(409, 'จำนวนตั๋วไม่พอ');
    const result = db.prepare('INSERT INTO bookings (user_id, showtime_id, quantity, total_baht) VALUES (?, ?, ?, ?)')
      .run(req.user.id, showtime_id, quantity, quantity * show.price_baht);
    return db.prepare('SELECT * FROM bookings WHERE id = ?').get(Number(result.lastInsertRowid));
  });
  res.status(201).json({ booking });
});
