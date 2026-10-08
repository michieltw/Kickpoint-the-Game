import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { appState, state, game, swipeData } from './state.js?v=customizer-layout-17';
import { gameSettings, StickCustomizerState, L_total, Z_center, X_center } from './config.js?v=customizer-layout-17';
import { updatePhysics, getStiffnessDynamics, getBladeContactProgress, getBladePoint, initializeBladePath } from './physics.js?v=customizer-layout-17';
import { scene, camera, renderer, controls, ghostPuck, projectedArrow, stickParams, targetGroup, particleGroup, createTargetTexture, shotTracerGeo, shotTracerLine, GOAL } from './scene.js?v=customizer-layout-17';
import { updateUiMode, syncUiFromState, initUiBindings, drawStiffnessCurve } from './ui.js?v=customizer-layout-17';
import { bindInput } from './input.js?v=customizer-layout-17';
import { getStickShotModifiers } from './stick-effects.js?v=customizer-layout-17';

const MODEL_URL = 'https://raw.githubusercontent.com/michieltw/GLB-s/main/glb_files_retextured/P28-ST.glb';

let playDirection = 1;
let lastTime = performance.now();
let customizerPreviewGroup = null;
let gameplayStickVisibility = null;

function applyStickColor(material, color) {
  const normalizedColor = color.toLowerCase();
  const isBlack = normalizedColor === '#000000';
  const isMetallic = ['#c0c0c0', '#d4af37', '#bfc7ce'].includes(normalizedColor);
  material.color?.set(color);
  if (material.emissive) {
    material.emissive.set(isBlack ? '#3b414a' : '#000000');
    material.emissiveIntensity = isBlack ? 0.9 : 0;
  }
  if ('metalness' in material) {
    material.metalness = isMetallic ? 0.65 : 0.08;
    material.roughness = normalizedColor === '#bfc7ce' ? 0.18 : isMetallic ? 0.28 : 0.48;
  }
}

// Replay controls
let replayPaused = false;
let replayDirection = 1;

function getAimAdjustedLaunchVelocity(start, target, speed, speedMultiplier, bladeVelocity) {
  const gravity = 9810;
  const delta = target.clone().sub(start);
  // Find the flight time at the requested speed that compensates for gravity.
  const getVelocityAtTime = (time) => new THREE.Vector3(
    delta.x / (speedMultiplier * time),
    delta.y / (speedMultiplier * time) + gravity * time / (2 * speedMultiplier),
    delta.z / (speedMultiplier * time)
  );
  const getSpeedError = (time) => getVelocityAtTime(time).length() - speed;
  const minTime = 0.02;
  const maxTime = 4;
  const samples = 256;
  let previousTime = minTime;
  let previousError = getSpeedError(previousTime);
  let bracket = null;

  for (let i = 1; i <= samples; i++) {
    const time = minTime + (maxTime - minTime) * i / samples;
    const error = getSpeedError(time);
    if (previousError * error <= 0) {
      bracket = [previousTime, time];
      break;
    }
    previousTime = time;
    previousError = error;
  }

  if (!bracket) {
    const directVelocity = delta.normalize().multiplyScalar(speed);
    return {
      velocity: directVelocity.sub(bladeVelocity),
      flightTime: Math.max(minTime, start.distanceTo(target) / (speed * speedMultiplier))
    };
  }

  let [low, high] = bracket;
  let lowError = getSpeedError(low);
  for (let i = 0; i < 32; i++) {
    const middle = (low + high) / 2;
    const middleError = getSpeedError(middle);
    if (lowError * middleError <= 0) {
      high = middle;
    } else {
      low = middle;
      lowError = middleError;
    }
  }
  const flightTime = (low + high) / 2;

  return {
    velocity: getVelocityAtTime(flightTime).sub(bladeVelocity),
    flightTime
  };
}

function updateGameScore() {
  document.getElementById('score-val').textContent = game.score;
  document.getElementById('shots-val').textContent = game.shots;
  if (game.shots > 0 && projectedArrow.visible) {
    projectedArrow.visible = false;
  }
}

function captureReplayFrame() {
  const frame = { position: game.puck.position.clone(), rotation: game.puck.rotation.clone() };
  if (stickParams.stickMesh && stickParams.stickGroup) {
    frame.stickPositions = new Float32Array(stickParams.stickMesh.geometry.attributes.position.array);
    frame.stickGroupPosition = stickParams.stickGroup.position.clone();
    frame.stickGroupQuaternion = stickParams.stickGroup.quaternion.clone();
  }
  return frame;
}

function refreshReplayControls() {
  const active = game.replayPlayback !== null;
  const replayControls = document.getElementById('replay-controls');
  const replayTimeline = document.getElementById('replayTimeline');
  const replayFrameLabel = document.getElementById('replayFrameLabel');
  const ghostStickToggle = document.getElementById('ghostStickToggle');
  const ghostPuckToggle = document.getElementById('ghostPuckToggle');

  replayControls.classList.toggle('visible', active);
  if (!active) {
    if (stickParams.ghostStickGroup) stickParams.ghostStickGroup.visible = false;
    ghostPuck.visible = false;
    game.puck.visible = true;
    if (stickParams.stickGroup) stickParams.stickGroup.visible = true;
    return;
  }
  replayTimeline.max = Math.max(0, game.replayFrames.length - 1);
  replayTimeline.value = game.replayPlayback;
  replayFrameLabel.textContent = `${Math.floor(game.replayPlayback)} / ${Math.max(0, game.replayFrames.length - 1)}`;
  if (stickParams.ghostStickGroup) stickParams.ghostStickGroup.visible = ghostStickToggle.checked;
  if (stickParams.stickGroup) stickParams.stickGroup.visible = !ghostStickToggle.checked;
  ghostPuck.visible = ghostPuckToggle.checked;
  game.puck.visible = !ghostPuckToggle.checked;
  document.getElementById('replayPlayPause').textContent = replayPaused ? '▶ Afspelen' : '❚❚ Pauze';
}

window.triggerPuckReset = resetPuck;

let puckResetTimeout = null;
let goalOverlay = null;

