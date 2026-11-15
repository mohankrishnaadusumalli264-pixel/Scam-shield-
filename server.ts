import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { getServerPort } from './server/config.ts';
import { statusRouter } from './server/routes/status.ts';
import { analyzeRouter } from './server/routes/analyze.ts';
import { reportsRouter } from './server/routes/reports.ts';

async function startServer() {
  const app = express();
  const port = getServerPort();
  const isProd = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);

  // Baseline security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '0');
    next();
  });

  // Allow up to 8MB JSON payloads for in-memory base64 screenshot inspection
  app.use(express.json({ limit: '8mb' }));

  // Server API routes
  app.use('/api', statusRouter);
  app.use('/api', analyzeRouter);
  app.use('/api', reportsRouter);

  // Unhandled API 404 guard
  app.use('/api', (_req, res) => {
    res.status(404).json({
      errorCode: 'API_ROUTE_NOT_FOUND',
      message: 'Requested API endpoint does not exist.',
    });
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`SCAMSHIELD server listening on http://0.0.0.0:${port} (${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start SCAMSHIELD server:', err);
  process.exit(1);
});
