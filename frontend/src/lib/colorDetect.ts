/**
 * Cube color detection.
 *
 * Getting sticker colors right from a phone camera is mostly a fight against
 * three things: where you sample, what the light does to the pixels, and how
 * you break ties. This module handles each explicitly.
 *
 *  1. GEOMETRY — `mapCoverBoxToSource` converts the on-screen guide box into
 *     source-video pixels through the exact `object-fit: cover` transform, so
 *     we always sample the stickers the user is actually aiming at. Sampling a
 *     hardcoded fraction of the raw frame silently misses when the camera's
 *     aspect ratio differs from the preview's.
 *
 *  2. LIGHT — classification happens in rg-chromaticity, R/(R+G+B) and
 *     G/(R+G+B), which is unchanged when a sticker simply gets brighter or
 *     darker. That makes shadow, exposure and distance irrelevant for free. It
 *     also separates the genuinely hard pair — yellow against orange, only ~25
 *     degrees apart in hue — by their very different green-to-red ratio.
 *     What light *does* break is white balance, so we estimate per-channel
 *     gains from the six captured centers: their combined RGB has a known ratio
 *     (a full color wheel plus white), and the deviation from it is the cast to
 *     divide out.
 *
 *  3. TIES — a real cube has exactly nine of each color. Once all 54 stickers
 *     are sampled we solve the optimal 9-per-color assignment with the
 *     Hungarian algorithm rather than greedy nearest-reference, which is what
 *     rescues the remaining ambiguous stickers.
 *
 * Sampling itself trims the brightest and darkest pixels in each patch before
 * averaging, which discards specular glare and shadowed bevels.
 */

import { FACE_OFFSET } from '../core/cube';
import { FACE_HEX, hexToRgb, type ColorId } from '../core/colors';
import type { Face } from '../core/moves';

export type RGB = [number, number, number];

export const FACES: ColorId[] = ['U', 'R', 'F', 'D', 'L', 'B'];

/** Canonical sticker RGB, used for white balance and as a pre-capture fallback. */
const CANONICAL: Record<ColorId, RGB> = Object.fromEntries(
  FACES.map((f) => [f, hexToRgb(FACE_HEX[f])]),
) as Record<ColorId, RGB>;

// ---------------------------------------------------------------------------
// Color space
// ---------------------------------------------------------------------------

/** A color's position in rg-chromaticity: [R/(R+G+B), G/(R+G+B)]. */
export type Chroma = [number, number];

/**
 * Project a color onto the chromaticity plane, discarding intensity.
 *
 * Scaling every channel by the same factor — which is all that shadow, distance
 * and exposure do — leaves this untouched, so a sticker in shade lands on the
 * same point as one in full light.
 */
export function rgChromaticity([r, g, b]: RGB): Chroma {
  const sum = r + g + b;
  if (sum <= 0) return [1 / 3, 1 / 3]; // black: treat as neutral
  return [r / sum, g / sum];
}

/**
 * Straight Euclidean distance on the chromaticity plane.
 *
 * The six cube colors are pleasingly well spread here: the tightest pair
 * (yellow/orange) sits about 0.18 apart and the rest are further, so a single
 * unweighted distance beats the weighted hue/saturation/value formula this
 * replaced — measured across simulated tungsten, daylight, cool, dim and
 * high-noise captures — with no constants to tune.
 */
export function chromaDistance(a: Chroma, b: Chroma): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

// ---------------------------------------------------------------------------
// White balance
// ---------------------------------------------------------------------------

/**
 * Estimate per-channel gains that map the observed centers onto the canonical
 * palette's channel ratio. Returns gains normalized to a mean of 1, so overall
 * exposure is left untouched — only the color cast is corrected.
 *
 * Needs at least three centers to be meaningful; below that it is a no-op.
 */
export function whiteBalanceGains(centers: Partial<Record<ColorId, RGB>>): RGB {
  const captured = FACES.filter((f) => centers[f]);
  if (captured.length < 3) return [1, 1, 1];

  const observed: RGB = [0, 0, 0];
  const expected: RGB = [0, 0, 0];
  for (const f of captured) {
    const o = centers[f]!;
    const e = CANONICAL[f];
    for (let c = 0; c < 3; c++) {
      observed[c] += o[c];
      expected[c] += e[c];
    }
  }
  const obsMean = (observed[0] + observed[1] + observed[2]) / 3;
  const expMean = (expected[0] + expected[1] + expected[2]) / 3;
  if (obsMean <= 0 || expMean <= 0) return [1, 1, 1];

  const gains = [0, 1, 2].map((c) => {
    const o = observed[c] / obsMean;
    const e = expected[c] / expMean;
    // Clamp so a bad capture can't produce a wild correction.
    return Math.min(1.6, Math.max(0.625, o <= 0 ? 1 : e / o));
  }) as RGB;

  const gMean = (gains[0] + gains[1] + gains[2]) / 3;
  return [gains[0] / gMean, gains[1] / gMean, gains[2] / gMean];
}