function schedulePuckReset(delay) {
  if (puckResetTimeout !== null) return;
  puckResetTimeout = window.setTimeout(() => {
    puckResetTimeout = null;
    resetPuck();
  }, delay);
}

function finishMissedShot() {
  if (game.puckState !== 'shot') return;
  game.puckState = 'missed';
  game.puckVelocity.set(0, 0, 0);
  game.replayRecording = false;
  document.getElementById('btnInstantReplay').disabled = game.replayFrames.length < 2;
  schedulePuckReset(2000);
}

function closestPointsOnSegments(firstStart, firstEnd, secondStart, secondEnd) {
  const firstDirection = firstEnd.clone().sub(firstStart);
  const secondDirection = secondEnd.clone().sub(secondStart);
  const startOffset = firstStart.clone().sub(secondStart);
  const firstLengthSq = firstDirection.lengthSq();
  const secondLengthSq = secondDirection.lengthSq();
  const directionDot = firstDirection.dot(secondDirection);
  const firstOffsetDot = firstDirection.dot(startOffset);
  const secondOffsetDot = secondDirection.dot(startOffset);
  if (firstLengthSq < 1e-8) {
    const secondProgress = THREE.MathUtils.clamp(secondOffsetDot / secondLengthSq, 0, 1);
    return {
      puckPoint: firstStart.clone(),
      framePoint: secondStart.clone().addScaledVector(secondDirection, secondProgress)
    };
  }
  const denominator = firstLengthSq * secondLengthSq - directionDot * directionDot;
  let firstProgress = denominator > 0 ? THREE.MathUtils.clamp(
    (directionDot * secondOffsetDot - firstOffsetDot * secondLengthSq) / denominator,
    0,
    1
  ) : 0;
  let secondProgress = (directionDot * firstProgress + secondOffsetDot) / secondLengthSq;

  if (secondProgress < 0) {
    secondProgress = 0;
    firstProgress = THREE.MathUtils.clamp(-firstOffsetDot / firstLengthSq, 0, 1);
  } else if (secondProgress > 1) {
    secondProgress = 1;
    firstProgress = THREE.MathUtils.clamp((directionDot - firstOffsetDot) / firstLengthSq, 0, 1);
  }

  return {
    puckPoint: firstStart.clone().addScaledVector(firstDirection, firstProgress),
    framePoint: secondStart.clone().addScaledVector(secondDirection, secondProgress)
  };
}

function resolveGoalCollisions(previousPosition) {
  const netX = game.net.position.x;
  const netZ = game.net.position.z;
  const puckRadius = 38;
  const collisionRadius = puckRadius + GOAL.postRadius;
  const frameSegments = [
    [
      new THREE.Vector3(netX - GOAL.width / 2, 0, netZ),
      new THREE.Vector3(netX - GOAL.width / 2, GOAL.height, netZ)
    ],
    [
      new THREE.Vector3(netX + GOAL.width / 2, 0, netZ),
      new THREE.Vector3(netX + GOAL.width / 2, GOAL.height, netZ)
    ],
    [
      new THREE.Vector3(netX - GOAL.width / 2, GOAL.height, netZ),
      new THREE.Vector3(netX + GOAL.width / 2, GOAL.height, netZ)
    ]
  ];

  for (const [frameStart, frameEnd] of frameSegments) {
    const { puckPoint, framePoint } = closestPointsOnSegments(
      previousPosition,
      game.puck.position,
      frameStart,
      frameEnd
    );
    if (puckPoint.distanceToSquared(framePoint) >= collisionRadius * collisionRadius) continue;
    const previousFramePoint = closestPointsOnSegments(
      previousPosition,
      previousPosition,
      frameStart,
      frameEnd
    ).framePoint;
    const normal = previousPosition.clone().sub(previousFramePoint);
    if (normal.lengthSq() < 0.001) normal.copy(game.puckVelocity).negate();
    if (normal.lengthSq() < 0.001) normal.set(0, 1, 0);
    normal.normalize();
    game.puck.position.copy(framePoint).addScaledVector(normal, collisionRadius + 0.5);
    if (game.puckVelocity.dot(normal) < 0) {
      game.puckVelocity.reflect(normal).multiplyScalar(0.65);
    }
  }

  const rearSlope = (GOAL.depth - GOAL.rearTopDepth) / (GOAL.rearHeight - 20);
  const getBackNetSignedDistance = position => {
    const heightProgress = THREE.MathUtils.clamp(
      (position.y - 20) / (GOAL.rearHeight - 20),
      0,
      1
    );
    const backNetZ = netZ - GOAL.depth + (GOAL.depth - GOAL.rearTopDepth) * heightProgress;
    return (position.z - backNetZ) / Math.sqrt(1 + rearSlope * rearSlope);
  };
  const previousBackNetDistance = getBackNetSignedDistance(previousPosition);
  const currentBackNetDistance = getBackNetSignedDistance(game.puck.position);
  const crossedBackNet = (previousBackNetDistance > puckRadius && currentBackNetDistance <= puckRadius) ||
    (previousBackNetDistance < -puckRadius && currentBackNetDistance >= -puckRadius) ||
    previousBackNetDistance * currentBackNetDistance <= 0;
  const withinBackNet = Math.abs(game.puck.position.x - netX) < GOAL.rearWidth / 2 + puckRadius &&
    game.puck.position.y > 20 - puckRadius && game.puck.position.y < GOAL.rearHeight + puckRadius;
  if (withinBackNet && crossedBackNet) {
    const normal = new THREE.Vector3(0, -rearSlope, 1).normalize();
    const side = previousBackNetDistance >= 0 ? 1 : -1;
    game.puck.position.addScaledVector(
      normal,
      side * (puckRadius + 0.5 - Math.abs(currentBackNetDistance))
    );
    if (game.puckVelocity.dot(normal) * side < 0) {
      game.puckVelocity.reflect(normal).multiplyScalar(0.55);
    }
  }

  const depth = netZ - game.puck.position.z;
  if (depth < 0 || depth > GOAL.depth) return;

  const roofProgress = THREE.MathUtils.clamp(depth / GOAL.rearTopDepth, 0, 1);
  const halfWidth = THREE.MathUtils.lerp(GOAL.width / 2, GOAL.rearWidth / 2, roofProgress);
  const roofHeight = THREE.MathUtils.lerp(GOAL.height, GOAL.rearHeight, roofProgress);
  const previousDepth = THREE.MathUtils.clamp(netZ - previousPosition.z, 0, GOAL.depth);
  const previousRoofProgress = THREE.MathUtils.clamp(
    previousDepth / GOAL.rearTopDepth,
    0,
    1
  );
  const previousHalfWidth = THREE.MathUtils.lerp(
    GOAL.width / 2,
    GOAL.rearWidth / 2,
    previousRoofProgress
  );
  const previousSideDistance = Math.abs(previousPosition.x - netX) - previousHalfWidth;
  const currentSideDistance = Math.abs(game.puck.position.x - netX) - halfWidth;

  const crossedSideNet = (previousSideDistance < -puckRadius && currentSideDistance >= -puckRadius) ||
    (previousSideDistance > puckRadius && currentSideDistance <= puckRadius) ||
    previousSideDistance * currentSideDistance <= 0;
  if (crossedSideNet && game.puck.position.y > 20 - puckRadius && game.puck.position.y < roofHeight + puckRadius) {
    const side = Math.sign(game.puck.position.x - netX) || 1;
    const cameFromOutside = previousSideDistance > 0;
    const contactSide = cameFromOutside ? side * (halfWidth + puckRadius + 0.5) : side * (halfWidth - puckRadius - 0.5);
    game.puck.position.x = netX + contactSide;
    if ((cameFromOutside && game.puckVelocity.x * side < 0) ||
        (!cameFromOutside && game.puckVelocity.x * side > 0)) {
      game.puckVelocity.x *= -0.55;
    }
  }

  const roofGap = game.puck.position.y - roofHeight;
  const previousRoofHeight = THREE.MathUtils.lerp(
    GOAL.height,
    GOAL.rearHeight,
    THREE.MathUtils.clamp(previousDepth / GOAL.rearTopDepth, 0, 1)
  );
  const previousRoofGap = previousPosition.y - previousRoofHeight;
  const crossedRoofNet = (previousRoofGap < -puckRadius && roofGap >= -puckRadius) ||
    (previousRoofGap > puckRadius && roofGap <= puckRadius) ||
    previousRoofGap * roofGap <= 0;
  if (crossedRoofNet && depth <= GOAL.rearTopDepth + puckRadius &&
      Math.abs(game.puck.position.x - netX) < halfWidth + puckRadius) {
    const cameFromAbove = previousRoofGap > 0;
    game.puck.position.y = roofHeight + (cameFromAbove ? puckRadius + 0.5 : -puckRadius - 0.5);
    const roofNormal = new THREE.Vector3(0, 1, -((GOAL.height - GOAL.rearHeight) / GOAL.depth)).normalize();
    if ((cameFromAbove && game.puckVelocity.dot(roofNormal) < 0) ||
        (!cameFromAbove && game.puckVelocity.dot(roofNormal) > 0)) {
      game.puckVelocity.reflect(roofNormal).multiplyScalar(0.55);
    }
  }
}

