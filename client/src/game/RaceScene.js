import * as THREE from "three";
import { TRACK_DATA, closestPointOnTrack } from "./track";

function hashColor(input) {
  const palette = [0xff5a2a, 0x2afff1, 0x89ff2a, 0xffde2a, 0xff2ac3, 0x2a95ff, 0xc22aff, 0xffffff];
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

function lerpAngle(current, target, alpha) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * alpha;
}

function noise2D(x, z, seed = 1) {
  const value = Math.sin(x * 127.1 + z * 311.7 + seed * 53.3) * 43758.5453123;
  return value - Math.floor(value);
}

function computeBoundaryPoints(centerline, halfWidth) {
  const outer = [];
  const inner = [];
  const count = centerline.length;

  for (let index = 0; index < count; index += 1) {
    const prev = centerline[(index - 1 + count) % count];
    const current = centerline[index];
    const next = centerline[(index + 1) % count];

    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const length = Math.hypot(tx, tz) || 1;
    const tangentX = tx / length;
    const tangentZ = tz / length;
    const normalX = -tangentZ;
    const normalZ = tangentX;

    outer.push({
      x: current.x + normalX * halfWidth,
      z: current.z + normalZ * halfWidth,
    });
    inner.push({
      x: current.x - normalX * halfWidth,
      z: current.z - normalZ * halfWidth,
    });
  }

  return { outer, inner };
}

function buildTrackMesh() {
  const group = new THREE.Group();
  const { minX, maxX, minZ, maxZ } = TRACK_DATA.bounds;
  const planeWidth = maxX - minX + 500;
  const planeHeight = maxZ - minZ + 500;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(planeWidth, planeHeight),
    new THREE.MeshStandardMaterial({ color: 0x080e18, roughness: 0.95, metalness: 0.05 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  ground.receiveShadow = true;
  group.add(ground);

  const { outer, inner } = computeBoundaryPoints(TRACK_DATA.centerline, TRACK_DATA.halfWidth);
  const roadShape = new THREE.Shape();
  roadShape.moveTo(outer[0].x, outer[0].z);
  for (let index = 1; index < outer.length; index += 1) {
    roadShape.lineTo(outer[index].x, outer[index].z);
  }
  roadShape.lineTo(outer[0].x, outer[0].z);

  const hole = new THREE.Path();
  const reversedInner = [...inner].reverse();
  hole.moveTo(reversedInner[0].x, reversedInner[0].z);
  for (let index = 1; index < reversedInner.length; index += 1) {
    hole.lineTo(reversedInner[index].x, reversedInner[index].z);
  }
  hole.lineTo(reversedInner[0].x, reversedInner[0].z);
  roadShape.holes.push(hole);

  const roadGeometry = new THREE.ShapeGeometry(roadShape, 3);
  roadGeometry.rotateX(-Math.PI / 2);
  const road = new THREE.Mesh(
    roadGeometry,
    new THREE.MeshStandardMaterial({
      color: 0x2f3642,
      roughness: 0.82,
      metalness: 0.15,
    })
  );
  road.position.y = 0.01;
  road.receiveShadow = true;
  group.add(road);

  const curbMaterialA = new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 0.5 });
  const curbMaterialB = new THREE.MeshStandardMaterial({ color: 0xd5372a, roughness: 0.5 });

  for (let index = 0; index < TRACK_DATA.centerline.length; index += 8) {
    const current = TRACK_DATA.centerline[index];
    const next = TRACK_DATA.centerline[(index + 1) % TRACK_DATA.centerline.length];
    const tx = next.x - current.x;
    const tz = next.z - current.z;
    const length = Math.hypot(tx, tz) || 1;
    const tangentX = tx / length;
    const tangentZ = tz / length;
    const normalX = -tangentZ;
    const normalZ = tangentX;
    const yaw = Math.atan2(tangentX, tangentZ);
    const curbMaterial = Math.floor(index / 8) % 2 === 0 ? curbMaterialA : curbMaterialB;

    const outerCurb = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.24, 2.8), curbMaterial);
    outerCurb.position.set(
      current.x + normalX * (TRACK_DATA.halfWidth + 2.5),
      0.12,
      current.z + normalZ * (TRACK_DATA.halfWidth + 2.5)
    );
    outerCurb.rotation.y = yaw;
    group.add(outerCurb);

    const innerCurb = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.24, 2.8), curbMaterial);
    innerCurb.position.set(
      current.x - normalX * (TRACK_DATA.halfWidth + 2.5),
      0.12,
      current.z - normalZ * (TRACK_DATA.halfWidth + 2.5)
    );
    innerCurb.rotation.y = yaw;
    group.add(innerCurb);
  }

  const laneMarkerMaterial = new THREE.MeshStandardMaterial({ color: 0xe6ecf5, roughness: 0.35 });
  const laneMarkerCount = Math.max(130, Math.floor(TRACK_DATA.totalLength / 24));
  for (let markerIndex = 0; markerIndex < laneMarkerCount; markerIndex += 1) {
    const sampleIndex = Math.floor((markerIndex / laneMarkerCount) * TRACK_DATA.centerline.length);
    const current = TRACK_DATA.centerline[sampleIndex];
    const next = TRACK_DATA.centerline[(sampleIndex + 1) % TRACK_DATA.centerline.length];
    const yaw = Math.atan2(next.x - current.x, next.z - current.z);
    const marker = new THREE.Mesh(new THREE.BoxGeometry(3, 0.03, 0.35), laneMarkerMaterial);
    marker.position.set(current.x, 0.05, current.z);
    marker.rotation.y = yaw;
    group.add(marker);
  }

  const finishLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.04, TRACK_DATA.width + 10),
    new THREE.MeshStandardMaterial({ color: 0xf4f4f4, emissive: 0x222222, emissiveIntensity: 0.35 })
  );
  finishLine.position.set(TRACK_DATA.startPoint.x, 0.06, TRACK_DATA.startPoint.z);
  finishLine.rotation.y = Math.atan2(TRACK_DATA.startNormal.x, TRACK_DATA.startNormal.z);
  group.add(finishLine);

  return group;
}

