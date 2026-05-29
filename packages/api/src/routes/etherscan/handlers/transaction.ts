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
 */

import { getTransactionDetails } from "../../../services/explorer.js";
import {
  etherscanErr,
  etherscanOk,
  type EtherscanResponse,
} from "../envelope.js";

const TXHASH_RE = /^0x[a-fA-F0-9]{64}$/;

// ===========================================================================
// getstatus
// ===========================================================================

interface TxStatusResult {
  isError: "0" | "1";
  errDescription: string;
}

export async function getStatusAction(
  params: Record<string, unknown>,
): Promise<EtherscanResponse<TxStatusResult>> {
  const hash = String(params.txhash ?? "");
  if (!TXHASH_RE.test(hash)) {
    return etherscanErr("Invalid transaction hash");
  }

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
): Promise<EtherscanResponse<TxReceiptStatusResult>> {
  const hash = String(params.txhash ?? "");
  if (!TXHASH_RE.test(hash)) {
    return etherscanErr("Invalid transaction hash");
  }

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
