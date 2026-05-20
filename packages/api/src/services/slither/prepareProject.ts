import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Strip the `v` prefix, build metadata, and pre-release suffix to get a
 * clean `X.Y.Z` solc version string. Slither's solc-select expects the
 * bare version; passing `0.8.20-ci.2022.11.07` makes it fail to install.
 */
export function sanitizeVersion(raw: string): string {
  const clean = raw
    .replace(/^v/, "")
    .replace(/\+.*$/, "")
    .replace(/-.*$/, "");
  if (!/^\d+\.\d+\.\d+$/.test(clean)) {
    throw new Error(`Invalid compiler version: ${raw}`);
  }
  return clean;
}

/**
 * Write the verified source files plus a minimal `foundry.toml` and
 * `slither.config.json` into a fresh tmp directory. The Foundry config
 * lets Slither pick its framework detection automatically, which is more
 * reliable than passing flags.
 *
 * Filenames go through a resolve-then-prefix-check to defeat
 * path-traversal attempts hidden in the contract metadata
 * (`..//../etc/passwd` style attacks land outside `tmpDir` after resolve,
 * which we then reject).
 */
export function prepareProject(
  sourceFiles: Array<{ name: string; content: string }>,
  compilerVersion: string,
  optimizationUsed: boolean,
  optimizationRuns: number | null,
): { tmpDir: string; cleanVersion: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "slither-"));

  for (const file of sourceFiles) {
    const filePath = path.resolve(tmpDir, file.name);
    if (!filePath.startsWith(tmpDir + path.sep) && filePath !== tmpDir) {
      throw new Error(`Path traversal detected in source file name: ${file.name}`);
    }
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, file.content, "utf-8");
  }

  const cleanVersion = sanitizeVersion(compilerVersion);

  const foundryToml = `[profile.default]
src = "."
out = "out"
libs = []
solc_version = "${cleanVersion}"
optimizer = ${optimizationUsed}
optimizer_runs = ${optimizationRuns ?? 200}
`;
  fs.writeFileSync(path.join(tmpDir, "foundry.toml"), foundryToml, "utf-8");

  const slitherConfig = {
    filter_paths: ["node_modules"],
    compile_force_framework: "foundry",
  };
  fs.writeFileSync(
    path.join(tmpDir, "slither.config.json"),
    JSON.stringify(slitherConfig, null, 2),
    "utf-8",
  );

  return { tmpDir, cleanVersion };
}
