import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { ROOT } from './config.mjs';

mkdirSync(path.join(ROOT, 'data'), { recursive: true });
export const db = new DatabaseSync(path.join(ROOT, 'data', 'cinema.sqlite'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
db.exec(readFileSync(path.join(ROOT, 'database', 'schema.sql'), 'utf8'));

// ใช้กับงานฐานข้อมูลแบบ synchronous เท่านั้น เพื่อ commit/rollback เป็นชุดเดียวกัน.
export function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = fn();
    db.exec('COMMIT');
    return value;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function seedDatabase() {
  transaction(() => {
    for (const account of [
      [process.env.ADMIN_USERNAME || 'admin', process.env.ADMIN_PASSWORD || 'AdminPass123!', 'admin'],
      [process.env.MEMBER_USERNAME || 'member', process.env.MEMBER_PASSWORD || 'MemberPass123!', 'member']
    ]) {
      const [username, password, role] = account;
      if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) continue;
      db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
        .run(username, bcrypt.hashSync(password, 12), role);
    }
    if (db.prepare('SELECT COUNT(*) AS n FROM movies').get().n === 0) {
      const movies = [
        ['Midnight Orbit', 'Sci-Fi', 118],
        ['Bangkok Weekend', 'Comedy', 102],
        ['The Last Lantern', 'Adventure', 126]
      ];
      const addMovie = db.prepare('INSERT INTO movies (title, genre, duration_minutes) VALUES (?, ?, ?)');
      const addShow = db.prepare('INSERT INTO showtimes (movie_id, starts_at, hall, price_baht, capacity) VALUES (?, ?, ?, ?, ?)');
      movies.forEach((movie, i) => {
        const id = Number(addMovie.run(...movie).lastInsertRowid);
        for (let day = 1; day <= 3; day++) {
          const start = new Date(Date.now() + day * 86400000 + i * 3600000).toISOString();
          addShow.run(id, start, `Hall ${i + 1}`, 180 + i * 20, 60);
        }
      });
    }
  });
}
