import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (relativePath: string): string => readFileSync(resolve(repositoryRoot, relativePath), "utf8");

const packageJson = JSON.parse(read("package.json")) as {
  name: string;
  version: string;
  engines: Record<string, string>;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

const lockfile = JSON.parse(read("package-lock.json")) as {
  lockfileVersion: number;
  packages: Record<string, { version?: string }>;
};

describe("toolchain pinning", () => {
  it("agrees on Node 24 across every toolchain file", () => {
    expect(read(".nvmrc").trim()).toBe("24");
    expect(read(".node-version").trim()).toBe("24");
    expect(packageJson.engines.node).toBe("24.x");
  });

  it("pins exact versions instead of floating ranges", () => {
    const all = { ...packageJson.dependencies, ...packageJson.devDependencies };
    expect(Object.keys(all).length).toBeGreaterThan(10);
    for (const [name, version] of Object.entries(all)) {
      expect(version, `${name} must be pinned exactly`).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("commits a lockfile that matches the manifest", () => {
    expect(lockfile.lockfileVersion).toBeGreaterThanOrEqual(2);
    const root = lockfile.packages[""];
    expect(root?.version).toBe(packageJson.version);
    for (const name of Object.keys(packageJson.dependencies)) {
      expect(lockfile.packages[`node_modules/${name}`]?.version).toBe(packageJson.dependencies[name]);
    }
  });

  it("keeps the runtime dependency set to React and React DOM only", () => {
    expect(Object.keys(packageJson.dependencies).sort()).toEqual(["react", "react-dom"]);
    expect(Object.keys(packageJson.dependencies).map((name) => packageJson.dependencies[name])).toEqual([
      "19.2.3",
      "19.2.3",
    ]);
  });

  it("keeps accessibility tooling available for downstream qualification", () => {
    expect(Object.keys(packageJson.devDependencies)).toContain("@axe-core/playwright");
    expect(Object.keys(packageJson.devDependencies)).toEqual(
      expect.arrayContaining([
        "@playwright/test",
        "@vitest/coverage-v8",
        "eslint",
        "typescript",
        "vite",
        "vitest",
      ]),
    );
  });

  it("exposes the documented verification commands", () => {
    for (const script of [
      "build",
      "typecheck",
      "lint",
      "test",
      "test:coverage",
      "test:e2e:run",
      "test:host:run",
      "check:purity",
      "check:boundary",
      "check:architecture",
      "check:privacy",
      "verify",
    ]) {
      expect(packageJson.scripts, `${script} must exist`).toHaveProperty(script);
    }
  });

  it("keeps the static-web build base relative so it can be mounted under a versioned prefix", () => {
    expect(read("vite.config.ts")).toMatch(/base:\s*"\.\/"/);
  });
});
