// Talks to this project's own VPS service (server/applications.js) for the
// built-in application form's submissions — NOT the Vercel serverless
// functions in api/ that the rest of this dashboard uses. Application
// documents (CVs, certificates, insurance proof) are stored privately on
// that VPS's disk, never in the public Supabase Storage buckets the other
// panels use, and are only ever retrievable through this authenticated API.
const APPLICATIONS_BASE_URL =
  (import.meta as any).env?.VITE_APPLICATIONS_API_URL || 'https://api.afosi.org/applications';

const getAuthToken = () => localStorage.getItem('afosi_admin_token');

async function safeParseJSON(response: Response): Promise<any> {
  const text = await response.text();
  if (!text || text.trim() === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text.trim());
  }
}

async function request(path: string, options: RequestInit = {}) {
  const token = getAuthToken();
  const res = await fetch(`${APPLICATIONS_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await safeParseJSON(res);
  if (!res.ok) {
    throw new Error((data && data.message) || `Request failed with status ${res.status}`);
  }
  return data;
}

export type OpportunityType = 'employment' | 'consulting' | 'volunteering';

export interface ApplicationFile {
  fieldKey: string;
  originalName: string;
  storedName: string;
  sizeBytes: number;
}

export interface ApplicationEntry {
  id: string;
  createdAt: string;
  reviewed: boolean;
  opportunity: { id: string | null; title: string; slug: string; type: OpportunityType };
  variant: string;
  fields: Record<string, any>;
  files: ApplicationFile[];
}

export const applicationsApi = {
  list: (params: { type?: OpportunityType; opportunity?: string } = {}): Promise<{ success: boolean; data: ApplicationEntry[] }> => {
    const q = new URLSearchParams();
    if (params.type) q.append('type', params.type);
    if (params.opportunity) q.append('opportunity', params.opportunity);
    const s = q.toString();
    return request(s ? `?${s}` : '');
  },

  markReviewed: (id: string, reviewed: boolean) =>
    request(`/${id}/reviewed`, { method: 'PATCH', body: JSON.stringify({ reviewed }) }),

  // Fetches the file as a blob (carrying the admin's Authorization header,
  // which a plain <a href> download link can't do) and triggers a save —
  // avoids ever putting the admin's session token in a URL.
  async downloadFile(id: string, storedName: string, saveAsName: string) {
    const token = getAuthToken();
    const res = await fetch(`${APPLICATIONS_BASE_URL}/${id}/files/${encodeURIComponent(storedName)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const data = await safeParseJSON(res).catch(() => null);
      throw new Error((data && data.message) || 'Download failed.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = saveAsName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
