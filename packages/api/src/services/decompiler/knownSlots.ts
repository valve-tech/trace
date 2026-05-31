/**
 * Well-known constant storage slots used by standard upgradeable / proxy
 * patterns. Detecting these in heimdall's decompiled output lets us
 * LABEL slots with their canonical meaning — for proxy contracts (a
 * huge fraction of "unverified contract" cases), the storage layout is
 * defined by the EIPs they implement, not by source we'd ever verify.
 *
 * Slot values are stored as 64-char lowercase hex without 0x prefix.
 * Each EIP defines its slot as `keccak256(name) - 1` (so the slot can't
 * collide with anything that derives from a hashed key).
 *
 * Adding a slot here is the one-place edit; the slot extractor matches
 * against the registry and surfaces `label` on the discovered-slots
 * panel.
 */

export interface KnownSlot {
  /** 64-char lowercase hex (no 0x prefix). */
  slot: string;
  /** Human-readable name shown on the panel: e.g. "EIP-1967 implementation". */
  label: string;
  /** Short tooltip hint: provenance and meaning. */
  hint: string;
}

export const KNOWN_SLOTS: KnownSlot[] = [
  {
    slot: "360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
    label: "EIP-1967 implementation",
    hint: "Transparent / UUPS proxy implementation address — keccak256('eip1967.proxy.implementation') - 1.",
  },
  {
    slot: "b53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
    label: "EIP-1967 admin",
    hint: "Transparent proxy admin — keccak256('eip1967.proxy.admin') - 1.",
  },
  {
    slot: "a3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
    label: "EIP-1967 beacon",
    hint: "Beacon proxy target — keccak256('eip1967.proxy.beacon') - 1.",
  },
  {
    slot: "4910fdfa16fed3260ed0e7147f7cc6da11a60208b5b9406d12a635614ffd9143",
    label: "EIP-1967 rollback",
    hint: "UUPS rollback safety slot used during upgrade preflight.",
  },
  {
    slot: "c5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7",
    label: "EIP-1822 proxiable UUID",
    hint: "Legacy UUPS implementation slot — keccak256('PROXIABLE').",
  },
  {
    slot: "f0c57e16840df040f15088dc2f81fe391c3923bec73e23a9662efc9c229c6a00",
    label: "OZ Initializable",
    hint: "OpenZeppelin upgradeable initializer state (_initialized + _initializing).",
  },
  {
    slot: "9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00",
    label: "OZ ReentrancyGuard",
    hint: "OpenZeppelin upgradeable reentrancy guard state.",
  },
  {
    slot: "02b65dffa1c9b94054ba62cf2da89f0aa3ed40fd17ffe1f1eddc0db1f01c3b00",
    label: "OZ Ownable2Step",
    hint: "OpenZeppelin upgradeable two-step ownership (pendingOwner).",
  },
];

const BY_SLOT = new Map(KNOWN_SLOTS.map((k) => [k.slot, k]));

/**
 * Look up a slot by its 64-char lowercase hex value (no 0x prefix).
 * Accepts inputs with or without 0x and any casing — normalizes for
 * the registry lookup. Returns null when not registered.
 */
export function lookupKnownSlot(rawSlot: string): KnownSlot | null {
  const normalized = (rawSlot.startsWith("0x") ? rawSlot.slice(2) : rawSlot)
    .toLowerCase()
    .padStart(64, "0");
  return BY_SLOT.get(normalized) ?? null;
}
