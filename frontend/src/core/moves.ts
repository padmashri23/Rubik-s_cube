/**
 * Move engine for a 3x3 cube, built from a geometric model so that every
 * permutation is correct *by construction* (no hand-transcribed tables).
 *
 * Facelet model (Kociemba layout). Faces are ordered U R F D L B, each face
 * has 9 stickers indexed row-major:
 *
 *                U0 U1 U2
 *                U3 U4 U5
 *                U6 U7 U8
 *   L0 L1 L2     F0 F1 F2     R0 R1 R2     B0 B1 B2
 *   L3 L4 L5     F3 F4 F5     R3 R4 R5     B3 B4 B5
 *   L6 L7 L8     F6 F7 F8     R6 R7 R8     B6 B7 B8
 *                D0 D1 D2
 *                D3 D4 D5
 *                D6 D7 D8
 *
 * Global indices: U=0..8, R=9..17, F=18..26, D=27..35, L=36..44, B=45..53.
 *
 * Coordinate frame: x = right (+R), y = up (+U), z = front (+F).
 * Each facelet is described by its cubie coordinate c ∈ {-1,0,1}^3 and the
 * outward normal n of the face it lives on.
 */

export type Vec3 = [number, number, number];

export interface Facelet {
  c: Vec3; // cubie coordinate
  n: Vec3; // outward face normal
}

export const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type Face = (typeof FACE_ORDER)[number];

// Geometric description of all 54 facelets, in global-index order.
// prettier-ignore
export const FACELETS: Facelet[] = [
  // U (n = +y, y = 1)
  { c: [-1, 1, -1], n: [0, 1, 0] }, { c: [0, 1, -1], n: [0, 1, 0] }, { c: [1, 1, -1], n: [0, 1, 0] },
  { c: [-1, 1, 0],  n: [0, 1, 0] }, { c: [0, 1, 0],  n: [0, 1, 0] }, { c: [1, 1, 0],  n: [0, 1, 0] },
  { c: [-1, 1, 1],  n: [0, 1, 0] }, { c: [0, 1, 1],  n: [0, 1, 0] }, { c: [1, 1, 1],  n: [0, 1, 0] },
  // R (n = +x, x = 1)
  { c: [1, 1, -1], n: [1, 0, 0] }, { c: [1, 1, 0], n: [1, 0, 0] }, { c: [1, 1, 1], n: [1, 0, 0] },
  { c: [1, 0, -1], n: [1, 0, 0] }, { c: [1, 0, 0], n: [1, 0, 0] }, { c: [1, 0, 1], n: [1, 0, 0] },
  { c: [1, -1, -1],n: [1, 0, 0] }, { c: [1, -1, 0],n: [1, 0, 0] }, { c: [1, -1, 1],n: [1, 0, 0] },
  // F (n = +z, z = 1)
  { c: [-1, 1, 1], n: [0, 0, 1] }, { c: [0, 1, 1], n: [0, 0, 1] }, { c: [1, 1, 1], n: [0, 0, 1] },
  { c: [-1, 0, 1], n: [0, 0, 1] }, { c: [0, 0, 1], n: [0, 0, 1] }, { c: [1, 0, 1], n: [0, 0, 1] },
  { c: [-1, -1, 1],n: [0, 0, 1] }, { c: [0, -1, 1],n: [0, 0, 1] }, { c: [1, -1, 1],n: [0, 0, 1] },
  // D (n = -y, y = -1)
  { c: [-1, -1, 1], n: [0, -1, 0] }, { c: [0, -1, 1], n: [0, -1, 0] }, { c: [1, -1, 1], n: [0, -1, 0] },
  { c: [-1, -1, 0], n: [0, -1, 0] }, { c: [0, -1, 0], n: [0, -1, 0] }, { c: [1, -1, 0], n: [0, -1, 0] },
  { c: [-1, -1, -1],n: [0, -1, 0] }, { c: [0, -1, -1],n: [0, -1, 0] }, { c: [1, -1, -1],n: [0, -1, 0] },
  // L (n = -x, x = -1)
  { c: [-1, 1, 1], n: [-1, 0, 0] }, { c: [-1, 1, 0], n: [-1, 0, 0] }, { c: [-1, 1, -1], n: [-1, 0, 0] },
  { c: [-1, 0, 1], n: [-1, 0, 0] }, { c: [-1, 0, 0], n: [-1, 0, 0] }, { c: [-1, 0, -1], n: [-1, 0, 0] },
  { c: [-1, -1, 1],n: [-1, 0, 0] }, { c: [-1, -1, 0],n: [-1, 0, 0] }, { c: [-1, -1, -1],n: [-1, 0, 0] },
  // B (n = -z, z = -1)
  { c: [1, 1, -1], n: [0, 0, -1] }, { c: [0, 1, -1], n: [0, 0, -1] }, { c: [-1, 1, -1], n: [0, 0, -1] },
  { c: [1, 0, -1], n: [0, 0, -1] }, { c: [0, 0, -1], n: [0, 0, -1] }, { c: [-1, 0, -1], n: [0, 0, -1] },
  { c: [1, -1, -1],n: [0, 0, -1] }, { c: [0, -1, -1],n: [0, 0, -1] }, { c: [-1, -1, -1],n: [0, 0, -1] },
];

