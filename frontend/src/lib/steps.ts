/**
 * Turn a solver `Solution` into a flat list of guided coaching steps.
 *
 * We expand the per-phase (un-simplified) move lists so every single turn is
 * its own step — a beginner follows one quarter/half turn at a time — and carry
 * the phase context (title, goal, "why") onto each step for the coach UI.
 */
import type { Solution } from '../core/solver';
import { PHASE_REASON, toPlain, type PlainInstruction } from '../core/notation';
import { applyMove, type MoveName } from '../core/moves';
export interface GuidedStep {
  /** 1-based position across the whole solve. */
  number: number;
  total: number;
  move: MoveName;
  phaseId: Solution['phases'][number]['id'];
  phaseTitle: string;
  phaseGoal: string;
  phaseReason: string;
  /** Index of the phase within the solution (for progress dots). */
  phaseIndex: number;
  instruction: PlainInstruction;
  /** Cube facelet state BEFORE this move is performed. */
  before: string[];
  /** Cube facelet state AFTER this move is performed. */
  after: string[];
}

export function buildGuidedSteps(
  solution: Solution,
  initial: string[],
): GuidedStep[] {
  const steps: GuidedStep[] = [];
  const total = solution.phases.reduce((n, p) => n + p.moves.length, 0);
  let state = initial.slice();
  let number = 0;

  solution.phases.forEach((phase, phaseIndex) => {
    for (const move of phase.moves) {
      const before = state;
      const after = applyMove(before, move);
      number += 1;
      steps.push({
        number,
        total,
        move,
        phaseId: phase.id,
        phaseTitle: phase.title,
        phaseGoal: phase.goal,
        phaseReason: PHASE_REASON[phase.id],
        phaseIndex,
        instruction: toPlain(move),
        before,
        after,
      });
      state = after;
    }
  });

  return steps;
}
