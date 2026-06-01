import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createIdbPersister } from "./lib/idbPersister";
import App from "./App";
import "./index.css";

// One-time HashRouter → BrowserRouter rewrite. We switched routers to
// satisfy EIP-3091 (wallets and dApps generate canonical URLs like
// /tx/0xabc, not /#/tx/0xabc). This keeps existing bookmarks alive: a
// landing hit at /#/foo gets rewritten to /foo before the router mounts.
// The check runs before render so React Router never sees the hash form.
if (window.location.hash.startsWith("#/")) {
  const newPath = window.location.hash.slice(1) + window.location.search;
  window.history.replaceState(null, "", newPath);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: Infinity,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const persister = createIdbPersister();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      // `buster` discards the persisted cache when bumped. Bump it whenever a
      // backend change alters a long-cached response shape — e.g. the solc-js
      // source-map fix flipped `hasSourceMap` for already-viewed contracts that
      // were cached false under `staleTime: Infinity`. 2026-05-26: the opcode
      // trace switched to the full skeleton (~111k steps vs an old truncated
      // ~50k), and contract-meta gained an events map — both long-cached under
      // staleTime Infinity, so old clients kept serving the stale trace + tree.
      // 2026-05-30: contract-meta switched to retry-then-omit (sparse records
      // on transient upstream failures). Old persisted entries from the
      // Blockscout outage held empty records that staleTime: Infinity pinned
      // forever, masking method names across reloads.
      // 2026-05-31: useTraceSources got the same retry-then-omit treatment
      // (queryKey bumped to `v2`). Old v1 entries held 0-file results from
      // pre-fix sessions that starved the debugger's call-tree fnIndex of
      // every contract's source — silently masking the call-site override.
      // 2026-06-01: staleTime: Infinity hygiene sweep across the rest of
      // the long-cached queries — useTraceSourceMaps, useSignatures, and
      // useContractSource all gained retry-then-omit (or retry-then-throw)
      // semantics and bumped to v2 keys. Old v1 entries from prior outages
      // held empty mappings / no-match results that pinned the debugger
      // call tree's source-map and method-name layers across reloads.
      persistOptions={{ persister, maxAge: Infinity, buster: "2026-06-01-staletime-hygiene-sweep" }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);
