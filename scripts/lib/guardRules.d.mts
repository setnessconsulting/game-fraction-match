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

export type GuardDeclarationRule = {
  readonly id: string;
  readonly property: string;
  readonly allowed: readonly string[];
  readonly message: string;
};

export type GuardRequiredMarker = {
  readonly id: string;
  readonly marker: string;
  readonly message: string;
};

export type CssDeclaration = {
  readonly property: string;
  readonly value: string;
  readonly line: number;
};

export type CssBlock = {
  readonly selector: string;
  readonly declarations: readonly CssDeclaration[];
  readonly line: number;
};

export const ENGINE_ROOT: string;
export const ENGINE_PUBLIC_BOUNDARY: string;
export const REPRESENTATION_ROOT: string;
export const REPRESENTATION_STYLE_PATH: string;
export const REPRESENTATION_ALLOWED_PACKAGES: readonly string[];
export const LANE_ROOT: string;
export const LANE_DEEP_ENGINE_SEGMENTS: number;

export function stripComments(source: string): string;
export function stripCommentsAndStrings(source: string): string;
export function lineOf(source: string, index: number): number;
export function findPatternViolations(text: string, rules: readonly GuardPatternRule[]): GuardViolation[];
export function findImportSpecifiers(source: string): ImportSpecifier[];
export function normalizeRepoPath(path: string): string;
export function resolveSpecifier(importerRepoPath: string, specifier: string): string | null;
export function isDeepEngineImport(resolvedPath: string | null): boolean;
export function isEngineImport(resolvedPath: string | null): boolean;
export function isRepresentationInternalImport(resolvedPath: string | null): boolean;
export function isOutOfSourceImport(resolvedPath: string | null): boolean;
export function isLaneInternalImport(resolvedPath: string | null): boolean;
export function isAllowedLaneDependency(resolvedPath: string | null): boolean;

export const ENGINE_AMBIENT_RULES: readonly GuardPatternRule[];
export const ALLOWED_RUNTIME_DEPENDENCIES: readonly string[];
export const PRIVACY_RULES: readonly GuardPatternRule[];
export const PRIVACY_SOURCE_ONLY_RULES: readonly GuardPatternRule[];
export const REPRESENTATION_STYLE_DECLARATION_RULES: readonly GuardDeclarationRule[];
export const REPRESENTATION_STYLE_SIZE_LOCKED_SELECTORS: readonly string[];
export const REPRESENTATION_STYLE_REQUIRED_MARKERS: readonly GuardRequiredMarker[];

export function stripCssComments(source: string): string;
export function parseCssBlocks(source: string): CssBlock[];
export function findRepresentationStyleViolations(source: string): GuardViolation[];

export function collectFiles(absoluteRoot: string, filter: (path: string) => boolean): string[];
export function readTextFile(absolutePath: string): string | null;
