import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle, Check, Copy, Eye, EyeOff, KeyRound, Loader2, RefreshCw, ShieldCheck, ShieldOff, Trash2, UserPlus, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient, ROLE_LABELS, type Role } from "@/lib/auth-client";
import { ConfirmDialog } from "./BlogAdminPanel";

// Admins only. Sign-up is off (cms-server/src/auth.js), so this is where an
// admin gives someone a login: usually a blog editor, who can then sign in
// to this dashboard and see the Blog tab and nothing else.
//
// Every action here is a Better Auth admin endpoint. The server checks that
// the caller is an admin; an editor's session is refused there, whatever
// this page shows.

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
  createdAt: string | Date;
}

const MIN_PASSWORD = 12;

// 16 characters from an alphabet without look-alikes (0/O, 1/l/I), grouped
// in fours so it can be read out or typed without mistakes.
function generatePassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (n) => alphabet[n % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

const roleOf = (u: TeamUser): Role => (u.role === "admin" || u.role === "editor" ? u.role : "user");
const roleBadge: Record<Role, string> = {
  admin: "bg-primary/15 text-primary border-primary/30",
  editor: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-900",
  user: "bg-muted text-muted-foreground border-border",
};
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          /* the text is on screen to copy by hand */
        }
      }}
      className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-semibold border border-border hover:bg-accent"
      aria-label={label}
    >
      {done ? <Check size={14} /> : <Copy size={14} />} {done ? "Copied" : "Copy"}
    </button>
  );
}

