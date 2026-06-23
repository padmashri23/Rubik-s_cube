/**
 * Solve routes.
 *
 *   POST /api/solve      { state: string | string[] }  -> validation + solution
 *   GET  /api/scramble?n=20                            -> a random solvable cube
 *
 * The solution includes both raw cube notation and plain-language steps so any
 * client (web, mobile, voice) can render a beginner-friendly guide.
 */

import { Router, type Request, type Response } from 'express';
import {
  solve,
  validateState,
  stringToState,
  stateToString,
  scramble,
  toPlain,
  estimateSeconds,
  difficultyFor,
  PHASE_REASON,
  type Solution,
} from '../engine';

const router = Router();

/** Accept a 54-char string or a 54-length array; return a normalized array. */
function normalizeState(input: unknown): string[] {
  if (typeof input === 'string') return stringToState(input);
  if (Array.isArray(input) && input.length === 54) return input.map(String);
  throw new Error('Body must include `state` as a 54-character string or a 54-length array.');
}

function buildSteps(solution: Solution) {
  const total = solution.phases.reduce((n, p) => n + p.moves.length, 0);
  let number = 0;
  const steps = solution.phases.flatMap((phase) =>
    phase.moves.map((move) => {
      number += 1;
      const instruction = toPlain(move);
      return {
        number,
        total,
        move,
        phaseId: phase.id,
        phaseTitle: phase.title,
        reason: PHASE_REASON[phase.id],
        text: instruction.text,
        voice: instruction.voice,
        face: instruction.face,
        faceName: instruction.faceName,
        arrow: instruction.arrow,
      };
    }),
  );
  return { total, steps };
}

router.post('/solve', (req: Request, res: Response) => {
  let state: string[];
  try {
    state = normalizeState(req.body?.state);
  } catch (e) {
    return res.status(400).json({ ok: false, error: (e as Error).message });
  }

  const validation = validateState(state);
  if (!validation.valid) {
    return res.status(422).json({
      ok: false,
      valid: false,
      errors: validation.errors,
      badStickers: validation.badStickers,
    });
  }

  try {
    const solution = solve(state.slice());
    const { total, steps } = buildSteps(solution);
    return res.json({
      ok: true,
      valid: true,
      state: stateToString(state),
      solution: {
        moves: solution.moves,
        moveCount: solution.moves.length,
        totalSteps: total,
        estimateSeconds: estimateSeconds(total),
        difficulty: difficultyFor(total),
        phases: solution.phases.map((p) => ({ id: p.id, title: p.title, goal: p.goal, moves: p.moves })),
        steps,
      },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

router.get('/scramble', (req: Request, res: Response) => {
  const n = Math.max(1, Math.min(40, Number(req.query.n) || 22));
  const seed = Number(req.query.seed) || Math.floor(Math.random() * 1_000_000) || 1;
  const { state, moves } = scramble(n, seed);
  return res.json({ ok: true, state: stateToString(state), scramble: moves, seed });
});

export default router;
