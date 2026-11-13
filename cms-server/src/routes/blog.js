// /api/blog: the blog.
//
// Public reads only ever return posts that are published AND whose publish
// time has passed, so a draft or a scheduled post cannot leak through any
// public path. Everything under /admin needs an admin or a blog editor
// (requireBlogEditor); blog editors can do nothing else in the content API.
//
// Response shapes follow the other routes: { success, data, ... } and the
// same kind of messages.

import { Router } from 'express';
import { pool } from '../db.js';
import { requireBlogEditor, isUuid, slugify, setClause, clampInt, isUniqueViolation, fail } from '../http.js';

const NOT_FOUND = 'Blog post not found';
const DUPLICATE = 'A blog post with this slug already exists';

// Visible to the public right now.
const LIVE = `status = 'published' AND published_at <= now()`;

// What the public may see. Listings leave out the body, which can be long.
// Account ids (author_id, updated_by) are never public.
const CARD_COLUMNS = `id, title, slug, excerpt, cover_image_url, cover_image_alt, category, tags,
                      published_at, featured, author_name, reading_minutes`;
const POST_COLUMNS = `${CARD_COLUMNS}, content, updated_at`;

// The dashboard's list: everything but the body.
const ADMIN_LIST_COLUMNS = `${CARD_COLUMNS}, status, views, author_id, created_at, updated_at,
                            (status = 'published' AND published_at > now()) AS scheduled`;

const MAX = {
  title: 200,
  excerpt: 400,
  content: 200_000,
  category: 60,
  authorName: 120,
  coverAlt: 300,
  url: 2048,
  tag: 40,
  tags: 12,
  query: 100,
};