function buildCity() {
  const city = new THREE.Group();
  const { minX, maxX, minZ, maxZ } = TRACK_DATA.bounds;
  const margin = 260;
  const step = 70;

  for (let gx = minX - margin; gx <= maxX + margin; gx += step) {
    for (let gz = minZ - margin; gz <= maxZ + margin; gz += step) {
      const trackDistance = closestPointOnTrack(gx, gz)?.distance ?? 9999;
      if (trackDistance < TRACK_DATA.width * 1.9) {
        continue;
      }

      const randA = noise2D(gx * 0.02, gz * 0.02, 1);
      const randB = noise2D(gx * 0.03, gz * 0.04, 2);
      const randC = noise2D(gx * 0.05, gz * 0.01, 3);
      const width = 18 + randA * 18;
      const depth = 18 + randB * 18;
      const height = 26 + randC * 210;
      const offsetX = (randA - 0.5) * 18;
      const offsetZ = (randB - 0.5) * 18;

      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(0.56 + randA * 0.05, 0.38, 0.12 + randB * 0.14),
          roughness: 0.9,
          metalness: 0.2,
          emissive: new THREE.Color(0x061322),
          emissiveIntensity: 0.35,
        })
      );
      building.position.set(gx + offsetX, height * 0.5, gz + offsetZ);
      building.castShadow = true;
      building.receiveShadow = true;
      city.add(building);
    }
  }

  const lampCount = 80;
  const ringRadius = (TRACK_DATA.bounds.maxX - TRACK_DATA.bounds.minX) * 0.65;
  for (let index = 0; index < lampCount; index += 1) {
    const t = (index / lampCount) * Math.PI * 2;
    const x = Math.cos(t) * ringRadius;
    const z = Math.sin(t) * ringRadius * 0.72;

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.8, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0x2a2f37, roughness: 0.7 })
    );
    pole.position.set(x, 7, z);
    pole.castShadow = true;
    city.add(pole);

    const lamp = new THREE.PointLight(0x4cf8ff, 0.85, 95, 1.8);
    lamp.position.set(x, 14, z);
    city.add(lamp);
  }

  return city;
}

function buildCarMesh(color) {
  const car = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.8, 4.2),
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 })
  );
  body.position.y = 0.85;
  car.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.6, 2),
    new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.2, metalness: 0.65 })
  );
  cabin.position.set(0, 1.35, -0.2);
  car.add(cabin);

  const bumper = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.25, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x111111 })
  );
  bumper.position.set(0, 0.5, 2.1);
  car.add(bumper);

  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 });
  const wheelOffsets = [
    [-1.1, 0.45, -1.35],
    [1.1, 0.45, -1.35],
    [-1.1, 0.45, 1.35],
    [1.1, 0.45, 1.35],
  ];
  wheelOffsets.forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.45, 20), wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    car.add(wheel);
  });

  return car;
}

function createNameTag(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(8, 18, 32, 0.82)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(76, 248, 255, 0.85)";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  ctx.font = "700 28px Rajdhani";
  ctx.fillStyle = "#f3f9ff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.slice(0, 18), canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(7.4, 1.85, 1);
  sprite.position.set(0, 3, 0);
  return sprite;
}

