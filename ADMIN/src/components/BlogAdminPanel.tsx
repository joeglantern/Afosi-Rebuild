import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, ArrowLeft, Bold, CalendarClock, Check, Eye, Heading2, Heading3, ImagePlus, Italic,
  Link2, List, ListOrdered, Loader2, Minus, PenLine, Plus, Quote, Search, Star, StarOff, Trash2, Upload, X,
  ExternalLink, FileText, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { blogAPI, uploadAPI, type BlogPost, type BlogPostInput, type BlogStats } from "@/services/api";
import { renderMarkdown, markdownToText } from "@site/markdown.js";
import "@site-public/blog-prose.css";

// The public site the "View" links point at. Same default as the rest of
// the dashboard assumes: the site lives at afosi.org.
const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, "") || "https://afosi.org";
const postUrl = (slug: string) => `${SITE_URL}/blog-post.html?slug=${encodeURIComponent(slug)}`;

const DEFAULT_CATEGORIES = ["Stories", "Climate & Environment", "Youth Leadership", "Education", "Technology", "Events", "Partnerships"];
const LIMITS = { title: 200, excerpt: 400, tags: 12, tag: 40, alt: 300 };

type StatusFilter = "all" | "published" | "scheduled" | "draft";

// ── helpers ─────────────────────────────────────────────────────────────────
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

// <input type="datetime-local"> works in local time without a zone.
function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

const slugify = (text: string) =>
  text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 120);

const wordCount = (md: string) => markdownToText(md).split(/\s+/).filter(Boolean).length;

