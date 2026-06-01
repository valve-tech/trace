import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addItem,
  createWorkspace,
  loadStore,
  persistWorkspaces,
  removeItem,
  renameWorkspace,
} from "../lib/workspace/store";
import type { Workspace, WorkspaceItemKind } from "../lib/workspace/types";

/**
 * Read-write hook over the IDB-backed Workspace store. We route the read
 * through TanStack Query for two reasons: (1) downstream UI gets the same
 * suspend/loading semantics as other data, (2) when an opt-in cloud sync
 * lands later, the queryFn becomes the integration point — no consumer
 * changes needed.
 *
 * staleTime: Infinity because IDB IS the source of truth for v0; we only
 * invalidate after we mutate. Mutations replace the whole list (single-blob
 * shape, see store.ts) so partial-write races aren't possible within one tab.
 */

const WS_QUERY_KEY = ["workspaces"] as const;

export function useWorkspaces() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: WS_QUERY_KEY,
    queryFn: async () => (await loadStore()).workspaces,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: WS_QUERY_KEY });

  const mutate = async (transform: (ws: Workspace[]) => Workspace[]) => {
    const current = query.data ?? (await loadStore()).workspaces;
    const next = transform(current);
    await persistWorkspaces(next);
    queryClient.setQueryData(WS_QUERY_KEY, next);
  };

  const create = useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      const fresh = createWorkspace(name, description);
      await mutate((ws) => [fresh, ...ws]);
      return fresh;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await mutate((ws) => ws.filter((w) => w.id !== id));
    },
    onSuccess: invalidate,
  });

  const rename = useMutation({
    mutationFn: async ({ id, name, description }: { id: string; name: string; description?: string }) => {
      await mutate((ws) => ws.map((w) => (w.id === id ? renameWorkspace(w, name, description) : w)));
    },
    onSuccess: invalidate,
  });

  const addToWorkspace = useMutation({
    mutationFn: async ({
      id,
      kind,
      value,
      chainId,
      label,
    }: {
      id: string;
      kind: WorkspaceItemKind;
      value: string;
      chainId?: number;
      label?: string;
    }) => {
      await mutate((ws) =>
        ws.map((w) => (w.id === id ? addItem(w, { kind, value, chainId, label }) : w)),
      );
    },
    onSuccess: invalidate,
  });

  const removeFromWorkspace = useMutation({
    mutationFn: async ({ id, itemId }: { id: string; itemId: string }) => {
      await mutate((ws) => ws.map((w) => (w.id === id ? removeItem(w, itemId) : w)));
    },
    onSuccess: invalidate,
  });

  return {
    workspaces: query.data ?? [],
    isLoading: query.isLoading,
    create,
    remove,
    rename,
    addToWorkspace,
    removeFromWorkspace,
  };
}
