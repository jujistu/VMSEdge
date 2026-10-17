import { useState } from "react";
import { request, clearSession } from "@/lib/api";
export default function PasswordForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="panel max-w-2xl space-y-4 p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          await request("/auth/change-password", "POST", {
            currentPassword: String(form.get("currentPassword")),
            newPassword: String(form.get("newPassword")),
          });
          clearSession();
          location.assign("/");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Password change failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-sm font-bold">Change password</h2>
      <label className="block">
        <span className="form-label">Current password</span>
        <input
          className="field"
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          required
        />
      </label>
      <label className="block">
        <span className="form-label">New password</span>
        <input
          className="field"
          type="password"
          name="newPassword"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
        />
      </label>
      <p className="text-xs text-slate-500">
        Changing your password signs out all sessions.
      </p>
      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
      <button className="btn" disabled={busy}>
        {busy ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
