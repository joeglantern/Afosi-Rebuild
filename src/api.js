// AFOSI CMS API client — talks to the same Express backend the old React site
// used (backend/ + Supabase). Content created in the old admin dashboard
// (admin.afosi.org → Supabase) is served read-only through these endpoints.
//
// Base URL precedence: VITE_API_URL env → live production API.
const API_BASE_URL =
  (import.meta.env && import.meta.env.VITE_API_URL) || 'https://api.afosi.org/api';

// ── Safe response parser ─────────────────────────────────────────────────────
// The server occasionally returns plain-text errors (e.g. "Too many requests")
// instead of JSON; reading text first avoids the "Unexpected token" crash.
async function safeParseJSON(response) {
  const text = await response.text();
  if (!text || text.trim() === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text.trim());
  }
}

// ── Exponential backoff on HTTP 429 ──────────────────────────────────────────
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function fetchWithRetry(url, config, attempt = 0) {
  const response = await fetch(url, config);
  if (response.status === 429 && attempt < MAX_RETRIES) {
    const retryAfter = response.headers.get('Retry-After');
    const delay = retryAfter
      ? parseInt(retryAfter, 10) * 1000
      : BASE_DELAY_MS * Math.pow(2, attempt); // 1s → 2s → 4s
    await new Promise((r) => setTimeout(r, delay));
    return fetchWithRetry(url, config, attempt + 1);
  }
  return response;
}

async function fetchAPI(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  };
  const response = await fetchWithRetry(url, config);
  const data = await safeParseJSON(response);
  if (!response.ok) {
    throw new Error((data && (data.message || data.error)) || `Request failed (${response.status})`);
  }
  return data;
}

export const API_BASE = API_BASE_URL;

// ── News ─────────────────────────────────────────────────────────────────────
export const newsAPI = {
  getAll(params = {}) {
    const q = new URLSearchParams();
    if (params.category) q.append('category', params.category);
    if (params.featured !== undefined) q.append('featured', String(params.featured));
    if (params.limit) q.append('limit', String(params.limit));
    if (params.offset) q.append('offset', String(params.offset));
    const s = q.toString();
    return fetchAPI(`/news${s ? `?${s}` : ''}`);
  },
  getBySlug: (slug) => fetchAPI(`/news/slug/${slug}`),
};

// ── Gallery ──────────────────────────────────────────────────────────────────
export const galleryAPI = {
  getAll(category) {
    const q = category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : '';
    return fetchAPI(`/gallery${q}`);
  },
};

// ── Opportunities ────────────────────────────────────────────────────────────
export const opportunitiesAPI = {
  getAll: () => fetchAPI('/opportunities'),
  getById: (id) => fetchAPI(`/opportunities/${id}`),
  getBySlug: (slug) => fetchAPI(`/opportunities/slug/${slug}`),
};

// ── Applications (opportunity apply flow) ────────────────────────────────────
export const applyAPI = {
  // Upload a single document; returns { url, ... } pointing at Supabase storage.
  async upload(file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_BASE_URL}/apply/upload`, { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Upload failed.');
    }
    return res.json();
  },
  // Submit the completed application; backend emails HR via Resend.
  submit: (payload) =>
    fetchAPI('/apply', { method: 'POST', body: JSON.stringify(payload) }),
};
