import { query } from '../db/pool.js';

/**
 * Pick a random question that hasn't been used in this room.
 * If all questions are exhausted, reset usage and re-pick.
 * Returns: { id, text, category } or null if no questions at all.
 */
export async function pickQuestion(roomId, allQuestions) {
  if (allQuestions.length === 0) return null;

  // Get used question IDs for this room
  const { rows: usedRows } = await query(
    `SELECT question_id FROM room_questions WHERE room_id = $1`,
    [roomId]
  );
  const usedIds = new Set(usedRows.map((r) => r.question_id));

  // Filter available questions
  let available = allQuestions.filter((q) => !usedIds.has(q.id));

  // If all used, reset and reshuffle
  if (available.length === 0) {
    await query(`DELETE FROM room_questions WHERE room_id = $1`, [roomId]);
    available = [...allQuestions];
    console.log(`[game] Room ${roomId}: all questions used, reshuffled`);
  }

  // Pick random
  const chosen = available[Math.floor(Math.random() * available.length)];

  // Record usage
  await query(
    `INSERT INTO room_questions (room_id, question_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [roomId, chosen.id]
  );

  return chosen;
}

/**
 * Assign distinct secret numbers (1–N) to players, shuffled randomly.
 * N = number of players (capped at 10 for the game).
 */
export function assignSecretNumbers(playerIds) {
  const n = Math.min(playerIds.length, 10);
  const numbers = Array.from({ length: n }, (_, i) => i + 1);

  // Fisher-Yates shuffle
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }

  const assignments = {};
  for (let i = 0; i < playerIds.length; i++) {
    assignments[playerIds[i]] = numbers[i % n];
  }
  return assignments;
}

/**
 * Compute errors between captain's ordering and the real ordering.
 * captainOrder: array of player IDs in captain's guessed order (1→N)
 * assignments: { playerId: secretNumber }
 *
 * Returns: { errorCount, details[] }
 * An error occurs at each position where the captain's ordering doesn't match
 * the correct ascending order of secret numbers.
 */
export function computeErrors(captainOrder, assignments) {
  // Build the correct order: sort player IDs by their secret number ascending
  const correctOrder = [...captainOrder].sort(
    (a, b) => assignments[a] - assignments[b]
  );

  let errorCount = 0;
  const details = [];

  for (let i = 0; i < captainOrder.length; i++) {
    const isCorrect = captainOrder[i] === correctOrder[i];
    if (!isCorrect) errorCount++;
    details.push({
      position: i + 1,
      playerId: captainOrder[i],
      secretNumber: assignments[captainOrder[i]],
      correctPlayerId: correctOrder[i],
      correctNumber: assignments[correctOrder[i]],
      isCorrect,
    });
  }

  return { errorCount, details, correctOrder };
}

/**
 * Get the next captain. Rotates through connected players.
 */
export function getNextCaptain(players, currentRoundIndex) {
  const connected = players.filter((p) => p.is_connected);
  if (connected.length === 0) return null;
  return connected[currentRoundIndex % connected.length];
}

/**
 * Build the full authoritative room state for a client.
 */
export async function buildRoomState(roomId) {
  const { rows: roomRows } = await query(
    `SELECT * FROM rooms WHERE id = $1`,
    [roomId]
  );
  if (roomRows.length === 0) return null;
  const room = roomRows[0];

  const { rows: players } = await query(
    `SELECT id, nickname, avatar_url, client_id, is_connected, created_at
     FROM players WHERE room_id = $1 ORDER BY created_at ASC`,
    [roomId]
  );

  let currentRound = null;
  let answers = [];
  let ordering = null;

  if (room.status === 'in_game') {
    const { rows: roundRows } = await query(
      `SELECT * FROM rounds WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [roomId]
    );
    if (roundRows.length > 0) {
      currentRound = roundRows[0];

      const { rows: answerRows } = await query(
        `SELECT id, player_id, secret_number, text FROM answers WHERE round_id = $1`,
        [currentRound.id]
      );
      answers = answerRows;

      const { rows: orderingRows } = await query(
        `SELECT * FROM orderings WHERE round_id = $1`,
        [currentRound.id]
      );
      if (orderingRows.length > 0) {
        ordering = orderingRows[0];
      }
    }
  }

  return {
    room: {
      id: room.id,
      code: room.code,
      hostId: room.host_id,
      status: room.status,
      lives: room.lives,
      roundIndex: room.round_index,
    },
    players: players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatarUrl: p.avatar_url,
      clientId: p.client_id,
      isConnected: p.is_connected,
    })),
    currentRound: currentRound
      ? {
          id: currentRound.id,
          captainPlayerId: currentRound.captain_player_id,
          questionText: currentRound.question_text,
          category: currentRound.category,
          state: currentRound.state,
        }
      : null,
    answers: answers.map((a) => ({
      id: a.id,
      playerId: a.player_id,
      secretNumber: a.secret_number,
      text: a.text,
    })),
    ordering: ordering
      ? {
          orderedPlayerIds: ordering.ordered_player_ids,
          errorCount: ordering.error_count,
        }
      : null,
  };
}
