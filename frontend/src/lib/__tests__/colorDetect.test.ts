import { describe, it, expect } from 'vitest';
import {
  classifyFacelets,
  classifyDetailed,
  classifyPreview,
  mapCoverBoxToSource,
  whiteBalanceGains,
  rgChromaticity,
  chromaDistance,
  type RGB,
} from '../colorDetect';
import { scramble, FACE_OFFSET } from '../../core/cube';
import type { ColorId } from '../../core/colors';

// Simulate a camera: each true color has a base RGB, then we add per-sticker
// lighting (brightness) and white-balance (channel gain) shifts plus noise, the
// way a real webcam would. A robust classifier should still recover the cube.
const BASE: Record<ColorId, RGB> = {
  U: [235, 235, 230], // white
  R: [180, 30, 35], // red
  F: [25, 150, 70], // green
  D: [235, 205, 30], // yellow
  L: [225, 110, 25], // orange
  B: [25, 70, 180], // blue
};

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SimOptions {
  /** Per-channel white-balance cast applied to every sticker. */
  gain?: RGB;
  /** Per-sticker brightness range. */
  brightness?: [number, number];
  /** Peak additive noise per channel. */
  noise?: number;
  /** Per-face exposure spread — each face is captured at a different moment. */
  faceExposure?: [number, number];
}

function simulate(state: string[], seed: number, opts: SimOptions = {}): (RGB | null)[] {
  const {
    gain = [1.05, 0.98, 0.9],
    brightness = [0.78, 1.18],
    noise = 26,
    faceExposure,
  } = opts;
  const rand = mulberry(seed);

  // One exposure multiplier per face, since faces are scanned one at a time.
  const exposure = new Array(6)
    .fill(0)
    .map(() =>
      faceExposure ? faceExposure[0] + rand() * (faceExposure[1] - faceExposure[0]) : 1,
    );

  return state.map((c, i) => {
    const base = BASE[c as ColorId];
    const bright =
      (brightness[0] + rand() * (brightness[1] - brightness[0])) * exposure[Math.floor(i / 9)];
    const jitter = () => (rand() - 0.5) * noise;
    const px = (ch: number) =>
      Math.max(0, Math.min(255, base[ch] * gain[ch] * bright + jitter()));
    return [px(0), px(1), px(2)] as RGB;
  });
}

/** Mismatches between a classification and the truth. */
function errorsAgainst(out: (ColorId | null)[], state: string[]): number {
  let wrong = 0;
  for (let i = 0; i < 54; i++) if (out[i] !== state[i]) wrong++;
  return wrong;
}

describe('color space', () => {
  it('normalizes to the chromaticity plane', () => {
    expect(rgChromaticity([255, 0, 0])).toEqual([1, 0]);
    const white = rgChromaticity([200, 200, 200]);
    expect(white[0]).toBeCloseTo(1 / 3, 6);
    expect(white[1]).toBeCloseTo(1 / 3, 6);
    // Black has no chromaticity; it must not divide by zero.
    expect(rgChromaticity([0, 0, 0])).toEqual([1 / 3, 1 / 3]);
  });

  it('is unchanged by a pure brightness change', () => {
    const bright = rgChromaticity([200, 80, 40]);
    const shadowed = rgChromaticity([50, 20, 10]);
    expect(chromaDistance(bright, shadowed)).toBeCloseTo(0, 6);
  });

  it('separates every pair of cube colors by a usable margin', () => {
    // The real palette, projected. The tightest pair bounds how much noise the
    // classifier can absorb, so it is worth asserting rather than assuming.
    const points = (Object.keys(BASE) as ColorId[]).map((f) => ({
      f,
      c: rgChromaticity(BASE[f]),
    }));
    let tightest = Infinity;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        tightest = Math.min(tightest, chromaDistance(points[i].c, points[j].c));
      }
    }
    expect(tightest).toBeGreaterThan(0.15);
  });
});

describe('white balance', () => {
  it('is a no-op with too few centers to estimate from', () => {
    expect(whiteBalanceGains({ U: [240, 240, 240] })).toEqual([1, 1, 1]);
  });

  it('counteracts a warm color cast', () => {
    const cast: RGB = [1.3, 1.0, 0.7];
    const centers = Object.fromEntries(
      (Object.keys(BASE) as ColorId[]).map((f) => [
        f,
        BASE[f].map((v, c) => Math.min(255, v * cast[c])) as RGB,
      ]),
    );
    const gains = whiteBalanceGains(centers);
    // Red was boosted, so it must be pulled back; blue was starved, pushed up.
    expect(gains[0]).toBeLessThan(1);
    expect(gains[2]).toBeGreaterThan(1);
    expect(gains[0]).toBeLessThan(gains[2]);
  });
});

