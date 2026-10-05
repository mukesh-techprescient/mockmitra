import express from 'express';
import { ZodError } from 'zod';
import { connectDB } from './db.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import attemptRoutes from './routes/attempts.js';
import adminRoutes from './routes/admin.js';
import { ImportError } from './lib/importTest.js';
import { formatZodError } from './lib/testSchema.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '6mb' })); // Netlify Functions cap request bodies at ~6MB

  // Reports configuration and DB reachability without revealing any secret values.
  const health = async (_req, res) => {
    const config = { MONGODB_URI: !!process.env.MONGODB_URI, JWT_SECRET: !!process.env.JWT_SECRET };
    let db = 'not tried';
    if (config.MONGODB_URI) {
      try { const c = await connectDB(); db = `connected to "${c.connection.name}"`; } catch (e) { db = `${e.name}: ${e.message}`.slice(0, 300); }
    }
    const ok = config.MONGODB_URI && config.JWT_SECRET && db.startsWith('connected');
    res.status(ok ? 200 : 503).json({ ok, config, db });
  };
  app.get(['/api/health', '/.netlify/functions/api/health'], health);

  app.use(async (_req, _res, next) => {
    try { await connectDB(); next(); } catch (e) { e.isDbError = true; next(e); }
  });

  const api = express.Router();
  api.use('/auth', authRoutes);
  api.use('/', catalogRoutes);
  api.use('/attempts', attemptRoutes);
  api.use('/admin', adminRoutes);

  // Same router whether called as /api/* (local, redirect) or the raw function path.
  app.use(['/api', '/.netlify/functions/api'], api);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof ImportError) return res.status(400).json({ error: err.message, details: err.details });
    if (err instanceof ZodError) return res.status(400).json({ error: 'Invalid request', details: formatZodError(err) });
    if (err.name === 'CastError') return res.status(404).json({ error: 'Not found' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'File too large (max ~6MB)' });
    console.error(err);
    if (err.isDbError) return res.status(503).json({ error: 'Database unavailable — see /api/health' });
    if (/JWT_SECRET/.test(err.message)) return res.status(500).json({ error: 'Server misconfigured: JWT_SECRET is not set' });
    res.status(500).json({ error: 'Server error' });
  });
  return app;
}
