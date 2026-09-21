/**
 * Application root.
 *
 * The default surface is the playable game (GAME-189). The debug shell that each earlier story qualified its
 * artefact in lives behind `#debug`, so the shipped artifact is the product rather than a gallery, and the
 * galleries stay reachable for inspection and for their browser qualifications.
 *
 * The view is chosen from the URL hash and follows it, so a direct link either way works and the browser's own
 * back button behaves. No router dependency is added for this: one flag does not need one.
 */

import { useEffect, useState } from "react";

import { DebugShell } from "./app/DebugShell";
import { GameApp } from "./game";

/** The hash that selects the debug shell. `#debug`, `#/debug` and `#debug/` all work. */
const DEBUG_HASH = "debug";

function debugRequested(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hash.replace(/^#\/?/, "").replace(/\/$/, "") === DEBUG_HASH;
}

/** True when the debug shell should render. Exported so a test can pin the rule without a DOM. */
export function isDebugRoute(hash: string): boolean {
  return hash.replace(/^#\/?/, "").replace(/\/$/, "") === DEBUG_HASH;
}

export default function App() {
  const [debug, setDebug] = useState(debugRequested);

  useEffect(() => {
    const onHashChange = () => setDebug(debugRequested());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return debug ? <DebugShell /> : <GameApp />;
}
