import 'dotenv/config';
import http from 'http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { initDb, getPool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { loadQuestions, questionStats } from './questions/loader.js';
import { createSocketServer } from './socket/index.js';
import { createRoomRouter } from './routes/rooms.js';
import { createUploadRouter } from './routes/uploads.js';
import { createHealthRouter } from './routes/health.js';
import { createQuestionsRouter } from './routes/questions.js';
import { cleanupInactivePlayers } from './utils/cleanup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);

// ── Security middleware ──────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// ── Static uploads ───────────────────────────────────────
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(uploadsDir));

// ── Boot sequence ────────────────────────────────────────
async function boot() {
  // 1. Database
  await initDb();
  await runMigrations();
  console.log('[boot] Database ready');

  // 2. Questions
  const questionsDir = process.env.QUESTIONS_DIR || path.join(__dirname, '..', 'questions');
  const questions = loadQuestions(questionsDir);
  console.log(`[boot] Loaded ${questions.length} questions from ${questionsDir}`);

  // 3. Socket.IO
  const io = createSocketServer(server, questions);

  // 4. REST routes
  const availableCategories = Object.keys(questionStats(questions));
  console.log(`[boot] Categories: ${availableCategories.join(', ')}`);
  app.use('/api/rooms', createRoomRouter(questions, availableCategories));
  app.use('/api/uploads', createUploadRouter(uploadsDir));
  app.use('/api/health', createHealthRouter());
  app.use('/api/questions', createQuestionsRouter(questions));

  // 5. Player cleanup interval
  const cleanupMinutes = parseInt(process.env.PLAYER_CLEANUP_MINUTES || '30', 10);
  if (cleanupMinutes > 0) {
    setInterval(() => cleanupInactivePlayers(cleanupMinutes), 60_000);
    console.log(`[boot] Player cleanup: every 1min, threshold ${cleanupMinutes}min`);
  }

  // 6. Start server
  const port = parseInt(process.env.API_PORT || '4000', 10);
  server.listen(port, '0.0.0.0', () => {
    console.log(`[boot] Server listening on :${port}`);
  });
}

boot().catch((err) => {
  console.error('[boot] Fatal error:', err);
  process.exit(1);
});
