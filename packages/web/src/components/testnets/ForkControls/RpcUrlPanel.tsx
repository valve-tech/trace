import { useState } from "react";
import { sectionStyle } from "./styles";
import { copyToClipboard } from "../../../lib/clipboard";

export function RpcUrlPanel({ rpcUrl }: { rpcUrl: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyToClipboard(rpcUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-md p-3" style={sectionStyle}>
      <label
        className="block text-xs font-medium mb-1.5 theme-text-secondary"
      >
        RPC Endpoint
      </label>
      <div className="flex items-center gap-inline">
        <code
          className="flex-1 text-sm px-2 py-1.5 rounded bs overflow-x-auto theme-input-bg theme-accent theme-mono"
        >
          {rpcUrl}
        </code>
        <button
          onClick={handleCopy}
          className="px-3 py-1.5 text-xs rounded bs whitespace-nowrap"
          style={{
            color: copied
              ? "var(--color-success)"
              : "var(--color-text-secondary)",
            backgroundColor: "transparent",
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