describe('classification', () => {
  it('recovers scrambled cubes from simulated noisy camera samples', () => {
    let perfect = 0;
    const N = 20;
    for (let seed = 1; seed <= N; seed++) {
      const { state } = scramble(25, seed);
      const out = classifyFacelets(simulate(state, seed * 7 + 3));
      const wrong = errorsAgainst(out, state);
      if (wrong === 0) perfect++;
      expect(wrong, `seed ${seed} mismatches`).toBeLessThanOrEqual(2);
    }
    expect(perfect).toBeGreaterThanOrEqual(Math.floor(N * 0.7));
  });

  it('holds up across hostile lighting', () => {
    // Four ways real captures go wrong. Per-cube counts are noisy at any
    // sample size a unit test can afford, so this measures the aggregate over
    // 160 cubes (8640 stickers) — enough that the number means something.
    const scenes: Record<string, SimOptions> = {
      tungsten: {
        gain: [1.28, 1.0, 0.68],
        brightness: [0.62, 1.25],
        noise: 30,
        faceExposure: [0.72, 1.32],
      },
      cool: {
        gain: [0.82, 1.0, 1.35],
        brightness: [0.7, 1.2],
        noise: 24,
        faceExposure: [0.8, 1.25],
      },
      dim: {
        gain: [1.15, 1.0, 0.85],
        brightness: [0.3, 0.6],
        noise: 22,
        faceExposure: [0.75, 1.15],
      },
      noisy: {
        gain: [1.1, 1.0, 0.8],
        brightness: [0.55, 1.2],
        noise: 44,
        faceExposure: [0.8, 1.2],
      },
    };

    const N = 40;
    let grandTotal = 0;
    for (const [name, opts] of Object.entries(scenes)) {
      let wrong = 0;
      for (let seed = 1; seed <= N; seed++) {
        const { state } = scramble(25, seed * 13);
        wrong += errorsAgainst(classifyFacelets(simulate(state, seed * 31 + 5, opts)), state);
      }
      grandTotal += wrong;
      // No single scene may fall apart, even if the average looks fine.
      expect(wrong / (N * 54), `${name} error rate`).toBeLessThan(0.025);
    }
    // Overall this sits near 0.7%; drifting past 1.2% means the color metric
    // regressed and the tuning work was lost.
    expect(grandTotal / (N * 54 * 4)).toBeLessThan(0.012);
  });

  it('always returns exactly nine of each color once all 54 are sampled', () => {
    const { state } = scramble(20, 99);
    const out = classifyFacelets(simulate(state, 123));
    expect(out.every((c) => c !== null)).toBe(true);
    const counts: Record<string, number> = {};
    for (const c of out) counts[c as string] = (counts[c as string] ?? 0) + 1;
    for (const f of ['U', 'R', 'F', 'D', 'L', 'B']) expect(counts[f]).toBe(9);
  });

  it('pins centers to their own face and trusts them completely', () => {
    const { state } = scramble(20, 44);
    const samples = simulate(state, 77);
    // Corrupt a center badly; it must still read as its own face color.
    samples[FACE_OFFSET.R + 4] = [30, 200, 90];
    const { colors, confidence } = classifyDetailed(samples);
    for (const f of ['U', 'R', 'F', 'D', 'L', 'B'] as ColorId[]) {
      expect(colors[FACE_OFFSET[f] + 4]).toBe(f);
      expect(confidence[FACE_OFFSET[f] + 4]).toBe(1);
    }
  });

  it('flags ambiguous stickers with low confidence', () => {
    const { state } = scramble(20, 8);
    const samples = simulate(state, 55);
    // A muddy red/orange halfway point should not read as confident.
    const target = FACE_OFFSET.F + 0;
    samples[target] = [205, 70, 30];
    const { confidence } = classifyDetailed(samples);
    expect(confidence[target]).toBeLessThan(0.6);
  });

  it('classifies partial scans without the 9-per-color constraint', () => {
    const { state } = scramble(20, 12);
    const full = simulate(state, 31);
    // Only the first three faces are in.
    const partial = full.map((s, i) => (i < 27 ? s : null));
    const out = classifyFacelets(partial);
    expect(out.slice(27).every((c) => c === null)).toBe(true);
    let wrong = 0;
    for (let i = 0; i < 27; i++) if (out[i] !== state[i]) wrong++;
    expect(wrong).toBeLessThanOrEqual(2);
  });
});

