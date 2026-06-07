/**
 * Etherscan `contract` module handlers.
 *
 *   getsourcecode       — verified source + metadata, Etherscan-shaped
 *   getabi              — just the ABI as a JSON string
 *   verifysourcecode    — translate inbound Etherscan request and forward
 *                         to Sourcify; return a synthetic GUID
 *   checkverifystatus   — look up GUID-keyed Sourcify result
 *
 * All read actions reuse `getVerifiedSource`, so any improvement to the
 * cache / fallback chain there flows through here unchanged.
 */

import {
  DEFAULT_CHAIN_ID,
  type ChainConfig,
} from "../../../services/chains/registry.js";
import {
  getVerifiedSource,
  submitToSourcify,
  UpstreamError,
  type VerifiedSource,
} from "../../../services/sourceCode.js";
import { defaultChain } from "../chain.js";
import {
  etherscanErr,
  etherscanOk,
  type EtherscanResponse,
} from "../envelope.js";
import {
  lookupVerifyResult,
  storeVerifyResult,
} from "../verifyShim.js";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

// ===========================================================================
// getsourcecode
// ===========================================================================

interface EtherscanContractRecord {
  SourceCode: string;
  ABI: string;
  ContractName: string;
  CompilerVersion: string;
  OptimizationUsed: "0" | "1";
  Runs: string;
  ConstructorArguments: string;
  EVMVersion: string;
  Library: string;
  LicenseType: string;
  Proxy: "0" | "1";
  Implementation: string;
  SwarmSource: string;
}

/**
 * Build Etherscan's `SourceCode` field from our internal multi-file
 * representation. Etherscan signals "this is solc standard-JSON input"
 * by wrapping the JSON in DOUBLE braces — `{{ ... }}` — which is the
 * cue tools like hardhat-verify use to switch parsers. A single-file
 * contract is emitted as the raw Solidity source instead.
 */
function buildSourceCodeField(source: VerifiedSource): string {
  if (source.sourceFiles.length === 0) return "";
  if (source.sourceFiles.length === 1) {
    return source.sourceFiles[0]?.content ?? "";
  }

  const sources: Record<string, { content: string }> = {};
  for (const file of source.sourceFiles) {
    sources[file.name] = { content: file.content };
  }

  const standardJson = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: {
        enabled: source.optimizationUsed,
        runs: source.optimizationRuns ?? 200,
      },
    },
  };

  // Double-brace wrap — Etherscan's well-known "standard JSON input" marker.
  return `{${JSON.stringify(standardJson)}}`;
}

function toEtherscanRecord(source: VerifiedSource): EtherscanContractRecord {
  return {
    SourceCode: buildSourceCodeField(source),
    ABI: JSON.stringify(source.abi),
    ContractName: source.contractName ?? "",
    CompilerVersion: source.compilerVersion ?? "",
    OptimizationUsed: source.optimizationUsed ? "1" : "0",
    Runs: source.optimizationRuns?.toString() ?? "200",
    ConstructorArguments: "",
    EVMVersion: "Default",
    Library: "",
    LicenseType: "",
    Proxy: "0",
    Implementation: "",
    SwarmSource: "",
  };
}

/** Empty-record shape Etherscan returns when an address has no source. */
function emptyContractRecord(): EtherscanContractRecord {
  return {
    SourceCode: "",
    ABI: "Contract source code not verified",
    ContractName: "",
    CompilerVersion: "",
    OptimizationUsed: "0",
    Runs: "200",
    ConstructorArguments: "",
    EVMVersion: "Default",
    Library: "",
    LicenseType: "",
    Proxy: "0",
    Implementation: "",
    SwarmSource: "",
  };
}

export async function getSourceCodeAction(
  params: Record<string, unknown>,
  chain: ChainConfig = defaultChain(),
): Promise<EtherscanResponse<EtherscanContractRecord[]>> {
  const address = String(params.address ?? "");
  if (!ADDRESS_RE.test(address)) {
    return etherscanErr("Invalid Address format");
  }

  // `getVerifiedSource` still reads the legacy PulseChain BlockScout/Sourcify
  // singletons; serving another chain through it would return wrong-chain data.
  if (chain.chainId !== DEFAULT_CHAIN_ID) {
    return etherscanErr(
      `getsourcecode not yet supported for chainId ${chain.chainId}`,
    );
  }

  let source: VerifiedSource | null;
  try {
    source = await getVerifiedSource(address);
  } catch (err) {
    if (err instanceof UpstreamError) {
      return etherscanErr(
        `Verification source temporarily unavailable: ${err.upstream}`,
      );
    }
    throw err;
  }

  if (!source) {
    return etherscanOk([emptyContractRecord()]);
  }

  return etherscanOk([toEtherscanRecord(source)]);
}

// ===========================================================================
// getabi
// ===========================================================================

