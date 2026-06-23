/**
 * Robust cube color detection.
 *
 * Why the naive "nearest fixed-RGB" approach fails: a camera's white balance,
 * exposure and ambient light shift every sticker's RGB a lot, so red/orange,
 * white/yellow and green/blue collapse together in raw RGB space.
 *
 * This module fixes that with three ideas:
 *   1. Classify in HSV — hue is largely brightness-invariant, and low
 *      saturation cleanly identifies white.
 *   2. Self-calibrate from the six CENTER stickers. The center of each face is
 *      that face's true color, captured under the user's actual lighting, so we
 *      classify every sticker relative to those live references.
 *   3. Balanced assignment — a real cube has exactly nine of each color, so once
 *      all 54 stickers are sampled we solve a constrained assignment that forces
 *      9-per-color, resolving the genuinely ambiguous ones.
 */

import { FACE_OFFSET } from '../core/cube';
import type { ColorId } from '../core/colors';
import type { Face } from '../core/moves';

export type RGB = [number, number, number];
export type HSV = [number, number, number]; // h:0-360, s:0-1, v:0-1

export const FACES: ColorId[] = ['U', 'R', 'F', 'D', 'L', 'B'];

// Fallback references (typical sticker HSV) used before a face's center has
// been captured. Once the real centers exist, those override these.
const DEFAULT_HSV: Record<ColorId, HSV> = {
  U: [0, 0.0, 0.95], // white
  R: [0, 0.82, 0.85], // red
  F: [135, 0.7, 0.65], // green
  D: [52, 0.85, 0.95], // yellow
  L: [26, 0.9, 0.95], // orange
  B: [214, 0.8, 0.78], // blue
};

export function rgbToHsv([r, g, b]: RGB): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

function hueDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Perceptual-ish distance between two HSV colors tuned for cube stickers.
 * Hue only matters when both colors are saturated (white/grey have no
 * meaningful hue), so it's weighted by the smaller of the two saturations.
 */
export function hsvDistance(a: HSV, b: HSV): number {
  const satFactor = Math.min(a[1], b[1]);
  const hueTerm = (hueDiff(a[0], b[0]) / 180) * satFactor;
  const satTerm = Math.abs(a[1] - b[1]);
  const valTerm = Math.abs(a[2] - b[2]);
  return hueTerm * 1.7 + satTerm * 0.9 + valTerm * 0.45;
}

interface Ref {
  id: ColorId;
  hsv: HSV;
}

/** Build the six color references, preferring captured centers over defaults. */
function buildRefs(centers: Partial<Record<ColorId, RGB>>): Ref[] {
  return FACES.map((id) => {
    const c = centers[id];
    return { id, hsv: c ? rgbToHsv(c) : DEFAULT_HSV[id] };
  });
}

/** Nearest-reference classification of a single color sample. */
export function classifyOne(rgb: RGB, centers: Partial<Record<ColorId, RGB>> = {}): ColorId {
  const refs = buildRefs(centers);
  const hsv = rgbToHsv(rgb);
  let best = refs[0];
  let bestD = Infinity;
  for (const r of refs) {
    const d = hsvDistance(hsv, r.hsv);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best.id;
}

/**
 * Classify a full set of 54 facelet samples.
 *
 * `samples[i]` is the captured RGB for global facelet index i, or null if that
 * sticker hasn't been scanned. Centers are read from the samples themselves
 * (FACE_OFFSET[face] + 4). When every sticker is present we run a balanced
 * 9-per-color assignment; otherwise we classify each present sticker by its
 * nearest reference.
 *
 * Returns a colorId per index for sampled stickers, and `null` for un-sampled.
 */
export function classifyFacelets(samples: (RGB | null)[]): (ColorId | null)[] {
  const centers: Partial<Record<ColorId, RGB>> = {};
  for (const f of FACES) {
    const c = samples[FACE_OFFSET[f as Face] + 4];
    if (c) centers[f] = c;
  }
  const refs = buildRefs(centers);

  const present = samples
    .map((s, i) => ({ s, i }))
    .filter((x): x is { s: RGB; i: number } => x.s !== null);

  const result: (ColorId | null)[] = samples.map(() => null);

  const allPresent = present.length === 54;
  if (!allPresent) {
    for (const { s, i } of present) {
      result[i] = classifyOne(s, centers);
    }
    return result;
  }

  // Balanced assignment: cheapest (sticker, color) pairs first, capped at 9.
  const hsvs = present.map((p) => rgbToHsv(p.s));
  const entries: { i: number; k: number; cost: number }[] = [];
  present.forEach((_, pi) => {
    refs.forEach((r, k) => {
      entries.push({ i: present[pi].i, k, cost: hsvDistance(hsvs[pi], r.hsv) });
    });
  });
  entries.sort((a, b) => a.cost - b.cost);

  const counts = new Array(6).fill(0);
  const assigned = new Set<number>();
  for (const e of entries) {
    if (assigned.has(e.i) || counts[e.k] >= 9) continue;
    result[e.i] = refs[e.k].id;
    counts[e.k] += 1;
    assigned.add(e.i);
    if (assigned.size === 54) break;
  }
  return result;
}

/**
 * Sample the nine cells of the camera's 3x3 grid from a drawn canvas context.
 * Uses the MEDIAN of a patch at each cell center (robust to glare/noise) and
 * returns RGB per cell in row-major order.
 */
export function sampleGrid(
  ctx: CanvasRenderingContext2D,
  vw: number,
  vh: number,
): RGB[] {
  const side = Math.min(vw, vh) * 0.8;
  const left = (vw - side) / 2;
  const top = (vh - side) / 2;
  const cell = side / 3;
  const patch = Math.max(6, Math.floor(cell / 2.5));

  const out: RGB[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = left + cell * (col + 0.5);
      const cy = top + cell * (row + 0.5);
      const px = Math.max(0, Math.floor(cx - patch / 2));
      const py = Math.max(0, Math.floor(cy - patch / 2));
      const pw = Math.min(patch, vw - px);
      const ph = Math.min(patch, vh - py);
      const data = ctx.getImageData(px, py, pw, ph).data;
      const rs: number[] = [];
      const gs: number[] = [];
      const bs: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        rs.push(data[i]);
        gs.push(data[i + 1]);
        bs.push(data[i + 2]);
      }
      out.push([median(rs), median(gs), median(bs)]);
    }
  }
  return out;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
