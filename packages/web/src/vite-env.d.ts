/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute backend origin baked into the IPFS build (e.g. https://explore.valve.city). Empty/undefined → same-origin. */
  readonly VITE_API_BASE?: string;
  /** Set ("1") for the IPFS dual-build: HashRouter + relative asset base. Unset → canonical BrowserRouter build. */
  readonly VITE_IPFS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
