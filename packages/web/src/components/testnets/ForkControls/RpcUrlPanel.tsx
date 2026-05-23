import { useState } from "react";
import { sectionStyle } from "./styles";

export function RpcUrlPanel({ rpcUrl }: { rpcUrl: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rpcUrl);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = rpcUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-md p-3" style={sectionStyle}>
      <label
        className="block text-xs font-medium mb-1.5"
        style={{ color: "var(--color-text-secondary)" }}
      >
        RPC Endpoint
      </label>
      <div className="flex items-center gap-inline">
        <code
          className="flex-1 text-sm px-2 py-1.5 rounded bs overflow-x-auto"
          style={{
            backgroundColor: "var(--color-bg-input)",
            color: "var(--color-accent)",
            fontFamily: "var(--font-mono)",
          }}
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
