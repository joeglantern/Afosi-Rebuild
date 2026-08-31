import { createClient } from '@supabase/supabase-js';
import { applyCors, requireAdminForWrites } from './_auth.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  // Reads stay public (the website consumes this same content); anything
  // that writes to Supabase with the service key needs a valid admin token.
  if (requireAdminForWrites(req, res)) return;

  // Parse path segments after /api/projects
  // e.g. /api/projects                    → []
  //      /api/projects/:id                → [':id']
  //      /api/projects/:id/toggle-featured → [':id', 'toggle-featured']
  const rawUrl = req.url || '';
  const urlWithoutQuery = rawUrl.split('?')[0];
  const afterBase = urlWithoutQuery.replace(/^\/api\/projects\/?/, '');
  const segments = afterBase ? afterBase.split('/').filter(Boolean) : [];

  const id = segments[0] && segments[0] !== 'toggle-featured' ? segments[0] : null;
  const action = segments[1]; // 'toggle-featured' or undefined

  // Query params for GET all
  const queryString = rawUrl.includes('?') ? rawUrl.split('?')[1] : '';
  const params = new URLSearchParams(queryString);
  const featured = params.get('featured');
  const limit = params.get('limit');

  try {
    // ── GET /api/projects ─────────────────────────────────────────────────
    if (req.method === 'GET' && !id) {
      let query = supabase
        .from('projects')
        .select('*')
        .order('display_order', { ascending: true });

      if (featured === 'true') {
        query = query.eq('is_featured', true);
      }

      if (limit) {
        query = query.limit(parseInt(limit));
      }

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ success: true, data: data || [] });
    }

    // ── GET /api/projects/:id ─────────────────────────────────────────────
    if (req.method === 'GET' && id && !action) {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // ── POST /api/projects ────────────────────────────────────────────────
    if (req.method === 'POST' && !id) {
      const { data, error } = await supabase
        .from('projects')
        .insert([req.body])
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ success: true, data });
    }

    // ── PUT /api/projects/:id ─────────────────────────────────────────────
    if (req.method === 'PUT' && id && !action) {
      const { data, error } = await supabase
        .from('projects')
        .update(req.body)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // ── PATCH /api/projects/:id/toggle-featured ───────────────────────────
    if (req.method === 'PATCH' && id && action === 'toggle-featured') {
      const { data: current, error: fetchError } = await supabase
        .from('projects')
        .select('is_featured')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const { data, error } = await supabase
        .from('projects')
        .update({ is_featured: !current.is_featured })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // ── DELETE /api/projects/:id ──────────────────────────────────────────
    if (req.method === 'DELETE' && id) {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return res.status(200).json({ success: true, message: 'Deleted successfully' });
    }

    res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (error) {
    console.error('Projects API Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}
