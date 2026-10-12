import { GOAL, gameSettings, StickCustomizerState } from "./config.js";
import * as THREE from 'three';
import { game } from './state.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const scene = new THREE.Scene();
scene.background = new THREE.Color('#000000'); // Pure black background

export const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 10, 40000);
camera.position.set(0, 1000, -17700);

export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 600, -20700);
controls.enableRotate = true;
controls.enablePan = true;
controls.enableZoom = true;

// Lights
const ambLight = new THREE.AmbientLight(0xffffff, 0.9);
scene.add(ambLight);

const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.4);
dirLight1.position.set(500, 1500, 1000);
scene.add(dirLight1);

const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.8);
dirLight2.position.set(-600, -200, -800);
scene.add(dirLight2);

// Ice
function createIceTexture() {
  const canvas = document.createElement('canvas');
  const scale = 2048 / 26000;
  canvas.width = 2048;
  canvas.height = Math.round(30000 * scale);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const toX = (x) => (x + 13000) * scale;
  const toY = (z) => (30000 + z) * scale;
  const r = (radius) => radius * scale;

  ctx.lineWidth = 2 * scale;
  for (let i = 0; i < 5000; i++) {
    ctx.beginPath();
    const startX = Math.random() * canvas.width;
    const startY = Math.random() * canvas.height;
    const length = 50 * scale + Math.random() * 300 * scale;
    const angle = Math.random() * Math.PI * 2;
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + Math.cos(angle) * length, startY + Math.sin(angle) * length);
    ctx.strokeStyle = `rgba(210, 220, 230, ${0.1 + Math.random() * 0.15})`;
    ctx.stroke();
  }

  // Center Line
  ctx.strokeStyle = '#cf1f2e';
  ctx.lineWidth = 30 * scale;
  ctx.beginPath(); ctx.moveTo(0, toY(0)); ctx.lineTo(canvas.width, toY(0)); ctx.stroke();

  // Center faceoff circle
  ctx.strokeStyle = '#0033a0';
  ctx.lineWidth = 20 * scale;
  ctx.beginPath(); ctx.arc(toX(0), toY(0), r(4500), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#0033a0';
  ctx.beginPath(); ctx.arc(toX(0), toY(0), r(300), 0, Math.PI * 2); ctx.fill();

  // Blue Line
  ctx.strokeStyle = '#0033a0';
  ctx.lineWidth = 60 * scale;
  ctx.beginPath(); ctx.moveTo(0, toY(-10500)); ctx.lineTo(canvas.width, toY(-10500)); ctx.stroke();

  // Goal Line
  ctx.strokeStyle = '#cf1f2e';
  ctx.lineWidth = 20 * scale;
  ctx.beginPath(); ctx.moveTo(0, toY(-26000)); ctx.lineTo(canvas.width, toY(-26000)); ctx.stroke();

  // Faceoff circles
  ctx.strokeStyle = '#cf1f2e';
  ctx.lineWidth = 20 * scale;
  ctx.beginPath(); ctx.arc(toX(-6700), toY(-20500), r(4500), 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(toX(6700), toY(-20500), r(4500), 0, Math.PI * 2); ctx.stroke();

  ctx.fillStyle = '#cf1f2e';
  ctx.beginPath(); ctx.arc(toX(-6700), toY(-20500), r(300), 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(toX(6700), toY(-20500), r(300), 0, Math.PI * 2); ctx.fill();

  // Goal Crease
  ctx.fillStyle = 'rgba(0, 51, 160, 0.3)';
  ctx.strokeStyle = '#cf1f2e';
  ctx.lineWidth = 10 * scale;
  ctx.beginPath();
  ctx.arc(toX(0), toY(-26000), r(1800), 0, Math.PI);
  ctx.fill();
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 16;
  return tex;
}

export const rinkWidth = 26000;
export const rinkDepth = 30000;
const iceGeo = new THREE.PlaneGeometry(rinkWidth, rinkDepth);
const iceMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  map: createIceTexture(),
  roughness: 0.05,
  metalness: 0.1
});
game.ice = new THREE.Mesh(iceGeo, iceMat);
game.ice.rotation.x = -Math.PI / 2;
game.ice.position.y = 0;
game.ice.position.z = -15000;
scene.add(game.ice);

// Puck
const puckGeo = new THREE.CylinderGeometry(38, 38, 25, 32);
const puckMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
game.puck = new THREE.Mesh(puckGeo, puckMat);
game.puck.position.set(95, 12.5, -20120);
scene.add(game.puck);

export const ghostPuck = game.puck.clone();
ghostPuck.material = game.puck.material.clone();
ghostPuck.material.transparent = true;
ghostPuck.material.opacity = 0.38;
ghostPuck.material.depthWrite = false;
ghostPuck.visible = false;
scene.add(ghostPuck);

// Projected Arrow
function createArrowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 2048, 0, 0);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
  grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(156, 2048); ctx.lineTo(356, 2048); ctx.lineTo(356, 500); ctx.lineTo(512, 500);
  ctx.lineTo(256, 0); ctx.lineTo(0, 500); ctx.lineTo(156, 500); ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 16;
  return tex;
}

