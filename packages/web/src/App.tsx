import { useState, useEffect, useRef } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAlertWebSocket, type AlertEvent } from "./hooks/useAlertWebSocket";
import AlertToast from "./components/AlertToast";
import AppShell from "./components/AppShell";
import SimulationPage from "./pages/SimulationPage";
import BundleSimulator from "./components/BundleSimulator";
import AlertDashboard from "./components/monitoring/AlertDashboard";
import TestNetDashboard from "./components/testnets/TestNetDashboard";
import RpcPage from "./pages/RpcPage";
import ExplorerPanel from "./components/explorer/ExplorerPanel";
import DebuggerView from "./components/debugger/DebuggerView";
import ActionsDashboard from "./components/actions/ActionsDashboard";
import ForkSimulator from "./components/ForkSimulator";
import TransactionBuilder from "./components/TransactionBuilder";
import ContractDiff from "./components/ContractDiff";
import StorageLayoutViewer from "./components/StorageLayoutViewer";
import DraftsIndex from "./components/drafts/DraftsIndex";
import SettingsPanel from "./components/drafts/SettingsPanel";

function PulseLogo() {
  return (
    <div className="relative pulse-icon flex items-center justify-center w-8 h-8">
      <svg viewBox="0 0 32 32" className="w-8 h-8" fill="none">
        <circle cx="16" cy="16" r="14" fill="#8B5CF6" />
        <path
          d="M8 18 L12 10 L16 20 L20 8 L24 18"
          stroke="white"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export default function App() {
  const [apiStatus, setApiStatus] = useState<"connected" | "disconnected" | "checking">("checking");

  const { lastAlert } = useAlertWebSocket();
  const [appToast, setAppToast] = useState<AlertEvent | null>(null);
  const appToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevLastAlertRef = useRef<AlertEvent | null>(null);

  useEffect(() => {
    if (lastAlert === null || lastAlert === prevLastAlertRef.current) return;
    prevLastAlertRef.current = lastAlert;

    if (appToastTimerRef.current !== null) {
      clearTimeout(appToastTimerRef.current);
    }
    setAppToast(lastAlert);
    appToastTimerRef.current = setTimeout(() => {
      setAppToast(null);
      appToastTimerRef.current = null;
    }, 6_000);
  }, [lastAlert]);

  useEffect(() => {
    return () => {
      if (appToastTimerRef.current !== null) {
        clearTimeout(appToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/health", { signal: AbortSignal.timeout(3000) });
        if (cancelled) return;
        const data = (await res.json()) as { status: string; db: boolean };
        setApiStatus(data.status === "ok" && data.db ? "connected" : "disconnected");
      } catch {
        if (!cancelled) setApiStatus("disconnected");
      }
    };

    void check();
    const interval = setInterval(() => void check(), 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div
      className="h-screen flex flex-col"
      style={{ backgroundColor: "var(--color-bg-primary)" }}
    >
      {appToast !== null && (
        <AlertToast alert={appToast.data.alert} match={appToast.data.match} />
      )}

      <header
        className="px-6 py-3 flex items-center justify-between shrink-0"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          boxShadow: "0 1px 0 0 var(--color-border-default)",
        }}
      >
        <div className="flex items-center gap-3">
          <PulseLogo />
          <h1 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
            PulseChain Dev Platform
          </h1>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              backgroundColor: "var(--color-accent-muted)",
              color: "var(--color-accent)",
            }}
          >
            Devnet
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          <div
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor:
                apiStatus === "connected" ? "var(--color-success)"
                : apiStatus === "disconnected" ? "var(--color-danger)"
                : "var(--color-warning)",
            }}
          />
          {apiStatus === "connected" ? "Connected" : apiStatus === "disconnected" ? "Disconnected" : "Checking..."}
        </div>
      </header>

      <main className="flex-1 min-h-0">
        <AppShell>
          <Routes>
            <Route path="/" element={<Navigate to="/simulate" replace />} />
            <Route path="/simulate" element={<SimulationPage />} />
            <Route path="/fork" element={<ForkSimulator />} />
            <Route path="/build" element={<TransactionBuilder />} />
            <Route path="/bundle" element={<BundleSimulator />} />
            <Route path="/monitoring" element={<AlertDashboard />} />
            <Route path="/testnets" element={<TestNetDashboard />} />
            <Route path="/rpc" element={<RpcPage />} />
            <Route path="/explorer/*" element={<ExplorerPanel />} />
            <Route path="/debugger" element={<DebuggerView />} />
            <Route path="/debugger/:txHash" element={<DebuggerView />} />
            <Route path="/actions" element={<ActionsDashboard />} />
            <Route path="/storage" element={<StorageLayoutViewer />} />
            <Route path="/diff" element={<ContractDiff />} />
            <Route path="/settings" element={<SettingsPanel />} />
            <Route path="/drafts/*" element={<DraftsIndex />} />
          </Routes>
        </AppShell>
      </main>
    </div>
  );
}
