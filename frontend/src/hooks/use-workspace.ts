import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  refreshSession,
  setExpiredHandler,
  sendCommand,
  Update,
  logout,
} from "@/lib/api";
import { loadWorkspace } from "@/lib/workspace";
import { toast } from "sonner";
export function useWorkspace() {
  const [snapshot, setSnapshot] =
    useState<Awaited<ReturnType<typeof loadWorkspace>>>();
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const snapshotRef = useRef<
    Awaited<ReturnType<typeof loadWorkspace>> | undefined
  >(undefined);
  const mutation = useRef(false);
  const pending = useRef<{ fingerprint: string; key: string } | undefined>(
    undefined,
  );
  const refresh = useCallback(async (changedPath?: string) => {
    const current = ++generation.current;
    try {
      const next = await loadWorkspace(snapshotRef.current, changedPath);
      if (current === generation.current) {
        snapshotRef.current = next;
        setSnapshot(next);
        setError("");
      }
    } catch (e) {
      if (current === generation.current)
        setError(e instanceof Error ? e.message : "Unable to load workspace");
      throw e;
    }
  }, []);
  const signedIn = useCallback(async () => {
    setAuthenticated(true);
    setLoading(true);
    try {
      await refresh();
    } catch {
      /* Error is displayed with a retry action. */
    } finally {
      setLoading(false);
    }
  }, [refresh]);
  useEffect(() => {
    let active = true;
    setExpiredHandler(() => {
      generation.current++;
      snapshotRef.current = undefined;
      setSnapshot(undefined);
      setAuthenticated(false);
    });
    refreshSession()
      .then(() => {
        if (active) return signedIn();
      })
      .catch((e) => {
        if (active && !(e instanceof ApiError && e.status === 401))
          setError(
            e instanceof Error ? e.message : "Unable to restore session",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      setExpiredHandler(() => {});
    };
  }, [signedIn]);
  useEffect(() => {
    if (!authenticated) return;
    const timer = setInterval(() => {
      if (!document.hidden && !mutation.current) void refresh().catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [authenticated, refresh]);
  const update: Update = async (command) => {
    if (mutation.current) return false;
    mutation.current = true;
    setBusy(true);
    try {
      const fingerprint = JSON.stringify(command);
      if (pending.current?.fingerprint !== fingerprint)
        pending.current = { fingerprint, key: crypto.randomUUID() };
      await sendCommand(command, pending.current.key);
      pending.current = undefined;
      try {
        await refresh(command.path);
      } catch {
        toast.error(
          "Saved, but the workspace could not refresh. Use Retry to reload.",
        );
      }
      return true;
    } catch (e) {
      if (e instanceof ApiError) pending.current = undefined;
      toast.error(e instanceof Error ? e.message : "Request failed");
      if (e instanceof ApiError && e.status === 409)
        await refresh().catch(() => {});
      return false;
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  };
  const signOut = async () => {
    try {
      await logout();
      generation.current++;
      snapshotRef.current = undefined;
      setSnapshot(undefined);
      setAuthenticated(false);
      setError("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to sign out");
    }
  };
  return {
    snapshot,
    authenticated,
    loading,
    error,
    busy,
    refresh,
    signedIn,
    signOut,
    update,
  };
}
