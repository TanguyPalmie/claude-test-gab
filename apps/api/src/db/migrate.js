import { getPool } from './pool.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS rooms (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          VARCHAR(6) NOT NULL UNIQUE,
    host_id       UUID,
    status        VARCHAR(20) NOT NULL DEFAULT 'lobby'
                    CHECK (status IN ('lobby','in_game','finished')),
    lives         INTEGER NOT NULL DEFAULT 5,
    round_index   INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms (code);

  CREATE TABLE IF NOT EXISTS players (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id       UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    nickname      VARCHAR(30) NOT NULL,
    avatar_url    TEXT,
    client_id     VARCHAR(64) NOT NULL,
    is_connected  BOOLEAN NOT NULL DEFAULT true,
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_players_room ON players (room_id);
  CREATE INDEX IF NOT EXISTS idx_players_client ON players (client_id);

  CREATE TABLE IF NOT EXISTS rounds (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id           UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    captain_player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    question_id       VARCHAR(64) NOT NULL,
    question_text     TEXT NOT NULL,
    category          VARCHAR(60) NOT NULL,
    state             VARCHAR(20) NOT NULL DEFAULT 'collecting'
                        CHECK (state IN ('collecting','ordering','reveal','done')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_rounds_room ON rounds (room_id);

  CREATE TABLE IF NOT EXISTS answers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id      UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    secret_number INTEGER NOT NULL CHECK (secret_number BETWEEN 1 AND 10),
    text          TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(round_id, player_id)
  );

  CREATE TABLE IF NOT EXISTS orderings (
    round_id          UUID PRIMARY KEY REFERENCES rounds(id) ON DELETE CASCADE,
    ordered_player_ids UUID[] NOT NULL,
    error_count       INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS room_questions (
    room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    question_id VARCHAR(64) NOT NULL,
    used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (room_id, question_id)
  );
`;

export async function runMigrations() {
  const pool = getPool();
  await pool.query(SCHEMA);
}

// Allow running directly: node src/db/migrate.js
if (process.argv[1]?.endsWith('migrate.js')) {
  import('dotenv/config').then(async () => {
    const { initDb } = await import('./pool.js');
    await initDb();
    await runMigrations();
    console.log('Migrations complete');
    process.exit(0);
  });
}
