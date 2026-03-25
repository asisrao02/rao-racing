export const LAPS_TO_WIN = 0;
export const MAX_PLAYERS_PER_ROOM = 8;

const CAR_COLLISION_RADIUS = 2.3;
const BATTLE_DURATION_MS = 180000;
const RESPAWN_DELAY_MS = 2500;
const PLAYER_MAX_HP = 100;
const MAX_AMMO = 5;
const FIRE_COOLDOWN_MS = 420;
const PROJECTILE_SPEED = 124;
const PROJECTILE_LIFETIME_MS = 2400;
const PICKUP_RESPAWN_MS = 5000;

const TRACK_DIMENSIONS = {
  width: 2700,
  height: 1860,
  roadHalfWidth: 56,
  hardHalfWidth: 84,
};

// Large F1-inspired city circuit (about 3x the original map scale).
const CITY_CENTERLINE = [
  { x: -1180, z: -300 },
  { x: -980, z: -700 },
  { x: -420, z: -820 },
  { x: 140, z: -760 },
  { x: 620, z: -560 },
  { x: 1080, z: -260 },
  { x: 1220, z: 260 },
  { x: 1020, z: 700 },
  { x: 520, z: 940 },
  { x: -80, z: 980 },
  { x: -620, z: 860 },
  { x: -1040, z: 520 },
  { x: -1220, z: 120 },
  { x: -1060, z: -120 },
  { x: -760, z: -220 },
  { x: -340, z: -140 },
  { x: 120, z: -220 },
  { x: 520, z: -60 },
  { x: 400, z: 300 },
  { x: 60, z: 360 },
  { x: -340, z: 280 },
  { x: -700, z: 120 },
  { x: -980, z: -40 },
];

const PICKUP_PROGRESS_RATIOS = [
  0.03, 0.08, 0.13, 0.19, 0.24, 0.3, 0.36, 0.42, 0.49, 0.56, 0.63, 0.7, 0.77, 0.84, 0.9, 0.96,
];

const PHYSICS = {
  maxForwardSpeed: 72,
  maxReverseSpeed: -18,
  acceleration: 38,
  reverseAcceleration: 20,
  brakeForce: 54,
  friction: 13,
  steerRate: 2.25,
  nitroExtraAccel: 28,
  nitroTopSpeedMultiplier: 1.42,
  nitroDrainPerSecond: 28,
  nitroRegenPerSecond: 12,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildTrackSegments(centerline) {
  const segments = [];
  let totalLength = 0;

  for (let index = 0; index < centerline.length; index += 1) {
    const start = centerline[index];
    const end = centerline[(index + 1) % centerline.length];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.001) {
      continue;
    }

    segments.push({
      ax: start.x,
      az: start.z,
      bx: end.x,
      bz: end.z,
      dx,
      dz,
      length,
      ux: dx / length,
      uz: dz / length,
      cumulativeStart: totalLength,
    });

    totalLength += length;
  }

  return { segments, totalLength };
}

function sampleTrackPoint(track, distance) {
  if (!track.segments.length) {
    return { x: 0, z: 0, directionX: 0, directionZ: 1 };
  }

  const wrappedDistance = ((distance % track.length) + track.length) % track.length;

  for (const segment of track.segments) {
    const segmentEnd = segment.cumulativeStart + segment.length;
    if (wrappedDistance > segmentEnd) {
      continue;
    }

    const t = (wrappedDistance - segment.cumulativeStart) / segment.length;
    return {
      x: segment.ax + segment.dx * t,
      z: segment.az + segment.dz * t,
      directionX: segment.ux,
      directionZ: segment.uz,
    };
  }

  const first = track.segments[0];
  return {
    x: first.ax,
    z: first.az,
    directionX: first.ux,
    directionZ: first.uz,
  };
}

function nearestTrackPoint(track, x, z) {
  let best = null;

  for (const segment of track.segments) {
    const toPointX = x - segment.ax;
    const toPointZ = z - segment.az;
    const projection = (toPointX * segment.dx + toPointZ * segment.dz) / (segment.length * segment.length);
    const t = clamp(projection, 0, 1);
    const nearestX = segment.ax + segment.dx * t;
    const nearestZ = segment.az + segment.dz * t;
    const dx = x - nearestX;
    const dz = z - nearestZ;
    const distanceSq = dx * dx + dz * dz;

    if (!best || distanceSq < best.distanceSq) {
      best = {
        x: nearestX,
        z: nearestZ,
        dx,
        dz,
        distanceSq,
        segment,
      };
    }
  }

  if (!best) {
    return {
      x: 0,
      z: 0,
      distance: 0,
      distanceSq: 0,
      directionX: 0,
      directionZ: 1,
    };
  }

  return {
    x: best.x,
    z: best.z,
    dx: best.dx,
    dz: best.dz,
    distanceSq: best.distanceSq,
    distance: Math.sqrt(best.distanceSq),
    directionX: best.segment.ux,
    directionZ: best.segment.uz,
  };
}