/**
 * Deliberately unclamped: hue and saturation are ratios between channels, so
 * capping a corrected channel at 255 would bend the hue of exactly the bright
 * stickers a strong cast pushes over the top.
 */
function applyGains(rgb: RGB, gains: RGB): RGB {
  return [rgb[0] * gains[0], rgb[1] * gains[1], rgb[2] * gains[2]];
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

interface Ref {
  id: ColorId;
  chroma: Chroma;
}

/** The six color references, preferring white-balanced captured centers. */
function buildRefs(centers: Partial<Record<ColorId, RGB>>, gains: RGB): Ref[] {
  return FACES.map((id) => {
    const c = centers[id];
    return { id, chroma: rgChromaticity(c ? applyGains(c, gains) : CANONICAL[id]) };
  });
}

// ---------------------------------------------------------------------------
// Optimal assignment
// ---------------------------------------------------------------------------

/**
 * Hungarian algorithm (Kuhn–Munkres, O(n^3)) for a square cost matrix.
 * Returns `assignment[row] = col`. At n=48 this runs in well under a
 * millisecond, so there is no reason to settle for a greedy approximation.
 */
function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0); // p[col] = row (1-indexed, 0 = free)
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const assignment = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) if (p[j] > 0) assignment[p[j] - 1] = j - 1;
  return assignment;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Gap to the runner-up reference at which a reading counts as fully confident.
 * The closest color pair sits ~0.18 apart on the chromaticity plane, so a
 * sticker landing squarely on one of them clears this comfortably while
 * anything sitting between two gets surfaced for the user to check.
 */
const CONFIDENT_MARGIN = 0.09;

export interface ClassifyResult {
  /** Detected color per facelet index, or null where nothing was sampled. */
  colors: (ColorId | null)[];
  /**
   * 0–1 per facelet. Low means the sample sat between two references, or the
   * 9-per-color balancer had to override the nearest match — either way the
   * user should eyeball that sticker.
   */
  confidence: number[];
}

/**
 * Classify a full set of 54 facelet samples.
 *
 * `samples[i]` is the captured RGB for global facelet index i, or null if that
 * sticker has not been scanned. Centers are read from the samples themselves
 * (FACE_OFFSET[face] + 4) and are pinned to their own face color — a center is
 * physically fixed, so it is ground truth rather than something to infer.
 * When every sticker is present the remaining 48 are assigned optimally at
 * 8 per color; otherwise each is matched to its nearest reference.
 */
export function classifyDetailed(samples: (RGB | null)[]): ClassifyResult {
  const centers: Partial<Record<ColorId, RGB>> = {};
  for (const f of FACES) {
    const c = samples[FACE_OFFSET[f as Face] + 4];
    if (c) centers[f] = c;
  }
  const gains = whiteBalanceGains(centers);
  const refs = buildRefs(centers, gains);

  const colors: (ColorId | null)[] = samples.map(() => null);
  const confidence: number[] = samples.map(() => 0);

  const centerIndex = new Set(FACES.map((f) => FACE_OFFSET[f as Face] + 4));

  // Distance from every sampled sticker to every reference, computed once.
  const dists = new Map<number, number[]>();
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (!s) continue;
    const chroma = rgChromaticity(applyGains(s, gains));
    dists.set(
      i,
      refs.map((r) => chromaDistance(chroma, r.chroma)),
    );
  }

  /** Nearest reference index, plus the margin to the runner-up. */
  const nearest = (d: number[]) => {
    let bi = 0;
    let best = Infinity;
    let second = Infinity;
    for (let k = 0; k < d.length; k++) {
      if (d[k] < best) {
        second = best;
        best = d[k];
        bi = k;
      } else if (d[k] < second) {
        second = d[k];
      }
    }
    return { index: bi, margin: second - best };
  };

  // Centers are known — pin them and record full confidence.
  for (const f of FACES) {
    const idx = FACE_OFFSET[f as Face] + 4;
    if (samples[idx]) {
      colors[idx] = f;
      confidence[idx] = 1;
    }
  }

  const rest: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    if (samples[i] && !centerIndex.has(i)) rest.push(i);
  }

  const allPresent = rest.length === 48 && centerIndex.size === 6 &&
    FACES.every((f) => samples[FACE_OFFSET[f as Face] + 4] !== null);

  if (!allPresent) {
    for (const i of rest) {
      const d = dists.get(i)!;
      const { index, margin } = nearest(d);
      colors[i] = refs[index].id;
      confidence[i] = Math.min(1, margin / CONFIDENT_MARGIN);
    }
    return { colors, confidence };
  }

  // Every sticker is in: solve the exact 8-per-color assignment for the
  // non-centers (the centers already claimed one slot of each color).
  const slotColor: number[] = [];
  for (let k = 0; k < 6; k++) for (let n = 0; n < 8; n++) slotColor.push(k);

  const cost = rest.map((i) => {
    const d = dists.get(i)!;
    return slotColor.map((k) => d[k]);
  });

  const assignment = hungarian(cost);

  rest.forEach((faceletIndex, row) => {
    const k = slotColor[assignment[row]];
    const d = dists.get(faceletIndex)!;
    const { index: nearestK, margin } = nearest(d);
    colors[faceletIndex] = refs[k].id;
    // A sticker the balancer moved off its nearest reference is exactly the
    // kind the user should double-check, so cap its confidence hard.
    confidence[faceletIndex] =
      k === nearestK ? Math.min(1, margin / CONFIDENT_MARGIN) : Math.min(0.35, margin / CONFIDENT_MARGIN);
  });

  return { colors, confidence };
}

