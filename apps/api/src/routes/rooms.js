import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../db/pool.js';
import { generateRoomCode } from '../utils/roomCode.js';
import { validateNickname, validateRoomCode } from '../utils/validation.js';
import { createBruteForceMiddleware } from '../middleware/bruteForce.js';

export function createRoomRouter(questions) {
  const router = Router();

  // Rate limit: create room
  const createRoomLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_CREATE_ROOM_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_CREATE_ROOM_MAX || '5', 10),
    message: { error: 'Too many rooms created. Please wait.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Rate limit: join room
  const joinRoomLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_JOIN_ROOM_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_JOIN_ROOM_MAX || '10', 10),
    message: { error: 'Too many join attempts. Please wait.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const bruteForce = createBruteForceMiddleware();

  // POST /api/rooms — Create a new room
  router.post('/', createRoomLimiter, async (req, res) => {
    try {
      const code = await generateRoomCode();
      const { rows } = await query(
        `INSERT INTO rooms (code) VALUES ($1) RETURNING id, code, status, lives, round_index, created_at`,
        [code]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error('[api] create room error:', err);
      res.status(500).json({ error: 'Failed to create room' });
    }
  });

  // POST /api/rooms/:code/join — Join validation (REST check before WS join)
  router.post('/:code/join', joinRoomLimiter, bruteForce, async (req, res) => {
    try {
      const code = req.params.code.toUpperCase();
      const codeErr = validateRoomCode(code);
      if (codeErr) return res.status(400).json({ error: codeErr });

      const { rows } = await query(
        `SELECT id, code, status FROM rooms WHERE code = $1 AND status != 'finished'`,
        [code]
      );

      if (rows.length === 0) {
        // Neutral error message to not reveal if code exists
        return res.status(404).json({ error: 'Unable to join room' });
      }

      const room = rows[0];

      // For reconnecting clients, allow joining in_game rooms
      const { clientId } = req.body || {};
      if (room.status === 'in_game' && clientId) {
        const { rows: existing } = await query(
          `SELECT id FROM players WHERE room_id = $1 AND client_id = $2`,
          [room.id, clientId]
        );
        if (existing.length > 0) {
          return res.json({ ok: true, roomId: room.id, code: room.code, reconnect: true });
        }
      }

      if (room.status === 'in_game') {
        return res.status(403).json({ error: 'Unable to join room' });
      }

      res.json({ ok: true, roomId: room.id, code: room.code });
    } catch (err) {
      console.error('[api] join room error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}