// Clockwise (as seen from outside the face) rotation for each base move =
// a -90° right-hand rotation about the face's OUTWARD normal. All six must use
// the same convention or asymmetric algorithms (e.g. Sune) silently break the
// lower layers even though X^4 / X X' / sexy^6 still pass.
const ROTATIONS: Record<Face, (v: Vec3) => Vec3> = {
  U: ([x, y, z]) => [-z, y, x], // -90 about +y
  D: ([x, y, z]) => [z, y, -x], // -90 about -y
  R: ([x, y, z]) => [x, z, -y], // -90 about +x
  L: ([x, y, z]) => [x, -z, y], // -90 about -x
  F: ([x, y, z]) => [y, -x, z], // -90 about +z
  B: ([x, y, z]) => [-y, x, z], // -90 about -z
};

// Which axis/value selects the moving layer for each face.
const LAYER: Record<Face, (c: Vec3) => boolean> = {
  U: (c) => c[1] === 1,
  D: (c) => c[1] === -1,
  R: (c) => c[0] === 1,
  L: (c) => c[0] === -1,
  F: (c) => c[2] === 1,
  B: (c) => c[2] === -1,
};

const eq = (a: Vec3, b: Vec3) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

function indexOfSlot(c: Vec3, n: Vec3): number {
  for (let i = 0; i < FACELETS.length; i++) {
    if (eq(FACELETS[i].c, c) && eq(FACELETS[i].n, n)) return i;
  }
  throw new Error(`No facelet slot for c=${c} n=${n}`);
}

/**
 * Build the permutation for a clockwise quarter-turn of `face`.
 * Returns `perm` where `next[i] = prev[perm[i]]`.
 */
function buildPermutation(face: Face): number[] {
  const rot = ROTATIONS[face];
  const inLayer = LAYER[face];
  const perm = Array.from({ length: 54 }, (_, i) => i);
  for (let src = 0; src < 54; src++) {
    const { c, n } = FACELETS[src];
    if (!inLayer(c)) continue;
    const dest = indexOfSlot(rot(c), rot(n));
    perm[dest] = src;
  }
  return perm;
}

const BASE_PERMS: Record<Face, number[]> = {
  U: buildPermutation('U'),
  R: buildPermutation('R'),
  F: buildPermutation('F'),
  D: buildPermutation('D'),
  L: buildPermutation('L'),
  B: buildPermutation('B'),
};

export type MoveName =
  | 'U' | "U'" | 'U2'
  | 'D' | "D'" | 'D2'
  | 'R' | "R'" | 'R2'
  | 'L' | "L'" | 'L2'
  | 'F' | "F'" | 'F2'
  | 'B' | "B'" | 'B2';

export const ALL_MOVES: MoveName[] = [
  'U', "U'", 'U2', 'D', "D'", 'D2',
  'R', "R'", 'R2', 'L', "L'", 'L2',
  'F', "F'", 'F2', 'B', "B'", 'B2',
];

function compose(a: number[], b: number[]): number[] {
  // apply a then b: result[i] = a[b[i]]
  return b.map((bi) => a[bi]);
}

// Precompute the full permutation for every notated move (incl. ' and 2).
const MOVE_PERMS: Record<MoveName, number[]> = (() => {
  const out = {} as Record<MoveName, number[]>;
  for (const face of FACE_ORDER) {
    const cw = BASE_PERMS[face];
    const cw2 = compose(cw, cw);
    const ccw = compose(cw2, cw); // cw^3 = inverse
    out[face as MoveName] = cw;
    out[`${face}2` as MoveName] = cw2;
    out[`${face}'` as MoveName] = ccw;
  }
  return out;
})();

/** Apply a single move to a facelet array, returning a new array. */
export function applyMove(state: string[], move: MoveName): string[] {
  const perm = MOVE_PERMS[move];
  return perm.map((src) => state[src]);
}

/** Apply a sequence of moves (array or space-separated string). */
export function applyMoves(state: string[], moves: MoveName[] | string): string[] {
  const list = typeof moves === 'string' ? parseMoves(moves) : moves;
  let s = state;
  for (const m of list) s = applyMove(s, m);
  return s;
}

/** Parse a space-separated algorithm string into moves. */
export function parseMoves(alg: string): MoveName[] {
  return alg
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => {
      if (!ALL_MOVES.includes(tok as MoveName)) {
        throw new Error(`Invalid move "${tok}"`);
      }
      return tok as MoveName;
    });
}

/** Invert a move. */
export function invertMove(move: MoveName): MoveName {
  if (move.endsWith('2')) return move;
  if (move.endsWith("'")) return move[0] as MoveName;
  return `${move}'` as MoveName;
}

/** Invert a whole sequence. */
export function invertSequence(moves: MoveName[]): MoveName[] {
  return [...moves].reverse().map(invertMove);
}

/**
 * Collapse redundant consecutive moves on the same face
 * (e.g. R R -> R2, R R' -> nothing, R2 R2 -> nothing).
 */
export function simplify(moves: MoveName[]): MoveName[] {
  const turns: Record<string, number> = {};
  const out: MoveName[] = [];
  const stack: { face: Face; amount: number }[] = [];

  const amount = (m: MoveName) => (m.endsWith('2') ? 2 : m.endsWith("'") ? 3 : 1);
  void turns;

  for (const m of moves) {
    const face = m[0] as Face;
    const top = stack[stack.length - 1];
    if (top && top.face === face) {
      top.amount = (top.amount + amount(m)) % 4;
      if (top.amount === 0) stack.pop();
    } else {
      stack.push({ face, amount: amount(m) });
    }
  }
  for (const { face, amount: a } of stack) {
    if (a === 1) out.push(face as MoveName);
    else if (a === 2) out.push(`${face}2` as MoveName);
    else if (a === 3) out.push(`${face}'` as MoveName);
  }
  return out;
}
