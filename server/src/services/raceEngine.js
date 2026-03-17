export const LAPS_TO_WIN = 3;
export const MAX_PLAYERS_PER_ROOM = 8;

const TWO_PI = Math.PI * 2;
const CAR_COLLISION_RADIUS = 2.3;

const PHYSICS = {
  maxForwardSpeed: 52,
  maxReverseSpeed: -16,
  acceleration: 32,
  reverseAcceleration: 18,
  brakeForce: 46,
  friction: 14,
  steerRate: 2.35,
  nitroExtraAccel: 24,
  nitroTopSpeedMultiplier: 1.4,
  nitroDrainPerSecond: 30,
  nitroRegenPerSecond: 12,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function sanitizeUsername(rawUsername) {
  const trimmed = String(rawUsername ?? "Racer").trim();
  if (!trimmed) {
    return "Racer";
  }

  return trimmed.replace(/[^\w\s-]/g, "").slice(0, 24) || "Racer";
}

export function createTrack() {
  return {
    midRadiusX: 180,
    midRadiusZ: 90,
    outerRadiusX: 205,
    outerRadiusZ: 115,
    innerRadiusX: 155,
    innerRadiusZ: 65,
  };
}

function createSpawnPoint(track, spawnIndex) {
  const row = Math.floor(spawnIndex / 2);
  const lane = spawnIndex % 2;

  return {
    x: track.midRadiusX - 2 - row * 3.5,
    z: lane === 0 ? -2.5 : 2.5,
    yaw: 0,
  };
}

function getEllipseProgress(track, x, z) {
  const angle = Math.atan2(z / track.midRadiusZ, x / track.midRadiusX);
  const normalized = ((angle % TWO_PI) + TWO_PI) % TWO_PI;
  return normalized / TWO_PI;
}

function projectInsideTrack(track, player) {
  let x = player.x;
  let z = player.z;

  const outer =
    (x * x) / (track.outerRadiusX * track.outerRadiusX) +
    (z * z) / (track.outerRadiusZ * track.outerRadiusZ);
  if (outer > 1) {
    const scale = 1 / Math.sqrt(outer);
    x *= scale * 0.995;
    z *= scale * 0.995;
    player.speed *= -0.35;
  }

  const inner =
    (x * x) / (track.innerRadiusX * track.innerRadiusX) +
    (z * z) / (track.innerRadiusZ * track.innerRadiusZ);
  if (inner < 1) {
    const scale = 1 / Math.sqrt(Math.max(inner, 0.0001));
    x *= scale * 1.01;
    z *= scale * 1.01;
    player.speed *= -0.2;
  }

  player.x = x;
  player.z = z;
}

function applyFriction(player, dt) {
  if (Math.abs(player.speed) < 0.2) {
    player.speed = 0;
    return;
  }

  const frictionDelta = PHYSICS.friction * dt;
  if (player.speed > 0) {
    player.speed = Math.max(0, player.speed - frictionDelta);
  } else {
    player.speed = Math.min(0, player.speed + frictionDelta);
  }
}

function updateOnePlayer(room, player, dt, now) {
  const controls = player.inputs;
  const racingActive = room.phase === "racing";
  const turnInput = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);

  if (controls.throttle) {
    player.speed += PHYSICS.acceleration * dt;
  } else if (controls.brake && player.speed <= 0) {
    player.speed -= PHYSICS.reverseAcceleration * dt;
  }

  if (controls.brake && player.speed > 0) {
    player.speed -= PHYSICS.brakeForce * dt;
  }

  if (!controls.throttle && !(controls.brake && player.speed <= 0)) {
    applyFriction(player, dt);
  }

  let maxForwardSpeed = PHYSICS.maxForwardSpeed;
  player.isBoosting = false;

  if (racingActive && controls.nitro && player.nitro > 0 && player.speed > 6) {
    player.isBoosting = true;
    player.speed += PHYSICS.nitroExtraAccel * dt;
    maxForwardSpeed *= PHYSICS.nitroTopSpeedMultiplier;
    player.nitro = Math.max(0, player.nitro - PHYSICS.nitroDrainPerSecond * dt);
  } else {
    player.nitro = Math.min(100, player.nitro + PHYSICS.nitroRegenPerSecond * dt);
  }

  player.speed = clamp(player.speed, PHYSICS.maxReverseSpeed, maxForwardSpeed);

  if (turnInput !== 0 && Math.abs(player.speed) > 0.5) {
    const steerFactor = Math.min(1, Math.abs(player.speed) / 20);
    const speedDirection = player.speed >= 0 ? 1 : -1;
    player.yaw += turnInput * PHYSICS.steerRate * steerFactor * dt * speedDirection;
  }

  player.x += Math.sin(player.yaw) * player.speed * dt;
  player.z += Math.cos(player.yaw) * player.speed * dt;

  projectInsideTrack(room.track, player);

  const newProgress = getEllipseProgress(room.track, player.x, player.z);

  if (racingActive && !player.completed) {
    if (player.prevProgress > 0.92 && newProgress < 0.1 && player.speed > 2) {
      const lapTime = player.lastLapStartAt ? now - player.lastLapStartAt : null;
      if (lapTime && lapTime > 1000) {
        player.bestLapMs = player.bestLapMs ? Math.min(player.bestLapMs, lapTime) : lapTime;
      }

      player.lap += 1;
      player.lastLapStartAt = now;
      if (player.lap >= room.lapsToWin) {
        player.completed = true;
        player.finishTimeMs = room.startedAt ? now - room.startedAt : 0;
        player.place = room.finishedOrder.length + 1;
        room.finishedOrder.push(player.id);
        if (!room.firstFinishAt) {
          room.firstFinishAt = now;
        }
      }
    }

    if (player.lastLapStartAt) {
      player.currentLapMs = now - player.lastLapStartAt;
    }
  }

  player.progress = player.lap + newProgress;
  player.prevProgress = newProgress;
}

