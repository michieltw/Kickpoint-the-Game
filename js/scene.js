import * as THREE from 'three';
import { game } from './state.js?v=goal-net-3';
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

// Boarding
const boardGroup = new THREE.Group();

const textureLoader = new THREE.TextureLoader();
// Base white board material
const boardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, side: THREE.DoubleSide });
const kickPlateMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5, side: THREE.DoubleSide });
const topRailMat = new THREE.MeshStandardMaterial({ color: 0x0033a0, roughness: 0.3 });
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.9, opacity: 1, transparent: true, roughness: 0.1, ior: 1.5, side: THREE.DoubleSide });

const boardHeight = 1100;
const glassHeight = 2000;
const cornerRadius = 8500;
const straightWidth = rinkWidth - (2 * cornerRadius);
const straightDepth = rinkDepth - cornerRadius;

// Helpers to build walls
function createWall(w, h, rotY, px, pz, kDir) {
  const wall = new THREE.Group();
  const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), boardMat);
  b.position.y = h/2;
  const k = new THREE.Mesh(new THREE.PlaneGeometry(w, 200), kickPlateMat);
  k.position.y = 100; k.position.z = kDir * 5;
  const r = new THREE.Mesh(new THREE.BoxGeometry(w, 50, 100), topRailMat);
  r.position.y = h;
  const g = new THREE.Mesh(new THREE.PlaneGeometry(w, glassHeight), glassMat);
  g.position.y = h + glassHeight/2;
  wall.add(b, k, r, g);
  wall.rotation.y = rotY;
  wall.position.set(px, 0, pz);
  return wall;
}

boardGroup.add(createWall(straightWidth, boardHeight, 0, 0, -rinkDepth, 1));
boardGroup.add(createWall(straightDepth, boardHeight, Math.PI/2, -rinkWidth/2, -straightDepth/2, 1));
boardGroup.add(createWall(straightDepth, boardHeight, -Math.PI/2, rinkWidth/2, -straightDepth/2, -1));

const cornerRailGeo = new THREE.TorusGeometry(cornerRadius, 25, 8, 32, Math.PI/2);
function createCorner(x, z, rY) {
  const corner = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(cornerRadius, cornerRadius, boardHeight, 32, 1, true, Math.PI/2, Math.PI/2), boardMat);
  b.position.y = boardHeight/2;
  const k = new THREE.Mesh(new THREE.CylinderGeometry(cornerRadius-5, cornerRadius-5, 200, 32, 1, true, Math.PI/2, Math.PI/2), kickPlateMat);
  k.position.y = 100;
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
const logoTex = textureLoader.load('https://cdn.shopify.com/s/files/1/1038/7203/7203/files/blackonwhitelogo.png?v=1791376612');
const logoMat = new THREE.MeshBasicMaterial({
    map: logoTex,
    transparent: true,
    depthWrite: false
});
// Aspect ratio is 4617 / 1049 = ~4.401
const logoHeight = 800;
const logoWidth = logoHeight * (4617 / 1049);
const logoPlane = new THREE.Mesh(new THREE.PlaneGeometry(logoWidth, logoHeight), logoMat);
// Position directly behind the goal, pushed slightly further off the boards to prevent z-fighting
logoPlane.position.set(0, logoHeight/2 + 150, -rinkDepth + 15);
boardGroup.add(logoPlane);

scene.add(boardGroup);

// Tribune
const tribuneGroup = new THREE.Group();
const concreteMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
const seatMat1 = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });
const seatMat2 = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
const stepDepth = 900, stepHeight = 450, numRows = 12;
const startY = boardHeight + 200, startX = rinkWidth / 2 + 500, zOffset = -straightDepth / 2;

