import { useState } from "react";
import SimulationForm from "./components/SimulationForm";
import SimulationResultPanel from "./components/SimulationResult";
import BundleSimulator from "./components/BundleSimulator";
import AlertDashboard from "./components/monitoring/AlertDashboard";
import TestNetDashboard from "./components/testnets/TestNetDashboard";
import RpcDashboard from "./components/rpc/RpcDashboard";
import MethodExplorer from "./components/rpc/MethodExplorer";
import RpcTester from "./components/rpc/RpcTester";
import ExplorerPanel from "./components/explorer/ExplorerPanel";
import DebuggerView from "./components/debugger/DebuggerView";
import ActionsDashboard from "./components/actions/ActionsDashboard";
import type { SimulationResult } from "./types";
import type { MethodDescription, JsonRpcRequest } from "./api/rpc";

type Tab = "single" | "bundle" | "monitoring" | "testnets" | "rpc" | "explorer" | "debugger" | "actions";

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
  const [activeTab, setActiveTab] = useState<Tab>("single");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rpcTesterRequest, setRpcTesterRequest] = useState<JsonRpcRequest | null>(null);

  const handleTryMethod = (method: MethodDescription) => {
    setRpcTesterRequest(method.example.request);
  };

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
            PulseChain Simulator
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
          <button
            onClick={() => setActiveTab("single")}
            className="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
            style={{
              borderColor: activeTab === "single" ? "var(--color-accent)" : "transparent",
              color:
                activeTab === "single"
                  ? "var(--color-text-primary)"
                  : "var(--color-text-secondary)",
              backgroundColor: "transparent",
            }}
          >
            Single Transaction
          </button>
          <button
            onClick={() => setActiveTab("bundle")}
            className="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
            style={{
              borderColor: activeTab === "bundle" ? "var(--color-accent)" : "transparent",
              color:
                activeTab === "bundle"
                  ? "var(--color-text-primary)"
                  : "var(--color-text-secondary)",
              backgroundColor: "transparent",
            }}
          >
            Bundle Simulation
          </button>
          <button
            onClick={() => setActiveTab("monitoring")}
            className="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
            style={{
              borderColor: activeTab === "monitoring" ? "var(--color-accent)" : "transparent",
              color:
                activeTab === "monitoring"
                  ? "var(--color-text-primary)"
                  : "var(--color-text-secondary)",
              backgroundColor: "transparent",
            }}
          >
            Monitoring
          </button>
          <button
            onClick={() => setActiveTab("testnets")}
            className="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
            style={{
              borderColor: activeTab === "testnets" ? "var(--color-accent)" : "transparent",
              color:
                activeTab === "testnets"
                  ? "var(--color-text-primary)"
                  : "var(--color-text-secondary)",
              backgroundColor: "transparent",
            }}
          >
            TestNets
          </button>
          <button
            onClick={() => setActiveTab("rpc")}
            className="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
            style={{
              borderColor: activeTab === "rpc" ? "var(--color-accent)" : "transparent",
              color:
                activeTab === "rpc"
                  ? "var(--color-text-primary)"
                  : "var(--color-text-secondary)",
              backgroundColor: "transparent",
            }}
          >
            RPC
          </button>
          <button
            onClick={() => setActiveTab("explorer")}
            className="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
            style={{
              borderColor: activeTab === "explorer" ? "var(--color-accent)" : "transparent",
              color:
                activeTab === "explorer"
                  ? "var(--color-text-primary)"
                  : "var(--color-text-secondary)",
              backgroundColor: "transparent",
            }}
          >
            Explorer
          </button>
          <button
            onClick={() => setActiveTab("debugger")}
            className="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
            style={{
              borderColor: activeTab === "debugger" ? "var(--color-accent)" : "transparent",
              color:
                activeTab === "debugger"
                  ? "var(--color-text-primary)"
                  : "var(--color-text-secondary)",
              backgroundColor: "transparent",
            }}
          >
            Debugger
          </button>
          <button
            onClick={() => setActiveTab("actions")}
            className="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
            style={{
              borderColor: activeTab === "actions" ? "var(--color-accent)" : "transparent",
              color:
                activeTab === "actions"
                  ? "var(--color-text-primary)"
                  : "var(--color-text-secondary)",
              backgroundColor: "transparent",
            }}
          >
            Actions
          </button>
        </nav>
      </div>

      {/* Content */}
      <main className="p-6 max-w-screen-2xl mx-auto">
        {activeTab === "single" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SimulationForm
              onResult={setResult}
              onLoading={setLoading}
              onError={setError}
            />
            <SimulationResultPanel
              result={result}
              loading={loading}
              error={error}
            />
          </div>
        )}
        {activeTab === "bundle" && <BundleSimulator />}
        {activeTab === "monitoring" && <AlertDashboard />}
        {activeTab === "testnets" && <TestNetDashboard />}
        {activeTab === "rpc" && (
          <div className="space-y-8">
            <RpcDashboard />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h2
                  className="text-sm font-semibold mb-3"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Method Explorer
                </h2>
                <MethodExplorer onTryMethod={handleTryMethod} />
              </div>
              <div>
                <h2
                  className="text-sm font-semibold mb-3"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  RPC Tester
                </h2>
                <RpcTester initialRequest={rpcTesterRequest} />
              </div>
            </div>
          </div>
        )}
        {activeTab === "explorer" && <ExplorerPanel />}
        {activeTab === "debugger" && <DebuggerView />}
        {activeTab === "actions" && <ActionsDashboard />}
      </main>
    </div>
  );
}
