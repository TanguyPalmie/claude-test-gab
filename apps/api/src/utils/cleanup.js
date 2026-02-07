import { query } from '../db/pool.js';

/**
 * Remove players who have been disconnected longer than `thresholdMinutes`.
 * Does not remove players from in_game rooms to prevent data loss.
 */
export async function cleanupInactivePlayers(thresholdMinutes) {
  try {
    const result = await query(
      `DELETE FROM players
       WHERE is_connected = false
         AND last_seen_at < NOW() - ($1 || ' minutes')::interval
         AND room_id IN (SELECT id FROM rooms WHERE status = 'lobby')`,
      [thresholdMinutes.toString()]
    );
    if (result.rowCount > 0) {
      console.log(`[cleanup] Removed ${result.rowCount} inactive player(s)`);
    }
  } catch (err) {
    console.error('[cleanup] Error:', err.message);
  }
}
