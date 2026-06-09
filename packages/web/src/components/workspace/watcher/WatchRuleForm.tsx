import { useMemo, useState } from "react";
import { isAddress } from "viem";
import { CHAINS, DEFAULT_CHAIN_ID } from "../../../lib/chains";
import type { Workspace } from "../../../lib/workspace/types";
import type {
  WatchDirection,
  WatchRuleKind,
} from "../../../lib/watcher/types";
import type { NewRuleInput } from "../../../lib/watcher/rules";

/**
 * Add-rule form. Pre-seeds the chain + address suggestions from the workspace's
 * own items so the common path ("watch this address I already saved") is two
 * clicks. Validation is minimal-but-real: the required address/token must be a
 * valid 0x address before Add enables — an unactionable rule never reaches IDB.
 */
export function WatchRuleForm({
  workspace,
  onAdd,
  onCancel,
}: {
  workspace: Workspace;
  onAdd: (input: NewRuleInput) => Promise<unknown>;
  onCancel: () => void;
}) {
  const addressItems = useMemo(
    () => workspace.items.filter((it) => it.kind === "address"),
    [workspace.items],
  );
  const defaultChain =
    addressItems.find((it) => it.chainId)?.chainId ?? DEFAULT_CHAIN_ID;

  const [kind, setKind] = useState<WatchRuleKind>("address_activity");
  const [chainId, setChainId] = useState<number>(defaultChain);
  const [address, setAddress] = useState("");
  const [direction, setDirection] = useState<WatchDirection>("both");
  const [contractAddress, setContractAddress] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [label, setLabel] = useState("");

  const required = kind === "address_activity" ? address : contractAddress;
  const valid = isAddress(required.trim());
  // counterparty is optional, but if present it must be a real address
  const counterpartyOk =
    kind !== "erc20_transfer" ||
    counterparty.trim() === "" ||
    isAddress(counterparty.trim());
  const canAdd = valid && counterpartyOk;

  const submit = async () => {
    if (!canAdd) return;
    await onAdd({
      workspaceId: workspace.id,
      chainId,
      kind,
      label: label.trim() || undefined,
      address: kind === "address_activity" ? address.trim() : undefined,
      direction: kind === "address_activity" ? direction : undefined,
      contractAddress:
        kind === "erc20_transfer" ? contractAddress.trim() : undefined,
      counterparty:
        kind === "erc20_transfer" ? counterparty.trim() || undefined : undefined,
    });
    onCancel();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="card p-4 mb-4 space-y-stack"
    >
      <datalist id="ws-address-suggestions">
        {addressItems.map((it) => (
          <option key={it.id} value={it.value}>
            {it.label ?? it.value}
          </option>
        ))}
      </datalist>

      <div className="flex gap-inline flex-wrap">
        <Select
          label="Watch"
          value={kind}
          onChange={(v) => setKind(v as WatchRuleKind)}
          options={[
            ["address_activity", "Address activity"],
            ["erc20_transfer", "Token transfers"],
          ]}
        />
        <Select
          label="Chain"
          value={String(chainId)}
          onChange={(v) => setChainId(Number(v))}
          options={CHAINS.map((c) => [String(c.id), c.name])}
        />
      </div>

      {kind === "address_activity" ? (
        <div className="flex gap-inline flex-wrap">
          <Field
            label="Address"
            value={address}
            onChange={setAddress}
            placeholder="0x…"
            list="ws-address-suggestions"
            invalid={address.trim() !== "" && !valid}
          />
          <Select
            label="Direction"
            value={direction}
            onChange={(v) => setDirection(v as WatchDirection)}
            options={[
              ["both", "In + Out"],
              ["in", "Incoming"],
              ["out", "Outgoing"],
            ]}
          />
        </div>
      ) : (
        <div className="flex gap-inline flex-wrap">
          <Field
            label="Token contract"
            value={contractAddress}
            onChange={setContractAddress}
            placeholder="0x… (ERC-20)"
            invalid={contractAddress.trim() !== "" && !valid}
          />
          <Field
            label="Counterparty (optional)"
            value={counterparty}
            onChange={setCounterparty}
            placeholder="0x… filter"
            list="ws-address-suggestions"
            invalid={!counterpartyOk}
          />
        </div>
      )}

      <Field
        label="Label (optional)"
        value={label}
        onChange={setLabel}
        placeholder="e.g. Treasury outflows"
      />

      <div className="flex gap-inline">
        <button
          type="submit"
          disabled={!canAdd}
          className="text-xs px-3 py-1.5"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "#fff",
            opacity: canAdd ? 1 : 0.5,
          }}
        >
          Add watch
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 theme-text-secondary"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-border-muted)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Small labeled controls — local to the form, styled to match WorkspaceDetail.
// ---------------------------------------------------------------------------

function Field({
  label,
  value,
  onChange,
  placeholder,
  list,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  list?: string;
  invalid?: boolean;
}) {
  return (
    <label className="flex flex-col gap-tight flex-1 min-w-[12rem]">
      <span className="text-[11px] theme-text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={list}
        spellCheck={false}
        className="text-xs px-2 py-1.5 theme-primary-bg theme-text font-mono"
        style={{
          boxShadow: `inset 0 0 0 1px ${
            invalid ? "var(--color-danger)" : "var(--color-border-muted)"
          }`,
        }}
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex flex-col gap-tight">
      <span className="text-[11px] theme-text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs px-2 py-1.5 theme-primary-bg theme-text"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-border-muted)" }}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