const arrowGeo = new THREE.PlaneGeometry(1500, 8000);
const arrowMat = new THREE.MeshBasicMaterial({
  map: createArrowTexture(),
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide
});
export const projectedArrow = new THREE.Mesh(arrowGeo, arrowMat);
projectedArrow.rotation.x = -Math.PI / 2;
projectedArrow.position.set(0, 5, -22000);
scene.add(projectedArrow);

// 3D Animated Swipe-up Chevrons directly on ice behind puck
function createPuckSwipeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
  ctx.shadowBlur = 14;

  function drawChevron(y) {
    ctx.beginPath();
    ctx.moveTo(40, y + 50);
    ctx.lineTo(128, y);
    ctx.lineTo(216, y + 50);
    ctx.stroke();
  }

  drawChevron(60);
  drawChevron(200);
  drawChevron(340);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  return tex;
}

const puckSwipeGeo = new THREE.PlaneGeometry(300, 600);
const puckSwipeMat = new THREE.MeshBasicMaterial({
  map: createPuckSwipeTexture(),
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide
});
export const puckSwipeMesh = new THREE.Mesh(puckSwipeGeo, puckSwipeMat);
puckSwipeMesh.rotation.x = -Math.PI / 2;
puckSwipeMesh.position.set(95, 8, -19600);
scene.add(puckSwipeMesh);

export function updateProjectedArrow(puckPos) {
  if (!puckPos) return;
  const puckX = puckPos.x;
  const puckZ = puckPos.z;
  const goalZ = -26000;
  const length = Math.max(1000, Math.abs(goalZ - puckZ));
  projectedArrow.scale.set(1, length / 8000, 1);
  projectedArrow.position.set(puckX, 5, puckZ - length / 2);
  if (puckSwipeMesh) {
    puckSwipeMesh.position.set(puckX, 8, puckZ + 650);
  }
}

// Boarding
const boardGroup = new THREE.Group();

const textureLoader = new THREE.TextureLoader();
// Base white board material
const boardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, side: THREE.DoubleSide });
const kickPlateMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5, side: THREE.DoubleSide });
const topRailMat = new THREE.MeshStandardMaterial({ color: 0x0033a0, roughness: 0.3 });
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.9, opacity: 1, transparent: true, roughness: 0.1, ior: 1.5, side: THREE.DoubleSide });

const boardHeight = 1100;
const kickPlateHeight = 200;
const topRailHeight = 50;
const glassHeight = 2000;
const cornerRadius = 8500;
const straightWidth = rinkWidth - (2 * cornerRadius);
const straightDepth = rinkDepth - (2 * cornerRadius);

// Helpers to build walls
function createWall(w, h, rotY, px, pz, kDir) {
  const wall = new THREE.Group();
  const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), boardMat);
  b.position.y = h/2;
  const k = new THREE.Mesh(new THREE.PlaneGeometry(w, kickPlateHeight), kickPlateMat);
  k.position.y = kickPlateHeight / 2; k.position.z = kDir * 5;
  const r = new THREE.Mesh(new THREE.BoxGeometry(w, topRailHeight, 100), topRailMat);
  r.position.y = h;
  const g = new THREE.Mesh(new THREE.PlaneGeometry(w, glassHeight), glassMat);
  g.position.y = h + glassHeight/2;
  wall.add(b, k, r, g);
  wall.rotation.y = rotY;
  wall.position.set(px, 0, pz);
  return wall;
}

boardGroup.add(createWall(straightWidth, boardHeight, 0, 0, -rinkDepth, 1));
boardGroup.add(createWall(straightDepth, boardHeight, Math.PI/2, -rinkWidth/2, -rinkDepth/2, 1));
boardGroup.add(createWall(straightDepth, boardHeight, -Math.PI/2, rinkWidth/2, -rinkDepth/2, -1));

const cornerRailGeo = new THREE.TorusGeometry(cornerRadius, topRailHeight / 2, 8, 32, Math.PI/2);
function createCorner(x, z, rY) {
  const corner = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(cornerRadius, cornerRadius, boardHeight, 32, 1, true, Math.PI/2, Math.PI/2), boardMat);
  b.position.y = boardHeight/2;
  const k = new THREE.Mesh(new THREE.CylinderGeometry(cornerRadius-5, cornerRadius-5, kickPlateHeight, 32, 1, true, Math.PI/2, Math.PI/2), kickPlateMat);
  k.position.y = kickPlateHeight / 2;
  const g = new THREE.Mesh(new THREE.CylinderGeometry(cornerRadius, cornerRadius, glassHeight, 32, 1, true, Math.PI/2, Math.PI/2), glassMat);
  g.position.y = boardHeight + glassHeight/2;
  const r = new THREE.Mesh(cornerRailGeo, topRailMat);
  r.rotation.x = -Math.PI/2; r.rotation.z = 0; r.position.y = boardHeight;
  corner.add(b, k, g, r);
  corner.rotation.y = rY;
  corner.position.set(x, 0, z);
  return corner;
}
boardGroup.add(createCorner(-rinkWidth/2 + cornerRadius, -rinkDepth + cornerRadius, Math.PI/2));
boardGroup.add(createCorner(rinkWidth/2 - cornerRadius, -rinkDepth + cornerRadius, 0));

