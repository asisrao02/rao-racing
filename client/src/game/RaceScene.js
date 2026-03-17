import * as THREE from "three";
import { TRACK } from "./constants";

function hashColor(input) {
  const palette = [
    0xff5a2a,
    0x2afff1,
    0x89ff2a,
    0xffde2a,
    0xff2ac3,
    0x2a95ff,
    0xc22aff,
    0xffffff,
  ];
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

function buildTrackMesh() {
  const group = new THREE.Group();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 1100),
    new THREE.MeshStandardMaterial({ color: 0x0a0f19, roughness: 0.95, metalness: 0.05 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  group.add(ground);

  const trackShape = new THREE.Shape();
  trackShape.absellipse(0, 0, TRACK.outerRadiusX, TRACK.outerRadiusZ, 0, Math.PI * 2, false, 0);
  const innerPath = new THREE.Path();
  innerPath.absellipse(0, 0, TRACK.innerRadiusX, TRACK.innerRadiusZ, 0, Math.PI * 2, true, 0);
  trackShape.holes.push(innerPath);
  const trackGeometry = new THREE.ShapeGeometry(trackShape, 120);
  trackGeometry.rotateX(-Math.PI / 2);

  const trackMesh = new THREE.Mesh(
    trackGeometry,
    new THREE.MeshStandardMaterial({ color: 0x2a313d, roughness: 0.8, metalness: 0.2 })
  );
  trackMesh.position.y = 0.01;
  group.add(trackMesh);

  const infield = new THREE.Mesh(
    new THREE.CylinderGeometry(TRACK.innerRadiusX * 0.96, TRACK.innerRadiusX * 0.96, 0.08, 60, 1),
    new THREE.MeshStandardMaterial({ color: 0x123821, roughness: 0.9 })
  );
  infield.scale.z = TRACK.innerRadiusZ / TRACK.innerRadiusX;
  infield.position.y = 0.03;
  group.add(infield);

  const lineMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  for (let index = 0; index < 84; index += 1) {
    const t = (index / 84) * Math.PI * 2;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.03, 0.35), lineMaterial);
    stripe.position.set(
      Math.cos(t) * ((TRACK.outerRadiusX + TRACK.innerRadiusX) * 0.5),
      0.05,
      Math.sin(t) * ((TRACK.outerRadiusZ + TRACK.innerRadiusZ) * 0.5)
    );
    stripe.rotation.y = -t;
    group.add(stripe);
  }

  // Finish line near spawn.
  const finishLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.04, 52),
    new THREE.MeshStandardMaterial({ color: 0xf4f4f4, emissive: 0x262626, emissiveIntensity: 0.2 })
  );
  finishLine.position.set(TRACK.midRadiusX - 2, 0.06, 0);
  group.add(finishLine);

  return group;
}

function buildCity() {
  const city = new THREE.Group();
  const spanX = 620;
  const spanZ = 430;
  const step = 55;
  const safeRadiusX = TRACK.outerRadiusX + 65;
  const safeRadiusZ = TRACK.outerRadiusZ + 65;

  for (let gx = -spanX; gx <= spanX; gx += step) {
    for (let gz = -spanZ; gz <= spanZ; gz += step) {
      const normalized =
        (gx * gx) / (safeRadiusX * safeRadiusX) + (gz * gz) / (safeRadiusZ * safeRadiusZ);
      if (normalized < 1) {
        continue;
      }

      const randA = noise2D(gx * 0.03, gz * 0.03, 1);
      const randB = noise2D(gx * 0.04, gz * 0.05, 2);
      const randC = noise2D(gx * 0.06, gz * 0.02, 3);

      const width = 16 + randA * 16;
      const depth = 16 + randB * 16;
      const height = 24 + randC * 170;
      const offsetX = (randA - 0.5) * 10;
      const offsetZ = (randB - 0.5) * 10;

      const buildingColor = new THREE.Color().setHSL(0.56 + randA * 0.06, 0.38, 0.16 + randB * 0.1);
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({
          color: buildingColor,
          roughness: 0.9,
          metalness: 0.2,
          emissive: new THREE.Color(0x07111f),
          emissiveIntensity: 0.45,
        })
      );
      building.position.set(gx + offsetX, height / 2, gz + offsetZ);
      building.castShadow = true;
      building.receiveShadow = true;
      city.add(building);
    }
  }

  for (let index = 0; index < 36; index += 1) {
    const t = (index / 36) * Math.PI * 2;
    const lightRadiusX = TRACK.outerRadiusX + 28;
    const lightRadiusZ = TRACK.outerRadiusZ + 28;
    const x = Math.cos(t) * lightRadiusX;
    const z = Math.sin(t) * lightRadiusZ;

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.8, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x2a2f37, roughness: 0.7 })
    );
    pole.position.set(x, 6, z);
    pole.castShadow = true;
    city.add(pole);

    const lamp = new THREE.PointLight(0x4cf8ff, 1.1, 90, 1.6);
    lamp.position.set(x, 12, z);
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
    this.scene.background = new THREE.Color(0x08121f);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2500);
    this.camera.position.set(0, 12, -24);
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
    this.tempCameraOffset = new THREE.Vector3(0, 10, -20);
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
    const hemi = new THREE.HemisphereLight(0x7bd6ff, 0x0f2614, 0.55);
    this.scene.add(hemi);

    const directional = new THREE.DirectionalLight(0xffffff, 1.05);
    directional.position.set(32, 52, -16);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 2048;
    directional.shadow.mapSize.height = 2048;
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = 200;
    directional.shadow.camera.left = -90;
    directional.shadow.camera.right = 90;
    directional.shadow.camera.top = 90;
    directional.shadow.camera.bottom = -90;
    this.scene.add(directional);
  }

  setupWorld() {
    const track = buildTrackMesh();
    this.scene.add(track);
    this.scene.add(buildCity());

    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(1200, 36, 24),
      new THREE.MeshBasicMaterial({
        color: 0x152840,
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

      // Small hover effect to keep placeholder cars lively.
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

    this.tempCameraOffset.set(0, 10, -20);
    this.tempCameraOffset.applyAxisAngle(this.upVector, targetVisual.currentYaw);

    const desiredPosition = targetVisual.root.position.clone().add(this.tempCameraOffset);
    const lerpFactor = 1 - Math.exp(-delta * 6);
    this.camera.position.lerp(desiredPosition, lerpFactor);

    this.targetLookAt.copy(targetVisual.root.position).add(new THREE.Vector3(0, 1.8, 0));
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