function createPickupSpawns(track) {
  return PICKUP_PROGRESS_RATIOS.map((ratio, index) => {
    const point = sampleTrackPoint(track, track.length * ratio);
    const laneOffset = index % 3 === 0 ? 0 : index % 2 === 0 ? 14 : -14;
    const normalX = -point.directionZ;
    const normalZ = point.directionX;

    return {
      x: point.x + normalX * laneOffset,
      z: point.z + normalZ * laneOffset,
    };
  });
}

function createSpawnPoints(track) {
  const openingSegment = track.segments[0];
  const rightX = -openingSegment.uz;
  const rightZ = openingSegment.ux;
  const yaw = Math.atan2(openingSegment.ux, openingSegment.uz);
  const baseX = openingSegment.ax + openingSegment.ux * 48;
  const baseZ = openingSegment.az + openingSegment.uz * 48;
  const spawnPoints = [];
  const laneOffsets = [-13, 13];
  const rowSpacing = 26;

  for (let row = 0; row < 4; row += 1) {
    laneOffsets.forEach((laneOffset) => {
      const longitudinal = -row * rowSpacing;
      spawnPoints.push({
        x: baseX + openingSegment.ux * longitudinal + rightX * laneOffset,
        z: baseZ + openingSegment.uz * longitudinal + rightZ * laneOffset,
        yaw,
      });
    });
  }

  return spawnPoints;
}

function getSpawnPoint(track, spawnIndex) {
  const base = track.spawnPoints[spawnIndex % track.spawnPoints.length];
  return { ...base };
}

function resetPickups(room, now) {
  room.pickups = room.arena.pickupSpawns.map((spawn, index) => ({
    id: `pickup-${index}`,
    x: spawn.x,
    z: spawn.z,
    active: true,
    nextRespawnAt: now,
  }));
}

function applyTrackBounds(track, player) {
  const nearest = nearestTrackPoint(track, player.x, player.z);
  if (nearest.distance > track.roadHalfWidth) {
    player.speed *= 0.93;
  }

  if (nearest.distance <= track.hardHalfWidth) {
    return;
  }

  const safeDistance = track.hardHalfWidth - 2;
  const nx = nearest.distance > 0.001 ? nearest.dx / nearest.distance : -nearest.directionZ;
  const nz = nearest.distance > 0.001 ? nearest.dz / nearest.distance : nearest.directionX;
  player.x = nearest.x + nx * safeDistance;
  player.z = nearest.z + nz * safeDistance;
  player.speed *= -0.24;
}

function isWithinTrackLimits(track, x, z, padding = 0) {
  const nearest = nearestTrackPoint(track, x, z);
  return nearest.distance <= track.hardHalfWidth + padding;
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

function updateOnePlayer(room, player, dt) {
  if (player.isEliminated) {
    player.speed = 0;
    return;
  }

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

  if (turnInput !== 0 && Math.abs(player.speed) > 0.4) {
    const steerFactor = Math.min(1, Math.abs(player.speed) / 20);
    const speedDirection = player.speed >= 0 ? 1 : -1;
    player.yaw += turnInput * PHYSICS.steerRate * steerFactor * dt * speedDirection;
  }

  player.x += Math.sin(player.yaw) * player.speed * dt;
  player.z += Math.cos(player.yaw) * player.speed * dt;
  applyTrackBounds(room.arena, player);
}

function resolveCarCollisions(room) {
  const players = [...room.players.values()].filter((player) => !player.isEliminated);
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
      applyTrackBounds(room.arena, a);
      applyTrackBounds(room.arena, b);
      a.speed *= 0.87;
      b.speed *= 0.87;
    }
  }
}

function awardHit(attacker, victim, now) {
  if (attacker) {
    attacker.score += 6;
  }

  if (victim.hp <= 0) {
    victim.hp = 0;
    victim.isEliminated = true;
    victim.respawnAt = now + RESPAWN_DELAY_MS;
    victim.speed = 0;
    victim.deaths += 1;
    victim.ammo = 0;
    if (attacker) {
      attacker.kills += 1;
      attacker.score += 20;
    }
    victim.score = Math.max(0, victim.score - 5);
  }
}

