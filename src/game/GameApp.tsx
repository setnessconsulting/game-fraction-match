/**
 * The game shell (GAME-189).
 *
 * The stage machine walks setup → instruction → board → board-complete, and every transition is an intent. The
 * shell holds one piece of state — the session — and it is produced by `applyIntent`, so there is exactly one
 * place the game can change and it is a pure function.
 *
 * THE HOST BOUNDARY
 * This surface never navigates anywhere: no `window.parent`, no top-level route, no `postMessage`, no network
 * and no storage. The games-site play toolbar owns the way back to the arcade and fullscreen; ending a session
 * here returns to this game's own setup, which is what the host contract asks for. The architecture guards fail
 * the build if that changes.
 *
 * A FAILURE LANDS SOMEWHERE USABLE
 * The stage surface is wrapped in an error boundary that renders a calm recovery surface with one real action. A
 * learner never sees a stack trace, and recovery is a button rather than a reload.
 *
 * NOTHING STARTS ON ITS OWN
 * A finished board stops and says so. The next board is an explicit choice, and so is ending the session.
 */

import { Component, useCallback, useState, type ReactNode } from "react";

import {
  applyIntent,
  createSession,
  gradeOptions,
  instructionFor,
  lanesForGrade,
  productionLaneFor,
  type GameIntent,
  type GameSession,
  type SessionStage,
} from "./session";
import type { GradeBand } from "../lanes";
import { Board, nextSeed } from "./Board";

/** The grade labels. A grade band is an ordering label; the catalogue is what the surface actually states. */
const GRADE_LABELS: Readonly<Record<GradeBand, string>> = Object.freeze({
  "grade-3": "Grade 3",
  "grade-4": "Grade 4",
  "grade-5": "Grade 5",
});

function gradeLabel(gradeBand: GradeBand | null): string {
  return gradeBand === null ? "" : GRADE_LABELS[gradeBand];
}

/** A calm recovery surface: plain language, one action, and no exception text. */
export function CalmRecovery({ onRecover }: { readonly onRecover: () => void }) {
  return (
    <section
      className="panel"
      aria-labelledby="recovery-heading"
      data-testid="game-recovery"
      data-screen="calm-recovery"
    >
      <h2 id="recovery-heading">This board could not be drawn</h2>
      <p className="microcopy">
        Nothing was lost and nothing was saved. Start again from the grade screen whenever you are ready.
      </p>
      <div className="controls">
        <button type="button" data-testid="game-recovery-restart" onClick={onRecover}>
          Back to grades
        </button>
      </div>
    </section>
  );
}

type BoundaryProps = { readonly children: ReactNode; readonly onRecover: () => void };
type BoundaryState = { readonly failed: boolean };

/**
 * Render-error boundary.
 *
 * `getDerivedStateFromError` is the only hook that can catch a render failure, so this stays a class component
 * even though the rest of the shell is function components. `componentDidCatch` deliberately reports nowhere:
 * telemetry is forbidden here, so the failure is rendered rather than transmitted.
 */
export class BoardErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override componentDidCatch(): void {
    // Intentionally empty: no logging sink, no network, no storage. The surface below is the whole response.
  }

  override render(): ReactNode {
    if (this.state.failed) return <CalmRecovery onRecover={this.props.onRecover} />;
    return this.props.children;
  }
}

