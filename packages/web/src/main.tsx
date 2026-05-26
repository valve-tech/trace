import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createIdbPersister } from "./lib/idbPersister";
import App from "./App";
import "./index.css";

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
      persistOptions={{ persister, maxAge: Infinity, buster: "2026-05-26-skeleton-events" }}
    >
      <HashRouter>
        <App />
      </HashRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);
