// /api/upload: files for news, projects and the gallery.
//
// Replaces two old paths at once: the backend's own upload route, and the
// admin dashboard uploading straight to Supabase Storage from the browser
// with a key anyone could read out of the page source. Both now come here,
// behind an admin session.

import { Router } from 'express';
import multer from 'multer';
import { requireAdmin, fail } from '../http.js';
import { config } from '../config.js';
import { saveUpload, removeUpload, DEFAULT_BUCKET, BUCKETS } from '../storage.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1, fields: 5, fieldSize: 1024 },
});

// Run multer, turning its errors into the API's JSON shape.
function receiveFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: `File is too large. The limit is ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB.`,
      });
    }
    return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
  });
}

const router = Router();

// requireAdmin runs first, so an anonymous request is refused before the
// body is read, rather than after buffering up to the size limit.
router.post('/', requireAdmin, receiveFile, async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const bucket = req.body?.bucket || DEFAULT_BUCKET;
  if (!BUCKETS.includes(bucket)) {
    return res.status(400).json({ success: false, message: `Unknown bucket. Use one of: ${BUCKETS.join(', ')}` });
  }
  try {
    const saved = await saveUpload(req.file.buffer, bucket);
    if (saved.error) return res.status(400).json({ success: false, message: saved.error });
    const isPdf = saved.kind === 'pdf';
    res.status(201).json({
      success: true,
      message: `${isPdf ? 'PDF' : 'Image'} uploaded successfully`,
      url: saved.url,
      data: { url: saved.url, path: saved.rel, fileName: saved.fileName, type: saved.kind },
    });
  } catch (err) {
    fail(res, 500, 'Failed to upload file', err);
  }
});

router.delete('/', requireAdmin, async (req, res) => {
  let rel = req.body?.path;
  if (!rel) return res.status(400).json({ success: false, message: 'File path is required' });
  // Paths from the old API were relative to the afosi-images bucket.
  if (!BUCKETS.includes(String(rel).split('/')[0])) rel = `${DEFAULT_BUCKET}/${rel}`;
  try {
    const removed = await removeUpload(rel);
    if (removed === false) return res.status(404).json({ success: false, message: 'File not found' });
    res.json({ success: true, message: 'File deleted successfully' });
  } catch (err) {
    fail(res, 500, 'Failed to delete file', err);
  }
});

export default router;
