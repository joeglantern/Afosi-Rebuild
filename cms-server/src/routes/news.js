// /api/news: same paths, response shapes and messages as the old backend.

import { Router } from 'express';
import { pool } from '../db.js';
import { requireAdmin, isUuid, pick, setClause, jsonb, clampInt, isUniqueViolation, fail } from '../http.js';

const WRITABLE = [
  'title', 'slug', 'excerpt', 'content', 'image_url', 'category', 'location',
  'published_date', 'is_published', 'featured', 'author', 'tags',
];
const JSONB = ['tags'];
const NOT_FOUND = 'News article not found';
const DUPLICATE = 'A news article with this slug already exists';

const router = Router();

// ── public ──────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const limit = clampInt(req.query.limit, 10, 1, 100);
  const offset = clampInt(req.query.offset, 0, 0, 1_000_000);
  const where = ['is_published'];
  const values = [];
  if (req.query.category) {
    values.push(String(req.query.category));
    where.push(`category = $${values.length}`);
  }
  if (req.query.featured === 'true') where.push('featured');
  values.push(limit, offset);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM news WHERE ${where.join(' AND ')}
        ORDER BY published_date DESC, created_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    res.json({ success: true, data: rows, limit, offset });
  } catch (err) {
    fail(res, 500, 'Failed to fetch news', err);
  }
});

router.get('/slug/:slug', async (req, res) => {
  try {
    // Count the view in the same statement that reads the row, so concurrent
    // readers cannot lose increments the way read-then-write did.
    const { rows } = await pool.query(
      `UPDATE news SET views = views + 1
        WHERE slug = $1 AND is_published
        RETURNING *`,
      [req.params.slug]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    fail(res, 500, 'Failed to fetch news article', err);
  }
});

// ── admin ───────────────────────────────────────────────────────────────────
router.get('/admin/all', requireAdmin, async (req, res) => {
  const limit = clampInt(req.query.limit, 50, 1, 500);
  const offset = clampInt(req.query.offset, 0, 0, 1_000_000);
  const where = [];
  const values = [];
  if (req.query.category) {
    values.push(String(req.query.category));
    where.push(`category = $${values.length}`);
  }
  if (req.query.is_published !== undefined) {
    values.push(req.query.is_published === 'true');
    where.push(`is_published = $${values.length}`);
  }
  values.push(limit, offset);
  try {
    const { rows } = await pool.query(
      `SELECT *, COUNT(*) OVER () AS _total FROM news
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    const total = rows[0]?._total ?? 0;
    res.json({
      success: true,
      data: rows.map(({ _total, ...row }) => row),
      total,
      limit,
      offset,
    });
  } catch (err) {
    fail(res, 500, 'Failed to fetch news', err);
  }
});

router.get('/admin/stats', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*)                                  AS total,
             COUNT(*) FILTER (WHERE is_published)       AS published,
             COUNT(*) FILTER (WHERE NOT is_published)   AS unpublished,
             COALESCE(SUM(views), 0)                    AS "totalViews"
        FROM news`);
    const byCat = await pool.query(
      `SELECT COALESCE(category, 'general') AS category, COUNT(*) AS n FROM news GROUP BY 1`
    );
    res.json({
      success: true,
      data: {
        ...rows[0],
        byCategory: Object.fromEntries(byCat.rows.map((r) => [r.category, r.n])),
      },
    });
  } catch (err) {
    fail(res, 500, 'Failed to fetch news statistics', err);
  }
});

router.get('/admin/:id', requireAdmin, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: NOT_FOUND });
  try {
    const { rows } = await pool.query('SELECT * FROM news WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    fail(res, 500, 'Failed to fetch news article', err);
  }
});

router.post('/admin', requireAdmin, async (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.slug || !b.excerpt || !b.content || !b.published_date) {
    return res.status(400).json({
      success: false,
      message: 'Title, slug, excerpt, content, and published date are required',
    });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO news (title, slug, excerpt, content, image_url, category, location,
                         published_date, is_published, featured, author, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        b.title, b.slug, b.excerpt, b.content, b.image_url ?? null,
        b.category || 'general', b.location ?? null, b.published_date,
        b.is_published !== undefined ? Boolean(b.is_published) : true,
        Boolean(b.featured), b.author ?? null,
        JSON.stringify(Array.isArray(b.tags) ? b.tags : []),
      ]
    );
    res.status(201).json({ success: true, message: 'News article created successfully', data: rows[0] });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(400).json({ success: false, message: DUPLICATE });
    fail(res, 500, 'Failed to create news article', err);
  }
});

router.put('/admin/:id', requireAdmin, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: NOT_FOUND });
  const fields = jsonb(pick(req.body, WRITABLE), JSONB);
  if (!Object.keys(fields).length) {
    return res.status(400).json({ success: false, message: 'No valid fields to update' });
  }
  const { sql, values } = setClause(fields, 2);
  try {
    const { rows } = await pool.query(
      `UPDATE news SET ${sql} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, message: 'News article updated successfully', data: rows[0] });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(400).json({ success: false, message: DUPLICATE });
    fail(res, 500, 'Failed to update news article', err);
  }
});

router.delete('/admin/:id', requireAdmin, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: NOT_FOUND });
  try {
    const { rowCount } = await pool.query('DELETE FROM news WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, message: 'News article deleted successfully' });
  } catch (err) {
    fail(res, 500, 'Failed to delete news article', err);
  }
});

// A single atomic statement each, where the old code read then wrote.
for (const [path, column, message] of [
  ['toggle-publish', 'is_published', 'Publish status toggled successfully'],
  ['toggle-featured', 'featured', 'Featured status toggled successfully'],
]) {
  router.patch(`/admin/:id/${path}`, requireAdmin, async (req, res) => {
    if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: NOT_FOUND });
    try {
      const { rows } = await pool.query(
        `UPDATE news SET ${column} = NOT ${column} WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ success: false, message: NOT_FOUND });
      res.json({ success: true, message, data: rows[0] });
    } catch (err) {
      fail(res, 500, `Failed to ${path.replace('-', ' ')} status`, err);
    }
  });
}

export default router;
