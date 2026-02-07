# Top Ten — Cooperative Party Game

A real-time cooperative ranking party game inspired by Top Ten. Players join rooms via shared codes and work together to rank answers to questions. No individual winner — the team wins or loses together.

## Architecture

```
topten-game/
├── apps/
│   ├── api/          # Node.js + Express + Socket.IO backend
│   │   ├── src/
│   │   │   ├── db/           # PostgreSQL pool & migrations
│   │   │   ├── middleware/   # Brute-force protection
│   │   │   ├── questions/    # Question loader from .txt files
│   │   │   ├── routes/       # REST API endpoints
│   │   │   ├── socket/       # Socket.IO handlers + game engine
│   │   │   └── utils/        # Room codes, validation, cleanup
│   │   └── questions/        # .txt question files (one per category)
│   └── web/          # React + Vite + Tailwind frontend
│       └── src/
│           ├── components/   # UI components (shadcn/ui style)
│           ├── hooks/        # Socket context & hooks
│           ├── lib/          # API client, utils
│           └── pages/        # Home, ProfileGate, Lobby, Game
├── docker-compose.yml        # Dev environment
├── docker-compose.prod.yml   # Production environment
├── Dockerfile.api
├── Dockerfile.web
├── nginx.conf                # Production frontend serving
└── .env.dev / .env.prod / .env.example
```

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- **Docker** & **Docker Compose** v2

## Quick Start (Docker — Recommended)

```bash
# 1. Clone and enter the project
cd topten-game

# 2. Start everything
docker compose up --build

# 3. Open in browser
# Frontend: http://localhost:5173
# API: http://localhost:4000
# Health check: http://localhost:4000/api/health
```

### Development Mode

Docker Compose runs in dev mode by default:
- **Frontend**: Vite dev server with HMR on port 5173
- **Backend**: nodemon with auto-restart on code changes
- **Questions**: Mounted as volume — edit .txt files live, restart API to reload
- **Source code**: Mounted as volumes for live editing

### Production Mode

```bash
# Build and run production containers
docker compose -f docker-compose.prod.yml --env-file .env.prod up --build -d
```

Production choices:
- **Frontend** served via **nginx** (efficient static serving, SPA routing, gzip, caching)
- **API** runs plain Node.js (no nodemon)
- **Questions** mounted read-only

## Local Development (Without Docker)

```bash
# 1. Install dependencies
pnpm install

# 2. Start PostgreSQL locally (or via Docker)
docker run -d --name topten-pg \
  -e POSTGRES_DB=topten -e POSTGRES_USER=topten -e POSTGRES_PASSWORD=topten_dev_password \
  -p 5432:5432 postgres:16-alpine

# 3. Set environment variables
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=topten
export POSTGRES_USER=topten
export POSTGRES_PASSWORD=topten_dev_password
export API_PORT=4000
export CORS_ORIGIN=http://localhost:5173
export QUESTIONS_DIR=$(pwd)/apps/api/questions
export UPLOADS_DIR=$(pwd)/uploads

# 4. Start backend
pnpm dev:api

# 5. Start frontend (separate terminal)
pnpm dev:web
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_HOST` | `postgres` | Database host |
| `POSTGRES_PORT` | `5432` | Database port |
| `POSTGRES_DB` | `topten` | Database name |
| `POSTGRES_USER` | `topten` | Database user |
| `POSTGRES_PASSWORD` | — | Database password |
| `API_PORT` | `4000` | Backend port |
| `NODE_ENV` | `development` | Environment mode |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `UPLOADS_DIR` | `/data/uploads` | Avatar upload directory |
| `QUESTIONS_DIR` | `/app/questions` | Questions .txt directory |
| `RATE_LIMIT_CREATE_ROOM_WINDOW_MS` | `60000` | Rate limit window for room creation |
| `RATE_LIMIT_CREATE_ROOM_MAX` | `5` | Max room creations per window |
| `RATE_LIMIT_JOIN_ROOM_WINDOW_MS` | `60000` | Rate limit window for joining |
| `RATE_LIMIT_JOIN_ROOM_MAX` | `10` | Max join attempts per window |
| `BRUTE_FORCE_MAX_ATTEMPTS` | `5` | Max wrong codes before cooldown |
| `BRUTE_FORCE_COOLDOWN_MS` | `300000` | Cooldown duration (5 min) |
| `PLAYER_CLEANUP_MINUTES` | `30` | Remove disconnected lobby players after N min (0=disabled) |
| `VITE_API_URL` | `http://localhost:4000` | API URL for frontend |
| `VITE_WS_URL` | `http://localhost:4000` | WebSocket URL for frontend |

## Question Files Strategy

Questions live in `apps/api/questions/` as plain `.txt` files:

```
questions/
├── fun.txt
├── emotions.txt
├── imagination.txt
└── logic.txt
```

**Format:**
- One question per line
- Empty lines are ignored
- Category is derived from the filename (e.g., `fun.txt` → category "fun")

