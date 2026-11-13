import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

// For everyone with a login. Admins hand out temporary passwords from the
// Blog team tab; this is where people replace them with their own. Other
// sessions are signed out, so a password someone else saw stops working.

const MIN = 12;

export default function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < MIN) return setError(`Use at least ${MIN} characters.`);
    if (next !== repeat) return setError("The new passwords do not match.");
    if (next === current) return setError("Choose a password different from the current one.");
    setSaving(true);
    const { error: err } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setSaving(false);
    if (err) {
      setError(/invalid|incorrect/i.test(err.message || "") ? "Your current password is not right." : err.message || "Could not change the password");
      return;
    }
    setDone(true);
  }

  const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="pw-title" className="relative w-full max-w-sm rounded-xl bg-card border border-border p-6 shadow-2xl text-foreground">
        <div className="flex items-center justify-between mb-4">
          <h3 id="pw-title" className="font-heading font-bold text-lg">Change password</h3>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-accent"><X size={16} /></button>
        </div>
        {done ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400" role="status">
              <Check size={16} /> Password changed. Other devices have been signed out.
            </p>
            <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            {/* Lets password managers file the new password under the right account. */}
            <input type="text" name="username" autoComplete="username" className="hidden" readOnly value="" />
            <div>
              <label htmlFor="pw-current" className="block text-sm font-semibold mb-1.5">Current password</label>
              <input id="pw-current" ref={firstRef} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="pw-new" className="block text-sm font-semibold mb-1.5">New password</label>
              <input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} aria-describedby="pw-hint" />
              <p id="pw-hint" className="mt-1.5 text-xs text-muted-foreground">At least {MIN} characters. A short sentence works well.</p>
            </div>
            <div>
              <label htmlFor="pw-repeat" className="block text-sm font-semibold mb-1.5">Repeat new password</label>
              <input id="pw-repeat" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={inputCls} />
            </div>
            {error && (
              <p role="alert" className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400"><AlertCircle size={16} /> {error}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />} Change password</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
