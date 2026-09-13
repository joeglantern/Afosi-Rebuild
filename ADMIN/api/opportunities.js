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

  // Parse path segments after /api/opportunities
  // e.g. /api/opportunities          → []
  //      /api/opportunities/:id      → [':id']
  //      /api/opportunities/:id/toggle → [':id', 'toggle']
  const rawUrl = req.url || '';
  const urlWithoutQuery = rawUrl.split('?')[0];
  const afterBase = urlWithoutQuery.replace(/^\/api\/opportunities\/?/, '');
  const segments = afterBase ? afterBase.split('/').filter(Boolean) : [];

  const id = segments[0] && segments[0] !== 'toggle' ? segments[0] : null;
  const action = segments[1]; // 'toggle' or undefined

  try {
    // ── GET /api/opportunities ────────────────────────────────────────────
    if (req.method === 'GET' && !id) {
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json({ success: true, data: data || [] });
    }

    // ── GET /api/opportunities/:id ────────────────────────────────────────
    if (req.method === 'GET' && id) {
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // ── POST /api/opportunities ───────────────────────────────────────────
    if (req.method === 'POST' && !id) {
      const { type } = req.body;
      if (type && !['employment', 'consulting', 'volunteering'].includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Type must be employment, consulting, or volunteering'
        });
      }

      const { data, error } = await supabase
        .from('opportunities')
        .insert([req.body])
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ success: true, data });
    }

    // ── PUT /api/opportunities/:id ────────────────────────────────────────
    if (req.method === 'PUT' && id && !action) {
      const { type } = req.body;
      if (type && !['employment', 'consulting', 'volunteering'].includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Type must be employment, consulting, or volunteering'
        });
      }

      const { data, error } = await supabase
        .from('opportunities')
        .update(req.body)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // ── PATCH /api/opportunities/:id/toggle ───────────────────────────────
    if (req.method === 'PATCH' && id && action === 'toggle') {
      const { data: current, error: fetchError } = await supabase
        .from('opportunities')
        .select('manually_disabled')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const { data, error } = await supabase
        .from('opportunities')
        .update({ manually_disabled: !current.manually_disabled })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // ── DELETE /api/opportunities/:id ─────────────────────────────────────
    if (req.method === 'DELETE' && id) {
      const { error } = await supabase
        .from('opportunities')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return res.status(200).json({ success: true, message: 'Deleted successfully' });
    }

    res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (error) {
    console.error('Opportunities API Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}