describe('live preview classification', () => {
  const NOTHING_CAPTURED: (RGB | null)[] = new Array(54).fill(null);

  it('reads plain colors against the canonical palette before any capture', () => {
    const cells: RGB[] = [
      BASE.U, BASE.R, BASE.F,
      BASE.D, BASE.L, BASE.B,
      BASE.U, BASE.R, BASE.F,
    ];
    expect(classifyPreview(cells, NOTHING_CAPTURED)).toEqual([
      'U', 'R', 'F',
      'D', 'L', 'B',
      'U', 'R', 'F',
    ]);
  });

  it('does not let the cells being read define their own reference', () => {
    // Regression: the preview used to merge these cells into the sample array
    // before classifying. The centre cell then became the reference for the
    // face being scanned, so it matched itself at distance zero and always
    // reported that face's color no matter what was actually in frame.
    const wall: RGB = [232, 233, 230];
    const cells: RGB[] = [
      wall, wall, wall,
      wall, BASE.B, wall,
      wall, wall, wall,
    ];

    // Scanning the white face: the blue centre must read blue, not white.
    const out = classifyPreview(cells, NOTHING_CAPTURED);
    expect(out[4]).toBe('B');
    expect(out.filter((c) => c === 'U')).toHaveLength(8);
  });

  it('calibrates against faces that have been captured', () => {
    // Two faces in, under a warm cast; a third face's cells should still read
    // correctly because the captured centers pin the references.
    const cast = (c: RGB): RGB =>
      [c[0] * 1.25, c[1] * 1.0, c[2] * 0.72].map((v) => Math.min(255, v)) as RGB;

    const captured: (RGB | null)[] = new Array(54).fill(null);
    for (const f of ['U', 'R', 'F', 'D'] as ColorId[]) {
      captured[FACE_OFFSET[f] + 4] = cast(BASE[f]);
    }
    const cells = [BASE.L, BASE.B, BASE.U, BASE.R, BASE.F, BASE.D, BASE.L, BASE.B, BASE.U].map(
      cast,
    ) as RGB[];

    expect(classifyPreview(cells, captured)).toEqual([
      'L', 'B', 'U',
      'R', 'F', 'D',
      'L', 'B', 'U',
    ]);
  });
});

describe('sampling geometry', () => {
  // A 1280x720 camera shown in a 640x480 (4:3) preview with object-fit: cover.
  const SRC_W = 1280;
  const SRC_H = 720;
  const DISP_W = 640;
  const DISP_H = 480;

  it('maps the guide box through the cover crop', () => {
    // Guide is 76% of the preview height, square, centered — matching the CSS.
    const side = DISP_H * 0.76;
    const box = {
      x: (DISP_W - side) / 2,
      y: (DISP_H - side) / 2,
      w: side,
      h: side,
    };
    const src = mapCoverBoxToSource(DISP_W, DISP_H, SRC_W, SRC_H, box);

    // Cover scales by the larger ratio: 480/720 here.
    const scale = DISP_H / SRC_H;
    expect(src.w).toBeCloseTo(side / scale, 4);
    expect(src.h).toBeCloseTo(side / scale, 4);

    // A centered guide must land dead centre of the source frame.
    expect(src.x + src.w / 2).toBeCloseTo(SRC_W / 2, 4);
    expect(src.y + src.h / 2).toBeCloseTo(SRC_H / 2, 4);

    // And it must stay inside the frame, or getImageData reads garbage.
    expect(src.x).toBeGreaterThanOrEqual(0);
    expect(src.y).toBeGreaterThanOrEqual(0);
    expect(src.x + src.w).toBeLessThanOrEqual(SRC_W);
    expect(src.y + src.h).toBeLessThanOrEqual(SRC_H);
  });

  it('is the inverse of the cover transform for off-centre boxes', () => {
    const scale = Math.max(DISP_W / SRC_W, DISP_H / SRC_H);
    const offX = (DISP_W - SRC_W * scale) / 2;
    const offY = (DISP_H - SRC_H * scale) / 2;

    // Take a known source rect, project it forward, and map it back.
    const source = { x: 400, y: 120, w: 300, h: 260 };
    const displayed = {
      x: source.x * scale + offX,
      y: source.y * scale + offY,
      w: source.w * scale,
      h: source.h * scale,
    };
    const round = mapCoverBoxToSource(DISP_W, DISP_H, SRC_W, SRC_H, displayed);
    expect(round.x).toBeCloseTo(source.x, 6);
    expect(round.y).toBeCloseTo(source.y, 6);
    expect(round.w).toBeCloseTo(source.w, 6);
    expect(round.h).toBeCloseTo(source.h, 6);
  });

  it('handles a portrait source in a landscape preview', () => {
    const src = mapCoverBoxToSource(640, 480, 720, 1280, {
      x: 160,
      y: 120,
      w: 320,
      h: 240,
    });
    // Cover crops vertically here; the mapped box must stay within the frame.
    expect(src.x).toBeGreaterThanOrEqual(0);
    expect(src.y).toBeGreaterThanOrEqual(0);
    expect(src.x + src.w).toBeLessThanOrEqual(720);
    expect(src.y + src.h).toBeLessThanOrEqual(1280);
  });

  it('degrades gracefully when the video has no dimensions yet', () => {
    const src = mapCoverBoxToSource(0, 0, 1280, 720, { x: 10, y: 10, w: 50, h: 50 });
    expect(src).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
  });
});
