<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:4f8cff,100:22d3ee&height=210&section=header&text=CubeGuide%20AI&fontSize=62&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=Your%20friendly%20AI%20Rubik's%20Cube%20coach&descAlignY=60&descSize=18" width="100%" alt="CubeGuide AI" />

<p>
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=22&duration=3000&pause=800&color=4F8CFF&center=true&vCenter=true&width=620&lines=Scan+your+cube+with+the+camera;Follow+plain-language+steps;No+cube+notation+required;Learn+while+you+solve" alt="Typing tagline" />
</p>

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-0.169-000000?logo=three.js&logoColor=white)](https://threejs.org/)
[![License](https://img.shields.io/badge/License-All%20Rights%20Reserved-lightgrey.svg)](#-license)

<img src="https://skillicons.dev/icons?i=react,ts,threejs,vite,nodejs,express" alt="Tech stack" />

</div>

---

A **beginner-friendly Rubik's Cube coach** that guides anyone to solve a 3×3 cube using their
camera, a 3D visualization, and a voice tutor — **no cube notation required**.

Scan your scrambled cube, and CubeGuide provides **step-by-step guidance** with plain-language
instructions ("turn the right side up"), an animated 3D cube, and optional voice coaching. Built
for *learning*, not just solving.

## ✨ Features

- 📷 **Camera Scanner** — face-by-face capture with **HSV + center-calibrated** color detection
- 🎯 **Layer-by-Layer Solver** — a correct-by-construction beginner solving engine
- 🗣️ **Voice Assistant** — text-to-speech coaching + hands-free commands (Web Speech API)
- 🎨 **3D Visualization** — interactive, animated cube with Three.js / react-three-fiber
- ✅ **Impossible-Cube Detection** — validates scans and **pinpoints the exact bad stickers**
- ♿ **Accessibility** — colorblind palette, large text, reduced motion
- 📊 **Progress Dashboard** — XP, levels, streaks and achievements
- ⚡ **Offline-first** — the solver runs entirely in the browser
- 🔌 **REST API** — the same engine exposed over HTTP for other clients

## 🏗️ Project Structure

Both the web client and the API use **one shared cube engine**, so they always agree on what's
solvable and how to solve it.

```
Cube_Solver/
├── frontend/                    React + TypeScript + Vite web app
│   ├── src/
│   │   ├── core/                ← Shared cube engine (pure, framework-free TS)
│   │   │   ├── moves.ts         Geometric move engine (all 18 moves) + notation parser
│   │   │   ├── cube.ts          Cube state model + solvability validation
│   │   │   ├── solver.ts        Layer-by-layer solving algorithm
│   │   │   ├── notation.ts      Plain-language instruction generator
│   │   │   └── colors.ts        Color scheme + colorblind palette
│   │   ├── components/          Cube3D, CubeNet, SettingsButton, ErrorBoundary
│   │   ├── pages/               Landing, Scanner, Solve, Learn, Dashboard
│   │   ├── lib/                 colorDetect (HSV), voice (Web Speech), steps
│   │   ├── state/               Zustand store
│   │   └── styles/              Global CSS (design system)
│   └── package.json
│
├── backend/                     Express + TypeScript REST API
│   ├── src/
│   │   ├── index.ts             Server entry point
│   │   ├── engine.ts            Re-exports frontend/src/core (single source of truth)
│   │   └── routes/
│   │       ├── health.ts        GET  /api/health
│   │       └── solve.ts         POST /api/solve, GET /api/scramble
│   └── package.json
│
├── package.json                 Root orchestrator scripts (npm --prefix; no workspaces)
├── README.md
└── .gitignore
```

> **Why the engine lives in `frontend/src/core`:** it's pure, framework-free TypeScript. The
> backend imports it directly (bundled by esbuild / run by tsx), so there's never a second copy
> of the solver to drift out of sync.

## 🚀 Quick Start

### Prerequisites
- **Node.js** ≥ 18 ([download](https://nodejs.org/)) · **npm** 9+ (ships with Node)

### Installation & Running

```bash
# 1. Clone
git clone https://github.com/padmashri23/Rubik-s_cube.git
cd Rubik-s_cube

# 2. Install both apps
npm run install:all

# 3. Terminal A — web app  → http://localhost:5173
npm run dev:frontend

# 4. Terminal B — API      → http://localhost:5000   (optional)
npm run dev:backend
```

Open **http://localhost:5173** and start solving.

> 📸 Camera access requires `localhost` or `HTTPS`. The frontend works **fully offline** — the
> backend is optional and only needed for API integrations.

## 🎮 Usage

The web app has five sections: **Landing** (overview) · **Scanner** (capture your cube) ·
**Solve** (turn-by-turn coaching) · **Learn** (lessons) · **Dashboard** (progress).

### Frontend commands (`cd frontend`)

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server with HMR (port 5173) |
| `npm run build` | Type-check (`tsc -b`) + production build |
| `npm run preview` | Preview the production build |
| `npm test` | Run the test suites (Vitest) |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | Type-check only |

**Tech:** React 18 · TypeScript · Vite · Three.js + react-three-fiber · Framer Motion · Zustand · Vitest.

### Backend commands (`cd backend`)

| Command | Description |
| --- | --- |
| `npm run dev` | Watch + run the API (port 5000, via tsx) |
| `npm run build` | Type-check + bundle to `dist/index.js` (esbuild) |
| `npm start` | Run the bundled server |
| `npm run typecheck` | Type-check only |

**Tech:** Node · Express · TypeScript · esbuild · tsx.

## 🔌 REST API

> Base URL: `http://localhost:5000`. All responses are JSON with an `ok` boolean.

<details open>
<summary><b>GET <code>/api/health</code></b> — liveness probe</summary>

```json
{ "ok": true, "service": "cubeguide-backend", "version": "0.1.0", "uptime": 12.34 }
```
</details>

<details>
<summary><b>GET <code>/api/scramble?n=22&seed=3</code></b> — a random <i>solvable</i> cube</summary>

**Query:** `n` = scramble depth (1–40, default 22) · `seed` = optional, for reproducibility.

```json
{
  "ok": true,
  "state": "BBRDURLDLUBBRRLRRRFLUUFUDDDBBBLDFFFFDFRRLFLBUFUUDBUDLL",
  "scramble": ["F2", "B", "R'", "D'", "L", "D2", "U", "F2"],
  "seed": 3
}
```
</details>

<details>
<summary><b>POST <code>/api/solve</code></b> — validate + solve a cube</summary>

**Body:**
```json
{ "state": "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB" }
```

`state` is 54 facelets in order **U R F D L B** (row-major), using the letters `U R F D L B`
as color ids (U=0–8, R=9–17, F=18–26, D=27–35, L=36–44, B=45–53).

**Success (200):**
```json
{
  "ok": true,
  "valid": true,
  "state": "…54 chars…",
  "solution": {
    "moves": ["F'", "R'", "L2", "B", "..."],
    "moveCount": 62,
    "totalSteps": 64,
    "estimateSeconds": 384,
    "difficulty": "Easy",
    "phases": [
      { "id": "cross", "title": "The Daisy & Cross", "goal": "Build a plus-sign on the bottom…", "moves": ["F'", "…"] },
      { "id": "firstLayerCorners", "title": "First Layer Corners", "goal": "Drop the bottom corners into place…", "moves": ["…"] },
      { "id": "middleLayer", "title": "Middle Layer", "goal": "Slot the four side edges…", "moves": ["…"] },
      { "id": "lastLayerEdgesOrient", "title": "Last Layer", "goal": "Orient and permute the final layer…", "moves": ["…"] }
    ],
    "steps": [
      {
        "number": 1, "total": 64, "move": "F'",
        "phaseId": "cross", "phaseTitle": "The Daisy & Cross",
        "reason": "We are making a plus sign on one side…",
        "text": "Turn the FRONT side (Green) counter-clockwise — a quarter turn (90°).",
        "voice": "Find the green side, that's the front. Turn it counter-clockwise.",
        "face": "F", "faceName": "FRONT", "arrow": "rotate"
      }
    ]
  }
}
```

**Invalid cube (422):**
```json
{
  "ok": false,
  "valid": false,
  "errors": ["The Up-Right-Front corner can't exist: Green, Red, Orange — Red and Orange are opposite colors and can't touch."],
  "badStickers": [8, 11, 20]
}
```

**Malformed body (400):**
```json
{ "ok": false, "error": "Body must include `state` as a 54-character string or a 54-length array." }
```
</details>

## 🧠 Solver Algorithm

A **beginner-friendly Layer-by-Layer (LBL)** method:

1. **Cross** — build the bottom cross (edges aligned to centers)
2. **First-layer corners** — finish the entire first layer
3. **Middle layer** — slot the four belt edges
4. **Last layer** — orient and permute the final layer until solved

**How it works:**
- The first two layers use an **over-generate & verify** engine: curated trigger algorithms are
  expanded by cube symmetry and U-setups, every candidate is simulated, and only one that places
  the target piece *while preserving everything already solved* is committed.
- The last layer is solved by a **breadth-first search** over last-layer macros (Sune, EOLL,
  T-perm, U-perm, U-turns), all of which preserve the first two layers.
- Result: **always finds a correct solution** (not minimal, but reliable and beginner-friendly).

The API groups these into the four `phases` shown above; the web app expands each phase into
single-turn coaching steps.

## 🧪 Testing

```bash
cd frontend
npm test            # run once
npm run test:watch  # watch mode
```

- **Move-engine tests** — every move's order/inverse identities (e.g. `X X X X = identity`, sexy-move × 6)
- **Solver tests** — solves 60 random scrambles end-to-end and verifies each is fully solved
- **Color-detection tests** — recovers cubes from simulated noisy/lit camera samples

## 🛠️ Development

### Environment variables

**Frontend** (`frontend/.env`):
```env
VITE_API_URL=http://localhost:5000
```

**Backend** (`backend/.env`):
```env
PORT=5000
# Future: DATABASE_URL=postgresql://user:pass@localhost:5432/cubeguide
```

Each app ships an `.env.example`. **Code quality** is enforced by **strict TypeScript** across
both apps (`npm run typecheck`). *(ESLint flat-config and Prettier are not yet wired up.)*

### Adding a backend endpoint

```typescript
// backend/src/routes/myroute.ts
import { Router } from 'express';
const router = Router();
router.get('/my-endpoint', (_req, res) => res.json({ ok: true }));
export default router;

// backend/src/index.ts
import myRouter from './routes/myroute';
app.use('/api', myRouter);
```

## 📦 Build & Deployment

```bash
npm run build            # builds BOTH apps (from repo root)
npm run build:frontend   # frontend only → frontend/dist/  (static)
npm run build:backend    # backend only  → backend/dist/index.js
```

- **Frontend** → Vercel, Netlify, GitHub Pages, or any static host / CDN.
- **Backend** → Railway, Fly.io, Render, a Node host, or a container.

## 🐛 Troubleshooting

| Problem | Fix |
| --- | --- |
| Camera not working | Use `localhost` / `HTTPS`; allow camera permission in the browser |
| "Not solvable yet" on a real cube | A face was likely scanned rotated — re-check the red-ringed stickers |
| Port already in use | `npx kill-port 5173` (frontend) or `npx kill-port 5000` (backend) |
| Backend can't find the engine | Keep the `frontend/` folder present (the API imports `frontend/src/core`) and run `npm run install:all` |

## 🗺️ Roadmap

- [ ] Real-time camera **move verification** (confirm each turn)
- [ ] AR arrow overlay for the next move
- [ ] Multi-language voice (Tamil, Hindi, Spanish, French, Japanese)
- [ ] User accounts, persistence (PostgreSQL) & leaderboards
- [ ] Challenge / speed-solving modes

## 📝 License

This project is currently **private and unpublished — all rights reserved**. (Open to switching
to MIT later; if so, a `LICENSE` file will be added.)

## 📧 Contact

**Maintainer:** Padmashri · **GitHub:** [@padmashri23](https://github.com/padmashri23)

<div align="center">

---

**Made with ❤️ for Rubik's Cube beginners everywhere.**

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:22d3ee,100:4f8cff&height=120&section=footer" width="100%" alt="" />

</div>
