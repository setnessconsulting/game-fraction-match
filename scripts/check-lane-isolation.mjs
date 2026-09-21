/**
 * Lane isolation guard (GAME-187).
 *
 * A lane composes content — a catalogue, a numerator policy, one declared whole, a card box and a
 * representation preference order — and the planner relates it to two authorities it does not own: the
 * engine chooses which pool values are dealt and GAME-186's legibility policy chooses how each card is
 * drawn. This scan fails the build when the layer starts to reach past that relationship:
 *
 * 1. an engine import deeper than the public boundary, or a representation import deeper than its public
 *    boundary, because that would let a lane re-derive a value or a picture rather than being handed one;
 * 2. an import from anywhere else in the application, or any package at all — a lane is data plus rules and
 *    must stay testable in plain Node, so React, the DOM and repository tooling are all out;
 * 3. ambient capability markers (randomness, clock, timers, storage, network). Selection belongs to the
 *    engine's seeded generator: a lane that could reach for entropy would be a second generator.
 *
 * The scanners live in `scripts/lib/guardRules.mjs` and are unit tested in `tests/laneIsolation.test.ts`,
 * which exercises them against synthetic violating input as well as against this repository's own tree.
 */

import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LANE_ALLOWED_PACKAGES, LANE_ROOT, collectFiles, findLaneViolations, readTextFile } from "./lib/guardRules.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const laneRoot = resolve(repositoryRoot, LANE_ROOT);

const violations = [];
const sourceFiles = collectFiles(laneRoot, (path) => /\.(ts|tsx)$/.test(path));

if (sourceFiles.length === 0) {
  console.error(`Lane isolation scan failed: no source files found under ${LANE_ROOT}.`);
  process.exit(1);
}

for (const absolutePath of sourceFiles) {
  const repoPath = relative(repositoryRoot, absolutePath).replaceAll("\\", "/");
  const source = readTextFile(absolutePath);
  if (source === null) {
    violations.push(`${repoPath}: unreadable source file`);
    continue;
  }

  for (const finding of findLaneViolations(repoPath, source)) {
    violations.push(`${repoPath}:${finding.line}: ${finding.detail} (${finding.ruleId})`);
  }
}

if (violations.length > 0) {
  console.error("Lane isolation scan failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(
  `PASS: ${sourceFiles.length} lane module(s) consume only the public engine and representation boundaries, ` +
    `import no package (allowed: ${LANE_ALLOWED_PACKAGES.length === 0 ? "none" : LANE_ALLOWED_PACKAGES.join(", ")}) ` +
    "and carry no ambient state.",
);
