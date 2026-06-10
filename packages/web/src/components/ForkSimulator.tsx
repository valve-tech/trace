import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { isAddress } from "viem";
import { parseAmountToBase } from "../lib/format/tokenAmount";
import type {
  ForkSimulationResult,
  ForkSimulationResponse,
} from "../api/simulate";
import { forkSimulateApi, simulateFromHashApi } from "./ForkSimulator/api";
import { useActiveChainId } from "../lib/activeChain";
import { scanPath } from "../lib/scanRoutes";
import { InputCard, type InputMode } from "./ForkSimulator/InputCard";
import { StatusSummary } from "./ForkSimulator/StatusSummary";
import {
  BalanceChangesTable,
  StorageChangesTable,
  EventsList,
} from "./ForkSimulator/DiffTables";
import {
  LoadingPanel,
  ErrorPanel,
  RevertReasonBlock,
  NoStateChangesPanel,
} from "./ForkSimulator/Panels";

function plsToWeiHex(plsValue: string): string | undefined {
  const wei = parseAmountToBase(plsValue, 18); // exact, no float
  return wei === null ? undefined : "0x" + wei.toString(16);
}

export default function ForkSimulator() {
  const navigate = useNavigate();
  const chainId = useActiveChainId();
  const [mode, setMode] = useState<InputMode>("hash");

  const [txHash, setTxHash] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [value, setValue] = useState("");
  const [data, setData] = useState("");
  const [blockNumber, setBlockNumber] = useState("");

  const [result, setResult] = useState<ForkSimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidHash = /^0x[0-9a-fA-F]{64}$/.test(txHash);

  const handleSimulate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response: ForkSimulationResponse =
        mode === "hash"
          ? await simulateFromHashApi(txHash, chainId)
          : await forkSimulateApi(
              {
                from,
                to,
                value: plsToWeiHex(value),
                data: data || undefined,
                blockNumber: blockNumber ? parseInt(blockNumber, 10) : undefined,
              },
              chainId,
            );

      if (!response.ok) {
        setError(response.error ?? "Simulation failed");
        return;
      }
      setResult(response.result ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, [mode, txHash, from, to, value, data, blockNumber, chainId]);

  const canSubmit =
    mode === "hash"
      ? isValidHash && !loading
      : isAddress(from) && isAddress(to) && !loading;

  const hasNoStateChanges =
    result &&
    result.stateDiff.balanceChanges.length === 0 &&
    result.stateDiff.storageChanges.length === 0 &&
    result.logs.length === 0;

  return (
    <div className="space-y-section">
      <InputCard
        mode={mode}
        setMode={setMode}
        txHash={txHash}
        setTxHash={setTxHash}
        manual={{
          from,
          setFrom,
          to,
          setTo,
          value,
          setValue,
          data,
          setData,
          blockNumber,
          setBlockNumber,
        }}
        canSubmit={canSubmit}
        loading={loading}
        onSimulate={handleSimulate}
      />

      {loading && <LoadingPanel />}
      {!loading && error && <ErrorPanel message={error} />}

      {!loading && result && (
        <div className="space-y-stack">
          <StatusSummary
            result={result}
            onViewContract={(address) => navigate(scanPath("contract", address))}
            onDebug={(hash) => navigate(`/debugger/${hash}`)}
          />

          {result.revertReason && <RevertReasonBlock reason={result.revertReason} />}

          {result.stateDiff.balanceChanges.length > 0 && (
            <BalanceChangesTable changes={result.stateDiff.balanceChanges} />
          )}
          {result.stateDiff.storageChanges.length > 0 && (
            <StorageChangesTable changes={result.stateDiff.storageChanges} />
          )}
          {result.logs.length > 0 && <EventsList logs={result.logs} />}

          {hasNoStateChanges && <NoStateChangesPanel />}
        </div>
      )}
    </div>
  );
}

