import * as THREE from "three";

const DEFAULT_ARENA = {
  name: "Neo City GP Circuit",
  width: 2700,
  height: 1860,
  roadHalfWidth: 56,
  hardHalfWidth: 84,
  centerline: [
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
  ],
};

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

function normalizeArena(arena) {
  const source = arena || DEFAULT_ARENA;
  const centerline = Array.isArray(source.centerline) && source.centerline.length >= 4
    ? source.centerline
    : DEFAULT_ARENA.centerline;

  return {
    name: source.name || DEFAULT_ARENA.name,
    width: Number.isFinite(source.width) ? source.width : DEFAULT_ARENA.width,
    height: Number.isFinite(source.height) ? source.height : DEFAULT_ARENA.height,
    roadHalfWidth: Number.isFinite(source.roadHalfWidth) ? source.roadHalfWidth : DEFAULT_ARENA.roadHalfWidth,
    hardHalfWidth: Number.isFinite(source.hardHalfWidth) ? source.hardHalfWidth : DEFAULT_ARENA.hardHalfWidth,
    centerline: centerline.map((point) => ({
      x: Number.isFinite(point?.x) ? point.x : 0,
      z: Number.isFinite(point?.z) ? point.z : 0,
    })),
  };
}

function buildArenaKey(arena) {
  return [
    arena.width,
    arena.height,
    arena.roadHalfWidth,
    arena.hardHalfWidth,
    arena.centerline.map((point) => `${Math.round(point.x)},${Math.round(point.z)}`).join(";"),
  ].join("|");
}

function pseudoRandom(value) {
  const random = Math.sin(value * 12.9898) * 43758.5453;
  return random - Math.floor(random);
}

function disposeMaterial(material) {
  if (!material) {
    return;
  }
  if (Array.isArray(material)) {
    material.forEach((item) => disposeMaterial(item));
    return;
  }
  if (material.map) {
    material.map.dispose();
  }
  if (material.emissiveMap) {
    material.emissiveMap.dispose();
  }
  material.dispose?.();
}

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    child.traverse((node) => {
      if (node.isMesh) {
        node.geometry?.dispose?.();
        disposeMaterial(node.material);
      }
    });
  }
}

function createRoadStrip(length, width, y, material, midX, midZ, yaw) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, y, width), material);
  mesh.position.set(midX, y * 0.5, midZ);
  mesh.rotation.y = yaw;
  mesh.receiveShadow = true;
  return mesh;
}

function buildCityBlocks(group, arena) {
  const buildingMaterial = new THREE.MeshStandardMaterial({
    color: 0x1c2d42,
    roughness: 0.78,
    metalness: 0.18,
  });
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x2f4670,
    emissive: 0x1f58a8,
    emissiveIntensity: 0.25,
    roughness: 0.28,
    metalness: 0.55,
  });

  const addBuilding = (x, z, seed) => {
    const sizeX = 46 + Math.floor(pseudoRandom(seed * 1.1) * 80);
    const sizeZ = 46 + Math.floor(pseudoRandom(seed * 1.3 + 3) * 90);
    const height = 40 + Math.floor(pseudoRandom(seed * 1.7 + 7) * 220);
    const core = new THREE.Mesh(new THREE.BoxGeometry(sizeX, height, sizeZ), buildingMaterial);
    core.position.set(x, height * 0.5, z);
    core.castShadow = true;
    core.receiveShadow = true;
    group.add(core);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(sizeX * 0.86, 6, sizeZ * 0.86), windowMaterial);
    cap.position.set(x, height + 3, z);
    cap.castShadow = true;
    group.add(cap);
  };

  const halfW = arena.width * 0.5 + 260;
  const halfH = arena.height * 0.5 + 260;
  const spacing = 220;
  for (let x = -halfW; x <= halfW; x += spacing) {
    addBuilding(x, halfH + 130, x * 0.01 + 1);
    addBuilding(x, -halfH - 130, x * 0.01 + 2);
  }
  for (let z = -halfH + 140; z <= halfH - 140; z += spacing) {
    addBuilding(halfW + 130, z, z * 0.01 + 3);
    addBuilding(-halfW - 130, z, z * 0.01 + 4);
  }

  [
    { x: 0, z: 0, seed: 11 },
    { x: 210, z: 110, seed: 12 },
    { x: -230, z: -60, seed: 13 },
    { x: 320, z: -220, seed: 14 },
    { x: -340, z: 250, seed: 15 },
  ].forEach((entry) => addBuilding(entry.x, entry.z, entry.seed));
}

