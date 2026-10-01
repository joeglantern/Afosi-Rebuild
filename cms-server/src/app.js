// The Express app, without listening, so tests can drive it directly.

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import { config } from './config.js';
import { pool } from './db.js';
import { requireTrustedOrigin } from './http.js';
import news from './routes/news.js';
import projects from './routes/projects.js';
import opportunities from './routes/opportunities.js';
import gallery from './routes/gallery.js';
import upload from './routes/upload.js';

export const app = express();

app.disable('x-powered-by');
// nginx on the same box is the only thing that talks to us. Trust exactly
// that hop, so req.ip is the real client for rate limiting.
app.set('trust proxy', 'loopback');

// same-site lets afosi.org embed images served from api.afosi.org/uploads;
// helmet's default (same-origin) would block them.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));

app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  })
);

// Better Auth checks Origin itself, but only when NODE_ENV is "production":
// tested against 1.7.7, a sign-in from an untrusted origin gets a 200 in any
// other mode. So one stray restart without NODE_ENV would silently drop CSRF
// protection on login. This guard makes the rule the same in every
// environment. It reads headers only, so it leaves the body stream intact.
app.use('/api/auth', requireTrustedOrigin);

// Better Auth reads the raw request body itself, so its handler has to be
// mounted before express.json() consumes the stream (per its Express docs).
// Express 5 needs the named wildcard.
app.all('/api/auth/*splat', toNodeHandler(auth));

app.use(express.json({ limit: '1mb' }));
app.use('/api', requireTrustedOrigin);

// Better Auth rate-limits its own routes. These cover the content API:
// generous for reads (every page view makes a few), tight for writes.
const window15m = 15 * 60 * 1000;
app.use(
  '/api',
  rateLimit({
    windowMs: window15m,
    limit: 900,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => req.method !== 'GET' && req.method !== 'HEAD',
    message: { success: false, message: 'Too many requests, please try again later.' },
  }),
  rateLimit({
    windowMs: window15m,
    limit: 150,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    message: { success: false, message: 'Too many requests, please try again later.' },
  })
);

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, message: 'AFOSI CMS API is running', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ success: false, message: 'Database unavailable' });
  }
});

app.use('/api/news', news);
app.use('/api/projects', projects);
app.use('/api/opportunities', opportunities);
app.use('/api/gallery', gallery);
app.use('/api/upload', upload);

// Uploaded files. Names are random UUIDs and never reused, so they can be
// cached forever. The type was checked on the way in (storage.js), and
// helmet's nosniff stops a browser second-guessing it.
app.use(
  '/uploads',
  express.static(config.uploadDir, {
    index: false,
    dotfiles: 'deny',
    fallthrough: true,
    immutable: true,
    maxAge: '365d',
    setHeaders(res) {
      // Allow the site and the dashboard to show a PDF in a frame; helmet's
      // global X-Frame-Options would forbid it.
      res.removeHeader('X-Frame-Options');
      res.setHeader(
        'Content-Security-Policy',
        "frame-ancestors 'self' https://afosi.org https://www.afosi.org https://admin.afosi.org"
      );
    },
  })
);

// Same 404 body as the old backend.
app.use((_req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

// Express 5 forwards rejected promises here, so a thrown error in any route
// becomes a JSON 500 instead of a hung request.
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON body' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body too large' });
  }
  console.error('[cms] unhandled:', err);
  const body = { success: false, message: 'Something went wrong!' };
  if (!config.isProd && err?.message) body.error = err.message;
  res.status(500).json(body);
});