// Shown once after creating an account or resetting a password: the admin
// passes these on privately. They are never shown again.
function Credentials({ email, password, onDone, reset }: { email: string; password: string; onDone: () => void; reset?: boolean }) {
  const signInUrl = window.location.origin;
  const message = `Your AFOSI dashboard login:\n${signInUrl}\nEmail: ${email}\nPassword: ${password}\nPlease change the password after you sign in (bottom of the menu, "Change password").`;
  return (
    <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-50">
      <div className="flex items-start gap-3">
        <Check className="shrink-0 mt-0.5" size={18} />
        <div className="flex-1 space-y-3">
          <p className="font-semibold">{reset ? "Password reset." : "Login created."} Share these details privately: they will not be shown again.</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-mono text-[13px]">
            <dt className="font-sans font-semibold">Sign in at</dt><dd className="break-all">{signInUrl}</dd>
            <dt className="font-sans font-semibold">Email</dt><dd className="break-all">{email}</dd>
            <dt className="font-sans font-semibold">Password</dt><dd className="break-all">{password}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={message} label="Copy the sign-in details" />
            <Button size="sm" variant="outline" onClick={onDone}>Done</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const BlogTeamPanel = () => {
  const { data: session } = authClient.useSession();
  const me = session?.user.id;

  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "editor" as Role, password: generatePassword() });
  const [showPassword, setShowPassword] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<{ email: string; password: string; reset?: boolean } | null>(null);

  const [confirm, setConfirm] = useState<null | { kind: "remove" | "ban" | "reset"; user: TeamUser }>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await authClient.admin.listUsers({
      query: { limit: 200, sortBy: "createdAt", sortDirection: "desc" },
    });
    if (err) setError(err.message || "Could not load accounts");
    else setUsers((data?.users || []) as TeamUser[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    if (!name) return setFormError("Enter their name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setFormError("Enter a valid email address.");
    if (form.password.length < MIN_PASSWORD) return setFormError(`The password must be at least ${MIN_PASSWORD} characters.`);
    setCreating(true);
    const { error: err } = await authClient.admin.createUser({ name, email, password: form.password, role: form.role });
    setCreating(false);
    if (err) {
      setFormError(/exist/i.test(err.message || "") ? "There is already an account with that email." : err.message || "Could not create the login");
      return;
    }
    setIssued({ email, password: form.password });
    setShowForm(false);
    setForm({ name: "", email: "", role: "editor", password: generatePassword() });
    load();
  }

  async function changeRole(u: TeamUser, role: Role) {
    setBusy(u.id);
    setError(null);
    const { error: err } = await authClient.admin.setRole({ userId: u.id, role });
    if (err) setError(err.message || "Could not change the role");
    else setUsers((all) => all.map((x) => (x.id === u.id ? { ...x, role } : x)));
    setBusy(null);
  }

  async function runConfirmed() {
    if (!confirm) return;
    const { kind, user: u } = confirm;
    setBusy(u.id);
    setError(null);
    let err: { message?: string } | null = null;
    if (kind === "remove") {
      ({ error: err } = await authClient.admin.removeUser({ userId: u.id }));
    } else if (kind === "ban") {
      // Banning also ends every session the person has open.
      ({ error: err } = await authClient.admin.banUser({ userId: u.id, banReason: "Access suspended from the Blog team tab" }));
    } else {
      const password = generatePassword();
      ({ error: err } = await authClient.admin.setUserPassword({ userId: u.id, newPassword: password }));
      if (!err) {
        // Sign them out everywhere, so the old password's sessions end too.
        await authClient.admin.revokeUserSessions({ userId: u.id });
        setIssued({ email: u.email, password, reset: true });
      }
    }
    setBusy(null);
    setConfirm(null);
    if (err) setError(err.message || "That did not work");
    else load();
  }

  async function restore(u: TeamUser) {
    setBusy(u.id);
    const { error: err } = await authClient.admin.unbanUser({ userId: u.id });
    if (err) setError(err.message || "Could not restore access");
    setBusy(null);
    load();
  }

  const editors = users.filter((u) => roleOf(u) === "editor").length;
  const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">Blog team</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Give people a dashboard login. <strong className="text-foreground">Blog editors</strong> can write, publish and
            manage blog posts, and see nothing else. <strong className="text-foreground">Admins</strong> can do everything,
            including this page.
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => { setShowForm(true); setIssued(null); }} className="self-start sm:self-auto">
            <UserPlus /> Add a login
          </Button>
        )}
      </div>

      {issued && <Credentials {...issued} onDone={() => setIssued(null)} />}

      {showForm && (
        <form onSubmit={create} className="rounded-lg border border-border bg-card p-5 space-y-4" noValidate>
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-foreground">New login</h3>
            <button type="button" onClick={() => setShowForm(false)} aria-label="Cancel" className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-accent"><X size={16} /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="team-name" className="block text-sm font-semibold mb-1.5">Name</label>
              <input id="team-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="off" className={inputCls} placeholder="Shown as their byline" />
            </div>
            <div>
              <label htmlFor="team-email" className="block text-sm font-semibold mb-1.5">Email</label>
              <input id="team-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" className={inputCls} placeholder="name@afosi.org" />
            </div>
            <div>
              <label htmlFor="team-role" className="block text-sm font-semibold mb-1.5">Access</label>
              <select id="team-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className={inputCls}>
                <option value="editor">Blog editor: blog posts only</option>
                <option value="admin">Admin: everything</option>
              </select>
            </div>
            <div>
              <label htmlFor="team-password" className="block text-sm font-semibold mb-1.5">Temporary password</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    id="team-password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    autoComplete="new-password"
                    className={`${inputCls} font-mono pr-10`}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <Button type="button" variant="outline" size="icon" onClick={() => setForm({ ...form, password: generatePassword() })} aria-label="Generate a new password" title="Generate a new password">
                  <RefreshCw />
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">At least {MIN_PASSWORD} characters. They can change it after signing in.</p>
            </div>
          </div>
          {formError && (
            <p role="alert" className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400"><AlertCircle size={16} /> {formError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" disabled={creating}>{creating ? <Loader2 className="animate-spin" /> : <UserPlus />} Create login</Button>
          </div>
        </form>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="opacity-70 hover:opacity-100"><X size={16} /></button>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border text-sm text-muted-foreground">
          <Users size={16} />
          <span><span className="font-semibold text-foreground tabular-nums">{users.length}</span> accounts · <span className="tabular-nums">{editors}</span> blog {editors === 1 ? "editor" : "editors"}</span>
        </div>
        {loading ? (
          <div className="p-5 space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-md bg-muted animate-pulse" />)}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {users.map((u) => {
              const role = roleOf(u);
              const self = u.id === me;
              return (
                <li key={u.id} className={`flex flex-col md:flex-row md:items-center gap-3 px-5 py-4 ${u.banned ? "opacity-70" : ""}`}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span aria-hidden="true" className="w-10 h-10 shrink-0 rounded-lg bg-foreground text-background flex items-center justify-center font-heading font-bold text-sm">
                      {initials(u.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">
                        {u.name} {self && <span className="text-xs font-semibold text-muted-foreground">(you)</span>}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {u.banned && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900">Suspended</span>
                    )}
                    {self ? (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${roleBadge[role]}`}>{ROLE_LABELS[role]}</span>
                    ) : (
                      <>
                        <label htmlFor={`role-${u.id}`} className="sr-only">Access for {u.name}</label>
                        <select
                          id={`role-${u.id}`}
                          value={role}
                          disabled={busy === u.id}
                          onChange={(e) => changeRole(u, e.target.value as Role)}
                          className={`h-8 rounded-full border px-2.5 text-xs font-semibold ${roleBadge[role]} focus:outline-none focus:ring-2 focus:ring-primary`}
                        >
                          <option value="editor">{ROLE_LABELS.editor}</option>
                          <option value="admin">{ROLE_LABELS.admin}</option>
                          {role === "user" && <option value="user">{ROLE_LABELS.user}</option>}
                        </select>
                      </>
                    )}
                    {!self && (
                      <div className="flex gap-1">
                        {busy === u.id && <Loader2 size={16} className="animate-spin self-center text-muted-foreground" />}
                        <button
                          onClick={() => setConfirm({ kind: "reset", user: u })}
                          className="w-9 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
                          aria-label={`Reset password for ${u.name}`}
                          title="Reset password"
                        >
                          <KeyRound size={16} />
                        </button>
                        {u.banned ? (
                          <button
                            onClick={() => restore(u)}
                            className="w-9 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
                            aria-label={`Restore access for ${u.name}`}
                            title="Restore access"
                          >
                            <ShieldCheck size={16} />
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirm({ kind: "ban", user: u })}
                            className="w-9 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
                            aria-label={`Suspend ${u.name}`}
                            title="Suspend access"
                          >
                            <ShieldOff size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => setConfirm({ kind: "remove", user: u })}
                          className="w-9 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                          aria-label={`Remove ${u.name}`}
                          title="Remove login"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title={
            confirm.kind === "remove" ? `Remove ${confirm.user.name}'s login?`
              : confirm.kind === "ban" ? `Suspend ${confirm.user.name}?`
              : `Reset ${confirm.user.name}'s password?`
          }
          body={
            confirm.kind === "remove"
              ? "They will be signed out and can no longer sign in. Posts they wrote stay published with their byline. This cannot be undone; suspending is reversible."
              : confirm.kind === "ban"
                ? "They are signed out at once and cannot sign in until you restore access. Their posts are not affected."
                : "A new temporary password is generated and they are signed out everywhere. You will see the new password once, to pass on to them."
          }
          confirmLabel={confirm.kind === "remove" ? "Remove login" : confirm.kind === "ban" ? "Suspend" : "Reset password"}
          tone={confirm.kind === "reset" ? "default" : "danger"}
          busy={busy === confirm.user.id}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirmed}
        />
      )}
    </div>
  );
};

export default BlogTeamPanel;
