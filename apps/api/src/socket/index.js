import { Server } from 'socket.io';
import { query } from '../db/pool.js';
import {
  pickQuestion,
  assignSecretNumbers,
  computeErrors,
  getNextCaptain,
  buildRoomState,
} from './gameEngine.js';
import { validateNickname, validateRoomCode } from '../utils/validation.js';

export function createSocketServer(httpServer, allQuestions) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      credentials: true,
    },
    pingTimeout: 20_000,
    pingInterval: 10_000,
  });

  io.on('connection', (socket) => {
    console.log(`[ws] Connected: ${socket.id}`);

    // ── JOIN ROOM ─────────────────────────────────────────
    socket.on('join_room', async ({ code, clientId, nickname, avatarUrl }, ack) => {
      try {
        const codeUpper = (code || '').toUpperCase();
        const codeErr = validateRoomCode(codeUpper);
        if (codeErr) return ack?.({ error: codeErr });

        const nickErr = validateNickname(nickname);
        if (nickErr) return ack?.({ error: nickErr });

        // Find room
        const { rows: roomRows } = await query(
          `SELECT * FROM rooms WHERE code = $1 AND status != 'finished'`,
          [codeUpper]
        );
        if (roomRows.length === 0) {
          return ack?.({ error: 'Room not found' });
        }
        const room = roomRows[0];

        // Check if this client already exists in the room (reconnection)
        let player;
        const { rows: existingPlayers } = await query(
          `SELECT * FROM players WHERE room_id = $1 AND client_id = $2`,
          [room.id, clientId]
        );

        if (existingPlayers.length > 0) {
          player = existingPlayers[0];
          await query(
            `UPDATE players SET is_connected = true, last_seen_at = NOW(),
             nickname = $1, avatar_url = $2 WHERE id = $3`,
            [nickname.trim(), avatarUrl || null, player.id]
          );
          player.nickname = nickname.trim();
          player.avatar_url = avatarUrl || null;
          console.log(`[ws] Reconnected: ${player.nickname} (${player.id})`);
        } else {
          if (room.status === 'in_game') {
            return ack?.({ error: 'Game already in progress' });
          }
          const { rows: newPlayers } = await query(
            `INSERT INTO players (room_id, nickname, avatar_url, client_id)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [room.id, nickname.trim(), avatarUrl || null, clientId]
          );
          player = newPlayers[0];

          if (!room.host_id) {
            await query(`UPDATE rooms SET host_id = $1 WHERE id = $2`, [
              player.id,
              room.id,
            ]);
          }
          console.log(`[ws] Joined: ${player.nickname} (${player.id})`);
        }

        // Store player info on socket for later lookups
        socket.data.playerId = player.id;
        socket.data.roomId = room.id;
        socket.data.roomCode = codeUpper;
        socket.join(codeUpper);

        // Send full state to joining player
        const state = await buildRoomState(room.id);
        socket.emit('room_state', state);

        // Notify others
        socket.to(codeUpper).emit('player_reconnected', {
          playerId: player.id,
          nickname: player.nickname,
          avatarUrl: player.avatar_url,
        });

        await emitPlayerList(io, codeUpper, room.id);
        ack?.({ ok: true, playerId: player.id });
      } catch (err) {
        console.error('[ws] join_room error:', err);
        ack?.({ error: 'Server error' });
      }
    });

    // ── START GAME ────────────────────────────────────────
    socket.on('start_game', async (_, ack) => {
      try {
        const { playerId, roomId, roomCode } = socket.data;
        if (!roomId) return ack?.({ error: 'Not in a room' });

        const { rows: roomRows } = await query(
          `SELECT * FROM rooms WHERE id = $1`, [roomId]
        );
        const room = roomRows[0];
        if (!room || room.host_id !== playerId) {
          return ack?.({ error: 'Only the host can start the game' });
        }
        if (room.status !== 'lobby') {
          return ack?.({ error: 'Game already started' });
        }

        const { rows: players } = await query(
          `SELECT * FROM players WHERE room_id = $1 AND is_connected = true
           ORDER BY created_at ASC`, [roomId]
        );
        if (players.length < 2) {
          return ack?.({ error: 'Need at least 2 players' });
        }

        await query(
          `UPDATE rooms SET status = 'in_game', round_index = 0 WHERE id = $1`,
          [roomId]
        );

        ack?.({ ok: true });
        await startNewRound(io, roomId, roomCode, 0, allQuestions);
      } catch (err) {
        console.error('[ws] start_game error:', err);
        ack?.({ error: 'Server error' });
      }
    });

    // ── SUBMIT ANSWER ─────────────────────────────────────
    socket.on('submit_answer', async ({ text }, ack) => {
      try {
        const { playerId, roomId, roomCode } = socket.data;
        if (!roomId) return ack?.({ error: 'Not in a room' });

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
          return ack?.({ error: 'Answer cannot be empty' });
        }
        if (text.trim().length > 200) {
          return ack?.({ error: 'Answer too long (max 200 chars)' });
        }

        const { rows: roundRows } = await query(
          `SELECT * FROM rounds WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [roomId]
        );
        if (roundRows.length === 0) return ack?.({ error: 'No active round' });
        const round = roundRows[0];

        if (round.state !== 'collecting') {
          return ack?.({ error: 'Not accepting answers right now' });
        }
        if (round.captain_player_id === playerId) {
          return ack?.({ error: 'Captain does not answer' });
        }

        // Update the pre-inserted answer row
        const result = await query(
          `UPDATE answers SET text = $1 WHERE round_id = $2 AND player_id = $3`,
          [text.trim(), round.id, playerId]
        );
        if (result.rowCount === 0) {
          return ack?.({ error: 'You are not part of this round' });
        }

        ack?.({ ok: true });

        // Check if all non-captain connected players have answered
        const { rows: pending } = await query(
          `SELECT a.player_id FROM answers a
           JOIN players p ON a.player_id = p.id
           WHERE a.round_id = $1 AND p.is_connected = true
             AND (a.text IS NULL OR a.text = '')`,
          [round.id]
        );

        if (pending.length === 0) {
          await query(
            `UPDATE rounds SET state = 'ordering' WHERE id = $1`,
            [round.id]
          );

          const { rows: answerRows } = await query(
            `SELECT a.player_id, a.text, p.nickname
             FROM answers a JOIN players p ON a.player_id = p.id
             WHERE a.round_id = $1 ORDER BY RANDOM()`,
            [round.id]
          );

          io.to(roomCode).emit('all_answers_collected', {
            roundId: round.id,
            answers: answerRows.map((a) => ({
              playerId: a.player_id,
              nickname: a.nickname,
              text: a.text,
            })),
          });
        }
      } catch (err) {
        console.error('[ws] submit_answer error:', err);
        ack?.({ error: 'Server error' });
      }
    });

    // ── SUBMIT ORDERING (Captain) ─────────────────────────
    socket.on('submit_ordering', async ({ orderedPlayerIds }, ack) => {
      try {
        const { playerId, roomId, roomCode } = socket.data;
        if (!roomId) return ack?.({ error: 'Not in a room' });

        const { rows: roundRows } = await query(
          `SELECT * FROM rounds WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [roomId]
        );
        if (roundRows.length === 0) return ack?.({ error: 'No active round' });
        const round = roundRows[0];

        if (round.captain_player_id !== playerId) {
          return ack?.({ error: 'Only the captain can submit ordering' });
        }
        if (round.state !== 'ordering') {
          return ack?.({ error: 'Not in ordering phase' });
        }
        if (!Array.isArray(orderedPlayerIds) || orderedPlayerIds.length === 0) {
          return ack?.({ error: 'Invalid ordering' });
        }

        // Get actual assignments
        const { rows: answerRows } = await query(
          `SELECT player_id, secret_number FROM answers WHERE round_id = $1`,
          [round.id]
        );
        const assignments = {};
        for (const a of answerRows) {
          assignments[a.player_id] = a.secret_number;
        }

        const { errorCount, details, correctOrder } = computeErrors(
          orderedPlayerIds,
          assignments
        );

        // Save ordering
        await query(
          `INSERT INTO orderings (round_id, ordered_player_ids, error_count)
           VALUES ($1, $2, $3)
           ON CONFLICT (round_id) DO UPDATE SET
             ordered_player_ids = $2, error_count = $3`,
          [round.id, orderedPlayerIds, errorCount]
        );

        // Update lives
        const { rows: roomRows } = await query(
          `UPDATE rooms SET lives = GREATEST(0, lives - $1) WHERE id = $2 RETURNING lives`,
          [errorCount, roomId]
        );
        const newLives = roomRows[0].lives;

        // Move round to reveal
        await query(
          `UPDATE rounds SET state = 'reveal' WHERE id = $1`,
          [round.id]
        );

        ack?.({ ok: true });

        // Get full answers for reveal
        const { rows: fullAnswers } = await query(
          `SELECT a.player_id, a.secret_number, a.text, p.nickname
           FROM answers a JOIN players p ON a.player_id = p.id
           WHERE a.round_id = $1`,
          [round.id]
        );

        io.to(roomCode).emit('reveal_results', {
          roundId: round.id,
          captainOrder: orderedPlayerIds,
          correctOrder,
          errorCount,
          details,
          answers: fullAnswers.map((a) => ({
            playerId: a.player_id,
            nickname: a.nickname,
            secretNumber: a.secret_number,
            text: a.text,
          })),
          lives: newLives,
        });

        io.to(roomCode).emit('lives_update', { lives: newLives });

        // Game over check
        if (newLives <= 0) {
          await query(
            `UPDATE rooms SET status = 'finished' WHERE id = $1`, [roomId]
          );
          await query(
            `UPDATE rounds SET state = 'done' WHERE id = $1`, [round.id]
          );
          const { rows: rd } = await query(
            `SELECT round_index FROM rooms WHERE id = $1`, [roomId]
          );
          io.to(roomCode).emit('game_finished', {
            reason: 'no_lives',
            roundsPlayed: rd[0].round_index + 1,
            finalLives: 0,
          });
        }
      } catch (err) {
        console.error('[ws] submit_ordering error:', err);
        ack?.({ error: 'Server error' });
      }
    });

    // ── NEXT ROUND ────────────────────────────────────────
    socket.on('next_round', async (_, ack) => {
      try {
        const { playerId, roomId, roomCode } = socket.data;
        if (!roomId) return ack?.({ error: 'Not in a room' });

        const { rows: roomRows } = await query(
          `SELECT * FROM rooms WHERE id = $1`, [roomId]
        );
        const room = roomRows[0];
        if (!room || room.host_id !== playerId) {
          return ack?.({ error: 'Only the host can advance rounds' });
        }
        if (room.status !== 'in_game') {
          return ack?.({ error: 'Game is not in progress' });
        }

        await query(
          `UPDATE rounds SET state = 'done'
           WHERE room_id = $1 AND state IN ('reveal','ordering')`, [roomId]
        );

        const newRoundIndex = room.round_index + 1;
        await query(
          `UPDATE rooms SET round_index = $1 WHERE id = $2`,
          [newRoundIndex, roomId]
        );

        ack?.({ ok: true });
        await startNewRound(io, roomId, roomCode, newRoundIndex, allQuestions);
      } catch (err) {
        console.error('[ws] next_round error:', err);
        ack?.({ error: 'Server error' });
      }
    });

    // ── DISCONNECT ────────────────────────────────────────
    socket.on('disconnect', async () => {
      const { playerId, roomId, roomCode } = socket.data;
      if (!playerId) return;

      try {
        await query(
          `UPDATE players SET is_connected = false, last_seen_at = NOW()
           WHERE id = $1`, [playerId]
        );

        console.log(`[ws] Disconnected: ${playerId}`);
        io.to(roomCode).emit('player_disconnected', { playerId });
        await emitPlayerList(io, roomCode, roomId);
      } catch (err) {
        console.error('[ws] disconnect error:', err);
      }
    });
  });

  return io;
}

// ── Helpers ─────────────────────────────────────────────────

async function emitPlayerList(io, roomCode, roomId) {
  const { rows } = await query(
    `SELECT id, nickname, avatar_url, client_id, is_connected
     FROM players WHERE room_id = $1 ORDER BY created_at ASC`, [roomId]
  );
  const { rows: roomRows } = await query(
    `SELECT host_id FROM rooms WHERE id = $1`, [roomId]
  );

  io.to(roomCode).emit('player_list_update', {
    players: rows.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatarUrl: p.avatar_url,
      clientId: p.client_id,
      isConnected: p.is_connected,
    })),
    hostId: roomRows[0]?.host_id,
  });
}

async function startNewRound(io, roomId, roomCode, roundIndex, allQuestions) {
  const question = await pickQuestion(roomId, allQuestions);
  if (!question) {
    await query(`UPDATE rooms SET status = 'finished' WHERE id = $1`, [roomId]);
    const { rows } = await query(`SELECT lives FROM rooms WHERE id = $1`, [roomId]);
    io.to(roomCode).emit('game_finished', {
      reason: 'no_questions',
      roundsPlayed: roundIndex,
      finalLives: rows[0]?.lives ?? 0,
    });
    return;
  }

  const { rows: players } = await query(
    `SELECT * FROM players WHERE room_id = $1 AND is_connected = true
     ORDER BY created_at ASC`, [roomId]
  );

  if (players.length < 2) {
    io.to(roomCode).emit('game_finished', {
      reason: 'not_enough_players',
      roundsPlayed: roundIndex,
      finalLives: 0,
    });
    return;
  }

  const captain = getNextCaptain(players, roundIndex);

  const { rows: roundRows } = await query(
    `INSERT INTO rounds (room_id, captain_player_id, question_id, question_text, category)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [roomId, captain.id, question.id, question.text, question.category]
  );
  const round = roundRows[0];

  // Assign secret numbers to non-captain players
  const nonCaptain = players.filter((p) => p.id !== captain.id);
  const assignments = assignSecretNumbers(nonCaptain.map((p) => p.id));

  // Pre-insert answer rows with secret numbers (text empty until player submits)
  for (const [pid, num] of Object.entries(assignments)) {
    await query(
      `INSERT INTO answers (round_id, player_id, secret_number, text)
       VALUES ($1, $2, $3, '') ON CONFLICT DO NOTHING`,
      [round.id, pid, num]
    );
  }

  // Broadcast new round to everyone
  io.to(roomCode).emit('new_round', {
    roundId: round.id,
    roundIndex,
    captainPlayerId: captain.id,
    captainNickname: captain.nickname,
    questionText: question.text,
    category: question.category,
    state: 'collecting',
    playerCount: nonCaptain.length,
  });

  // Send secret numbers individually to each player's socket(s)
  const allSockets = await io.in(roomCode).fetchSockets();
  for (const s of allSockets) {
    const pid = s.data.playerId;
    if (pid && assignments[pid] !== undefined) {
      s.emit('your_secret_number', {
        roundId: round.id,
        secretNumber: assignments[pid],
      });
    }
  }
}
