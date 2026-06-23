/**
 * CubeNet — an unfolded 2D representation of the cube.
 *
 * Works as a read-only mini-map or an editable color grid (scanner manual mode).
 * Facelet indices match the core model exactly (U R F D L B, row-major).
 */

import { FACE_OFFSET } from '../core/cube';
import { hexFor, type ColorId } from '../core/colors';
import type { Face } from '../core/moves';
import './CubeNet.css';

interface CubeNetProps {
  state: string[];
  colorblind?: boolean;
  editable?: boolean;
  activeColor?: ColorId;
  onPaint?: (index: number) => void;
  size?: number; // px per sticker
  /** Global facelet indices to ring as problematic. */
  highlight?: number[];
}

// Position of each face inside a 4-col x 3-row net grid.
const LAYOUT: Record<Face, { col: number; row: number; label: string }> = {
  U: { col: 2, row: 1, label: 'Up' },
  L: { col: 1, row: 2, label: 'Left' },
  F: { col: 2, row: 2, label: 'Front' },
  R: { col: 3, row: 2, label: 'Right' },
  B: { col: 4, row: 2, label: 'Back' },
  D: { col: 2, row: 3, label: 'Down' },
};

const FACES: Face[] = ['U', 'L', 'F', 'R', 'B', 'D'];

export default function CubeNet({
  state,
  colorblind = false,
  editable = false,
  onPaint,
  size = 26,
  highlight,
}: CubeNetProps) {
  const flagged = highlight && highlight.length ? new Set(highlight) : null;
  return (
    <div className="cube-net" style={{ ['--sticker' as string]: `${size}px` }}>
      {FACES.map((face) => {
        const base = FACE_OFFSET[face];
        const { col, row, label } = LAYOUT[face];
        return (
          <div
            key={face}
            className="cube-net__face"
            style={{ gridColumn: col, gridRow: row }}
            aria-label={`${label} face`}
          >
            {Array.from({ length: 9 }, (_, i) => {
              const idx = base + i;
              const color = state[idx] as ColorId;
              const isCenter = i === 4;
              const cell = (
                <span
                  className="cube-net__cell"
                  style={{ background: hexFor(color, colorblind) }}
                  data-center={isCenter}
                  data-flagged={flagged?.has(idx) || undefined}
                />
              );
              if (editable && !isCenter) {
                return (
                  <button
                    key={idx}
                    className="cube-net__btn"
                    onClick={() => onPaint?.(idx)}
                    aria-label={`${label} sticker ${i + 1}`}
                  >
                    {cell}
                  </button>
                );
              }
              return (
                <span key={idx} className="cube-net__btn" aria-hidden>
                  {cell}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
