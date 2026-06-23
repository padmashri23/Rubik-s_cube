/**
 * Cube state model + validation.
 *
 * State is a 54-length array of face letters (U R F D L B). Index layout
 * matches `moves.ts`. The center of each face (index 4 of each block) never
 * moves, so it identifies the face's color.
 */

import {
  ALL_MOVES,
  applyMoves,
  FACE_ORDER,
  FACELETS,
  parseMoves,
  type Face,
  type MoveName,
  type Vec3,
} from './moves';

export const SOLVED_STATE: string[] = FACE_ORDER.flatMap((f) =>
  Array(9).fill(f),
);

export const FACE_OFFSET: Record<Face, number> = {
  U: 0,
  R: 9,
  F: 18,
  D: 27,
  L: 36,
  B: 45,
};

export function cloneState(state: string[]): string[] {
  return state.slice();
}

export function isSolved(state: string[]): boolean {
  for (let f = 0; f < 6; f++) {
    const base = f * 9;
    const c = state[base + 4];
    for (let i = 0; i < 9; i++) if (state[base + i] !== c) return false;
  }
  return true;
}

export function stateToString(state: string[]): string {
  return state.join('');
}

export function stringToState(s: string): string[] {
  const arr = s.replace(/\s+/g, '').split('');
  if (arr.length !== 54) throw new Error('State string must be 54 chars');
  return arr;
}

/** A deterministic pseudo-random scramble of `n` moves (seedable for tests). */
export function scramble(n = 25, seed = 1): { state: string[]; moves: MoveName[] } {
  let s = seed >>> 0;
  const rand = () => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
  const moves: MoveName[] = [];
  let lastFace = '';
  while (moves.length < n) {
    const m = ALL_MOVES[Math.floor(rand() * ALL_MOVES.length)];
    if (m[0] === lastFace) continue; // avoid trivial repeats
    lastFace = m[0];
    moves.push(m);
  }
  return { state: applyMoves(SOLVED_STATE, moves), moves };
}

export interface Validation {
  valid: boolean;
  errors: string[];
  /** Global facelet indices the user should re-check (highlighted in the UI). */
  badStickers: number[];
}

// Opposite faces (by canonical center color) — these can never share a piece.
const OPPOSITE: Record<Face, Face> = {
  U: 'D',
  D: 'U',
  R: 'L',
  L: 'R',
  F: 'B',
  B: 'F',
};

const FACE_POS_NAME: Record<Face, string> = {
  U: 'Up',
  D: 'Down',
  R: 'Right',
  L: 'Left',
  F: 'Front',
  B: 'Back',
};

const COLOR_NAME: Record<string, string> = {
  U: 'White',
  R: 'Red',
  F: 'Green',
  D: 'Yellow',
  L: 'Orange',
  B: 'Blue',
};

/** Which face a global facelet index belongs to. */
function faceOfIndex(i: number): Face {
  return FACE_ORDER[Math.floor(i / 9)];
}

/** A human location for a piece, e.g. "Up-Right-Front". */
function pieceLocation(idxs: number[]): string {
  return idxs.map((i) => FACE_POS_NAME[faceOfIndex(i)]).join('-');
}

function colorList(colors: string[]): string {
  return colors.map((c) => COLOR_NAME[c] ?? c).join(', ');
}

/** Explain why a set of piece colors is physically impossible. */
function pieceProblem(colors: string[]): string {
  if (new Set(colors).size !== colors.length) {
    return 'it repeats a color';
  }
  for (const c of colors) {
    if (colors.includes(OPPOSITE[c as Face])) {
      return `${COLOR_NAME[c]} and ${COLOR_NAME[OPPOSITE[c as Face]]} are opposite colors and can't touch`;
    }
  }
  return 'those colors never appear together on one piece';
}

/**
 * Validate that a scanned/entered state is a physically solvable cube.
 * Checks: 9 of each color, correct centers, permutation parity, corner &
 * edge orientation parity. This catches the vast majority of bad scans.
 */
export function validateState(state: string[]): Validation {
  const errors: string[] = [];
  const badStickers: number[] = [];

  if (state.length !== 54) {
    return { valid: false, errors: ['State must have 54 facelets'], badStickers };
  }

  // 1. Exactly nine of each color.
  const counts: Record<string, number> = {};
  for (const c of state) counts[c] = (counts[c] ?? 0) + 1;
  for (const f of FACE_ORDER) {
    if (counts[f] !== 9) {
      errors.push(
        `${COLOR_NAME[f]} appears ${counts[f] ?? 0} times — a cube has exactly 9 of each color.`,
      );
    }
  }

  // 2. Centers must be the six distinct faces.
  const centers = FACE_ORDER.map((f) => state[FACE_OFFSET[f] + 4]);
  if (new Set(centers).size !== 6) {
    errors.push('The six center stickers must all be different colors.');
  }

  // If basic counts are wrong, deeper checks are meaningless.
  if (errors.length) return { valid: false, errors, badStickers };

  // 3. Piece-level parity checks.
  try {
    const parity = checkParity(state);
    errors.push(...parity.errors);
    badStickers.push(...parity.bad);
  } catch (e) {
    errors.push((e as Error).message);
  }

  return { valid: errors.length === 0, errors, badStickers };
}

