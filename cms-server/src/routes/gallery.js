// /api/gallery: same paths, response shapes and messages as the old backend.
// Writes now require an admin; the old backend left them open to anyone.

import { Router } from 'express';
import { pool } from '../db.js';
import { requireAdmin, isUuid, fail } from '../http.js';
import { removeUploadByUrl } from '../storage.js';

const CATEGORIES = ['Programs', 'Community', 'Youth', 'Events', 'Environment', 'Partners', 'Projects'];
const BAD_CATEGORY = `Category must be one of: ${CATEGORIES.join(', ')}`;
const NOT_FOUND = 'Image not found';

// "youth", "YOUTH" and "Youth" are all accepted, stored as "Youth".
const normaliseCategory = (c) => {
  const s = String(c);
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

const router = Router();

router.get('/', async (req, res) => {
  const { category } = req.query;
  try {
    const { rows } = category && category !== 'all'
      ? await pool.query(
          'SELECT * FROM gallery_images WHERE category = $1 ORDER BY created_at DESC',
          [normaliseCategory(category)]
        )
      : await pool.query('SELECT * FROM gallery_images ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    fail(res, 500, 'Failed to fetch gallery images', err);
  }
});

router.get('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: NOT_FOUND });
  try {
    const { rows } = await pool.query('SELECT * FROM gallery_images WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    fail(res, 500, 'Failed to fetch image', err);
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const b = req.body || {};
  // Both the old field names (src, alt) and the new ones are accepted.
  const url = b.image_url || b.src;
  const title = b.title || b.alt;
  const description = b.description || b.alt || null;
  if (!url || !b.category || !title) {
    return res.status(400).json({
      success: false,
      message: 'Required fields: image_url (or src), category, title (or alt)',
    });
  }
  const category = normaliseCategory(b.category);
  if (!CATEGORIES.includes(category)) return res.status(400).json({ success: false, message: BAD_CATEGORY });
  try {
    const { rows } = await pool.query(
      `INSERT INTO gallery_images (src, image_url, category, alt, title, description, featured)
       VALUES ($1, $1, $2, $3, $4, $3, $5)
       RETURNING *`,
      [url, category, description, title, Boolean(b.featured)]
    );
    res.status(201).json({ success: true, message: 'Image added successfully', data: rows[0] });
  } catch (err) {
    fail(res, 500, 'Failed to add image', err);
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: NOT_FOUND });
  const b = req.body || {};
  const sets = [];
  const values = [req.params.id];
  const set = (col, val) => {
    values.push(val);
    sets.push(`${col} = $${values.length}`);
  };

  if (b.image_url !== undefined || b.src !== undefined) {
    const url = b.image_url || b.src;
    set('src', url);
    set('image_url', url);
  }
  if (b.category !== undefined) {
    const category = normaliseCategory(b.category);
    if (!CATEGORIES.includes(category)) return res.status(400).json({ success: false, message: BAD_CATEGORY });
    set('category', category);
  }
  if (b.alt !== undefined || b.description !== undefined) {
    const d = b.description || b.alt || null;
    set('alt', d);
    set('description', d);
  }
  if (b.title !== undefined) set('title', b.title);
  if (b.featured !== undefined) set('featured', Boolean(b.featured));

  if (!sets.length) return res.status(400).json({ success: false, message: 'No valid fields to update' });
  try {
    const { rows } = await pool.query(
      `UPDATE gallery_images SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, message: 'Image updated successfully', data: rows[0] });
  } catch (err) {
    fail(res, 500, 'Failed to update image', err);
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: NOT_FOUND });
  try {
    const { rows } = await pool.query('DELETE FROM gallery_images WHERE id = $1 RETURNING src', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: NOT_FOUND });
    // The row is the source of truth; a file that fails to delete is only
    // wasted disk, so log it rather than failing the request.
    await removeUploadByUrl(rows[0].src).catch((e) => console.warn('[cms] file cleanup:', e.message));
    res.json({ success: true, message: 'Image deleted successfully' });
  } catch (err) {
    fail(res, 500, 'Failed to delete image', err);
  }
});

export default router;
