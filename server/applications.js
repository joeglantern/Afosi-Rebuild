// Opportunity applications — the website's built-in application form
// (src/apply.js) submits here instead of (or as well as) the legacy
// api.afosi.org /apply route. Unlike gallery/news/project images, application
// documents (CVs, certificates, insurance proof) are private, so they are
// never written to the public Supabase Storage buckets those use — they're
// stored on this VPS's own disk, under uploads/applications/, and only ever
// served back out through the authenticated admin download route below.
//
// Flow: the browser uploads each file individually to POST /upload (staged
// in uploads/_pending/, returns an opaque id), then submits the whole form as
// JSON to POST / referencing those ids. On submit, staged files are moved
// into their final uploads/applications/<opportunity-slug>/<application-id>/
// folder and the submission is recorded via applications-store.js.
//
// Everything under /admin/* requires an admin JWT — the SAME token issued by
// the ADMIN dashboard's own login (ADMIN/api/auth.js), verified here with a
// JWT_SECRET that must be set to the identical value in both places (see
// server/.env.example and server/README.md).

import express from 'express';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import * as store from './applications-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = join(__dirname, 'uploads');
const PENDING_DIR = join(UPLOADS_ROOT, '_pending');
const APPLICATIONS_DIR = join(UPLOADS_ROOT, 'applications');
fs.mkdirSync(PENDING_DIR, { recursive: true });
fs.mkdirSync(APPLICATIONS_DIR, { recursive: true });

// These are read lazily, per request, rather than captured at module load.
// server.js imports this file at line 22 but only calls dotenv.config() as a
// statement further down, and ES module imports are evaluated before any
// statement in the importing module runs. Reading process.env at the top
// level here therefore happens before server/.env has been loaded, so every
// value would silently be the fallback no matter what the .env file said.
//
// There is deliberately no fallback secret: a default committed to the repo
// is a publicly known signing key, so missing config fails closed.
const jwtSecret = () => process.env.JWT_SECRET;
const hrEmail = () => process.env.HR_EMAIL || 'careers@afosi.org';
const adminDashboardUrl = () => process.env.ADMIN_DASHBOARD_URL || 'https://admin.afosi.org';
const afosiApiUrl = () => (process.env.AFOSI_API_URL || 'https://api.afosi.org/api').replace(/\/$/, '');
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB — matches the client-side cap in apply.js
const ALLOWED_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx']);

// Best-effort cleanup of abandoned uploads (a file staged in /upload whose
// form was never submitted) — swept once at process start, not critical if
// it misses one, so failures here are logged and otherwise ignored.
(function sweepStalePending() {
  try {
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    for (const name of fs.readdirSync(PENDING_DIR)) {
      const p = join(PENDING_DIR, name);
      try {
        if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
      } catch { /* ignore a single file failing */ }
    }
  } catch (e) {
    console.error('[applications] stale-pending sweep failed:', e.message);
  }
})();

function sanitizeFilename(name) {
  const base = String(name || 'file').replace(/[/\\]/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
  return base.slice(-150) || 'file'; // keep it short and free of path separators
}

function extOf(name) {
  const m = /\.[a-zA-Z0-9]+$/.exec(name || '');
  return m ? m[0].toLowerCase() : '';
}

// ── Admin auth ───────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const secret = jwtSecret();
  if (!secret) {
    console.error('[applications] JWT_SECRET is not set; refusing admin access.');
    return res.status(500).json({ success: false, message: 'Server auth is not configured.' });
  }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ success: false, message: 'No token provided' });
  try {
    req.admin = jwt.verify(token, secret);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

// ── Upload staging (multipart) ──────────────────────────────────────────────
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PENDING_DIR),
    filename: (req, file, cb) => {
      const id = crypto.randomUUID();
      cb(null, `${id}__${sanitizeFilename(file.originalname)}`);
    },
  }),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_EXT.has(extOf(file.originalname))) {
      return cb(new Error('Unsupported file type. Allowed: PDF, PNG, JPG, DOC, DOCX.'));
    }
    cb(null, true);
  },
});

