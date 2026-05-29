import { useState } from "react";
import { fundAddress } from "../../../api/testnets";
import { inputStyle, msgColor, sectionStyle } from "./styles";

export function FaucetPanel({ forkId }: { forkId: string }) {
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("10000");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleFund = async () => {
    if (!address.trim()) return;
    setLoading(true);
    setMsg(null);
    try {
      await fundAddress(forkId, address.trim(), amount.trim());
      setMsg(`Funded ${amount} PLS to ${address.slice(0, 10)}...`);
      setAddress("");
    } catch (err) {
      setMsg(`Error: ${err instanceof Error ? err.message : "Failed to fund"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-md p-3" style={sectionStyle}>
      <label
        className="block text-xs font-medium mb-1.5 theme-text-secondary"
      >
        Faucet
      </label>
      <div className="flex flex-col sm:flex-row gap-inline">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x... address"
          className="flex-1 px-2 py-1.5 rounded text-sm theme-mono"
          style={inputStyle}
        />
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (PLS)"
          className="w-32 px-2 py-1.5 rounded text-sm"
          style={inputStyle}
        />
        <button
          onClick={handleFund}
          disabled={loading || !address.trim()}
          className="px-3 py-1.5 text-xs rounded font-medium text-white whitespace-nowrap"
          style={{
            backgroundColor:
              loading || !address.trim()
                ? "var(--color-accent-muted)"
                : "var(--color-accent)",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Funding..." : "Fund"}
        </button>
      </div>
      {msg && (
        <p className="text-xs mt-1.5" style={{ color: msgColor(msg) }}>
          {msg}
        </p>
      )}
    </div>
  );
}
