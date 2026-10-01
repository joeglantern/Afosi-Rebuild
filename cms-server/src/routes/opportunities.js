// /api/opportunities: same paths, response shapes and messages as the old
// backend. One deliberate difference: create, update, delete and toggle now
// require an admin. The old backend left all four open to anyone.

import { Router } from 'express';
import { pool } from '../db.js';
import { requireAdmin, isUuid, pick, setClause, isUniqueViolation, fail, slugify } from '../http.js';

const TYPES = ['employment', 'consulting', 'volunteering'];
const WRITABLE = [
  'title', 'type', 'description', 'location', 'duration', 'deadline',
  'manually_disabled', 'full_description', 'apply_link', 'slug',
];
const NOT_FOUND = 'Opportunity not found';
const DUPLICATE = 'An opportunity with this slug already exists';

const router = Router();

// ── public ──────────────────────────────────────────────────────────────────
// Disabled ones are included: the site shows them as closed, it does not hide
// them. Same as before.
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM opportunities ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    fail(res, 500, 'Failed to fetch opportunities', err);
  }
});

router.get('/slug/:slug', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM opportunities WHERE slug = $1', [req.params.slug]);
    if (!rows[0]) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    fail(res, 500, 'Failed to fetch opportunity', err);
  }
});

router.get('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: NOT_FOUND });
  try {
    const { rows } = await pool.query('SELECT * FROM opportunities WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    fail(res, 500, 'Failed to fetch opportunity', err);
  }
});

// ── admin ───────────────────────────────────────────────────────────────────
router.post('/', requireAdmin, async (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.type || !b.description || !b.location || !b.duration || !b.deadline) {
    return res.status(400).json({
      success: false,
      message: 'All fields are required: title, type, description, location, duration, deadline',
    });
  }
  if (!TYPES.includes(b.type)) {
    return res.status(400).json({
      success: false,
      message: 'Type must be either employment, consulting, or volunteering',
    });
  }
  const slug = (b.slug && String(b.slug).trim()) || slugify(b.title);
  try {
    const { rows } = await pool.query(
      `INSERT INTO opportunities (title, type, description, location, duration, deadline,
         full_description, apply_link, slug, manually_disabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
       RETURNING *`,
      [b.title, b.type, b.description, b.location, b.duration, String(b.deadline),
        b.full_description || null, b.apply_link || null, slug]
    );
    res.status(201).json({ success: true, message: 'Opportunity created successfully', data: rows[0] });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(400).json({ success: false, message: DUPLICATE });
    fail(res, 500, 'Failed to create opportunity', err);
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: NOT_FOUND });
  const fields = pick(req.body, WRITABLE);
  if (fields.type !== undefined && !TYPES.includes(fields.type)) {
    return res.status(400).json({
      success: false,
      message: 'Type must be either employment, consulting, or volunteering',
    });
  }
  // Empty strings clear these two, as the old API did.
  if ('full_description' in fields) fields.full_description = fields.full_description || null;
  if ('apply_link' in fields) fields.apply_link = fields.apply_link || null;
  if ('deadline' in fields) fields.deadline = String(fields.deadline);
  if (!Object.keys(fields).length) {
    return res.status(400).json({ success: false, message: 'No valid fields to update' });
  }
  const { sql, values } = setClause(fields, 2);
  try {
    const { rows } = await pool.query(
      `UPDATE opportunities SET ${sql} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, message: 'Opportunity updated successfully', data: rows[0] });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(400).json({ success: false, message: DUPLICATE });
    fail(res, 500, 'Failed to update opportunity', err);
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: NOT_FOUND });
  try {
    const { rowCount } = await pool.query('DELETE FROM opportunities WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, message: 'Opportunity deleted successfully' });
  } catch (err) {
    fail(res, 500, 'Failed to delete opportunity', err);
  }
});

router.patch('/:id/toggle', requireAdmin, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: NOT_FOUND });
  try {
    const { rows } = await pool.query(
      'UPDATE opportunities SET manually_disabled = NOT manually_disabled WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, message: 'Opportunity status toggled successfully', data: rows[0] });
  } catch (err) {
    fail(res, 500, 'Failed to toggle opportunity status', err);
  }
});

export default router;
