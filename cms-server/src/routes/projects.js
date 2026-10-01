// /api/projects: same paths, response shapes and messages as the old backend.

import { Router } from 'express';
import { pool } from '../db.js';
import {
  requireAdmin, isUuid, pick, setClause, jsonb, clampInt, isUniqueViolation, fail, slugify,
} from '../http.js';

const WRITABLE = [
  'title', 'slug', 'description', 'excerpt', 'image_url', 'icon', 'beneficiaries',
  'duration', 'highlights', 'link', 'is_external', 'is_featured', 'display_order',
  'why_it_matters', 'what_we_do', 'key_solutions', 'who_it_serves', 'impact',
  'partners', 'call_to_action', 'full_content', 'has_subpage',
];
const JSONB = ['highlights', 'what_we_do', 'impact', 'partners'];
const NOT_FOUND = 'Project not found';
const DUPLICATE = 'A project with this slug already exists';

const cleanList = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);

const router = Router();

// ── public ──────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const values = [];
  let sql = 'SELECT * FROM projects';
  if (req.query.featured === 'true') sql += ' WHERE is_featured';
  sql += ' ORDER BY display_order ASC, created_at ASC';
  if (req.query.limit) {
    values.push(clampInt(req.query.limit, 100, 1, 500));
    sql += ` LIMIT $${values.length}`;
  }
  try {
    const { rows } = await pool.query(sql, values);
    res.json({ success: true, data: rows });
  } catch (err) {
    fail(res, 500, 'Failed to fetch projects', err);
  }
});

router.get('/slug/:slug', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM projects WHERE slug = $1', [req.params.slug]);
    if (!rows[0]) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    fail(res, 500, 'Failed to fetch project', err);
  }
});

router.get('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: NOT_FOUND });
  try {
    const { rows } = await pool.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    fail(res, 500, 'Failed to fetch project', err);
  }
});

// ── admin ───────────────────────────────────────────────────────────────────
router.post('/', requireAdmin, async (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.description) {
    return res.status(400).json({ success: false, message: 'Title and description are required' });
  }
  const slug = (b.slug && String(b.slug).trim()) || slugify(b.title);
  try {
    const { rows } = await pool.query(
      `INSERT INTO projects (title, slug, description, excerpt, image_url, icon, beneficiaries,
         duration, highlights, link, is_external, is_featured, display_order, why_it_matters,
         what_we_do, key_solutions, who_it_serves, impact, partners, call_to_action,
         full_content, has_subpage)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
               $15, $16, $17, $18, $19, $20, $21, $22)
       RETURNING *`,
      [
        b.title, slug, b.description, b.excerpt || '', b.image_url ?? null,
        b.icon || 'Lightbulb', b.beneficiaries ?? null, b.duration ?? null,
        JSON.stringify(Array.isArray(b.highlights) ? b.highlights : []),
        b.link ?? null, Boolean(b.is_external), Boolean(b.is_featured),
        Number.parseInt(b.display_order, 10) || 0, b.why_it_matters || null,
        JSON.stringify(cleanList(b.what_we_do)), b.key_solutions || null,
        b.who_it_serves || null, JSON.stringify(cleanList(b.impact)),
        JSON.stringify(cleanList(b.partners)), b.call_to_action || null,
        b.full_content || null, Boolean(b.has_subpage),
      ]
    );
    res.status(201).json({ success: true, message: 'Project created successfully', data: rows[0] });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(400).json({ success: false, message: DUPLICATE });
    fail(res, 500, 'Failed to create project', err);
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: NOT_FOUND });
  const fields = jsonb(pick(req.body, WRITABLE), JSONB);
  if (!Object.keys(fields).length) {
    return res.status(400).json({ success: false, message: 'No valid fields to update' });
  }
  const { sql, values } = setClause(fields, 2);
  try {
    const { rows } = await pool.query(
      `UPDATE projects SET ${sql} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, message: 'Project updated successfully', data: rows[0] });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(400).json({ success: false, message: DUPLICATE });
    fail(res, 500, 'Failed to update project', err);
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: NOT_FOUND });
  try {
    const { rowCount } = await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (err) {
    fail(res, 500, 'Failed to delete project', err);
  }
});

router.patch('/:id/toggle-featured', requireAdmin, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: NOT_FOUND });
  try {
    const { rows } = await pool.query(
      'UPDATE projects SET is_featured = NOT is_featured WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, message: 'Featured status toggled successfully', data: rows[0] });
  } catch (err) {
    fail(res, 500, 'Failed to toggle featured status', err);
  }
});

export default router;
