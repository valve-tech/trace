import { useState, useEffect, useRef } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { useAlertWebSocket, type AlertEvent } from "./hooks/useAlertWebSocket";
import AlertToast from "./components/AlertToast";
import ErrorBoundary from "./components/ErrorBoundary";
import AppShell from "./components/AppShell";
import Landing from "./components/Landing";
import ComponentGallery from "./components/gallery/ComponentGallery";
import SimulationPage from "./pages/SimulationPage";
import BundleSimulator from "./components/BundleSimulator";
import AlertDashboard from "./components/monitoring/AlertDashboard";
import TestNetDashboard from "./components/testnets/TestNetDashboard";
import RpcPage from "./pages/RpcPage";
import ExplorerPanel from "./components/explorer/ExplorerPanel";
import MempoolView from "./components/mempool/MempoolView";
import DebuggerView from "./components/debugger/DebuggerView";
import ActionsDashboard from "./components/actions/ActionsDashboard";
import ForkSimulator from "./components/ForkSimulator";
import TransactionBuilder from "./components/TransactionBuilder";
import ContractDiff from "./components/ContractDiff";
import StorageLayoutViewer from "./components/StorageLayoutViewer";
import VerifyContract from "./components/VerifyContract";
import DraftsIndex from "./components/drafts/DraftsIndex";
import SettingsPanel from "./components/drafts/SettingsPanel";
import WorkspaceList from "./components/workspace/WorkspaceList";
import WorkspaceDetail from "./components/workspace/WorkspaceDetail";
import WatchNotifications from "./components/watcher/WatchNotifications";

export default function App() {
  const [apiStatus, setApiStatus] = useState<"connected" | "disconnected" | "checking">("checking");

  const { lastAlert } = useAlertWebSocket();
  const location = useLocation();
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
      className="h-screen flex flex-col theme-primary-bg"
    >
      {appToast !== null && (
        <AlertToast alert={appToast.data.alert} match={appToast.data.match} />
      )}

      {/* Client-side watcher: owns viem subscriptions app-wide + fires toasts. */}
      <WatchNotifications />

      <AppShell apiStatus={apiStatus}>
        <ErrorBoundary resetKey={location.pathname}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/simulate" element={<SimulationPage />} />
          <Route path="/fork" element={<ForkSimulator />} />
          <Route path="/build" element={<TransactionBuilder />} />
          <Route path="/bundle" element={<BundleSimulator />} />
          <Route path="/monitoring" element={<AlertDashboard />} />
          <Route path="/testnets" element={<TestNetDashboard />} />
          <Route path="/rpc" element={<RpcPage />} />
          <Route path="/explorer" element={<ExplorerPanel />} />
          {/* EIP-3091 scan endpoints — shareable, back/forward-friendly. */}
          <Route path="/tx/:hash" element={<ExplorerPanel />} />
          <Route path="/block/:id" element={<ExplorerPanel />} />
          <Route path="/address/:address" element={<ExplorerPanel />} />
          <Route path="/token/:address" element={<ExplorerPanel />} />
          <Route path="/mempool" element={<MempoolView />} />
          <Route path="/debugger" element={<DebuggerView />} />
          <Route path="/debugger/:txHash/:tab" element={<DebuggerView />} />
          <Route path="/debugger/:txHash" element={<DebuggerView />} />
          <Route path="/actions" element={<ActionsDashboard />} />
          <Route path="/storage" element={<StorageLayoutViewer />} />
          <Route path="/verify" element={<VerifyContract />} />
          <Route path="/diff" element={<ContractDiff />} />
          <Route path="/settings" element={<SettingsPanel />} />
          <Route path="/ui" element={<ComponentGallery />} />
          <Route path="/drafts/*" element={<DraftsIndex />} />
          <Route path="/workspace" element={<WorkspaceList />} />
          <Route path="/workspace/:id" element={<WorkspaceDetail />} />
        </Routes>
        </ErrorBoundary>
      </AppShell>
    </div>
  );
}