function processPickups(room, now) {
  room.pickups.forEach((pickup) => {
    if (!pickup.active) {
      if (now >= pickup.nextRespawnAt) {
        pickup.active = true;
      }
      return;
    }

    for (const player of room.players.values()) {
      if (player.isEliminated) {
        continue;
      }
      const dx = player.x - pickup.x;
      const dz = player.z - pickup.z;
      if (dx * dx + dz * dz <= 100) {
        pickup.active = false;
        pickup.nextRespawnAt = now + PICKUP_RESPAWN_MS;
        player.ammo = Math.min(MAX_AMMO, player.ammo + 2);
        player.score += 1;
        break;
      }
    }
  });
}

function processShooting(room, now) {
  for (const player of room.players.values()) {
    if (player.isEliminated) {
      continue;
    }
    if (!player.inputs.fire) {
      continue;
    }
    if (player.ammo <= 0) {
      continue;
    }
    if (now - player.lastShotAt < FIRE_COOLDOWN_MS) {
      continue;
    }

    player.lastShotAt = now;
    player.ammo -= 1;
    room.projectiles.push({
      id: `${player.id}-${now}-${Math.random().toString(36).slice(2, 7)}`,
      ownerId: player.id,
      x: player.x + Math.sin(player.yaw) * 5,
      z: player.z + Math.cos(player.yaw) * 5,
      yaw: player.yaw,
      speed: PROJECTILE_SPEED,
      damage: 34,
      expiresAt: now + PROJECTILE_LIFETIME_MS,
    });
  }
}

function processProjectiles(room, dt, now) {
  const survivors = [];

  for (const projectile of room.projectiles) {
    if (now >= projectile.expiresAt) {
      continue;
    }

    projectile.x += Math.sin(projectile.yaw) * projectile.speed * dt;
    projectile.z += Math.cos(projectile.yaw) * projectile.speed * dt;

    if (!isWithinTrackLimits(room.arena, projectile.x, projectile.z, 16)) {
      continue;
    }

    let hit = false;
    for (const target of room.players.values()) {
      if (target.id === projectile.ownerId || target.isEliminated) {
        continue;
      }

      const dx = target.x - projectile.x;
      const dz = target.z - projectile.z;
      if (dx * dx + dz * dz <= 10.24) {
        target.hp -= projectile.damage;
        const attacker = room.players.get(projectile.ownerId);
        awardHit(attacker, target, now);
        hit = true;
        break;
      }
    }

    if (!hit) {
      survivors.push(projectile);
    }
  }

  room.projectiles = survivors;
}

function processRespawns(room, now) {
  let respawnCounter = 0;
  for (const player of room.players.values()) {
    if (!player.isEliminated || now < player.respawnAt) {
      continue;
    }

    const spawn = getSpawnPoint(room.arena, respawnCounter++);
    player.x = spawn.x;
    player.z = spawn.z;
    player.yaw = spawn.yaw;
    player.speed = 0;
    player.hp = PLAYER_MAX_HP;
    player.nitro = 100;
    player.ammo = 2;
    player.isEliminated = false;
    player.respawnAt = 0;
  }
}

function rankPlayers(players) {
  const sorted = [...players].sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    if (a.kills !== b.kills) {
      return b.kills - a.kills;
    }
    if (a.deaths !== b.deaths) {
      return a.deaths - b.deaths;
    }
    return b.nitro - a.nitro;
  });

  sorted.forEach((player, index) => {
    player.rank = index + 1;
    if (player.place == null && player.matchFinalized) {
      player.place = index + 1;
    }
  });

  return sorted;
}

function markBattleFinished(room) {
  room.phase = "finished";
  room.finishedAt = Date.now();
  const sorted = rankPlayers(room.players.values());
  sorted.forEach((player, index) => {
    player.place = index + 1;
    player.matchFinalized = true;
  });
}

export function sanitizeUsername(rawUsername) {
  const trimmed = String(rawUsername ?? "Racer").trim();
  if (!trimmed) {
    return "Racer";
  }
  return trimmed.replace(/[^\w\s-]/g, "").slice(0, 24) || "Racer";
}

export function createTrack() {
  const centerline = CITY_CENTERLINE.map((point) => ({ ...point }));
  const { segments, totalLength } = buildTrackSegments(centerline);
  const baseTrack = {
    name: "Neo City GP Circuit",
    width: TRACK_DIMENSIONS.width,
    height: TRACK_DIMENSIONS.height,
    roadHalfWidth: TRACK_DIMENSIONS.roadHalfWidth,
    hardHalfWidth: TRACK_DIMENSIONS.hardHalfWidth,
    centerline,
    segments,
    length: totalLength,
  };

  return {
    ...baseTrack,
    spawnPoints: createSpawnPoints(baseTrack),
    pickupSpawns: createPickupSpawns(baseTrack),
  };
}

