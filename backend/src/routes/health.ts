/** Health/readiness route — useful for uptime checks and deploy probes. */

import { Router, type Request, type Response } from 'express';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: 'cubeguide-backend',
    version: '0.1.0',
    uptime: process.uptime(),
  });
});

export default router;
