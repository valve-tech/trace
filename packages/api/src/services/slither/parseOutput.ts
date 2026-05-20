import type { SlitherFinding } from "./types.js";

interface RawSlitherDetector {
  check: string;
  impact: string;
  confidence: string;
  description: string;
  elements: Array<{
    type: string;
    name: string;
    source_mapping?: {
      start: number;
      length: number;
      filename_relative: string;
      lines: number[];
    };
  }>;
  first_markdown_element?: string;
  markdown?: string;
}

interface RawSlitherOutput {
  success: boolean;
  error: string | null;
  results?: { detectors?: RawSlitherDetector[] };
}

/**
 * Extract findings from Slither's JSON output. Slither sometimes prints
 * non-JSON prelude (solc-select status, version banners) before the
 * JSON object, so we slice from the first `{` rather than parsing the
 * whole stdout. Malformed/missing JSON returns `[]` — the caller treats
 * empty as "no findings" rather than "no data."
 *
 * Source mapping is renamed `source_mapping → sourceMapping` to match
 * the rest of the wire surface (camelCase). Other fields keep their
 * Slither names where they're already markdown-prefixed
 * (`first_markdown_element`, `markdown`) to avoid breaking consumers
 * that pattern-match on those.
 */
export function parseSlitherOutput(stdout: string): SlitherFinding[] {
  const jsonStart = stdout.indexOf("{");
  if (jsonStart === -1) return [];

  try {
    const parsed = JSON.parse(stdout.slice(jsonStart)) as RawSlitherOutput;
    if (!parsed.results?.detectors) return [];

    return parsed.results.detectors.map((d) => ({
      check: d.check,
      impact: d.impact as SlitherFinding["impact"],
      confidence: d.confidence as SlitherFinding["confidence"],
      description: d.description,
      elements: d.elements.map((e) => ({
        type: e.type,
        name: e.name,
        sourceMapping: e.source_mapping
          ? {
              start: e.source_mapping.start,
              length: e.source_mapping.length,
              filename_relative: e.source_mapping.filename_relative,
              lines: e.source_mapping.lines,
            }
          : undefined,
      })),
      first_markdown_element: d.first_markdown_element,
      markdown: d.markdown,
    }));
  } catch {
    return [];
  }
}
