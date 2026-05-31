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

export interface StorageLayoutResponse {
  ok: boolean;
  storageLayout?: StorageLayout;
  contractName?: string;
  error?: string;
}
