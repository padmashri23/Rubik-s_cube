# 🧩 CubeGuide AI

A beginner-friendly **Rubik's Cube coach**. Scan your cube with the camera, then
follow plain-language, turn-by-turn guidance — with a 3D animated cube and a voice
tutor — until it's solved. No cube notation required.

The project is split into two independently deployable apps that share **one cube
engine**, so the web client and the API always agree on what's solvable.

```
Cube_Solver/
├── frontend/        React + TypeScript + Vite web app (the coach UI)
│   └── src/
│       ├── core/        ← the shared cube engine (moves, validation, solver, notation)
│       ├── components/  3D cube, cube net, settings, error boundary
│       ├── pages/       Landing, Scanner, Solve, Learn, Dashboard
│       ├── lib/         color detection, voice (Web Speech), step builder
│       └── state/       zustand store
│
├── backend/         Express + TypeScript REST API
│   └── src/
│       ├── index.ts     server entry
│       ├── engine.ts    re-exports frontend/src/core (single source of truth)
│       └── routes/      health, solve, scramble
│
├── package.json     root orchestrator scripts (no workspaces required)
└── .gitignore
```

> **Why the engine lives in `frontend/src/core`:** it's pure, framework-free
> TypeScript. The backend imports it directly (bundled by esbuild/tsx), so there's
> never a second copy of the solver to drift out of sync.

---

## Quick start

Requires **Node ≥ 18**.

```bash
# from the repo root — install both apps
npm run install:all

# run the web app (http://localhost:5173)
npm run dev:frontend

# in a second terminal, run the API (http://localhost:5000)
npm run dev:backend
```

The frontend works **fully offline** (the solver runs in the browser). The backend
is optional and exposes the same engine over HTTP for other clients.

---

## Frontend

React 18 · TypeScript · Vite · Three.js (react-three-fiber) · framer-motion · zustand.

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server with HMR (port 5173) |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Run the engine + color-detection test suites (Vitest) |
| `npm run typecheck` | Type-check only |

Highlights: camera scanner with HSV + center-calibrated color detection, impossible-cube
validation with pinpointed errors, guided "Grandma Mode" coaching, voice assistant,
gamified progress dashboard, and accessibility options (colorblind palette, large text,
reduced motion).

Camera scanning needs `getUserMedia`, which browsers allow only on `localhost` or HTTPS.

## Backend

Node · Express · TypeScript (bundled with esbuild, dev via tsx).

| Command | Description |
| --- | --- |
| `npm run dev` | Watch + run the API (port 5000) |
| `npm run build` | Type-check + bundle to `dist/index.js` |
| `npm start` | Run the bundled server |

### API

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness probe |
| `GET` | `/api/scramble?n=22&seed=3` | A random **solvable** cube state |
| `POST` | `/api/solve` | Validate + solve a cube |

`POST /api/solve` body:

```json
{ "state": "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB" }
```

`state` is 54 facelets in order **U R F D L B** (row-major), using the letters
`U R F D L B` as color ids. Responds with cube notation **and** plain-language steps
(`text`, `voice`, `arrow`) grouped into solving phases. Invalid cubes return `422`
with human-readable errors and the offending sticker indices.

---

## Tech & roadmap

Built per a beginner-first product vision. The backend is structured to grow:
add `routes/` for auth and user stats, and a thin data layer for PostgreSQL
(see `backend/.env.example`). Planned next: real-time camera move verification,
AR arrow overlay, and multi-language voice.

## License

Private project (unpublished).
