/**
 * Global app state (zustand).
 *
 *  - cube scan + generated solution + guided-step cursor
 *  - accessibility settings (persisted)
 *  - gamification stats: XP, level, streak, achievements (persisted)
 *
 * The solver is heavy-ish (cross BFS), so solutions are generated on demand via
 * generateSolution() and cached until the cube state changes.
 */
import { create } from 'zustand';
import { solve, type Solution } from '../core/solver';
import {
  validateState,
  SOLVED_STATE,
  scramble as scrambleCube,
  type Validation,
} from '../core/cube';
import { buildGuidedSteps, type GuidedStep } from '../lib/steps';
import { estimateSeconds, difficultyFor } from '../core/notation';

// --- persisted slices ------------------------------------------------------

export interface Settings {
  colorblind: boolean;
  largeText: boolean;
  reducedMotion: boolean;
  voiceEnabled: boolean;
  voiceRate: number; // 0.5–2
}
export interface Achievement {
  id: string;
  title: string;
  description: string;
  earnedAt: number | null;
}
const ACHIEVEMENTS: Omit<Achievement, 'earnedAt'>[] = [
  { id: 'first-solve', title: 'First Cube Solved', description: 'Complete your very first solve.' },
  { id: 'ten-solves', title: '10 Cubes Solved', description: 'Solve ten cubes in total.' },
  { id: 'streak-3', title: 'On a Roll', description: 'Solve on three different days in a row.' },
  { id: 'scanner', title: 'Sharp Eyes', description: 'Generate a solution from a scanned cube.' },
  { id: 'cube-master', title: 'Cube Master', description: 'Reach level 5.' },
];
export interface Stats {
  xp: number;
  solves: number;
  streak: number;
  lastSolveDay: string | null; // YYYY-MM-DD
  achievements: Record<string, number>; // id -> earnedAt
}
const DEFAULT_SETTINGS: Settings = {
  colorblind: false,
  largeText: false,
  reducedMotion: false,
  voiceEnabled: true,
  voiceRate: 1,
};
const DEFAULT_STATS: Stats = {
  xp: 0,
  solves: 0,
  streak: 0,
  lastSolveDay: null,
  achievements: {},
};
const SETTINGS_KEY = 'cubeguide.settings';
const STATS_KEY = 'cubeguide.stats';

function load<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / private mode */
  }
}
export function levelForXp(xp: number): number {
  // 100 XP per level, gently increasing.
  return Math.floor(Math.sqrt(xp / 50)) + 1;
}
export function xpForLevel(level: number): number {
  return 50 * (level - 1) ** 2;
}
// --- store -----------------------------------------------------------------
export interface AppState {
  // cube + solution
  cubeState: string[] | null;
  validation: Validation | null;
  solution: Solution | null;
  steps: GuidedStep[];
  stepCursor: number;
  solveError: string | null;
  solvedFromScan: boolean;

  // settings + stats
  settings: Settings;
  stats: Stats;

  // derived helpers
  estimateSeconds: number;
  difficulty: string;

  // actions
  setCubeState: (state: string[], fromScan?: boolean) => Validation;
  loadScramble: (n?: number, seed?: number) => void;
  generateSolution: () => boolean;
  clearSolution: () => void;
  goToStep: (i: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  completeSolve: () => void;

  updateSettings: (patch: Partial<Settings>) => void;
  achievementsList: () => Achievement[];
}
export const useStore = create<AppState>((set, get) => ({
  cubeState: null,
  validation: null,
  solution: null,
  steps: [],
  stepCursor: 0,
  solveError: null,
  solvedFromScan: false,
  settings: load(SETTINGS_KEY, DEFAULT_SETTINGS),
  stats: load(STATS_KEY, DEFAULT_STATS),
  estimateSeconds: 0,
  difficulty: '—',
  setCubeState(state, fromScan = false) {
    const validation = validateState(state);
    set({
      cubeState: state.slice(),
      validation,
      solution: null,
      steps: [],
      stepCursor: 0,
      solveError: null,
      solvedFromScan: fromScan,
    });
    return validation;
  },
  loadScramble(n = 22, seed = Math.floor(Math.random() * 1e6) || 1) {
    const { state } = scrambleCube(n, seed);
    get().setCubeState(state, false);
  },

  generateSolution() {
    const { cubeState } = get();
    if (!cubeState) {
      set({ solveError: 'No cube has been scanned yet.' });
      return false;
    }
    const validation = validateState(cubeState);
    if (!validation.valid) {
      set({ validation, solveError: validation.errors[0] ?? 'Invalid cube state.' });
      return false;
    }
    try {
      const solution = solve(cubeState.slice());
      const steps = buildGuidedSteps(solution, cubeState);
      set({
        solution,
        steps,
        stepCursor: 0,
        solveError: null,
        estimateSeconds: estimateSeconds(steps.length),
        difficulty: difficultyFor(steps.length),
      });
      return true;
    } catch (e) {
      set({ solveError: (e as Error).message || 'Could not solve this cube.' });
      return false;
    }
  },

  clearSolution() {
    set({ solution: null, steps: [], stepCursor: 0, solveError: null });
  },

  goToStep(i) {
    const { steps } = get();
    set({ stepCursor: Math.max(0, Math.min(steps.length, i)) });
  },

  nextStep() {
    get().goToStep(get().stepCursor + 1);
  },

  prevStep() {
    get().goToStep(get().stepCursor - 1);
  },

  completeSolve() {
    const { stats } = get();
    const now = new Date();
    const day = now.toISOString().slice(0, 10);

    let streak = stats.streak;
    if (stats.lastSolveDay !== day) {
      const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
      streak = stats.lastSolveDay === yesterday ? stats.streak + 1 : 1;
    }

    const solves = stats.solves + 1;
    const xp = stats.xp + 120;
    const level = levelForXp(xp);

    const achievements = { ...stats.achievements };
    const earn = (id: string) => {
      if (!achievements[id]) achievements[id] = now.getTime();
    };
    earn('first-solve');
    if (solves >= 10) earn('ten-solves');
    if (streak >= 3) earn('streak-3');
    if (get().solvedFromScan) earn('scanner');
    if (level >= 5) earn('cube-master');

    const next: Stats = { xp, solves, streak, lastSolveDay: day, achievements };
    save(STATS_KEY, next);
    set({ stats: next });
  },

  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    save(SETTINGS_KEY, settings);
    set({ settings });
  },

  achievementsList() {
    const { achievements } = get().stats;
    return ACHIEVEMENTS.map((a) => ({ ...a, earnedAt: achievements[a.id] ?? null }));
  },
}));

export { SOLVED_STATE };