for (let i = 0; i < numRows; i++) {
  // Left
  let step = new THREE.Mesh(new THREE.BoxGeometry(stepDepth, stepHeight, straightDepth), concreteMat);
  step.position.set(-startX - (i * stepDepth), startY + (i * stepHeight), zOffset);
  let bench = new THREE.Mesh(new THREE.BoxGeometry(400, 100, straightDepth - 200), i % 2 === 0 ? seatMat1 : seatMat2);
  bench.position.set(-startX - (i * stepDepth) + 150, startY + (i * stepHeight) + stepHeight/2 + 50, zOffset);
  tribuneGroup.add(step, bench);

  // Right
  step = new THREE.Mesh(new THREE.BoxGeometry(stepDepth, stepHeight, straightDepth), concreteMat);
  step.position.set(startX + (i * stepDepth), startY + (i * stepHeight), zOffset);
  bench = new THREE.Mesh(new THREE.BoxGeometry(400, 100, straightDepth - 200), i % 2 === 0 ? seatMat1 : seatMat2);
  bench.position.set(startX + (i * stepDepth) - 150, startY + (i * stepHeight) + stepHeight/2 + 50, zOffset);
  tribuneGroup.add(step, bench);

  // Far
  step = new THREE.Mesh(new THREE.BoxGeometry(straightWidth, stepHeight, stepDepth), concreteMat);
  step.position.set(0, startY + (i * stepHeight), -rinkDepth - 500 - (i * stepDepth));
  bench = new THREE.Mesh(new THREE.BoxGeometry(straightWidth - 200, 100, 400), i % 2 === 0 ? seatMat1 : seatMat2);
  bench.position.set(0, startY + (i * stepHeight) + stepHeight/2 + 50, -rinkDepth - 500 - (i * stepDepth) - 150);
  tribuneGroup.add(step, bench);
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

export const GOAL = Object.freeze({
    width: 1830,
    height: 1220,
    depth: 1000,
    rearWidth: 1400,
    rearHeight: 900,
    cornerRadius: 215,
    postRadius: 30
});

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
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
    for(let i=0; i<=128; i+=16) {
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

function netHeightAtDepth(depth) {
    return THREE.MathUtils.lerp(netHeight, GOAL.rearHeight, depth / netDepth);
}

const backNet = new THREE.Mesh(
    new THREE.PlaneGeometry(GOAL.rearWidth, GOAL.rearHeight),
    nettingMat
);
backNet.position.set(0, GOAL.rearHeight / 2, -netDepth);
const sideNetGeo = createNetSurface(16, 8, (depthProgress, heightProgress) => {
    const depth = depthProgress * netDepth;
    return new THREE.Vector3(
        netWidthAtDepth(depth),
        frameRadius + (netHeightAtDepth(depth) - frameRadius) * heightProgress,
        -depth
    );
});
const leftNet = new THREE.Mesh(sideNetGeo, nettingMat);
const rightNet = new THREE.Mesh(sideNetGeo, nettingMat);
leftNet.scale.x = -1;
const topNet = new THREE.Mesh(
    createNetSurface(16, 8, (depthProgress, widthProgress) => {
        const depth = depthProgress * netDepth;
        const halfWidth = netWidthAtDepth(depth);
        return new THREE.Vector3(
            -halfWidth + 2 * halfWidth * widthProgress,
            netHeightAtDepth(depth),
            -depth
        );
    }),
    nettingMat
);
const netLineMat = new THREE.LineBasicMaterial({ color: 0x9ca3af, transparent: true, opacity: 0.85 });
const backNetLines = createNetLines(6, 8, (heightProgress, widthProgress) => new THREE.Vector3(
    -GOAL.rearWidth / 2 + GOAL.rearWidth * widthProgress,
    frameRadius + (GOAL.rearHeight - frameRadius) * heightProgress,
    -netDepth - 1
), netLineMat);
const topNetLines = createNetLines(8, 8, (depthProgress, widthProgress) => {
    const depth = depthProgress * netDepth;
    const halfWidth = netWidthAtDepth(depth);
    return new THREE.Vector3(-halfWidth + 2 * halfWidth * widthProgress, netHeightAtDepth(depth), -depth);
}, netLineMat);
game.net.add(backNet, leftNet, rightNet, topNet, backNetLines, topNetLines);
for (const side of [-1, 1]) {
    game.net.add(createNetLines(8, 6, (depthProgress, heightProgress) => {
        const depth = depthProgress * netDepth;
        return new THREE.Vector3(
            side * netWidthAtDepth(depth),
            frameRadius + (netHeightAtDepth(depth) - frameRadius) * heightProgress,
            -depth
        );
    }, netLineMat));
}
game.net.position.set(0, 0, -26000);
scene.add(game.net);

// Markers
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

export let stickParams = {
    stickMesh: null,
    stickGroup: null,
    ghostStickGroup: null,
    ghostStickMesh: null,
    stickRestY: 0,
    originalPositions: null,
    vertexRows: null,
    initialGroupPosition: null // We will store the exactly aligned initial group position here
};
