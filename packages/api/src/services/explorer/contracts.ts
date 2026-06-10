import { getVerifiedSource } from "../sourceCode.js";
import {
  buildContractInfo,
  type ContractInfoView,
} from "./contracts/transforms.js";

export type ContractInfo = ContractInfoView;

/**
 * Resolve ABI + verified-source metadata for a contract via the
 * verified-source service (Sourcify-first, DB-cached). An unverified
 * contract — or one whose verification sources are unreachable — yields
 * `isVerified: false` with empty string fields; the caller decides what
 * to render.
 */
export async function getContractInfo(
  address: string,
): Promise<ContractInfo> {
  let source = null;
  try {
    source = await getVerifiedSource(address);
  } catch {
    // UpstreamError — treat as unverified for this read rather than failing
    // the whole contract view; the next request retries.
  }
  return buildContractInfo(address, source);
}