function resetPuck() {
  if (puckResetTimeout !== null) {
    window.clearTimeout(puckResetTimeout);
    puckResetTimeout = null;
  }
  if (goalOverlay) {
    goalOverlay.remove();
    goalOverlay = null;
  }

  if (game.mode === 'randomSpawn') {
      // Offensive zone: from roughly blue line (z=-10000) to below the circles (z=-20000)
      // Avoid edges: limit width to roughly +/- 6000
      const randomZ = -10000 - Math.random() * 10000;
      const randomX = (Math.random() - 0.5) * 12000;
      game.puck.position.set(randomX, 12.5, randomZ);

      // Also update stick position to follow the puck in randomSpawn mode
      if (stickParams.stickGroup && stickParams.initialGroupPosition) {
          // Puck's default start is 95, 12.5, -20120. Calculate delta to new puck pos:
          const deltaX = randomX - 95;
          const deltaZ = randomZ - (-20120);
          stickParams.stickGroup.position.set(
              stickParams.initialGroupPosition.x + deltaX,
              stickParams.stickRestY,
              stickParams.initialGroupPosition.z + deltaZ
          );
      }
      // Update camera and controls to follow the random spawn
      camera.position.set(randomX, 1000, randomZ + 2420);
      controls.target.set(randomX, 600, randomZ - 580);
  } else {
      game.puck.position.set(95, 12.5, -20120);
      if (stickParams.stickGroup && stickParams.initialGroupPosition) {
          stickParams.stickGroup.position.copy(stickParams.initialGroupPosition);
      }
      camera.position.set(0, 1000, -17700);
      controls.target.set(0, 600, -20700);
  }

  game.puck.rotation.set(0, 0, 0);
  game.puckVelocity.set(0, 0, 0);
  game.puckState = 'idle';
  game.shotAim = null;
  game.shotQuickness = 1;
  game.replayRecording = false;
  game.replayPlayback = null;
  replayPaused = false;
  refreshReplayControls();
  game.bladeTipSpeed = 0;
  game.bladeContactProgress = 0;
  game.lastBladeTipPosition = null;
  game.bladeVelocity.set(0, 0, 0);
  game.bladeForwardSpeed = 0;
  game.peakBladeForwardSpeed = 0;
  game.bladeDecelerationFrames = 0;
  game.lastBladeCenterPosition = null;
  document.getElementById('btnInstantReplay').disabled = game.replayFrames.length < 2;
  swipeData.triggered = false;

  // Clear Tracers
  shotTracerLine.visible = false;
  shotTracerGeo.setDrawRange(0, 0);
  const aimCanvas = document.getElementById('aimTracerCanvas');
  if(aimCanvas) {
      const aimCtx = aimCanvas.getContext('2d');
      aimCtx.clearRect(0, 0, aimCanvas.width, aimCanvas.height);
  }

  state.isPlaying = false;
  state.timeline = 0;
  playDirection = 1;
  document.getElementById('btnPlay').textContent = '▶ Play';
  updatePhysics();
}