async function fetchJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Trust the opportunity type/title looked up from the public API over
// whatever the client claims, when available — falls back to the client's
// values so a transient lookup failure never blocks a genuine submission.
async function resolveOpportunity(clientOpp) {
  const slug = clientOpp && clientOpp.slug;
  if (slug) {
    const json = await fetchJSON(`${afosiApiUrl()}/opportunities/slug/${encodeURIComponent(slug)}`);
    const opp = json && json.data;
    if (opp) {
      return { id: opp.id, title: opp.title, slug: opp.slug, type: opp.type || 'employment' };
    }
  }
  return {
    id: clientOpp?.id || null,
    title: clientOpp?.title || 'Untitled opportunity',
    slug: clientOpp?.slug || 'unknown',
    type: ['employment', 'consulting', 'volunteering'].includes(clientOpp?.type) ? clientOpp.type : 'employment',
  };
}

// Picks a human name/email/phone out of whichever variant's field keys are
// present, for the HR notification email — every apply.js variant should use
// (a subset of) these key names for its identity fields.
function pickIdentity(fields) {
  const f = fields || {};
  return {
    name: f.applicantName || f.fullName || 'Unknown applicant',
    email: f.applicantEmail || f.emailAddress || '',
    phone: f.applicantPhone || f.phoneNumber || '',
  };
}

let resendClient = null;
let resendInitTried = false;
async function getResend() {
  if (resendInitTried) return resendClient;
  resendInitTried = true;
  if (!process.env.RESEND_API_KEY) return null;
  try {
    const { Resend } = await import('resend');
    resendClient = new Resend(process.env.RESEND_API_KEY);
  } catch (e) {
    console.error('[applications] Resend not available:', e.message);
  }
  return resendClient;
}

async function sendEmails(entry) {
  const resend = await getResend();
  if (!resend) return; // email not configured — submission is still saved/retrievable in the dashboard
  const identity = pickIdentity(entry.fields);
  const fromAddr = process.env.RESEND_FROM || 'AFOSI Applications <applications@afosi.org>';

  const fieldLines = Object.entries(entry.fields || {})
    .filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join('\n');
  const fileLines = (entry.files || []).map((f) => `- ${f.originalName} (${f.fieldKey})`).join('\n') || 'None';

  try {
    await resend.emails.send({
      from: fromAddr,
      to: hrEmail(),
      subject: `New application: ${entry.opportunity.title} — ${identity.name}`,
      text:
        `A new application was submitted for "${entry.opportunity.title}" (${entry.opportunity.type}).\n\n` +
        `Applicant: ${identity.name}\nEmail: ${identity.email}\nPhone: ${identity.phone}\n\n` +
        `Documents:\n${fileLines}\n\n` +
        `Full answers:\n${fieldLines}\n\n` +
        `Open, review and download documents in the admin dashboard: ${adminDashboardUrl()}`,
    });
  } catch (e) {
    console.error('[applications] HR notification email failed:', e.message);
  }

  if (identity.email) {
    try {
      await resend.emails.send({
        from: fromAddr,
        to: identity.email,
        subject: `We've received your application — ${entry.opportunity.title}`,
        text:
          `Hi ${identity.name},\n\nThank you for applying to "${entry.opportunity.title}" at AFOSI. ` +
          `Your submission and documents have been received. Our team will review applications and reach out ` +
          `if you're shortlisted.\n\n— AFOSI`,
      });
    } catch (e) {
      console.error('[applications] applicant confirmation email failed:', e.message);
    }
  }
}

// ── Router ───────────────────────────────────────────────────────────────────
const router = express.Router();