function buildTrackWorld(arena) {
  const group = new THREE.Group();

  const outskirts = new THREE.Mesh(
    new THREE.PlaneGeometry(arena.width + 1700, arena.height + 1700),
    new THREE.MeshStandardMaterial({
      color: 0x0f2c25,
      roughness: 0.93,
      metalness: 0.06,
    })
  );
  outskirts.rotation.x = -Math.PI / 2;
  outskirts.position.y = -0.2;
  outskirts.receiveShadow = true;
  group.add(outskirts);

  const cityBase = new THREE.Mesh(
    new THREE.PlaneGeometry(arena.width + 560, arena.height + 560),
    new THREE.MeshStandardMaterial({
      color: 0x21303f,
      roughness: 0.9,
      metalness: 0.1,
    })
  );
  cityBase.rotation.x = -Math.PI / 2;
  cityBase.position.y = -0.1;
  cityBase.receiveShadow = true;
  group.add(cityBase);

  const shoulderMaterial = new THREE.MeshStandardMaterial({
    color: 0x3c424e,
    roughness: 0.82,
    metalness: 0.15,
  });
  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0x252830,
    roughness: 0.74,
    metalness: 0.2,
  });
  const stripeMaterial = new THREE.MeshStandardMaterial({
    color: 0xf1f4f9,
    roughness: 0.4,
    metalness: 0.45,
    emissive: 0x8a8f99,
    emissiveIntensity: 0.15,
  });
  const barrierMaterial = new THREE.MeshStandardMaterial({
    color: 0xd14a2b,
    roughness: 0.42,
    metalness: 0.4,
  });

  const points = arena.centerline;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (length < 1) {
      continue;
    }

    const yaw = Math.atan2(dx, dz);
    const midX = (start.x + end.x) * 0.5;
    const midZ = (start.z + end.z) * 0.5;
    const normalX = -dz / length;
    const normalZ = dx / length;

    group.add(
      createRoadStrip(length + 14, arena.hardHalfWidth * 2 + 10, 0.56, shoulderMaterial, midX, midZ, yaw)
    );
    group.add(createRoadStrip(length + 2, arena.roadHalfWidth * 2, 0.8, roadMaterial, midX, midZ, yaw));

    const stripeStep = 36;
    const stripeLength = 16;
    const stripeCount = Math.floor(length / stripeStep);
    for (let stripeIndex = 0; stripeIndex < stripeCount; stripeIndex += 1) {
      const travel = -length * 0.5 + stripeIndex * stripeStep + stripeStep * 0.5;
      const x = midX + Math.sin(yaw) * travel;
      const z = midZ + Math.cos(yaw) * travel;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(stripeLength, 0.12, 2.4), stripeMaterial);
      stripe.position.set(x, 0.88, z);
      stripe.rotation.y = yaw;
      stripe.receiveShadow = true;
      group.add(stripe);
    }

    const barrierDistance = arena.hardHalfWidth + 3.2;
    [-1, 1].forEach((side) => {
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(length + 10, 3.8, 1.2), barrierMaterial);
      barrier.position.set(midX + normalX * barrierDistance * side, 1.9, midZ + normalZ * barrierDistance * side);
      barrier.rotation.y = yaw;
      barrier.castShadow = true;
      barrier.receiveShadow = true;
      group.add(barrier);
    });
  }

  const startA = points[0];
  const startB = points[1];
  const startYaw = Math.atan2(startB.x - startA.x, startB.z - startA.z);
  const startGate = new THREE.Group();
  const gatePillarMaterial = new THREE.MeshStandardMaterial({ color: 0x0f1726, roughness: 0.55, metalness: 0.4 });
  const gateBeamMaterial = new THREE.MeshStandardMaterial({
    color: 0x7be8ff,
    emissive: 0x1fa9de,
    emissiveIntensity: 0.65,
    roughness: 0.2,
    metalness: 0.78,
  });
  const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(4, 18, 4), gatePillarMaterial);
  leftPillar.position.set(-arena.roadHalfWidth + 8, 9, 0);
  const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(4, 18, 4), gatePillarMaterial);
  rightPillar.position.set(arena.roadHalfWidth - 8, 9, 0);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(arena.roadHalfWidth * 2 - 10, 3.5, 4), gateBeamMaterial);
  beam.position.set(0, 17.5, 0);
  startGate.add(leftPillar);
  startGate.add(rightPillar);
  startGate.add(beam);
  startGate.position.set(startA.x + Math.sin(startYaw) * 45, 0, startA.z + Math.cos(startYaw) * 45);
  startGate.rotation.y = startYaw;
  startGate.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  group.add(startGate);

  buildCityBlocks(group, arena);

  return group;
}

