import { Router } from 'express';
import { questionStats } from '../questions/loader.js';

export function createQuestionsRouter(questions) {
  const router = Router();

  // GET /api/questions/stats — dev only
  router.get('/stats', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({
      total: questions.length,
      byCategory: questionStats(questions),
    });
  });

  return router;
}