**On backend startup:**
1. All `.txt` files in the questions directory are read
2. Lines are trimmed and deduplicated
3. Each question gets a stable ID: `SHA-256(category + "::" + text)` truncated to 16 hex chars
4. Questions are stored in memory (not in the database)

**Per-room usage tracking:**
- The `room_questions` table tracks which questions have been used in each room
- Each round picks a random unused question
- When all questions are exhausted: the usage table is cleared and all questions become available again (reshuffle)
- This persists across server restarts — reconnecting players won't see repeated questions

**Adding new questions:**
1. Add lines to an existing `.txt` file, or create a new `.txt` file
2. Restart the API server (in Docker dev mode, restart the api container)

## Game Flow

1. **Home**: Create a room (generates 6-char code like `K7P4Q2`) or join with a code
2. **Profile Gate**: Enter nickname (required) and optionally upload an avatar
3. **Lobby**: See all players. Host starts the game when ready (min 2 players)
4. **Game rounds** (repeat until lives = 0 or questions exhausted):
   - Captain rotates each round
   - Each non-captain player receives a secret number (1 to N)
   - A question is displayed to everyone
   - Players submit text answers (captain waits)
   - Captain sees all answers (shuffled, no numbers) and must rank them via drag-and-drop
   - Reveal: correct order vs captain's guess. Each wrong position = -1 life
   - Team starts with 5 lives
5. **Game Over**: Shows rounds played and remaining lives

## Reconnection Logic

Reconnection is a first-class feature. The server (PostgreSQL) is the single source of truth.

**How it works:**
1. Client generates a `clientId` (UUID v4) stored in `localStorage` — persists across sessions
2. Room session data (code, nickname, avatar) stored in `sessionStorage`
3. On socket disconnect: player marked `is_connected = false` (NOT removed)
4. On reconnect: socket.io auto-reconnects, client re-emits `join_room` with `clientId`
5. Server finds existing player by `clientId + room_id`, marks connected, sends full `room_state`
6. Client restores UI to the correct game phase

**What's persisted in DB:**
- Room state (status, lives, round index)
- Round state (phase, question, captain)
- All answers and secret number assignments
- Captain's ordering and error count
- Used questions per room

**Cleanup:** Disconnected players in lobby rooms are removed after `PLAYER_CLEANUP_MINUTES` (configurable). Players in active games are never auto-removed.

## Rate Limiting & Brute-Force Protection

### Rate Limiting
- **Room creation**: Configurable requests per window (default: 5/min)
- **Room joining**: Configurable requests per window (default: 10/min)
- **Avatar upload**: 10/min per IP
- Uses `express-rate-limit` with standard headers

### Brute-Force Protection
- Tracks join attempts per `IP + room code` combination
- After `BRUTE_FORCE_MAX_ATTEMPTS` failed attempts → blocked for `BRUTE_FORCE_COOLDOWN_MS`
- Error messages are neutral ("Unable to join room") to not reveal whether a code exists
- Successful joins reset the attempt counter
- In-memory store with periodic cleanup of expired entries

### Security Middleware
- `helmet` for security headers
- `cors` with configurable origin
- `crossOriginResourcePolicy: 'cross-origin'` for avatar serving
- File upload validation: type whitelist (jpg/png/webp), 2MB size limit

## API Reference

### REST Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/rooms` | Create a new room |
| `POST` | `/api/rooms/:code/join` | Validate room code before joining |
| `POST` | `/api/uploads/avatar` | Upload avatar (multipart) |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/questions/stats` | Question count per category (dev only) |

### Socket.IO Events

| Event | Direction | Description |
|---|---|---|
| `join_room` | Client → Server | Join/rejoin a room |
| `room_state` | Server → Client | Full authoritative state snapshot |
| `player_list_update` | Server → Client | Updated player list |
| `start_game` | Client → Server | Host starts the game |
| `new_round` | Server → Client | New round begins |
| `your_secret_number` | Server → Client | Individual secret number (per-player) |
| `submit_answer` | Client → Server | Player submits answer text |
| `all_answers_collected` | Server → Client | All answers in, captain can rank |
| `submit_ordering` | Client → Server | Captain submits ranking |
| `reveal_results` | Server → Client | Round results with correct/incorrect positions |
| `lives_update` | Server → Client | Updated life count |
| `next_round` | Client → Server | Host advances to next round |
| `game_finished` | Server → Client | Game ended |
| `player_disconnected` | Server → Client | A player went offline |
| `player_reconnected` | Server → Client | A player came back online |

## Tech Stack

- **Frontend**: React 18 (JavaScript), Vite, Tailwind CSS, shadcn/ui components, dnd-kit
- **Backend**: Node.js 20, Express.js, Socket.IO
- **Database**: PostgreSQL 16
- **Infrastructure**: Docker, Docker Compose, nginx (prod)
- **Package Manager**: pnpm 9 (workspaces)