/** Convenience wrapper returning just the colors. */
export function classifyFacelets(samples: (RGB | null)[]): (ColorId | null)[] {
  return classifyDetailed(samples).colors;
}

// ---------------------------------------------------------------------------
// Frame geometry + sampling
// ---------------------------------------------------------------------------

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Map a box given in a video ELEMENT's CSS-pixel space into the underlying
 * SOURCE frame's pixel space, undoing `object-fit: cover`.
 *
 * This is what keeps the sampled 3x3 grid locked to the guide box the user
 * sees, whatever resolution the camera happens to hand us.
 */
export function mapCoverBoxToSource(
  displayW: number,
  displayH: number,
  sourceW: number,
  sourceH: number,
  box: Box,
): Box {
  if (!displayW || !displayH || !sourceW || !sourceH) {
    return { x: 0, y: 0, w: sourceW, h: sourceH };
  }
  const scale = Math.max(displayW / sourceW, displayH / sourceH);
  const offX = (displayW - sourceW * scale) / 2;
  const offY = (displayH - sourceH * scale) / 2;
  return {
    x: (box.x - offX) / scale,
    y: (box.y - offY) / scale,
    w: box.w / scale,
    h: box.h / scale,
  };
}

/** Keep a box inside the source frame; drawImage clips silently otherwise. */
function clampBox(box: Box, w: number, h: number): Box {
  const x = Math.max(0, Math.min(box.x, w - 1));
  const y = Math.max(0, Math.min(box.y, h - 1));
  return {
    x,
    y,
    w: Math.max(1, Math.min(box.w, w - x)),
    h: Math.max(1, Math.min(box.h, h - y)),
  };
}

/**
 * Draw only the guide region into `canvas`, optionally downscaled to `size`.
 *
 * Cropping in the drawImage call matters a lot: the canvas is CPU-backed
 * (willReadFrequently), so every pixel drawn is a pixel copied off the GPU.
 * Blitting a whole 1080p frame several times a second is enough to stall the
 * compositor and tear the video element on modest hardware.
 */
function drawBox(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  box: Box,
  size?: number,
): CanvasRenderingContext2D {
  const w = size ?? Math.max(1, Math.round(box.w));
  const h = size ?? Math.max(1, Math.round(box.h));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(video, box.x, box.y, box.w, box.h, 0, 0, w, h);
  return ctx;
}

/**
 * Cheap 3x3 read for the live on-screen readout.
 *
 * Downscales the guide region to a few thousand pixels in one GPU operation —
 * which also averages away sensor noise — then does a single small readback
 * instead of nine. Accuracy here only needs to be good enough to steer the
 * user's aim; `captureBurst` is what actually commits a face.
 */
export function samplePreview(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  box: Box,
  cellPx = 24,
): RGB[] {
  const src = clampBox(box, video.videoWidth, video.videoHeight);
  const size = cellPx * 3;
  const { data } = drawBox(video, canvas, src, size).getImageData(0, 0, size, size);

  const inset = cellPx >> 2;
  const span = Math.max(1, cellPx - inset * 2);
  const out: RGB[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = row * cellPx + inset; y < row * cellPx + inset + span; y++) {
        for (let x = col * cellPx + inset; x < col * cellPx + inset + span; x++) {
          const o = (y * size + x) * 4;
          r += data[o];
          g += data[o + 1];
          b += data[o + 2];
          n += 1;
        }
      }
      out.push([r / n, g / n, b / n]);
    }
  }
  return out;
}

