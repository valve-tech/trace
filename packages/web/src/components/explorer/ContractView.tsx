import { useState, useEffect } from "react";
import { fetchContractInfo, type ContractInfo } from "../../api/explorer";
import {
  type AbiItem,
  type SubTab,
  isReadFunction,
  isWriteFunction,
  isTokenAbi,
} from "./ContractView/types";
import { ReadFunction } from "./ContractView/ReadFunction";
import { WriteFunction } from "./ContractView/WriteFunction";
import { ContractHeader } from "./ContractView/ContractHeader";
import { SubTabBar } from "./ContractView/SubTabBar";
import { AbiTab, SourceTab } from "./ContractView/SourceCodeTab";
import { TransferChart } from "./ContractView/TransferChart";

interface ContractViewProps {
  address: string;
  onNavigate: (target: { type: "address"; value: string }) => void;
}

function pickInitialTab(data: ContractInfo): SubTab {
  if (data.abi && (data.abi as AbiItem[]).some((f) => f.type === "function")) {
    return "read";
  }
  if (data.sourceCode) return "source";
  return "abi";
}

export default function ContractView({
  address,
  onNavigate,
}: ContractViewProps) {
  const [info, setInfo] = useState<ContractInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<SubTab>("read");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchContractInfo(address)
      .then((data) => {
        if (!cancelled) {
          setInfo(data);
          setSubTab(pickInitialTab(data));
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address]);

  if (loading) {
    return (
      <div
        className="rounded-lg bs p-8 flex flex-col items-center justify-center min-h-[300px]"
        style={{
          backgroundColor: "var(--color-bg-card)",
        }}
      >
        <div
          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mb-3"
          style={{
            borderColor: "var(--color-accent)",
            borderTopColor: "transparent",
          }}
        />
        <span
          className="text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Loading contract...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg p-6"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-danger)",
        }}
      >
        <h3
          className="text-sm font-semibold mb-1"
          style={{ color: "var(--color-danger)" }}
        >
          Error
        </h3>
        <p
          className="text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {error}
        </p>
      </div>
    );
  }

  if (!info) return null;

  const abiItems = (info.abi || []) as AbiItem[];
  const readFunctions = abiItems.filter(isReadFunction);
  const writeFunctions = abiItems.filter(isWriteFunction);
  const isToken = isTokenAbi(abiItems);

  return (
    <div className="space-y-stack">
      <ContractHeader
        address={address}
        info={info}
        onViewAddress={() => onNavigate({ type: "address", value: address })}
      />

      <SubTabBar
        active={subTab}
        onSelect={setSubTab}
        readCount={readFunctions.length}
        writeCount={writeFunctions.length}
        showChart={isToken}
      />

      {subTab === "read" && (
        <FunctionList
          functions={readFunctions}
          emptyMessage="No read functions available"
          renderItem={(fn, i) => (
            <ReadFunction key={i} fn={fn} address={address} />
          )}
        />
      )}

      {subTab === "write" && (
        <FunctionList
          functions={writeFunctions}
          emptyMessage="No write functions available"
          renderItem={(fn, i) => <WriteFunction key={i} fn={fn} />}
        />
      )}

      {subTab === "abi" && <AbiTab abi={info.abi} />}
      {subTab === "source" && <SourceTab sourceCode={info.sourceCode} />}
      {subTab === "chart" && isToken && <TransferChart address={address} />}
    </div>
  );
}

function FunctionList({
  functions,
  emptyMessage,
  renderItem,
}: {
  functions: AbiItem[];
  emptyMessage: string;
  renderItem: (fn: AbiItem, i: number) => React.ReactNode;
}) {
  if (functions.length === 0) {
    return (
      <div
        className="rounded-lg bs p-6 text-center text-sm"
        style={{
          backgroundColor: "var(--color-bg-card)",
          color: "var(--color-text-muted)",
        }}
      >
        {emptyMessage}
      </div>
    );
  }
  return <div className="space-y-2">{functions.map(renderItem)}</div>;
}
