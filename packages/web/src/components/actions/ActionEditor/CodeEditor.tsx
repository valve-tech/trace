import { useCallback, useEffect, useRef } from "react";

interface Props {
  code: string;
  setCode: (code: string) => void;
}

export function CodeEditor({ code, setCode }: Props) {
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const lineNumRef = useRef<HTMLDivElement>(null);

  const lineCount = code.split("\n").length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newCode = code.substring(0, start) + "  " + code.substring(end);
        setCode(newCode);
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        });
      }
    },
    [code, setCode],
  );

  useEffect(() => {
    const textarea = codeRef.current;
    const lineNumEl = lineNumRef.current;
    if (!textarea || !lineNumEl) return;

    const handleScroll = () => {
      lineNumEl.scrollTop = textarea.scrollTop;
    };
    textarea.addEventListener("scroll", handleScroll);
    return () => textarea.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div>
      <label
        className="block text-sm font-medium mb-1.5 theme-text-secondary"
      >
        Code
      </label>
      <div
        className="rounded-lg bs overflow-hidden flex theme-primary-bg"
      >
        <div
          ref={lineNumRef}
          className="select-none text-right py-3 overflow-hidden flex-shrink-0 theme-text-muted theme-mono theme-secondary-bg"
          style={{
            fontSize: "13px",
            lineHeight: "1.5",
            width: "3.5rem",
            boxShadow: "1px 0 0 0 var(--color-border-muted)",
          }}
        >
          {lineNumbers.map((n) => (
            <div key={n} className="px-2">
              {n}
            </div>
          ))}
        </div>

        <textarea
          ref={codeRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          className="flex-1 p-3 resize-none outline-none theme-text theme-mono"
          style={{
            backgroundColor: "transparent",
            fontSize: "13px",
            lineHeight: "1.5",
            minHeight: "300px",
            border: "none",
            tabSize: 2,
          }}
        />
      </div>
    </div>
  );
}
