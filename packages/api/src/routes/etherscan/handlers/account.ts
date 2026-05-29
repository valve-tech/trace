/**
 * Etherscan `account` module handlers.
 *
 *   balance        — single-address PLS balance in wei
 *   balancemulti   — up to 20 addresses, fanned out in parallel
 *   txlist         — paginated tx history, reshaped to Etherscan field names
 *   tokentx        — address-scoped ERC20 transfers (not yet supported;
 *                    our service is tx-hash scoped, not address scoped)
 *
 * The reshape into Etherscan field names is the load-bearing part: tools
 * (ethers, web3.py, hardhat) read `blockNumber`, `timeStamp`, `txreceipt_status`,
 * etc. by name. Our internal `AddressTransaction` shape uses similar but
 * not identical fields, so we map explicitly rather than spread.
 */

import {
  getAddressBalance,
  getAddressTransactions,
} from "../../../services/explorer.js";
import {
  etherscanErr,
  etherscanOk,
  type EtherscanResponse,
} from "../envelope.js";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/** Etherscan caps `balancemulti` at 20 addresses per call. */
const BALANCEMULTI_MAX = 20;

// ===========================================================================
// balance
// ===========================================================================

export async function balanceAction(
  params: Record<string, unknown>,
): Promise<EtherscanResponse<string>> {
  const address = String(params.address ?? "");
  if (!ADDRESS_RE.test(address)) {
    return etherscanErr("Invalid Address format");
  }

  try {
    const { balance } = await getAddressBalance(address);
    return etherscanOk(balance);
  } catch {
    return etherscanErr("Upstream temporarily unavailable");
  }
}

// ===========================================================================
// balancemulti
// ===========================================================================

interface BalanceEntry {
  account: string;
  balance: string;
}

export async function balanceMultiAction(
  params: Record<string, unknown>,
): Promise<EtherscanResponse<BalanceEntry[]>> {
  const raw = String(params.address ?? "");
  if (!raw) {
    return etherscanErr("Invalid Address format");
  }

  const addresses = raw
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0);

  if (addresses.length === 0) {
    return etherscanErr("Invalid Address format");
  }
  if (addresses.length > BALANCEMULTI_MAX) {
    return etherscanErr(
      `Maximum ${BALANCEMULTI_MAX} addresses per request`,
    );
  }
  for (const a of addresses) {
    if (!ADDRESS_RE.test(a)) {
      return etherscanErr("Invalid Address format");
    }
  }

  try {
    const results = await Promise.all(
      addresses.map(async (account) => {
        const { balance } = await getAddressBalance(account);
        return { account, balance };
      }),
    );
    return etherscanOk(results);
  } catch {
    return etherscanErr("Upstream temporarily unavailable");
  }
}

// ===========================================================================
// txlist
// ===========================================================================

interface EtherscanTxRecord {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  transactionIndex: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  isError: string;
  txreceipt_status: string;
  input: string;
  contractAddress: string;
  cumulativeGasUsed: string;
  gasUsed: string;
  confirmations: string;
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function txListAction(
  params: Record<string, unknown>,
): Promise<EtherscanResponse<EtherscanTxRecord[]>> {
  const address = String(params.address ?? "");
  if (!ADDRESS_RE.test(address)) {
    return etherscanErr("Invalid Address format");
  }

  // Etherscan pagination semantics: `page` is 1-based, `offset` is page size.
  // Our service exposes the same shape directly. `startblock`/`endblock`/`sort`
  // are accepted-and-ignored — the upstream service defaults to desc and
  // doesn't take block-range filters, so silently honoring them would be a lie.
  const page = parsePositiveInt(params.page, 1);
  const offset = parsePositiveInt(params.offset, 25);

  let transactions;
  try {
    ({ transactions } = await getAddressTransactions(address, page, offset));
  } catch {
    return etherscanErr("Upstream temporarily unavailable");
  }

  // BlockScout's `txlist` doesn't expose blockHash / transactionIndex / nonce /
  // cumulativeGasUsed / contractAddress / confirmations through the v1 endpoint
  // our service consumes. We emit empty strings ("" / "0") rather than fabricate.
  const records: EtherscanTxRecord[] = transactions.map((tx) => ({
    blockNumber: tx.blockNumber,
    timeStamp: tx.timeStamp,
    hash: tx.hash,
    nonce: "",
    blockHash: "",
    transactionIndex: "",
    from: tx.from,
    to: tx.to,
    value: tx.value,
    gas: tx.gas,
    gasPrice: tx.gasPrice,
    isError: tx.isError,
    txreceipt_status: tx.isError === "1" ? "0" : "1",
    input: tx.input,
    contractAddress: "",
    cumulativeGasUsed: "",
    gasUsed: tx.gasUsed,
    confirmations: "",
  }));

  if (records.length === 0) {
    return etherscanErr("No transactions found", "No transactions found");
  }
  return etherscanOk(records);
}

// ===========================================================================
// tokentx
// ===========================================================================

/**
 * Etherscan's `tokentx` returns ERC20 transfers scoped by address (with
 * optional `contractaddress` filter). Our `getTokenTransfers` service is
 * scoped by tx hash, not address — there is no address-based variant
 * today. Rather than fabricate by walking every tx of an address, we
 * return a clear "not supported" so callers don't silently see empty data.
 */
export async function tokenTxAction(
  params: Record<string, unknown>,
): Promise<EtherscanResponse<never[]>> {
  const address = String(params.address ?? "");
  if (!ADDRESS_RE.test(address)) {
    return etherscanErr("Invalid Address format");
  }

  return etherscanErr(
    "Not supported yet — address-scoped token transfers require backend work",
  );
}
