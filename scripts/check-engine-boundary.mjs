/**
 * Engine boundary guard.
 *
 * The mathematics is the authority, and presentation code may only reach it through the public
 * boundary module. This scan fails the build when anything under `src/` outside `src/engine/`
 * imports a deeper engine module (`./engine/rational`, `@/engine/deck`, ...), which is how
 * comparison authority would otherwise leak into the UI.
 *
 * It also stops application source from importing repository tooling.
 */

import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ENGINE_ROOT,
  collectFiles,
  findImportSpecifiers,
  isDeepEngineImport,
  isOutOfSourceImport,
  readTextFile,
  resolveSpecifier,
} from "./lib/guardRules.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceRoot = resolve(repositoryRoot, "src");
const engineRoot = resolve(repositoryRoot, ENGINE_ROOT);

const violations = [];

const sourceFiles = collectFiles(sourceRoot, (path) => /\.(ts|tsx)$/.test(path)).filter(
  (path) => !path.startsWith(engineRoot),
);

for (const absolutePath of sourceFiles) {
  const repoPath = relative(repositoryRoot, absolutePath).replaceAll("\\", "/");
  const source = readTextFile(absolutePath);
  if (source === null) {
    violations.push(`${repoPath}: unreadable source file`);
    continue;
  }

  for (const { specifier, line } of findImportSpecifiers(source)) {
    const resolved = resolveSpecifier(repoPath, specifier);
    if (isDeepEngineImport(resolved)) {
      violations.push(
        `${repoPath}:${line}: presentation must use the public engine boundary only; ` +
          `"${specifier}" reaches engine internals (resolved "${resolved}")`,
      );
      continue;
    }
    if (isOutOfSourceImport(resolved)) {
      violations.push(
        `${repoPath}:${line}: presentation must not import repository tooling (resolved "${resolved}")`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error("Engine boundary scan failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(
  `PASS: ${sourceFiles.length} presentation module(s) import only the public engine boundary and stay inside src/.`,
);
