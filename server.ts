import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initializeDatabase } from './server/db.ts';
import { attachAuthContext } from './server/security.ts';
import { seedDatabaseIfEmpty } from './server/seed.ts';
import { initSocketIO } from './server/socket.ts';
import { authRouter } from './server/routes/auth.ts';
import { corruptionRouter } from './server/routes/corruption.ts';
import { complaintsRouter } from './server/routes/complaints.ts';
import { eventsRouter } from './server/routes/events.ts';
import { mapRouter } from './server/routes/map.ts';
import { analyticsRouter } from './server/routes/analytics.ts';
import { adminRouter } from './server/routes/admin.ts';
import { notificationsRouter } from './server/routes/notifications.ts';

dotenv.config();

async function startServer() {
  initializeDatabase();
  seedDatabaseIfEmpty();

  const app = express();
  const httpServer = http.createServer(app);
  initSocketIO(httpServer);

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(attachAuthContext);

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api', corruptionRouter);
  app.use('/api', complaintsRouter);
  app.use('/api', eventsRouter);
  app.use('/api', mapRouter);
  app.use('/api', analyticsRouter);
  app.use('/api', adminRouter);
  app.use('/api', notificationsRouter);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'PCM Civic Accountability Platform' });
  });

  // Error handler for Multer / JSON parsing errors
  app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Bad request' });
      return;
    }
    next();
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`PCM Civic Platform running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start PCM server:', err);
  process.exit(1);
});
