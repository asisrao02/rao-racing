import { Server } from "socket.io";
import { createRoomCode } from "./utils/roomCode.js";
import {
  LAPS_TO_WIN,
  MAX_PLAYERS_PER_ROOM,
  createPlayerState,
  createRoomSnapshot,
  createTrack,
  resetPlayersForCountdown,
  sanitizeInput,
  sanitizeUsername,
  stepRoom,
} from "./services/raceEngine.js";

const TICK_RATE = 20;
const rooms = new Map();

function withAck(ack, payload) {
  if (typeof ack === "function") {
    ack(payload);
  }
}

function getSocketRoom(socket) {
  const roomCode = socket.data.roomCode;
  if (!roomCode) {
    return null;
  }

  return rooms.get(roomCode) ?? null;
}

function emitRoomState(io, room, now = Date.now()) {
  io.to(room.code).emit("room:state", createRoomSnapshot(room, now));
}

function ensureHost(room) {
  if (room.players.has(room.hostId)) {
    return;
  }

  const nextHost = room.players.keys().next().value;
  room.hostId = nextHost ?? null;
}

function leaveRoom(io, socket) {
  const room = getSocketRoom(socket);
  if (!room) {
    socket.data.roomCode = null;
    return;
  }

  room.players.delete(socket.id);
  socket.leave(room.code);
  socket.data.roomCode = null;

  if (room.players.size === 0) {
    rooms.delete(room.code);
    return;
  }

  ensureHost(room);

  if ((room.phase === "countdown" || room.phase === "racing") && room.players.size === 1) {
    const lonePlayer = [...room.players.values()][0];
    if (room.phase === "racing" && !lonePlayer.completed) {
      lonePlayer.completed = true;
      lonePlayer.finishTimeMs = room.startedAt ? Date.now() - room.startedAt : 0;
      lonePlayer.place = 1;
      room.finishedOrder = [lonePlayer.id];
    }
    room.phase = "finished";
    room.finishedAt = Date.now();
  }

  emitRoomState(io, room);
}

function createRoomForSocket(io, socket, username) {
  const roomCode = createRoomCode(rooms);
  const track = createTrack();
  const room = {
    code: roomCode,
    phase: "lobby",
    hostId: socket.id,
    lapsToWin: LAPS_TO_WIN,
    track,
    players: new Map(),
    finishedOrder: [],
    firstFinishAt: null,
    startedAt: null,
    finishedAt: null,
    countdownEndsAt: null,
    lastTickAt: Date.now(),
    persisted: false,
  };

  const player = createPlayerState({
    id: socket.id,
    username,
    spawnIndex: 0,
    track,
  });

  room.players.set(socket.id, player);
  rooms.set(roomCode, room);
  socket.join(roomCode);
  socket.data.roomCode = roomCode;
  emitRoomState(io, room);
  return room;
}

function joinRoom(io, socket, room, username) {
  const spawnIndex = room.players.size;
  const player = createPlayerState({
    id: socket.id,
    username,
    spawnIndex,
    track: room.track,
  });

  room.players.set(socket.id, player);
  socket.join(room.code);
  socket.data.roomCode = room.code;
  emitRoomState(io, room);
}

function startRace(io, room) {
  const now = Date.now();
  room.phase = "countdown";
  room.countdownEndsAt = now + 3000;
  room.startedAt = null;
  room.finishedAt = null;
  room.finishedOrder = [];
  room.firstFinishAt = null;
  room.persisted = false;
  resetPlayersForCountdown(room, now);
  emitRoomState(io, room, now);
}

function restartToLobby(io, room) {
  const now = Date.now();
  room.phase = "lobby";
  room.countdownEndsAt = null;
  room.startedAt = null;
  room.finishedAt = null;
  room.finishedOrder = [];
  room.firstFinishAt = null;
  room.persisted = false;
  resetPlayersForCountdown(room, now);
  emitRoomState(io, room, now);
}

export function setupSocket(server, options = {}) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.engine.on("connection_error", (error) => {
    console.error("[socket] connection_error:", {
      code: error.code,
      message: error.message,
      origin: error.context?.origin,
      transport: error.context?.transport,
    });
  });

  io.on("connection", (socket) => {
    socket.on("room:create", (payload, ack) => {
      const username = sanitizeUsername(payload?.username);
      leaveRoom(io, socket);
      const room = createRoomForSocket(io, socket, username);
      withAck(ack, {
        ok: true,
        roomCode: room.code,
        playerId: socket.id,
      });
    });

    socket.on("room:join", (payload, ack) => {
      const roomCode = String(payload?.roomCode ?? "")
        .toUpperCase()
        .trim();
      const username = sanitizeUsername(payload?.username);
      const room = rooms.get(roomCode);

      if (!room) {
        withAck(ack, { ok: false, error: "Room not found." });
        return;
      }

      if (room.phase !== "lobby") {
        withAck(ack, { ok: false, error: "Race already started for this room." });
        return;
      }

      if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
        withAck(ack, { ok: false, error: "Room is full." });
        return;
      }

      leaveRoom(io, socket);
      joinRoom(io, socket, room, username);
      withAck(ack, {
        ok: true,
        roomCode,
        playerId: socket.id,
      });
    });

    socket.on("room:leave", () => {
      leaveRoom(io, socket);
    });

    socket.on("race:start", (_, ack) => {
      const room = getSocketRoom(socket);
      if (!room) {
        withAck(ack, { ok: false, error: "Join a room first." });
        return;
      }

      if (room.hostId !== socket.id) {
        withAck(ack, { ok: false, error: "Only host can start the race." });
        return;
      }

      if (room.phase !== "lobby") {
        withAck(ack, { ok: false, error: "Race is not in lobby state." });
        return;
      }

      startRace(io, room);
      withAck(ack, { ok: true });
    });

    socket.on("race:restart", (_, ack) => {
      const room = getSocketRoom(socket);
      if (!room) {
        withAck(ack, { ok: false, error: "Room not found." });
        return;
      }

      if (room.hostId !== socket.id) {
        withAck(ack, { ok: false, error: "Only host can restart." });
        return;
      }

      restartToLobby(io, room);
      withAck(ack, { ok: true });
    });

    socket.on("player:input", (input) => {
      const room = getSocketRoom(socket);
      if (!room) {
        return;
      }

      const player = room.players.get(socket.id);
      if (!player) {
        return;
      }

      player.inputs = sanitizeInput(input);
      player.lastInputAt = Date.now();
    });

    socket.on("disconnect", () => {
      leaveRoom(io, socket);
    });
  });

  setInterval(() => {
    const now = Date.now();
    rooms.forEach((room) => {
      const delta = now - room.lastTickAt;
      const dt = Math.min(0.1, Math.max(0.01, delta / 1000));
      room.lastTickAt = now;

      stepRoom(room, dt, now);
      emitRoomState(io, room, now);

      if (room.phase === "finished" && !room.persisted && typeof options.onRaceFinished === "function") {
        room.persisted = true;
        Promise.resolve(options.onRaceFinished(room)).catch((error) => {
          console.error("Failed to persist race result:", error.message);
        });
      }
    });
  }, 1000 / TICK_RATE);

  return io;
}
