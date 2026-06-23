/**
 * SolvePage — the guided coaching experience.
 *
 * Left: live 3D cube that animates the current move.
 * Right: a plain-language step coach (no notation), with reason, arrow, progress
 * and hands-free voice control. Beginner Mode is the whole point: the user is
 * told what to do, why, and which way to turn — one move at a time.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Cube3D from '../components/Cube3D';
import { useStore } from '../state/store';
import { SOLVED_STATE } from '../core/cube';
import { encouragement } from '../core/notation';
import {
  createCommandListener,
  speak,
  stopSpeaking,
  sttSupported,
  ttsSupported,
  type CommandListener,
  type VoiceCommand,
} from '../lib/voice';
import './SolvePage.css';

const ARROW_GLYPH: Record<string, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  rotate: '↻',
};

export default function SolvePage() {
  const steps = useStore((s) => s.steps);
  const cursor = useStore((s) => s.stepCursor);
  const settings = useStore((s) => s.settings);
  const solution = useStore((s) => s.solution);
  const estimate = useStore((s) => s.estimateSeconds);
  const difficulty = useStore((s) => s.difficulty);
  const nextStep = useStore((s) => s.nextStep);
  const prevStep = useStore((s) => s.prevStep);
  const goToStep = useStore((s) => s.goToStep);
  const loadScramble = useStore((s) => s.loadScramble);
  const generateSolution = useStore((s) => s.generateSolution);
  const completeSolve = useStore((s) => s.completeSolve);

  const [activeMove, setActiveMove] = useState<import('../core/moves').MoveName | null>(null);
  const [listening, setListening] = useState(false);
  const listenerRef = useRef<CommandListener | null>(null);
  const completedRef = useRef(false);

  const finished = steps.length > 0 && cursor >= steps.length;
  const current = !finished && steps.length > 0 ? steps[cursor] : null;

  // The state shown on the cube: the "before" of the current move while we
  // animate it; the final solved cube once finished.
  const displayState = useMemo(() => {
    if (!steps.length) return SOLVED_STATE.slice();
    if (finished) return steps[steps.length - 1].after;
    return steps[cursor].before;
  }, [steps, cursor, finished]);

  const advance = useCallback(() => {
    if (!current || activeMove) return;
    setActiveMove(current.move);
  }, [current, activeMove]);

  const handleMoveDone = useCallback(() => {
    setActiveMove(null);
    nextStep();
  }, [nextStep]);

  // Speak each new step.
  useEffect(() => {
    if (!current || !settings.voiceEnabled) return;
    const line =
      current.number === 1
        ? `Let's begin. ${current.instruction.voice}`
        : current.instruction.voice;
    speak(line, { rate: settings.voiceRate });
  }, [cursor, current, settings.voiceEnabled, settings.voiceRate]);

  // Celebrate + record the solve exactly once.
  useEffect(() => {
    if (finished && !completedRef.current) {
      completedRef.current = true;
      completeSolve();
      if (settings.voiceEnabled)
        speak('Incredible! Your cube is solved. Well done!', { rate: settings.voiceRate });
    }
    if (!finished) completedRef.current = false;
  }, [finished, completeSolve, settings.voiceEnabled, settings.voiceRate]);

  // Voice commands.
  const runCommand = useCallback(
    (cmd: VoiceCommand) => {
      switch (cmd) {
        case 'next':
          advance();
          break;
        case 'back':
          stopSpeaking();
          prevStep();
          break;
        case 'repeat':
          if (current) speak(current.instruction.voice, { rate: settings.voiceRate });
          break;
        case 'explain':
          if (current) speak(current.phaseReason, { rate: settings.voiceRate });
          break;
        case 'slower':
          useStore.getState().updateSettings({ voiceRate: Math.max(0.5, settings.voiceRate - 0.2) });
          break;
        case 'faster':
          useStore.getState().updateSettings({ voiceRate: Math.min(2, settings.voiceRate + 0.2) });
          break;
        case 'pause':
          stopSpeaking();
          break;
        case 'resume':
          if (current) speak(current.instruction.voice, { rate: settings.voiceRate });
          break;
      }
    },
    [advance, prevStep, current, settings.voiceRate],
  );

  const toggleListening = useCallback(() => {
    if (!sttSupported()) return;
    if (listening) {
      listenerRef.current?.stop();
      setListening(false);
      return;
    }
    if (!listenerRef.current) {
      listenerRef.current = createCommandListener((cmd) => runCommand(cmd));
    }
    listenerRef.current.start();
    setListening(true);
  }, [listening, runCommand]);

  // Keep the listener's closure fresh.
  useEffect(() => {
    if (!listening) return;
    listenerRef.current?.stop();
    listenerRef.current = createCommandListener((cmd) => runCommand(cmd));
    listenerRef.current.start();
    return () => listenerRef.current?.stop();
  }, [runCommand, listening]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        advance();
      } else if (e.key === 'ArrowLeft') {
        prevStep();
      } else if (e.key.toLowerCase() === 'r' && current) {
        speak(current.instruction.voice, { rate: settings.voiceRate });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, prevStep, current, settings.voiceRate]);

  useEffect(() => () => stopSpeaking(), []);

  // ---- empty state -------------------------------------------------------
  if (!solution || !steps.length) {
    return (
      <div className="container solve-empty">
        <div className="glass solve-empty__card">
          <h1 className="page-title">Ready to be coached?</h1>
          <p className="page-sub">
            Scan your real cube, or try a sample scramble to see how the step-by-step
            coaching works — no cube notation required.
          </p>
          <div className="solve-empty__actions">
            <Link to="/scan" className="btn btn-primary">
              Scan my cube
            </Link>
            <button
              className="btn"
              onClick={() => {
                loadScramble();
                generateSolution();
              }}
            >
              Try a sample scramble
            </button>
          </div>
        </div>
      </div>
    );
  }

  const progress = finished ? 1 : cursor / steps.length;

  return (
    <div className="container solve">
      {/* LEFT — 3D cube */}
      <section className="solve__stage glass">
        <Cube3D
          state={displayState}
          activeMove={activeMove}
          onMoveDone={handleMoveDone}
          colorblind={settings.colorblind}
          highlightFace={current?.instruction.face ?? null}
          reducedMotion={settings.reducedMotion}
          height={460}
        />
        <div className="solve__stage-meta">
          <span className="chip">{solution.moves.length} moves total</span>
          <span className="chip">~{Math.round(estimate / 60) || 1} min</span>
          <span className="chip">{difficulty}</span>
        </div>
      </section>

      {/* RIGHT — coach */}
      <section className="solve__coach">
        <div className="solve__progress" aria-hidden>
          <div className="solve__progress-bar" style={{ width: `${progress * 100}%` }} />
        </div>

        {finished ? (
          <motion.div
            className="glass solve__done"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <div className="solve__done-emoji" aria-hidden>
              🎉
            </div>
            <h2>Cube solved!</h2>
            <p>You earned +120 XP. Every face is one solid color — beautifully done.</p>
            <div className="solve__done-actions">
              <button className="btn btn-primary" onClick={() => goToStep(0)}>
                Replay steps
              </button>
              <Link to="/scan" className="btn">
                Solve another
              </Link>
            </div>
          </motion.div>
        ) : (
          current && (
            <motion.div
              key={cursor}
              className="glass solve__card"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22 }}
            >
              <div className="solve__step-head">
                <span className="solve__phase">{current.phaseTitle}</span>
                <span className="solve__count">
                  Step {current.number} of {current.total}
                </span>
              </div>

              <div className="solve__instruction">
                <span
                  className="solve__arrow"
                  style={{ background: current.instruction.faceColor }}
                  aria-hidden
                >
                  {ARROW_GLYPH[current.instruction.arrow]}
                </span>
                <p className="solve__text">{current.instruction.text}</p>
              </div>

              <p className="solve__reason">
                <strong>Why:</strong> {current.phaseReason}
              </p>

              <div className="solve__controls">
                <button className="btn" onClick={prevStep} disabled={cursor === 0}>
                  ← Back
                </button>
                <button className="btn btn-primary solve__next" onClick={advance} disabled={!!activeMove}>
                  {activeMove ? 'Turning…' : 'I did it →'}
                </button>
              </div>

              <p className="solve__hint">{encouragement(cursor)}</p>
            </motion.div>
          )
        )}

        {/* voice controls */}
        <div className="glass solve__voice">
          <label className="solve__voice-row">
            <span>Voice coach</span>
            <input
              type="checkbox"
              checked={settings.voiceEnabled}
              onChange={(e) => useStore.getState().updateSettings({ voiceEnabled: e.target.checked })}
            />
          </label>
          <div className="solve__voice-actions">
            <button
              className="btn btn-ghost"
              onClick={() => current && speak(current.instruction.voice, { rate: settings.voiceRate })}
              disabled={!ttsSupported() || !current}
            >
              🔊 Repeat
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => current && speak(current.phaseReason, { rate: settings.voiceRate })}
              disabled={!ttsSupported() || !current}
            >
              💡 Explain
            </button>
            {sttSupported() && (
              <button
                className={'btn' + (listening ? ' btn-primary' : ' btn-ghost')}
                onClick={toggleListening}
              >
                {listening ? '🎙 Listening…' : '🎤 Hands-free'}
              </button>
            )}
          </div>
          {!ttsSupported() && (
            <p className="solve__voice-note">Voice isn't supported in this browser.</p>
          )}
        </div>
      </section>
    </div>
  );
}