// Add giant non-repeating logo decal to the center of the far boards
const logoTex = textureLoader.load('https://cdn.shopify.com/s/files/1/1038/7203/7203/files/BOLOGOBLACK_bff2f2f3-1fd7-42f8-b264-c169a15dafc7.png?v=1791454014');
const logoMat = new THREE.MeshBasicMaterial({
    map: logoTex,
    transparent: true,
    depthWrite: false
});
// Aspect ratio is 4617 / 1049 = ~4.401
const logoHeight = 800;
const logoWidth = logoHeight * (4617 / 1049);
const logoPlane = new THREE.Mesh(new THREE.PlaneGeometry(logoWidth, logoHeight), logoMat);
const logoCenterY = (kickPlateHeight + boardHeight - topRailHeight / 2) / 2;
// Position directly behind the goal, pushed slightly further off the boards to prevent z-fighting
logoPlane.position.set(0, logoCenterY, -rinkDepth + 15);
boardGroup.add(logoPlane);

// Add dynamic kickpoint logos on left and right side of main logo
// Once a logo image has loaded, re-fit the planes if that logo is the one currently shown.
function onKickpointLogoLoaded(texture) {
    if (kpLogoMatLeft.map === texture) fitKickpointLogos(texture);
}
export const kickpointLogos = {
    low: textureLoader.load('https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Lowkplogo.png?v=1790252741', onKickpointLogoLoaded),
    mid: textureLoader.load('https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Midkplogo.png?v=1790253037', onKickpointLogoLoaded),
    hybrid: textureLoader.load('https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Hybridkplogo.png?v=1790252741', onKickpointLogoLoaded)
};

const kpLogoHeight = 600;
const kpLogoGap = 1000; // gap between the main logo and each kickpoint logo
const kpLogoMatLeft = new THREE.MeshBasicMaterial({
    map: kickpointLogos.mid,
    transparent: true,
    depthWrite: false
});
const kpLogoMatRight = new THREE.MeshBasicMaterial({
    map: kickpointLogos.mid,
    transparent: true,
    depthWrite: false
});

// Unit plane, scaled to the actual image aspect ratio so the logos are never stretched or squashed.
export const kpLogoPlaneLeft = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), kpLogoMatLeft);
export const kpLogoPlaneRight = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), kpLogoMatRight);
boardGroup.add(kpLogoPlaneLeft, kpLogoPlaneRight);

function fitKickpointLogos(texture) {
    const image = texture && texture.image;
    const aspect = image && image.width && image.height ? image.width / image.height : 1.5;
    const width = kpLogoHeight * aspect;
    for (const [plane, side] of [[kpLogoPlaneLeft, -1], [kpLogoPlaneRight, 1]]) {
        plane.scale.set(width, kpLogoHeight, 1);
        plane.position.set(side * (logoWidth / 2 + kpLogoGap + width / 2), logoCenterY, -rinkDepth + 15);
    }
}
fitKickpointLogos(kickpointLogos.mid);



scene.add(boardGroup);

// Tribune
const tribuneGroup = new THREE.Group();
const concreteMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
const stairMat = new THREE.MeshStandardMaterial({ color: 0x737373, roughness: 0.85 });
const seatMat1 = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });
const seatMat2 = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
const stepDepth = 900, stepHeight = 450, numRows = 12;
const startY = boardHeight + 200, startX = rinkWidth / 2 + 500, zOffset = -rinkDepth / 2;
const stairWidth = 700;
const zamboniOpeningWidth = 3200;

function createCurvedTierShape(innerRadius, outerRadius, startAngle, endAngle) {
  const shape = new THREE.Shape();
  shape.moveTo(outerRadius * Math.cos(startAngle), outerRadius * Math.sin(startAngle));
  shape.absarc(0, 0, outerRadius, startAngle, endAngle, false);
  shape.lineTo(innerRadius * Math.cos(endAngle), innerRadius * Math.sin(endAngle));
  shape.absarc(0, 0, innerRadius, endAngle, startAngle, true);
  shape.closePath();
  return shape;
}

function addCurvedTier(centerX, centerZ, rotation, innerRadius, outerRadius, startAngle, endAngle, baseY, height, material) {
  if (endAngle <= startAngle) return;
  const geometry = new THREE.ExtrudeGeometry(
    createCurvedTierShape(innerRadius, outerRadius, startAngle, endAngle),
    { depth: height, bevelEnabled: false, curveSegments: 12 }
  );
  geometry.rotateX(-Math.PI / 2);
  const tier = new THREE.Mesh(geometry, material);
  tier.position.set(centerX, baseY, centerZ);
  tier.rotation.y = rotation;
  tribuneGroup.add(tier);
}

function addStairTread(x, z, width, depth, topY) {
  const tread = new THREE.Mesh(new THREE.BoxGeometry(width, 60, depth), stairMat);
  tread.position.set(x, topY + 30, z);
  tribuneGroup.add(tread);
}

