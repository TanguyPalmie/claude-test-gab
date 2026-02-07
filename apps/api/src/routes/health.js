import { Router } from 'express';
import { getPool } from '../db/pool.js';

export function createHealthRouter() {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      await getPool().query('SELECT 1');
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'error', message: 'Database unavailable' });
    }
  });

  return router;
}