export async function getAbiAction(
  params: Record<string, unknown>,
  chain: ChainConfig = defaultChain(),
): Promise<EtherscanResponse<string>> {
  const address = String(params.address ?? "");
  if (!ADDRESS_RE.test(address)) {
    return etherscanErr("Invalid Address format");
  }

  if (chain.chainId !== DEFAULT_CHAIN_ID) {
    return etherscanErr(
      `getabi not yet supported for chainId ${chain.chainId}`,
      "NOTOK",
    );
  }

  let source: VerifiedSource | null;
  try {
    source = await getVerifiedSource(address);
  } catch (err) {
    if (err instanceof UpstreamError) {
      return etherscanErr(
        `Verification source temporarily unavailable: ${err.upstream}`,
        "NOTOK",
      );
    }
    throw err;
  }

  if (!source || source.abi.length === 0) {
    return etherscanErr("Contract source code not verified", "NOTOK");
  }

  return etherscanOk(JSON.stringify(source.abi));
}

// ===========================================================================
// verifysourcecode — translate Etherscan request to Sourcify and forward
// ===========================================================================

/**
 * v1 supports only `solidity-standard-json-input`. Single-file submissions
 * are rejected with a clear error — modern tooling (hardhat-verify,
 * foundry, ethers-tools) defaults to standard JSON anyway, so this covers
 * essentially all real-world callers. Adding single-file support later
 * requires fabricating a metadata.json hash that matches deploy-time
 * solc output; doing it correctly means re-running solc, which is what
 * `services/solcCompiler` already does for source-map purposes.
 */
export async function verifySourceCodeAction(
  params: Record<string, unknown>,
  chain: ChainConfig = defaultChain(),
): Promise<EtherscanResponse<string>> {
  const address = String(
    params.contractaddress ?? params.address ?? "",
  );
  if (!ADDRESS_RE.test(address)) {
    return etherscanErr("Invalid Address format");
  }

  // Sourcify can only verify on chains it indexes; the registry flags this.
  if (!chain.sourcifyEnabled) {
    return etherscanErr(
      `Source verification not available for chainId ${chain.chainId}`,
    );
  }

  const codeformat = String(params.codeformat ?? "");
  if (codeformat !== "solidity-standard-json-input") {
    return etherscanErr(
      "Unsupported codeformat — only 'solidity-standard-json-input' is accepted",
    );
  }

  const sourceCodeRaw = String(params.sourceCode ?? "");
  if (!sourceCodeRaw) {
    return etherscanErr("Missing sourceCode");
  }

  const compilerVersion = String(params.compilerversion ?? "");
  if (!compilerVersion) {
    return etherscanErr("Missing compilerversion");
  }

  let standardJson: {
    language?: string;
    sources?: Record<string, { content?: string }>;
    settings?: Record<string, unknown>;
  };
  try {
    standardJson = JSON.parse(sourceCodeRaw) as typeof standardJson;
  } catch {
    return etherscanErr("sourceCode is not valid JSON (standard-json input)");
  }

  const sources = standardJson.sources ?? {};
  const files: Record<string, string> = {};
  for (const [name, entry] of Object.entries(sources)) {
    if (typeof entry?.content === "string") {
      files[name] = entry.content;
    }
  }
  if (Object.keys(files).length === 0) {
    return etherscanErr("sourceCode has no source files");
  }

  // Sourcify wants a metadata.json alongside the sources. We build the
  // minimum-viable metadata from the standard-json settings — Sourcify
  // will recompile and either reach a perfect match (metadata hash lines
  // up with on-chain bytecode) or a partial match (bytecode matches but
  // metadata differs).
  const metadata = {
    compiler: { version: compilerVersion },
    language: standardJson.language ?? "Solidity",
    sources: Object.fromEntries(
      Object.keys(files).map((name) => [name, { content: files[name] }]),
    ),
    settings: standardJson.settings ?? {},
  };
  files["metadata.json"] = JSON.stringify(metadata);

  let result;
  try {
    result = await submitToSourcify({
      address,
      chainId: chain.chainId,
      files,
    });
  } catch (err) {
    if (err instanceof UpstreamError) {
      return etherscanErr(`Sourcify unavailable: ${err.message}`);
    }
    throw err;
  }

  const guid = storeVerifyResult(
    result.ok
      ? { kind: "pass", match: result.match }
      : { kind: "fail", error: result.error },
  );
  return etherscanOk(guid);
}

// ===========================================================================
// checkverifystatus
// ===========================================================================

export async function checkVerifyStatusAction(
  params: Record<string, unknown>,
  _chain: ChainConfig = defaultChain(),
): Promise<EtherscanResponse<string>> {
  void _chain;
  const guid = String(params.guid ?? "");
  if (!guid) return etherscanErr("Missing guid");

  const status = lookupVerifyResult(guid);
  if (!status) {
    return etherscanErr("Unknown or expired guid");
  }

  if (status.kind === "pass") {
    // Etherscan returns "Pass - Verified" for full matches and the same
    // string for partial; we tack the match-strength onto a second line
    // because tools that read the verbatim string ignore it, while a
    // human reading the API response can still tell the difference.
    return etherscanOk(
      status.match === "perfect" ? "Pass - Verified" : "Pass - Verified (partial)",
    );
  }
  return etherscanErr(`Fail - ${status.error}`);
}
