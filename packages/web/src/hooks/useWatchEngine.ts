import { useEffect, useRef, useState } from "react";
import { ruleSignature, subscribeRule } from "../lib/watcher/engine";
import { useWatchRules } from "./useWatchRules";
import { useWatchLog } from "./useWatchLog";
import type {
  WatchMatch,
  WatchMatchContent,
  WatchRule,
} from "../lib/watcher/types";

/**
 * The watcher's running heart. Mount it ONCE, app-wide (see WatchNotifications),
 * so watches stay live while the user browses anywhere — not just on the
 * workspace page. It owns the set of live viem subscriptions and reconciles it
 * against the enabled rules: each rule maps to a stable `ruleSignature`, and we
 * only open/close subscriptions whose signature entered/left the set. Unrelated
 * re-renders (and label-only edits) never churn a subscription.
 *
 * The match handler is kept in a ref (updated each render via an effect, never
 * during render) so the subscribe effect can depend only on the signature
 * string — opening a subscription doesn't re-bind when the log mutation's
 * identity shifts. This is a subscription-handle ref, not derived state smuggled
 * across renders.
 */
export function useWatchEngine(): { latest: WatchMatch | null } {
  const { rules } = useWatchRules();
  const { append } = useWatchLog();
  const [latest, setLatest] = useState<WatchMatch | null>(null);

  const enabled = rules.filter((r) => r.enabled);
  const signature = enabled.map(ruleSignature).join("\n");

  // Latest-callback ref: append a fired match to the log, and surface the
  // newly-persisted one (null when it was a dedupe no-op) for the toast.
  const handlerRef = useRef<(rule: WatchRule, content: WatchMatchContent) => void>(
    () => {},
  );
  useEffect(() => {
    handlerRef.current = (rule, content) => {
      void append.mutateAsync({ rule, content }).then((m) => {
        if (m) setLatest(m);
      });
    };
  });

  const subsRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    const active = subsRef.current;
    const wanted = new Map(enabled.map((r) => [ruleSignature(r), r]));

    for (const [sig, unsub] of active) {
      if (!wanted.has(sig)) {
        unsub();
        active.delete(sig);
      }
    }
    for (const [sig, rule] of wanted) {
      if (!active.has(sig)) {
        active.set(
          sig,
          subscribeRule(rule, (r, c) => handlerRef.current(r, c)),
        );
      }
    }
    // `signature` fully captures the wanted set; depending on `enabled` (a new
    // array each render) would re-run every render for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    const active = subsRef.current;
    return () => {
      for (const unsub of active.values()) unsub();
      active.clear();
    };
  }, []);

  return { latest };
}
