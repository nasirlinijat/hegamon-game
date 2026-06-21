import { io, Socket } from 'socket.io-client';
import { type Action } from '../engine/actions';
import { type GameConfig } from '../engine/modes';
import { type PlayerId } from '../engine/state';

// Resolved from env at build time; falls back to same-origin (prod) or localhost:3001 (dev).
const SERVER_URL = (import.meta as { env?: { VITE_SERVER_URL?: string } }).env?.VITE_SERVER_URL ?? '';

export interface SeatInfo {
  id: PlayerId;
  name: string;
  kind: 'human' | 'bot';
  color: string;
  connected: boolean;
}

export interface LobbyState {
  code: string;
  size: number;
  hostSeat: PlayerId;
  config: GameConfig;
  seats: SeatInfo[];
}

let _socket: Socket | null = null;

function socket(): Socket {
  if (!_socket) {
    _socket = io(SERVER_URL || window.location.origin, { autoConnect: true, transports: ['websocket', 'polling'] });
  }
  return _socket;
}

export function disconnect() {
  _socket?.disconnect();
  _socket = null;
}

// ── Room operations ───────────────────────────────────────────────────────────

export function createRoom(config: GameConfig, size: number, name: string) {
  socket().emit('create_room', { config, size, name });
}

export function joinRoom(code: string, name: string) {
  socket().emit('join_room', { code: code.toUpperCase(), name });
}

export function rejoinRoom(code: string, seatToken: string) {
  socket().emit('rejoin', { code, seatToken });
}

export function addBot() {
  socket().emit('add_bot');
}

export function removeBot(seatId: PlayerId) {
  socket().emit('remove_bot', { seatId });
}

export function startGame() {
  socket().emit('start_game');
}

export function sendAction(action: Action) {
  socket().emit('action', { action });
}

// ── Event subscriptions ───────────────────────────────────────────────────────

type Handler<T> = (data: T) => void;

export function onRoomCreated(fn: Handler<{ code: string; mySeat: PlayerId; myToken: string } & LobbyState>) {
  socket().on('room_created', fn);
}

export function onRoomJoined(fn: Handler<{ mySeat: PlayerId; myToken: string } & LobbyState>) {
  socket().on('room_joined', fn);
}

export function onLobbyState(fn: Handler<LobbyState>) {
  socket().on('lobby_state', fn);
}

export function onGameStarted(fn: Handler<{
  state: object;
  config: GameConfig;
  mySeat?: PlayerId;
  playerColors: Record<string, string>;
  playerNames: Record<string, string>;
}>) {
  socket().on('game_started', fn);
}

export function onMySeat(fn: Handler<{ mySeat: PlayerId }>) {
  socket().on('my_seat', fn);
}

export function onStateUpdate(fn: Handler<{ state: object; lastAction?: Action }>) {
  socket().on('state_update', fn);
}

export function onNetError(fn: Handler<{ message: string }>) {
  socket().on('error', fn);
}

export function offAll() {
  if (!_socket) return;
  _socket.off('room_created');
  _socket.off('room_joined');
  _socket.off('lobby_state');
  _socket.off('game_started');
  _socket.off('my_seat');
  _socket.off('state_update');
  _socket.off('error');
}
