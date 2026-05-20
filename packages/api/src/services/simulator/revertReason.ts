import {
  BaseError,
  ContractFunctionRevertedError,
  RawContractError,
  decodeErrorResult,
  type Abi,
  type Hex,
} from "viem";

/**
 * Extract a human-readable revert reason from a viem error. Walks the
 * error chain looking for the typed revert sources viem produces, then
 * falls through to ABI-aware decoding of raw revert data, then to the
 * canonical `Error(string)` shape, then to whatever string we can find.
 *
 * Returning `null` is reserved for the "no error at all" case; an
 * un-parseable error still yields a stringified message so the UI has
 * something to render.
 */
export function extractRevertReason(
  err: unknown,
  abi?: Abi | null,
): string | null {
  if (err instanceof BaseError) {
    const revertError = err.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    );
    if (revertError instanceof ContractFunctionRevertedError) {
      return revertError.reason ?? revertError.shortMessage ?? err.shortMessage;
    }

    const rawError = err.walk((e) => e instanceof RawContractError);
    if (rawError instanceof RawContractError && rawError.data) {
      try {
        const decoded = decodeErrorResult({
          abi: (abi ?? []) as Abi,
          data: rawError.data as Hex,
        });
        return `${decoded.errorName}(${decoded.args?.map(String).join(", ") ?? ""})`;
      } catch {
        // ABI didn't match — try standard Error(string).
        try {
          const decoded = decodeErrorResult({
            abi: [
              {
                type: "error",
                name: "Error",
                inputs: [{ name: "message", type: "string" }],
              },
            ] as Abi,
            data: rawError.data as Hex,
          });
          return String(decoded.args?.[0] ?? "Unknown revert");
        } catch {
          return rawError.data as string;
        }
      }
    }

    return err.shortMessage ?? err.message;
  }

  if (err instanceof Error) return err.message;
  return String(err);
}