export function createPlayerState({ id, username, spawnIndex, track }) {
  const spawn = getSpawnPoint(track, spawnIndex);

  return {
    id,
    username: sanitizeUsername(username),
    x: spawn.x,
    z: spawn.z,
    yaw: spawn.yaw,
    speed: 0,
    rank: 1,
    place: null,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    ammo: 2,
    score: 0,
    kills: 0,
    deaths: 0,
    nitro: 100,
    isBoosting: false,
    isEliminated: false,
    respawnAt: 0,
    lastShotAt: 0,
    matchFinalized: false,
    inputs: {
      throttle: false,
      brake: false,
      left: false,
      right: false,
      nitro: false,
      fire: false,
    },
    lastInputAt: Date.now(),
  };
}

export function resetPlayersForCountdown(room, now) {
  room.projectiles = [];
  room.battleEndsAt = null;
  room.matchDurationMs = BATTLE_DURATION_MS;
  resetPickups(room, now);

  [...room.players.values()].forEach((player, index) => {
    const spawn = getSpawnPoint(room.arena, index);
    player.x = spawn.x;
    player.z = spawn.z;
    player.yaw = spawn.yaw;
    player.speed = 0;
    player.rank = 1;
    player.place = null;
    player.hp = PLAYER_MAX_HP;
    player.maxHp = PLAYER_MAX_HP;
    player.ammo = 2;
    player.score = 0;
    player.kills = 0;
    player.deaths = 0;
    player.nitro = 100;
    player.isBoosting = false;
    player.isEliminated = false;
    player.respawnAt = 0;
    player.lastShotAt = 0;
    player.matchFinalized = false;
    player.inputs = {
      throttle: false,
      brake: false,
      left: false,
      right: false,
      nitro: false,
      fire: false,
    };
  });
}

export function stepRoom(room, dt, now) {
  if (room.phase === "countdown" && room.countdownEndsAt && now >= room.countdownEndsAt) {
    room.phase = "racing";
    room.startedAt = now;
    room.battleEndsAt = now + room.matchDurationMs;
  }

  if (room.phase === "racing") {
    for (const player of room.players.values()) {
      updateOnePlayer(room, player, dt);
    }

    resolveCarCollisions(room);
    processPickups(room, now);
    processShooting(room, now);
    processProjectiles(room, dt, now);
    processRespawns(room, now);
    rankPlayers(room.players.values());

    if (room.battleEndsAt && now >= room.battleEndsAt) {
      markBattleFinished(room);
    }
  } else if (room.phase === "countdown") {
    rankPlayers(room.players.values());
  }
}

export function sanitizeInput(rawInput) {
  return {
    throttle: Boolean(rawInput?.throttle),
    brake: Boolean(rawInput?.brake),
    left: Boolean(rawInput?.left),
    right: Boolean(rawInput?.right),
    nitro: Boolean(rawInput?.nitro),
    fire: Boolean(rawInput?.fire),
  };
}

export function createRoomSnapshot(room, now) {
  const sortedPlayers = rankPlayers(room.players.values());
  return {
    roomCode: room.code,
    phase: room.phase,
    hostId: room.hostId,
    countdownMs: room.phase === "countdown" ? Math.max(0, room.countdownEndsAt - now) : 0,
    startedAt: room.startedAt,
    finishedAt: room.finishedAt,
    matchDurationMs: room.matchDurationMs ?? BATTLE_DURATION_MS,
    timeLeftMs:
      room.phase === "racing" && room.battleEndsAt ? Math.max(0, room.battleEndsAt - now) : 0,
    arena: {
      name: room.arena.name,
      width: room.arena.width,
      height: room.arena.height,
      length: room.arena.length,
      roadHalfWidth: room.arena.roadHalfWidth,
      hardHalfWidth: room.arena.hardHalfWidth,
      centerline: room.arena.centerline,
    },
    players: sortedPlayers.map((player) => ({
      id: player.id,
      username: player.username,
      x: player.x,
      z: player.z,
      yaw: player.yaw,
      speed: player.speed,
      rank: player.rank,
      place: player.place,
      hp: player.hp,
      maxHp: player.maxHp,
      ammo: player.ammo,
      score: player.score,
      kills: player.kills,
      deaths: player.deaths,
      nitro: player.nitro,
      isBoosting: player.isBoosting,
      isEliminated: player.isEliminated,
      respawnInMs: player.isEliminated ? Math.max(0, player.respawnAt - now) : 0,
    })),
    pickups: room.pickups.map((pickup) => ({
      id: pickup.id,
      x: pickup.x,
      z: pickup.z,
      active: pickup.active,
    })),
    projectiles: room.projectiles.map((projectile) => ({
      id: projectile.id,
      x: projectile.x,
      z: projectile.z,
      ownerId: projectile.ownerId,
    })),
  };
}
