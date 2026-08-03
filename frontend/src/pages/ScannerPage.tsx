/**
 * ScannerPage — guided, calibrated cube capture.
 *
 * A six-step wizard walks the user face by face. The 3x3 sample grid is derived
 * from the on-screen guide box every single time (see mapCoverBoxToSource), so
 * what gets measured is exactly what the user aimed at. Colors are read from a
 * short burst of frames, white-balanced against the captured centers, and
 * balanced to nine-of-each once all six faces are in.
 *
 * A live readout under the camera shows what the app is currently seeing, so
 * lighting problems are obvious before anything is committed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../state/store';
import { SOLVED_STATE, validateState, FACE_OFFSET } from '../core/cube';
import { FACE_COLOR_NAME, hexFor, type ColorId } from '../core/colors';
import CubeNet from '../components/CubeNet';
import {
  classifyDetailed,
  classifyPreview,
  captureBurst,
  samplePreview,
  mapCoverBoxToSource,
  FACES,
  type RGB,
  type Box,
} from '../lib/colorDetect';
import './ScannerPage.css';

/** How to hold the cube for each face so the scan stays consistent. */
const HOLD: Record<ColorId, string> = {
  U: 'Tilt the top (white-centre) face toward the camera.',
  R: 'Turn the cube left so the red-centre face points at the camera.',
  F: 'Show the green-centre face straight on.',
  D: 'Tilt the bottom (yellow-centre) face toward the camera.',
  L: 'Turn the cube right so the orange-centre face points at the camera.',
  B: 'Rotate to the blue-centre face (opposite green).',
};

const LIVE_INTERVAL_MS = 180;

/**
 * Turn a getUserMedia rejection into something the user can act on.
 *
 * The browser distinguishes these cases precisely and they need completely
 * different fixes — "camera unavailable" for all of them sends people to reset
 * a permission that was never the problem.
 */
function describeCameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission was blocked. Click the icon at the left of the address bar, set Camera to "Allow", then press Retry.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found. Plug one in or check that it is enabled in your system settings, then press Retry.';
    case 'NotReadableError':
    case 'AbortError':
      return 'The camera is already in use by another app (Zoom, Teams, Camera…). Close it and press Retry.';
    default:
      return 'Camera unavailable — grant permission and press Retry, or paint the colors by hand on the right.';
  }
}

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
  // Bumping this re-runs the camera effect, so granting permission in the
  // browser's site settings doesn't require a full page reload.
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const [live, setLive] = useState<RGB[] | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Separate scratch canvas: the preview keeps a tiny downscaled buffer, while
  // capture resizes its own to the full guide region.
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const guideRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);

  const targetFace = FACES[step];

  // --- camera lifecycle ----------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function start(): Promise<void> {
      if (!navigator.mediaDevices?.getUserMedia) {
        // getUserMedia is only exposed in a secure context. localhost counts as
        // one; a plain http:// LAN address (phone testing) does not.
        setCameraError(
          window.isSecureContext
            ? 'This browser does not support camera access. Try Chrome, Edge or Safari.'
            : `Camera access needs a secure origin. This page is on ${window.location.protocol}//${window.location.host} — use localhost or serve it over HTTPS.`,
        );
        return;
      }
      try {
        const constraints: MediaStreamConstraints = {
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
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

        // Labels are only populated once permission has been granted, so this
        // has to happen after getUserMedia rather than on mount.
        const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (!cancelled) setDevices(all.filter((d) => d.kind === 'videoinput'));
      } catch (err) {
        if (cancelled) return;
        setCameraReady(false);
        setCameraError(describeCameraError(err));
      }
    }

    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [deviceId, cameraAttempt]);

  // --- sampling geometry ---------------------------------------------------

  /**
   * The guide box, expressed in source-frame pixels. Measured from the live DOM
   * so it stays correct across any camera resolution, CSS change or rotation.
   */
  const sourceBox = useCallback((): Box | null => {
    const video = videoRef.current;
    const guide = guideRef.current;
    if (!video || !guide) return null;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;

    const v = video.getBoundingClientRect();
    const g = guide.getBoundingClientRect();
    if (!v.width || !v.height) return null;

    return mapCoverBoxToSource(v.width, v.height, vw, vh, {
      x: g.left - v.left,
      y: g.top - v.top,
      w: g.width,
      h: g.height,
    });
  }, []);

  // --- live readout --------------------------------------------------------

  useEffect(() => {
    if (!cameraReady) {
      setLive(null);
      return;
    }
    let timer = 0;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      // Skip while capturing (it owns the canvas) and while the tab is hidden.
      if (!busyRef.current && document.visibilityState === 'visible') {
        const video = videoRef.current;
        const canvas = previewCanvasRef.current;
        const box = sourceBox();
        if (video && canvas && box) {
          try {
            setLive(samplePreview(video, canvas, box));
          } catch {
            /* frame not ready yet — the next tick will pick it up */
          }
        }
      }
      timer = window.setTimeout(tick, LIVE_INTERVAL_MS);
    };

    timer = window.setTimeout(tick, LIVE_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [cameraReady, sourceBox]);

  // --- derived: classification + draft -------------------------------------

  const detection = useMemo(() => classifyDetailed(samples), [samples]);

  const draft = useMemo(() => {
    const arr: string[] = new Array(54);
    for (let i = 0; i < 54; i++) {
      arr[i] = overrides[i] ?? detection.colors[i] ?? SOLVED_STATE[i];
    }
    // Centers are physically fixed — pin them so a misread centre can never
    // invalidate the whole cube.
    for (const f of FACES) arr[FACE_OFFSET[f] + 4] = f;
    return arr;
  }, [overrides, detection]);

  const validation = useMemo(() => validateState(draft), [draft]);

  const capturedFaces = useMemo(
    () => FACES.filter((f) => samples[FACE_OFFSET[f] + 4] !== null),
    [samples],
  );
  const allCaptured = capturedFaces.length === 6;
  const targetCaptured = samples[FACE_OFFSET[targetFace] + 4] !== null;

  /**
   * What the camera is reading right now, judged against the faces already
   * captured. These cells must not feed their own calibration — see
   * classifyPreview.
   */
  const liveColors = useMemo(
    () => (live ? classifyPreview(live, samples) : null),
    [live, samples],
  );

  /**
   * Stickers the detector was unsure about, grouped by face — the rings are
   * only visible on the selected face, so the message has to say where to look.
   */
  const shaky = useMemo(() => {
    const byFace = FACES.map((f) => {
      const base = FACE_OFFSET[f];
      let n = 0;
      for (let i = base; i < base + 9; i++) {
        if (
          detection.colors[i] !== null &&
          overrides[i] === undefined &&
          detection.confidence[i] < 0.5
        ) {
          n += 1;
        }
      }
      return { face: f, n };
    }).filter((x) => x.n > 0);

    return {
      total: byFace.reduce((a, x) => a + x.n, 0),
      faces: byFace.map((x) => FACE_COLOR_NAME[x.face]),
    };
  }, [detection, overrides]);

  // --- capture -------------------------------------------------------------

  const captureFace = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraReady || busyRef.current) return;

    const box = sourceBox();
    if (!box) {
      setHint('Camera is still warming up — try again in a moment.');
      return;
    }

    busyRef.current = true;
    setBusy(true);
    try {
      const grid = await captureBurst(video, canvas, box);
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
      setFlash(true);
      window.setTimeout(() => setFlash(false), 320);
      // Auto-advance so the flow keeps moving; the step rail above lets the
      // user jump back to any captured face to review it.
      const nextFace = step < 5 ? FACES[step + 1] : null;
      setHint(
        nextFace
          ? `${FACE_COLOR_NAME[targetFace]} captured ✓ — now show the ${FACE_COLOR_NAME[nextFace]} face.`
          : `${FACE_COLOR_NAME[targetFace]} captured ✓ — all six faces are in.`,
      );
      setStep((s) => (s < 5 ? s + 1 : s));
    } catch {
      setHint('Capture failed — try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [cameraReady, sourceBox, targetFace, step]);

  const recapture = useCallback(() => {
    const base = FACE_OFFSET[targetFace];
    setSamples((prev) => {
      const next = prev.slice();
      for (let i = 0; i < 9; i++) next[base + i] = null;
      return next;
    });
    setOverrides((prev) => {
      const next = { ...prev };
      for (let i = 0; i < 9; i++) delete next[base + i];
      return next;
    });
    setHint(`Cleared the ${FACE_COLOR_NAME[targetFace]} face — line it up and capture again.`);
  }, [targetFace]);

  const resetAll = useCallback(() => {
    setSamples(Array(54).fill(null));
    setOverrides({});
    setStep(0);
    setErrors([]);
    setHint('Cleared everything — start with the white face.');
  }, []);

  // Tap a detected sticker to cycle it to the next color (quick fix).
  const cycleSticker = useCallback((index: number, current: ColorId) => {
    const nextColor = FACES[(FACES.indexOf(current) + 1) % FACES.length];
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

  // Space bar captures, so the cube can stay in both hands. Anything focusable
  // keeps its own Space behaviour — stealing it from a focused button would
  // silently fire a capture instead of the button the user was activating.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const el = document.activeElement;
      if (el && el !== document.body && el.closest('button, a, input, select, textarea')) return;
      e.preventDefault();
      void captureFace();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [captureFace]);

  // --- render --------------------------------------------------------------

  const progressPct = (capturedFaces.length / 6) * 100;

  return (
    <div className="container scan">
      <header className="scan__head">
        <div>
          <motion.h1
            className="page-title gradient-text scan__title"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Scan your cube
          </motion.h1>
          <p className="scan__sub">
            One face at a time. The app learns your cube&apos;s real colors from the centers,
            so it stays accurate in your lighting — and you can fix any sticker with a tap.
          </p>
        </div>
        <div className="scan__progress" aria-hidden>
          <div className="scan__progress-ring" style={{ ['--pct' as string]: `${progressPct}%` }}>
            <span className="scan__progress-num">{capturedFaces.length}</span>
            <span className="scan__progress-den">/ 6</span>
          </div>
          <span className="scan__progress-label">faces captured</span>
        </div>
      </header>

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
                'scan__step' + (isCurrent ? ' is-current' : '') + (done ? ' is-done' : '')
              }
              onClick={() => setStep(i)}
              aria-current={isCurrent}
            >
              <span className="scan__step-swatch" style={{ background: hexFor(f, colorblind) }}>
                {done && <span className="scan__step-check">✓</span>}
              </span>
              <span className="scan__step-name">{FACE_COLOR_NAME[f]}</span>
            </button>
          );
        })}
      </div>

      <div className="scan__grid">
        {/* LEFT — guided camera */}
        <section className="glass scan__panel scan__panel--camera" aria-label="Camera capture">
          <header className="scan__panelhead">
            <div className="scan__target">
              <span
                className="scan__target-swatch"
                style={{ background: hexFor(targetFace, colorblind) }}
              />
              <div>
                <h2 className="scan__h2">
                  Face {step + 1} of 6 — {FACE_COLOR_NAME[targetFace]}
                </h2>
                <p className="scan__target-hold">{HOLD[targetFace]}</p>
              </div>
            </div>
          </header>

          <div className={'scan__camera' + (busy ? ' is-busy' : '')}>
            <video
              ref={videoRef}
              className="scan__video"
              playsInline
              muted
              autoPlay
              aria-label="Live camera preview"
            />

            <div className="scan__mask" aria-hidden />
            <div
              ref={guideRef}
              className={'scan__guide' + (targetCaptured ? ' is-done' : '')}
              aria-hidden
              style={{ ['--guide-color' as string]: hexFor(targetFace, colorblind) }}
            >
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} className="scan__cell">
                  {liveColors && (
                    <span
                      className="scan__cell-dot"
                      style={{ background: hexFor(liveColors[i], colorblind) }}
                    />
                  )}
                </span>
              ))}
              <span className="scan__guide-corner scan__guide-corner--tl" />
              <span className="scan__guide-corner scan__guide-corner--tr" />
              <span className="scan__guide-corner scan__guide-corner--bl" />
              <span className="scan__guide-corner scan__guide-corner--br" />
            </div>

            <AnimatePresence>
              {flash && (
                <motion.div
                  className="scan__flash"
                  initial={{ opacity: 0.85 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.32 }}
                />
              )}
            </AnimatePresence>

            {busy && (
              <div className="scan__busy" role="status">
                <span className="scan__spinner" aria-hidden />
                Reading colors…
              </div>
            )}

            {cameraError && (
              <div className="scan__camerafallback" role="status">
                <p className="scan__camerafallback-text">{cameraError}</p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setCameraError(null);
                    setCameraAttempt((n) => n + 1);
                  }}
                >
                  ↻ Retry camera
                </button>
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="scan__canvas" aria-hidden />
          <canvas ref={previewCanvasRef} className="scan__canvas" aria-hidden />

          <div className="scan__actions">
            <button
              type="button"
              className="btn btn-primary scan__capture"
              onClick={() => void captureFace()}
              disabled={!cameraReady || busy}
            >
              {busy
                ? 'Reading…'
                : targetCaptured
                  ? `Re-scan ${FACE_COLOR_NAME[targetFace]}`
                  : `Capture ${FACE_COLOR_NAME[targetFace]}`}
            </button>
            {targetCaptured && (
              <button type="button" className="btn" onClick={recapture} disabled={busy}>
                Clear
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => setStep((s) => Math.min(5, s + 1))}
              disabled={step >= 5}
            >
              Skip →
            </button>
          </div>

          <p className="scan__hint" role="status">
            {hint ?? 'Fill the frame with one face, keep the light even, then capture (or press Space).'}
          </p>

          {devices.length > 1 && (
            <label className="scan__camerapick">
              <span>Camera</span>
              <select
                value={deviceId ?? ''}
                onChange={(e) => setDeviceId(e.target.value || null)}
              >
                <option value="">Default (rear)</option>
                {devices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}

          <ul className="scan__tips">
            <li>Hold the cube 20–30 cm away and fill the frame with a single face.</li>
            <li>Bright, even light — avoid glare, hard shadows and colored lamps.</li>
            <li>The dots inside the frame show what the app is reading right now.</li>
          </ul>
        </section>

        {/* RIGHT — review + editor */}
        <section className="scan__panel-stack" aria-label="Review and edit">
          <div className="glass scan__panel">
            <header className="scan__panelhead">
              <h2 className="scan__h2">
                {targetCaptured ? 'Captured face' : 'Live reading'}
              </h2>
              <span className="chip">
                {targetCaptured ? 'tap a sticker to fix' : 'not captured yet'}
              </span>
            </header>

            <div className="scan__detected-grid">
              {Array.from({ length: 9 }, (_, i) => {
                const idx = FACE_OFFSET[targetFace] + i;
                const color = (targetCaptured ? draft[idx] : liveColors?.[i] ?? draft[idx]) as ColorId;
                const isCenter = i === 4;
                const shaky =
                  targetCaptured &&
                  overrides[idx] === undefined &&
                  detection.confidence[idx] < 0.5;

                if (isCenter || !targetCaptured) {
                  return (
                    <span
                      key={idx}
                      className={'scan__dcell' + (isCenter ? ' is-center' : '')}
                      style={{ background: hexFor(color, colorblind) }}
                      title={
                        isCenter
                          ? `Center — always ${FACE_COLOR_NAME[color]}`
                          : FACE_COLOR_NAME[color]
                      }
                    />
                  );
                }
                return (
                  <button
                    key={idx}
                    className={'scan__dcell' + (shaky ? ' is-shaky' : '')}
                    style={{ background: hexFor(color, colorblind) }}
                    onClick={() => cycleSticker(idx, color)}
                    title={`${FACE_COLOR_NAME[color]} — tap to change`}
                    aria-label={`Sticker ${i + 1}: ${FACE_COLOR_NAME[color]}, tap to change`}
                  />
                );
              })}
            </div>

            {shaky.total > 0 && (
              <p className="scan__shaky">
                <strong>{shaky.total}</strong>{' '}
                {shaky.total === 1 ? 'sticker was' : 'stickers were'} a close call, on{' '}
                {shaky.faces.join(', ')}. Pick that face above to see it ringed in amber —
                then tap to correct, or re-scan it in better light.
              </p>
            )}
          </div>

          <div className="glass scan__panel">
            <header className="scan__panelhead">
              <h2 className="scan__h2">Full cube</h2>
              <div className="scan__panelhead-actions">
                <button type="button" className="btn btn-ghost scan__mini" onClick={fillFromScramble}>
                  Sample scramble
                </button>
                <button type="button" className="btn btn-ghost scan__mini" onClick={resetAll}>
                  Reset
                </button>
              </div>
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
                Painting <strong>{FACE_COLOR_NAME[activeColor]}</strong>
              </span>
            </div>

            <div className="scan__net">
              <CubeNet
                state={draft}
                editable
                colorblind={colorblind}
                activeColor={activeColor}
                onPaint={paint}
                size={28}
                highlight={validation.badStickers}
              />
            </div>

            <p className="scan__nethint">
              Tap any non-center sticker to paint it.
              {allCaptured && ' All six faces are in — colors are balanced to nine of each.'}
            </p>
          </div>
        </section>
      </div>

      {/* validation + CTA */}
      <div className="scan__footer">
        <div
          className={
            'glass scan__validate ' +
            (validation.valid ? 'scan__validate--ok' : 'scan__validate--bad')
          }
          role="status"
        >
          {validation.valid ? (
            <span className="scan__validmsg">Looks like a valid, solvable cube ✓</span>
          ) : (
            <div className="scan__errors">
              <strong>
                {allCaptured
                  ? 'Not solvable yet — fix the highlighted issues:'
                  : `Keep scanning (${capturedFaces.length}/6 faces). Current issues:`}
              </strong>
              <ul>
                {validation.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

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
    </div>
  );
}
