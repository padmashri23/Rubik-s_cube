/**
 * Beginner Layer-By-Layer solver.
 *
 * Design goal: *provable* correctness over hand-memorised algorithms.
 *
 *  - First two layers are solved piece-by-piece with an "over-generate &
 *    verify" engine: we take a small set of curated trigger algorithms,
 *    expand them by cube symmetry (y relabels) and U-setups, simulate every
 *    candidate, and only commit one that demonstrably places the target piece
 *    while preserving everything already solved.
 *  - The last layer is solved by a breadth-first search over last-layer
 *    *macros* (Sune, EOLL, T-perm, U-perm, U turns). These macros all preserve
 *    the first two layers, so the search stays inside the ~62k valid
 *    last-layer states and always finds a solution.
 *
 * The result is a correct (if not minimal) solution that is grouped into
 * human phases for the coaching UI.
 *
 * Convention: first layer is built on D (bottom), last layer on U (top).
 * Centers never move, so they are the canonical letters U R F D L B.
 */

import {
  ALL_MOVES,
  applyMove,
  applyMoves,
  parseMoves,
  simplify,
  type Face,
  type MoveName,
} from './moves';
import { isSolved } from './cube';

// --- algorithm phases for the UI -------------------------------------------

export type PhaseId =
  | 'cross'
  | 'firstLayerCorners'
  | 'middleLayer'
  | 'lastLayerEdgesOrient'
  | 'lastLayerCornersOrient'
  | 'lastLayerPermute';

export interface SolutionPhase {
  id: PhaseId;
  title: string;
  goal: string;
  moves: MoveName[];
}

export interface Solution {
  moves: MoveName[];
  phases: SolutionPhase[];
}

// --- helpers ---------------------------------------------------------------

const FACE_CYCLE: Record<Face, Face> = {
  F: 'R',
  R: 'B',
  B: 'L',
  L: 'F',
  U: 'U',
  D: 'D',
};

function relabelMove(m: MoveName, map: Record<Face, Face>): MoveName {
  const face = map[m[0] as Face];
  return (face + m.slice(1)) as MoveName;
}

/** Relabel an algorithm by k clockwise y rotations (F->R->B->L). */
function relabelY(alg: MoveName[], k: number): MoveName[] {
  let map: Record<Face, Face> = { U: 'U', R: 'R', F: 'F', D: 'D', L: 'L', B: 'B' };
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) {
    const next: Record<Face, Face> = { ...map };
    for (const f of Object.keys(map) as Face[]) next[f] = FACE_CYCLE[map[f]];
    map = next;
  }
  return alg.map((m) => relabelMove(m, map));
}

const U_SETUPS: MoveName[][] = [[], ['U'], ['U2'], ["U'"]];

type State = string[];
type Predicate = (s: State) => boolean;

/** Solved-checks against canonical centers. */
const crossEdgeOk = {
  DF: (s: State) => s[28] === 'D' && s[25] === 'F',
  DR: (s: State) => s[32] === 'D' && s[16] === 'R',
  DB: (s: State) => s[34] === 'D' && s[52] === 'B',
  DL: (s: State) => s[30] === 'D' && s[43] === 'L',
};
const crossDone: Predicate = (s) =>
  crossEdgeOk.DF(s) && crossEdgeOk.DR(s) && crossEdgeOk.DB(s) && crossEdgeOk.DL(s);

const cornerOk = {
  DFR: (s: State) => s[29] === 'D' && s[26] === 'F' && s[17] === 'R',
  DLF: (s: State) => s[27] === 'D' && s[42] === 'L' && s[24] === 'F',
  DBL: (s: State) => s[33] === 'D' && s[53] === 'B' && s[44] === 'L',
  DRB: (s: State) => s[35] === 'D' && s[15] === 'R' && s[51] === 'B',
};
const middleOk = {
  FR: (s: State) => s[23] === 'F' && s[14] === 'R',
  FL: (s: State) => s[21] === 'F' && s[39] === 'L',
  BL: (s: State) => s[50] === 'B' && s[41] === 'L',
  BR: (s: State) => s[48] === 'B' && s[12] === 'R',
};

