import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { Server, Socket } from 'socket.io';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(__dirname, '..', 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff':  'font/woff',
  '.json': 'application/json',
};

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = (req.url ?? '/').split('?')[0];
  let filePath = join(DIST, url === '/' ? 'index.html' : url);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = join(DIST, 'index.html'); // SPA fallback
  }
  try {
    const content = readFileSync(filePath);
    const mime = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}
import { createDeck } from '../src/engine/cards.js';
import { reduce, type Action } from '../src/engine/actions.js';
import { createInitialState, NEUTRAL_ID, ZOMBIE_ID, type GameState, type PlayerId, IllegalActionError } from '../src/engine/state.js';
import { chooseAction } from '../src/engine/ai.js';
import { getMap } from '../src/engine/map-registry.js';
import { type GameConfig } from '../src/engine/modes.js';

// ── Types ─────────────────────────────────────────────────────────────────────

const PALETTE = ['#3d7fd6', '#d6453d', '#4a9e5c', '#d99b32', '#9b59b6', '#16a0a0'];

interface Seat {
  id: PlayerId;          // 'P1' .. 'P6'
  name: string;          // display name chosen by the human
  kind: 'human' | 'bot';
  socketId: string | null;
  color: string;
  seatToken: string;     // secret sent to the client for rejoin
}

interface Room {
  code: string;
  size: number;          // max players (2–6)
  hostSeatId: PlayerId;
  seats: Seat[];
  config: GameConfig;
  state: GameState | null;
}

// State stripped of the non-serializable `map` field
type WireState = Omit<GameState, 'map'>;

function toWire(s: GameState): WireState {
  const { map: _map, ...rest } = s;
  return rest;
}

// ── Room manager ──────────────────────────────────────────────────────────────

const rooms = new Map<string, Room>();
const socketToSeat = new Map<string, { code: string; seatId: PlayerId }>();

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

