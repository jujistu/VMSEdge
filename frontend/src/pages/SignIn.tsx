import { useState } from "react";
import { login, request } from "@/lib/api";
import { Brand } from "@/components/gatewise-shared";
export default function SignIn({
  onLogin,
  reset = false,
}: {
  onLogin?: () => void;
  reset?: boolean;
}) {
  const [mode, setMode] = useState(reset ? "reset" : "login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resetToken] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get("token") || "",
  );
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "login") {
        await login(String(f.get("email")), String(f.get("password")));
        onLogin?.();
      } else if (mode === "forgot") {
        await request("/auth/forgot-password", "POST", {
          email: String(f.get("email")),
        });
        setMessage(
          "If an active account exists, an email with password instructions will be sent.",
        );
      } else {
        await request("/auth/reset-password", "POST", {
          token: resetToken,
          newPassword: String(f.get("password")),
        });
        history.replaceState(null, "", "/reset-password");
        setMessage("Password saved. You can now sign in.");
        setMode("login");
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to connect to the server",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#edf3ff] p-6">
      <div className="panel w-full max-w-md p-9">
        <div className="mb-8 text-[#16345f]">
          <Brand />
        </div>
        <h1 className="mb-6 text-2xl font-bold">
          {mode === "login"
            ? "Sign in to Gatewise"
            : mode === "forgot"
              ? "Recover your account"
              : "Set your password"}
        </h1>
        <form onSubmit={submit} className="space-y-5">
          {mode !== "reset" && (
            <label className="block">
              <span className="form-label">Email address</span>
              <input
                className="field"
                type="email"
                name="email"
                autoComplete="username"
                required
              />
            </label>
          )}
          {mode !== "forgot" && (
            <label className="block">
              <span className="form-label">
                {mode === "reset" ? "New password" : "Password"}
              </span>
              <input
                className="field"
                name="password"
                type="password"
                autoComplete={
                  mode === "reset" ? "new-password" : "current-password"
                }
                minLength={mode === "reset" ? 12 : 1}
                maxLength={128}
                required
              />
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-rose-600">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="text-sm text-emerald-700">
              {message}
            </p>
          )}
          <button disabled={busy} className="btn w-full">
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : mode === "forgot"
                  ? "Send password instructions"
                  : "Save password"}
          </button>
        </form>
        <button
          className="mt-5 text-xs text-blue-600"
          onClick={() => {
            setMode(mode === "login" ? "forgot" : "login");
            setError("");
            setMessage("");
          }}
        >
          {mode === "login" ? "Forgot password?" : "Back to sign in"}
        </button>
      </div>
    </div>
  );
}
