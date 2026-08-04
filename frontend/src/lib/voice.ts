/**
 * Voice coach built on the browser Web Speech API.
 *
 *  - speak(): text-to-speech with a calm, friendly default voice.
 *  - listenForCommands(): speech recognition mapped to coaching commands.
 *
 * Everything degrades gracefully: if the API is missing, speak() is a no-op
 * and listening reports `supported: false` so the UI can hide the mic.
 */
export type VoiceCommand =
  | 'next'
  | 'back'
  | 'repeat'
  | 'explain'
  | 'slower'
  | 'faster'
  | 'pause'
  | 'resume';

const COMMAND_PATTERNS: { command: VoiceCommand; words: string[] }[] = [
  { command: 'next', words: ['next', 'done', 'continue', 'okay next', 'go on'] },
  { command: 'back', words: ['back', 'previous', 'go back', 'undo'] },
  { command: 'repeat', words: ['repeat', 'again', 'say again', 'what'] },
  { command: 'explain', words: ['explain', 'why', 'help', 'tell me more'] },
  { command: 'slower', words: ['slower', 'slow down', 'too fast'] },
  { command: 'faster', words: ['faster', 'speed up'] },
  { command: 'pause', words: ['pause', 'stop', 'wait', 'hold on'] },
  { command: 'resume', words: ['resume', 'play', 'keep going', 'start'] },
];

export function matchCommand(transcript: string): VoiceCommand | null {
  const t = transcript.toLowerCase().trim();
  for (const { command, words } of COMMAND_PATTERNS) {
    if (words.some((w) => t === w || t.includes(w))) return command;
  }
  return null;
}

export const ttsSupported = (): boolean =>
  typeof window !== 'undefined' && 'speechSynthesis' in window;

let preferredVoice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null;
  if (preferredVoice) return preferredVoice;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  // Prefer a natural English voice; fall back to the first available.
  preferredVoice =
    voices.find((v) => /en[-_]?(US|GB)/i.test(v.lang) && /natural|google|samantha|aria/i.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0];
  return preferredVoice;
}

if (ttsSupported()) {
  // Voices load async in some browsers.
  window.speechSynthesis.onvoiceschanged = () => {
    preferredVoice = null;
    pickVoice();
  };
}

export interface SpeakOptions {
  rate?: number; // 0.5–2, default 1
  interrupt?: boolean; // cancel current speech first (default true)
  onEnd?: () => void;
}

export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!ttsSupported()) {
    opts.onEnd?.();
    return;
  }
  const synth = window.speechSynthesis;
  if (opts.interrupt !== false) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) u.voice = voice;
  u.rate = clamp(opts.rate ?? 1, 0.5, 2);
  u.pitch = 1;
  u.volume = 1;
  if (opts.onEnd) u.onend = () => opts.onEnd!();
  synth.speak(u);
}

export function stopSpeaking(): void {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// --- speech recognition ----------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function getRecognitionCtor(): any {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export const sttSupported = (): boolean => getRecognitionCtor() !== null;

export interface CommandListener {
  start(): void;
  stop(): void;
  readonly supported: boolean;
}

/**
 * Continuous command listener. Calls `onCommand` whenever a recognised phrase
 * maps to a coaching command. Auto-restarts on end so it stays hands-free.
 */
export function createCommandListener(
  onCommand: (cmd: VoiceCommand, transcript: string) => void,
  onError?: (msg: string) => void,
): CommandListener {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    return { start() {}, stop() {}, supported: false };
  }

  const recog = new Ctor();
  recog.lang = 'en-US';
  recog.continuous = true;
  recog.interimResults = false;

  let active = false;

  recog.onresult = (e: any) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (!res.isFinal) continue;
      const transcript = res[0].transcript as string;
      const cmd = matchCommand(transcript);
      if (cmd) onCommand(cmd, transcript);
    }
  };

  recog.onerror = (e: any) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    onError?.(String(e.error));
  };

  recog.onend = () => {
    // Keep listening until explicitly stopped.
    if (active) {
      try {
        recog.start();
      } catch {
        /* already starting */
      }
    }
  };

  return {
    supported: true,
    start() {
      if (active) return;
      active = true;
      try {
        recog.start();
      } catch {
        /* ignore double-start */
      }
    },
    stop() {
      active = false;
      try {
        recog.stop();
      } catch {
        /* ignore */
      }
    },
  };
}
