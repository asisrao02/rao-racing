export const LAPS_TO_WIN = 3;
export const MAX_PLAYERS_PER_ROOM = 8;

const TRACK_WIDTH = 38;
const CAR_COLLISION_RADIUS = 2.3;

const TRACK_CONTROL_POINTS = [
  { x: 0, z: 0 },
  { x: 180, z: -20 },
  { x: 420, z: -10 },
  { x: 760, z: 40 },
  { x: 980, z: 180 },
  { x: 960, z: 380 },
  { x: 820, z: 560 },
  { x: 620, z: 700 },
  { x: 360, z: 760 },
  { x: 120, z: 700 },
  { x: -60, z: 560 },
  { x: -220, z: 460 },
  { x: -480, z: 470 },
  { x: -760, z: 380 },
  { x: -980, z: 180 },
  { x: -960, z: -120 },
  { x: -760, z: -300 },
  { x: -520, z: -420 },
  { x: -220, z: -500 },
  { x: 60, z: -470 },
  { x: 320, z: -390 },
  { x: 520, z: -280 },
  { x: 700, z: -180 },
];

const PHYSICS = {
  maxForwardSpeed: 54,
  maxReverseSpeed: -16,
  acceleration: 33,
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

function catmullRomScalar(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function generateCenterline(points, samplesPerSegment = 26) {
  const output = [];
  const count = points.length;

  for (let index = 0; index < count; index += 1) {
    const p0 = points[(index - 1 + count) % count];
    const p1 = points[index];
    const p2 = points[(index + 1) % count];
    const p3 = points[(index + 2) % count];

    for (let sample = 0; sample < samplesPerSegment; sample += 1) {
      const t = sample / samplesPerSegment;
      output.push({
        x: catmullRomScalar(p0.x, p1.x, p2.x, p3.x, t),
        z: catmullRomScalar(p0.z, p1.z, p2.z, p3.z, t),
      });
    }
  }

  return output;
}

function buildTrackSegments(centerline) {
  const segments = [];
  let totalLength = 0;

  for (let index = 0; index < centerline.length; index += 1) {
    const a = centerline[index];
    const b = centerline[(index + 1) % centerline.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.0001) {
      continue;
    }

    segments.push({
      ax: a.x,
      az: a.z,
      bx: b.x,
      bz: b.z,
      dx,
      dz,
      length,
      startLength: totalLength,
    });

    totalLength += length;
  }

  return { segments, totalLength };
}

function buildBounds(points, margin = 240) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  });

  return {
    minX: minX - margin,
    maxX: maxX + margin,
    minZ: minZ - margin,
    maxZ: maxZ + margin,
  };
}

function closestPointOnTrack(track, x, z) {
  let best = null;

  for (const segment of track.segments) {
    const lengthSquared = segment.length * segment.length;
    const apx = x - segment.ax;
    const apz = z - segment.az;
    const t = clamp((apx * segment.dx + apz * segment.dz) / lengthSquared, 0, 1);
    const closestX = segment.ax + segment.dx * t;
    const closestZ = segment.az + segment.dz * t;
    const dx = x - closestX;
    const dz = z - closestZ;
    const distanceSq = dx * dx + dz * dz;

    if (!best || distanceSq < best.distanceSq) {
      const distance = Math.sqrt(distanceSq);
      const tangentX = segment.dx / segment.length;
      const tangentZ = segment.dz / segment.length;
      const fallbackNormalX = -tangentZ;
      const fallbackNormalZ = tangentX;
      const outNormalX = distance > 0.0001 ? dx / distance : fallbackNormalX;
      const outNormalZ = distance > 0.0001 ? dz / distance : fallbackNormalZ;

      best = {
        distanceSq,
        distance,
        closestX,
        closestZ,
        tangentX,
        tangentZ,
        outNormalX,
        outNormalZ,
        progress: (segment.startLength + segment.length * t) / track.totalLength,
      };
    }
  }

  return best;
}

function createSpawnPoint(track, spawnIndex) {
  const row = Math.floor(spawnIndex / 2);
  const laneSign = spawnIndex % 2 === 0 ? -1 : 1;
  const backOffset = row * 10;
  const lateralOffset = laneSign * (track.width * 0.23);

  const x = track.startPoint.x - track.startTangent.x * backOffset + track.startNormal.x * lateralOffset;
  const z = track.startPoint.z - track.startTangent.z * backOffset + track.startNormal.z * lateralOffset;

  return {
    x,
    z,
    yaw: Math.atan2(track.startTangent.x, track.startTangent.z),
  };
}

function confinePlayerToTrack(track, player) {
  const info = closestPointOnTrack(track, player.x, player.z);
  if (!info) {
    return { progress: 0 };
  }

  if (info.distance > track.halfWidth) {
    const clampDistance = track.halfWidth * 0.995;
    player.x = info.closestX + info.outNormalX * clampDistance;
    player.z = info.closestZ + info.outNormalZ * clampDistance;
    player.speed *= -0.28;
  } else if (info.distance > track.halfWidth * 0.88) {
    player.speed *= 0.992;
  }

  return info;
}

export function sanitizeUsername(rawUsername) {
  const trimmed = String(rawUsername ?? "Racer").trim();
  if (!trimmed) {
    return "Racer";
  }
  return trimmed.replace(/[^\w\s-]/g, "").slice(0, 24) || "Racer";
}

export function createTrack() {
  const centerline = generateCenterline(TRACK_CONTROL_POINTS, 26);
  const { segments, totalLength } = buildTrackSegments(centerline);
  const firstSegment = segments[0];
  const tangentX = firstSegment.dx / firstSegment.length;
  const tangentZ = firstSegment.dz / firstSegment.length;

  return {
    name: "Rao Grand Circuit",
    width: TRACK_WIDTH,
    halfWidth: TRACK_WIDTH * 0.5,
    controlPoints: TRACK_CONTROL_POINTS,
    centerline,
    segments,
    totalLength,
    startPoint: { x: firstSegment.ax, z: firstSegment.az },
    startTangent: { x: tangentX, z: tangentZ },
    startNormal: { x: -tangentZ, z: tangentX },
    bounds: buildBounds(centerline),
  };
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
  if (controls.nitro && player.nitro > 0 && player.speed > 6) {
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

  const trackInfo = confinePlayerToTrack(room.track, player);
  const newProgress = trackInfo.progress;

  if (!player.completed) {
    if (player.prevProgress > 0.96 && newProgress < 0.08 && player.speed > 3) {
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
  const progress = closestPointOnTrack(track, spawn.x, spawn.z)?.progress ?? 0;

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
    const progress = closestPointOnTrack(room.track, spawn.x, spawn.z)?.progress ?? 0;
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
    if (a.completed) return -1;
    if (b.completed) return 1;
    if (a.lap !== b.lap) return b.lap - a.lap;
    if (a.progress !== b.progress) return b.progress - a.progress;
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
    const timedOutAfterFirstFinish = room.firstFinishAt && now - room.firstFinishAt > 15000;
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
    track: {
      name: room.track.name,
      width: room.track.width,
      totalLength: Math.round(room.track.totalLength),
    },
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
