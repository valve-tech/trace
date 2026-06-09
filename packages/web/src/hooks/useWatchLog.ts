import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  appendMatches,
  loadMatches,
  persistMatches,
  toMatch,
} from "../lib/watcher/log";
import type { WatchMatch, WatchMatchContent, WatchRule } from "../lib/watcher/types";

/**
 * Read-write hook over the IDB-backed match log (the ambient activity feed).
 * The engine appends here; the toast surface and the per-workspace activity
 * panel both read from it, so there's one source of truth that survives
 * navigation. `append` dedupes + caps in the pure `appendMatches` helper and
 * skips the IDB write entirely when nothing new survived (reference equality).
 */

const LOG_QUERY_KEY = ["watch-log"] as const;

export function useWatchLog() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: LOG_QUERY_KEY,
    queryFn: loadMatches,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const append = useMutation({
    mutationFn: async ({
      rule,
      content,
    }: {
      rule: WatchRule;
      content: WatchMatchContent;
    }): Promise<WatchMatch | null> => {
      const current = query.data ?? (await loadMatches());
      const stamped = toMatch(rule, content);
      const next = appendMatches(current, [stamped]);
      if (next === current) return null; // duplicate — nothing changed
      await persistMatches(next);
      queryClient.setQueryData(LOG_QUERY_KEY, next);
      return stamped;
    },
  });

  const clear = useMutation({
    mutationFn: async () => {
      await persistMatches([]);
      queryClient.setQueryData(LOG_QUERY_KEY, []);
    },
  });

  return {
    matches: query.data ?? [],
    append,
    clear,
  };
}
