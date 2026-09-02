/**
 * Shared cube engine — re-exported from the frontend's pure-TypeScript core so
 * the backend solves cubes with the EXACT same, battle-tested logic (no second
 * copy of the solver to drift out of sync). The core files have no DOM/React
 * dependencies, so they bundle cleanly for Node via esbuild/tsx.
 *
 * If the project later extracts the engine into its own published package, this
 * is the single import site to update.
 */
export {
  solve,
  type Solution,
  type SolutionPhase,
  type PhaseId,
} from '../../frontend/src/core/solver';
export {
  validateState,
  stringToState,
  stateToString,
  isSolved,
  applyMoves,
  scramble,
  SOLVED_STATE,
  type Validation,
} from '../../frontend/src/core/cube';
export {
  toPlain,
  estimateSeconds,
  difficultyFor,
  PHASE_REASON,
  type PlainInstruction,
} from '../../frontend/src/core/notation';
export type { MoveName } from '../../frontend/src/core/moves';
