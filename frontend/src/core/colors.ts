/**
 * Color scheme and color utilities.
 *
 * Internally the cube is stored as face letters (U R F D L B) which double as
 * color ids. This module maps those to human colors, hex values, and provides
 * a colorblind-friendly alternate palette.
 */

import type { Face } from './moves';

export type ColorId = Face; // U R F D L B

/** Western "BOY" scheme: White-Up, Green-Front => Red-Right. */
export const FACE_COLOR_NAME: Record<ColorId, string> = {
  U: 'White',
  R: 'Red',
  F: 'Green',
  D: 'Yellow',
  L: 'Orange',
  B: 'Blue',
};

export const FACE_HEX: Record<ColorId, string> = {
  U: '#f8fafc', // white
  R: '#ef4444', // red
  F: '#22c55e', // green
  D: '#facc15', // yellow
  L: '#f97316', // orange
  B: '#3b82f6', // blue
};

/** Colorblind-friendly palette (Okabe–Ito inspired), distinct in luminance. */
export const FACE_HEX_CB: Record<ColorId, string> = {
  U: '#ffffff',
  R: '#d55e00',
  F: '#009e73',
  D: '#f0e442',
  L: '#e69f00',
  B: '#0072b2',
};

export function hexFor(color: ColorId, colorblind = false): string {
  return (colorblind ? FACE_HEX_CB : FACE_HEX)[color];
}

/** Map an arbitrary RGB sample to the nearest scheme color (used by scanner). */
export function nearestColor(
  rgb: [number, number, number],
  colorblind = false,
): ColorId {
  const palette = colorblind ? FACE_HEX_CB : FACE_HEX;
  let best: ColorId = 'U';
  let bestDist = Infinity;
  for (const key of Object.keys(palette) as ColorId[]) {
    const [r, g, b] = hexToRgb(palette[key]);
    const d =
      (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = key;
    }
  }
  return best;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
