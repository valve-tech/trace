import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildRule,
  loadRules,
  persistRules,
  removeRule,
  setEnabledForWorkspace,
  toggleRule,
  type NewRuleInput,
} from "../lib/watcher/rules";
import type { WatchRule } from "../lib/watcher/types";

/**
 * Read-write hook over the IDB-backed watch-rule store. Same shape as
 * `useWorkspaces` — TanStack Query over the blob, mutations replace the whole
 * list, `staleTime: Infinity` because IDB is the source of truth. The engine
 * hook reads the SAME query key, so adding/toggling a rule re-renders the
 * subscriber and the subscription set reconciles automatically.
 */

const RULES_QUERY_KEY = ["watch-rules"] as const;

export function useWatchRules() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: RULES_QUERY_KEY,
    queryFn: loadRules,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: RULES_QUERY_KEY });

  const mutate = async (transform: (rules: WatchRule[]) => WatchRule[]) => {
    const current = query.data ?? (await loadRules());
    const next = transform(current);
    await persistRules(next);
    queryClient.setQueryData(RULES_QUERY_KEY, next);
  };

  const add = useMutation({
    mutationFn: async (input: NewRuleInput) => {
      const rule = buildRule(input);
      await mutate((rules) => [rule, ...rules]);
      return rule;
    },
    onSuccess: invalidate,
  });

  const toggle = useMutation({
    mutationFn: async (id: string) => {
      await mutate((rules) => toggleRule(rules, id));
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await mutate((rules) => removeRule(rules, id));
    },
    onSuccess: invalidate,
  });

  const setWorkspaceEnabled = useMutation({
    mutationFn: async ({
      workspaceId,
      enabled,
    }: {
      workspaceId: string;
      enabled: boolean;
    }) => {
      await mutate((rules) =>
        setEnabledForWorkspace(rules, workspaceId, enabled),
      );
    },
    onSuccess: invalidate,
  });

  return {
    rules: query.data ?? [],
    isLoading: query.isLoading,
    add,
    toggle,
    remove,
    setWorkspaceEnabled,
  };
}
