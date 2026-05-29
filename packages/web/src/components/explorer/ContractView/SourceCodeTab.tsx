function CodeBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg bs overflow-hidden theme-card-bg"
    >
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="p-4 text-center text-sm theme-text-muted"
    >
      {message}
    </div>
  );
}

export function AbiTab({ abi }: { abi: unknown }) {
  return (
    <CodeBox>
      {abi ? (
        <div
          className="p-4 text-xs font-mono overflow-x-auto max-h-[600px] overflow-y-auto"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            color: "var(--color-text-primary)",
          }}
        >
          <pre className="whitespace-pre-wrap break-all">
            {JSON.stringify(abi, null, 2)}
          </pre>
        </div>
      ) : (
        <EmptyState message="ABI not available (contract not verified)" />
      )}
    </CodeBox>
  );
}

export function SourceTab({ sourceCode }: { sourceCode: string | null }) {
  return (
    <CodeBox>
      {sourceCode ? (
        <div
          className="p-4 text-xs font-mono overflow-x-auto max-h-[600px] overflow-y-auto"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            color: "var(--color-text-primary)",
          }}
        >
          <pre className="whitespace-pre-wrap">{sourceCode}</pre>
        </div>
      ) : (
        <EmptyState message="Source code not available (contract not verified)" />
      )}
    </CodeBox>
  );
}
