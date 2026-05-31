/**
 * Shared types for the storage-layout viewer. The shapes mirror the
 * `storageLayout` block solc emits when compiled with the appropriate
 * output selection — the backend forwards that block verbatim, so the
 * field names and string-encoded numbers come straight from solc.
 */

export interface StorageEntry {
  label: string;
  /** Decimal string. solc emits slots as decimal strings (not hex). */
  slot: string;
  offset: number;
  type: string;
  contract: string;
}

export interface StorageType {
  /** "inplace" | "mapping" | "dynamic_array" | "bytes" — solc encoding tag. */
  encoding: string;
  key?: string;
  label: string;
  /** Decimal string. Number of bytes one element of this type occupies. */
  numberOfBytes: string;
  value?: string;
  base?: string;
}

export interface StorageLayout {
  storage: StorageEntry[];
  types: Record<string, StorageType>;
}

/**
 * A well-known proxy/upgradeable storage slot label that came back
 * from the backend registry (EIP-1967 impl/admin/beacon, EIP-1822,
 * OpenZeppelin Initializable / ReentrancyGuard, etc.).
 */
export interface KnownSlotLabel {
  slot: string;
  label: string;
  hint: string;
}

/**
 * Per-slot entry inferred by the heimdall decompiler fall-through —
 * used when the contract isn't verified and solc recompilation isn't
 * available, but heimdall can still recover slot accesses from the
 * deployed bytecode.
 */
export interface DecompiledSlot {
  /** 0x-prefixed 64-char hex slot value. */
  slot: string;
  /** Heimdall-inferred Solidity type. Null today (heimdall doesn't emit). */
  inferredType: string | null;
  /** "read" / "write" — what kinds of access heimdall observed. */
  access: ("read" | "write")[];
  /** Heimdall-inferred name. Reserved; null today. */
  name: string | null;
  /** Proxy / upgradeable registry match, if any. Drives the labeled badge. */
  known: KnownSlotLabel | null;
  /** Count of distinct storage[] references that landed on this slot. */
  hitCount: number;
}

export interface DecompiledLayout {
  slots: DecompiledSlot[];
  /** Pseudo-Solidity source from heimdall (rendered in the inspector pane). */
  pseudoSource: string | null;
  /** Inferred ABI; passed through unchanged for downstream consumers. */
  inferredAbi: unknown[] | null;
}

export interface StorageLayoutResponse {
  ok: boolean;
  /** Discriminator: which path produced this layout. */
  source?: "compiled" | "decompiled";
  /** Verified-source path: solc's typed layout. */
  storageLayout?: StorageLayout;
  contractName?: string;
  /** Decompiler fall-through path: heimdall's inferred layout. */
  decompiled?: DecompiledLayout;
  error?: string;
}
