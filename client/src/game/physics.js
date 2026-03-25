import { DEFAULT_CONTROLS } from "./constants";

const TRACK_DIMENSIONS = {
  width: 2700,
  height: 1860,
  roadHalfWidth: 56,
  hardHalfWidth: 84,
};

const MATCH_DURATION_MS = 120000;
const PLAYER_MAX_HP = 100;
const MAX_AMMO = 5;
const FIRE_COOLDOWN_MS = 420;
const PROJECTILE_SPEED = 124;
const PROJECTILE_LIFETIME_MS = 2400;
const PICKUP_RESPAWN_MS = 5000;

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
        directionX: segment.ux,
        directionZ: segment.uz,
      };
    }
  }

  if (!best) {
    return {
      x: 0,
      z: 0,
      distance: 0,
      distanceSq: 0,
      dx: 0,
      dz: 0,
      directionX: 0,
      directionZ: 1,
    };
  }

  return {
    ...best,
    distance: Math.sqrt(best.distanceSq),
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

function createTrackDefinition() {
  const centerline = CITY_CENTERLINE.map((point) => ({ ...point }));
  const { segments, totalLength } = buildTrackSegments(centerline);
  const base = {
    name: "Solo Neo City GP Circuit",
    width: TRACK_DIMENSIONS.width,
    height: TRACK_DIMENSIONS.height,
    roadHalfWidth: TRACK_DIMENSIONS.roadHalfWidth,
    hardHalfWidth: TRACK_DIMENSIONS.hardHalfWidth,
    centerline,
    segments,
    length: totalLength,
  };

  return {
    ...base,
    spawnPoints: createSpawnPoints(base),
    pickupSpawns: createPickupSpawns(base),
  };
}

const SOLO_TRACK = createTrackDefinition();

function createSpawnPoint() {
  return { ...SOLO_TRACK.spawnPoints[0] };
}

function resetPickups(now) {
  return SOLO_TRACK.pickupSpawns.map((spawn, index) => ({
    id: `pickup-${index}`,
    x: spawn.x,
    z: spawn.z,
    active: true,
    nextRespawnAt: now,
  }));
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

function applyTrackBounds(player) {
  const nearest = nearestTrackPoint(SOLO_TRACK, player.x, player.z);
  if (nearest.distance > SOLO_TRACK.roadHalfWidth) {
    player.speed *= 0.93;
  }
  if (nearest.distance <= SOLO_TRACK.hardHalfWidth) {
    return;
  }

  const safeDistance = SOLO_TRACK.hardHalfWidth - 2;
  const nx = nearest.distance > 0.001 ? nearest.dx / nearest.distance : -nearest.directionZ;
  const nz = nearest.distance > 0.001 ? nearest.dz / nearest.distance : nearest.directionX;
  player.x = nearest.x + nx * safeDistance;
  player.z = nearest.z + nz * safeDistance;
  player.speed *= -0.24;
}

function processPickups(race, now) {
  race.pickups.forEach((pickup) => {
    if (!pickup.active) {
      if (now >= pickup.nextRespawnAt) {
        pickup.active = true;
      }
      return;
    }

    const dx = race.player.x - pickup.x;
    const dz = race.player.z - pickup.z;
    if (dx * dx + dz * dz <= 100) {
      pickup.active = false;
      pickup.nextRespawnAt = now + PICKUP_RESPAWN_MS;
      race.player.ammo = Math.min(MAX_AMMO, race.player.ammo + 2);
      race.player.score += 1;
    }
  });
}

function processShooting(race, controls, now) {
  if (!controls.fire || race.player.ammo <= 0) {
    return;
  }
  if (now - race.player.lastShotAt < FIRE_COOLDOWN_MS) {
    return;
  }

  race.player.lastShotAt = now;
  race.player.ammo -= 1;
  race.projectiles.push({
    id: `solo-shot-${now}-${Math.random().toString(36).slice(2, 7)}`,
    x: race.player.x + Math.sin(race.player.yaw) * 5,
    z: race.player.z + Math.cos(race.player.yaw) * 5,
    yaw: race.player.yaw,
    speed: PROJECTILE_SPEED,
    expiresAt: now + PROJECTILE_LIFETIME_MS,
  });
}

function processProjectiles(race, dt, now) {
  const survivors = [];

  race.projectiles.forEach((projectile) => {
    if (now >= projectile.expiresAt) {
      return;
    }

    projectile.x += Math.sin(projectile.yaw) * projectile.speed * dt;
    projectile.z += Math.cos(projectile.yaw) * projectile.speed * dt;
    const nearest = nearestTrackPoint(SOLO_TRACK, projectile.x, projectile.z);
    if (nearest.distance > SOLO_TRACK.hardHalfWidth + 16) {
      return;
    }

    survivors.push(projectile);
  });

  race.projectiles = survivors;
}

export function createSoloRace(username) {
  const now = Date.now();
  const spawn = createSpawnPoint();
  return {
    phase: "countdown",
    countdownEndsAt: now + 3000,
    startedAt: null,
    finishedAt: null,
    battleEndsAt: null,
    matchDurationMs: MATCH_DURATION_MS,
    pickups: resetPickups(now),
    projectiles: [],
    player: {
      id: "solo-player",
      username,
      x: spawn.x,
      z: spawn.z,
      yaw: spawn.yaw,
      speed: 0,
      rank: 1,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      ammo: 3,
      score: 0,
      kills: 0,
      deaths: 0,
      nitro: 100,
      isBoosting: false,
      isEliminated: false,
      respawnInMs: 0,
      lastShotAt: 0,
      inputs: { ...DEFAULT_CONTROLS },
    },
  };
}

export function stepSoloRace(race, controls, dt, now) {
  if (race.phase === "countdown" && now >= race.countdownEndsAt) {
    race.phase = "racing";
    race.startedAt = now;
    race.battleEndsAt = now + race.matchDurationMs;
  }

  if (race.phase !== "racing") {
    return race;
  }

  const player = race.player;
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
  applyTrackBounds(player);

  processPickups(race, now);
  processShooting(race, controls, now);
  processProjectiles(race, dt, now);

  if (race.battleEndsAt && now >= race.battleEndsAt) {
    race.phase = "finished";
    race.finishedAt = now;
    player.place = 1;
  }

  return race;
}

export function getSoloSnapshot(race) {
  return {
    roomCode: "SOLO",
    phase: race.phase,
    countdownMs: race.phase === "countdown" ? Math.max(0, race.countdownEndsAt - Date.now()) : 0,
    startedAt: race.startedAt,
    finishedAt: race.finishedAt,
    matchDurationMs: race.matchDurationMs,
    timeLeftMs: race.battleEndsAt ? Math.max(0, race.battleEndsAt - Date.now()) : 0,
    arena: {
      name: SOLO_TRACK.name,
      width: SOLO_TRACK.width,
      height: SOLO_TRACK.height,
      length: SOLO_TRACK.length,
      roadHalfWidth: SOLO_TRACK.roadHalfWidth,
      hardHalfWidth: SOLO_TRACK.hardHalfWidth,
      centerline: SOLO_TRACK.centerline,
    },
    players: [
      {
        id: race.player.id,
        username: race.player.username,
        x: race.player.x,
        z: race.player.z,
        yaw: race.player.yaw,
        speed: race.player.speed,
        rank: race.player.rank,
        place: race.player.place,
        hp: race.player.hp,
        maxHp: race.player.maxHp,
        ammo: race.player.ammo,
        score: race.player.score,
        kills: race.player.kills,
        deaths: race.player.deaths,
        nitro: race.player.nitro,
        isBoosting: race.player.isBoosting,
        isEliminated: race.player.isEliminated,
        respawnInMs: 0,
      },
    ],
    pickups: race.pickups.map((pickup) => ({
      id: pickup.id,
      x: pickup.x,
      z: pickup.z,
      active: pickup.active,
    })),
    projectiles: race.projectiles.map((projectile) => ({
      id: projectile.id,
      x: projectile.x,
      z: projectile.z,
      ownerId: "solo-player",
    })),
  };
}
