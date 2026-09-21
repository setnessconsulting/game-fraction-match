/**
 * The inspection window (GAME-190).
 *
 * A mismatch stays on screen long enough to be looked at, and never longer than the contract allows. This hook
 * owns the two timers and nothing else.
 *
 * WHAT A TIMER IS ALLOWED TO DO
 * Exactly one thing: ask the board to clear a pending comparison. That is a *display* transition — the engine
 * decided the outcome and counted the move when the second card was selected, and `acknowledge-comparison`
 * changes neither. So a timer can never mutate truth, which is what "presentation callbacks are cancelable and
 * cannot mutate truth" means in code, and `tests/gameFeedback.test.ts` asserts that the matched set and the move
 * count are identical before and after an automatic dismissal.
 *
 * CANCELLATION
 * Both timers are cleared on unmount, on a change of board, and whenever the mismatch leaves the screen. The board
 * is keyed by its own identity, so a reset or a new deal remounts it and the cleanup runs; a stale timer therefore
 * cannot dismiss a comparison that belongs to a board nobody is looking at any more.
 */

import { useEffect, useState } from "react";

import { inspectionPlanFor, type InspectionPlan } from "./feedback";
import type { MotionPreference } from "../design";

/** Read the learner's motion preference. A presentation fact, read where reading the window is allowed. */
export function useMotionPreference(): MotionPreference {
  const [preference, setPreference] = useState<MotionPreference>(() => currentPreference());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setPreference(query.matches ? "reduced" : "full");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return preference;
}

function currentPreference(): MotionPreference {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "full";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full";
}

export type InspectionWindow = {
  /** Whether the learner may clear the pair yet. Before this, the window is still being inspected. */
  readonly dismissable: boolean;
  readonly plan: InspectionPlan;
};

/**
 * Hold a mismatched pair on screen between the minimum and the maximum.
 *
 * `active` is "a mismatch is on screen". When it turns false the timers are cleared, so an automatic dismissal
 * can never fire for a comparison that has already been cleared by the learner.
 */
export function useInspectionWindow(options: {
  readonly active: boolean;
  readonly onAutoDismiss: () => void;
  readonly preference?: MotionPreference;
}): InspectionWindow {
  const plan = inspectionPlanFor(options.preference ?? "full");
  const [dismissable, setDismissable] = useState(false);
  const { active, onAutoDismiss, preference } = options;

  useEffect(() => {
    if (!active) {
      setDismissable(false);
      return;
    }

    setDismissable(false);
    const minimum = window.setTimeout(() => setDismissable(true), plan.dismissableAfterMs);
    const maximum = window.setTimeout(() => onAutoDismiss(), plan.autoDismissAfterMs);
    return () => {
      window.clearTimeout(minimum);
      window.clearTimeout(maximum);
    };
    // `preference` is a dependency even though the plan is identical under both: reading it keeps the effect
    // honest about what it consumed, and a future change to the plan would have to be deliberate.
  }, [active, onAutoDismiss, plan.dismissableAfterMs, plan.autoDismissAfterMs, preference]);

  return Object.freeze({ dismissable, plan });
}
