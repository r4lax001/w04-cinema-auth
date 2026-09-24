import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { ROOT, API_PORT, CLIENT_PORT, API_ORIGIN, CLIENT_ORIGIN, CLIENTS } from './config.mjs';
import { db, seedDatabase } from './db.mjs';
import { authRoutes } from './routes/auth.mjs';
import { oauthRoutes } from './routes/oauth.mjs';
import { publicRoutes } from './routes/public.mjs';
import { protectRoutes } from './routes/protect.mjs';
import { privateRoutes } from './routes/private.mjs';

seedDatabase();
const app = express();
const clientApp = express();
for (const server of [app, clientApp]) {
  server.disable('x-powered-by');
  server.use(helmet({
    strictTransportSecurity: false,
    referrerPolicy: { policy: 'same-origin' },
    contentSecurityPolicy: {
      directives: {
        'connect-src': ["'self'", API_ORIGIN],
        'form-action': ["'self'", CLIENT_ORIGIN],
        'upgrade-insecure-requests': null
      }
    }
  }));
  server.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
}
app.use(cors({
  origin(origin, callback) { callback(null, !origin || [API_ORIGIN, CLIENT_ORIGIN].includes(origin)); },
  methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
const authLimiter = rateLimit({
  windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'ส่งคำขอมากเกินไป กรุณารอประมาณ 1 นาที' }
});
app.use(['/register', '/login'], authLimiter);
app.use('/oauth', authLimiter);
app.get('/health', (req, res) => res.json({ status: 'ok', database: 'SQLite', business_api_count: 9 }));
app.get('/config', (req, res) => res.json({ api_origin: API_ORIGIN, client_origin: CLIENT_ORIGIN }));
app.use(authRoutes);
app.use('/oauth', oauthRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/protect', protectRoutes);
app.use('/api/private', privateRoutes);
app.use(express.static(path.join(ROOT, 'public')));
app.use((req, res) => res.status(404).json({ error: 'ไม่พบ endpoint นี้' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  if (status === 500) console.error('Server error:', error.message);
  if (status === 401) res.set('WWW-Authenticate', 'Bearer');
  res.status(status).json({ error: status === 500 ? 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' : error.message });
});

clientApp.get('/config', (req, res) => res.json({ api_origin: API_ORIGIN, clients: CLIENTS }));
clientApp.get('/callback', (req, res) => res.sendFile(path.join(ROOT, 'client', 'index.html')));
clientApp.get('/style.css', (req, res) => res.sendFile(path.join(ROOT, 'public', 'style.css')));
clientApp.use(express.static(path.join(ROOT, 'client')));

// ฟังเฉพาะเครื่องตัวเอง เหมาะกับการสาธิตบน localhost ตามโจทย์.
const apiServer = app.listen(API_PORT, 'localhost', () => console.log(`Cinema API + JWT UI: ${API_ORIGIN}`));
const demoServer = clientApp.listen(CLIENT_PORT, 'localhost', () => console.log(`OAuth client demo:  ${CLIENT_ORIGIN}`));
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  let closed = 0;
  const finish = () => { if (++closed === 2) { db.close(); process.exit(0); } };
  apiServer.close(finish);
  demoServer.close(finish);
  setTimeout(() => process.exit(1), 5000).unref();
}
for (const server of [apiServer, demoServer]) server.on('error', error => {
  console.error(`Cannot listen: ${error.message}. Change API_PORT/CLIENT_PORT in .env if necessary.`);
  shutdown();
});
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
