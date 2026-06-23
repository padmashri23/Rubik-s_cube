/**
 * Translate cube notation into plain-language coaching instructions.
 *
 * A complete beginner never has to learn R / U / F'. Every move becomes a
 * sentence ("Turn the RIGHT side away from you, a quarter turn"), with a short
 * reason, an arrow direction for the UI, and a voice-friendly phrasing.
 */

import { FACE_COLOR_NAME } from './colors';
import type { Face, MoveName } from './moves';
import type { PhaseId } from './solver';

export type Turn = 'cw' | 'ccw' | 'double';
export type ArrowDir = 'up' | 'down' | 'left' | 'right' | 'rotate';

export interface PlainInstruction {
  move: MoveName;
  face: Face;
  faceName: string; // RIGHT, LEFT, TOP, BOTTOM, FRONT, BACK
  faceColor: string; // the centre colour of that face
  turn: Turn;
  /** Short on-screen instruction. */
  text: string;
  /** Longer, friendly voice line. */
  voice: string;
  /** Arrow hint for overlays / 3D. */
  arrow: ArrowDir;
  quarterTurns: number;
}

const FACE_NAME: Record<Face, string> = {
  U: 'TOP',
  D: 'BOTTOM',
  R: 'RIGHT',
  L: 'LEFT',
  F: 'FRONT',
  B: 'BACK',
};

// Plain description of a clockwise quarter turn of each face, written from the
// solver's perspective (looking at the face from outside).
const CW_PHRASE: Record<Face, { short: string; arrow: ArrowDir }> = {
  U: { short: 'to the left', arrow: 'left' },
  D: { short: 'to the right', arrow: 'right' },
  R: { short: 'away from you (upward)', arrow: 'up' },
  L: { short: 'toward you (upward)', arrow: 'up' },
  F: { short: 'clockwise', arrow: 'rotate' },
  B: { short: 'clockwise', arrow: 'rotate' },
};

const CCW_PHRASE: Record<Face, { short: string; arrow: ArrowDir }> = {
  U: { short: 'to the right', arrow: 'right' },
  D: { short: 'to the left', arrow: 'left' },
  R: { short: 'toward you (downward)', arrow: 'down' },
  L: { short: 'away from you (downward)', arrow: 'down' },
  F: { short: 'counter-clockwise', arrow: 'rotate' },
  B: { short: 'counter-clockwise', arrow: 'rotate' },
};

export function parseMoveName(move: MoveName): {
  face: Face;
  turn: Turn;
  quarterTurns: number;
} {
  const face = move[0] as Face;
  if (move.endsWith('2')) return { face, turn: 'double', quarterTurns: 2 };
  if (move.endsWith("'")) return { face, turn: 'ccw', quarterTurns: 1 };
  return { face, turn: 'cw', quarterTurns: 1 };
}

export function toPlain(move: MoveName): PlainInstruction {
  const { face, turn, quarterTurns } = parseMoveName(move);
  const faceName = FACE_NAME[face];
  const faceColor = FACE_COLOR_NAME[face];

  const phrase = turn === 'ccw' ? CCW_PHRASE[face] : CW_PHRASE[face];
  const amount =
    turn === 'double' ? 'a half turn (180°)' : 'a quarter turn (90°)';

  const dir =
    turn === 'double'
      ? CW_PHRASE[face].short.replace(/ \(.*\)/, '')
      : phrase.short;

  const text =
    turn === 'double'
      ? `Turn the ${faceName} side (${faceColor}) ${amount}.`
      : `Turn the ${faceName} side (${faceColor}) ${dir} — ${amount}.`;

  const voice =
    turn === 'double'
      ? `Find the ${faceColor.toLowerCase()} side, that's the ${faceName.toLowerCase()}. Turn it a half turn.`
      : `Find the ${faceColor.toLowerCase()} side, that's the ${faceName.toLowerCase()}. Turn it ${dir}.`;

  return {
    move,
    face,
    faceName,
    faceColor,
    turn,
    text,
    voice,
    arrow: turn === 'ccw' ? CCW_PHRASE[face].arrow : CW_PHRASE[face].arrow,
    quarterTurns,
  };
}

/** Per-phase "why are we doing this" copy for the coach. */
export const PHASE_REASON: Record<PhaseId, string> = {
  cross: 'We are making a plus sign on one side so the first edges match their centers. This is the foundation of the whole solve.',
  firstLayerCorners:
    'Now we lock the corners in, finishing one complete layer. Think of it as building a solid base.',
  middleLayer:
    'We slide the side pieces into the middle band so two whole layers are done.',
  lastLayerEdgesOrient:
    'The final layer! We orient and arrange the last pieces until every side is one solid color.',
  lastLayerCornersOrient: 'We twist the last corners so the top is one color.',
  lastLayerPermute: 'We shuffle the last pieces into their exact homes. Almost there!',
};

const ENCOURAGEMENTS = [
  "Great job! Let's continue.",
  'Excellent — keep that momentum.',
  'Perfect. On to the next one.',
  "You're doing brilliantly.",
  'Nice and steady. Next move.',
  'That looked clean. Continue.',
];

export function encouragement(stepIndex: number): string {
  return ENCOURAGEMENTS[stepIndex % ENCOURAGEMENTS.length];
}

/** Estimate solve time for a beginner: ~6 seconds per move + reading time. */
export function estimateSeconds(moveCount: number): number {
  return Math.round(moveCount * 6);
}

export function difficultyFor(moveCount: number): 'Easy' | 'Moderate' | 'Tricky' {
  if (moveCount <= 60) return 'Easy';
  if (moveCount <= 100) return 'Moderate';
  return 'Tricky';
}
