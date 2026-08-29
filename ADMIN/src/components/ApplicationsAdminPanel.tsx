import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle, ChevronDown, Download, FileText, Mail, Phone,
  CheckCircle2, Circle, Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { applicationsApi, type ApplicationEntry, type OpportunityType } from "@/services/applicationsApi";

// Submissions from the website's built-in application form (src/apply.js).
// Documents live privately on the VPS (server/applications.js) — this panel
// never touches Supabase Storage. Categorized by the opportunity's own
// type (employment / consulting / volunteering), then grouped by the
// specific opportunity within that type, since AFOSI runs several jobs and
// consultancies at once.

const TYPE_TABS: { id: OpportunityType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "employment", label: "Employment" },
  { id: "consulting", label: "Consulting" },
  { id: "volunteering", label: "Volunteering" },
];

const TYPE_BADGE_CLASS: Record<OpportunityType, string> = {
  consulting: "bg-secondary",
  volunteering: "bg-green-500 text-white",
  employment: "bg-primary",
};

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function fmtBytes(n: number): string {
  if (!n) return "0 KB";
  const kb = n / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

function pickIdentity(fields: Record<string, any>) {
  return {
    name: fields.applicantName || fields.fullName || "Unknown applicant",
    email: fields.applicantEmail || fields.emailAddress || "",
    phone: fields.applicantPhone || fields.phoneNumber || "",
  };
}

const ApplicationsAdminPanel = () => {
  const [applications, setApplications] = useState<ApplicationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<OpportunityType | "all">("all");
  const [unreviewedOnly, setUnreviewedOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await applicationsApi.list();
      setApplications(res.data || []);
    } catch (err: any) {
      setError(err.message || "Failed to fetch applications. Is the applications service reachable?");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleReviewed = async (app: ApplicationEntry) => {
    const next = !app.reviewed;
    setApplications((prev) => prev.map((a) => (a.id === app.id ? { ...a, reviewed: next } : a)));
    try {
      await applicationsApi.markReviewed(app.id, next);
    } catch (err: any) {
      setApplications((prev) => prev.map((a) => (a.id === app.id ? { ...a, reviewed: !next } : a)));
      alert("Failed to update: " + err.message);
    }
  };

  const handleDownload = async (app: ApplicationEntry, fileKey: string, originalName: string) => {
    const dlKey = `${app.id}:${fileKey}`;
    setDownloadingKey(dlKey);
    try {
      await applicationsApi.downloadFile(app.id, fileKey, originalName);
    } catch (err: any) {
      alert("Failed to download: " + err.message);
    } finally {
      setDownloadingKey(null);
    }
  };

  const filtered = useMemo(() => {
    return applications
      .filter((a) => activeType === "all" || a.opportunity?.type === activeType)
      .filter((a) => !unreviewedOnly || !a.reviewed);
  }, [applications, activeType, unreviewedOnly]);

  const grouped = useMemo(() => {
    const map = new Map<string, ApplicationEntry[]>();
    for (const app of filtered) {
      const key = app.opportunity?.title || "Untitled opportunity";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(app);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  const unreviewedCount = applications.filter((a) => !a.reviewed).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading applications...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-red-900 mb-2">Error Loading Applications</h3>
        <p className="text-red-700 mb-4">{error}</p>
        <Button onClick={fetchApplications}>Try Again</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <h2 className="text-2xl font-heading font-bold text-foreground">
          Applications ({filtered.length})
          {unreviewedCount > 0 && (
            <Badge className="ml-3 bg-orange-100 text-orange-700 align-middle">{unreviewedCount} unreviewed</Badge>
          )}
        </h2>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={unreviewedOnly}
            onChange={(e) => setUnreviewedOnly(e.target.checked)}
            className="accent-primary"
          />
          Show only unreviewed
        </label>
      </div>

      {/* Categorized by opportunity type — employment / consulting / volunteering */}
      <div className="flex flex-wrap gap-2 mb-8">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveType(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              activeType === tab.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {grouped.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Inbox className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No applications yet in this category.</p>
        </div>
      )}

      <div className="space-y-8">
        {grouped.map(([title, apps]) => (
          <div key={title}>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-lg font-heading font-bold text-foreground">{title}</h3>
              <Badge className={TYPE_BADGE_CLASS[apps[0].opportunity?.type] || "bg-primary"}>
                {apps[0].opportunity?.type}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {apps.length} application{apps.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="space-y-3">
              {apps.map((app) => {
                const identity = pickIdentity(app.fields);
                const isOpen = expandedId === app.id;
                return (
                  <motion.div
                    key={app.id}
                    layout
                    className="bg-card rounded-xl border border-border shadow-sm overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedId(isOpen ? null : app.id)}
                      className="w-full flex flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleReviewed(app); }}
                          title={app.reviewed ? "Mark as unreviewed" : "Mark as reviewed"}
                          className="shrink-0"
                        >
                          {app.reviewed ? (
                            <CheckCircle2 size={20} className="text-green-600" />
                          ) : (
                            <Circle size={20} className="text-muted-foreground" />
                          )}
                        </button>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{identity.name}</p>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            {identity.email && (
                              <span className="flex items-center gap-1"><Mail size={12} />{identity.email}</span>
                            )}
                            {identity.phone && (
                              <span className="flex items-center gap-1"><Phone size={12} />{identity.phone}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {new Date(app.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        {app.files.length > 0 && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <FileText size={13} />{app.files.length}
                          </span>
                        )}
                        <ChevronDown size={18} className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </div>
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-border overflow-hidden"
                        >
                          <div className="p-5 space-y-5">
                            {app.files.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Documents</p>
                                <div className="flex flex-wrap gap-2">
                                  {app.files.map((f) => {
                                    const dlKey = `${app.id}:${f.storedName}`;
                                    return (
                                      <Button
                                        key={f.storedName}
                                        size="sm"
                                        variant="outline"
                                        disabled={downloadingKey === dlKey}
                                        onClick={() => handleDownload(app, f.storedName, f.originalName)}
                                        className="gap-2"
                                      >
                                        <Download size={14} />
                                        {humanizeKey(f.fieldKey)}
                                        <span className="text-muted-foreground">({fmtBytes(f.sizeBytes)})</span>
                                      </Button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Submitted answers</p>
                              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                                {Object.entries(app.fields)
                                  .filter(([, v]) => v !== "" && v != null && !(Array.isArray(v) && v.length === 0) && typeof v !== "boolean")
                                  .map(([key, value]) => (
                                    <div key={key} className="min-w-0">
                                      <dt className="text-xs text-muted-foreground">{humanizeKey(key)}</dt>
                                      <dd className="text-sm text-foreground break-words whitespace-pre-wrap">
                                        {Array.isArray(value) ? value.join(", ") : String(value)}
                                      </dd>
                                    </div>
                                  ))}
                              </dl>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ApplicationsAdminPanel;