function postState(p: Pick<BlogPost, "status" | "scheduled">) {
  if (p.status === "draft") return { label: "Draft", cls: "bg-muted text-muted-foreground border-border" };
  if (p.scheduled) return { label: "Scheduled", cls: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-900" };
  return { label: "Published", cls: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900" };
}

// ── list ────────────────────────────────────────────────────────────────────
const BlogAdminPanel = () => {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [stats, setStats] = useState<BlogStats | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BlogPost | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, s] = await Promise.all([
        blogAPI.list({ status: filter, q: query.trim(), limit: 200 }),
        blogAPI.stats(),
      ]);
      setPosts(list.data || []);
      setStats(s.data);
    } catch (e: any) {
      setError(e.message || "Could not load blog posts");
    } finally {
      setLoading(false);
    }
  }, [filter, query]);

  useEffect(() => {
    if (editing === null) load();
  }, [load, editing]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const toggleFeatured = async (p: BlogPost) => {
    setBusyId(p.id);
    try {
      const r = await blogAPI.toggleFeatured(p.id);
      setPosts((all) => all.map((x) => (x.id === p.id ? { ...x, featured: r.data.featured } : x)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    const p = confirmDelete;
    setBusyId(p.id);
    try {
      await blogAPI.delete(p.id);
      setConfirmDelete(null);
      setNotice(`Deleted “${p.title}”`);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (editing !== null) {
    return (
      <PostEditor
        id={editing === "new" ? null : editing}
        stats={stats}
        onClose={(message) => {
          setEditing(null);
          if (message) setNotice(message);
        }}
      />
    );
  }

  const filters: { id: StatusFilter; label: string; count?: number }[] = [
    { id: "all", label: "All", count: stats?.total },
    { id: "published", label: "Published", count: stats?.published },
    { id: "scheduled", label: "Scheduled", count: stats?.scheduled },
    { id: "draft", label: "Drafts", count: stats?.drafts },
  ];

  return (
    <div className="space-y-6">
      {/* Heading row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">Blog posts</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Write stories for the AFOSI blog. Drafts stay private until you publish them.
          </p>
        </div>
        <Button onClick={() => setEditing("new")} className="self-start sm:self-auto">
          <Plus /> New post
        </Button>
      </div>

      {notice && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          <Check size={16} /> {notice}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Published", value: stats?.published, icon: Eye },
          { label: "Scheduled", value: stats?.scheduled, icon: CalendarClock },
          { label: "Drafts", value: stats?.drafts, icon: FileText },
          { label: "Total reads", value: stats?.totalViews, icon: PenLine },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-card rounded-lg p-4 border border-border">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-sm font-semibold">{label}</span>
              <Icon size={16} />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value ?? "—"}</p>
          </div>
        ))}
      </div>

      {/* Filters + search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter posts by status" className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                filter === f.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:border-primary"
              }`}
            >
              {f.label}
              {typeof f.count === "number" && <span className="ml-2 tabular-nums opacity-75">{f.count}</span>}
            </button>
          ))}
        </div>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
          className="relative w-full lg:w-80"
        >
          <label htmlFor="blog-admin-search" className="sr-only">Search posts</label>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            id="blog-admin-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, excerpt or author"
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </form>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="opacity-70 hover:opacity-100"><X size={16} /></button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-border bg-card p-12 text-center">
          <PenLine className="mx-auto mb-3 text-muted-foreground" size={32} />
          <p className="font-semibold text-foreground">
            {query || filter !== "all" ? "No posts match" : "No blog posts yet"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {query || filter !== "all" ? "Try another filter or search." : "Your first story is one click away."}
          </p>
          {!query && filter === "all" && (
            <Button onClick={() => setEditing("new")} className="mt-5"><Plus /> Write a post</Button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {posts.map((p) => {
            const st = postState(p);
            const live = p.status === "published" && !p.scheduled;
            return (
              <li key={p.id} className="bg-card rounded-lg border border-border hover:border-primary/50 transition-colors">
                <div className="flex flex-col md:flex-row gap-4 p-4">
                  <button
                    onClick={() => setEditing(p.id)}
                    className="relative w-full md:w-40 h-28 shrink-0 overflow-hidden rounded-md bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-primary"
                    aria-label={`Edit ${p.title}`}
                  >
                    {p.cover_image_url ? (
                      <img src={p.cover_image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center font-heading text-4xl font-bold text-primary">
                        {(p.category || p.title).charAt(0).toUpperCase()}
                      </span>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-accent text-accent-foreground">{p.category}</span>
                      {p.featured && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 inline-flex items-center gap-1">
                          <Star size={12} /> Featured
                        </span>
                      )}
                    </div>
                    <button onClick={() => setEditing(p.id)} className="text-left">
                      <h3 className="font-heading font-bold text-lg leading-snug text-foreground hover:text-primary transition-colors">
                        {p.title}
                      </h3>
                    </button>
                    {p.excerpt && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{p.excerpt}</p>}
                    <p className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      <span>By {p.author_name || "AFOSI Team"}</span>
                      {p.status === "published" && (
                        <span>{p.scheduled ? `Goes live ${fmtDateTime(p.published_at)}` : `Published ${fmtDate(p.published_at)}`}</span>
                      )}
                      <span>Edited {fmtDate(p.updated_at)}</span>
                      <span className="tabular-nums">{p.views} reads</span>
                      <span>{p.reading_minutes} min read</span>
                    </p>
                  </div>
                  <div className="flex md:flex-col items-center md:items-end justify-end gap-2 shrink-0">
                    <Button size="sm" onClick={() => setEditing(p.id)}><PenLine /> Edit</Button>
                    <div className="flex gap-1">
                      {live && (
                        <a
                          href={postUrl(p.slug)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-9 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
                          aria-label={`View ${p.title} on the site`}
                          title="View on the site"
                        >
                          <ExternalLink size={16} />
                        </a>
                      )}
                      <button
                        onClick={() => toggleFeatured(p)}
                        disabled={busyId === p.id}
                        className="w-9 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                        aria-label={p.featured ? `Stop featuring ${p.title}` : `Feature ${p.title}`}
                        title={p.featured ? "Stop featuring" : "Feature on the blog page"}
                      >
                        {p.featured ? <StarOff size={16} /> : <Star size={16} />}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(p)}
                        className="w-9 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                        aria-label={`Delete ${p.title}`}
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this post?"
          body={<>“{confirmDelete.title}” will be removed from the dashboard and the website. This cannot be undone.</>}
          confirmLabel="Delete post"
          busy={busyId === confirmDelete.id}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={remove}
        />
      )}
    </div>
  );
};

// ── confirm dialog ─────────────────────────────────────────────────────────
export function ConfirmDialog(props: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  tone?: "danger" | "default";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const danger = (props.tone ?? "danger") === "danger";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={props.onCancel} />
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="relative w-full max-w-md rounded-xl bg-card border border-border p-6 shadow-2xl">
        <h3 id="confirm-title" className="font-heading font-bold text-lg text-foreground">{props.title}</h3>
        <div className="mt-2 text-sm text-muted-foreground">{props.body}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button ref={cancelRef} variant="outline" onClick={props.onCancel} disabled={props.busy}>Cancel</Button>
          <Button variant={danger ? "destructive" : "default"} onClick={props.onConfirm} disabled={props.busy}>
            {props.busy && <Loader2 className="animate-spin" />} {props.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── editor ──────────────────────────────────────────────────────────────────
interface Draft {
  title: string;
  slug: string;
  slugTouched: boolean;
  excerpt: string;
  content: string;
  cover_image_url: string;
  cover_image_alt: string;
  category: string;
  tags: string[];
  published_at: string; // datetime-local value
  featured: boolean;
  author_name: string;
}

const emptyDraft: Draft = {
  title: "", slug: "", slugTouched: false, excerpt: "", content: "", cover_image_url: "", cover_image_alt: "",
  category: "Stories", tags: [], published_at: "", featured: false, author_name: "",
};

const fromPost = (p: BlogPost): Draft => ({
  title: p.title,
  slug: p.slug,
  slugTouched: true,
  excerpt: p.excerpt || "",
  content: p.content || "",
  cover_image_url: p.cover_image_url || "",
  cover_image_alt: p.cover_image_alt || "",
  category: p.category,
  tags: p.tags || [],
  published_at: toLocalInput(p.published_at),
  featured: p.featured,
  author_name: p.author_name || "",
});

const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

// A copy of unsaved work is kept in this browser, so a dropped connection or
// an expired session does not lose a long post.
const backupKey = (id: string | null) => `afosi_blog_backup_${id || "new"}`;
type Backup = { draft: Draft; savedAt: number };
function readBackup(id: string | null): Backup | null {
  try {
    const raw = localStorage.getItem(backupKey(id));
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}
function writeBackup(id: string | null, draft: Draft) {
  try {
    localStorage.setItem(backupKey(id), JSON.stringify({ draft, savedAt: Date.now() }));
  } catch {
    /* storage full or blocked: the server copy is still there */
  }
}
function clearBackup(id: string | null) {
  try {
    localStorage.removeItem(backupKey(id));
  } catch {
    /* nothing to clear */
  }
}

function PostEditor({ id, stats, onClose }: { id: string | null; stats: BlogStats | null; onClose: (message?: string) => void }) {
  const [postId, setPostId] = useState<string | null>(id);
  const [post, setPost] = useState<BlogPost | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saved, setSaved] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState<null | "draft" | "publish" | "unpublish">(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [uploading, setUploading] = useState<null | "cover" | "inline">(null);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const dirty = !sameDraft(draft, saved);
  const isPublished = post?.status === "published";
  const futureDate = draft.published_at && new Date(draft.published_at).getTime() > Date.now();

  // Load the post (or start a blank one) and look for unsaved work.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let base = emptyDraft;
      if (id) {
        try {
          const r = await blogAPI.get(id);
          if (cancelled) return;
          setPost(r.data);
          base = fromPost(r.data);
        } catch (e: any) {
          if (!cancelled) setError(e.message || "Could not load this post");
        }
      }
      if (cancelled) return;
      setDraft(base);
      setSaved(base);
      const b = readBackup(id);
      if (b && !sameDraft(b.draft, base)) setBackup(b);
      setLoading(false);
      if (!id) setTimeout(() => titleRef.current?.focus(), 50);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Back up unsaved work, a moment after typing stops.
  useEffect(() => {
    if (loading || !dirty) return;
    const t = setTimeout(() => writeBackup(postId, draft), 800);
    return () => clearTimeout(t);
  }, [draft, dirty, loading, postId]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => {
      const next = { ...d, [key]: value };
      if (key === "title" && !d.slugTouched) next.slug = slugify(String(value));
      return next;
    });
    if (fieldErrors[key]) setFieldErrors((f) => ({ ...f, [key]: undefined }));
  };

  // ── saving ────────────────────────────────────────────────────────────────
  function validate(publishing: boolean) {
    const errs: Partial<Record<keyof Draft, string>> = {};
    if (!draft.title.trim()) errs.title = "Give the post a title.";
    if (!draft.category.trim()) errs.category = "Choose a category.";
    if (draft.cover_image_url && !draft.cover_image_alt.trim()) {
      errs.cover_image_alt = "Describe the cover image for people using screen readers.";
    }
    if (publishing && !draft.content.trim()) errs.content = "Write the story before publishing it.";
    setFieldErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) {
      document.getElementById(`blog-field-${first}`)?.focus();
      return false;
    }
    return true;
  }

  const payload = (status?: "draft" | "published"): BlogPostInput => ({
    title: draft.title.trim(),
    ...(draft.slug.trim() ? { slug: draft.slug.trim() } : {}),
    excerpt: draft.excerpt.trim(),
    content: draft.content,
    cover_image_url: draft.cover_image_url || null,
    cover_image_alt: draft.cover_image_alt.trim() || null,
    category: draft.category.trim(),
    tags: draft.tags,
    published_at: fromLocalInput(draft.published_at),
    featured: draft.featured,
    author_name: draft.author_name.trim(),
    ...(status ? { status } : {}),
  });

  async function save(mode: "draft" | "publish" | "unpublish") {
    const publishing = mode === "publish";
    if (!validate(publishing)) return;
    setSaving(mode);
    setError(null);
    try {
      const status = mode === "draft" ? (isPublished ? undefined : "draft") : mode === "publish" ? "published" : "draft";
      const r = postId ? await blogAPI.update(postId, payload(status)) : await blogAPI.create(payload(status ?? "draft"));
      const next = fromPost(r.data);
      clearBackup(postId); // the "new" backup when this was the first save
      setPost(r.data);
      setPostId(r.data.id);
      setDraft(next);
      setSaved(next);
      setBackup(null);
      if (mode === "publish") {
        onClose(r.data.scheduled ? `Scheduled “${r.data.title}” for ${fmtDateTime(r.data.published_at)}` : `Published “${r.data.title}”`);
        return;
      }
      setSavedFlash(mode === "unpublish" ? "Moved back to drafts" : "Saved");
      setTimeout(() => setSavedFlash(null), 2500);
    } catch (e: any) {
      setError(e.message || "Could not save");
      if (/slug/i.test(e.message || "")) setFieldErrors((f) => ({ ...f, slug: e.message }));
    } finally {
      setSaving(null);
      setConfirmUnpublish(false);
    }
  }

  // Ctrl/Cmd+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!saving) save("draft");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── Markdown toolbar ─────────────────────────────────────────────────────
  // Where the cursor goes after a toolbar edit. Applied in a layout effect,
  // straight after React has written the new text into the textarea (which
  // moves the caret to the end). Not requestAnimationFrame: browsers pause
  // that in background tabs, and the cursor would be lost.
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  useLayoutEffect(() => {
    const sel = pendingSelection.current;
    const ta = textareaRef.current;
    if (!sel || !ta) return;
    pendingSelection.current = null;
    ta.focus();
    ta.setSelectionRange(sel.start, sel.end);
  }, [draft.content]);

  function edit(fn: (value: string, start: number, end: number) => { value: string; start: number; end: number }) {
    const ta = textareaRef.current;
    if (!ta) return;
    const r = fn(draft.content, ta.selectionStart, ta.selectionEnd);
    if (r.value === draft.content) {
      ta.focus();
      ta.setSelectionRange(r.start, r.end);
      return;
    }
    pendingSelection.current = { start: r.start, end: r.end };
    set("content", r.value);
  }
  const wrap = (before: string, after: string, placeholder: string) =>
    edit((v, s, e) => {
      const sel = v.slice(s, e) || placeholder;
      return { value: v.slice(0, s) + before + sel + after + v.slice(e), start: s + before.length, end: s + before.length + sel.length };
    });
  // Prefix every selected line (or the current one). On an empty line the
  // placeholder is inserted and selected, so typing replaces it and keeps
  // the "## " or "- " in front; otherwise the cursor goes after the text.
  const linePrefix = (prefix: string | ((i: number) => string), placeholder: string) =>
    edit((v, s, e) => {
      const lineStart = v.lastIndexOf("\n", s - 1) + 1;
      const lineEnd = v.indexOf("\n", e) === -1 ? v.length : v.indexOf("\n", e);
      const existing = v.slice(lineStart, lineEnd);
      const usePlaceholder = !existing.trim();
      const block = usePlaceholder ? placeholder : existing;
      const prefixFor = (i: number) => (typeof prefix === "function" ? prefix(i) : prefix);
      const out = block
        .split("\n")
        .map((l, i) => prefixFor(i) + l.replace(/^(#{1,4}\s|>\s?|[-*+]\s|\d+[.)]\s)/, ""))
        .join("\n");
      const value = v.slice(0, lineStart) + out + v.slice(lineEnd);
      if (usePlaceholder) {
        const at = lineStart + prefixFor(0).length;
        return { value, start: at, end: at + placeholder.length };
      }
      return { value, start: lineStart + out.length, end: lineStart + out.length };
    });
  // Insert a block on its own lines. With a range, that part of it is
  // selected (an image's alt text, to be typed over); without one the cursor
  // lands on the empty line after it.
  const insertBlock = (text: string, select?: { from: number; to: number }) =>
    edit((v, s) => {
      const before = v.slice(0, s);
      const lead = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
      const value = before + lead + text + "\n\n" + v.slice(s);
      const at = before.length + lead.length;
      if (select) return { value, start: at + select.from, end: at + select.to };
      const after = at + text.length + 2;
      return { value, start: after, end: after };
    });
  const insertLink = () =>
    edit((v, s, e) => {
      const sel = v.slice(s, e) || "link text";
      const text = `[${sel}](https://)`;
      const urlStart = s + sel.length + 3;
      return { value: v.slice(0, s) + text + v.slice(e), start: urlStart, end: urlStart + 8 };
    });

  const onTextareaKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === "b") { e.preventDefault(); wrap("**", "**", "bold text"); }
    else if (k === "i") { e.preventDefault(); wrap("*", "*", "italic text"); }
    else if (k === "k") { e.preventDefault(); insertLink(); }
  };

  // ── uploads ──────────────────────────────────────────────────────────────
  async function upload(file: File, kind: "cover" | "inline") {
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file (JPEG, PNG, GIF or WebP).");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("That image is over 20 MB. Please use a smaller one.");
      return;
    }
    setUploading(kind);
    setError(null);
    try {
      const r = await uploadAPI.uploadBlogImage(file);
      if (kind === "cover") {
        set("cover_image_url", r.data.url);
        setTimeout(() => document.getElementById("blog-field-cover_image_alt")?.focus(), 50);
      } else {
        const alt = "Describe this photo";
        insertBlock(`![${alt}](${r.data.url})`, { from: 2, to: 2 + alt.length });
      }
    } catch (e: any) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  // ── tags ─────────────────────────────────────────────────────────────────
  const addTag = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, " ").slice(0, LIMITS.tag);
    if (!t) return;
    if (draft.tags.some((x) => x.toLowerCase() === t.toLowerCase())) return setTagInput("");
    if (draft.tags.length >= LIMITS.tags) return;
    set("tags", [...draft.tags, t]);
    setTagInput("");
  };

  const previewHtml = useMemo(() => (tab === "preview" ? renderMarkdown(draft.content, { idPrefix: "preview-" }) : ""), [tab, draft.content]);
  const words = useMemo(() => wordCount(draft.content), [draft.content]);
  const categories = useMemo(
    () => Array.from(new Set([...(stats?.categories || []), ...DEFAULT_CATEGORIES])),
    [stats]
  );

  const leave = () => (dirty ? setConfirmLeave(true) : onClose());

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-3">
        <Loader2 className="animate-spin" /> Loading post…
      </div>
    );
  }

  const status = post ? postState(post) : { label: "New draft", cls: "bg-muted text-muted-foreground border-border" };
  const publishLabel = isPublished ? "Update" : futureDate ? "Schedule" : "Publish";
  const inputCls = (err?: string) =>
    `w-full rounded-lg border ${err ? "border-red-500" : "border-border"} bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary`;
  const FieldError = ({ name }: { name: keyof Draft }) =>
    fieldErrors[name] ? (
      <p id={`blog-field-${name}-error`} role="alert" className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
        {fieldErrors[name]}
      </p>
    ) : null;

  const toolbar: { label: string; icon: typeof Bold; run: () => void }[] = [
    { label: "Heading", icon: Heading2, run: () => linePrefix("## ", "Section heading") },
    { label: "Subheading", icon: Heading3, run: () => linePrefix("### ", "Subheading") },
    { label: "Bold (Ctrl+B)", icon: Bold, run: () => wrap("**", "**", "bold text") },
    { label: "Italic (Ctrl+I)", icon: Italic, run: () => wrap("*", "*", "italic text") },
    { label: "Link (Ctrl+K)", icon: Link2, run: insertLink },
    { label: "Quote", icon: Quote, run: () => linePrefix("> ", "A line worth repeating") },
    { label: "Bulleted list", icon: List, run: () => linePrefix("- ", "List item") },
    { label: "Numbered list", icon: ListOrdered, run: () => linePrefix((i) => `${i + 1}. `, "List item") },
    { label: "Divider", icon: Minus, run: () => insertBlock("---") },
  ];

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="sticky top-0 z-20 -mx-4 lg:-mx-6 -mt-4 lg:-mt-6 px-4 lg:px-6 py-3 bg-background/95 backdrop-blur border-b border-border flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={leave}><ArrowLeft /> All posts</Button>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${status.cls}`}>{status.label}</span>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {savedFlash ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold"><Check size={14} /> {savedFlash}</span>
          ) : dirty ? "Unsaved changes" : post ? `Saved ${fmtDateTime(post.updated_at)}` : ""}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {post && post.status === "published" && !post.scheduled && (
            <a href={postUrl(post.slug)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium hover:bg-accent">
              <ExternalLink size={16} /> View
            </a>
          )}
          {isPublished && (
            <Button variant="outline" size="sm" onClick={() => setConfirmUnpublish(true)} disabled={!!saving}>
              Unpublish
            </Button>
          )}
          {!isPublished && (
            <Button variant="outline" size="sm" onClick={() => save("draft")} disabled={!!saving}>
              {saving === "draft" && <Loader2 className="animate-spin" />} Save draft
            </Button>
          )}
          <Button size="sm" onClick={() => save("publish")} disabled={!!saving}>
            {saving === "publish" ? <Loader2 className="animate-spin" /> : futureDate && !isPublished ? <CalendarClock /> : <Check />}
            {publishLabel}
          </Button>
        </div>
      </div>

      {backup && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <Clock size={16} />
          <span className="flex-1">Unsaved work from {fmtDateTime(new Date(backup.savedAt).toISOString())} was found in this browser.</span>
          <Button size="sm" variant="outline" onClick={() => { setDraft(backup.draft); setBackup(null); }}>Restore it</Button>
          <Button size="sm" variant="ghost" onClick={() => { clearBackup(postId); setBackup(null); }}>Discard</Button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="opacity-70 hover:opacity-100"><X size={16} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        {/* Main column */}
        <div className="space-y-5 min-w-0">
          <div>
            <label htmlFor="blog-field-title" className="block text-sm font-semibold mb-1.5">Title <span className="text-red-500">*</span></label>
            <input
              id="blog-field-title"
              ref={titleRef}
              value={draft.title}
              maxLength={LIMITS.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="A headline people will want to read"
              aria-invalid={!!fieldErrors.title}
              aria-describedby={fieldErrors.title ? "blog-field-title-error" : undefined}
              className={`${inputCls(fieldErrors.title)} text-xl font-heading font-bold py-3`}
            />
            <FieldError name="title" />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <label htmlFor="blog-field-slug" className="font-semibold">Web address:</label>
              <span className="truncate max-w-full">{SITE_URL.replace(/^https?:\/\//, "")}/blog-post.html?slug=</span>
              <input
                id="blog-field-slug"
                value={draft.slug}
                onChange={(e) => setDraft((d) => ({ ...d, slug: slugify(e.target.value), slugTouched: true }))}
                placeholder="made-from-the-title"
                aria-invalid={!!fieldErrors.slug}
                className={`flex-1 min-w-[180px] rounded-md border ${fieldErrors.slug ? "border-red-500" : "border-border"} bg-background px-2 py-1 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary`}
              />
              {draft.slugTouched && !post && (
                <button type="button" className="underline hover:text-foreground" onClick={() => setDraft((d) => ({ ...d, slug: slugify(d.title), slugTouched: false }))}>
                  Match title
                </button>
              )}
            </div>
            {isPublished && draft.slug !== saved.slug && (
              <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">Changing the address of a published post breaks links people have already shared.</p>
            )}
            <FieldError name="slug" />
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="blog-field-excerpt" className="block text-sm font-semibold">Summary</label>
              <span className="text-xs text-muted-foreground tabular-nums">{draft.excerpt.length}/{LIMITS.excerpt}</span>
            </div>
            <textarea
              id="blog-field-excerpt"
              value={draft.excerpt}
              maxLength={LIMITS.excerpt}
              rows={2}
              onChange={(e) => set("excerpt", e.target.value)}
              placeholder="One or two sentences shown on the blog page and when the post is shared."
              className={inputCls()}
            />
          </div>

          {/* Body */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
              <div role="tablist" aria-label="Editor mode" className="flex rounded-md bg-muted p-0.5 mr-2">
                {(["write", "preview"] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-1.5 rounded text-sm font-semibold capitalize ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {tab === "write" && (
                <>
                  {toolbar.map(({ label, icon: Icon, run }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={run}
                      aria-label={label}
                      title={label}
                      className="w-9 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Icon size={17} />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => inlineInputRef.current?.click()}
                    disabled={!!uploading}
                    aria-label="Insert an image"
                    title="Insert an image"
                    className="h-9 px-2.5 rounded-md flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                  >
                    {uploading === "inline" ? <Loader2 size={17} className="animate-spin" /> : <ImagePlus size={17} />}
                    <span className="hidden sm:inline">Image</span>
                  </button>
                  <input
                    ref={inlineInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) upload(f, "inline");
                    }}
                  />
                </>
              )}
              <span className="ml-auto pr-2 text-xs text-muted-foreground tabular-nums">
                {words} words · {Math.max(1, Math.round(words / 200))} min read
              </span>
            </div>

            {tab === "write" ? (
              <>
                <label htmlFor="blog-field-content" className="sr-only">Story</label>
                <textarea
                  id="blog-field-content"
                  ref={textareaRef}
                  value={draft.content}
                  onChange={(e) => set("content", e.target.value)}
                  onKeyDown={onTextareaKey}
                  aria-invalid={!!fieldErrors.content}
                  placeholder={"Start writing…\n\nUse the toolbar for headings, lists, quotes and images. Leave an empty line between paragraphs."}
                  className="block w-full min-h-[520px] resize-y bg-background px-5 py-4 text-[15px] leading-7 font-mono focus:outline-none"
                  spellCheck
                />
              </>
            ) : (
              <div className="bg-[#FBF6EE] text-[#17150F] px-6 sm:px-10 py-10 min-h-[520px]" style={{ fontFamily: "'Manrope', system-ui, sans-serif" }}>
                <div className="max-w-[646px] mx-auto">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6E6559] mb-3" style={{ fontFamily: "'Space Mono', monospace" }}>
                    Preview · {draft.category || "Uncategorised"}
                  </p>
                  <h1 className="text-4xl font-bold leading-tight tracking-tight m-0" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {draft.title || "Untitled post"}
                  </h1>
                  {draft.excerpt && <p className="mt-4 text-lg text-[#5A5346] leading-relaxed">{draft.excerpt}</p>}
                  {draft.cover_image_url && (
                    <img src={draft.cover_image_url} alt={draft.cover_image_alt} className="mt-8 w-full aspect-[16/8.5] object-cover border-2 border-[#17150F]" style={{ boxShadow: "7px 7px 0 #17150F" }} />
                  )}
                  {/* renderMarkdown escapes everything it is given (src/markdown.js). */}
                  <article className="af-prose mt-10" dangerouslySetInnerHTML={{ __html: previewHtml || "<p><em>Nothing written yet.</em></p>" }} />
                </div>
              </div>
            )}
          </div>
          <FieldError name="content" />
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-semibold hover:text-foreground">Formatting help</summary>
            <div className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 font-mono">
              <span>## Section heading</span><span>### Smaller heading</span>
              <span>**bold**  *italic*</span><span>[link text](https://…)</span>
              <span>- bullet  /  1. numbered</span><span>&gt; a quote</span>
              <span>![description](image-url "caption")</span><span>--- divider</span>
            </div>
            <p className="mt-2">Use the Image button to upload photos; images from other websites may not display on afosi.org.</p>
          </details>
        </div>

        {/* Side column */}
        <aside className="space-y-5 xl:sticky xl:top-20">
          <section className="rounded-lg border border-border bg-card p-4 space-y-4">
            <h3 className="font-heading font-bold text-sm uppercase tracking-wide text-muted-foreground">Publishing</h3>
            <div>
              <label htmlFor="blog-field-published_at" className="block text-sm font-semibold mb-1.5">Publish date</label>
              <input
                id="blog-field-published_at"
                type="datetime-local"
                value={draft.published_at}
                onChange={(e) => set("published_at", e.target.value)}
                className={inputCls()}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {draft.published_at
                  ? futureDate
                    ? "In the future: the post goes live automatically then."
                    : "Shown as the post's date."
                  : "Leave empty to use the moment you publish."}
              </p>
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={draft.featured} onChange={(e) => set("featured", e.target.checked)} className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" />
              <span>
                <span className="block text-sm font-semibold">Feature this post</span>
                <span className="block text-xs text-muted-foreground">Shown large at the top of the blog page.</span>
              </span>
            </label>
            <div>
              <label htmlFor="blog-field-author_name" className="block text-sm font-semibold mb-1.5">Byline</label>
              <input
                id="blog-field-author_name"
                value={draft.author_name}
                maxLength={120}
                onChange={(e) => set("author_name", e.target.value)}
                placeholder="Your name (default)"
                className={inputCls()}
              />
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="font-heading font-bold text-sm uppercase tracking-wide text-muted-foreground">Cover image</h3>
            {draft.cover_image_url ? (
              <div className="relative overflow-hidden rounded-md border border-border">
                <img src={draft.cover_image_url} alt="" className="w-full aspect-[16/10] object-cover" />
                <div className="absolute top-2 right-2 flex gap-1">
                  <button type="button" onClick={() => coverInputRef.current?.click()} className="h-8 px-2.5 rounded-md bg-black/70 text-white text-xs font-semibold hover:bg-black/85">Replace</button>
                  <button type="button" onClick={() => { set("cover_image_url", ""); set("cover_image_alt", ""); }} aria-label="Remove cover image" className="h-8 w-8 rounded-md bg-black/70 text-white flex items-center justify-center hover:bg-black/85"><X size={14} /></button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={!!uploading}
                className="w-full aspect-[16/10] rounded-md border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-50"
              >
                {uploading === "cover" ? <Loader2 className="animate-spin" /> : <Upload />}
                <span className="font-semibold">{uploading === "cover" ? "Uploading…" : "Upload a cover image"}</span>
                <span className="text-xs">JPEG, PNG or WebP, landscape works best</span>
              </button>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) upload(f, "cover");
              }}
            />
            {draft.cover_image_url && (
              <div>
                <label htmlFor="blog-field-cover_image_alt" className="block text-sm font-semibold mb-1.5">
                  Image description <span className="text-red-500">*</span>
                </label>
                <input
                  id="blog-field-cover_image_alt"
                  value={draft.cover_image_alt}
                  maxLength={LIMITS.alt}
                  onChange={(e) => set("cover_image_alt", e.target.value)}
                  placeholder="e.g. Volunteers planting seedlings in Kajiado"
                  aria-invalid={!!fieldErrors.cover_image_alt}
                  className={inputCls(fieldErrors.cover_image_alt)}
                />
                <FieldError name="cover_image_alt" />
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-4">
            <h3 className="font-heading font-bold text-sm uppercase tracking-wide text-muted-foreground">Organise</h3>
            <div>
              <label htmlFor="blog-field-category" className="block text-sm font-semibold mb-1.5">Category <span className="text-red-500">*</span></label>
              <input
                id="blog-field-category"
                list="blog-categories"
                value={draft.category}
                maxLength={60}
                onChange={(e) => set("category", e.target.value)}
                aria-invalid={!!fieldErrors.category}
                className={inputCls(fieldErrors.category)}
              />
              <datalist id="blog-categories">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
              <FieldError name="category" />
            </div>
            <div>
              <label htmlFor="blog-field-tags" className="block text-sm font-semibold mb-1.5">Tags</label>
              {draft.tags.length > 0 && (
                <ul className="flex flex-wrap gap-1.5 mb-2">
                  {draft.tags.map((t) => (
                    <li key={t} className="inline-flex items-center gap-1 rounded-full bg-accent text-accent-foreground pl-2.5 pr-1 py-0.5 text-xs font-semibold">
                      {t}
                      <button type="button" onClick={() => set("tags", draft.tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`} className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-black/10">
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                id="blog-field-tags"
                list="blog-tags"
                value={tagInput}
                disabled={draft.tags.length >= LIMITS.tags}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag(tagInput);
                  } else if (e.key === "Backspace" && !tagInput && draft.tags.length) {
                    set("tags", draft.tags.slice(0, -1));
                  }
                }}
                onBlur={() => addTag(tagInput)}
                placeholder={draft.tags.length >= LIMITS.tags ? "Tag limit reached" : "Type a tag, press Enter"}
                className={inputCls()}
              />
              <datalist id="blog-tags">
                {(stats?.tags || []).map((t) => <option key={t} value={t} />)}
              </datalist>
              <p className="mt-1.5 text-xs text-muted-foreground">Up to {LIMITS.tags}. Readers can browse posts by tag.</p>
            </div>
          </section>
        </aside>
      </div>

      {confirmLeave && (
        <ConfirmDialog
          title="Leave without saving?"
          body="Your changes are backed up in this browser, but they are not saved to the website yet."
          confirmLabel="Leave"
          onCancel={() => setConfirmLeave(false)}
          onConfirm={() => onClose()}
        />
      )}
      {confirmUnpublish && (
        <ConfirmDialog
          title="Unpublish this post?"
          body="It will disappear from the website and go back to your drafts. You can publish it again at any time."
          confirmLabel="Unpublish"
          tone="default"
          busy={saving === "unpublish"}
          onCancel={() => setConfirmUnpublish(false)}
          onConfirm={() => save("unpublish")}
        />
      )}
    </div>
  );
}

export default BlogAdminPanel;
