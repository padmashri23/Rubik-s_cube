import { describe, it, expect } from 'vitest';
import { solve } from '../solver';
import { applyMoves, SOLVED_STATE, isSolved, scramble, validateState } from '../cube';

describe('layer-by-layer solver', () => {
  it('returns no moves for an already-solved cube', () => {
    const sol = solve(SOLVED_STATE.slice());
    expect(sol.moves).toEqual([]);
  });

  it('solves a single-move scramble', () => {
    const s = applyMoves(SOLVED_STATE, ['R']);
    const sol = solve(s);
    expect(isSolved(applyMoves(s, sol.moves))).toBe(true);
  });

  it('solves 60 random scrambles end-to-end', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { state } = scramble(30, seed);
      expect(validateState(state).valid, `scramble seed ${seed} valid`).toBe(true);
      const sol = solve(state);
      const final = applyMoves(state, sol.moves);
      expect(isSolved(final), `seed ${seed} solved`).toBe(true);
    }
  });

  it('produces grouped phases with moves', () => {
    const { state } = scramble(25, 7);
    const sol = solve(state);
    expect(sol.phases.length).toBeGreaterThan(0);
    expect(sol.phases.every((p) => p.moves.length > 0)).toBe(true);
  });
});
