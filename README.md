# Hegemon

A full-stack turn-based global conquest game built with React, TypeScript, and Socket.IO. Play solo against AI opponents or battle friends online in real-time multiplayer.

---

## Features

- **10 playable boards** — Classic World, Imperial World, Risk Europe (177 provinces), United Kingdom, The Storybook World, and five imaginary maps (Verdantia, The Sundered Isles, The Long March, Twin Crowns, Aurelia)
- **10 game modes** — World Domination, Capital Conquest, Secret Missions, Domination %, Turn Limit, 2-Player, Zombies, Secret Assassin, Blizzards, Portals
- **Online multiplayer** — create a room with a join code, add bots to fill seats, play with up to 6 players
- **AI opponents** — three difficulty levels (Easy / Normal / Hard), server-driven in multiplayer
- **Rich settings** — fog of war, auto army setup, batch placement, card bonus modes, turn timer, teams
- **Procedural imaginary maps** — generated via Voronoi + Lloyd relaxation; adjacency derived from shared borders

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Game engine | Pure TypeScript (zero DOM/React imports) |
| Multiplayer | Socket.IO (WebSocket + polling fallback) |
| Maps | D3-geo, Natural Earth 110m, Polygon-clipping, D3-Delaunay |
| Testing | Vitest (341 tests) |
| Deploy | Railway (server) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
git clone https://github.com/nasirlinijat/hegamon-game.git
cd hegamon-game
npm install
```

### Run locally (single-player only)

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Run locally (with multiplayer)

Open two terminals:

```bash
# Terminal 1 — game server (WebSocket)
npm run server

# Terminal 2 — Vite dev client
npm run dev
```

Open two browser windows to test multiplayer. One player creates a room, shares the code, the other joins.

---

## Project Structure

```
src/
  engine/       # Pure TypeScript — game rules, AI, cards, maps (no React)
  ui/           # React components — Board, Roster, PhaseHud, SetupScreen, LobbyScreen
server/
  index.ts      # Socket.IO server — room manager, action validation, server-side AI
scripts/
  build-fantasy-maps.mjs   # Procedural Voronoi map generator (imaginary boards)
  build-atlas-map.mjs      # Positioned-seed atlas generator (Europe, UK, Storybook)
tests/          # Vitest test suite mirroring src/engine/
```

---

## Deployment

### Architecture

The server (`server/index.ts`) does two things:
1. Serves the built Vite client as static files
2. Handles WebSocket connections for multiplayer

This means **one deployment** covers both the frontend and the game server.

---

### Deploy to Railway (recommended)

1. Push your code to GitHub.

2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → select your repo.

3. Railway reads `railway.json` at the root and automatically runs:
   - **Build:** `npm run build:all` (builds the Vite client)
   - **Start:** `npm start` (runs the server which serves the client + handles WebSocket)

4. Go to your service → **Settings** → **Networking** → **Generate Domain** to get a public URL.

5. Done. Share the URL with friends — no separate client deployment needed.

**Cost:** Railway's Hobby plan is $5/month. There is a free trial with $5 credit.

---

### Deploy client + server separately (free option)

Split the deployment to keep costs at zero:

#### Server → Render (free tier)

1. Go to [render.com](https://render.com) → **New Web Service** → connect your GitHub repo.
2. Set:
   - **Build command:** `npm run build:all`
   - **Start command:** `npm start`
   - **Plan:** Free
3. Copy the Render service URL (e.g. `https://hegamon.onrender.com`).

> **Note:** Render's free tier sleeps after 15 minutes of inactivity. The first player to join after idle will experience a ~30 second cold start.

#### Client → Vercel (free)

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your repo.
2. Set the environment variable:
   ```
   VITE_SERVER_URL=https://hegamon.onrender.com
   ```
3. **Build command:** `npm run build:all`  
   **Output directory:** `dist`
4. Deploy. Vercel gives you a free URL.

Players visit the Vercel URL; the game client connects to the Render WebSocket server.

---

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `PORT` | Server | Port to listen on (Railway sets this automatically) |
| `VITE_SERVER_URL` | Client build | WebSocket server URL (leave empty if client and server are on the same origin) |

Copy `.env.example` to `.env.local` for local overrides.

---

## Scripts

```bash
npm run dev          # Vite dev server (client only)
npm run server       # Game server with hot reload (tsx watch)
npm run build:all    # Build Vite client → dist/
npm run start        # Production server (serves client + WebSocket)
npm test             # Run all tests (Vitest)
npm run test:watch   # Vitest watch mode

# Map generators
node scripts/build-map.mjs              # Rebuild classic board geometry
node scripts/build-imperial-map.mjs     # Rebuild imperial board geometry
node scripts/build-atlas-map.mjs        # Rebuild Europe / UK / Storybook boards
node scripts/build-fantasy-maps.mjs     # Rebuild all imaginary boards
node scripts/build-fantasy-maps.mjs aurelia  # Rebuild one imaginary board
```

---

## Adding a New Map

See [`ADDING_A_MAP.md`](ADDING_A_MAP.md) for the full guide — covers both real-geography boards (Natural Earth pipeline) and imaginary boards (procedural Voronoi generator).

---

## License

MIT
