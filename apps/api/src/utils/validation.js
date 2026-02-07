/**
 * Validate a nickname.
 * Rules: 2-20 chars, alphanumeric + spaces + common accented chars.
 */
export function validateNickname(nickname) {
  if (!nickname || typeof nickname !== 'string') {
    return 'Nickname is required';
  }
  const trimmed = nickname.trim();
  if (trimmed.length < 2) return 'Nickname must be at least 2 characters';
  if (trimmed.length > 20) return 'Nickname must be at most 20 characters';
  // Allow letters (including accented), numbers, spaces, hyphens, underscores
  if (!/^[\p{L}\p{N}\s\-_]+$/u.test(trimmed)) {
    return 'Nickname contains invalid characters';
  }
  return null;
}

/**
 * Validate a room code format.
 */
export function validateRoomCode(code) {
  if (!code || typeof code !== 'string') return 'Room code is required';
  if (!/^[A-Z0-9]{6}$/.test(code.toUpperCase())) return 'Invalid room code format';
  return null;
}
