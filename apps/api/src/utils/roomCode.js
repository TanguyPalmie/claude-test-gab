import crypto from 'crypto';
import { query } from '../db/pool.js';

// Ambiguity-free characters (no 0/O, 1/I/L)
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Generate a readable 6-char room code like "K7P4Q2".
 * Retries up to 10 times if collision detected.
 */
export async function generateRoomCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += CHARS[bytes[i] % CHARS.length];
    }

    // Check uniqueness among active rooms
    const { rows } = await query(
      `SELECT 1 FROM rooms WHERE code = $1 AND status != 'finished' LIMIT 1`,
      [code]
    );
    if (rows.length === 0) return code;
  }

  throw new Error('Failed to generate unique room code after 10 attempts');
}
