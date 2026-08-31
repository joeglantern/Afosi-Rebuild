import { createClient } from '@supabase/supabase-js';
import { applyCors, requireAdmin, requireAdminForWrites } from './_auth.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  // Reads stay public (the website consumes this same content); anything
  // that writes to Supabase with the service key needs a valid admin token.
  if (requireAdminForWrites(req, res)) return;

  // Parse the URL path to extract segments
  // e.g. /api/news/admin/all  →  ['admin', 'all']
  //      /api/news/admin/:id  →  ['admin', '<uuid>']
  //      /api/news/admin/:id/toggle-publish  →  ['admin', '<uuid>', 'toggle-publish']
  const rawUrl = req.url || '';
  const urlWithoutQuery = rawUrl.split('?')[0];
  const afterNews = urlWithoutQuery.replace(/^\/api\/news\/?/, '');
  const segments = afterNews ? afterNews.split('/').filter(Boolean) : [];

  // segments[0] = 'admin'
  // segments[1] = 'all' | 'stats' | <id>
  // segments[2] = 'toggle-publish' | 'toggle-featured' | undefined

  const isAdmin = segments[0] === 'admin';
  const secondSeg = segments[1]; // 'all', 'stats', or an ID
  const action = segments[2];    // 'toggle-publish', 'toggle-featured', or undefined

  // Everything under /api/news/admin/* exposes unpublished drafts and
  // stats, so those reads need a token too, not just the writes above.
  if (isAdmin && requireAdmin(req, res)) return;

  try {
    // ── GET /api/news/admin/stats ─────────────────────────────────────────
    if (req.method === 'GET' && isAdmin && secondSeg === 'stats') {
      const { data, error } = await supabase
        .from('news')
        .select('id, is_published, featured');

      if (error) throw error;

      return res.status(200).json({
        success: true,
        data: {
          total: data.length,
          published: data.filter(n => n.is_published).length,
          featured: data.filter(n => n.featured).length
        }
      });
    }

    // ── GET /api/news/admin/all ───────────────────────────────────────────
    if (req.method === 'GET' && isAdmin && secondSeg === 'all') {
      const { data, error } = await supabase
        .from('news')
        .select('*')
        .order('published_date', { ascending: false });

      if (error) throw error;
      return res.status(200).json({ success: true, data: data || [] });
    }

    // ── GET /api/news/admin/:id ───────────────────────────────────────────
    if (req.method === 'GET' && isAdmin && secondSeg && !action) {
      const { data, error } = await supabase
        .from('news')
        .select('*')
        .eq('id', secondSeg)
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // ── POST /api/news/admin ──────────────────────────────────────────────
    if (req.method === 'POST' && isAdmin && !secondSeg) {
      const { data, error } = await supabase
        .from('news')
        .insert([req.body])
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ success: true, data });
    }

    // ── PUT /api/news/admin/:id ───────────────────────────────────────────
    if (req.method === 'PUT' && isAdmin && secondSeg && !action) {
      const { data, error } = await supabase
        .from('news')
        .update(req.body)
        .eq('id', secondSeg)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // ── PATCH /api/news/admin/:id/toggle-publish ──────────────────────────
    if (req.method === 'PATCH' && isAdmin && secondSeg && action === 'toggle-publish') {
      const { data: current, error: fetchError } = await supabase
        .from('news')
        .select('is_published')
        .eq('id', secondSeg)
        .single();

      if (fetchError) throw fetchError;

      const { data, error } = await supabase
        .from('news')
        .update({ is_published: !current.is_published })
        .eq('id', secondSeg)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // ── PATCH /api/news/admin/:id/toggle-featured ─────────────────────────
    if (req.method === 'PATCH' && isAdmin && secondSeg && action === 'toggle-featured') {
      const { data: current, error: fetchError } = await supabase
        .from('news')
        .select('featured')
        .eq('id', secondSeg)
        .single();

      if (fetchError) throw fetchError;

      const { data, error } = await supabase
        .from('news')
        .update({ featured: !current.featured })
        .eq('id', secondSeg)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // ── DELETE /api/news/admin/:id ────────────────────────────────────────
    if (req.method === 'DELETE' && isAdmin && secondSeg) {
      const { error } = await supabase
        .from('news')
        .delete()
        .eq('id', secondSeg);

      if (error) throw error;
      return res.status(200).json({ success: true, message: 'Deleted successfully' });
    }

    res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (error) {
    console.error('News API Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}
