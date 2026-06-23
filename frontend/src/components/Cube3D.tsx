/**
 * Cube3D — a premium-looking 3D Rubik's cube rendered with React Three Fiber.
 *
 * Stickers are placed directly from the core geometric model (FACELETS), so a
 * facelet array from the solver maps 1:1 onto the 3D cube with no extra tables.
 * Passing `activeMove` animates that single turn and fires `onMoveDone` when the
 * 90°/180° rotation completes — the parent then commits the post-move state.
 */

import { useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, RoundedBox, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { FACELETS, type Face, type MoveName, type Vec3 } from '../core/moves';
import { hexFor, type ColorId } from '../core/colors';

const GAP = 1.06; // spacing between cubie centers
const STICKER = 0.86;
const OFFSET = 0.5 * GAP + 0.001;

// Per-face axis/value that defines a turning layer (matches core LAYER).
const FACE_AXIS: Record<Face, { axis: 0 | 1 | 2; val: number; normal: Vec3 }> = {
  U: { axis: 1, val: 1, normal: [0, 1, 0] },
  D: { axis: 1, val: -1, normal: [0, -1, 0] },
  R: { axis: 0, val: 1, normal: [1, 0, 0] },
  L: { axis: 0, val: -1, normal: [-1, 0, 0] },
  F: { axis: 2, val: 1, normal: [0, 0, 1] },
  B: { axis: 2, val: -1, normal: [0, 0, -1] },
};

// Rotation (Euler) that turns a +z plane to face each outward normal.
function stickerRotation(n: Vec3): [number, number, number] {
  if (n[1] === 1) return [-Math.PI / 2, 0, 0]; // U
  if (n[1] === -1) return [Math.PI / 2, 0, 0]; // D
  if (n[0] === 1) return [0, Math.PI / 2, 0]; // R
  if (n[0] === -1) return [0, -Math.PI / 2, 0]; // L
  if (n[2] === -1) return [0, Math.PI, 0]; // B
  return [0, 0, 0]; // F
}

interface Sticker {
  index: number;
  pos: [number, number, number];
  rot: [number, number, number];
  c: Vec3;
}

const STICKERS: Sticker[] = FACELETS.map((f, index) => {
  const c = f.c;
  const n = f.n;
  return {
    index,
    c,
    pos: [
      c[0] * GAP + n[0] * OFFSET,
      c[1] * GAP + n[1] * OFFSET,
      c[2] * GAP + n[2] * OFFSET,
    ],
    rot: stickerRotation(n),
  };
});

// The 26 visible cubie cores.
const CUBIES: [number, number, number][] = [];
for (let x = -1; x <= 1; x++)
  for (let y = -1; y <= 1; y++)
    for (let z = -1; z <= 1; z++)
      if (x || y || z) CUBIES.push([x * GAP, y * GAP, z * GAP]);

function parseMove(move: MoveName): { face: Face; angle: number } {
  const face = move[0] as Face;
  // Clockwise-from-outside quarter turn = -90° (right-hand) about outward normal.
  const base = -Math.PI / 2;
  if (move.endsWith('2')) return { face, angle: base * 2 };
  if (move.endsWith("'")) return { face, angle: -base };
  return { face, angle: base };
}

interface SceneProps {
  state: string[];
  activeMove: MoveName | null;
  onMoveDone?: () => void;
  colorblind: boolean;
  highlightFace?: Face | null;
  reducedMotion: boolean;
}

function CubeScene({
  state,
  activeMove,
  onMoveDone,
  colorblind,
  highlightFace,
  reducedMotion,
}: SceneProps) {
  const movingRef = useRef<THREE.Group>(null);
  const progress = useRef(0);
  const done = useRef(false);

  const move = activeMove ? parseMove(activeMove) : null;

  // Which facelet/cubie belongs to the turning layer this move.
  const inLayer = useMemo(() => {
    if (!move) return () => false;
    const { axis, val } = FACE_AXIS[move.face];
    return (c: Vec3) => c[axis] === val;
  }, [move]);

  useEffect(() => {
    progress.current = 0;
    done.current = false;
    if (movingRef.current) movingRef.current.rotation.set(0, 0, 0);
  }, [activeMove]);

  useFrame((_, delta) => {
    if (!move || !movingRef.current || done.current) return;
    progress.current = Math.min(1, progress.current + delta * (reducedMotion ? 100 : 3.2));
    const { axis, val } = FACE_AXIS[move.face];
    // angle is defined about the outward normal; convert to the +world axis.
    const a = move.angle * val * easeInOut(progress.current);
    movingRef.current.rotation.set(
      axis === 0 ? a : 0,
      axis === 1 ? a : 0,
      axis === 2 ? a : 0,
    );
    if (progress.current >= 1) {
      done.current = true;
      onMoveDone?.();
    }
  });

  const stickerColor = (i: number): string => hexFor(state[i] as ColorId, colorblind);

  const renderSticker = (s: Sticker) => {
    const dimmed =
      highlightFace && !FACE_AXIS_MATCH(highlightFace, s.c) ? 0.35 : 1;
    return (
      <mesh key={s.index} position={s.pos} rotation={s.rot}>
        <planeGeometry args={[STICKER, STICKER]} />
        <meshStandardMaterial
          color={stickerColor(s.index)}
          roughness={0.35}
          metalness={0.1}
          transparent
          opacity={dimmed}
          emissive={stickerColor(s.index)}
          emissiveIntensity={highlightFace && dimmed === 1 ? 0.25 : 0}
        />
      </mesh>
    );
  };

  const renderCubie = (p: [number, number, number], key: number) => (
    <RoundedBox
      key={`c${key}`}
      args={[GAP * 0.98, GAP * 0.98, GAP * 0.98]}
      radius={0.08}
      smoothness={3}
      position={p}
    >
      <meshStandardMaterial color="#0b0e1a" roughness={0.6} metalness={0.2} />
    </RoundedBox>
  );

  const movingCubies: number[] = [];
  const staticCubies: number[] = [];
  CUBIES.forEach((p, i) => {
    const c: Vec3 = [Math.round(p[0] / GAP), Math.round(p[1] / GAP), Math.round(p[2] / GAP)];
    (inLayer(c) ? movingCubies : staticCubies).push(i);
  });

  return (
    <group>
      {/* static parts */}
      {staticCubies.map((i) => renderCubie(CUBIES[i], i))}
      {STICKERS.filter((s) => !inLayer(s.c)).map(renderSticker)}

      {/* moving layer */}
      <group ref={movingRef}>
        {movingCubies.map((i) => renderCubie(CUBIES[i], i))}
        {STICKERS.filter((s) => inLayer(s.c)).map(renderSticker)}
      </group>
    </group>
  );
}

function FACE_AXIS_MATCH(face: Face, c: Vec3): boolean {
  const { axis, val } = FACE_AXIS[face];
  return c[axis] === val;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export interface Cube3DProps {
  state: string[];
  activeMove?: MoveName | null;
  onMoveDone?: () => void;
  colorblind?: boolean;
  highlightFace?: Face | null;
  reducedMotion?: boolean;
  /** auto-rotate when idle (e.g. on the landing hero) */
  autoSpin?: boolean;
  height?: number | string;
}

export default function Cube3D({
  state,
  activeMove = null,
  onMoveDone,
  colorblind = false,
  highlightFace = null,
  reducedMotion = false,
  autoSpin = false,
  height = '100%',
}: Cube3DProps) {
  return (
    <div style={{ width: '100%', height }}>
      <Canvas camera={{ position: [4.2, 3.8, 5.2], fov: 38 }} dpr={[1, 2]}>
        <color attach="background" args={['#05060f']} />
        <ambientLight intensity={0.65} />
        <directionalLight position={[5, 8, 6]} intensity={1.1} />
        <directionalLight position={[-6, -3, -5]} intensity={0.35} />
        <CubeScene
          state={state}
          activeMove={activeMove}
          onMoveDone={onMoveDone}
          colorblind={colorblind}
          highlightFace={highlightFace}
          reducedMotion={reducedMotion}
        />
        <Environment preset="city" />
        <OrbitControls
          enablePan={false}
          minDistance={5}
          maxDistance={12}
          autoRotate={autoSpin && !reducedMotion}
          autoRotateSpeed={1.1}
        />
      </Canvas>
    </div>
  );
}