function genToken(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function lobbyPayload(room: Room) {
  return {
    code: room.code,
    size: room.size,
    hostSeat: room.hostSeatId,
    config: room.config,
    seats: room.seats.map(s => ({ id: s.id, name: s.name, kind: s.kind, color: s.color, connected: s.socketId !== null })),
  };
}

function nextSeatId(room: Room): PlayerId | null {
  const taken = new Set(room.seats.map(s => s.id));
  for (let i = 1; i <= 6; i++) {
    const id = `P${i}` as PlayerId;
    if (!taken.has(id)) return id;
  }
  return null;
}

// ── Bot loop ──────────────────────────────────────────────────────────────────

const CPU_DELAY_MS = 600;

function scheduleBotTurn(io: Server, room: Room) {
  if (!room.state || room.state.winner !== null) return;
  const cur = room.state.players[room.state.turnPointer];
  if (!cur) return;
  const seat = room.seats.find(s => s.id === cur.id);
  if (!seat || seat.kind !== 'bot') return;
  // Also skip neutral/zombie pseudo-players
  if (cur.id === NEUTRAL_ID || cur.id === ZOMBIE_ID) return;

  const delay = room.state.phase === 'setup' ? 180 : CPU_DELAY_MS;
  setTimeout(() => {
    if (!room.state || room.state.winner !== null) return;
    const s = room.state;
    const curNow = s.players[s.turnPointer];
    if (!curNow) return;
    const seatNow = room.seats.find(x => x.id === curNow.id);
    if (!seatNow || seatNow.kind !== 'bot') return;

    try {
      const rng = () => Math.random();
      const action = chooseAction(s, rng);
      room.state = reduce(s, action);
      io.to(room.code).emit('state_update', { state: toWire(room.state), lastAction: action });
      scheduleBotTurn(io, room);
    } catch {
      // chooseAction / reduce failed — skip gracefully
    }
  }, delay);
}

// ── Socket.IO server ──────────────────────────────────────────────────────────

const PORT = Number(process.env['PORT'] ?? 3001);
const httpServer = createServer(existsSync(DIST) ? serveStatic : undefined);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

io.on('connection', (socket: Socket) => {

  // ── create_room ──────────────────────────────────────────────────────────
  socket.on('create_room', ({ config, size, name }: { config: GameConfig; size: number; name: string }) => {
    if (size < 2 || size > 6) { socket.emit('error', { message: 'Room size must be 2–6.' }); return; }

    let code = genCode();
    while (rooms.has(code)) code = genCode();

    const hostSeat: Seat = {
      id: 'P1', name: name ?? 'Host', kind: 'human',
      socketId: socket.id, color: PALETTE[0]!, seatToken: genToken(),
    };
    const room: Room = {
      code, size,
      hostSeatId: 'P1',
      seats: [hostSeat],
      config: { ...config, numOpponents: size - 1 },
      state: null,
    };
    rooms.set(code, room);
    socketToSeat.set(socket.id, { code, seatId: 'P1' });
    socket.join(code);
    socket.emit('room_created', { code, mySeat: 'P1', myToken: hostSeat.seatToken, ...lobbyPayload(room) });
  });

  // ── join_room ────────────────────────────────────────────────────────────
  socket.on('join_room', ({ code, name }: { code: string; name: string }) => {
    const room = rooms.get(code.toUpperCase());
    if (!room) { socket.emit('error', { message: 'Room not found.' }); return; }
    if (room.state) { socket.emit('error', { message: 'Game already started.' }); return; }
    const humanCount = room.seats.filter(s => s.kind === 'human').length;
    if (humanCount >= room.size) { socket.emit('error', { message: 'Room is full.' }); return; }

    const seatId = nextSeatId(room);
    if (!seatId) { socket.emit('error', { message: 'Room is full.' }); return; }
    const idx = room.seats.length;
    const seat: Seat = {
      id: seatId, name: name ?? `Player ${idx + 1}`, kind: 'human',
      socketId: socket.id, color: PALETTE[idx % PALETTE.length]!,
      seatToken: genToken(),
    };
    room.seats.push(seat);
    socketToSeat.set(socket.id, { code, seatId });
    socket.join(code);
    socket.emit('room_joined', { mySeat: seatId, myToken: seat.seatToken, ...lobbyPayload(room) });
    socket.to(code).emit('lobby_state', lobbyPayload(room));
  });

  // ── rejoin ───────────────────────────────────────────────────────────────
  socket.on('rejoin', ({ code, seatToken }: { code: string; seatToken: string }) => {
    const room = rooms.get(code);
    if (!room) { socket.emit('error', { message: 'Room not found.' }); return; }
    const seat = room.seats.find(s => s.seatToken === seatToken);
    if (!seat) { socket.emit('error', { message: 'Invalid token.' }); return; }
    seat.socketId = socket.id;
    socketToSeat.set(socket.id, { code, seatId: seat.id });
    socket.join(code);
    if (room.state) {
      const playerColors = Object.fromEntries(room.seats.map(s => [s.id, s.color]));
      const playerNames = Object.fromEntries(room.seats.map(s => [s.id, s.name]));
      socket.emit('game_started', { state: toWire(room.state), config: room.config, mySeat: seat.id, playerColors, playerNames });
    } else {
      socket.emit('lobby_state', { mySeat: seat.id, myToken: seat.seatToken, ...lobbyPayload(room) });
    }
  });

  // ── add_bot ──────────────────────────────────────────────────────────────
  socket.on('add_bot', () => {
    const ref = socketToSeat.get(socket.id);
    if (!ref) return;
    const room = rooms.get(ref.code);
    if (!room || room.state) return;
    if (ref.seatId !== room.hostSeatId) { socket.emit('error', { message: 'Only host can add bots.' }); return; }
    if (room.seats.length >= room.size) { socket.emit('error', { message: 'Room is full.' }); return; }

    const seatId = nextSeatId(room);
    if (!seatId) return;
    const idx = room.seats.length;
    room.seats.push({
      id: seatId, name: `Bot ${idx}`, kind: 'bot',
      socketId: null, color: PALETTE[idx % PALETTE.length]!,
      seatToken: genToken(),
    });
    io.to(room.code).emit('lobby_state', lobbyPayload(room));
  });

  // ── remove_bot ───────────────────────────────────────────────────────────
  socket.on('remove_bot', ({ seatId }: { seatId: PlayerId }) => {
    const ref = socketToSeat.get(socket.id);
    if (!ref) return;
    const room = rooms.get(ref.code);
    if (!room || room.state) return;
    if (ref.seatId !== room.hostSeatId) { socket.emit('error', { message: 'Only host can remove bots.' }); return; }
    const idx = room.seats.findIndex(s => s.id === seatId && s.kind === 'bot');
    if (idx === -1) { socket.emit('error', { message: 'Seat not found.' }); return; }
    room.seats.splice(idx, 1);
    io.to(room.code).emit('lobby_state', lobbyPayload(room));
  });

  // ── start_game ───────────────────────────────────────────────────────────
  socket.on('start_game', () => {
    const ref = socketToSeat.get(socket.id);
    if (!ref) return;
    const room = rooms.get(ref.code);
    if (!room || room.state) return;
    if (ref.seatId !== room.hostSeatId) { socket.emit('error', { message: 'Only host can start.' }); return; }
    if (room.seats.length < 2) { socket.emit('error', { message: 'Need at least 2 players.' }); return; }

    const rng = () => Math.random();
    const map = getMap(room.config.mapId);
    const deck = createDeck(rng, map.allTerritoryIds);
    const seatIds = room.seats.map(s => s.id);
    const config: GameConfig = { ...room.config, numOpponents: room.seats.length - 1 };
    room.config = config;
    room.state = createInitialState(seatIds, { deck, setup: true, config, rng });

    const playerColors = Object.fromEntries(room.seats.map(s => [s.id, s.color]));
    const playerNames = Object.fromEntries(room.seats.map(s => [s.id, s.name]));

    io.to(room.code).emit('game_started', {
      state: toWire(room.state),
      config: room.config,
      playerColors,
      playerNames,
    });

    // Emit mySeat to each connected human socket individually
    for (const seat of room.seats) {
      if (seat.kind === 'human' && seat.socketId) {
        io.to(seat.socketId).emit('my_seat', { mySeat: seat.id });
      }
    }

    scheduleBotTurn(io, room);
  });

  // ── action ───────────────────────────────────────────────────────────────
  socket.on('action', ({ action }: { action: Action }) => {
    const ref = socketToSeat.get(socket.id);
    if (!ref) return;
    const room = rooms.get(ref.code);
    if (!room || !room.state) return;

    // Verify the sender owns the current-turn seat
    const curId = room.state.players[room.state.turnPointer]?.id;
    if (curId !== ref.seatId) {
      socket.emit('error', { message: 'Not your turn.' });
      return;
    }

    try {
      room.state = reduce(room.state, action);
      io.to(room.code).emit('state_update', { state: toWire(room.state), lastAction: action });
      scheduleBotTurn(io, room);
    } catch (err) {
      if (err instanceof IllegalActionError) {
        socket.emit('error', { message: err.message });
      }
    }
  });

  // ── disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const ref = socketToSeat.get(socket.id);
    if (!ref) return;
    socketToSeat.delete(socket.id);
    const room = rooms.get(ref.code);
    if (!room) return;
    const seat = room.seats.find(s => s.id === ref.seatId);
    if (seat) seat.socketId = null;
    if (!room.state) {
      // Still in lobby — broadcast updated seat list
      io.to(room.code).emit('lobby_state', lobbyPayload(room));
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Risk server listening on port ${PORT}`);
});
