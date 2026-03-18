const TRACK_WIDTH = 38;

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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function generateCenterline(points, samplesPerSegment = 24) {
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

function createTrackData() {
  const centerline = generateCenterline(TRACK_CONTROL_POINTS, 26);
  const { segments, totalLength } = buildTrackSegments(centerline);
  const firstSegment = segments[0];
  const tangentX = firstSegment.dx / firstSegment.length;
  const tangentZ = firstSegment.dz / firstSegment.length;
  const normalX = -tangentZ;
  const normalZ = tangentX;

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
    startNormal: { x: normalX, z: normalZ },
    bounds: buildBounds(centerline),
  };
}

export const TRACK_DATA = createTrackData();

export function closestPointOnTrack(x, z) {
  let best = null;

  for (const segment of TRACK_DATA.segments) {
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
        progress: (segment.startLength + segment.length * t) / TRACK_DATA.totalLength,
      };
    }
  }

  return best;
}

export function getTrackProgress(x, z) {
  return closestPointOnTrack(x, z)?.progress ?? 0;
}

export function confinePlayerToTrack(player) {
  const info = closestPointOnTrack(player.x, player.z);
  if (!info) {
    return { progress: 0 };
  }

  if (info.distance > TRACK_DATA.halfWidth) {
    const clampDistance = TRACK_DATA.halfWidth * 0.995;
    player.x = info.closestX + info.outNormalX * clampDistance;
    player.z = info.closestZ + info.outNormalZ * clampDistance;
    player.speed *= -0.28;
  } else if (info.distance > TRACK_DATA.halfWidth * 0.88) {
    // Slight edge drag near boundary to encourage cleaner racing lines.
    player.speed *= 0.992;
  }

  return info;
}

export function createSpawnPoint(spawnIndex) {
  const row = Math.floor(spawnIndex / 2);
  const laneSign = spawnIndex % 2 === 0 ? -1 : 1;
  const backOffset = row * 10;
  const lateralOffset = laneSign * (TRACK_DATA.width * 0.23);

  const x =
    TRACK_DATA.startPoint.x -
    TRACK_DATA.startTangent.x * backOffset +
    TRACK_DATA.startNormal.x * lateralOffset;
  const z =
    TRACK_DATA.startPoint.z -
    TRACK_DATA.startTangent.z * backOffset +
    TRACK_DATA.startNormal.z * lateralOffset;

  return {
    x,
    z,
    yaw: Math.atan2(TRACK_DATA.startTangent.x, TRACK_DATA.startTangent.z),
  };
}
