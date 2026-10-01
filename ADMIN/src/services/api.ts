// Relative URLs: nginx proxies admin.afosi.org/api/* to the CMS service, so
// the Better Auth session cookie rides along on every request automatically.
// No token is read or attached here.
const API_BASE_URL = '/api';

// ── Safe response parser ────────────────────────────────────────────────────────
// The server occasionally returns plain-text errors (e.g. "Too many requests")
// instead of JSON. Calling .json() on those throws a SyntaxError that surfaces
// as the confusing "Unexpected token 'T'" crash. This helper always reads the
// raw text first, then tries to parse it – so we always get a clean error.
async function safeParseJSON(response: Response): Promise<any> {
  const text = await response.text();
  if (!text || text.trim() === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    // Plain-text body (e.g. rate-limit message from nginx/Supabase)
    throw new Error(text.trim());
  }
}

// ── Exponential backoff retry ───────────────────────────────────────────────────
// On HTTP 429 (Too Many Requests) the server sends a Retry-After header or
// just returns too quickly. We wait and retry up to MAX_RETRIES times.
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function fetchWithRetry(
  url: string,
  config: RequestInit,
  attempt = 0
): Promise<Response> {
  const response = await fetch(url, config);

  if (response.status === 429 && attempt < MAX_RETRIES) {
    const retryAfter = response.headers.get('Retry-After');
    const delay = retryAfter
      ? parseInt(retryAfter, 10) * 1000
      : BASE_DELAY_MS * Math.pow(2, attempt); // 1 s → 2 s → 4 s

    console.warn(`[API] Rate limited. Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return fetchWithRetry(url, config, attempt + 1);
  }

  return response;
}

// ── Track whether a logout redirect is already in flight ──────────────────────
let isRedirectingToLogin = false;

// ── Core fetch wrapper ────────────────────────────────────────────────────────
async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const config: RequestInit = {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  try {
    const response = await fetchWithRetry(url, config);

    // ── 401 Unauthorized ───────────────────────────────────────────────────
    // The session has expired or been revoked. Reload ONCE (guarding against
    // loops); the app then finds no session and shows the login screen.
    if (response.status === 401 && !isRedirectingToLogin) {
      isRedirectingToLogin = true;
      // Small delay so any pending state updates settle before reload
      setTimeout(() => {
        isRedirectingToLogin = false;
        window.location.reload();
      }, 300);
      throw new Error('Session expired. Please log in again.');
    }

    // ── Parse response body safely ─────────────────────────────────────────
    const data = await safeParseJSON(response);

    if (!response.ok) {
      throw new Error(
        (data && (data.message || data.error)) ||
        `Request failed with status ${response.status}`
      );
    }

    return data;
  } catch (error: any) {
    // Re-throw with a friendlier message for rate-limit errors that slipped through
    if (
      error.message &&
      (error.message.toLowerCase().includes('too many') ||
        error.message.toLowerCase().includes('rate limit'))
    ) {
      throw new Error('Too many requests. Please wait a moment and try again.');
    }
    console.error('API Error:', error);
    throw error;
  }
}

// Sign-in, sign-out and the session are handled by the Better Auth client in
// src/lib/auth-client.ts; there is no authAPI here any more.

// Opportunities API - backend uses /:id path params
export const opportunitiesAPI = {
  getAll: () => fetchAPI('/opportunities'),
  getById: (id: string) => fetchAPI(`/opportunities/${id}`),
  getBySlug: (slug: string) => fetchAPI(`/opportunities/slug/${slug}`),
  create: (data: {
    title: string;
    type: 'employment' | 'consulting' | 'volunteering';
    description: string;
    location: string;
    duration: string;
    deadline: string | null;
    slug?: string;
    full_description?: string;
    apply_link?: string;
  }) => fetchAPI('/opportunities', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{
    title: string;
    type: 'employment' | 'consulting' | 'volunteering';
    description: string;
    location: string;
    duration: string;
    deadline: string | null;
    manually_disabled: boolean;
    slug: string;
    full_description: string;
    apply_link: string;
  }>) => fetchAPI(`/opportunities/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => fetchAPI(`/opportunities/${id}`, { method: 'DELETE' }),
  toggleStatus: (id: string) => fetchAPI(`/opportunities/${id}/toggle`, { method: 'PATCH' }),
};

// Gallery API - backend uses /:id path params
export const galleryAPI = {
  getAll: (category?: string) => {
    const query = category && category !== 'all' ? `?category=${category}` : '';
    return fetchAPI(`/gallery${query}`);
  },
  getById: (id: string) => fetchAPI(`/gallery/${id}`),
  create: (data: {
    src?: string;
    image_url?: string;
    category: string;
    alt?: string;
    title?: string;
    description?: string;
    featured?: boolean;
  }) => fetchAPI('/gallery', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{
    src: string;
    image_url: string;
    category: string;
    alt: string;
    title: string;
    description: string;
    featured: boolean;
  }>) => fetchAPI(`/gallery/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => fetchAPI(`/gallery/${id}`, { method: 'DELETE' }),
};

// News API - backend uses /admin/* protected routes
export const newsAPI = {
  getAll: () => fetchAPI('/news/admin/all'),
  getById: (id: string) => fetchAPI(`/news/admin/${id}`),
  getStats: () => fetchAPI('/news/admin/stats'),
  create: (data: {
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    image_url?: string;
    pdf_url?: string;
    category?: string;
    location?: string;
    published_date: string;
    is_published?: boolean;
    featured?: boolean;
    author?: string;
    tags?: string[];
  }) => fetchAPI('/news/admin', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    image_url: string;
    pdf_url: string;
    category: string;
    location: string;
    published_date: string;
    is_published: boolean;
    featured: boolean;
    author: string;
    tags: string[];
  }>) => fetchAPI(`/news/admin/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => fetchAPI(`/news/admin/${id}`, { method: 'DELETE' }),
  togglePublish: (id: string) => fetchAPI(`/news/admin/${id}/toggle-publish`, { method: 'PATCH' }),
  toggleFeatured: (id: string) => fetchAPI(`/news/admin/${id}/toggle-featured`, { method: 'PATCH' }),
};

// Projects API - backend uses /:id path params
export const projectsAPI = {
  getAll: (params?: { featured?: boolean; limit?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.featured !== undefined) queryParams.append('featured', String(params.featured));
    if (params?.limit) queryParams.append('limit', String(params.limit));
    const query = queryParams.toString();
    return fetchAPI(`/projects${query ? `?${query}` : ''}`);
  },
  getById: (id: string) => fetchAPI(`/projects/${id}`),
  create: (data: {
    title: string;
    description: string;
    image_url?: string;
    icon?: string;
    beneficiaries?: string;
    duration?: string;
    highlights?: string[];
    link?: string;
    is_external?: boolean;
    is_featured?: boolean;
    display_order?: number;
  }) => fetchAPI('/projects', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{
    title: string;
    description: string;
    image_url: string;
    icon: string;
    beneficiaries: string;
    duration: string;
    highlights: string[];
    link: string;
    is_external: boolean;
    is_featured: boolean;
    display_order: number;
  }>) => fetchAPI(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => fetchAPI(`/projects/${id}`, { method: 'DELETE' }),
  toggleFeatured: (id: string) => fetchAPI(`/projects/${id}/toggle-featured`, { method: 'PATCH' }),
};

// Upload through the CMS API, which checks the admin session, checks the
// file's real type from its bytes, and stores it on the VPS. This replaces
// uploading straight to Supabase Storage from the browser with a key that
// was readable by anyone in the page source.
//
// Same return shape as before, so the panels calling uploadAPI are unchanged.
async function uploadToServer(file: File, bucket: string = 'afosi-images') {
  const form = new FormData();
  form.append('bucket', bucket);
  form.append('file', file);

  // No Content-Type header: the browser sets the multipart boundary itself.
  const response = await fetchWithRetry(`${API_BASE_URL}/upload`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  });

  if (response.status === 401) {
    throw new Error('Session expired. Please log in again.');
  }

  const data = await safeParseJSON(response);
  if (!response.ok) {
    throw new Error((data && data.message) || `Upload failed with status ${response.status}`);
  }

  return {
    success: true,
    data: {
      url: data.data.url,
      path: data.data.path,
      fileName: data.data.fileName,
    },
    message: data.message || 'File uploaded successfully',
  };
}

// Upload API - routes to correct bucket by context
export const uploadAPI = {
  // Gallery images → afosi-images
  uploadImage: async (file: File) => uploadToServer(file, 'afosi-images'),

  // Generic upload - detects bucket by file type and context
  uploadFile: async (formData: FormData, context: 'news' | 'projects' | 'gallery' = 'news') => {
    const file = formData.get('file') as File;
    if (!file) throw new Error('No file provided');
    const bucket = context === 'projects' ? 'afosi-projects' : context === 'gallery' ? 'afosi-images' : 'afosi-news';
    return uploadToServer(file, bucket);
  },

  // Explicit bucket uploads
  uploadNewsFile: async (file: File) => uploadToServer(file, 'afosi-news'),
  uploadProjectImage: async (file: File) => uploadToServer(file, 'afosi-projects'),
};
