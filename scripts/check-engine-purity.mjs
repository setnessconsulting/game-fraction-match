/**
 * Engine purity guard.
 *
 * Everything under `src/engine/` must be pure, deterministic and dependency-free. This scan fails
 * the build when an engine module reaches for ambient randomness, a clock, the DOM, persistence,
 * the network, timers, the process environment, a package, or a module outside the engine.
 */

import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ENGINE_AMBIENT_RULES,
  ENGINE_ROOT,
  collectFiles,
  findImportSpecifiers,
  findPatternViolations,
  isOutOfSourceImport,
  readTextFile,
  resolveSpecifier,
  stripCommentsAndStrings,
} from "./lib/guardRules.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const engineRoot = resolve(repositoryRoot, ENGINE_ROOT);

const violations = [];

for (const absolutePath of collectFiles(engineRoot, (path) => /\.(ts|tsx)$/.test(path))) {
  const repoPath = relative(repositoryRoot, absolutePath).replaceAll("\\", "/");

  if (repoPath.endsWith(".tsx")) {
    violations.push(`${repoPath}: the engine is presentation-free and must not use JSX/TSX`);
    continue;
  }

  const source = readTextFile(absolutePath);
  if (source === null) {
    violations.push(`${repoPath}: unreadable or binary engine module`);
    continue;
  }

  for (const violation of findPatternViolations(stripCommentsAndStrings(source), ENGINE_AMBIENT_RULES)) {
    violations.push(`${repoPath}:${violation.line}: ${violation.message} (${violation.ruleId}: ${violation.excerpt})`);
  }

  for (const { specifier, line } of findImportSpecifiers(source)) {
    const resolved = resolveSpecifier(repoPath, specifier);
    if (resolved === null) {
      violations.push(
        `${repoPath}:${line}: engine must not import the package "${specifier}"; the engine has no dependencies`,
      );
      continue;
    }
    if (isOutOfSourceImport(resolved) || !resolved.startsWith(`${ENGINE_ROOT}/`)) {
      violations.push(
        `${repoPath}:${line}: engine must not import outside ${ENGINE_ROOT}/ (resolved "${resolved}")`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error("Engine purity scan failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("PASS: engine modules are pure — no React, DOM, clock, entropy, storage, network or package imports.");