function addBenchSegments(axis, fixedPosition, centerPosition, length, centerY, aisleCenters, material) {
  const start = centerPosition - length / 2;
  const end = centerPosition + length / 2;
  let cursor = start;

  for (const aisleCenter of aisleCenters) {
    const aisleStart = Math.max(start, aisleCenter - stairWidth / 2);
    const aisleEnd = Math.min(end, aisleCenter + stairWidth / 2);
    if (aisleStart > cursor) {
      addBenchSegment(axis, fixedPosition, cursor, aisleStart, centerY, material);
    }
    cursor = Math.max(cursor, aisleEnd);
  }
  if (cursor < end) addBenchSegment(axis, fixedPosition, cursor, end, centerY, material);
}

function addBenchSegment(axis, fixedPosition, start, end, centerY, material) {
  if (end <= start) return;
  const length = end - start;
  const bench = new THREE.Mesh(
    axis === 'z' ? new THREE.BoxGeometry(400, 100, length) : new THREE.BoxGeometry(length, 100, 400),
    material
  );
  bench.position.set(
    axis === 'z' ? fixedPosition : (start + end) / 2,
    centerY,
    axis === 'z' ? (start + end) / 2 : fixedPosition
  );
  tribuneGroup.add(bench);
}

for (let i = 0; i < numRows; i++) {
  const rowY = startY + i * stepHeight;
  const tierTopY = rowY + stepHeight / 2;
  const rowOffset = i * stepDepth;

  // Left
  let step = new THREE.Mesh(new THREE.BoxGeometry(stepDepth, stepHeight, straightDepth), concreteMat);
  step.position.set(-startX - rowOffset, rowY, zOffset);
  const seatMaterial = i % 2 === 0 ? seatMat1 : seatMat2;
  addBenchSegments('z', -startX - rowOffset + 150, zOffset, straightDepth - 200, rowY + stepHeight / 2 + 50, [-20000, -17000, -13000, -10000], seatMaterial);
  tribuneGroup.add(step);

  // Right
  step = new THREE.Mesh(new THREE.BoxGeometry(stepDepth, stepHeight, straightDepth), concreteMat);
  step.position.set(startX + rowOffset, rowY, zOffset);
  addBenchSegments('z', startX + rowOffset - 150, zOffset, straightDepth - 200, rowY + stepHeight / 2 + 50, [-20000, -17000, -13000, -10000], seatMaterial);
  tribuneGroup.add(step);

  // Far and near ends
  step = new THREE.Mesh(new THREE.BoxGeometry(straightWidth, stepHeight, stepDepth), concreteMat);
  step.position.set(0, rowY, -rinkDepth - 500 - rowOffset);
  addBenchSegments('x', -rinkDepth - 500 - rowOffset - 150, 0, straightWidth - 200, rowY + stepHeight / 2 + 50, [-3000, 0, 3000], seatMaterial);
  tribuneGroup.add(step);
  step = new THREE.Mesh(new THREE.BoxGeometry(straightWidth, stepHeight, stepDepth), concreteMat);
  step.position.set(0, rowY, 500 + rowOffset);
  addBenchSegments('x', 500 + rowOffset + 150, 0, straightWidth - 200, rowY + stepHeight / 2 + 50, [-3000, 0, 3000], seatMaterial);
  tribuneGroup.add(step);

  // Contrasting treads make the access routes visible between seating rows.
  for (const aisleZ of [-20000, -17000, -13000, -10000]) {
    addStairTread(-startX - rowOffset, aisleZ, stepDepth, stairWidth, tierTopY);
    addStairTread(startX + rowOffset, aisleZ, stepDepth, stairWidth, tierTopY);
  }
  for (const aisleX of [-3000, 0, 3000]) {
    addStairTread(aisleX, -rinkDepth - 500 - rowOffset, stairWidth, stepDepth, tierTopY);
    addStairTread(aisleX, 500 + rowOffset, stairWidth, stepDepth, tierTopY);
  }
}

const cornerStandPositions = [
  [-rinkWidth / 2 + cornerRadius, -rinkDepth + cornerRadius, Math.PI / 2, 0, Math.PI / 2, false],
  [rinkWidth / 2 - cornerRadius, -rinkDepth + cornerRadius, 0, 0, Math.PI / 2, false],
  [-rinkWidth / 2 + cornerRadius, -cornerRadius, -Math.PI / 2, -Math.PI / 2, 0, false],
  [rinkWidth / 2 - cornerRadius, -cornerRadius, 0, -Math.PI / 2, 0, true]
];