function countTrue(s: State, checks: ((s: State) => boolean)[]): number {
  return checks.reduce((n, c) => n + (c(s) ? 1 : 0), 0);
}

// Facelet indices of each corner (used to locate which slot holds a piece).
const CORNER_FACELETS: Record<string, number[]> = {
  URF: [8, 11, 20], UFL: [6, 18, 36], ULB: [0, 38, 47], UBR: [2, 45, 9],
  DFR: [29, 26, 17], DLF: [27, 42, 24], DBL: [33, 53, 44], DRB: [35, 15, 51],
};

/** Find which slot currently holds the piece whose colors == target set. */
function findCornerSlot(s: State, colors: string[]): string {
  const key = [...colors].sort().join('');
  for (const [slot, idx] of Object.entries(CORNER_FACELETS)) {
    if (idx.map((i) => s[i]).sort().join('') === key) return slot;
  }
  throw new Error('corner not found');
}

// --- over-generate & verify engine -----------------------------------------

interface Recorder {
  state: State;
  moves: MoveName[];
}

function doAlg(rec: Recorder, alg: MoveName[]) {
  rec.state = applyMoves(rec.state, alg);
  rec.moves.push(...alg);
}

/**
 * Repeatedly try candidate algorithms until `solved` holds. A candidate is
 * accepted only if it makes `solved` true and `preserve` true. If none seats
 * the piece, an extraction candidate (one that satisfies `setupReady` and
 * preserves) is applied to reposition the piece, then we loop.
 */
function solveWithCandidates(
  rec: Recorder,
  solved: Predicate,
  preserve: Predicate,
  seatBases: MoveName[][],
  extractBases: MoveName[][],
  setupReady: Predicate,
  cap = 30,
): void {
  for (let iter = 0; iter < cap; iter++) {
    if (solved(rec.state)) return;

    // 1. Try to seat the piece.
    let chosen: MoveName[] | null = null;
    for (const setup of U_SETUPS) {
      for (let k = 0; k < 4; k++) {
        for (const base of seatBases) {
          const alg = [...setup, ...relabelY(base, k)];
          const ns = applyMoves(rec.state, alg);
          if (solved(ns) && preserve(ns)) {
            chosen = alg;
            break;
          }
        }
        if (chosen) break;
      }
      if (chosen) break;
    }
    if (chosen) {
      doAlg(rec, chosen);
      continue;
    }

    // 2. Extract / reposition so the piece becomes seatable.
    let setup: MoveName[] | null = null;
    for (const su of U_SETUPS) {
      for (let k = 0; k < 4; k++) {
        for (const base of extractBases) {
          const alg = [...su, ...relabelY(base, k)];
          const ns = applyMoves(rec.state, alg);
          if (setupReady(ns) && preserve(ns)) {
            setup = alg;
            break;
          }
        }
        if (setup) break;
      }
      if (setup) break;
    }
    if (!setup) throw new Error('solver stuck (no candidate)');
    doAlg(rec, setup);
  }
  if (!solved(rec.state)) throw new Error('solver did not converge');
}

// --- Phase 1: cross --------------------------------------------------------

// The 8 facelets that make up the four bottom cross edges.
const CROSS_IDX = [28, 25, 32, 16, 34, 52, 30, 43];
const crossKey = (s: State) => CROSS_IDX.map((i) => s[i]).join('');

/**
 * Solve the bottom cross with a breadth-first search. Nothing is solved yet,
 * so the search is unconstrained; de-duplicating on the projected cross-state
 * keeps it bounded (~190k states) and fast, and yields a near-optimal cross.
 */
