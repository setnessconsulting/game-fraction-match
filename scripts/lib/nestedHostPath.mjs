/**
 * The versioned nested prefix a released static-web artifact is served from.
 *
 * Single source of truth shared by the harness, the Playwright configuration and the browser
 * smoke test. The real prefix uses the released version instead of `test-version`:
 * `/game-assets/fraction-match/<version>/`.
 */
export const NESTED_BASE_PATH = "/game-assets/fraction-match/test-version";