// --- Piece definitions (facelet indices per cubie) -------------------------

// Corner/edge groupings are generated from the facelet geometry so they are
// always correct cubies, and corners are ordered with a consistent chirality
// (counter-clockwise around the outward diagonal) so the twist sum is a valid
// solvability invariant.
function buildPieceTables(): { corners: number[][]; edges: number[][] } {
  const cornerMap = new Map<string, number[]>();
  const edgeMap = new Map<string, number[]>();
  FACELETS.forEach((f, i) => {
    const nonZero = f.c.filter((v) => v !== 0).length;
    const key = f.c.join(',');
    const map = nonZero === 3 ? cornerMap : nonZero === 2 ? edgeMap : null;
    if (!map) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(i);
  });

  const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  const corners = [...cornerMap.values()].map((idxs) => {
    const a = FACELETS[idxs[0]].c; // outward diagonal
    const ref = FACELETS[idxs.find((i) => FACELETS[i].n[1] !== 0)!].n; // y facelet = angle 0
    const angle = (i: number) => {
      const n = FACELETS[i].n;
      return Math.atan2(dot(a, cross(ref, n)), dot(ref, n));
    };
    return [...idxs].sort((p, q) => angle(p) - angle(q));
  });
  const edges = [...edgeMap.values()];
  return { corners, edges };
}

const { corners: CORNER_FACELETS, edges: EDGE_FACELETS } = buildPieceTables();

// Reference colors of each corner/edge piece (from the solved cube).
const CORNER_COLORS = CORNER_FACELETS.map((t) => t.map((i) => SOLVED_STATE[i]));
const EDGE_COLORS = EDGE_FACELETS.map((t) => t.map((i) => SOLVED_STATE[i]));

function checkParity(state: string[]): { errors: string[]; bad: number[] } {
  const errors: string[] = [];
  const bad: number[] = [];

  // Identify each corner: which reference piece it is + its orientation.
  const cornerPerm: number[] = [];
  let cornerOriSum = 0;
  for (let i = 0; i < 8; i++) {
    const idxs = CORNER_FACELETS[i];
    const colors = idxs.map((idx) => state[idx]);
    const match = findPiece(colors, CORNER_COLORS);
    if (!match) {
      errors.push(
        `The ${pieceLocation(idxs)} corner can't exist: ${colorList(colors)} — ${pieceProblem(colors)}.`,
      );
      bad.push(...idxs);
      continue;
    }
    cornerPerm.push(match.index);
    cornerOriSum += match.orientation;
  }

  const edgePerm: number[] = [];
  for (let i = 0; i < 12; i++) {
    const idxs = EDGE_FACELETS[i];
    const colors = idxs.map((idx) => state[idx]);
    const match = findPiece(colors, EDGE_COLORS);
    if (!match) {
      errors.push(
        `The ${pieceLocation(idxs)} edge can't exist: ${colorList(colors)} — ${pieceProblem(colors)}.`,
      );
      bad.push(...idxs);
      continue;
    }
    edgePerm.push(match.index);
  }

  // If any piece was invalid, the deeper parity checks aren't meaningful yet.
  if (bad.length) return { errors, bad };

  if (cornerOriSum % 3 !== 0) {
    errors.push('A single corner is twisted in place — rotate one corner to fix it.');
  }

  // Permutation parity of corners and edges must match.
  if (permutationParity(cornerPerm) !== permutationParity(edgePerm)) {
    errors.push(
      'Two pieces look swapped — this often means one face was scanned rotated. Re-check the highlighted stickers.',
    );
  }

  return { errors, bad };
}

function findPiece(
  colors: string[],
  reference: string[][],
): { index: number; orientation: number } | null {
  const sorted = [...colors].sort().join('');
  for (let i = 0; i < reference.length; i++) {
    if ([...reference[i]].sort().join('') !== sorted) continue;
    // orientation = rotation needed to align colors[0] with reference[i][?]
    for (let o = 0; o < colors.length; o++) {
      let ok = true;
      for (let k = 0; k < colors.length; k++) {
        if (colors[(k + o) % colors.length] !== reference[i][k]) {
          ok = false;
          break;
        }
      }
      if (ok) return { index: i, orientation: o };
    }
  }
  return null;
}

function permutationParity(perm: number[]): number {
  const seen = new Array(perm.length).fill(false);
  let transpositions = 0;
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let j = i;
    let len = 0;
    while (!seen[j]) {
      seen[j] = true;
      j = perm[j];
      len++;
    }
    transpositions += len - 1;
  }
  return transpositions % 2;
}

export { applyMoves, parseMoves };
export type { MoveName, Face };
