import * as THREE from 'three';
import { gameSettings, StickCustomizerState } from './config.js?v=customizer-layout-17';
import { state, game, swipeData } from './state.js?v=customizer-layout-17';
import { getStiffnessDynamics } from './physics.js?v=customizer-layout-17';
import { camera, GOAL } from './scene.js?v=customizer-layout-17'; // game.net is in sceneGame.net technically, or we map it
import { getStickShotModifiers } from './stick-effects.js?v=customizer-layout-17';

export function getGoalAim(clientX, clientY, pathErrorX = 0) {
  const aimX = clientX + pathErrorX * 1.5;
  const ndc = new THREE.Vector2(
    (aimX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const goalPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -game.net.position.z);
  const hit = new THREE.Vector3();
  const netWidth = GOAL.width;
  const netHeight = GOAL.height;
  const fallbackX = ((aimX / window.innerWidth) - 0.5) * netWidth;
  const fallbackY = (1 - clientY / window.innerHeight) * netHeight;
  const point = raycaster.ray.intersectPlane(goalPlane, hit)
    ? hit
    : new THREE.Vector3(fallbackX, fallbackY, game.net.position.z);
  return new THREE.Vector3(point.x, point.y, game.net.position.z);
}

export function bindInput(controls, syncUiFromState) {
  const swipeZone = document.getElementById('swipeZone');
  const aimCanvas = document.getElementById('aimTracerCanvas');
  const aimCtx = aimCanvas.getContext('2d');

  function resizeAimCanvas() {
      aimCanvas.width = window.innerWidth;
      aimCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeAimCanvas);
  resizeAimCanvas();

  swipeZone.addEventListener('pointerdown', (e) => {
    aimCtx.clearRect(0, 0, aimCanvas.width, aimCanvas.height);
    if (game.puckState !== 'idle' || state.isPlaying) return;
    swipeData.isSwiping = true;
    swipeData.startY = e.clientY;
    swipeData.startX = e.clientX;
    swipeData.startTime = performance.now();
    swipeData.triggered = false;
    swipeData.puckHitTime = 0;
    swipeData.path = [{ x: e.clientX, y: e.clientY }];

    controls.enabled = false;
    e.stopPropagation();
  });

  window.addEventListener('pointermove', (e) => {
    if (!swipeData.isSwiping) return;
    swipeData.path.push({ x: e.clientX, y: e.clientY });
    const puckScreenY = window.innerHeight * 0.75;
    if (swipeData.startY > puckScreenY && e.clientY <= puckScreenY && swipeData.puckHitTime === 0) {
        swipeData.puckHitY = e.clientY;
        swipeData.puckHitTime = performance.now();
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (!swipeData.isSwiping) {
        controls.enabled = true;
        return;
    }
    swipeData.isSwiping = false;
    controls.enabled = true;
    swipeData.endY = e.clientY;
    swipeData.endX = e.clientX;
    swipeData.endTime = performance.now();

    if (swipeData.startY - swipeData.endY > 100) {
        let timeToPuck = swipeData.puckHitTime > 0 ? (swipeData.puckHitTime - swipeData.startTime) : (swipeData.endTime - swipeData.startTime) / 2;
        if (timeToPuck < 50) timeToPuck = 50;

        let distToPuck = swipeData.puckHitY > 0 ? (swipeData.startY - swipeData.puckHitY) : (swipeData.startY - swipeData.endY) / 2;

        const speed = distToPuck / timeToPuck;
        if (speed < gameSettings.minSwipeSpeed) return;
        swipeData.power = Math.max(20, Math.min(100, speed * 52 * gameSettings.swipeRange));

        let maxPathErrorX = 0;
        let maxPathErrorMagnitude = 0;
        const swipeHeight = swipeData.startY - swipeData.endY;
        for (const point of swipeData.path) {
          const progress = swipeHeight ? Math.max(0, Math.min(1, (swipeData.startY - point.y) / swipeHeight)) : 0;
          const expectedX = swipeData.startX + (swipeData.endX - swipeData.startX) * progress;
          const errorX = point.x - expectedX;
          if (Math.abs(errorX) > maxPathErrorMagnitude) {
            maxPathErrorMagnitude = Math.abs(errorX);
            maxPathErrorX = errorX;
          }
        }
        const shotModifiers = getStickShotModifiers(StickCustomizerState);
        game.shotQuickness = shotModifiers.quickness;
        const effectivePathError = Math.max(
          0,
          maxPathErrorMagnitude - gameSettings.precisionTolerance * shotModifiers.accuracy
        );
        const signedPathError = Math.sign(maxPathErrorX) * effectivePathError;
        swipeData.accuracy = signedPathError / window.innerWidth;
        const unbiasedAim = getGoalAim(swipeData.endX, swipeData.endY);
        const inaccurateAim = getGoalAim(
          swipeData.endX,
          swipeData.endY,
          signedPathError * gameSettings.deviationPenalty / shotModifiers.accuracy
        );
        game.shotAim = unbiasedAim.clone();
        game.shotAim.x += shotModifiers.shotTendencyX * GOAL.width;
        game.shotAim.y += shotModifiers.shotTendencyY * GOAL.height;
        game.shotDeviationX = inaccurateAim.x - unbiasedAim.x;
        const stiffnessDynamics = getStiffnessDynamics();
        game.contactTime = Math.max(540, Math.min(660, 600 * stiffnessDynamics.timingScale));
        game.releaseTime = game.contactTime + 180 * stiffnessDynamics.timingScale;

        // Draw Aim Tracer if enabled
        if(gameSettings.showAimTracer && swipeData.path.length > 1) {
            aimCanvas.style.display = 'block';
            aimCtx.clearRect(0, 0, aimCanvas.width, aimCanvas.height);

            // Draw ideal straight line
            aimCtx.beginPath();
            aimCtx.moveTo(swipeData.startX, swipeData.startY);
            aimCtx.lineTo(swipeData.endX, swipeData.endY);
            aimCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            aimCtx.lineWidth = 4;
            aimCtx.setLineDash([10, 10]);
            aimCtx.stroke();

            // Draw actual path
            aimCtx.beginPath();
            aimCtx.moveTo(swipeData.path[0].x, swipeData.path[0].y);
            for(let i=1; i<swipeData.path.length; i++) {
                aimCtx.lineTo(swipeData.path[i].x, swipeData.path[i].y);
            }
            aimCtx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
            aimCtx.lineWidth = 6;
            aimCtx.setLineDash([]);
            aimCtx.stroke();

            // Draw accuracy text
            const accuracyScore = Math.max(0, 100 - Math.abs(swipeData.accuracy) * 1000).toFixed(1);
            aimCtx.font = "bold 24px monospace";
            aimCtx.fillStyle = '#38bdf8';
            aimCtx.fillText(`Acc: ${accuracyScore}%`, swipeData.endX + 20, swipeData.endY);
        }

        swipeData.triggered = true;
        state.timeline = 0;
        state.isPlaying = true;
        state.holdMaxBend = false;
        game.replayFrames = [];
        game.replayRecording = true;
        syncUiFromState();
    }
  });

  document.getElementById('canvas-container').addEventListener('pointercancel', () => swipeData.isSwiping = false);
}
