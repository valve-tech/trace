import { useState } from "react";
import RpcDashboard from "../components/rpc/RpcDashboard";
import MethodExplorer from "../components/rpc/MethodExplorer";
import RpcTester from "../components/rpc/RpcTester";
import type { MethodDescription, JsonRpcRequest } from "../api/rpc";

export default function RpcPage() {
  const [rpcTesterRequest, setRpcTesterRequest] = useState<JsonRpcRequest | null>(null);

  const handleTryMethod = (method: MethodDescription) => {
    setRpcTesterRequest(method.example.request);
  };

  return (
    <div className="space-y-section">
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
  );
}
