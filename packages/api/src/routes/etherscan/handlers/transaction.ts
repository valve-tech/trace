/**
 * Etherscan `transaction` module handlers.
 *
 *   getstatus            — execution status + revert message
 *   gettxreceiptstatus   — receipt-only status flag
 *
 * Etherscan exposes both because pre-Byzantium Ethereum had no receipt
 * status field; tooling still asks for `getstatus` to learn the revert
 * reason, and `gettxreceiptstatus` to learn the receipt bit. We back
 * both with the same `getTransactionDetails` call.
 *
 * Chain awareness: `getTransactionDetails` is still bound to the legacy
 * PulseChain RPC singleton, so both actions only serve the default chain
 * until that service accepts a chain (see services/explorer/transactionDetails.ts).
 */

import {
  DEFAULT_CHAIN_ID,
  type ChainConfig,
} from "../../../services/chains/registry.js";
import { getTransactionDetails } from "../../../services/explorer.js";
import { defaultChain } from "../chain.js";
import {
  etherscanErr,
  etherscanOk,
  type EtherscanErr,
  type EtherscanResponse,
} from "../envelope.js";

const TXHASH_RE = /^0x[a-fA-F0-9]{64}$/;

/**
 * Both transaction handlers share the same chain gate: the backing service
 * can only read the default chain today.
 */
function unsupportedChain(chain: ChainConfig): EtherscanErr | null {
  if (chain.chainId === DEFAULT_CHAIN_ID) return null;
  return etherscanErr(
    `transaction lookups not yet supported for chainId ${chain.chainId}`,
  );
}

// ===========================================================================
// getstatus
// ===========================================================================

interface TxStatusResult {
  isError: "0" | "1";
  errDescription: string;
}

export async function getStatusAction(
  params: Record<string, unknown>,
  chain: ChainConfig = defaultChain(),
): Promise<EtherscanResponse<TxStatusResult>> {
  const hash = String(params.txhash ?? "");
  if (!TXHASH_RE.test(hash)) {
    return etherscanErr("Invalid transaction hash");
  }

  const gate = unsupportedChain(chain);
  if (gate) return gate;

  try {
    const tx = await getTransactionDetails(hash, { skipDecode: true });
    const result: TxStatusResult = {
      isError: tx.status === "reverted" ? "1" : "0",
      // Our service doesn't surface the revert reason today; leave blank
      // rather than guess. Etherscan does the same for many reverts.
      errDescription: "",
    };
    return etherscanOk(result);
  } catch {
    return etherscanErr("Upstream temporarily unavailable");
  }
}

// ===========================================================================
// gettxreceiptstatus
// ===========================================================================

interface TxReceiptStatusResult {
  status: "0" | "1";
}

export async function getTxReceiptStatusAction(
  params: Record<string, unknown>,
  chain: ChainConfig = defaultChain(),
): Promise<EtherscanResponse<TxReceiptStatusResult>> {
  const hash = String(params.txhash ?? "");
  if (!TXHASH_RE.test(hash)) {
    return etherscanErr("Invalid transaction hash");
  }

  const gate = unsupportedChain(chain);
  if (gate) return gate;

  try {
    const tx = await getTransactionDetails(hash, { skipDecode: true });
    const result: TxReceiptStatusResult = {
      status: tx.status === "success" ? "1" : "0",
    };
    return etherscanOk(result);
  } catch {
    return etherscanErr("Upstream temporarily unavailable");
  }
}
