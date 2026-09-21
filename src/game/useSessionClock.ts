/**
 * The session clock (GAME-191).
 *
 * The shell's job here is narrow: sample a clock, notice visibility changes, and hand both to the pure accumulator
 * in `sessionBounds.ts` as data. Nothing about the session arc is decided in this file.
 *
 * WHY THE CLOCK IS A PARAMETER
 * `now` defaults to `Date.now`, and a test can pass a counter instead. That is what makes "three minutes of active
 * play" a testable claim rather than one that requires waiting three minutes — and it is why the bounds are
 * provable at the exact millisecond.
 *
 * WHY ONLY TICKS REPUBLISH
 * The interval publishes a snapshot every second; the visibility, phase and input transitions update the
 * accumulator immediately but wait for the next tick to render. That keeps the component tree from re-rendering on
 * every keystroke, and a second of latency on a three-minute bound is not a fact anyone can observe.
 */

import { useEffect, useRef, useState } from "react";

import {
  activeTimeAfterInput,
  activeTimeAfterPhase,
  activeTimeAfterTick,
  activeTimeAfterVisibility,
  boundsFor,
  createActiveTimeAccount,
  idleOfferDue,
  type ActiveTimeAccount,
  type SessionBounds,
} from "./sessionBounds";

/** How often the shell samples the clock. */
export const TICK_MS = 1000;

export type SessionClock = {
  readonly activeMs: number;
  readonly idleMs: number;
  readonly idleOffer: boolean;
  readonly bounds: SessionBounds;
};

export function useSessionClock(options: {
  /** Whether the game is in an active board phase. Setup, instruction and summary time is not play time. */
  readonly boardActive: boolean;
  /** Production boards finished, which is the other half of the bounds. */
  readonly productionBoards: number;
  /** Changes whenever the learner does something; a new value means "input just happened". */
  readonly inputToken: number;
  /** The clock, as a parameter. */
  readonly now?: () => number;
}): SessionClock {
  const { boardActive, productionBoards, inputToken } = options;
  const clockRef = useRef(options.now ?? (() => Date.now()));
  const accountRef = useRef<ActiveTimeAccount>(createActiveTimeAccount(clockRef.current()));
  const [clock, setClock] = useState<SessionClock>(() => snapshot(accountRef.current, clockRef.current(), 0));

  // The heartbeat. Also the thing that publishes every other transition.
  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = clockRef.current();
      accountRef.current = activeTimeAfterTick(accountRef.current, now);
      setClock(snapshot(accountRef.current, now, productionBoards));
    }, TICK_MS);
    return () => window.clearInterval(interval);
  }, [productionBoards]);

  // Hidden time is not play time: the interval that was running is credited up to the moment of hiding and no
  // further, which is what "hidden/background time does not consume active bounds" means in practice.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      const now = clockRef.current();
      accountRef.current = activeTimeAfterVisibility(accountRef.current, document.visibilityState === "visible", now);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    accountRef.current = activeTimeAfterPhase(accountRef.current, boardActive, clockRef.current());
  }, [boardActive]);

  useEffect(() => {
    // The first token is the initial value rather than an action, so it must not count as input.
    if (inputToken === 0) return;
    accountRef.current = activeTimeAfterInput(accountRef.current, clockRef.current());
  }, [inputToken]);

  return clock;
}

function snapshot(account: ActiveTimeAccount, nowMs: number, productionBoards: number): SessionClock {
  return Object.freeze({
    activeMs: account.activeMs,
    idleMs: Math.max(0, nowMs - account.lastInputAtMs),
    idleOffer: idleOfferDue(account, nowMs),
    bounds: boundsFor({ productionBoards, activeMs: account.activeMs }),
  });
}
