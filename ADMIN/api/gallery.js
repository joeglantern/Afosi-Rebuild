import { createClient } from '@supabase/supabase-js';
import { applyCors, requireAdminForWrites } from './_auth.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const VALID_CATEGORIES = ['Programs', 'Community', 'Youth', 'Events', 'Environment', 'Partners', 'Projects'];

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  // Reads stay public (the website consumes this same content); anything
  // that writes to Supabase with the service key needs a valid admin token.
  if (requireAdminForWrites(req, res)) return;

  // Parse path segments after /api/gallery
  const rawUrl = req.url || '';
  const urlWithoutQuery = rawUrl.split('?')[0];
  const afterBase = urlWithoutQuery.replace(/^\/api\/gallery\/?/, '');
  const segments = afterBase ? afterBase.split('/').filter(Boolean) : [];
  const id = segments[0] || null;

  // Query params
  const queryString = rawUrl.includes('?') ? rawUrl.split('?')[1] : '';
  const params = new URLSearchParams(queryString);
  const category = params.get('category');

  try {
    // ── GET /api/gallery ──────────────────────────────────────────────────
    if (req.method === 'GET' && !id) {
      let query = supabase
        .from('gallery_images')
        .select('*')
        .order('created_at', { ascending: false });

      if (category && category !== 'all') {
        query = query.eq('category', category);
      }

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ success: true, data: data || [] });
    }

    // ── GET /api/gallery/:id ──────────────────────────────────────────────
    if (req.method === 'GET' && id) {
      const { data, error } = await supabase
        .from('gallery_images')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // ── POST /api/gallery ─────────────────────────────────────────────────
    if (req.method === 'POST' && !id) {
      const { src, image_url, alt, title, description, category: cat, featured } = req.body;

      const imageUrl = image_url || src;
      const imageTitle = title || alt;
      const imageDescription = description || alt;

      if (!imageUrl || !cat || !imageTitle) {
        return res.status(400).json({
          success: false,
          message: 'Required: image_url (or src), category, title (or alt)'
        });
      }

      // Normalize category capitalisation
      const normalizedCat = cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
      if (!VALID_CATEGORIES.includes(normalizedCat)) {
        return res.status(400).json({
          success: false,
          message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}`
        });
      }

      const { data, error } = await supabase
        .from('gallery_images')
        .insert([{
          src: imageUrl,
          image_url: imageUrl,
          category: normalizedCat,
          alt: imageDescription,
          title: imageTitle,
          description: imageDescription,
          featured: featured || false
        }])
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ success: true, data });
    }

    // ── PUT /api/gallery/:id ──────────────────────────────────────────────
    if (req.method === 'PUT' && id) {
      const { src, image_url, alt, title, description, category: cat, featured } = req.body;
      const updateData = {};

      if (image_url !== undefined || src !== undefined) {
        const url = image_url || src;
        updateData.src = url;
        updateData.image_url = url;
      }

      if (cat !== undefined) {
        const normalizedCat = cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
        if (!VALID_CATEGORIES.includes(normalizedCat)) {
          return res.status(400).json({
            success: false,
            message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}`
          });
        }
        updateData.category = normalizedCat;
      }

      if (alt !== undefined || description !== undefined) {
        const desc = description || alt;
        updateData.alt = desc;
        updateData.description = desc;
      }

      if (title !== undefined) updateData.title = title;
      if (featured !== undefined) updateData.featured = featured;

      const { data, error } = await supabase
        .from('gallery_images')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // ── DELETE /api/gallery/:id ───────────────────────────────────────────
    if (req.method === 'DELETE' && id) {
      // Fetch image URL first so we can clean up storage
      const { data: image } = await supabase
        .from('gallery_images')
        .select('src')
        .eq('id', id)
        .single();

      const { error } = await supabase
        .from('gallery_images')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Attempt to remove from Supabase Storage (best-effort)
      if (image?.src?.includes('supabase.co')) {
        try {
          const parts = image.src.split('/storage/v1/object/public/afosi-images/');
          if (parts.length > 1) {
            await supabase.storage.from('afosi-images').remove([parts[1]]);
          }
        } catch (_) { /* ignore storage cleanup errors */ }
      }

      return res.status(200).json({ success: true, message: 'Deleted successfully' });
    }

    res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (error) {
    console.error('Gallery API Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}
