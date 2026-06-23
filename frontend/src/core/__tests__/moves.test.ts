import { describe, it, expect } from 'vitest';
import {
  ALL_MOVES,
  applyMove,
  applyMoves,
  invertSequence,
  parseMoves,
  simplify,
  type MoveName,
} from '../moves';
import { SOLVED_STATE, isSolved, stateToString } from '../cube';

describe('move engine', () => {
  it('a quarter turn changes the state', () => {
    expect(stateToString(applyMove(SOLVED_STATE, 'R'))).not.toEqual(
      stateToString(SOLVED_STATE),
    );
  });

  it('every move has order 4 (X X X X = identity)', () => {
    for (const m of ALL_MOVES) {
      if (m.endsWith('2')) continue;
      let s = SOLVED_STATE;
      for (let i = 0; i < 4; i++) s = applyMove(s, m);
      expect(isSolved(s), `${m} order`).toBe(true);
    }
  });

  it('X2 equals X X', () => {
    for (const f of ['U', 'R', 'F', 'D', 'L', 'B']) {
      const dbl = applyMove(SOLVED_STATE, `${f}2` as MoveName);
      const twice = applyMove(applyMove(SOLVED_STATE, f as MoveName), f as MoveName);
      expect(stateToString(dbl)).toEqual(stateToString(twice));
    }
  });

  it("X X' = identity", () => {
    for (const f of ['U', 'R', 'F', 'D', 'L', 'B']) {
      const s = applyMoves(SOLVED_STATE, [f, `${f}'`] as MoveName[]);
      expect(isSolved(s)).toBe(true);
    }
  });

  it('sexy move (R U R\' U\') repeated 6 times = identity', () => {
    const sexy = parseMoves("R U R' U'");
    let s = SOLVED_STATE;
    for (let i = 0; i < 6; i++) s = applyMoves(s, sexy);
    expect(isSolved(s)).toBe(true);
  });

  it('a sequence followed by its inverse = identity', () => {
    const alg = parseMoves("R U2 F' L D B' R' U");
    const s = applyMoves(applyMoves(SOLVED_STATE, alg), invertSequence(alg));
    expect(isSolved(s)).toBe(true);
  });

  it('superflip is reached and is not solved, but is valid', () => {
    const superflip = parseMoves(
      "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2",
    );
    const s = applyMoves(SOLVED_STATE, superflip);
    expect(isSolved(s)).toBe(false);
  });

  it('simplify collapses redundant moves', () => {
    expect(simplify(parseMoves('R R'))).toEqual(['R2']);
    expect(simplify(parseMoves("R R'"))).toEqual([]);
    expect(simplify(parseMoves('R2 R2'))).toEqual([]);
    expect(simplify(parseMoves("R U U' R'"))).toEqual([]);
  });
});
