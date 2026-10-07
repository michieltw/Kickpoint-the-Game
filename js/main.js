import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { appState, state, game, swipeData } from './state.js';
import { gameSettings, StickCustomizerState, L_total, Z_center, X_center } from './config.js';
import { updatePhysics, getStiffnessDynamics, getBladeContactProgress, getBladePoint, initializeBladePath } from './physics.js';
import { scene, camera, renderer, controls, ghostPuck, projectedArrow, stickParams } from './scene.js';
import { updateUiMode, syncUiFromState, initUiBindings, drawStiffnessCurve } from './ui.js';
import { bindInput } from './input.js';

const MODEL_URL = 'https://raw.githubusercontent.com/michieltw/GLB-s/main/glb_files_retextured/P28-ST.glb';

let playDirection = 1;
let lastTime = performance.now();

// Replay controls
let replayPaused = false;
let replayDirection = 1;

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

function resetPuck() {
  game.puck.position.set(95, 12.5, -20120);
  game.puck.rotation.set(0, 0, 0);
  game.puckVelocity.set(0, 0, 0);
  game.puckState = 'idle';
  game.shotAim = null;
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

  if (state.isPlaying) {
     state.isPlaying = false;
     document.getElementById('btnPlay').textContent = '▶ Play';
     state.timeline = 0;
     updatePhysics();
  }
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

// Animation Loop
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const delta = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (state.isPlaying && !state.holdMaxBend) {
    const stepRate = 800 * delta;
    let next = state.timeline + stepRate * playDirection;
    if (next >= 1200) {
      next = 1200;
      playDirection = -1;
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
        const aimDeltaX = target.x - game.puck.position.x;
        if (game.shotDeviationX * aimDeltaX < 0) {
          game.shotDeviationX = -Math.sign(aimDeltaX) * Math.min(Math.abs(game.shotDeviationX), Math.abs(aimDeltaX) * 0.5);
        }
        const flightTarget = target.clone();
        flightTarget.x += game.shotDeviationX;
        flightTarget.z = game.net.position.z - 50;
        const shotDirection = flightTarget.clone().sub(game.puck.position).normalize();
        const stiffnessDynamics = getStiffnessDynamics();
        const swipePower = swipeData.power ? swipeData.power / 100 : 0.8;
        const whip = state.bladeWhipStrength / 100;

        // Use customizer thickness logic to adjust weight/speed
        const weightPenalty = (StickCustomizerState.weightFactor - 1.0) * 0.15; // heavier = slower

        const swipeDrivenSpeed = (5000 + 7000 * whip) * (0.35 + 0.65 * swipePower) * stiffnessDynamics.powerScale * (1.0 - weightPenalty);
        const launchVelocity = shotDirection.multiplyScalar(swipeDrivenSpeed).add(game.bladeVelocity);
        game.puckVelocity.copy(launchVelocity.multiplyScalar(gameSettings.shotSpeed));
        const speed = game.puckVelocity.length();
        game.flightStart.copy(game.puck.position);
        game.flightDuration = game.flightStart.distanceTo(flightTarget) / speed;

        game.shotElapsed = 0;
        game.shotWobbleOffset = 0;
        game.shotWobble = THREE.MathUtils.clamp((1 - swipePower) * 90 + Math.abs(swipeData.accuracy) * 1000, 0, 240);
        game.puckState = 'shot';
        document.getElementById('btnInstantReplay').disabled = true;
        swipeData.triggered = false;
      }
    }
  }

  // Puck Physics
  if (game.puckState === 'shot' || game.puckState === 'goal') {
    if (game.puckState === 'goal') game.puckVelocity.y -= 3800 * delta;
    if (game.puckState === 'shot') {
      game.shotElapsed += delta;
      game.puckVelocity.y -= 9810 * delta;
      game.puck.position.addScaledVector(game.puckVelocity, delta);
      const wobbleAmount = THREE.MathUtils.clamp(game.shotWobble / 240, 0, 1);
      const turbulence = Math.sin(game.shotElapsed * 24) * wobbleAmount * 0.12;
      game.puck.rotation.set(turbulence, game.shotElapsed * 8, Math.sin(game.shotElapsed * 19 + 0.8) * wobbleAmount * 0.08);
    } else {
      game.puck.position.addScaledVector(game.puckVelocity, delta);
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
       const netX = game.net.position.x;
       const netZ = game.net.position.z;
       if (game.puck.position.z < netZ && game.puck.position.z > netZ - 1000) {
         if (Math.abs(game.puck.position.x - netX) < (1830 / 2) && game.puck.position.y < 1220) {
            game.puckState = 'goal';
            game.score++;
            updateGameScore();
            const goalEl = document.createElement('div');
            goalEl.textContent = 'GOAL!';
            goalEl.style.position = 'absolute';
            goalEl.style.top = '50%';
            goalEl.style.left = '50%';
            goalEl.style.transform = 'translate(-50%, -50%)';
            goalEl.style.fontSize = '80px';
            goalEl.style.color = '#ff0000';
            goalEl.style.fontWeight = 'bold';
            goalEl.style.textShadow = '0 0 20px rgba(255,0,0,0.8)';
            goalEl.style.pointerEvents = 'none';
            goalEl.style.zIndex = '50';
            document.body.appendChild(goalEl);

            game.puckVelocity.multiplyScalar(0.1);
            game.replayFrames.push(captureReplayFrame());
            game.replayRecording = false;
            document.getElementById('btnInstantReplay').disabled = game.replayFrames.length < 2;

            setTimeout(() => { goalEl.remove(); resetPuck(); }, 2000);
         }
       }
       if (game.puck.position.z < -30500 || Math.abs(game.puck.position.x) > 13000) {
          resetPuck();
       } else if (game.puckVelocity.lengthSq() < 1000 && game.puck.position.z < -20600) {
          resetPuck();
       } else if (game.shotElapsed > 8) {
          resetPuck();
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

  controls.update();
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
           stickParams.stickMesh.material.color.set(e.target.value);
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

      appState.mode = 'menu';
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
