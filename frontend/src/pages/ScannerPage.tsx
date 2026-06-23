/**
 * ScannerPage — guided, calibrated cube capture.
 *
 * Flow: a six-step wizard walks the user face-by-face. For each face we sample
 * the 3x3 grid (median per cell), then classify colors with HSV + live
 * calibration from the captured centers (see lib/colorDetect). Centers are
 * pinned to their true face color so they can never be misread. The user sees
 * the detected colors immediately and can tap any sticker to correct it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useStore } from '../state/store';
import { SOLVED_STATE, validateState, FACE_OFFSET } from '../core/cube';
import { FACE_COLOR_NAME, hexFor, type ColorId } from '../core/colors';
import CubeNet from '../components/CubeNet';
import { classifyFacelets, sampleGrid, FACES, type RGB } from '../lib/colorDetect';
import './ScannerPage.css';

// How to hold the cube for each face so the scan stays consistent.
const HOLD: Record<ColorId, string> = {
  U: 'Tilt the top (white-centre) face toward the camera.',
  R: 'Turn the cube left so the red-centre face points at the camera.',
  F: 'Show the green-centre face straight on.',
  D: 'Tilt the bottom (yellow-centre) face toward the camera.',
  L: 'Turn the cube right so the orange-centre face points at the camera.',
  B: 'Rotate to the blue-centre face (opposite green).',
};

export default function ScannerPage() {
  const navigate = useNavigate();
  const cubeState = useStore((s) => s.cubeState);
  const setCubeState = useStore((s) => s.setCubeState);
  const generateSolution = useStore((s) => s.generateSolution);
  const loadScramble = useStore((s) => s.loadScramble);
  const colorblind = useStore((s) => s.settings.colorblind);

  // Raw RGB samples per facelet (null = not scanned) and manual overrides.
  const [samples, setSamples] = useState<(RGB | null)[]>(() => Array(54).fill(null));
  const [overrides, setOverrides] = useState<Record<number, ColorId>>(() =>
    cubeState ? Object.fromEntries(cubeState.map((c, i) => [i, c as ColorId])) : {},
  );

  const [step, setStep] = useState(0); // current wizard face index 0..5
  const [activeColor, setActiveColor] = useState<ColorId>('U');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const targetFace = FACES[step];

  // --- camera lifecycle ----------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    async function start(): Promise<void> {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera access is not supported in this browser.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setCameraReady(true);
        setCameraError(null);
      } catch {
        setCameraError(
          'Camera unavailable — grant permission, or paint the colors by hand on the right.',
        );
      }
    }
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // --- derived: classification + draft -------------------------------------

  const classified = useMemo(() => classifyFacelets(samples), [samples]);

  const draft = useMemo(() => {
    const arr: string[] = new Array(54);
    for (let i = 0; i < 54; i++) {
      arr[i] = overrides[i] ?? classified[i] ?? SOLVED_STATE[i];
    }
    // Centers are physically fixed — pin them to their true face color so a
    // misread centre can never invalidate the whole cube.
    for (const f of FACES) arr[FACE_OFFSET[f] + 4] = f;
    return arr;
  }, [overrides, classified]);

  const validation = useMemo(() => validateState(draft), [draft]);

  const capturedFaces = useMemo(
    () => FACES.filter((f) => samples[FACE_OFFSET[f] + 4] !== null),
    [samples],
  );
  const allCaptured = capturedFaces.length === 6;

  // --- capture -------------------------------------------------------------

  const captureFace = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraReady) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw === 0 || vh === 0) {
      setHint('Camera is still warming up — try again in a moment.');
      return;
    }
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, vw, vh);

    const grid = sampleGrid(ctx, vw, vh);
    const base = FACE_OFFSET[targetFace];
    setSamples((prev) => {
      const next = prev.slice();
      for (let i = 0; i < 9; i++) next[base + i] = grid[i];
      return next;
    });
    // A fresh scan supersedes any manual edits on this face.
    setOverrides((prev) => {
      const next = { ...prev };
      for (let i = 0; i < 9; i++) delete next[base + i];
      return next;
    });
    setErrors([]);
    setHint(`Captured the ${FACE_COLOR_NAME[targetFace]} face. Check it below, then continue.`);
  }, [cameraReady, targetFace]);

  const recapture = useCallback(() => {
    const base = FACE_OFFSET[targetFace];
    setSamples((prev) => {
      const next = prev.slice();
      for (let i = 0; i < 9; i++) next[base + i] = null;
      return next;
    });
    setHint(`Cleared the ${FACE_COLOR_NAME[targetFace]} face — line it up and capture again.`);
  }, [targetFace]);

  // Tap a detected sticker to cycle it to the next color (quick fix).
  const cycleSticker = useCallback((index: number, current: ColorId) => {
    const order = FACES;
    const nextColor = order[(order.indexOf(current) + 1) % order.length];
    setOverrides((prev) => ({ ...prev, [index]: nextColor }));
  }, []);

  const paint = useCallback(
    (index: number) => setOverrides((prev) => ({ ...prev, [index]: activeColor })),
    [activeColor],
  );

  const fillFromScramble = useCallback(() => {
    loadScramble();
    const next = useStore.getState().cubeState;
    if (next) {
      setSamples(Array(54).fill(null));
      setOverrides(Object.fromEntries(next.map((c, i) => [i, c as ColorId])));
    }
    setErrors([]);
  }, [loadScramble]);

  const handleGenerate = useCallback(() => {
    const result = setCubeState(draft, true);
    if (result.valid) {
      generateSolution();
      navigate('/solve');
    } else {
      setErrors(result.errors);
    }
  }, [draft, setCubeState, generateSolution, navigate]);

  // --- render --------------------------------------------------------------

  const targetCaptured = samples[FACE_OFFSET[targetFace] + 4] !== null;

  return (
    <div className="container scan">
      <motion.h1
        className="page-title gradient-text"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        Scan your cube
      </motion.h1>
      <p className="page-sub">
        We scan one face at a time and learn your cube&apos;s exact colors from the centers,
        so detection stays accurate under your lighting. You can fix any sticker with a tap.
      </p>

      {/* step rail */}
      <div className="scan__steps" role="list" aria-label="Scan progress">
        {FACES.map((f, i) => {
          const done = samples[FACE_OFFSET[f] + 4] !== null;
          const isCurrent = i === step;
          return (
            <button
              key={f}
              role="listitem"
              className={
                'scan__step' +
                (isCurrent ? ' is-current' : '') +
                (done ? ' is-done' : '')
              }
              onClick={() => setStep(i)}
              aria-current={isCurrent}
            >
              <span className="scan__step-swatch" style={{ background: hexFor(f, colorblind) }} />
              <span className="scan__step-name">{FACE_COLOR_NAME[f]}</span>
              {done && <span className="scan__step-check">✓</span>}
            </button>
          );
        })}
      </div>

      <div className="scan__grid">
        {/* LEFT — guided camera */}
        <section className="glass scan__panel" aria-label="Camera capture">
          <header className="scan__panelhead">
            <div className="scan__target">
              <span className="scan__target-swatch" style={{ background: hexFor(targetFace, colorblind) }} />
              <div>
                <h2 className="scan__h2">
                  Face {step + 1} of 6 — {FACE_COLOR_NAME[targetFace]}
                </h2>
                <p className="scan__target-hold">{HOLD[targetFace]}</p>
              </div>
            </div>
            <span className="chip">{capturedFaces.length} / 6 done</span>
          </header>

          <div className="scan__camera">
            <video ref={videoRef} className="scan__video" playsInline muted aria-label="Live camera preview" />
            <div className="scan__overlay" aria-hidden>
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} className="scan__cell" />
              ))}
            </div>
            {cameraError && (
              <div className="scan__camerafallback" role="status">
                {cameraError}
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="scan__canvas" aria-hidden />

          <p className="scan__hint" role="status">
            {hint ?? 'Fill the square with one face, keep lighting even, then capture.'}
          </p>

          {/* detected preview for the current face */}
          {targetCaptured && (
            <div className="scan__detected">
              <span className="scan__detected-label">Detected (tap a sticker to fix):</span>
              <div className="scan__detected-grid">
                {Array.from({ length: 9 }, (_, i) => {
                  const idx = FACE_OFFSET[targetFace] + i;
                  const color = draft[idx] as ColorId;
                  const isCenter = i === 4;
                  return isCenter ? (
                    <span
                      key={idx}
                      className="scan__dcell is-center"
                      style={{ background: hexFor(color, colorblind) }}
                      title={`Center — always ${FACE_COLOR_NAME[color]}`}
                    />
                  ) : (
                    <button
                      key={idx}
                      className="scan__dcell"
                      style={{ background: hexFor(color, colorblind) }}
                      onClick={() => cycleSticker(idx, color)}
                      title={`${FACE_COLOR_NAME[color]} — tap to change`}
                      aria-label={`Sticker ${i + 1}: ${FACE_COLOR_NAME[color]}, tap to change`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <div className="scan__actions">
            <button type="button" className="btn btn-primary" onClick={captureFace} disabled={!cameraReady}>
              {targetCaptured ? 'Re-scan this face' : `Capture ${FACE_COLOR_NAME[targetFace]} face`}
            </button>
            {targetCaptured && (
              <button type="button" className="btn" onClick={recapture}>
                Clear
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => setStep((s) => Math.min(5, s + 1))}
              disabled={step >= 5}
            >
              Next face →
            </button>
          </div>

          <ul className="scan__tips">
            <li>Hold the cube ~20–30 cm away and fill the blue square with one face.</li>
            <li>Use bright, even light — avoid glare, harsh shadows and colored lighting.</li>
            <li>Scan the centers accurately; the app calibrates every other sticker from them.</li>
          </ul>
        </section>

        {/* RIGHT — full-cube editor */}
        <section className="glass scan__panel" aria-label="Manual editor">
          <header className="scan__panelhead">
            <h2 className="scan__h2">Full cube</h2>
            <button type="button" className="btn btn-ghost scan__scramble" onClick={fillFromScramble}>
              Fill from sample scramble
            </button>
          </header>

          <div className="scan__palette" role="group" aria-label="Pick a color">
            {FACES.map((c) => (
              <button
                key={c}
                type="button"
                className={'scan__swatch' + (activeColor === c ? ' is-active' : '')}
                style={{ background: hexFor(c, colorblind) }}
                onClick={() => setActiveColor(c)}
                aria-pressed={activeColor === c}
                aria-label={`${FACE_COLOR_NAME[c]} (${c})`}
                title={`${FACE_COLOR_NAME[c]} (${c})`}
              />
            ))}
            <span className="scan__paletteactive">
              Painting: <strong>{FACE_COLOR_NAME[activeColor]}</strong>
            </span>
          </div>

          <div className="scan__net">
            <CubeNet
              state={draft}
              editable
              colorblind={colorblind}
              activeColor={activeColor}
              onPaint={paint}
              size={30}
              highlight={validation.badStickers}
            />
          </div>

          <p className="scan__nethint">
            This whole-cube view updates as you scan. Tap any non-center sticker to paint it.
            {allCaptured && ' All six faces scanned — colors are auto-balanced to nine of each.'}
          </p>
        </section>
      </div>

      {/* validation */}
      <div
        className={'glass scan__validate ' + (validation.valid ? 'scan__validate--ok' : 'scan__validate--bad')}
        role="status"
      >
        {validation.valid ? (
          <span className="scan__validmsg">Looks like a valid cube ✓</span>
        ) : (
          <div className="scan__errors">
            <strong>{allCaptured ? 'Not solvable yet — fix the highlighted issues:' : `Keep scanning (${capturedFaces.length}/6 faces). Current issues:`}</strong>
            <ul>
              {validation.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div className="glass scan__validate scan__validate--bad" role="alert">
          <div className="scan__errors">
            <strong>Could not generate a solution:</strong>
            <ul>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="scan__cta">
        <button
          type="button"
          className="btn btn-primary scan__generate"
          onClick={handleGenerate}
          disabled={!validation.valid}
        >
          Generate solution →
        </button>
        <span className="scan__ctahint">
          {validation.valid
            ? 'Your cube checks out. Continue to the guided solve.'
            : 'Fix the issues above to continue.'}
        </span>
      </div>
    </div>
  );
}
