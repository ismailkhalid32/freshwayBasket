import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { initDatabase } from './db.ts';
import { apiRouter } from './routes.ts';
import {
  securityHeadersMiddleware,
  noSqlSanitizerMiddleware,
  authenticateToken,
} from './security.ts';
import { getMongoDBStatus } from './mongodb.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const app = express();

// Cloud Run / AI Studio binds to 3000; Render injects RENDER=true and dynamic PORT
const PORT = process.env.RENDER && process.env.PORT ? Number(process.env.PORT) : 3000;

// Initialize database (MongoDB Atlas connection manager + Persistent local engine)
initDatabase();

// 1. HTTP Security Headers (OWASP Clickjacking, MIME-sniffing, XSS protection)
app.use(securityHeadersMiddleware);

// 2. Body Parsers with safe size limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 3. NoSQL Injection Guard: sanitize request body, query, and params
app.use(noSqlSanitizerMiddleware);

// 4. Token Authentication middleware: extract & verify HMAC-SHA256 Bearer tokens
app.use(authenticateToken);

// 5. Mount API routes
app.use('/api', apiRouter);

// Health check with real-time MongoDB Atlas status
app.get('/api/health', (req, res) => {
  const mongoStatus = getMongoDBStatus();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: {
      type: 'MongoDB Atlas / Multi-Store',
      mongo: mongoStatus,
    },
  });
});

// Centralized Express Error Handling (Never leak stack traces in API responses)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Express Error Handler]:', err);
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'An internal server error occurred. Please try again.',
  });
});

export async function startServer() {
  const distHtml = path.resolve(rootDir, 'dist', 'index.html');
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    (fs.existsSync(distHtml) && process.env.npm_lifecycle_event !== 'dev');

  if (isProduction) {
    // Serve pre-built static client bundle in production
    app.use(express.static(path.resolve(rootDir, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(distHtml);
    });
  } else {
    // Mount Vite dev server middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT} (isProduction: ${isProduction})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