// Bind replay buttons
document.getElementById('btnInstantReplay').addEventListener('click', () => {
  if (game.replayFrames.length < 2 || game.replayRecording) return;
  game.replayPlayback = 0;
  replayDirection = 1;
  replayPaused = false;
  game.puckState = 'replay';
  refreshReplayControls();
});

document.getElementById('replayPlayPause').addEventListener('click', () => {
  if (game.replayPlayback === null) return;
  replayPaused = !replayPaused;
  if (!replayPaused && game.replayPlayback >= game.replayFrames.length - 1) {
    game.replayPlayback = 0;
    replayDirection = 1;
  }
  refreshReplayControls();
});
document.getElementById('replayRewind').addEventListener('click', () => {
  if (game.replayPlayback === null) return;
  replayDirection = -1;
  replayPaused = false;
  refreshReplayControls();
});
document.getElementById('replayStepBack').addEventListener('click', () => {
  if (game.replayPlayback === null) return;
  replayPaused = true;
  replayDirection = -1;
  game.replayPlayback = Math.max(0, game.replayPlayback - 1);
  refreshReplayControls();
});
document.getElementById('replayStepForward').addEventListener('click', () => {
  if (game.replayPlayback === null) return;
  replayPaused = true;
  replayDirection = 1;
  game.replayPlayback = Math.min(game.replayFrames.length - 1, game.replayPlayback + 1);
  refreshReplayControls();
});
document.getElementById('replayTimeline').addEventListener('input', () => {
  if (game.replayPlayback === null) return;
  replayPaused = true;
  game.replayPlayback = Number(document.getElementById('replayTimeline').value);
  refreshReplayControls();
});
document.getElementById('ghostStickToggle').addEventListener('change', refreshReplayControls);
document.getElementById('ghostPuckToggle').addEventListener('change', refreshReplayControls);
document.getElementById('replayClose').addEventListener('click', resetPuck);

// Target Practice Logic
const targetRadius = 240;
let targetMaterial = null;

function spawnTargets() {
    targetGroup.clear();
    particleGroup.clear();
    game.activeTargets = [];
    game.particles = [];

    if(!targetMaterial) {
        targetMaterial = new THREE.MeshBasicMaterial({
            map: createTargetTexture(),
            transparent: true,
            side: THREE.DoubleSide
        });
    }

    // Target practice places targets within the goal opening.
    const netX = game.net.position.x;
    const netZ = game.net.position.z;
    const netWidth = GOAL.width;
    const netHeight = GOAL.height;

    const offsets = [
        { x: -netWidth/2 + targetRadius - 30, y: netHeight - targetRadius + 30 }, // Top Left
        { x: netWidth/2 - targetRadius + 30, y: netHeight - targetRadius + 30 },  // Top Right
        { x: -netWidth/2 + targetRadius - 30, y: targetRadius - 30 },            // Bottom Left
        { x: netWidth/2 - targetRadius + 30, y: targetRadius - 30 }              // Bottom Right
    ];

    for(const offset of offsets) {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(targetRadius*2, targetRadius*2), targetMaterial);
        // Position them slightly inside the goal mouth so they are hittable
        mesh.position.set(netX + offset.x, offset.y, netZ + 100);
        targetGroup.add(mesh);
        game.activeTargets.push({
            mesh: mesh,
            x: netX + offset.x,
            y: offset.y,
            z: netZ + 100,
            radius: targetRadius
        });
    }
}

window.addEventListener('startTargetPractice', () => {
    spawnTargets();
    resetPuck();
});

function shatterTarget(target) {
    targetGroup.remove(target.mesh);
    game.activeTargets = game.activeTargets.filter(t => t !== target);

    // Spawn particles
    const particleGeo = new THREE.PlaneGeometry(30, 30);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const particleRedMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });

    for(let i=0; i<15; i++) {
        const mat = Math.random() > 0.5 ? particleMat : particleRedMat;
        const pMesh = new THREE.Mesh(particleGeo, mat);
        pMesh.position.copy(target.mesh.position);
        particleGroup.add(pMesh);

        const angle = Math.random() * Math.PI * 2;
        const speed = 500 + Math.random() * 1500;

        game.particles.push({
            mesh: pMesh,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            vz: 500 + Math.random() * 1000, // burst out towards camera
            rx: Math.random() * 10,
            ry: Math.random() * 10,
            life: 1.0
        });
    }

    document.getElementById('target-count').textContent = game.activeTargets.length;
}

