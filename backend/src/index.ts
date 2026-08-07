/**
 * CubeGuide AI — backend entry point.
 *
 * A small, focused Express API:
 *   GET  /api/health          liveness probe
 *   GET  /api/scramble        a random solvable cube (for demos/testing)
 *   POST /api/solve           validate + solve a cube, with plain-language steps
 *
 * It reuses the shared cube engine (see src/engine.ts) so the server and the web
 * client always agree on what is solvable and how to solve it. The structure is
 * ready to grow: add routes/ for auth, user stats, leaderboards, etc., and wire
 * a database (e.g. PostgreSQL) behind a thin data layer.
 */
import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health';
import solveRouter from './routes/solve';
const app = express();
const PORT = Number(process.env.PORT) || 5000;
app.use(cors());
app.use(express.json({ limit: '64kb' }));
// Simple request log (swap for pino/morgan in production).
app.use((req, _res, next) => {
  // eslint-disable-next-line no-console
  console.log(`${req.method} ${req.url}`);
  next();
});

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    name: 'CubeGuide AI API',
    endpoints: ['GET /api/health', 'GET /api/scramble?n=22', 'POST /api/solve'],
  });
});
app.use('/api', healthRouter);
app.use('/api', solveRouter);
// 404 + error handlers.
app.use((_req, res) => res.status(404).json({ ok: false, error: 'Not found' }));
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  },
);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`CubeGuide backend listening on http://localhost:${PORT}`);
});
