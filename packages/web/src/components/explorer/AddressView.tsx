import { useState, useEffect } from "react";
import {
  fetchAddressInfo,
  fetchAddressTransactions,
  fetchAddressTokens,
  type AddressInfo,
  type AddressTransaction,
  type AddressToken,
} from "../../api/explorer";
import { AddressHeader } from "./AddressView/AddressHeader";
import { SubTabBar, type AddressSubTab } from "./AddressView/SubTabBar";
import {
  TransactionsTab,
  type AddressNavTarget,
} from "./AddressView/TransactionsTab";
import { TokensTab } from "./AddressView/TokensTab";

interface AddressViewProps {
  address: string;
  onNavigate: (target: AddressNavTarget) => void;
}

export default function AddressView({
  address,
  onNavigate,
}: AddressViewProps) {
  const [info, setInfo] = useState<AddressInfo | null>(null);
  const [txs, setTxs] = useState<AddressTransaction[]>([]);
  const [tokens, setTokens] = useState<AddressToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [subTab, setSubTab] = useState<AddressSubTab>("transactions");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchAddressInfo(address),
      fetchAddressTransactions(address, 1, 25),
      fetchAddressTokens(address),
    ])
      .then(([addrInfo, txData, tokenData]) => {
        if (!cancelled) {
          setInfo(addrInfo);
          setTxs(txData.transactions);
          setTokens(tokenData);
          setPage(1);
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

  const loadPage = async (newPage: number) => {
    try {
      const data = await fetchAddressTransactions(address, newPage, 25);
      setTxs(data.transactions);
      setPage(newPage);
    } catch {
      // keep current
    }
  };

  if (loading) {
    return (
      <div
        className="rounded-lg border p-8 flex flex-col items-center justify-center min-h-[300px]"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border-default)",
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
          Loading address...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg border p-6"
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

  return (
    <div className="space-y-4">
      <AddressHeader
        address={address}
        info={info}
        onViewContract={() =>
          onNavigate({ type: "contract", value: address })
        }
      />

      <SubTabBar
        active={subTab}
        onSelect={setSubTab}
        txCount={txs.length}
        tokenCount={tokens.length}
      />

      {subTab === "transactions" && (
        <TransactionsTab
          ownerAddress={address}
          txs={txs}
          page={page}
          onLoadPage={loadPage}
          onNavigate={onNavigate}
        />
      )}

      {subTab === "tokens" && (
        <TokensTab tokens={tokens} onNavigate={onNavigate} />
      )}
    </div>
  );
}
