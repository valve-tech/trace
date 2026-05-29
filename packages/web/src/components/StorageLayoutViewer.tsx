import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { isAddress, keccak256, encodePacked, pad, toHex } from "viem";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StorageEntry {
  label: string;
  slot: string;
  offset: number;
  type: string;
  contract: string;
}

interface StorageType {
  encoding: string;
  key?: string;
  label: string;
  numberOfBytes: string;
  value?: string;
  base?: string;
}

interface StorageLayout {
  storage: StorageEntry[];
  types: Record<string, StorageType>;
}

interface StorageLayoutResponse {
  ok: boolean;
  storageLayout?: StorageLayout;
  contractName?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Slot computation helpers
// ---------------------------------------------------------------------------

function computeMappingSlot(baseSlot: string, key: string): string {
  const slotPadded = pad(toHex(BigInt(baseSlot)), { size: 32 });
  const keyPadded = pad(key as `0x${string}`, { size: 32 });
  return keccak256(encodePacked(["bytes32", "bytes32"], [keyPadded, slotPadded]));
}

function computeArraySlot(baseSlot: string, index: number, elementSize: number): string {
  const arrayDataSlot = keccak256(pad(toHex(BigInt(baseSlot)), { size: 32 }));
  const offset = BigInt(index) * BigInt(Math.ceil(elementSize / 32));
  return toHex(BigInt(arrayDataSlot) + offset);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StorageLayoutViewer() {
  const [searchParams] = useSearchParams();
  const [contractAddress, setContractAddress] = useState(
    () => searchParams.get("address") ?? "",
  );
  const [lookupKey, setLookupKey] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<StorageEntry | null>(null);
  const [computedSlot, setComputedSlot] = useState<string | null>(null);
  const [slotValue, setSlotValue] = useState<string | null>(null);
  const [loadingValue, setLoadingValue] = useState(false);

  // ?address= lets the ⌘K palette deep-link to a pre-filled storage view.
  // Watches changes so a second palette paste also takes effect.
  useEffect(() => {
    const fromUrl = searchParams.get("address");
    if (fromUrl && fromUrl !== contractAddress) setContractAddress(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const validAddress = isAddress(contractAddress);

  const { data, isLoading } = useQuery({
    queryKey: ["storage-layout", contractAddress.toLowerCase()],
    queryFn: async (): Promise<StorageLayoutResponse> => {
      const res = await fetch(`/api/source/${contractAddress}/storage-layout`);
      return (await res.json()) as StorageLayoutResponse;
    },
    enabled: validAddress,
  });

  const layout = data?.storageLayout;

  // Group entries by contract
  const grouped = useMemo(() => {
    if (!layout) return new Map<string, StorageEntry[]>();
    const map = new Map<string, StorageEntry[]>();
    for (const entry of layout.storage) {
      const group = map.get(entry.contract) ?? [];
      group.push(entry);
      map.set(entry.contract, group);
    }
    return map;
  }, [layout]);

  const handleComputeSlot = (entry: StorageEntry) => {
    setSelectedEntry(entry);
    setComputedSlot(null);
    setSlotValue(null);
    setLookupKey("");

    const typeInfo = layout?.types[entry.type];
    if (!typeInfo || typeInfo.encoding !== "mapping") {
      // Simple variable — slot is directly the slot number
      setComputedSlot(pad(toHex(BigInt(entry.slot)), { size: 32 }));
    }
  };

  const handleLookupMapping = async () => {
    if (!selectedEntry || !lookupKey || !validAddress) return;

    const typeInfo = layout?.types[selectedEntry.type];
    if (!typeInfo) return;

    let slot: string;
    if (typeInfo.encoding === "mapping") {
      const keyHex = lookupKey.startsWith("0x") ? lookupKey : pad(toHex(BigInt(lookupKey)), { size: 32 });
      slot = computeMappingSlot(selectedEntry.slot, keyHex);
    } else if (typeInfo.encoding === "dynamic_array") {
      const index = parseInt(lookupKey, 10);
      const elemSize = parseInt(typeInfo.numberOfBytes, 10);
      slot = computeArraySlot(selectedEntry.slot, index, elemSize);
    } else {
      slot = pad(toHex(BigInt(selectedEntry.slot)), { size: 32 });
    }

    setComputedSlot(slot);

    // Fetch the actual value from the chain
    setLoadingValue(true);
    try {
      const res = await fetch("/rpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getStorageAt",
          params: [contractAddress, slot, "latest"],
        }),
      });
      const rpcRes = (await res.json()) as { result?: string };
      setSlotValue(rpcRes.result ?? null);
    } catch {
      setSlotValue(null);
    } finally {
      setLoadingValue(false);
    }
  };

  return (
    <div className="flex flex-col gap-0">
      {/* Address input */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-2 theme-text">
          Storage Layout Viewer
        </h2>
        <p className="text-xs mb-3 theme-text-secondary">
          Enter a verified contract address to see its storage slot layout. Click a variable to compute its slot hash and read its on-chain value.
        </p>
        <input
          type="text"
          value={contractAddress}
          onChange={(e) => {
            setContractAddress(e.target.value.trim());
            setSelectedEntry(null);
            setComputedSlot(null);
          }}
          placeholder="0x... contract address"
          className="w-full px-3 py-2 text-sm card theme-input-bg theme-text theme-mono"
        />
        {validAddress && isLoading && (
          <p className="text-xs mt-2 theme-text-muted">Compiling to extract storage layout...</p>
        )}
        {validAddress && data && !data.ok && (
          <p className="text-xs mt-2 theme-warning">{data.error}</p>
        )}
      </div>

      {/* Layout table */}
      {layout && (
        <div className="flex gap-0" style={{ minHeight: "400px" }}>
          {/* Variable list */}
          <div className="card flex-1 overflow-auto">
            <div className="card-divider px-3 py-2 theme-secondary-bg">
              <span className="text-xs font-semibold uppercase tracking-wider theme-text-secondary">
                Storage Variables ({layout.storage.length})
              </span>
            </div>
            <table className="w-full text-xs theme-mono">
              <thead>
                <tr className="theme-text-muted">
                  <th className="text-left px-3 py-1.5">Slot</th>
                  <th className="text-left px-3 py-1.5">Variable</th>
                  <th className="text-left px-3 py-1.5">Type</th>
                  <th className="text-left px-3 py-1.5">Size</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(grouped.entries()).map(([contract, entries]) => (
                  <>
                    {grouped.size > 1 && (
                      <tr key={`header-${contract}`}>
                        <td colSpan={4} className="px-3 py-1 text-xs font-semibold theme-accent theme-secondary-bg">
                          {contract}
                        </td>
                      </tr>
                    )}
                    {entries.map((entry, i) => {
                      const typeInfo = layout.types[entry.type];
                      const isSelected = selectedEntry?.label === entry.label && selectedEntry?.slot === entry.slot;
                      const isMapping = typeInfo?.encoding === "mapping";
                      const isArray = typeInfo?.encoding === "dynamic_array";

                      return (
                        <tr
                          key={`${contract}-${i}`}
                          onClick={() => handleComputeSlot(entry)}
                          className={`cursor-pointer${isSelected ? " theme-accent-bg" : ""}`}
                        >
                          <td className="px-3 py-1.5 theme-text-muted">
                            {entry.slot}
                          </td>
                          <td className="px-3 py-1.5 theme-text">
                            {entry.label}
                            {isMapping && <span className="theme-accent"> [map]</span>}
                            {isArray && <span className="theme-accent"> [arr]</span>}
                          </td>
                          <td className="px-3 py-1.5 theme-text-secondary">
                            {typeInfo?.label ?? entry.type}
                          </td>
                          <td className="px-3 py-1.5 theme-text-muted">
                            {typeInfo?.numberOfBytes ?? "?"}B
                          </td>
                        </tr>
                      );
                    })}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Slot inspector */}
          <div className="card overflow-auto" style={{ width: "380px", flexShrink: 0 }}>
            <div className="card-divider px-3 py-2 theme-secondary-bg">
              <span className="text-xs font-semibold uppercase tracking-wider theme-text-secondary">
                Slot Inspector
              </span>
            </div>
            {!selectedEntry ? (
              <div className="px-3 py-8 text-xs text-center theme-text-muted">
                Click a variable to inspect its storage slot
              </div>
            ) : (
              <div className="p-3 space-y-3">
                <div>
                  <label className="text-xs block mb-1 theme-text-secondary">Variable</label>
                  <div className="text-sm font-semibold theme-text theme-mono">
                    {selectedEntry.label}
                  </div>
                </div>
                <div>
                  <label className="text-xs block mb-1 theme-text-secondary">Type</label>
                  <div className="text-xs theme-text theme-mono">
                    {layout.types[selectedEntry.type]?.label ?? selectedEntry.type}
                  </div>
                </div>
                <div>
                  <label className="text-xs block mb-1 theme-text-secondary">Base Slot</label>
                  <div className="text-xs theme-text theme-mono">
                    {selectedEntry.slot} (offset: {selectedEntry.offset})
                  </div>
                </div>

                {/* Mapping/Array key input */}
                {layout.types[selectedEntry.type]?.encoding === "mapping" && (
                  <div>
                    <label className="text-xs block mb-1 theme-text-secondary">
                      Mapping Key <span className="theme-text-muted">(address or uint)</span>
                    </label>
                    <div className="flex gap-tight">
                      <input
                        type="text"
                        value={lookupKey}
                        onChange={(e) => setLookupKey(e.target.value.trim())}
                        placeholder="0x... or number"
                        className="flex-1 px-2 py-1.5 text-xs card theme-input-bg theme-text theme-mono"
                        onKeyDown={(e) => e.key === "Enter" && handleLookupMapping()}
                      />
                      <button
                        onClick={handleLookupMapping}
                        className="px-3 py-1.5 text-xs font-medium theme-accent-solid text-white"
                      >
                        Read
                      </button>
                    </div>
                    <p className="text-xs mt-1 theme-text-muted">
                      slot = keccak256(abi.encode(key, {selectedEntry.slot}))
                    </p>
                  </div>
                )}

                {layout.types[selectedEntry.type]?.encoding === "dynamic_array" && (
                  <div>
                    <label className="text-xs block mb-1 theme-text-secondary">
                      Array Index
                    </label>
                    <div className="flex gap-tight">
                      <input
                        type="text"
                        value={lookupKey}
                        onChange={(e) => setLookupKey(e.target.value.trim())}
                        placeholder="0"
                        className="flex-1 px-2 py-1.5 text-xs card theme-input-bg theme-text theme-mono"
                        onKeyDown={(e) => e.key === "Enter" && handleLookupMapping()}
                      />
                      <button
                        onClick={handleLookupMapping}
                        className="px-3 py-1.5 text-xs font-medium theme-accent-solid text-white"
                      >
                        Read
                      </button>
                    </div>
                    <p className="text-xs mt-1 theme-text-muted">
                      slot = keccak256({selectedEntry.slot}) + index * elemSize
                    </p>
                  </div>
                )}

                {/* For simple variables, auto-read */}
                {layout.types[selectedEntry.type]?.encoding !== "mapping" &&
                  layout.types[selectedEntry.type]?.encoding !== "dynamic_array" &&
                  !slotValue && !loadingValue && computedSlot && (
                  <button
                    onClick={async () => {
                      setLoadingValue(true);
                      try {
                        const res = await fetch("/rpc", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            jsonrpc: "2.0",
                            id: 1,
                            method: "eth_getStorageAt",
                            params: [contractAddress, computedSlot, "latest"],
                          }),
                        });
                        const rpcRes = (await res.json()) as { result?: string };
                        setSlotValue(rpcRes.result ?? null);
                      } finally {
                        setLoadingValue(false);
                      }
                    }}
                    className="w-full py-1.5 text-xs font-medium theme-accent-solid text-white"
                  >
                    Read Current Value
                  </button>
                )}

                {/* Computed slot hash */}
                {computedSlot && (
                  <div>
                    <label className="text-xs block mb-1 theme-text-secondary">Computed Slot</label>
                    <div className="text-xs p-2 break-all theme-primary-bg theme-accent theme-mono">
                      {computedSlot}
                    </div>
                  </div>
                )}

                {/* Value */}
                {loadingValue && (
                  <p className="text-xs theme-text-muted">Reading from chain...</p>
                )}
                {slotValue && (
                  <div>
                    <label className="text-xs block mb-1 theme-text-secondary">Current Value</label>
                    <div className="text-xs p-2 break-all theme-primary-bg theme-success theme-mono">
                      {slotValue}
                    </div>
                    {/* Decoded value */}
                    <div className="text-xs mt-1 theme-text-muted">
                      Decimal: {BigInt(slotValue).toString()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