for (const [centerX, centerZ, rotation, cornerStart, cornerEnd, hasZamboniOpening] of cornerStandPositions) {
  for (let i = 0; i < numRows; i++) {
    const innerRadius = cornerRadius + 500 + i * stepDepth;
    const outerRadius = innerRadius + stepDepth;
    const rowY = startY + i * stepHeight;
    const tierBottomY = rowY - stepHeight / 2;
    let openingStart = cornerEnd;
    let openingEnd = cornerEnd;
    if (hasZamboniOpening) {
      const halfOpeningAngle = zamboniOpeningWidth / (2 * ((innerRadius + outerRadius) / 2));
      openingStart = -Math.PI / 4 - halfOpeningAngle;
      openingEnd = -Math.PI / 4 + halfOpeningAngle;
    }

    addCurvedTier(centerX, centerZ, rotation, innerRadius, outerRadius, cornerStart, openingStart, tierBottomY, stepHeight, concreteMat);
    addCurvedTier(centerX, centerZ, rotation, innerRadius, outerRadius, openingEnd, cornerEnd, tierBottomY, stepHeight, concreteMat);

    const seatInnerRadius = innerRadius + 100;
    const seatOuterRadius = seatInnerRadius + 400;
    const seatBottomY = rowY + stepHeight / 2;
    const seatMaterial = i % 2 === 0 ? seatMat1 : seatMat2;
    addCurvedTier(centerX, centerZ, rotation, seatInnerRadius, seatOuterRadius, cornerStart, openingStart, seatBottomY, 100, seatMaterial);
    addCurvedTier(centerX, centerZ, rotation, seatInnerRadius, seatOuterRadius, openingEnd, cornerEnd, seatBottomY, 100, seatMaterial);
  }
}
scene.add(tribuneGroup);

// Net with Puck Marks on Posts
function createPostTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');

    // Base red color
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 512, 2048);

    // Add black puck marks
    for(let i=0; i<40; i++) {
        ctx.fillStyle = `rgba(10, 10, 10, ${0.4 + Math.random()*0.5})`;
        ctx.beginPath();
        const x = Math.random() * 512;
        const y = Math.random() * 2048;
        const rx = 5 + Math.random() * 25;
        const ry = 2 + Math.random() * 10;
        const angle = Math.random() * Math.PI;
        ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI*2);
        ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
}


const { width: netWidth, height: netHeight, depth: netDepth } = GOAL;
game.net = new THREE.Group();
const postMat = new THREE.MeshStandardMaterial({ map: createPostTexture(), roughness: 0.4 });
const postGeo = new THREE.CylinderGeometry(GOAL.postRadius, GOAL.postRadius, netHeight);
const leftPost = new THREE.Mesh(postGeo, postMat); leftPost.position.set(-netWidth/2, netHeight/2, 0);
const rightPost = new THREE.Mesh(postGeo, postMat); rightPost.position.set(netWidth/2, netHeight/2, 0);
const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(GOAL.postRadius, GOAL.postRadius, netWidth), postMat);
crossbar.rotation.z = Math.PI / 2; crossbar.position.set(0, netHeight, 0);
game.net.add(leftPost, rightPost, crossbar);

const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
const frameRadius = 20;
for (const side of [-1, 1]) {
    const railPoints = [new THREE.Vector3(side * netWidth / 2, frameRadius, 0)];
    for (let i = 0; i <= 12; i++) {
        const angle = (Math.PI / 2) * i / 12;
        railPoints.push(new THREE.Vector3(
            side * (netWidth / 2 - GOAL.cornerRadius * (1 - Math.cos(angle))),
            frameRadius,
            -(netDepth - GOAL.cornerRadius) - GOAL.cornerRadius * Math.sin(angle)
        ));
    }
    const railCurve = new THREE.CatmullRomCurve3(railPoints);
    game.net.add(new THREE.Mesh(new THREE.TubeGeometry(railCurve, 32, frameRadius, 8, false), frameMat));
}
const backBottom = new THREE.Mesh(
    new THREE.CylinderGeometry(frameRadius, frameRadius, GOAL.rearWidth, 12),
    frameMat
);
backBottom.rotation.z = Math.PI / 2;
backBottom.position.set(0, frameRadius, -netDepth);
game.net.add(backBottom);

function createNettingTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7;
    for(let i=0; i<=128; i+=12) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 6);
    return tex;
}
const nettingMat = new THREE.MeshBasicMaterial({ map: createNettingTexture(), transparent: true, side: THREE.DoubleSide, opacity: 0.7 });
function createNetSurface(rows, columns, getPosition) {
    const positions = [];
    const uvs = [];
    const indices = [];
    for (let row = 0; row <= rows; row++) {
        for (let column = 0; column <= columns; column++) {
            const position = getPosition(row / rows, column / columns);
            positions.push(position.x, position.y, position.z);
            uvs.push(column / columns, row / rows);
        }
    }
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            const a = row * (columns + 1) + column;
            const b = a + columns + 1;
            indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

function createNetLines(rows, columns, getPosition, material) {
    const positions = [];
    const addLine = (start, end) => positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
    for (let row = 0; row <= rows; row++) {
        for (let column = 0; column < columns; column++) {
            addLine(getPosition(row / rows, column / columns), getPosition(row / rows, (column + 1) / columns));
        }
    }
    for (let column = 0; column <= columns; column++) {
        for (let row = 0; row < rows; row++) {
            addLine(getPosition(row / rows, column / columns), getPosition((row + 1) / rows, column / columns));
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.LineSegments(geometry, material);
}

function netWidthAtDepth(depth) {
    const cornerProgress = THREE.MathUtils.clamp((depth - (netDepth - GOAL.cornerRadius)) / GOAL.cornerRadius, 0, 1);
    const roundedCorner = cornerProgress * cornerProgress * (3 - 2 * cornerProgress);
    return netWidth / 2 - GOAL.cornerRadius * roundedCorner;
}

function sideNetPosition(side, depthProgress, heightProgress) {
    const depth = depthProgress * netDepth;
    const topX = THREE.MathUtils.lerp(netWidth / 2, GOAL.rearWidth / 2, depthProgress);
    const topY = THREE.MathUtils.lerp(netHeight, GOAL.rearHeight, depthProgress);
    const bottomX = netWidthAtDepth(depth);
    return new THREE.Vector3(
        side * THREE.MathUtils.lerp(bottomX, topX, heightProgress),
        THREE.MathUtils.lerp(frameRadius, topY, heightProgress),
        THREE.MathUtils.lerp(-depth, -GOAL.rearTopDepth * depthProgress, heightProgress)
    );
}

function topNetPosition(depthProgress, widthProgress) {
    const halfWidth = THREE.MathUtils.lerp(netWidth / 2, GOAL.rearWidth / 2, depthProgress);
    return new THREE.Vector3(
        -halfWidth + 2 * halfWidth * widthProgress,
        THREE.MathUtils.lerp(netHeight, GOAL.rearHeight, depthProgress),
        -GOAL.rearTopDepth * depthProgress
    );
}

const backNet = new THREE.Mesh(
    createNetSurface(8, 8, (heightProgress, widthProgress) => new THREE.Vector3(
        -GOAL.rearWidth / 2 + GOAL.rearWidth * widthProgress,
        frameRadius + (GOAL.rearHeight - frameRadius) * heightProgress,
        THREE.MathUtils.lerp(-netDepth, -GOAL.rearTopDepth, heightProgress)
    )),
    nettingMat
);
const leftNet = new THREE.Mesh(
    createNetSurface(20, 12, (depthProgress, heightProgress) =>
        sideNetPosition(-1, depthProgress, heightProgress)),
    nettingMat
);
const rightNet = new THREE.Mesh(
    createNetSurface(20, 12, (depthProgress, heightProgress) =>
        sideNetPosition(1, depthProgress, heightProgress)),
    nettingMat
);
const topNet = new THREE.Mesh(createNetSurface(16, 12, topNetPosition), nettingMat);
const netLineMat = new THREE.LineBasicMaterial({ color: 0x9ca3af, transparent: true, opacity: 0.85 });
const backNetLines = createNetLines(6, 8, (heightProgress, widthProgress) => new THREE.Vector3(
    -GOAL.rearWidth / 2 + GOAL.rearWidth * widthProgress,
    frameRadius + (GOAL.rearHeight - frameRadius) * heightProgress,
    THREE.MathUtils.lerp(-netDepth, -GOAL.rearTopDepth, heightProgress) - 1
), netLineMat);
const topNetLines = createNetLines(8, 8, topNetPosition, netLineMat);
game.net.add(backNet, leftNet, rightNet, topNet, backNetLines, topNetLines);
for (const side of [-1, 1]) {
    game.net.add(createNetLines(12, 8, (depthProgress, heightProgress) =>
        sideNetPosition(side, depthProgress, heightProgress), netLineMat));
}
game.net.position.set(0, 0, -26000);

// Radar Speed Box on Tripod next to Goal
let lastDisplayedSpeed = 0;
let radarCanvas = null;
let radarCtx = null;
let radarTexture = null;

export function updateGoalSpeedDisplay(speedVal = lastDisplayedSpeed, unitStr) {
  if (typeof speedVal === 'number') {
    lastDisplayedSpeed = speedVal;
  }
  if (!unitStr) {
    unitStr = gameSettings?.speedUnit === 'mph' ? 'MPH' : 'KM/H';
  }
  if (!radarCtx || !radarTexture) return;

  const ctx = radarCtx;
  const w = 1024;
  const h = 512;

  // Solid black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  const val = Number(lastDisplayedSpeed) || 0;
  const unit = (unitStr || 'KM/H').toUpperCase();
  const numStr = val > 0 ? (val >= 100 ? Math.round(val).toString() : val.toFixed(1)) : '0';

  // Bright red numbers and unit
  ctx.fillStyle = '#ff0000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Big red speed number
  ctx.font = 'bold 300px monospace';
  ctx.fillText(numStr, w / 2 - 120, h / 2);

  // Red unit beside it
  ctx.font = 'bold 100px monospace';
  ctx.fillText(unit, w - 160, h / 2 + 30);

  radarTexture.needsUpdate = true;
}

export function createSpeedRadarBox() {
  const radarAssembly = new THREE.Group();

  const boxW = 750;
  const boxH = 420;
  const boxD = 120;
  const boxY = 750;

  const boxGroup = new THREE.Group();
  boxGroup.position.set(0, boxY, 0);

  // Black box casing
  const casingGeo = new THREE.BoxGeometry(boxW, boxH, boxD);
  const casingMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
  const casing = new THREE.Mesh(casingGeo, casingMat);
  boxGroup.add(casing);

  // Screen on front of box
  radarCanvas = document.createElement('canvas');
  radarCanvas.width = 1024;
  radarCanvas.height = 512;
  radarCtx = radarCanvas.getContext('2d');
  radarTexture = new THREE.CanvasTexture(radarCanvas);

  const screenGeo = new THREE.PlaneGeometry(boxW - 20, boxH - 20);
  const screenMat = new THREE.MeshBasicMaterial({
    map: radarTexture,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  const screenMesh = new THREE.Mesh(screenGeo, screenMat);
  screenMesh.position.set(0, 0, boxD / 2 + 2);
  boxGroup.add(screenMesh);

  radarAssembly.add(boxGroup);

  // Tripod stand
  const tripodMat = new THREE.MeshBasicMaterial({ color: 0x181818 });
  const poleGeo = new THREE.CylinderGeometry(16, 16, 520, 8);
  const pole = new THREE.Mesh(poleGeo, tripodMat);
  pole.position.set(0, 480, 0);
  radarAssembly.add(pole);

  // 3 tripod legs down to ice
  const legAngles = [Math.PI / 6, 5 * Math.PI / 6, 3 * Math.PI / 2];
  const legSpread = 280;
  for (let i = 0; i < 3; i++) {
    const angle = legAngles[i];
    const footX = legSpread * Math.cos(angle);
    const footZ = legSpread * Math.sin(angle);
    const topPos = new THREE.Vector3(0, 360, 0);
    const botPos = new THREE.Vector3(footX, 0, footZ);
    const dir = new THREE.Vector3().subVectors(botPos, topPos);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(topPos, botPos).multiplyScalar(0.5);

    const legGeo = new THREE.CylinderGeometry(12, 12, len, 8);
    const legMesh = new THREE.Mesh(legGeo, tripodMat);
    legMesh.position.copy(mid);
    legMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    radarAssembly.add(legMesh);
  }

  // Placed to the side of the goal (right post is at X=915), behind the red line (Z=-26000)
  radarAssembly.position.set(1600, 0, -26100);
  radarAssembly.rotation.y = Math.atan2(-1600, 8400);

  // Initialize display
  updateGoalSpeedDisplay(0, gameSettings?.speedUnit === 'mph' ? 'MPH' : 'KM/H');

  return radarAssembly;
}

export const speedRadarBox = createSpeedRadarBox();
scene.add(speedRadarBox);
scene.add(game.net);

// ==========================================
// Scorebug UI Updater (Broadcast Ticker)
// ==========================================
const KP_STICK_INFO = {
  low: {
    label: 'Low Kick',
    src: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Lowkplogo.png?v=1790252741'
  },
  mid: {
    label: 'Mid Kick',
    src: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Midkplogo.png?v=1790253037'
  },
  hybrid: {
    label: 'Hybrid Kick',
    src: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Hybridkplogo.png?v=1790252741'
  }
};

export function getStickInfo(kp) {
  if (!kp) return KP_STICK_INFO.mid;
  const k = String(kp).toLowerCase().trim();
  if (k.includes('low')) return KP_STICK_INFO.low;
  if (k.includes('hybrid')) return KP_STICK_INFO.hybrid;
  if (k.includes('mid') || k.includes('high')) return KP_STICK_INFO.mid;
  return KP_STICK_INFO[k] || KP_STICK_INFO.mid;
}

let lastScoreboardData = {
  score: 0,
  shots: 0,
  fastestRelease: 0,
  fastestReleaseKp: null,
  hardestShot: 0,
  hardestShotKp: null,
  unit: 'KM/H'
};

export function updateScoreboard(data = {}) {
  const score = data.score !== undefined ? data.score : (game.score ?? lastScoreboardData.score ?? 0);
  const shots = data.shots !== undefined ? data.shots : (game.shots ?? lastScoreboardData.shots ?? 0);

  const fastestRelease = Number(data.fastestRelease || game.fastestRelease || lastScoreboardData.fastestRelease || 0);
  const fastestReleaseKp = data.fastestReleaseKp || game.fastestReleaseKp || lastScoreboardData.fastestReleaseKp || StickCustomizerState?.kickpoint || 'mid';

  const unit = (data.unit || (gameSettings?.speedUnit === 'mph' ? 'MPH' : 'KM/H') || lastScoreboardData.unit || 'KM/H').toUpperCase();

  let hardestShot = Number(data.hardestShot || game.hardestShot || lastScoreboardData.hardestShot || 0);
  if (game.hardestShotKmh && game.hardestShotKmh > 0) {
    hardestShot = unit === 'MPH' ? (game.hardestShotKmh * 0.621371) : game.hardestShotKmh;
  }
  const hardestShotKp = data.hardestShotKp || game.hardestShotKp || lastScoreboardData.hardestShotKp || StickCustomizerState?.kickpoint || 'mid';

  lastScoreboardData = {
    score,
    shots,
    fastestRelease,
    fastestReleaseKp,
    hardestShot,
    hardestShotKp,
    unit
  };

  if (fastestRelease > 0) {
    game.fastestRelease = fastestRelease;
    game.fastestReleaseKp = fastestReleaseKp;
  }
  if (hardestShot > 0) {
    game.hardestShot = hardestShot;
    game.hardestShotKp = hardestShotKp;
  }

  const elScore = document.getElementById('scorebug-val-score');
  if (elScore) elScore.textContent = lastScoreboardData.score;

  const elShots = document.getElementById('scorebug-val-shots');
  if (elShots) elShots.textContent = lastScoreboardData.shots;

  const elRelease = document.getElementById('scorebug-val-release');
  const elReleaseUnit = document.getElementById('scorebug-unit-release');
  const elReleaseStick = document.getElementById('scorebug-stick-release');
  const elReleaseImg = document.getElementById('scorebug-stick-img-release');
  const elReleaseLbl = document.getElementById('scorebug-stick-lbl-release');

  if (elRelease) {
    if (lastScoreboardData.fastestRelease > 0) {
      elRelease.textContent = Math.round(lastScoreboardData.fastestRelease);
      if (elReleaseUnit) elReleaseUnit.style.display = 'inline';
      const stickInfo = getStickInfo(lastScoreboardData.fastestReleaseKp);
      if (elReleaseStick && elReleaseImg) {
        elReleaseImg.src = stickInfo.src;
        if (elReleaseLbl) elReleaseLbl.textContent = stickInfo.label;
        elReleaseStick.style.display = 'flex';
      }
    } else {
      elRelease.textContent = '—';
      if (elReleaseUnit) elReleaseUnit.style.display = 'none';
      if (elReleaseStick) elReleaseStick.style.display = 'none';
    }
  }

  const elSpeed = document.getElementById('scorebug-val-speed');
  const elSpeedUnit = document.getElementById('scorebug-unit-speed');
  const elSpeedStick = document.getElementById('scorebug-stick-speed');
  const elSpeedImg = document.getElementById('scorebug-stick-img-speed');
  const elSpeedLbl = document.getElementById('scorebug-stick-lbl-speed');

  if (elSpeed) {
    if (elSpeedUnit) elSpeedUnit.textContent = unit;

    if (lastScoreboardData.hardestShot > 0) {
      elSpeed.textContent = lastScoreboardData.hardestShot >= 100
        ? Math.round(lastScoreboardData.hardestShot)
        : lastScoreboardData.hardestShot.toFixed(1);
      if (elSpeedUnit) elSpeedUnit.style.display = 'inline';
      const stickInfo = getStickInfo(lastScoreboardData.hardestShotKp);
      if (elSpeedStick && elSpeedImg) {
        elSpeedImg.src = stickInfo.src;
        if (elSpeedLbl) elSpeedLbl.textContent = stickInfo.label;
        elSpeedStick.style.display = 'flex';
      }
    } else {
      elSpeed.textContent = '—';
      if (elSpeedUnit) elSpeedUnit.style.display = 'none';
      if (elSpeedStick) elSpeedStick.style.display = 'none';
    }
  }
}

export function createMarker(colorHex) {
  const geom = new THREE.TorusGeometry(26, 4, 16, 32);
  const mat = new THREE.MeshBasicMaterial({ color: colorHex });
  const mesh = new THREE.Mesh(geom, mat);
  scene.add(mesh);
  return mesh;
}
export const bgMarker = createMarker(0xf59e0b);
export const thMarker = createMarker(0x38bdf8);

// Targets and Particles
export function createTargetTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Outer white circle
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, Math.PI * 2);
    ctx.fill();

    // Outer red ring
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.arc(128, 128, 80, 0, Math.PI * 2);
    ctx.stroke();

    // Inner red bullseye
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(128, 128, 30, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
}

export const targetGroup = new THREE.Group();
scene.add(targetGroup);

export const particleGroup = new THREE.Group();
scene.add(particleGroup);

// Tracers
export const shotTracerGeo = new THREE.BufferGeometry();
// Maximum points for the shot tracer
const maxPoints = 500;
const tracerPositions = new Float32Array(maxPoints * 3);
shotTracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPositions, 3));
// Setting draw range to 0 initially
shotTracerGeo.setDrawRange(0, 0);

const shotTracerMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    linewidth: 2,
    transparent: true,
    opacity: 0.8
});
export const shotTracerLine = new THREE.Line(shotTracerGeo, shotTracerMat);
scene.add(shotTracerLine);

export function updateBoardLogos(kickpoint) {
    if (kickpointLogos[kickpoint]) {
        kpLogoPlaneLeft.material.map = kickpointLogos[kickpoint];
        kpLogoPlaneLeft.material.needsUpdate = true;
        kpLogoPlaneRight.material.map = kickpointLogos[kickpoint];
        kpLogoPlaneRight.material.needsUpdate = true;
        fitKickpointLogos(kickpointLogos[kickpoint]);
    }
}

export let stickParams = {
    stickMesh: null,
    stickGroup: null,
    indicatorMesh: null,
    indicatorStartTime: 0,
    ghostStickGroup: null,
    ghostStickMesh: null,
    stickRestY: 0,
    originalPositions: null,
    vertexRows: null,
    initialGroupPosition: null // We will store the exactly aligned initial group position here
};
