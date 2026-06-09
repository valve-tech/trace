import { useEffect, useRef, useState } from "react";
import { useWatchEngine } from "../../hooks/useWatchEngine";
import AlertToast from "../AlertToast";
import type { WatchMatch } from "../../lib/watcher/types";

/**
 * App-level mount point for the client-side watcher. Rendering this once (in
 * App) is what keeps watches live across the whole app — `useWatchEngine` owns
 * the viem subscriptions here, decoupled from any single page. When a watch
 * fires we surface it as an ambient toast (reusing the same `AlertToast` the
 * server-side monitor uses, for visual consistency); the actionable, clickable
 * record lives in the workspace's activity log.
 *
 * Toast lifecycle mirrors App's existing alert toast: show on a NEW match
 * (deduped by id), auto-dismiss after 6s, re-key so each match slides in fresh.
 */
export default function WatchNotifications() {
  const { latest } = useWatchEngine();
  const [toast, setToast] = useState<WatchMatch | null>(null);
  const seenRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (latest === null || latest.id === seenRef.current) return;
    seenRef.current = latest.id;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setToast(latest);
    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, 6_000);
  }, [latest]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  if (toast === null) return null;
  return (
    <AlertToast
      key={toast.id}
      alert={{ name: toast.label, type: toast.kind }}
      match={{ summary: toast.summary }}
    />
  );
}