function GradeSetup({ onChoose }: { readonly onChoose: (gradeBand: GradeBand) => void }) {
  return (
    <section className="panel" aria-labelledby="setup-heading" data-testid="game-setup" data-screen="grade-setup">
      <h2 id="setup-heading">Choose a grade</h2>
      <p className="microcopy">
        Each grade deals its own reviewed catalogue. The grade is an ordering label, not a claim about what you
        will learn today.
      </p>
      <ul className="fm-progress" data-testid="game-grades">
        {gradeOptions().map((gradeBand) => {
          const lane = productionLaneFor(gradeBand);
          return (
            <li key={gradeBand}>
              <button
                type="button"
                data-testid="game-grade"
                data-grade-band={gradeBand}
                data-lane-id={lane.laneId}
                data-pair-count={lane.pairCount}
                onClick={() => onChoose(gradeBand)}
              >
                {GRADE_LABELS[gradeBand]}
              </button>
              <span className="design-note">
                {" "}
                {lane.pairCount} pairs · denominators {lane.denominatorCatalogue.join(", ")}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="design-note" data-testid="game-setup-lanes">
        {gradeOptions()
          .map((gradeBand) => `${GRADE_LABELS[gradeBand]}: ${lanesForGrade(gradeBand).length} lane(s)`)
          .join(" · ")}
      </p>
    </section>
  );
}

function Instruction({
  session,
  onBegin,
  onEnd,
}: {
  readonly session: GameSession;
  readonly onBegin: () => void;
  readonly onEnd: () => void;
}) {
  const board = session.board;

  return (
    <section
      className="panel"
      aria-labelledby="instruction-heading"
      data-testid="game-instruction"
      data-screen="instruction"
    >
      <h2 id="instruction-heading">{board?.kind === "warm-up" ? "Warm-up" : "Board"}</h2>
      <p data-testid="game-instruction-copy">{instructionFor(board)}</p>
      <p className="design-note" data-testid="game-instruction-detail">
        {board?.plan.cards.length ?? 0} card(s) · card {board?.lane.cardBox.width}×{board?.lane.cardBox.height} px
      </p>
      <div className="controls">
        <button type="button" data-testid="game-begin" onClick={onBegin}>
          Start
        </button>
        <button type="button" data-testid="game-instruction-end" onClick={onEnd}>
          End session
        </button>
      </div>
    </section>
  );
}

/** The stage surface, without the shell chrome. Exported so a fixture can render one stage in isolation. */
export function GameStage({
  session,
  onIntent,
}: {
  readonly session: GameSession;
  readonly onIntent: (intent: GameIntent) => void;
}) {
  switch (session.stage) {
    case "grade-setup":
      return (
        <GradeSetup onChoose={(gradeBand) => onIntent({ type: "choose-grade", gradeBand, seed: nextSeed() })} />
      );
    case "instruction":
      return (
        <Instruction
          session={session}
          onBegin={() => onIntent({ type: "begin-board" })}
          onEnd={() => onIntent({ type: "end-session" })}
        />
      );
    case "board":
    case "board-complete":
      return (
        <Board
          // Keyed by the board's identity so a new deal remounts the grid: focus, refs and the anchor all belong
          // to one board and must not be carried into the next one.
          key={`${session.board?.lane.laneId ?? "none"}-${session.board?.seed ?? 0}-${session.completedBoards}`}
          session={session}
          onIntent={onIntent}
        />
      );
    case "calm-recovery":
      return <CalmRecovery onRecover={() => onIntent({ type: "end-session" })} />;
  }
}

/** The status line: facts about this session, and never a claim about the learner. */
function statusLine(stage: SessionStage, session: GameSession): string {
  if (stage === "grade-setup") return "Pick a grade to begin.";
  if (stage === "calm-recovery") return "Start again when you are ready.";
  const where = session.board?.kind === "warm-up" ? "warm-up" : "board";
  return `${gradeLabel(session.gradeBand)} · ${where} · ${session.completedBoards} board(s) finished`;
}

export function GameApp() {
  const [session, setSession] = useState<GameSession>(() => createSession());

  const dispatch = useCallback((intent: GameIntent) => {
    setSession((current) => applyIntent(current, intent));
  }, []);

  const recover = useCallback(() => setSession(createSession()), []);

  return (
    <main className="game-shell" data-testid="game-shell" data-stage={session.stage}>
      <header className="game-shell__header">
        <p className="eyebrow">Fraction Match</p>
        <h1>Match the same amount</h1>
        <p className="lede" data-testid="game-status-line">
          {statusLine(session.stage, session)}
        </p>
      </header>

      <BoardErrorBoundary
        key={`boundary-${session.stage}-${session.board?.seed ?? 0}`}
        onRecover={recover}
      >
        <GameStage session={session} onIntent={dispatch} />
      </BoardErrorBoundary>

      <footer className="shell-footer">
        <span>Session-only, memory-only play.</span>
        <span>No accounts, no cookies, no storage, no telemetry, no gameplay network requests.</span>
      </footer>
    </main>
  );
}
