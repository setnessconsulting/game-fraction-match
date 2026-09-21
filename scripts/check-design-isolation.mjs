/**
 * Design isolation guard (GAME-188).
 *
 * The design layer is an authority about appearance: sizes, surfaces, states, motion and the responsive
 * contract. This scan fails the build when it starts to know about something it should be measuring instead:
 *
 * 1. an import from anywhere at all — not the engine, which owns mathematics; not the representations, which
 *    own pictures; not the lanes, which own content; and no package, so a design decision stays answerable
 *    in plain Node rather than in a browser;
 * 2. ambient capability markers (randomness, clock, timers, storage, network), because a layout plan that
 *    read the clock or the DOM would stop being the pure function the fit contract depends on.
 *
 * The scanners live in `scripts/lib/guardRules.mjs` and are unit tested in `tests/designIsolation.test.ts`
 * against synthetic violating input as well as against this repository's own tree.
 */

import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DESIGN_ALLOWED_PACKAGES, DESIGN_ROOT, collectFiles, findDesignViolations, readTextFile } from "./lib/guardRules.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const designRoot = resolve(repositoryRoot, DESIGN_ROOT);

const violations = [];
const sourceFiles = collectFiles(designRoot, (path) => /\.(ts|tsx)$/.test(path));

if (sourceFiles.length === 0) {
  console.error(`Design isolation scan failed: no source files found under ${DESIGN_ROOT}.`);
  process.exit(1);
}

for (const absolutePath of sourceFiles) {
  const repoPath = relative(repositoryRoot, absolutePath).replaceAll("\\", "/");
  const source = readTextFile(absolutePath);
  if (source === null) {
    violations.push(`${repoPath}: unreadable source file`);
    continue;
  }

  for (const finding of findDesignViolations(repoPath, source)) {
    violations.push(`${repoPath}:${finding.line}: ${finding.detail} (${finding.ruleId})`);
  }
}

if (violations.length > 0) {
  console.error("Design isolation scan failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(
  `PASS: ${sourceFiles.length} design module(s) import nothing but each other ` +
    `(packages allowed: ${DESIGN_ALLOWED_PACKAGES.length === 0 ? "none" : DESIGN_ALLOWED_PACKAGES.join(", ")}) ` +
    "and carry no ambient state.",
);