function solveCross(rec: Recorder): MoveName[] {
  const start = rec.moves.length;
  if (crossDone(rec.state)) return [];

  type Node = { state: State; path: MoveName[]; last: string };
  const visited = new Set<string>([crossKey(rec.state)]);
  let frontier: Node[] = [{ state: rec.state, path: [], last: '' }];

  for (let depth = 0; depth < 9; depth++) {
    const next: Node[] = [];
    for (const node of frontier) {
      for (const m of ALL_MOVES) {
        if (m[0] === node.last) continue; // no consecutive same-face turns
        const ns = applyMove(node.state, m);
        const key = crossKey(ns);
        if (visited.has(key)) continue;
        visited.add(key);
        const path = [...node.path, m];
        if (crossDone(ns)) {
          rec.state = ns;
          rec.moves.push(...path);
          return rec.moves.slice(start);
        }
        next.push({ state: ns, path, last: m[0] });
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  throw new Error('cross search failed');
}

// --- Phase 2: first-layer corners ------------------------------------------

const CORNER_SEAT = [
  "R U R'", "R U' R'", "R U2 R'",
  "F' U' F", "F' U F", "F' U2 F",
  "R U R' U' R U R'", "R U' R' U R U' R'",
  "R U2 R' U' R U R'", "R U2 R' U2 R U' R'",
  "F' U F U F' U' F", "R U' R' U' F' U' F",
].map(parseMoves);

const CORNER_EXTRACT = ["R U R'", "R U' R'", "R' U' R", "R' U R"].map(parseMoves);

function solveCorners(rec: Recorder): MoveName[] {
  const start = rec.moves.length;
  const corners: { ok: Predicate; colors: string[] }[] = [
    { ok: cornerOk.DFR, colors: ['D', 'F', 'R'] },
    { ok: cornerOk.DRB, colors: ['D', 'R', 'B'] },
    { ok: cornerOk.DBL, colors: ['D', 'B', 'L'] },
    { ok: cornerOk.DLF, colors: ['D', 'L', 'F'] },
  ];
  const count = (s: State) => countTrue(s, corners.map((c) => c.ok));

  for (const { ok, colors } of corners) {
    if (ok(rec.state)) continue;
    const prior = count(rec.state);
    const solved: Predicate = (s) => ok(s) && crossDone(s) && count(s) >= prior + 1;
    const preserve: Predicate = (s) => crossDone(s) && count(s) >= prior;
    const setupReady: Predicate = (s) =>
      findCornerSlot(s, colors).startsWith('U') && crossDone(s) && count(s) >= prior;
    solveWithCandidates(rec, solved, preserve, CORNER_SEAT, CORNER_EXTRACT, setupReady, 40);
  }
  return rec.moves.slice(start);
}

// --- Phase 3: middle layer -------------------------------------------------

// Clean middle-edge inserts (defined for the front face; relabelled by y to
// reach the other three slots). RIGHT_INSERT sends a top-front edge into the
// front-right slot; LEFT_INSERT into the front-left slot.
const RIGHT_INSERT = parseMoves("U R U' R' U' F' U F");
const LEFT_INSERT = parseMoves("U' L' U L U F U' F'");

// For a belt edge sitting above face f: its U-facelet and side-facelet indices.
const TOP_BELT: Record<string, { top: number; side: number }> = {
  F: { top: 7, side: 19 },
  R: { top: 5, side: 10 },
  B: { top: 1, side: 46 },
  L: { top: 3, side: 37 },
};
const KF: Record<string, number> = { F: 0, R: 1, B: 2, L: 3 };
const RIGHT_OF: Record<string, string> = { F: 'R', R: 'B', B: 'L', L: 'F' };
const LEFT_OF: Record<string, string> = { F: 'L', R: 'F', B: 'R', L: 'B' };
const BELT = ['F', 'R', 'B', 'L'] as const;
const us = (n: number): MoveName[] => Array.from({ length: n }, () => 'U' as MoveName);

/**
 * Deterministic middle layer: align a top-belt edge above its matching center,
 * then insert it right or left depending on its top colour. If no belt edge is
 * in the top, kick a wrongly-seated one out of its slot and retry.
 */
function solveMiddle(rec: Recorder): MoveName[] {
  const start = rec.moves.length;
  const slotOk: Record<string, Predicate> = {
    F: middleOk.FR, R: middleOk.BR, B: middleOk.BL, L: middleOk.FL,
  };
  const allOk = (s: State) => BELT.every((f) => slotOk[f](s));

  for (let iter = 0; iter < 24 && !allOk(rec.state); iter++) {
    let acted = false;
    for (let u = 0; u < 4 && !acted; u++) {
      const test = u ? applyMoves(rec.state, us(u)) : rec.state;
      for (const f of BELT) {
        const { top, side } = TOP_BELT[f];
        const sc = test[side];
        const tc = test[top];
        if (sc === 'U' || sc === 'D' || tc === 'U' || tc === 'D') continue;
        if (sc !== f) continue; // not aligned above its matching centre
        let base: MoveName[] | null = null;
        if (tc === RIGHT_OF[f]) base = relabelY(RIGHT_INSERT, KF[f]);
        else if (tc === LEFT_OF[f]) base = relabelY(LEFT_INSERT, KF[f]);
        if (!base) continue;
        doAlg(rec, [...us(u), ...base]);
        acted = true;
        break;
      }
    }
    if (acted) continue;

    for (const f of BELT) {
      if (!slotOk[f](rec.state)) {
        doAlg(rec, relabelY(RIGHT_INSERT, KF[f]));
        acted = true;
        break;
      }
    }
    if (!acted) throw new Error('middle layer stuck');
  }
  return rec.moves.slice(start);
}

// --- Phase 4-6: last layer via BFS over macros -----------------------------

const LL_MACROS: { name: string; alg: MoveName[] }[] = [
  { name: 'U', alg: parseMoves('U') },
  { name: "U'", alg: parseMoves("U'") },
  { name: 'U2', alg: parseMoves('U2') },
  { name: 'Sune', alg: parseMoves("R U R' U R U2 R'") },
  { name: 'AntiSune', alg: parseMoves("R' U' R U' R' U2 R") },
  { name: 'EOLL', alg: parseMoves("F R U R' U' F'") },
  { name: 'Tperm', alg: parseMoves("R U R' U' R' F R2 U' R' U' R U R' F'") },
  { name: 'Uperm', alg: parseMoves("R U' R U R U R U' R' U' R2") },
];

/** BFS over last-layer macros to fully solve the cube. */
function solveLastLayer(rec: Recorder): MoveName[] {
  if (isSolved(rec.state)) return [];
  const startKey = rec.state.join('');
  const visited = new Set<string>([startKey]);
  type Node = { state: State; path: MoveName[] };
  let frontier: Node[] = [{ state: rec.state, path: [] }];

  for (let depth = 0; depth < 12; depth++) {
    const next: Node[] = [];
    for (const node of frontier) {
      for (const macro of LL_MACROS) {
        const ns = applyMoves(node.state, macro.alg);
        const key = ns.join('');
        if (visited.has(key)) continue;
        visited.add(key);
        const path = [...node.path, ...macro.alg];
        if (isSolved(ns)) {
          rec.state = ns;
          rec.moves.push(...path);
          return path;
        }
        next.push({ state: ns, path });
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  throw new Error('last-layer search failed');
}

// --- public API ------------------------------------------------------------

const PHASE_META: Record<PhaseId, { title: string; goal: string }> = {
  cross: {
    title: 'The Daisy & Cross',
    goal: 'Build a plus-sign on the bottom so the first edges line up with their centers.',
  },
  firstLayerCorners: {
    title: 'First Layer Corners',
    goal: 'Drop the bottom corners into place to finish the entire first layer.',
  },
  middleLayer: {
    title: 'Middle Layer',
    goal: 'Slot the four side edges so the top two layers are complete.',
  },
  lastLayerEdgesOrient: {
    title: 'Last Layer',
    goal: 'Orient and permute the final layer to finish the cube.',
  },
  lastLayerCornersOrient: { title: 'Last Layer', goal: '' },
  lastLayerPermute: { title: 'Last Layer', goal: '' },
};

export function solve(initial: State): Solution {
  const rec: Recorder = { state: initial.slice(), moves: [] };

  const phases: SolutionPhase[] = [];
  const push = (id: PhaseId, moves: MoveName[]) => {
    if (!moves.length) return;
    phases.push({ id, ...PHASE_META[id], moves });
  };

  push('cross', solveCross(rec));
  push('firstLayerCorners', solveCorners(rec));
  push('middleLayer', solveMiddle(rec));
  push('lastLayerEdgesOrient', solveLastLayer(rec));

  if (!isSolved(rec.state)) {
    throw new Error('Solver produced an incomplete solution');
  }

  const moves = simplify(rec.moves);
  return { moves, phases };
}

export { simplify };
