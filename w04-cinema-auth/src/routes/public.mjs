import { Router } from 'express';
import { db } from '../db.mjs';

export const publicRoutes = Router();

// Public API 1: รายการหนัง ไม่ต้องเข้าสู่ระบบ.
publicRoutes.get('/movies', (req, res) => {
  res.json({ movies: db.prepare('SELECT * FROM movies ORDER BY id').all() });
});

// Public API 2: หมวดหมู่หนัง.
publicRoutes.get('/genres', (req, res) => {
  res.json({ genres: db.prepare('SELECT DISTINCT genre FROM movies ORDER BY genre').all().map(row => row.genre) });
});

// Public API 3: รอบฉายและจำนวนตั๋วที่เหลือ.
publicRoutes.get('/showtimes', (req, res) => {
  const shows = db.prepare(`SELECT s.*, m.title,
    s.capacity - COALESCE((SELECT SUM(quantity) FROM bookings b WHERE b.showtime_id = s.id), 0) AS available
    FROM showtimes s JOIN movies m ON m.id = s.movie_id
    WHERE s.starts_at > ? ORDER BY s.starts_at`).all(new Date().toISOString());
  res.json({ showtimes: shows });
});