function buildCarMesh(color) {
  const car = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.8, 4.2),
    new THREE.MeshStandardMaterial({ color, roughness: 0.34, metalness: 0.52 })
  );
  body.position.y = 0.85;
  car.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.6, 2),
    new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.2, metalness: 0.65 })
  );
  cabin.position.set(0, 1.35, -0.2);
  car.add(cabin);

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

function createPickupMesh() {
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(6, 6, 6),
    new THREE.MeshStandardMaterial({
      color: 0x43f2ff,
      emissive: 0x0a7b8c,
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.7,
    })
  );
  box.castShadow = true;
  return box;
}

function createProjectileMesh() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 12, 12),
    new THREE.MeshStandardMaterial({
      color: 0xff6f3d,
      emissive: 0xff531f,
      emissiveIntensity: 1,
      roughness: 0.2,
      metalness: 0.5,
    })
  );
}

export class RaceScene {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x071326);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 4200);
    this.camera.position.set(0, 18, -36);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.players = new Map();
    this.pickups = new Map();
    this.projectiles = new Map();
    this.localPlayerId = null;
    this.clock = new THREE.Clock();
    this.rafId = null;
    this.targetLookAt = new THREE.Vector3(0, 0, 0);
    this.tempCameraOffset = new THREE.Vector3(0, 14, -30);
    this.upVector = new THREE.Vector3(0, 1, 0);
    this.activeArena = normalizeArena(DEFAULT_ARENA);
    this.activeArenaKey = null;
    this.worldRoot = new THREE.Group();

    this.scene.add(this.worldRoot);
    this.setupLights();
    this.ensureArena(this.activeArena);

    this.handleResize = this.handleResize.bind(this);
    this.tick = this.tick.bind(this);

    window.addEventListener("resize", this.handleResize);
    this.handleResize();
    this.rafId = requestAnimationFrame(this.tick);
  }

  setupLights() {
    const hemi = new THREE.HemisphereLight(0x7bd6ff, 0x0f2614, 0.72);
    this.scene.add(hemi);

    const directional = new THREE.DirectionalLight(0xffffff, 1.06);
    directional.position.set(320, 380, -80);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 2048;
    directional.shadow.mapSize.height = 2048;
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = 2600;
    directional.shadow.camera.left = -950;
    directional.shadow.camera.right = 950;
    directional.shadow.camera.top = 950;
    directional.shadow.camera.bottom = -950;
    this.scene.add(directional);

    const fill = new THREE.PointLight(0x36c7ff, 0.34, 1200);
    fill.position.set(0, 220, 80);
    this.scene.add(fill);
  }

  ensureArena(rawArena) {
    const arena = normalizeArena(rawArena);
    const nextKey = buildArenaKey(arena);
    if (nextKey === this.activeArenaKey) {
      return;
    }

    this.activeArena = arena;
    this.activeArenaKey = nextKey;
    clearGroup(this.worldRoot);
    this.worldRoot.add(buildTrackWorld(arena));

    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(3800, 36, 24),
      new THREE.MeshBasicMaterial({
        color: 0x122844,
        side: THREE.BackSide,
      })
    );
    this.worldRoot.add(skyDome);
  }

  setLocalPlayer(playerId) {
    this.localPlayerId = playerId;
  }

  setSnapshot(snapshotOrPlayers) {
    const isArrayPayload = Array.isArray(snapshotOrPlayers);
    const players = isArrayPayload ? snapshotOrPlayers : snapshotOrPlayers?.players || [];
    const pickups = isArrayPayload ? [] : snapshotOrPlayers?.pickups || [];
    const projectiles = isArrayPayload ? [] : snapshotOrPlayers?.projectiles || [];

    if (!isArrayPayload && snapshotOrPlayers?.arena) {
      this.ensureArena(snapshotOrPlayers.arena);
    }

    this.syncPlayers(players);
    this.syncPickups(pickups);
    this.syncProjectiles(projectiles);
  }

  syncPlayers(players) {
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
      visual.boosting = player.isBoosting;
      visual.eliminated = player.isEliminated;
    });
  }

  syncPickups(pickups) {
    const seen = new Set(pickups.map((pickup) => pickup.id));
    this.pickups.forEach((visual, id) => {
      if (!seen.has(id)) {
        this.scene.remove(visual.mesh);
        this.pickups.delete(id);
      }
    });

    pickups.forEach((pickup) => {
      let visual = this.pickups.get(pickup.id);
      if (!visual) {
        visual = {
          mesh: createPickupMesh(),
          baseY: 4,
        };
        this.pickups.set(pickup.id, visual);
        this.scene.add(visual.mesh);
      }

      visual.mesh.position.set(pickup.x, visual.baseY, pickup.z);
      visual.mesh.visible = Boolean(pickup.active);
    });
  }

  syncProjectiles(projectiles) {
    const seen = new Set(projectiles.map((projectile) => projectile.id));
    this.projectiles.forEach((visual, id) => {
      if (!seen.has(id)) {
        this.scene.remove(visual.mesh);
        this.projectiles.delete(id);
      }
    });

    projectiles.forEach((projectile) => {
      let visual = this.projectiles.get(projectile.id);
      if (!visual) {
        visual = { mesh: createProjectileMesh() };
        this.projectiles.set(projectile.id, visual);
        this.scene.add(visual.mesh);
      }
      visual.mesh.position.set(projectile.x, 2, projectile.z);
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
      boosting: false,
      eliminated: false,
    };
  }

  tick() {
    this.rafId = requestAnimationFrame(this.tick);
    const delta = this.clock.getDelta();
    const now = performance.now();

    this.players.forEach((visual, playerId) => {
      const followStrength = playerId === this.localPlayerId ? 0.3 : 0.2;
      visual.root.position.lerp(visual.targetPosition, followStrength);
      visual.currentYaw = lerpAngle(visual.currentYaw, visual.targetYaw, followStrength);
      visual.root.rotation.y = visual.currentYaw;

      visual.root.visible = !visual.eliminated;

      const emissiveIntensity = visual.boosting ? 0.85 : 0.25;
      const body = visual.car.children[0];
      if (body?.material) {
        body.material.emissive = new THREE.Color(0xff4f1f);
        body.material.emissiveIntensity = emissiveIntensity;
      }

      const bob = Math.sin(now * 0.002 + visual.root.position.x * 0.1) * 0.02;
      visual.car.position.y = bob;
    });

    let pickupIndex = 0;
    this.pickups.forEach((pickup) => {
      if (!pickup.mesh.visible) {
        pickupIndex += 1;
        return;
      }
      pickup.mesh.rotation.x += 0.015;
      pickup.mesh.rotation.y += 0.02;
      pickup.mesh.position.y = pickup.baseY + Math.sin(now * 0.003 + pickupIndex) * 0.9;
      pickupIndex += 1;
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

    this.tempCameraOffset.set(0, 14, -30);
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
    this.pickups.forEach((visual) => {
      this.scene.remove(visual.mesh);
    });
    this.projectiles.forEach((visual) => {
      this.scene.remove(visual.mesh);
    });
    this.players.clear();
    this.pickups.clear();
    this.projectiles.clear();

    clearGroup(this.worldRoot);

    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.container.removeChild(this.renderer.domElement);
  }
}
