import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import SimulationPage from "./pages/SimulationPage";
import BundleSimulator from "./components/BundleSimulator";
import AlertDashboard from "./components/monitoring/AlertDashboard";
import TestNetDashboard from "./components/testnets/TestNetDashboard";
import RpcPage from "./pages/RpcPage";
import ExplorerPanel from "./components/explorer/ExplorerPanel";
import DebuggerView from "./components/debugger/DebuggerView";
import ActionsDashboard from "./components/actions/ActionsDashboard";

const NAV_ITEMS = [
  { to: "/simulate", label: "Simulate" },
  { to: "/bundle", label: "Bundle" },
  { to: "/monitoring", label: "Monitoring" },
  { to: "/testnets", label: "TestNets" },
  { to: "/rpc", label: "RPC" },
  { to: "/explorer", label: "Explorer" },
  { to: "/debugger", label: "Debugger" },
  { to: "/actions", label: "Actions" },
] as const;

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
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-bg-primary)" }}>
      {/* Header */}
      <header
        className="border-b px-6 py-4 flex items-center justify-between"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderColor: "var(--color-border-default)",
        }}
      >
        <div className="flex items-center gap-3">
          <PulseLogo />
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
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
            style={{ backgroundColor: "var(--color-success)" }}
          />
          Connected
        </div>
      </header>

      {/* Tab Navigation */}
      <div
        className="border-b px-6"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderColor: "var(--color-border-default)",
        }}
      >
        <nav className="flex gap-0">
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
              style={({ isActive }) => ({
                borderColor: isActive ? "var(--color-accent)" : "transparent",
                color: isActive
                  ? "var(--color-text-primary)"
                  : "var(--color-text-secondary)",
                backgroundColor: "transparent",
              })}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Content */}
      <main className="p-6 max-w-screen-2xl mx-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/simulate" replace />} />
          <Route path="/simulate" element={<SimulationPage />} />
          <Route path="/bundle" element={<BundleSimulator />} />
          <Route path="/monitoring" element={<AlertDashboard />} />
          <Route path="/testnets" element={<TestNetDashboard />} />
          <Route path="/rpc" element={<RpcPage />} />
          <Route path="/explorer/*" element={<ExplorerPanel />} />
          <Route path="/debugger" element={<DebuggerView />} />
          <Route path="/debugger/:txHash" element={<DebuggerView />} />
          <Route path="/actions" element={<ActionsDashboard />} />
        </Routes>
      </main>
    </div>
  );
}
