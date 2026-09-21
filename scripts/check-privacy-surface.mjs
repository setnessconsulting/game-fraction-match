/**
 * Privacy surface guard.
 *
 * GAME-185 must introduce no learner account, cookie-backed or storage-backed gameplay state,
 * remote learner telemetry, analytics, observability, session replay, advertising or network
 * gameplay API. Static asset loading is the only browser network requirement.
 *
 * This scan checks three things:
 *  1. the runtime dependency allowlist (`react` and `react-dom` only);
 *  2. presentation source for persistence, network and telemetry markers (including `fetch(`);
 *  3. the production bundle for the same markers, so a transitive dependency cannot smuggle one in.
 *
 * `fetch(` is enforced on repository source only. Vite's modulepreload polyfill legitimately
 * contains one static-asset `fetch`, which is the single browser network requirement GAME-185
 * allows; outbound use is instead proven absent by the browser smoke test, which asserts that a
 * play session issues no request after the initial static load.
 */

import { existsSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_RUNTIME_DEPENDENCIES,
  ENGINE_ROOT,
  PRIVACY_RULES,
  PRIVACY_SOURCE_ONLY_RULES,
  collectFiles,
  findPatternViolations,
  readTextFile,
  stripCommentsAndStrings,
} from "./lib/guardRules.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const buildRoot = resolve(repositoryRoot, "dist");
const textExtensions = new Set([".css", ".html", ".js", ".json", ".mjs", ".svg", ".txt", ".webmanifest"]);

const violations = [];
const relativeToRoot = (absolutePath) => relative(repositoryRoot, absolutePath).replaceAll("\\", "/");

/* 1. Runtime dependency allowlist */
const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
const runtimeDependencies = Object.keys(packageJson.dependencies ?? {});
const unapproved = runtimeDependencies.filter((name) => !ALLOWED_RUNTIME_DEPENDENCIES.includes(name));
if (unapproved.length > 0) {
  violations.push(`unapproved direct runtime dependencies: ${unapproved.join(", ")}`);
}

/* 2. Presentation source */
const sourceRoot = resolve(repositoryRoot, "src");
const engineRoot = resolve(repositoryRoot, ENGINE_ROOT);
const presentationFiles = collectFiles(sourceRoot, (path) =>
  /\.(ts|tsx|css|html)$/.test(path) && !path.startsWith(engineRoot),
);
for (const absolutePath of presentationFiles) {
  const repoPath = relativeToRoot(absolutePath);
  const source = readTextFile(absolutePath);
  if (source === null) continue;
  const scannable = extname(absolutePath) === ".css" ? source : stripCommentsAndStrings(source);
  for (const rule of [...PRIVACY_RULES, ...PRIVACY_SOURCE_ONLY_RULES]) {
    for (const violation of findPatternViolations(scannable, [rule])) {
      violations.push(`${repoPath}:${violation.line}: ${violation.message} (${violation.ruleId})`);
    }
  }
}

/* 3. Production bundle */
if (!existsSync(resolve(buildRoot, "index.html"))) {
  console.error("Privacy scan requires the production build; run `npm run build` first.");
  process.exit(1);
}
const bundleFiles = collectFiles(buildRoot, (path) => textExtensions.has(extname(path).toLowerCase()));
if (bundleFiles.length === 0) violations.push("production bundle is empty");

for (const absolutePath of bundleFiles) {
  const repoPath = relativeToRoot(absolutePath);
  const contents = readTextFile(absolutePath);
  if (contents === null) continue;
  for (const violation of findPatternViolations(contents, PRIVACY_RULES)) {
    violations.push(`${repoPath}: ${violation.message} (${violation.ruleId}: ${violation.excerpt})`);
  }
}

if (violations.length > 0) {
  console.error("Privacy surface scan failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(
  `PASS: runtime dependencies ${runtimeDependencies.join(", ")} only; ` +
    `${presentationFiles.length} presentation file(s) and ${bundleFiles.length} bundle asset(s) contain no ` +
    "persistence, network or telemetry markers.",
);