const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Roughly 200 words a minute, counting words in the Markdown with its
// punctuation stripped. Never less than a minute.
export function readingMinutes(markdown) {
  const words = String(markdown || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images are not read
    .replace(/[#>*_`~[\]()|-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// LIKE pattern for a search term, with its own wildcards taken literally.
const likePattern = (term) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const isHttpUrl = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

const has = (body, key) => Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;

// Check and normalise a create or update body. Only keys present in the body
// are returned, so an update changes exactly what was sent. Column names come
// from this function, never from the request.
export function validatePost(body, { creating }) {
  const b = body && typeof body === 'object' ? body : {};
  const out = {};

  // required: must be in the body (on create).  nonEmpty: may not be blank.
  // nullable: null clears the column; otherwise null counts as blank.
  const text = (key, { max, label, required = false, nonEmpty = false, nullable = false }) => {
    if (!has(b, key)) return required ? `${label} is required` : null;
    if (b[key] === null && nullable) {
      out[key] = null;
      return null;
    }
    if (b[key] !== null && typeof b[key] !== 'string') return `${label} must be text`;
    const value = (b[key] ?? '').trim();
    if (!value && (required || nonEmpty)) return `${label} is required`;
    if (value.length > max) return `${label} must be at most ${max} characters`;
    out[key] = nullable && !value ? null : value;
    return null;
  };

  const errors = [
    text('title', { max: MAX.title, label: 'Title', required: creating, nonEmpty: true }),
    text('excerpt', { max: MAX.excerpt, label: 'Excerpt' }),
    text('category', { max: MAX.category, label: 'Category', nonEmpty: true }),
    text('author_name', { max: MAX.authorName, label: 'Author name' }),
    text('cover_image_alt', { max: MAX.coverAlt, label: 'Cover image description', nullable: true }),
  ];

  // The body is kept exactly as written: Markdown cares about whitespace.
  if (has(b, 'content')) {
    if (typeof b.content !== 'string') errors.push('Content must be text');
    else if (b.content.length > MAX.content) errors.push(`Content must be at most ${MAX.content} characters`);
    else out.content = b.content;
  }

  if (has(b, 'slug') && b.slug !== null && b.slug !== '') {
    const slug = slugify(b.slug);
    if (!SLUG_FORMAT.test(slug)) errors.push('Slug must contain letters or numbers');
    else out.slug = slug;
  }

  if (has(b, 'cover_image_url')) {
    const url = b.cover_image_url;
    if (url === null || url === '') out.cover_image_url = null;
    else if (typeof url !== 'string' || url.length > MAX.url || !isHttpUrl(url.trim())) {
      errors.push('Cover image must be an http(s) URL');
    } else out.cover_image_url = url.trim();
  }

  if (has(b, 'tags')) {
    if (!Array.isArray(b.tags)) errors.push('Tags must be a list');
    else {
      const seen = new Set();
      const tags = [];
      for (const raw of b.tags) {
        if (typeof raw !== 'string') { errors.push('Each tag must be text'); break; }
        const tag = raw.trim().replace(/\s+/g, ' ');
        if (!tag) continue;
        if (tag.length > MAX.tag) { errors.push(`Each tag must be at most ${MAX.tag} characters`); break; }
        const key = tag.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        tags.push(tag);
      }
      if (tags.length > MAX.tags) errors.push(`At most ${MAX.tags} tags`);
      out.tags = JSON.stringify(tags);
    }
  }

  if (has(b, 'status')) {
    if (b.status !== 'draft' && b.status !== 'published') errors.push('Status must be draft or published');
    else out.status = b.status;
  }

  if (has(b, 'published_at')) {
    if (b.published_at === null || b.published_at === '') out.published_at = null;
    else {
      const d = new Date(b.published_at);
      if (typeof b.published_at !== 'string' || Number.isNaN(d.getTime())) errors.push('Publish date is not a valid date');
      else out.published_at = d.toISOString();
    }
  }

  if (has(b, 'featured')) {
    if (typeof b.featured !== 'boolean') errors.push('Featured must be true or false');
    else out.featured = b.featured;
  }

  const firstError = errors.find(Boolean);
  if (firstError) return { error: firstError };

  if ('content' in out) out.reading_minutes = readingMinutes(out.content);
  return { fields: out };
}

const router = Router();

// ── public ──────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const limit = clampInt(req.query.limit, 9, 1, 50);
  const offset = clampInt(req.query.offset, 0, 0, 1_000_000);
  const where = [LIVE];
  const values = [];
  const add = (sql, value) => {
    values.push(value);
    where.push(sql.replace('?', `$${values.length}`));
  };
  if (req.query.category) add('category = ?', String(req.query.category).slice(0, MAX.category));
  if (req.query.tag) add('tags @> ?::jsonb', JSON.stringify([String(req.query.tag).slice(0, MAX.tag)]));
  if (req.query.featured === 'true') where.push('featured');
  if (req.query.exclude) add('slug <> ?', String(req.query.exclude).slice(0, 200));
  const q = String(req.query.q || '').trim().slice(0, MAX.query);
  if (q) {
    values.push(likePattern(q));
    const p = `$${values.length}`;
    where.push(`(title ILIKE ${p} OR excerpt ILIKE ${p} OR category ILIKE ${p})`);
  }
  values.push(limit, offset);
  try {
    const { rows } = await pool.query(
      `SELECT ${CARD_COLUMNS}, COUNT(*) OVER () AS _total FROM blog_posts
        WHERE ${where.join(' AND ')}
        ORDER BY published_at DESC, created_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    res.json({
      success: true,
      data: rows.map(({ _total, ...row }) => row),
      total: rows[0]?._total ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    fail(res, 500, 'Failed to fetch blog posts', err);
  }
});

router.get('/categories', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT category, COUNT(*) AS count FROM blog_posts WHERE ${LIVE}
        GROUP BY category ORDER BY count DESC, category`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    fail(res, 500, 'Failed to fetch blog categories', err);
  }
});

router.get('/slug/:slug', async (req, res) => {
  try {
    // Count the view in the same statement that reads the row (see news.js).
    const { rows } = await pool.query(
      `UPDATE blog_posts SET views = views + 1
        WHERE slug = $1 AND ${LIVE}
        RETURNING ${POST_COLUMNS}`,
      [req.params.slug]
    );
    const post = rows[0];
    if (!post) return res.status(404).json({ success: false, message: NOT_FOUND });
    // Up to three more to read next: same category first, then the newest.
    const related = await pool.query(
      `SELECT ${CARD_COLUMNS} FROM blog_posts
        WHERE ${LIVE} AND id <> $1
        ORDER BY (category = $2) DESC, published_at DESC
        LIMIT 3`,
      [post.id, post.category]
    );
    res.json({ success: true, data: post, related: related.rows });
  } catch (err) {
    fail(res, 500, 'Failed to fetch blog post', err);
  }
});

// ── dashboard (admins and blog editors) ────────────────────────────────────
router.get('/admin/all', requireBlogEditor, async (req, res) => {
  const limit = clampInt(req.query.limit, 50, 1, 200);
  const offset = clampInt(req.query.offset, 0, 0, 1_000_000);
  const where = [];
  const values = [];
  const status = String(req.query.status || '');
  if (status === 'draft') where.push(`status = 'draft'`);
  else if (status === 'published') where.push(LIVE);
  else if (status === 'scheduled') where.push(`status = 'published' AND published_at > now()`);
  const q = String(req.query.q || '').trim().slice(0, MAX.query);
  if (q) {
    values.push(likePattern(q));
    const p = `$${values.length}`;
    where.push(`(title ILIKE ${p} OR excerpt ILIKE ${p} OR author_name ILIKE ${p})`);
  }
  values.push(limit, offset);
  try {
    const { rows } = await pool.query(
      `SELECT ${ADMIN_LIST_COLUMNS}, COUNT(*) OVER () AS _total FROM blog_posts
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY updated_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    res.json({
      success: true,
      data: rows.map(({ _total, ...row }) => row),
      total: rows[0]?._total ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    fail(res, 500, 'Failed to fetch blog posts', err);
  }
});

router.get('/admin/stats', requireBlogEditor, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*)                                                       AS total,
             COUNT(*) FILTER (WHERE ${LIVE})                                AS published,
             COUNT(*) FILTER (WHERE status = 'published' AND published_at > now()) AS scheduled,
             COUNT(*) FILTER (WHERE status = 'draft')                       AS drafts,
             COALESCE(SUM(views), 0)                                        AS "totalViews"
        FROM blog_posts`);
    // Every category and tag in use, drafts included, for the editor's suggestions.
    const categories = await pool.query(
      `SELECT DISTINCT category FROM blog_posts ORDER BY category`
    );
    const tags = await pool.query(
      `SELECT DISTINCT jsonb_array_elements_text(tags) AS tag FROM blog_posts ORDER BY tag`
    );
    res.json({
      success: true,
      data: {
        ...rows[0],
        categories: categories.rows.map((r) => r.category),
        tags: tags.rows.map((r) => r.tag),
      },
    });
  } catch (err) {
    fail(res, 500, 'Failed to fetch blog statistics', err);
  }
});

router.get('/admin/:id', requireBlogEditor, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: NOT_FOUND });
  try {
    const { rows } = await pool.query(
      `SELECT *, (status = 'published' AND published_at > now()) AS scheduled FROM blog_posts WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    fail(res, 500, 'Failed to fetch blog post', err);
  }
});

router.post('/admin', requireBlogEditor, async (req, res) => {
  const { fields, error } = validatePost(req.body, { creating: true });
  if (error) return res.status(400).json({ success: false, message: error });

  // A title made only of characters slugify drops (an emoji, say) still
  // needs a URL; give it a short unique one the editor can change later.
  const slug = fields.slug || slugify(fields.title) || `post-${Date.now().toString(36)}`;
  const row = {
    category: 'Stories',
    content: '',
    reading_minutes: 1,
    tags: '[]',
    status: 'draft',
    ...fields,
    slug,
    author_name: fields.author_name || req.admin.name || '',
    author_id: req.admin.id,
    updated_by: req.admin.id,
  };
  const cols = Object.keys(row);
  try {
    const { rows } = await pool.query(
      `INSERT INTO blog_posts (${cols.join(', ')})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING *, (status = 'published' AND published_at > now()) AS scheduled`,
      cols.map((c) => row[c])
    );
    res.status(201).json({ success: true, message: 'Blog post created successfully', data: rows[0] });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(400).json({ success: false, message: DUPLICATE });
    fail(res, 500, 'Failed to create blog post', err);
  }
});

router.put('/admin/:id', requireBlogEditor, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: NOT_FOUND });
  const { fields, error } = validatePost(req.body, { creating: false });
  if (error) return res.status(400).json({ success: false, message: error });
  if (!Object.keys(fields).length) {
    return res.status(400).json({ success: false, message: 'No valid fields to update' });
  }
  const { sql, values } = setClause({ ...fields, updated_by: req.admin.id }, 2);
  try {
    const { rows } = await pool.query(
      `UPDATE blog_posts SET ${sql} WHERE id = $1
       RETURNING *, (status = 'published' AND published_at > now()) AS scheduled`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, message: 'Blog post updated successfully', data: rows[0] });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(400).json({ success: false, message: DUPLICATE });
    fail(res, 500, 'Failed to update blog post', err);
  }
});

router.patch('/admin/:id/toggle-featured', requireBlogEditor, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: NOT_FOUND });
  try {
    const { rows } = await pool.query(
      `UPDATE blog_posts SET featured = NOT featured, updated_by = $2 WHERE id = $1
       RETURNING *, (status = 'published' AND published_at > now()) AS scheduled`,
      [req.params.id, req.admin.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, message: 'Featured status toggled successfully', data: rows[0] });
  } catch (err) {
    fail(res, 500, 'Failed to toggle featured status', err);
  }
});

router.delete('/admin/:id', requireBlogEditor, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: NOT_FOUND });
  try {
    const { rowCount } = await pool.query('DELETE FROM blog_posts WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: NOT_FOUND });
    res.json({ success: true, message: 'Blog post deleted successfully' });
  } catch (err) {
    fail(res, 500, 'Failed to delete blog post', err);
  }
});

export default router;
