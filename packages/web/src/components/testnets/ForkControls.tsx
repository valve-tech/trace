import { useState } from "react";
import {
  type ForkInfo,
  destroyFork,
  takeSnapshot,
  revertSnapshot,
  fundAddress,
  mineBlocks,
  timeTravel,
} from "../../api/testnets";

interface SnapshotEntry {
  id: string;
  takenAt: string;
}

interface ForkControlsProps {
  fork: ForkInfo;
  onDestroyed: () => void;
  onRefresh: () => void;
}

export default function ForkControls({
  fork,
  onDestroyed,
  onRefresh,
}: ForkControlsProps) {
  // Faucet state
  const [faucetAddress, setFaucetAddress] = useState("");
  const [faucetAmount, setFaucetAmount] = useState("10000");
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);

  // Snapshot state
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([]);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);

  // Time travel state
  const [ttSeconds, setTtSeconds] = useState("3600");
  const [ttLoading, setTtLoading] = useState(false);
  const [ttMsg, setTtMsg] = useState<string | null>(null);

  // Mine state
  const [mineCount, setMineCount] = useState("1");
  const [mineLoading, setMineLoading] = useState(false);
  const [mineMsg, setMineMsg] = useState<string | null>(null);

  // Destroy state
  const [confirmDestroy, setConfirmDestroy] = useState(false);
  const [destroyLoading, setDestroyLoading] = useState(false);

  // Copy RPC URL
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fork.rpcUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = fork.rpcUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Fund
  const handleFund = async () => {
    if (!faucetAddress.trim()) return;
    setFaucetLoading(true);
    setFaucetMsg(null);
    try {
      await fundAddress(fork.id, faucetAddress.trim(), faucetAmount.trim());
      setFaucetMsg(`Funded ${faucetAmount} PLS to ${faucetAddress.slice(0, 10)}...`);
      setFaucetAddress("");
    } catch (err) {
      setFaucetMsg(
        `Error: ${err instanceof Error ? err.message : "Failed to fund"}`,
      );
    } finally {
      setFaucetLoading(false);
    }
  };

  // Snapshot
  const handleSnapshot = async () => {
    setSnapshotLoading(true);
    setSnapshotMsg(null);
    try {
      const snapId = await takeSnapshot(fork.id);
      setSnapshots((prev) => [
        ...prev,
        { id: snapId, takenAt: new Date().toLocaleTimeString() },
      ]);
      setSnapshotMsg(`Snapshot created: ${snapId}`);
    } catch (err) {
      setSnapshotMsg(
        `Error: ${err instanceof Error ? err.message : "Failed to snapshot"}`,
      );
    } finally {
      setSnapshotLoading(false);
    }
  };

  const handleRevert = async (snapshotId: string) => {
    setSnapshotLoading(true);
    setSnapshotMsg(null);
    try {
      await revertSnapshot(fork.id, snapshotId);
      setSnapshotMsg(`Reverted to snapshot ${snapshotId}`);
      onRefresh();
    } catch (err) {
      setSnapshotMsg(
        `Error: ${err instanceof Error ? err.message : "Failed to revert"}`,
      );
    } finally {
      setSnapshotLoading(false);
    }
  };

  // Time Travel
  const handleTimeTravel = async () => {
    const secs = parseInt(ttSeconds, 10);
    if (isNaN(secs) || secs < 1) return;
    setTtLoading(true);
    setTtMsg(null);
    try {
      await timeTravel(fork.id, secs);
      setTtMsg(`Advanced time by ${secs.toLocaleString()} seconds`);
      onRefresh();
    } catch (err) {
      setTtMsg(
        `Error: ${err instanceof Error ? err.message : "Failed to time travel"}`,
      );
    } finally {
      setTtLoading(false);
    }
  };

  // Mine Blocks
  const handleMine = async () => {
    const count = parseInt(mineCount, 10);
    if (isNaN(count) || count < 1) return;
    setMineLoading(true);
    setMineMsg(null);
    try {
      await mineBlocks(fork.id, count);
      setMineMsg(`Mined ${count} block${count > 1 ? "s" : ""}`);
      onRefresh();
    } catch (err) {
      setMineMsg(
        `Error: ${err instanceof Error ? err.message : "Failed to mine blocks"}`,
      );
    } finally {
      setMineLoading(false);
    }
  };

  // Destroy
  const handleDestroy = async () => {
    setDestroyLoading(true);
    try {
      await destroyFork(fork.id);
      onDestroyed();
    } catch {
      setDestroyLoading(false);
    }
  };

  const sectionStyle = {
    backgroundColor: "var(--color-bg-tertiary)",
    borderColor: "var(--color-border-muted)",
  };

  return (
    <div className="space-y-4 mt-4">
      {/* RPC URL */}
      <div className="rounded-md border p-3" style={sectionStyle}>
        <label
          className="block text-xs font-medium mb-1.5"
          style={{ color: "var(--color-text-secondary)" }}
        >
          RPC Endpoint
        </label>
        <div className="flex items-center gap-2">
          <code
            className="flex-1 text-sm px-2 py-1.5 rounded border overflow-x-auto"
            style={{
              backgroundColor: "var(--color-bg-input)",
              borderColor: "var(--color-border-default)",
              color: "var(--color-accent)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {fork.rpcUrl}
          </code>
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 text-xs rounded border whitespace-nowrap"
            style={{
              borderColor: "var(--color-border-default)",
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

      {/* Faucet */}
      <div className="rounded-md border p-3" style={sectionStyle}>
        <label
          className="block text-xs font-medium mb-1.5"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Faucet
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={faucetAddress}
            onChange={(e) => setFaucetAddress(e.target.value)}
            placeholder="0x... address"
            className="flex-1 px-2 py-1.5 rounded border text-sm"
            style={{
              backgroundColor: "var(--color-bg-input)",
              borderColor: "var(--color-border-default)",
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-mono)",
            }}
          />
          <input
            type="text"
            value={faucetAmount}
            onChange={(e) => setFaucetAmount(e.target.value)}
            placeholder="Amount (PLS)"
            className="w-32 px-2 py-1.5 rounded border text-sm"
            style={{
              backgroundColor: "var(--color-bg-input)",
              borderColor: "var(--color-border-default)",
              color: "var(--color-text-primary)",
            }}
          />
          <button
            onClick={handleFund}
            disabled={faucetLoading || !faucetAddress.trim()}
            className="px-3 py-1.5 text-xs rounded font-medium text-white whitespace-nowrap"
            style={{
              backgroundColor:
                faucetLoading || !faucetAddress.trim()
                  ? "var(--color-accent-muted)"
                  : "var(--color-accent)",
              opacity: faucetLoading ? 0.7 : 1,
            }}
          >
            {faucetLoading ? "Funding..." : "Fund"}
          </button>
        </div>
        {faucetMsg && (
          <p
            className="text-xs mt-1.5"
            style={{
              color: faucetMsg.startsWith("Error")
                ? "var(--color-danger)"
                : "var(--color-success)",
            }}
          >
            {faucetMsg}
          </p>
        )}
      </div>

      {/* Snapshots */}
      <div className="rounded-md border p-3" style={sectionStyle}>
        <div className="flex items-center justify-between mb-1.5">
          <label
            className="text-xs font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Snapshots
          </label>
          <button
            onClick={handleSnapshot}
            disabled={snapshotLoading}
            className="px-3 py-1 text-xs rounded font-medium text-white"
            style={{
              backgroundColor: snapshotLoading
                ? "var(--color-accent-muted)"
                : "var(--color-accent)",
              opacity: snapshotLoading ? 0.7 : 1,
            }}
          >
            {snapshotLoading ? "Taking..." : "Take Snapshot"}
          </button>
        </div>

        {snapshots.length > 0 && (
          <div className="space-y-1 mt-2">
            {snapshots.map((snap) => (
              <div
                key={snap.id}
                className="flex items-center justify-between text-xs px-2 py-1.5 rounded border"
                style={{
                  backgroundColor: "var(--color-bg-input)",
                  borderColor: "var(--color-border-default)",
                }}
              >
                <span style={{ color: "var(--color-text-secondary)" }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {snap.id}
                  </span>
                  <span className="ml-2">at {snap.takenAt}</span>
                </span>
                <button
                  onClick={() => handleRevert(snap.id)}
                  disabled={snapshotLoading}
                  className="px-2 py-0.5 rounded text-xs"
                  style={{
                    backgroundColor: "var(--color-warning-muted)",
                    color: "var(--color-warning)",
                  }}
                >
                  Revert
                </button>
              </div>
            ))}
          </div>
        )}

        {snapshotMsg && (
          <p
            className="text-xs mt-1.5"
            style={{
              color: snapshotMsg.startsWith("Error")
                ? "var(--color-danger)"
                : "var(--color-success)",
            }}
          >
            {snapshotMsg}
          </p>
        )}
      </div>

      {/* Time Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Time Travel */}
        <div className="rounded-md border p-3" style={sectionStyle}>
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Time Travel
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={ttSeconds}
              onChange={(e) => setTtSeconds(e.target.value)}
              placeholder="Seconds"
              min={1}
              className="flex-1 px-2 py-1.5 rounded border text-sm"
              style={{
                backgroundColor: "var(--color-bg-input)",
                borderColor: "var(--color-border-default)",
                color: "var(--color-text-primary)",
              }}
            />
            <button
              onClick={handleTimeTravel}
              disabled={ttLoading}
              className="px-3 py-1.5 text-xs rounded font-medium text-white whitespace-nowrap"
              style={{
                backgroundColor: ttLoading
                  ? "var(--color-accent-muted)"
                  : "var(--color-accent)",
                opacity: ttLoading ? 0.7 : 1,
              }}
            >
              {ttLoading ? "..." : "Travel"}
            </button>
          </div>
          <p
            className="text-xs mt-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            Advance {parseInt(ttSeconds, 10) >= 3600
              ? `${Math.floor(parseInt(ttSeconds, 10) / 3600)}h ${Math.floor(
                  (parseInt(ttSeconds, 10) % 3600) / 60,
                )}m`
              : parseInt(ttSeconds, 10) >= 60
                ? `${Math.floor(parseInt(ttSeconds, 10) / 60)}m ${parseInt(ttSeconds, 10) % 60}s`
                : `${ttSeconds}s`}
          </p>
          {ttMsg && (
            <p
              className="text-xs mt-1"
              style={{
                color: ttMsg.startsWith("Error")
                  ? "var(--color-danger)"
                  : "var(--color-success)",
              }}
            >
              {ttMsg}
            </p>
          )}
        </div>

        {/* Mine Blocks */}
        <div className="rounded-md border p-3" style={sectionStyle}>
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Mine Blocks
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={mineCount}
              onChange={(e) => setMineCount(e.target.value)}
              placeholder="Count"
              min={1}
              max={1000}
              className="flex-1 px-2 py-1.5 rounded border text-sm"
              style={{
                backgroundColor: "var(--color-bg-input)",
                borderColor: "var(--color-border-default)",
                color: "var(--color-text-primary)",
              }}
            />
            <button
              onClick={handleMine}
              disabled={mineLoading}
              className="px-3 py-1.5 text-xs rounded font-medium text-white whitespace-nowrap"
              style={{
                backgroundColor: mineLoading
                  ? "var(--color-accent-muted)"
                  : "var(--color-accent)",
                opacity: mineLoading ? 0.7 : 1,
              }}
            >
              {mineLoading ? "Mining..." : "Mine"}
            </button>
          </div>
          {mineMsg && (
            <p
              className="text-xs mt-1"
              style={{
                color: mineMsg.startsWith("Error")
                  ? "var(--color-danger)"
                  : "var(--color-success)",
              }}
            >
              {mineMsg}
            </p>
          )}
        </div>
      </div>

      {/* Destroy */}
      <div className="pt-2 border-t" style={{ borderColor: "var(--color-border-muted)" }}>
        {!confirmDestroy ? (
          <button
            onClick={() => setConfirmDestroy(true)}
            className="px-3 py-1.5 text-xs rounded border"
            style={{
              borderColor: "var(--color-danger)",
              color: "var(--color-danger)",
              backgroundColor: "transparent",
            }}
          >
            Destroy TestNet
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className="text-xs"
              style={{ color: "var(--color-danger)" }}
            >
              Are you sure? This cannot be undone.
            </span>
            <button
              onClick={handleDestroy}
              disabled={destroyLoading}
              className="px-3 py-1.5 text-xs rounded font-medium text-white"
              style={{
                backgroundColor: "var(--color-danger)",
                opacity: destroyLoading ? 0.7 : 1,
              }}
            >
              {destroyLoading ? "Destroying..." : "Yes, Destroy"}
            </button>
            <button
              onClick={() => setConfirmDestroy(false)}
              className="px-3 py-1.5 text-xs rounded border"
              style={{
                borderColor: "var(--color-border-default)",
                color: "var(--color-text-secondary)",
                backgroundColor: "transparent",
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