function resolveCarCollisions(room) {
  const players = [...room.players.values()];
  const minDistance = CAR_COLLISION_RADIUS * 2;
  const minDistanceSq = minDistance * minDistance;

  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const a = players[i];
      const b = players[j];

      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= minDistanceSq) {
        continue;
      }

      const distance = Math.max(Math.sqrt(distanceSq), 0.001);
      const overlap = minDistance - distance;
      const nx = dx / distance;
      const nz = dz / distance;

      a.x -= nx * overlap * 0.5;
      a.z -= nz * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.z += nz * overlap * 0.5;

      a.speed *= 0.88;
      b.speed *= 0.88;
    }
  }
}

export function createPlayerState({ id, username, spawnIndex, track }) {
  const spawn = createSpawnPoint(track, spawnIndex);
  const progress = getEllipseProgress(track, spawn.x, spawn.z);

  return {
    id,
    username: sanitizeUsername(username),
    x: spawn.x,
    z: spawn.z,
    yaw: spawn.yaw,
    speed: 0,
    lap: 0,
    progress,
    prevProgress: progress,
    currentLapMs: 0,
    lastLapStartAt: null,
    bestLapMs: null,
    completed: false,
    finishTimeMs: null,
    place: null,
    rank: 1,
    nitro: 100,
    isBoosting: false,
    inputs: {
      throttle: false,
      brake: false,
      left: false,
      right: false,
      nitro: false,
    },
    lastInputAt: Date.now(),
  };
}

export function resetPlayersForCountdown(room, now) {
  [...room.players.values()].forEach((player, index) => {
    const spawn = createSpawnPoint(room.track, index);
    const progress = getEllipseProgress(room.track, spawn.x, spawn.z);
    player.x = spawn.x;
    player.z = spawn.z;
    player.yaw = spawn.yaw;
    player.speed = 0;
    player.lap = 0;
    player.progress = progress;
    player.prevProgress = progress;
    player.completed = false;
    player.finishTimeMs = null;
    player.place = null;
    player.rank = 1;
    player.nitro = 100;
    player.isBoosting = false;
    player.bestLapMs = null;
    player.currentLapMs = 0;
    player.lastLapStartAt = now;
    player.inputs = {
      throttle: false,
      brake: false,
      left: false,
      right: false,
      nitro: false,
    };
  });
}

function rankPlayers(players) {
  const sorted = [...players].sort((a, b) => {
    if (a.completed && b.completed) {
      return sanitizeNumber(a.finishTimeMs, Infinity) - sanitizeNumber(b.finishTimeMs, Infinity);
    }
    if (a.completed) {
      return -1;
    }
    if (b.completed) {
      return 1;
    }
    if (a.lap !== b.lap) {
      return b.lap - a.lap;
    }
    if (a.progress !== b.progress) {
      return b.progress - a.progress;
    }
    return b.speed - a.speed;
  });

  sorted.forEach((player, index) => {
    player.rank = index + 1;
  });

  return sorted;
}

export function stepRoom(room, dt, now) {
  if (room.phase === "countdown" && room.countdownEndsAt && now >= room.countdownEndsAt) {
    room.phase = "racing";
    room.startedAt = now;
    [...room.players.values()].forEach((player) => {
      player.lastLapStartAt = now;
      player.currentLapMs = 0;
    });
  }

  if (room.phase === "racing") {
    [...room.players.values()].forEach((player) => {
      updateOnePlayer(room, player, dt, now);
    });
    resolveCarCollisions(room);
    rankPlayers(room.players.values());
  } else if (room.phase === "countdown") {
    rankPlayers(room.players.values());
  }

  if (room.phase === "racing") {
    const allDone = [...room.players.values()].every((player) => player.completed);
    const timedOutAfterFirstFinish =
      room.firstFinishAt && now - room.firstFinishAt > 15000;

    if (allDone || timedOutAfterFirstFinish) {
      room.phase = "finished";
      room.finishedAt = now;
      rankPlayers(room.players.values());
    }
  }
}

export function sanitizeInput(rawInput) {
  return {
    throttle: Boolean(rawInput?.throttle),
    brake: Boolean(rawInput?.brake),
    left: Boolean(rawInput?.left),
    right: Boolean(rawInput?.right),
    nitro: Boolean(rawInput?.nitro),
  };
}

export function createRoomSnapshot(room, now) {
  const sortedPlayers = rankPlayers(room.players.values());

  return {
    roomCode: room.code,
    phase: room.phase,
    hostId: room.hostId,
    lapsToWin: room.lapsToWin,
    countdownMs: room.phase === "countdown" ? Math.max(0, room.countdownEndsAt - now) : 0,
    startedAt: room.startedAt,
    finishedAt: room.finishedAt,
    track: room.track,
    players: sortedPlayers.map((player) => ({
      id: player.id,
      username: player.username,
      x: player.x,
      z: player.z,
      yaw: player.yaw,
      speed: player.speed,
      lap: player.lap,
      progress: player.progress,
      rank: player.rank,
      completed: player.completed,
      place: player.place,
      finishTimeMs: player.finishTimeMs,
      bestLapMs: player.bestLapMs,
      currentLapMs: player.currentLapMs,
      nitro: player.nitro,
      isBoosting: player.isBoosting,
    })),
  };
}
