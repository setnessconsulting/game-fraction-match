/**
 * Representation isolation guard.
 *
 * GAME-186's primitives are a one-way projection of engine values: they read `numerator`,
 * `denominator` and the canonical pair as data and draw them. This scan fails the build when the layer
 * starts to reach for anything that would break that relationship:
 *
 * 1. an engine import of any kind — the boundary included — because importing the engine would let a
 *    picture re-derive, second-guess or duplicate the mathematics, and would stop the layer being
 *    extractable into a shared package;
 * 2. an import from outside the layer, or a package other than React;
 * 3. ambient capability markers (randomness, clock, timers, storage, network) — geometry must be a pure
 *    function of its inputs;
 * 4. stylesheet invariants that make the legibility floors meaningful: no `transform`, no motion other
 *    than `none`, no `font-size` where geometry owns it, and explicit forced-colors, reduced-motion and
 *    hidden-text-alternative rules.
 *
 * The shared scanners live in `scripts/lib/guardRules.mjs` and are themselves unit tested in
 * `tests/representationIsolation.test.ts`.
 */

import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ENGINE_AMBIENT_RULES,
  REPRESENTATION_ALLOWED_PACKAGES,
  REPRESENTATION_ROOT,
  REPRESENTATION_STYLE_PATH,
  collectFiles,
  findImportSpecifiers,
  findPatternViolations,
  findRepresentationStyleViolations,
  isEngineImport,
  isOutOfSourceImport,
  isRepresentationInternalImport,
  readTextFile,
  resolveSpecifier,
  stripCommentsAndStrings,
} from "./lib/guardRules.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const representationRoot = resolve(repositoryRoot, REPRESENTATION_ROOT);

const violations = [];
const sourceFiles = collectFiles(representationRoot, (path) => /\.(ts|tsx)$/.test(path));
const styleFiles = collectFiles(representationRoot, (path) => path.endsWith(".css"));

if (sourceFiles.length === 0) {
  console.error(`Representation isolation scan failed: no source files found under ${REPRESENTATION_ROOT}.`);
  process.exit(1);
}

for (const absolutePath of sourceFiles) {
  const repoPath = relative(repositoryRoot, absolutePath).replaceAll("\\", "/");
  const source = readTextFile(absolutePath);
  if (source === null) {
    violations.push(`${repoPath}: unreadable source file`);
    continue;
  }

  for (const { specifier, line } of findImportSpecifiers(source)) {
    const resolved = resolveSpecifier(repoPath, specifier);

    if (isEngineImport(resolved)) {
      violations.push(
        `${repoPath}:${line}: the representation layer must not import the engine ` +
          `("${specifier}" resolves to "${resolved}"); the engine stays the only mathematical authority`,
      );
      continue;
    }
    if (isOutOfSourceImport(resolved)) {
      violations.push(
        `${repoPath}:${line}: the representation layer must not import repository tooling (resolved "${resolved}")`,
      );
      continue;
    }
    if (resolved === null) {
      const packageName = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0];
      if (!REPRESENTATION_ALLOWED_PACKAGES.includes(packageName ?? "")) {
        violations.push(
          `${repoPath}:${line}: the representation layer may only import ${REPRESENTATION_ALLOWED_PACKAGES.join(
            ", ",
          )} and its own modules; "${specifier}" is not allowed`,
        );
      }
      continue;
    }
    if (!isRepresentationInternalImport(resolved)) {
      violations.push(
        `${repoPath}:${line}: the representation layer must stay self-contained; "${specifier}" resolves outside it ("${resolved}")`,
      );
    }
  }

  for (const violation of findPatternViolations(stripCommentsAndStrings(source), ENGINE_AMBIENT_RULES)) {
    violations.push(
      `${repoPath}:${violation.line}: ${violation.message} (${violation.ruleId}: ${violation.excerpt})`,
    );
  }
}

if (styleFiles.length !== 1) {
  violations.push(
    `expected exactly one representation stylesheet at ${REPRESENTATION_STYLE_PATH}; found ${styleFiles.length}`,
  );
}

for (const absolutePath of styleFiles) {
  const repoPath = relative(repositoryRoot, absolutePath).replaceAll("\\", "/");
  const source = readTextFile(absolutePath);
  if (source === null) {
    violations.push(`${repoPath}: unreadable stylesheet`);
    continue;
  }
  for (const violation of findRepresentationStyleViolations(source)) {
    violations.push(`${repoPath}:${violation.line}: ${violation.message} (${violation.ruleId}: ${violation.excerpt})`);
  }
}

if (violations.length > 0) {
  console.error("Representation isolation scan failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(
  `PASS: ${sourceFiles.length} representation module(s) import no engine code, stay self-contained and ` +
    `carry no ambient state; ${styleFiles.length} stylesheet(s) keep the legibility invariants.`,
);
