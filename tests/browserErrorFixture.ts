import { expect, test as base } from "@playwright/test";

type BrowserErrorFixtures = {
  /**
   * The console errors this journey deliberately causes, as one anchored pattern.
   *
   * A single `RegExp` rather than a list on purpose: Playwright reads a bare array option value as a fixture
   * tuple, and an option whose value is an array has to be wrapped in another array — a shape that is easy to get
   * subtly wrong in a way that silently widens or narrows the allowance. Alternation in one pattern is unambiguous.
   */
  expectedConsoleErrors: RegExp;
  browserErrorGate: void;
};

/**
 * Automatic gate: any console error or uncaught page error fails the test.
 *
 * This is intentionally repository-wide so a new browser journey cannot silently opt out of the
 * console/error requirement.
 *
 * THE ONE DECLARED EXCEPTION
 * A journey may declare `expectedConsoleErrors` when it *deliberately* causes a failure — the calm-recovery
 * qualification is the only such case today, because a render boundary can only be proved by making something
 * throw. Three properties keep that from weakening the gate:
 *
 * 1. the patterns are anchored, so they cannot absorb an unrelated error by prefix;
 * 2. the declaration is written in the test file that causes the failure, where a reviewer sees it;
 * 3. it can never excuse an **uncaught** error — `pageerror` is always fatal, in every journey. A boundary that
 *    failed to catch would surface there and still fail the test.
 */
export const test = base.extend<BrowserErrorFixtures>({
  // A pattern that cannot match: every message the gate sees is prefixed with "console.error: ".
  expectedConsoleErrors: [/^NO_DECLARED_CONSOLE_ERRORS$/, { option: true }],
  browserErrorGate: [
    async ({ page, expectedConsoleErrors }, use, testInfo) => {
      const errors: string[] = [];
      const pageErrors: string[] = [];

      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = `console.error: ${message.text()}`;
        if (expectedConsoleErrors.test(text)) return;
        errors.push(text);
      });
      page.on("pageerror", (error) => pageErrors.push(`pageerror: ${error.message}`));

      await use();
      expect(pageErrors, `Uncaught page errors in ${testInfo.title}`).toEqual([]);
      expect(errors, `Browser console errors in ${testInfo.title}`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