// Animation Loop
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const delta = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if(appState.mode === 'game' && game.mode === 'targets') {
      if(game.activeTargets.length > 0) {
          game.targetTimeElapsed = (now - game.targetStartTime) / 1000;
          document.getElementById('target-time').textContent = game.targetTimeElapsed.toFixed(2);
      }
  }

  if (state.isPlaying && !state.holdMaxBend) {
    const shotQuickness = swipeData.triggered || ['shot', 'goal', 'missed'].includes(game.puckState)
      ? game.shotQuickness
      : 1;
    const stepRate = 800 * delta * shotQuickness;
    let next = state.timeline + stepRate * playDirection;
    if (next >= 1200) {
      next = 1200;
      if (game.puckState === 'shot' || game.puckState === 'goal' || game.puckState === 'missed') {
        state.isPlaying = false;
        playDirection = 1;
        document.getElementById('btnPlay').textContent = '▶ Play';
      } else {
        playDirection = -1;
      }
    } else if (next <= 0) {
      next = 0;
      playDirection = 1;
    }
    state.timeline = Math.round(next);
    syncUiFromState();
    updatePhysics();

    let bladeContactProgress = null;
    if (swipeData.triggered && state.timeline >= game.contactTime - 100) {
        bladeContactProgress = getBladeContactProgress();
    }

    if (game.puckState === 'idle' && swipeData.triggered && bladeContactProgress !== null) {
      game.puckState = 'attached';
      game.bladeContactProgress = 0;

      game.contactTime = state.timeline;
      const stiffnessDynamics = getStiffnessDynamics();
      game.releaseTime = game.contactTime + 180 * stiffnessDynamics.timingScale;

      const contactHeel = getBladePoint(game.bladeHeelIndex);
      const contactTip = getBladePoint(game.bladeTipIndex);
      const contactBladeAxis = contactTip.clone().sub(contactHeel);

      game.bladeContactAxis.copy(contactBladeAxis.normalize());

      const upVector = new THREE.Vector3(0, 1, 0);
      let frontNormal = new THREE.Vector3().crossVectors(game.bladeContactAxis, upVector).normalize();

      if (frontNormal.z > 0) frontNormal.negate();

      const bladeClearance = 54;
      game.bladeContactOffset.copy(frontNormal).multiplyScalar(bladeClearance);

      game.bladeVelocity.set(0, 0, 0);
      game.bladeForwardSpeed = 0;
      game.peakBladeForwardSpeed = 0;
      game.bladeDecelerationFrames = 0;
      game.lastBladeCenterPosition = null;
      game.shots++;
      updateGameScore();
    }

    if (game.puckState === 'attached') {
      const rollProgress = Math.max(0, Math.min(1, (state.timeline - game.contactTime) / (game.releaseTime - game.contactTime)));
      if (game.bladeHeelIndex >= 0 && game.bladeTipIndex >= 0) {
        const heel = getBladePoint(game.bladeHeelIndex);
        const tip = getBladePoint(game.bladeTipIndex);
        if (game.lastBladeTipPosition && delta > 0) {
          const instantTipSpeed = tip.distanceTo(game.lastBladeTipPosition) / delta;
          game.bladeTipSpeed = THREE.MathUtils.lerp(game.bladeTipSpeed, instantTipSpeed, 0.35);
        }
        game.lastBladeTipPosition = tip.clone();

        const bladeCenter = heel.clone().add(tip).multiplyScalar(0.5);
        if (game.lastBladeCenterPosition && delta > 0) {
          const instantBladeVelocity = bladeCenter.clone().sub(game.lastBladeCenterPosition).multiplyScalar(1 / delta);
          game.bladeVelocity.lerp(instantBladeVelocity, 0.4);
          game.bladeForwardSpeed = -game.bladeVelocity.z;
          if (game.bladeForwardSpeed > game.peakBladeForwardSpeed) {
            game.peakBladeForwardSpeed = game.bladeForwardSpeed;
            game.bladeDecelerationFrames = 0;
          } else if (game.peakBladeForwardSpeed > 300 && game.bladeForwardSpeed < game.peakBladeForwardSpeed * 0.92) {
            game.bladeDecelerationFrames++;
          } else {
            game.bladeDecelerationFrames = 0;
          }
        }
        game.lastBladeCenterPosition = bladeCenter;

        const bladeRollProgress = game.bladeContactProgress + (1.05 - game.bladeContactProgress) * rollProgress;
        const currentBladeAxis = tip.clone().sub(heel).normalize();
        const contactOffset = game.bladeContactOffset.clone().applyQuaternion(
          new THREE.Quaternion().setFromUnitVectors(game.bladeContactAxis, currentBladeAxis)
        );
        game.puck.position.lerpVectors(heel, tip, bladeRollProgress).add(contactOffset);
        game.puck.position.y = 12.5;
        game.puck.rotation.set(0, rollProgress * Math.PI * 1.2, 0);
      }

      const bladeHasStartedSlowing = game.peakBladeForwardSpeed > 300 && game.bladeDecelerationFrames >= 3;
      const releaseSafetyLimitReached = state.timeline >= game.contactTime + 420;
      const rollOffBlade = (game.bladeContactProgress + (1.05 - game.bladeContactProgress) * Math.max(0, Math.min(1, (state.timeline - game.contactTime) / (game.releaseTime - game.contactTime)))) >= 1.0;

      if (bladeHasStartedSlowing || releaseSafetyLimitReached || rollOffBlade) {
        const target = game.shotAim || new THREE.Vector3(0, 300, game.net.position.z);
        const flightTarget = target.clone();
        flightTarget.x += game.shotDeviationX;
        flightTarget.z = game.net.position.z - 1;
        const stiffnessDynamics = getStiffnessDynamics();
        const swipePower = swipeData.power ? swipeData.power / 100 : 0.8;
        const whip = state.bladeWhipStrength / 100;
        const shotModifiers = getStickShotModifiers(StickCustomizerState);

        const swipeDrivenSpeed = (5000 + 7000 * whip) * (0.35 + 0.65 * swipePower) * stiffnessDynamics.powerScale;
        const aimAdjustedLaunch = getAimAdjustedLaunchVelocity(
          game.puck.position,
          flightTarget,
          swipeDrivenSpeed * shotModifiers.puckSpeed,
          gameSettings.shotSpeed,
          game.bladeVelocity
        );
        game.puckVelocity.copy(aimAdjustedLaunch.velocity).multiplyScalar(gameSettings.shotSpeed);
        game.puckVelocity.addScaledVector(game.bladeVelocity, gameSettings.shotSpeed);
        const speed = game.puckVelocity.length();

        // Calculate and show speed in km/h or mph.
        // speed is in mm/s. Convert to m/s by dividing by 1000.
        const speedMs = speed / 1000;
        const speedKmh = speedMs * 3.6;
        const speedMph = speedKmh * 0.621371;
        const speedVal = gameSettings.speedUnit === 'kmh' ? speedKmh : speedMph;

        document.getElementById('speed-val').textContent = speedVal.toFixed(1);
        document.getElementById('speed-overlay').style.display = 'block';

        game.flightStart.copy(game.puck.position);
        game.flightDuration = aimAdjustedLaunch.flightTime;

        game.shotElapsed = 0;
        game.shotWobbleOffset = 0;
        game.shotWobble = THREE.MathUtils.clamp((1 - swipePower) * 90 + Math.abs(swipeData.accuracy) * 1000, 0, 240);
        game.puckState = 'shot';
        document.getElementById('btnInstantReplay').disabled = true;
        swipeData.triggered = false;

        // Init 3D Tracer
        if(gameSettings.showShotTracer) {
            shotTracerGeo.setDrawRange(0, 0);
            shotTracerLine.visible = true;
        }
      }
    }
  }

  // Puck Physics
  if (game.puckState === 'shot' || game.puckState === 'goal') {
    const previousPuckPosition = game.puck.position.clone();
    if (game.puckState === 'goal') game.puckVelocity.y -= 3800 * delta;
    if (game.puckState === 'shot') {
      game.shotElapsed += delta;
      game.puck.position.x += game.puckVelocity.x * delta;
      game.puck.position.y += game.puckVelocity.y * delta - 0.5 * 9810 * delta * delta;
      game.puck.position.z += game.puckVelocity.z * delta;
      game.puckVelocity.y -= 9810 * delta;
      const wobbleAmount = THREE.MathUtils.clamp(game.shotWobble / 240, 0, 1);
      const turbulence = Math.sin(game.shotElapsed * 24) * wobbleAmount * 0.12;
      game.puck.rotation.set(turbulence, game.shotElapsed * 8, Math.sin(game.shotElapsed * 19 + 0.8) * wobbleAmount * 0.08);
    } else {
      game.puck.position.addScaledVector(game.puckVelocity, delta);
    }

    // Update 3D Tracer
    if(gameSettings.showShotTracer && game.puckState === 'shot') {
        const positions = shotTracerGeo.attributes.position.array;
        const currentCount = shotTracerGeo.drawRange.count;
        const maxPoints = positions.length / 3;

        if (currentCount < maxPoints) {
            positions[currentCount * 3] = game.puck.position.x;
            positions[currentCount * 3 + 1] = game.puck.position.y;
            positions[currentCount * 3 + 2] = game.puck.position.z;
            shotTracerGeo.setDrawRange(0, currentCount + 1);
            shotTracerGeo.attributes.position.needsUpdate = true;
        }
    }

    if (game.puck.position.y < 12.5) {
       game.puck.position.y = 12.5;
       game.puckVelocity.y = -game.puckVelocity.y * 0.3;
       game.puckVelocity.x *= 0.98;
       game.puckVelocity.z *= 0.98;
    }

    const rinkWidth = 26000;
    if (Math.abs(game.puck.position.x) > (rinkWidth / 2) - 38) {
       game.puck.position.x = Math.sign(game.puck.position.x) * ((rinkWidth / 2) - 38);
       game.puckVelocity.x *= -0.8;
    }
    if (game.puck.position.z < -30000 + 38) {
       game.puck.position.z = -30000 + 38;
       game.puckVelocity.z *= -0.8;
    }

    if (game.puckState === 'shot') {
       resolveGoalCollisions(previousPuckPosition);
       const netX = game.net.position.x;
       const netZ = game.net.position.z;

       // Target Collision Check
       if(game.mode === 'targets' && game.activeTargets.length > 0) {
           // Puck radius is 38. Use a rough bounding sphere check.
           const hitDistSq = Math.pow(targetRadius + 38, 2);

           // We check targets if the puck is crossing the Z plane of the targets
           for(let t of game.activeTargets) {
               if(game.puck.position.z < t.z + 50 && game.puck.position.z > t.z - 200) {
                   const distSq = Math.pow(game.puck.position.x - t.x, 2) + Math.pow(game.puck.position.y - t.y, 2);
                   if(distSq < hitDistSq) {
                       shatterTarget(t);
                       // Slightly deflect puck
                       game.puckVelocity.z *= 0.5;
                       game.puckVelocity.x += (Math.random() - 0.5) * 2000;
                       game.puckVelocity.y += (Math.random() - 0.5) * 2000;
                       break; // Only hit one per frame
                   }
               }
           }
       }

       const crossedGoalLine = previousPuckPosition.z >= netZ && game.puck.position.z < netZ;
       const crossingProgress = crossedGoalLine
         ? (previousPuckPosition.z - netZ) / (previousPuckPosition.z - game.puck.position.z)
         : 0;
       const crossingX = THREE.MathUtils.lerp(previousPuckPosition.x, game.puck.position.x, crossingProgress);
       const crossingY = THREE.MathUtils.lerp(previousPuckPosition.y, game.puck.position.y, crossingProgress);
       if (crossedGoalLine &&
           Math.abs(crossingX - netX) < GOAL.width / 2 - GOAL.postRadius - 38 &&
           crossingY > 12.5 &&
           crossingY < GOAL.height - GOAL.postRadius - 38) {
            game.puckState = 'goal';
            game.score++;
            updateGameScore();
            goalOverlay = document.createElement('div');
            goalOverlay.textContent = 'GOAL!';
            goalOverlay.style.position = 'absolute';
            goalOverlay.style.top = '50%';
            goalOverlay.style.left = '50%';
            goalOverlay.style.transform = 'translate(-50%, -50%)';
            goalOverlay.style.fontSize = '80px';
            goalOverlay.style.color = '#ff0000';
            goalOverlay.style.fontWeight = 'bold';
            goalOverlay.style.textShadow = '0 0 20px rgba(255,0,0,0.8)';
            goalOverlay.style.pointerEvents = 'none';
            goalOverlay.style.zIndex = '50';
            document.body.appendChild(goalOverlay);

            game.puckVelocity.multiplyScalar(0.1);
            game.replayFrames.push(captureReplayFrame());
            game.replayRecording = false;
            document.getElementById('btnInstantReplay').disabled = game.replayFrames.length < 2;

            schedulePuckReset(2000);
       }
       if (game.puckState === 'shot' && (
         game.puck.position.z < netZ - 1000 ||
         game.puck.position.z < -30500 ||
         Math.abs(game.puck.position.x) > 13000 ||
         (game.puckVelocity.lengthSq() < 1000 && game.puck.position.z < -20600) ||
         game.shotElapsed > 8
       )) {
          finishMissedShot();
       }
    }
  }

  if (game.replayPlayback !== null && game.replayFrames.length > 1) {
    const frames = game.replayFrames;
    const framePosition = Math.max(0, Math.min(frames.length - 1, game.replayPlayback));
    const frameIndex = Math.min(Math.floor(framePosition), frames.length - 2);
    const blend = framePosition - frameIndex;
    const from = frames[frameIndex];
    const to = frames[Math.min(frameIndex + 1, frames.length - 1)];
    game.puck.position.lerpVectors(from.position, to.position, blend);
    game.puck.rotation.set(
      THREE.MathUtils.lerp(from.rotation.x, to.rotation.x, blend),
      THREE.MathUtils.lerp(from.rotation.y, to.rotation.y, blend),
      THREE.MathUtils.lerp(from.rotation.z, to.rotation.z, blend)
    );
    ghostPuck.position.copy(game.puck.position);
    ghostPuck.rotation.copy(game.puck.rotation);

    if (stickParams.ghostStickMesh && from.stickPositions && to.stickPositions) {
      const positions = stickParams.ghostStickMesh.geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i++) {
        positions[i] = THREE.MathUtils.lerp(from.stickPositions[i], to.stickPositions[i], blend);
      }
      stickParams.ghostStickMesh.geometry.attributes.position.needsUpdate = true;
      stickParams.ghostStickMesh.geometry.computeVertexNormals();
      stickParams.ghostStickMesh.geometry.computeBoundingSphere();
      stickParams.ghostStickGroup.position.lerpVectors(from.stickGroupPosition, to.stickGroupPosition, blend);
      stickParams.ghostStickGroup.quaternion.slerpQuaternions(from.stickGroupQuaternion, to.stickGroupQuaternion, blend);
    }
    refreshReplayControls();
    if (!replayPaused) {
      game.replayPlayback += delta * 60 * Number(document.getElementById('replaySpeed').value) * replayDirection;
      if (game.replayPlayback >= frames.length - 1) {
        game.replayPlayback = frames.length - 1;
        replayPaused = true;
      } else if (game.replayPlayback <= 0 && replayDirection < 0) {
        game.replayPlayback = 0;
        replayPaused = true;
      }
    }
  }

  if (game.replayRecording) {
    if (game.replayFrames.length > 400) game.replayFrames.shift();
    game.replayFrames.push(captureReplayFrame());
    document.getElementById('btnInstantReplay').disabled = true;
  }

  // Animate Particles
  for (let i = game.particles.length - 1; i >= 0; i--) {
      let p = game.particles[i];
      p.mesh.position.x += p.vx * delta;
      p.mesh.position.y += p.vy * delta;
      p.mesh.position.z += p.vz * delta;
      p.vy -= 9810 * delta; // gravity
      p.mesh.rotation.x += p.rx * delta;
      p.mesh.rotation.y += p.ry * delta;
      p.life -= delta;
      p.mesh.material.opacity = p.life;

      if(p.life <= 0) {
          particleGroup.remove(p.mesh);
          game.particles.splice(i, 1);
      }
  }

  controls.update();
  const isCustomizerVisible = appState.mode === 'customizer';
  if (isCustomizerVisible && gameplayStickVisibility === null) {
    gameplayStickVisibility = {
      objects: scene.children
        .filter(object => object !== customizerPreviewGroup && !object.isLight && !object.isCamera)
        .map(object => ({ object, visible: object.visible }))
    };
    gameplayStickVisibility.objects.forEach(({ object }) => { object.visible = false; });
  } else if (!isCustomizerVisible && gameplayStickVisibility !== null) {
    gameplayStickVisibility.objects.forEach(({ object, visible }) => { object.visible = visible; });
    gameplayStickVisibility = null;
  }
  if (customizerPreviewGroup) {
    customizerPreviewGroup.visible = isCustomizerVisible;
    if (isCustomizerVisible) {
      camera.updateMatrixWorld();
      const cameraForward = camera.getWorldDirection(new THREE.Vector3());
      customizerPreviewGroup.position.copy(camera.position)
        .addScaledVector(cameraForward, 2400);
      customizerPreviewGroup.quaternion.copy(camera.quaternion);
    }
  }
  renderer.render(scene, camera);
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('canvas-container').appendChild(renderer.domElement);
  initUiBindings(updatePhysics);
  bindInput(controls, syncUiFromState);

  // Load Model
  const loader = new GLTFLoader();
  loader.load(
    MODEL_URL,
    (gltf) => {
      const root = gltf.scene;
      root.traverse((child) => {
        if (child.isMesh && !stickParams.stickMesh) {
          stickParams.stickMesh = child;
        }
      });

      if (stickParams.stickMesh) {
        const geom = stickParams.stickMesh.geometry;
        geom.computeVertexNormals();
        stickParams.originalPositions = new Float32Array(geom.attributes.position.array);
        const rowsByHeight = new Map();
        for (let i = 0; i < stickParams.originalPositions.length; i += 3) {
          const y = stickParams.originalPositions[i + 1];
          let row = rowsByHeight.get(y);
          if (!row) {
            row = { y, indices: [] };
            rowsByHeight.set(y, row);
          }
          row.indices.push(i);
        }
        stickParams.vertexRows = Array.from(rowsByHeight.values());

        // Customizer Color Hook
        stickParams.stickMesh.material = new THREE.MeshStandardMaterial({
          color: StickCustomizerState.color,
          roughness: 0.5,
          metalness: 0.25,
          side: THREE.DoubleSide
        });

        // Listen to customizer color changes to update mesh in real time
        document.getElementById('custColor').addEventListener('change', (e) => {
           applyStickColor(stickParams.stickMesh.material, e.target.value);
           customizerPreviewGroup?.traverse(child => {
             if (!child.isMesh) return;
             const materials = Array.isArray(child.material) ? child.material : [child.material];
             materials.forEach(material => applyStickColor(material, e.target.value));
           });
        });
      }

      stickParams.stickGroup = new THREE.Group();
      stickParams.stickGroup.rotation.y = 0.22;
      stickParams.stickGroup.rotation.z = 0.40 + (20 * Math.PI / 180);
      stickParams.stickGroup.position.set(0, 0, -20500);

      const topHandLocal = new THREE.Vector3(X_center, L_total, Z_center);
      const topHandWorld = topHandLocal.clone().applyQuaternion(stickParams.stickGroup.quaternion).add(stickParams.stickGroup.position);
      stickParams.stickGroup.rotation.y -= THREE.MathUtils.degToRad(25);
      const rotatedTopHand = topHandLocal.clone().applyQuaternion(stickParams.stickGroup.quaternion);
      stickParams.stickGroup.position.x = topHandWorld.x - rotatedTopHand.x;
      stickParams.stickGroup.position.z = topHandWorld.z - rotatedTopHand.z;

      stickParams.stickGroup.add(root);
      scene.add(stickParams.stickGroup);

      stickParams.ghostStickGroup = stickParams.stickGroup.clone(true);
      stickParams.ghostStickGroup.visible = false;
      stickParams.ghostStickGroup.traverse(child => {
        if (child.isMesh) {
          child.geometry = child.geometry.clone();
          child.material = child.material.clone();
          child.material.transparent = true;
          child.material.opacity = 0.32;
          child.material.depthWrite = false;
          if (!stickParams.ghostStickMesh) stickParams.ghostStickMesh = child;
        }
      });
      scene.add(stickParams.ghostStickGroup);
      stickParams.stickGroup.updateMatrixWorld(true);
      const initialStickBox = new THREE.Box3().setFromObject(stickParams.stickGroup, true);
      stickParams.stickGroup.position.y -= initialStickBox.min.y;
      stickParams.stickRestY = stickParams.stickGroup.position.y;

      // Store the exactly aligned start position
      stickParams.initialGroupPosition = stickParams.stickGroup.position.clone();

      customizerPreviewGroup = new THREE.Group();
      const previewAmbient = new THREE.AmbientLight(0xffffff, 1.8);
      customizerPreviewGroup.add(previewAmbient);
      const addPreviewLight = (color, intensity, position) => {
        const light = new THREE.DirectionalLight(color, intensity);
        const target = new THREE.Object3D();
        light.position.copy(position);
        customizerPreviewGroup.add(light, target);
        light.target = target;
      };
      addPreviewLight(0xffffff, 4.2, new THREE.Vector3(-650, 900, 800));
      addPreviewLight(0xb9e7ff, 3.1, new THREE.Vector3(700, 150, 600));
      addPreviewLight(0xffffff, 3.6, new THREE.Vector3(100, 500, -800));
      const previewModel = root.clone(true);
      const sourceGeometry = stickParams.stickMesh.geometry;
      sourceGeometry.computeBoundingBox();
      const stickDimensions = sourceGeometry.boundingBox.getSize(new THREE.Vector3());
      let checkerCellSize = Math.max(
        Math.min(stickDimensions.x, stickDimensions.z) * 0.375,
        0.00001
      );
      const checkerUniforms = [];
      previewModel.traverse(child => {
      if (!child.isMesh) return;
      child.geometry = child.geometry.clone();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const previewMaterials = materials.map(material => {
        const previewMaterial = material.clone();
        applyStickColor(previewMaterial, StickCustomizerState.color);
        previewMaterial.onBeforeCompile = shader => {
          const checkerCellSizeUniform = { value: checkerCellSize };
          shader.uniforms.customizerCheckerCellSize = checkerCellSizeUniform;
          checkerUniforms.push(checkerCellSizeUniform);
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vCustomizerCheckerPosition;\nvarying vec3 vCustomizerCheckerNormal;')
            .replace(
              '#include <begin_vertex>',
              '#include <begin_vertex>\nvCustomizerCheckerPosition = (modelMatrix * vec4(position, 1.0)).xyz;\nvCustomizerCheckerNormal = normalize(mat3(modelMatrix) * normal);'
            );
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vCustomizerCheckerPosition;\nvarying vec3 vCustomizerCheckerNormal;\nuniform float customizerCheckerCellSize;')
            .replace(
              '#include <color_fragment>',
              `#include <color_fragment>
              vec3 checkerNormal = abs(normalize(vCustomizerCheckerNormal));
              vec2 checkerCoordinates = checkerNormal.x > checkerNormal.y && checkerNormal.x > checkerNormal.z
                ? vCustomizerCheckerPosition.yz
                : checkerNormal.y > checkerNormal.z
                  ? vCustomizerCheckerPosition.xz
                  : vCustomizerCheckerPosition.xy;
              float checkerParity = mod(
                floor(checkerCoordinates.x / customizerCheckerCellSize)
                + floor(checkerCoordinates.y / customizerCheckerCellSize),
                2.0
              );
              float stickBrightness = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
              vec3 checkerTone = stickBrightness > 0.5 ? vec3(0.68) : vec3(0.5);
              diffuseColor.rgb = mix(diffuseColor.rgb, checkerTone, checkerParity * 0.32);`
            );
        };
        previewMaterial.customProgramCacheKey = () => 'customizer-subtle-checker-v1';
        previewMaterial.depthTest = false;
        previewMaterial.depthWrite = false;
        return previewMaterial;
      });
      child.material = Array.isArray(child.material) ? previewMaterials : previewMaterials[0];
      child.renderOrder = 1000;
      });
      customizerPreviewGroup.add(previewModel);
      previewModel.updateMatrixWorld(true);
      let previewBounds = new THREE.Box3().setFromObject(previewModel);
      const previewSize = previewBounds.getSize(new THREE.Vector3());
      if (previewSize.x > previewSize.y && previewSize.x > previewSize.z) {
      previewModel.rotation.z = -Math.PI / 2;
      } else if (previewSize.z > previewSize.y && previewSize.z > previewSize.x) {
      previewModel.rotation.x = Math.PI / 2;
      }
      previewModel.updateMatrixWorld(true);
      previewBounds = new THREE.Box3().setFromObject(previewModel);
      const previewCenter = previewBounds.getCenter(new THREE.Vector3());
      const previewHeight = Math.max(...previewBounds.getSize(new THREE.Vector3()).toArray());
      previewModel.position.sub(previewCenter);
      previewModel.scale.setScalar(1400 / previewHeight);
      checkerCellSize *= previewModel.scale.x;
      checkerUniforms.forEach(uniform => { uniform.value = checkerCellSize; });
      customizerPreviewGroup.visible = false;
      scene.add(customizerPreviewGroup);
      document.getElementById('customizer-preview-stage').classList.add('has-stick-preview');

      appState.mode = 'customizer';
      updateUiMode();

      syncUiFromState();
      updatePhysics();
      initializeBladePath();

      animate();
    },
    undefined,
    (err) => {
      console.error('Model load error:', err);
      const splashText = document.getElementById('splash-text');
      if (splashText) splashText.innerHTML = '<span style="color: #ff4444;">Fout bij laden van 3D model.</span>';
    }
  );
});
