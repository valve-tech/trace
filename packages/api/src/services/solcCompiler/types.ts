/**
 * Public types for the solc compiler integration. `StorageLayout`
 * mirrors what solc emits in `storageLayout` output selection — used by
 * the storage-layout viewer in the debugger.
 */

export interface StorageLayoutEntry {
  astId: number;
  contract: string;
  label: string;
  offset: number;
  slot: string;
  type: string;
}

export interface StorageLayoutType {
  encoding: string;
  key?: string;
  label: string;
  numberOfBytes: string;
  value?: string;
  base?: string;
  members?: Array<{
    astId: number;
    label: string;
    offset: number;
    slot: string;
    type: string;
  }>;
}

export interface StorageLayout {
  storage: StorageLayoutEntry[];
  types: Record<string, StorageLayoutType>;
}

export interface CompilationResult {
  sourceMap: string;
  deployedBytecode: string;
  abi: unknown[];
  contractName: string;
  storageLayout: StorageLayout | null;
}

/** Internal — shape of the per-contract record inside solc standard JSON. */
export interface SolcContract {
  abi?: unknown[];
  storageLayout?: StorageLayout;
  evm?: {
    deployedBytecode?: {
      sourceMap?: string;
      object?: string;
    };
  };
}
