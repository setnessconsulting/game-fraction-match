export type GuardPatternRule = {
  readonly id: string;
  readonly pattern: RegExp;
  readonly message: string;
};

export type GuardViolation = {
  readonly ruleId: string;
  readonly line: number;
  readonly message: string;
  readonly excerpt: string;
};

export type ImportSpecifier = {
  readonly specifier: string;
  readonly line: number;
  readonly column: number;
};

export const ENGINE_ROOT: string;
export const ENGINE_PUBLIC_BOUNDARY: string;

export function stripComments(source: string): string;
export function stripCommentsAndStrings(source: string): string;
export function lineOf(source: string, index: number): number;
export function findPatternViolations(text: string, rules: readonly GuardPatternRule[]): GuardViolation[];
export function findImportSpecifiers(source: string): ImportSpecifier[];
export function normalizeRepoPath(path: string): string;
export function resolveSpecifier(importerRepoPath: string, specifier: string): string | null;
export function isDeepEngineImport(resolvedPath: string | null): boolean;
export function isOutOfSourceImport(resolvedPath: string | null): boolean;

export const ENGINE_AMBIENT_RULES: readonly GuardPatternRule[];
export const ALLOWED_RUNTIME_DEPENDENCIES: readonly string[];
export const PRIVACY_RULES: readonly GuardPatternRule[];
export const PRIVACY_SOURCE_ONLY_RULES: readonly GuardPatternRule[];

export function collectFiles(absoluteRoot: string, filter: (path: string) => boolean): string[];
export function readTextFile(absolutePath: string): string | null;
