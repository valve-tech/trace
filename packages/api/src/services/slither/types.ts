/**
 * Wire types for the Slither integration. SlitherFinding mirrors the
 * shape Slither emits in its JSON output (impact + confidence ladders,
 * detector check name, source-mapping lines for UI highlighting).
 */

export interface SlitherElement {
  type: string;
  name: string;
  sourceMapping?: {
    start: number;
    length: number;
    filename_relative: string;
    lines: number[];
  };
}

export interface SlitherFinding {
  check: string;
  impact: "High" | "Medium" | "Low" | "Informational" | "Optimization";
  confidence: "High" | "Medium" | "Low";
  description: string;
  elements: SlitherElement[];
  first_markdown_element?: string;
  markdown?: string;
}

export interface SlitherResult {
  address: string;
  findings: SlitherFinding[];
  detectorCount: number;
  durationMs: number;
  error: string | null;
  analyzedAt: string;
}