/**
 * Classify freshly-read cells against the calibration learned from faces the
 * user has already captured.
 *
 * The cells being read deliberately do NOT contribute to the references. Feed
 * them in and the classification goes circular: whatever sits under the centre
 * becomes the definition of that face's color, so every cell resembling it
 * matches, and the readout reports one flat color no matter what it is looking
 * at. Uncaptured faces fall back to the canonical palette.
 */
export function classifyPreview(cells: RGB[], captured: (RGB | null)[]): ColorId[] {
  const centers: Partial<Record<ColorId, RGB>> = {};
  for (const f of FACES) {
    const c = captured[FACE_OFFSET[f as Face] + 4];
    if (c) centers[f] = c;
  }
  const gains = whiteBalanceGains(centers);
  const refs = buildRefs(centers, gains);

  return cells.map((rgb) => {
    const chroma = rgChromaticity(applyGains(rgb, gains));
    let best = refs[0];
    let bestD = Infinity;
    for (const r of refs) {
      const d = chromaDistance(chroma, r.chroma);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best.id;
  });
}

export interface SampleOptions {
  /** Side of the sample patch as a fraction of a cell. Keeps us off the bevels. */
  patchFrac?: number;
  /** Fraction of pixels dropped from each end of the luma order. */
  trimFrac?: number;
}

/**
 * Sample the nine cells of a 3x3 grid inside `box` (source-frame pixels).
 *
 * Within each cell we take a centered patch, sort its pixels by luma, drop the
 * brightest and darkest `trimFrac` — glare and shadowed edges respectively —
 * and average what remains. Whole pixels are averaged together rather than
 * each channel independently, so the result is a color that actually occurred.
 */
export function sampleGridInBox(
  ctx: CanvasRenderingContext2D,
  box: Box,
  { patchFrac = 0.5, trimFrac = 0.25 }: SampleOptions = {},
): RGB[] {
  const cellW = box.w / 3;
  const cellH = box.h / 3;
  const patchW = Math.max(3, Math.floor(cellW * patchFrac));
  const patchH = Math.max(3, Math.floor(cellH * patchFrac));

  const out: RGB[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = box.x + cellW * (col + 0.5);
      const cy = box.y + cellH * (row + 0.5);
      const px = Math.max(0, Math.round(cx - patchW / 2));
      const py = Math.max(0, Math.round(cy - patchH / 2));
      const pw = Math.max(1, Math.min(patchW, ctx.canvas.width - px));
      const ph = Math.max(1, Math.min(patchH, ctx.canvas.height - py));
      out.push(trimmedMean(ctx.getImageData(px, py, pw, ph).data, trimFrac));
    }
  }
  return out;
}

function trimmedMean(data: Uint8ClampedArray, trimFrac: number): RGB {
  const n = data.length / 4;
  if (n === 0) return [0, 0, 0];

  const order = new Array<number>(n);
  const luma = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    luma[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    order[i] = i;
  }
  order.sort((a, b) => luma[a] - luma[b]);

  const cut = Math.floor(n * trimFrac);
  const lo = Math.min(cut, n - 1);
  const hi = Math.max(lo + 1, n - cut);

  let r = 0;
  let g = 0;
  let b = 0;
  for (let k = lo; k < hi; k++) {
    const o = order[k] * 4;
    r += data[o];
    g += data[o + 1];
    b += data[o + 2];
  }
  const count = hi - lo;
  return [r / count, g / count, b / count];
}

/**
 * Grab several frames a few milliseconds apart and take the per-cell median.
 *
 * One frame is one roll of the dice against motion blur, autofocus hunting and
 * rolling-shutter banding; the median of a short burst is dramatically steadier
 * for the ~200ms it costs.
 */
export async function captureBurst(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  box: Box,
  frames = 5,
  gapMs = 45,
  options?: SampleOptions,
): Promise<RGB[]> {
  // Crop to the guide at full resolution — the trimmed-mean below needs real
  // pixels to reject glare from, so this path must not downscale.
  const src = clampBox(box, video.videoWidth, video.videoHeight);

  const shots: RGB[][] = [];
  for (let f = 0; f < frames; f++) {
    const ctx = drawBox(video, canvas, src);
    const local: Box = { x: 0, y: 0, w: canvas.width, h: canvas.height };
    shots.push(sampleGridInBox(ctx, local, options));
    if (f < frames - 1) await new Promise((r) => setTimeout(r, gapMs));
  }

  return Array.from({ length: 9 }, (_, cell) => {
    const channel = (c: number) => median(shots.map((s) => s[cell][c]));
    return [channel(0), channel(1), channel(2)] as RGB;
  });
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
