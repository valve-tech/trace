import { SectionCard } from "./primitives";

export function RawDataSection({ input }: { input: string }) {
  return (
    <SectionCard title="Raw Data" defaultOpen={false}>
      <div className="pt-3 space-y-3">
        <div>
          <span
            className="text-xs font-medium block mb-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Input Data
          </span>
          <div
            className="rounded-md p-3 text-xs font-mono break-all max-h-48 overflow-y-auto"
            style={{
              backgroundColor: "var(--color-bg-primary)",
              color: "var(--color-text-primary)",
            }}
          >
            {input || "0x"}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
