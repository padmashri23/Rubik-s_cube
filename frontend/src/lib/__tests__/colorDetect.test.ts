import { describe, it, expect } from 'vitest';
import { classifyFacelets, rgbToHsv, type RGB } from '../colorDetect';
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

function simulate(state: string[], seed: number): (RGB | null)[] {
  const rand = mulberry(seed);
  // Global warm-ish white balance + per-region brightness.
  const gain: RGB = [1.05, 0.98, 0.9];
  return state.map((c) => {
    const base = BASE[c as ColorId];
    const bright = 0.78 + rand() * 0.4; // shadow..highlight
    const noise = () => (rand() - 0.5) * 26;
    const px = (i: number) =>
      Math.max(0, Math.min(255, base[i] * gain[i] * bright + noise()));
    return [px(0), px(1), px(2)] as RGB;
  });
}

describe('color detection', () => {
  it('rgbToHsv basics', () => {
    expect(rgbToHsv([255, 0, 0])[0]).toBeCloseTo(0, 0);
    expect(rgbToHsv([255, 255, 255])[1]).toBeCloseTo(0, 1);
  });

  it('recovers scrambled cubes from simulated noisy camera samples', () => {
    let perfect = 0;
    const N = 20;
    for (let seed = 1; seed <= N; seed++) {
      const { state } = scramble(25, seed);
      const samples = simulate(state, seed * 7 + 3);
      const out = classifyFacelets(samples);
      let wrong = 0;
      for (let i = 0; i < 54; i++) if (out[i] !== state[i]) wrong++;
      if (wrong === 0) perfect++;
      // Per-cube tolerance: balanced assignment should be near-perfect.
      expect(wrong, `seed ${seed} mismatches`).toBeLessThanOrEqual(2);
    }
    // The large majority should be flawless.
    expect(perfect).toBeGreaterThanOrEqual(Math.floor(N * 0.7));
  });

  it('pins nothing but classifies all 54 when every sticker is present', () => {
    const { state } = scramble(20, 99);
    const samples = simulate(state, 123);
    const out = classifyFacelets(samples);
    expect(out.every((c) => c !== null)).toBe(true);
    // exactly 9 of each color (balanced assignment guarantee)
    const counts: Record<string, number> = {};
    for (const c of out) counts[c as string] = (counts[c as string] ?? 0) + 1;
    for (const f of ['U', 'R', 'F', 'D', 'L', 'B']) expect(counts[f]).toBe(9);
    void FACE_OFFSET;
  });
});
