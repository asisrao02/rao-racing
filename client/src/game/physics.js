import { LAPS_TO_WIN } from "./constants";
import {
  confinePlayerToTrack,
  createSpawnPoint,
  getTrackProgress,
} from "./track";

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

export function createSoloRace(username) {
  const spawn = createSpawnPoint(0);
  const progress = getTrackProgress(spawn.x, spawn.z);

  return {
    phase: "countdown",
    countdownEndsAt: Date.now() + 3000,
    startedAt: null,
    finishedAt: null,
    lapsToWin: LAPS_TO_WIN,
    player: {
      id: "solo-player",
      username,
      x: spawn.x,
      z: spawn.z,
      yaw: spawn.yaw,
      speed: 0,
      lap: 0,
      progress,
      prevProgress: progress,
      currentLapMs: 0,
      lastLapStartAt: Date.now(),
      bestLapMs: null,
      completed: false,
      finishTimeMs: null,
      rank: 1,
      nitro: 100,
      isBoosting: false,
    },
  };
}

export function stepSoloRace(race, controls, dt, now) {
  if (race.phase === "countdown" && now >= race.countdownEndsAt) {
    race.phase = "racing";
    race.startedAt = now;
    race.player.lastLapStartAt = now;
    race.player.currentLapMs = 0;
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

  if (turnInput !== 0 && Math.abs(player.speed) > 0.5) {
    const steerFactor = Math.min(1, Math.abs(player.speed) / 20);
    const speedDirection = player.speed >= 0 ? 1 : -1;
    player.yaw += turnInput * PHYSICS.steerRate * steerFactor * dt * speedDirection;
  }

  player.x += Math.sin(player.yaw) * player.speed * dt;
  player.z += Math.cos(player.yaw) * player.speed * dt;

  const trackInfo = confinePlayerToTrack(player);
  const progress = trackInfo.progress;

  if (player.prevProgress > 0.96 && progress < 0.08 && player.speed > 3) {
    const lapTime = player.lastLapStartAt ? now - player.lastLapStartAt : null;
    if (lapTime && lapTime > 1000) {
      player.bestLapMs = player.bestLapMs ? Math.min(player.bestLapMs, lapTime) : lapTime;
    }
    player.lap += 1;
    player.lastLapStartAt = now;
    if (player.lap >= race.lapsToWin) {
      player.completed = true;
      player.finishTimeMs = race.startedAt ? now - race.startedAt : null;
      race.phase = "finished";
      race.finishedAt = now;
    }
  }

  player.prevProgress = progress;
  player.progress = player.lap + progress;
  player.currentLapMs = player.lastLapStartAt ? now - player.lastLapStartAt : 0;

  return race;
}

export function getSoloSnapshot(race) {
  return {
    roomCode: "SOLO",
    phase: race.phase,
    lapsToWin: race.lapsToWin,
    countdownMs: race.phase === "countdown" ? Math.max(0, race.countdownEndsAt - Date.now()) : 0,
    players: [
      {
        id: race.player.id,
        username: race.player.username,
        x: race.player.x,
        z: race.player.z,
        yaw: race.player.yaw,
        speed: race.player.speed,
        lap: race.player.lap,
        rank: 1,
        progress: race.player.progress,
        completed: race.player.completed,
        place: 1,
        finishTimeMs: race.player.finishTimeMs,
        bestLapMs: race.player.bestLapMs,
        currentLapMs: race.player.currentLapMs,
        nitro: race.player.nitro,
        isBoosting: race.player.isBoosting,
      },
    ],
  };
}