// POST /applications/upload — public, one file per call, returns a staging
// reference the final submit will resolve.
router.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
        ? 'File exceeds the 10 MB limit.'
        : (err.message || 'Upload failed.');
      return res.status(400).json({ success: false, message: msg });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'No file provided.' });
    // The opaque "url" here is a pending-file id, not a real URL — apply.js
    // only ever treats it as an opaque reference to pass back on submit.
    res.status(201).json({ success: true, url: req.file.filename, name: req.file.originalname });
  });
});

// POST /applications — public, finalizes a submission (JSON body; parsed by
// the app-level express.json() middleware mounted in server.js).
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const fields = body.fields && typeof body.fields === 'object' ? body.fields : {};
    const uploads = body.uploads && typeof body.uploads === 'object' ? body.uploads : {};
    const variant = typeof body.variant === 'string' ? body.variant.slice(0, 60) : 'standard';

    const opportunity = await resolveOpportunity(body.opportunity);

    // Move each referenced pending file into its permanent, private folder.
    const files = [];
    const destDir = join(APPLICATIONS_DIR, opportunity.slug || 'unknown', crypto.randomUUID());
    for (const [fieldKey, meta] of Object.entries(uploads)) {
      const pendingId = meta && meta.url;
      if (!pendingId || typeof pendingId !== 'string') continue;
      const safePendingId = pendingId.replace(/[/\\]/g, ''); // no path traversal via a crafted id
      const srcPath = join(PENDING_DIR, safePendingId);
      if (!fs.existsSync(srcPath)) continue; // expired/already-used reference — skip rather than fail the whole submission
      fs.mkdirSync(destDir, { recursive: true });
      const originalName = meta.name || safePendingId;
      const storedName = `${fieldKey}__${sanitizeFilename(originalName)}`;
      const destPath = join(destDir, storedName);
      fs.renameSync(srcPath, destPath);
      files.push({
        fieldKey,
        originalName,
        storedName,
        path: destPath,
        sizeBytes: fs.statSync(destPath).size,
      });
    }

    const entry = await store.saveApplication({ opportunity, variant, fields, files });
    res.status(201).json({ success: true, id: entry.id });

    // Don't make the applicant wait on email delivery.
    sendEmails(entry).catch((e) => console.error('[applications] email dispatch error:', e.message));
  } catch (err) {
    console.error('[applications] submit error:', err.message);
    res.status(500).json({ success: false, message: 'Could not submit your application right now. Please try again shortly.' });
  }
});

// ── Admin routes ─────────────────────────────────────────────────────────────
router.get('/', requireAdmin, (req, res) => {
  const { type, opportunity } = req.query;
  const list = store.listApplications({ type: type || undefined, opportunitySlug: opportunity || undefined });
  res.json({ success: true, data: list.map(publicShape) });
});

router.get('/:id', requireAdmin, (req, res) => {
  const entry = store.getApplication(req.params.id);
  if (!entry) return res.status(404).json({ success: false, message: 'Application not found.' });
  res.json({ success: true, data: publicShape(entry) });
});

router.patch('/:id/reviewed', requireAdmin, async (req, res) => {
  const entry = store.getApplication(req.params.id);
  if (!entry) return res.status(404).json({ success: false, message: 'Application not found.' });
  const reviewed = req.body?.reviewed !== false;
  await store.markReviewed(req.params.id, reviewed);
  res.json({ success: true });
});

router.get('/:id/files/:fileKey', requireAdmin, (req, res) => {
  const entry = store.getApplication(req.params.id);
  if (!entry) return res.status(404).json({ success: false, message: 'Application not found.' });
  const file = (entry.files || []).find((f) => f.storedName === req.params.fileKey);
  if (!file || !fs.existsSync(file.path)) return res.status(404).json({ success: false, message: 'File not found.' });
  res.download(file.path, file.originalName);
});

// Strip absolute disk paths out of anything sent to the browser — the admin
// panel only ever needs storedName (to request the file) and originalName.
function publicShape(entry) {
  return {
    ...entry,
    files: (entry.files || []).map(({ path, ...rest }) => rest),
  };
}

export default router;
