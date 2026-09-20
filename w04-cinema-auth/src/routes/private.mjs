import { Router } from 'express';
import { db } from '../db.mjs';
import { officeAccess } from '../middleware/auth.mjs';

export const privateRoutes = Router();

// Private API ทั้งสามต้องเป็น admin + OAuth ของ cinema-office + scope ที่ตรงกัน.
privateRoutes.get('/users', officeAccess('users:read'), (req, res) => {
  res.json({ users: db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id').all() });
});

privateRoutes.get('/bookings', officeAccess('bookings:read:all'), (req, res) => {
  const bookings = db.prepare(`SELECT b.*, u.username, m.title, s.starts_at, s.hall FROM bookings b
    JOIN users u ON u.id = b.user_id JOIN showtimes s ON s.id = b.showtime_id
    JOIN movies m ON m.id = s.movie_id ORDER BY b.id DESC`).all();
  res.json({ bookings });
});

privateRoutes.get('/summary', officeAccess('reports:read'), (req, res) => {
  const summary = db.prepare(`SELECT COUNT(*) AS booking_count, COALESCE(SUM(quantity), 0) AS tickets_sold,
    COALESCE(SUM(total_baht), 0) AS total_baht FROM bookings`).get();
  const { users } = db.prepare('SELECT COUNT(*) AS users FROM users').get();
  res.json({ summary: { ...summary, users } });
});
