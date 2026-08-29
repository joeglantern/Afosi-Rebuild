import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Vercel serverless function config
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '150mb', // Support up to 100MB files (base64 adds ~33% overhead)
    },
  },
};

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { file, fileName, fileType } = req.body;

    if (!file || !fileName) {
      return res.status(400).json({
        success: false,
        message: 'File and fileName are required'
      });
    }

    // Check file size (base64 is ~33% larger than original)
    const fileSizeInMB = (file.length * 0.75) / (1024 * 1024);
    if (fileSizeInMB > 100) {
      return res.status(413).json({
        success: false,
        message: `File too large (${fileSizeInMB.toFixed(2)}MB). Maximum size is 100MB.`
      });
    }

    // Convert base64 to buffer
    const base64Data = file.replace(/^data:.*?;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Create unique file path
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${timestamp}-${sanitizedFileName}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('afosi-files') // Bucket name
      .upload(filePath, buffer, {
        contentType: fileType || 'application/octet-stream',
        upsert: false,
        cacheControl: '3600'
      });

    if (error) {
      console.error('Supabase upload error:', error);
      
      // If bucket doesn't exist, return helpful error
      if (error.message.includes('not found')) {
        return res.status(500).json({
          success: false,
          message: 'Storage bucket not configured. Please create "afosi-files" bucket in Supabase Storage.'
        });
      }
      
      throw error;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('afosi-files')
      .getPublicUrl(filePath);

    return res.status(200).json({
      success: true,
      data: {
        url: urlData.publicUrl,
        path: filePath,
        fileName: sanitizedFileName
      },
      message: 'File uploaded successfully'
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Upload failed'
    });
  }
}
