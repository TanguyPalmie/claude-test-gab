/**
 * In-memory brute-force protection for room code joins.
 * Tracks attempts per IP and per room code.
 * After max attempts, blocks further attempts for a cooldown period.
 */

const attempts = new Map(); // key: "ip:code" → { count, blockedUntil }

function getKey(ip, code) {
  return `${ip}:${code}`;
}

export function createBruteForceMiddleware() {
  const maxAttempts = parseInt(process.env.BRUTE_FORCE_MAX_ATTEMPTS || '5', 10);
  const cooldownMs = parseInt(process.env.BRUTE_FORCE_COOLDOWN_MS || '300000', 10);

  // Clean up old entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of attempts) {
      if (entry.blockedUntil && entry.blockedUntil < now) {
        attempts.delete(key);
      }
    }
  }, 300_000);

  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress;
    const code = (req.params.code || '').toUpperCase();
    const key = getKey(ip, code);
    const now = Date.now();

    const entry = attempts.get(key);

    if (entry) {
      // Check if currently blocked
      if (entry.blockedUntil && entry.blockedUntil > now) {
        const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
        return res.status(429).json({
          error: 'Too many attempts. Please try again later.',
          retryAfter,
        });
      }

      // Increment attempts
      entry.count++;
      if (entry.count > maxAttempts) {
        entry.blockedUntil = now + cooldownMs;
        const retryAfter = Math.ceil(cooldownMs / 1000);
        return res.status(429).json({
          error: 'Too many attempts. Please try again later.',
          retryAfter,
        });
      }
    } else {
      attempts.set(key, { count: 1, blockedUntil: null });
    }

    // On successful join, we should reset — attach a helper
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        attempts.delete(key);
      }
    });

    next();
  };
}
