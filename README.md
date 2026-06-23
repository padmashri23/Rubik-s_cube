# 🧩 CubeGuide AI — Rubik's Cube Solver

[![Node Version](https://img.shields.io/badge/node->=18-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](#license)

A **beginner-friendly Rubik's Cube coach** that guides anyone to solve a 3×3 cube using their camera, a 3D visualization, and a voice tutor. No cube notation required.

Scan your scrambled cube with your device's camera, and the AI will provide **step-by-step guidance** with plain-language instructions, animated 3D demonstrations, and optional voice coaching. Built for learning, not just solving.

## ✨ Features

- 📷 **Camera Scanner** — Real-time cube detection with HSV color calibration
- 🎯 **Layer-by-Layer Solver** — Beginner-friendly solution algorithm
- 🗣️ **Voice Assistant** — Text-to-speech coaching (Web Speech API)
- 🎨 **3D Visualization** — Interactive 3D cube with Three.js
- ♿ **Accessibility** — Colorblind modes, large text, reduced motion
- 📊 **Progress Dashboard** — Track solve attempts and statistics
- ⚡ **Offline Support** — Frontend works completely offline
- 🔌 **REST API** — Backend available for third-party integrations
- ✅ **Impossible Cube Detection** — Validates scrambles and pinpoints errors

## 🏗️ Project Structure

The project uses a **shared cube engine** architecture: both the web client and API use the same solver, ensuring they always agree on solutions.

```
Cube_Solver/
├── frontend/                    React + TypeScript + Vite web app
│   ├── src/
│   │   ├── core/               ← Shared cube engine (moves, solver, validation)
│   │   │   ├── cube.ts         Cube state representation
│   │   │   ├── moves.ts        All 18 cube moves (U, R, F, D, L, B + modifiers)
│   │   │   ├── solver.ts       Layer-by-layer solving algorithm
│   │   │   ├── notation.ts     Cube notation parser
│   │   │   └── colors.ts       Color definitions
│   │   ├── components/         React components
│   │   │   ├── Cube3D.tsx      Three.js 3D cube renderer
│   │   │   ├── CubeNet.tsx     2D cube net visualization
│   │   │   ├── SettingsButton.tsx
│   │   │   └── ErrorBoundary.tsx
│   │   ├── pages/              Page components
│   │   │   ├── LandingPage.tsx
│   │   │   ├── ScannerPage.tsx
│   │   │   ├── SolvePage.tsx
│   │   │   ├── LearnPage.tsx
│   │   │   └── DashboardPage.tsx
│   │   ├── lib/                Utilities
│   │   │   ├── colorDetect.ts  HSV-based color detection
│   │   │   ├── voice.ts        Web Speech API wrapper
│   │   │   └── steps.ts        Solution step formatting
│   │   ├── state/              Zustand store
│   │   └── styles/             Global CSS
│   └── package.json
│
├── backend/                     Express + TypeScript REST API
│   ├── src/
│   │   ├── index.ts            Server entry point
│   │   ├── engine.ts           Re-exports frontend/src/core
│   │   └── routes/
│   │       ├── health.ts       GET /api/health
│   │       └── solve.ts        POST /api/solve, GET /api/scramble
│   ├── dist/                   Built output (bundled)
│   └── package.json
│
├── package.json                Root orchestrator (npm workspace scripts)
└── .gitignore
```

**Why the engine lives in `frontend/src/core`:**  
It's pure, framework-free TypeScript. The backend imports it directly (bundled by esbuild), ensuring there's never a second copy of the solver to drift out of sync.

## 🚀 Quick Start

### Prerequisites
- **Node.js** ≥ 18 ([Download](https://nodejs.org/))
- **npm** 9+ (comes with Node)

### Installation & Running

```bash
# 1. Clone the repository
git clone https://github.com/padmashri23/Rubik-s_cube.git
cd Cube_Solver

# 2. Install dependencies for both frontend and backend
npm run install:all

# 3. In one terminal, start the frontend (http://localhost:5173)
npm run dev:frontend

# 4. In another terminal, start the backend API (http://localhost:5000)
npm run dev:backend
```

**That's it!** Open [http://localhost:5173](http://localhost:5173) in your browser and start solving.

> **Note:** Camera access requires `localhost` or `HTTPS`. The frontend works **fully offline**; the backend is optional for API integrations.

## 🎮 Usage

### Web Application (Frontend)

The React frontend provides:

1. **Landing Page** — Overview and instructions
2. **Scanner** — Scan your cube with your camera
3. **Solver** — Follow step-by-step guidance
4. **Learn** — Interactive tutorial
5. **Dashboard** — Track your progress

#### Available Commands

```bash
cd frontend

npm run dev              # Dev server with HMR (port 5173)
npm run build           # Type-check + production build
npm run preview         # Preview production build locally
npm test                # Run test suite (Vitest)
npm run typecheck       # TypeScript type-checking only
npm run lint            # ESLint + Prettier
```

#### Tech Stack

- **React 18** — UI framework
- **TypeScript** — Type safety
- **Vite** — Build tool (instant HMR)
- **Three.js** + **react-three-fiber** — 3D rendering
- **Framer Motion** — Animations
- **Zustand** — State management
- **Vitest** — Unit testing

### REST API (Backend)

The Express backend exposes three endpoints:

#### 1. Health Check
```bash
GET /api/health
```
**Response:**
```json
{ "ok": true }
```

#### 2. Generate Random Solvable Cube
```bash
GET /api/scramble?n=22&seed=3
```

**Query Parameters:**
- `n` (optional) — Scramble depth in moves (default: 22)
- `seed` (optional) — Random seed for reproducibility

**Response:**
```json
{
  "state": "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB",
  "moves": ["R", "U", "R'", "U'", ...]
}
```

#### 3. Solve a Cube
```bash
POST /api/solve
Content-Type: application/json

{
  "state": "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"
}
```

**Cube State Format:**  
54 facelets in order **U R F D L B** (row-major), using letters `U R F D L B` as color IDs:
- Positions 0–8: Top face (U)
- Positions 9–17: Right face (R)
- Positions 18–26: Front face (F)
- Positions 27–35: Down face (D)
- Positions 36–44: Left face (L)
- Positions 45–53: Back face (B)

**Success Response (200):**
```json
{
  "ok": true,
  "solution": {
    "moves": ["R", "U", "R'", "U'", ...],
    "phases": [
      {
        "id": "cross",
        "title": "Bottom Cross",
        "goal": "Solve the white cross on the bottom",
        "moves": ["R", "U", "R'", "U'", ...]
      },
      {
        "id": "firstLayerCorners",
        "title": "White Corners",
        ...
      },
      ...
    ]
  }
}
```

**Validation Error Response (422):**
```json
{
  "ok": false,
  "error": "Invalid cube state: multiple center colors",
  "details": {
    "invalidIndices": [9, 18],
    "reason": "Center sticker mismatch"
  }
}
```

#### Backend Commands

```bash
cd backend

npm run dev              # Watch mode + run API (port 5000)
npm run build           # Type-check + bundle to dist/index.js
npm start               # Run bundled server
npm run typecheck       # TypeScript checking only
npm run lint            # ESLint
```

#### Tech Stack

- **Node.js** — Runtime
- **Express** — HTTP framework
- **TypeScript** — Type safety
- **esbuild** — Bundler
- **tsx** — Dev-time TypeScript runner

## 🧠 Solver Algorithm

The solver uses a **beginner-friendly Layer-by-Layer approach**:

1. **Bottom Cross** — Solve white edge pieces
2. **White Corners** — Solve white corner pieces
3. **Middle Layer** — Solve edge pieces between first and last layers
4. **Last Layer Edges** — Orient last-layer edge pieces
5. **Last Layer Corners** — Orient last-layer corner pieces
6. **Last Layer Permutation** — Permute last-layer pieces into final positions

**Algorithm Details:**
- First two layers use **over-generate & verify**: curated algorithms are expanded by symmetry and U-setups, all candidates are simulated, and only solutions that preserve already-solved pieces are used.
- Last layer uses **breadth-first search** over macro moves (Sune, EOLL, T-perm, U-perm, U-turns) that preserve the first two layers.
- Result: **always finds a solution** (not minimal, but correct and beginner-friendly).

## 📋 Testing

### Run Tests
```bash
npm test                    # Frontend tests
npm run test:watch         # Watch mode
```

### Test Coverage

- **Solver tests** — Validates solving algorithm against scrambles
- **Moves tests** — Tests all 18 cube moves
- **Color detection tests** — HSV calibration and detection accuracy

## 🛠️ Development

### Environment Variables

**Frontend** (`.env` or `.env.local`):
```env
VITE_API_URL=http://localhost:5000
```

**Backend** (`.env`):
```env
PORT=5000
NODE_ENV=development
```

### Code Style

- **TypeScript** — Strict mode enabled
- **ESLint** — Airbnb config
- **Prettier** — Auto-formatting
- **No external state dependencies** — Zustand for state management

### Adding a New Endpoint

```typescript
// backend/src/routes/myroute.ts
import express from 'express';

const router = express.Router();

router.get('/my-endpoint', (_req, res) => {
  res.json({ ok: true, data: 'Hello' });
});

export default router;

// Then add to backend/src/index.ts
import myRouter from './routes/myroute';
app.use('/api', myRouter);
```

## 📦 Build & Deployment

### Frontend Build
```bash
cd frontend
npm run build           # Creates dist/ folder
npm run preview        # Test production build
```

**Deploy to:**
- Vercel, Netlify, GitHub Pages (static hosting)
- Any CDN or web server

### Backend Build
```bash
cd backend
npm run build          # Creates dist/index.js (esbuild bundle)
npm start             # Run bundled server
```

**Deploy to:**
- Heroku, Railway, Fly.io (Node.js hosting)
- AWS Lambda (with serverless framework)
- Docker (containerized)

### Docker Support (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm run install:all && npm run build:backend
EXPOSE 5000
CMD ["npm", "--prefix", "backend", "start"]
```

## 🐛 Troubleshooting

### Camera Not Working?
- Ensure you're on `localhost` or `HTTPS`
- Check browser permissions (allow camera access)
- Test with a different camera input device

### Port Already in Use?
```bash
# Kill process on port 5173 (frontend)
npx kill-port 5173

# Kill process on port 5000 (backend)
npx kill-port 5000
```

### Invalid Cube State?
- Ensure exactly 54 stickers
- Use only letters `U R F D L B`
- Check that each face has 9 stickers of the same color

### "TypeError: Cannot read property 'core'" in Backend?
- Ensure `npm run install:all` was run
- Rebuild: `npm run build:backend`

## 🚀 Roadmap

- [ ] Real-time camera move verification
- [ ] AR arrow overlay for next move
- [ ] Multi-language voice support (Spanish, French, German, Japanese)
- [ ] Leaderboard & user accounts
- [ ] Advanced solving modes (speed solving, CFOP)
- [ ] Mobile app (React Native)
- [ ] Multiplayer challenges

**Made with ❤️ for Rubik's Cube enthusiasts and beginners worldwide.**