export class RaceScene {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06101d);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 4200);
    this.camera.position.set(0, 13, -28);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.players = new Map();
    this.localPlayerId = null;
    this.clock = new THREE.Clock();
    this.rafId = null;
    this.targetLookAt = new THREE.Vector3(0, 0, 0);
    this.tempCameraOffset = new THREE.Vector3(0, 12, -24);
    this.upVector = new THREE.Vector3(0, 1, 0);

    this.setupLights();
    this.setupWorld();
    this.handleResize = this.handleResize.bind(this);
    this.tick = this.tick.bind(this);

    window.addEventListener("resize", this.handleResize);
    this.handleResize();
    this.rafId = requestAnimationFrame(this.tick);
  }

  setupLights() {
    const hemi = new THREE.HemisphereLight(0x7bd6ff, 0x0f2614, 0.56);
    this.scene.add(hemi);

    const directional = new THREE.DirectionalLight(0xffffff, 1.05);
    directional.position.set(80, 100, -30);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 2048;
    directional.shadow.mapSize.height = 2048;
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = 1200;
    directional.shadow.camera.left = -350;
    directional.shadow.camera.right = 350;
    directional.shadow.camera.top = 350;
    directional.shadow.camera.bottom = -350;
    this.scene.add(directional);
  }

  setupWorld() {
    this.scene.add(buildTrackMesh());
    this.scene.add(buildCity());

    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(3200, 36, 24),
      new THREE.MeshBasicMaterial({
        color: 0x14263d,
        side: THREE.BackSide,
      })
    );
    this.scene.add(skyDome);
  }

  setLocalPlayer(playerId) {
    this.localPlayerId = playerId;
  }

  setSnapshot(players) {
    const seen = new Set(players.map((player) => player.id));

    this.players.forEach((visual, playerId) => {
      if (!seen.has(playerId)) {
        this.scene.remove(visual.root);
        visual.nameTag.material?.map?.dispose?.();
        visual.nameTag.material?.dispose?.();
        this.players.delete(playerId);
      }
    });

    players.forEach((player) => {
      let visual = this.players.get(player.id);
      if (!visual) {
        visual = this.createPlayerVisual(player);
        this.players.set(player.id, visual);
        this.scene.add(visual.root);
      }

      visual.targetPosition.set(player.x, 0, player.z);
      visual.targetYaw = player.yaw;
      visual.speed = player.speed;
      visual.boosting = player.isBoosting;
    });
  }

  createPlayerVisual(player) {
    const root = new THREE.Group();
    const color = hashColor(player.id);
    const car = buildCarMesh(color);
    car.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    root.add(car);
    root.position.set(player.x, 0, player.z);
    root.rotation.y = player.yaw;

    const nameTag = createNameTag(player.username);
    root.add(nameTag);

    return {
      id: player.id,
      root,
      car,
      nameTag,
      currentYaw: player.yaw,
      targetYaw: player.yaw,
      targetPosition: new THREE.Vector3(player.x, 0, player.z),
      speed: player.speed,
      boosting: false,
    };
  }

  tick() {
    this.rafId = requestAnimationFrame(this.tick);
    const delta = this.clock.getDelta();

    this.players.forEach((visual, playerId) => {
      const followStrength = playerId === this.localPlayerId ? 0.28 : 0.18;
      visual.root.position.lerp(visual.targetPosition, followStrength);
      visual.currentYaw = lerpAngle(visual.currentYaw, visual.targetYaw, followStrength);
      visual.root.rotation.y = visual.currentYaw;

      const emissiveIntensity = visual.boosting ? 0.8 : 0.25;
      const body = visual.car.children[0];
      if (body?.material) {
        body.material.emissive = new THREE.Color(0xff4f1f);
        body.material.emissiveIntensity = emissiveIntensity;
      }

      const bob = Math.sin(performance.now() * 0.002 + visual.root.position.x * 0.1) * 0.02;
      visual.car.position.y = bob;
    });

    this.updateCamera(delta);
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(delta) {
    const targetVisual =
      (this.localPlayerId && this.players.get(this.localPlayerId)) || this.players.values().next().value;

    if (!targetVisual) {
      this.camera.lookAt(this.targetLookAt);
      return;
    }

    this.tempCameraOffset.set(0, 12, -24);
    this.tempCameraOffset.applyAxisAngle(this.upVector, targetVisual.currentYaw);

    const desiredPosition = targetVisual.root.position.clone().add(this.tempCameraOffset);
    const lerpFactor = 1 - Math.exp(-delta * 6);
    this.camera.position.lerp(desiredPosition, lerpFactor);

    this.targetLookAt.copy(targetVisual.root.position).add(new THREE.Vector3(0, 2, 0));
    this.camera.lookAt(this.targetLookAt);
  }

  handleResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    window.removeEventListener("resize", this.handleResize);

    this.players.forEach((visual) => {
      this.scene.remove(visual.root);
      visual.nameTag.material?.map?.dispose?.();
      visual.nameTag.material?.dispose?.();
    });
    this.players.clear();

    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.container.removeChild(this.renderer.domElement);
  }
}
