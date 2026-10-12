import * as THREE from 'three';
import { gameSettings, physicsSettings, StickCustomizerState, GOAL } from './config.js';
import { state, game, swipeData } from './state.js';
import { getStiffnessDynamics } from './physics.js';
import { camera } from './scene.js'; // game.net is in sceneGame.net technically, or we map it
import { getStickShotModifiers } from './stick-effects.js';

export function getGoalAim(clientX, clientY, pathErrorX = 0) {
  const aimSensitivity = physicsSettings?.aimSensitivity ?? 1.5;
  const aimX = clientX + pathErrorX * aimSensitivity;
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

export function calculateSwipeKinematics(path, startTime, endTime, startY, endY) {
  const totalForwardDist = startY - endY;
  if (totalForwardDist <= 0 || !path || path.length < 2) {
    return { rawCompositeSpeed: 0, normalizedSpeed: 0, power: 25 };
  }

  // 1. Vind wanneer de vinger daadwerkelijk begon te bewegen (filter pre-touch aarzeling/dwell)
  const startPt = path[0];
  let motionStartIndex = 0;
  for (let i = 1; i < path.length; i++) {
    const distFromStart = Math.hypot(path[i].x - startPt.x, path[i].y - startPt.y);
    if (distFromStart > 8) {
      motionStartIndex = Math.max(0, i - 1);
      break;
    }
  }
  const motionStart = path[motionStartIndex];
  const activeDuration = Math.max(30, endTime - (motionStart.t || startTime));
  const activeForwardDist = motionStart.y - endY;
  const activeSpeed = Math.max(0, activeForwardDist / activeDuration); // px/ms

  // 2. Bereken pieksnelheid via een rolling sliding window van ~30-90ms
  let peakSpeed = activeSpeed;
  for (let i = motionStartIndex; i < path.length; i++) {
    for (let j = i + 1; j < path.length; j++) {
      const dt = (path[j].t || endTime) - (path[i].t || startTime);
      if (dt >= 30 && dt <= 90) {
        const dy = path[i].y - path[j].y; // voorwaartse afstand
        if (dy > 0) {
          const v = dy / dt;
          if (v > peakSpeed) peakSpeed = v;
        }
      }
    }
  }

  // 3. Bereken release/eindsnelheid (laatste 65ms van de swipe vóór liftoff)
  let releaseSpeed = activeSpeed;
  const releaseThresholdTime = endTime - 65;
  for (let i = path.length - 1; i >= motionStartIndex; i--) {
    if ((path[i].t || endTime) <= releaseThresholdTime) {
      const dt = endTime - (path[i].t || startTime);
      const dy = path[i].y - endY;
      if (dt > 15 && dy > 0) {
        releaseSpeed = dy / dt;
      }
      break;
    }
  }

  // 4. Gewogen samengestelde snelheid: beloont sustained drive (45%), explosieve flick (40%) en release (15%)
  const rawCompositeSpeed = activeSpeed * 0.45 + peakSpeed * 0.40 + releaseSpeed * 0.15;

  // 5. Schermresolutie-normalisatie (gebaseerd op 1000px virtuele hoogte voor consistent gevoel mobiel/desktop)
  const viewportScale = 1000 / Math.max(400, window.innerHeight);
  const normalizedSpeed = rawCompositeSpeed * viewportScale;

  // 6. Dynamische power mapping van 25% tot 100%
  // Realistisch referentie-plafond (8.8 px/ms) zodat opeenvolgende swipes natuurlijk variëren
  const speedProgress = Math.max(0, (normalizedSpeed - 0.40) / 8.8);
  const rawPower = 30 + 70 * Math.pow(Math.min(1.0, speedProgress), 0.78);
  const finalPower = Math.max(25, Math.min(100, Math.round(rawPower * (gameSettings.swipeRange ?? 1.0) * 10) / 10));

  return {
    rawCompositeSpeed,
    normalizedSpeed,
    power: finalPower
  };
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
    if (e.target.closest('#btnResetAll')) return;
    aimCtx.clearRect(0, 0, aimCanvas.width, aimCanvas.height);
    if (game.puckState !== 'idle' || state.isPlaying) return;
    const now = performance.now();
    swipeData.isSwiping = true;
    swipeData.power = 0;
    swipeData.startY = e.clientY;
    swipeData.startX = e.clientX;
    swipeData.startTime = now;
    swipeData.triggered = false;
    swipeData.puckHitTime = 0;
    swipeData.path = [{ x: e.clientX, y: e.clientY, t: now }];
    swipeData.maxY = e.clientY;
    swipeData.turnaroundPoint = { x: e.clientX, y: e.clientY, t: now };

    if (game.mode === 'oneTimer' && swipeData.slapshotArmed) {
      swipeData.isSlapshot = true;
      swipeData.slapshotWindup = swipeData.armedWindup || 0.8;
    } else {
      swipeData.isSlapshot = false;
      swipeData.slapshotWindup = 0;
    }

    controls.enabled = false;
    e.stopPropagation();
  });

  window.addEventListener('pointermove', (e) => {
    if (!swipeData.isSwiping) return;
    const now = performance.now();
    const coalesced = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : null;
    if (coalesced && coalesced.length > 0) {
      for (const ce of coalesced) {
        swipeData.path.push({ x: ce.clientX, y: ce.clientY, t: ce.timeStamp || now });
      }
    } else {
      swipeData.path.push({ x: e.clientX, y: e.clientY, t: now });
    }

    if (game.mode === 'oneTimer') {
      const downwardFromStart = e.clientY - swipeData.startY;
      if (downwardFromStart > 18) {
        swipeData.isSlapshot = true;
        if (e.clientY >= swipeData.maxY) {
          swipeData.maxY = e.clientY;
          swipeData.turnaroundPoint = { x: e.clientX, y: e.clientY, t: now };
        }
        const rawWindup = (swipeData.maxY - swipeData.startY) / 140;
        swipeData.slapshotWindup = Math.max(swipeData.slapshotWindup || 0, Math.min(1.25, rawWindup));
        const maxBackswingRad = (52 * Math.PI) / 180;
        // If user hasn't started swiping up yet, show live backswing pulling blade back and up
        const upwardFromBottom = swipeData.maxY - e.clientY;
        if (upwardFromBottom < 30 && typeof window.setStickSlapshotAngle === 'function') {
          window.setStickSlapshotAngle(swipeData.slapshotWindup * maxBackswingRad);
        }
        const oneTimerTip = document.getElementById('oneTimerTip');
        if (oneTimerTip) {
          const pct = Math.min(100, Math.round((swipeData.slapshotWindup / 1.0) * 100));
          oneTimerTip.textContent = `⚡ SLAPSHOT BACKSWING (${pct}%) · Veeg nu krachtig OMHOOG!`;
        }
      }
    }

    const puckScreenY = window.innerHeight * 0.75;
    if (e.clientY <= puckScreenY && swipeData.puckHitTime === 0) {
        swipeData.puckHitY = e.clientY;
        swipeData.puckHitTime = now;
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (!swipeData.isSwiping) {
        controls.enabled = true;
        return;
    }
    const now = performance.now();
    swipeData.isSwiping = false;
    controls.enabled = true;
    swipeData.endY = e.clientY;
    swipeData.endX = e.clientX;
    swipeData.endTime = now;
    swipeData.path.push({ x: e.clientX, y: e.clientY, t: now });

    const minSwipeDist = physicsSettings?.minSwipeDistance ?? 100;
    const isOneTimerSlapshot = game.mode === 'oneTimer' && swipeData.isSlapshot;
    const effectiveStartY = isOneTimerSlapshot ? swipeData.maxY : swipeData.startY;
    const effectiveStartX = isOneTimerSlapshot && swipeData.turnaroundPoint ? swipeData.turnaroundPoint.x : swipeData.startX;
    const effectiveStartTime = isOneTimerSlapshot && swipeData.turnaroundPoint ? swipeData.turnaroundPoint.t : swipeData.startTime;
    const forwardDist = effectiveStartY - swipeData.endY;

    // If in One Timer mode and the user swiped down to wind up, then lifted finger without swiping up:
    // Keep the stick armed in backswing so their next upward swipe fires the slapshot!
    if (isOneTimerSlapshot && forwardDist <= minSwipeDist) {
        if (swipeData.maxY - swipeData.startY > 25) {
            swipeData.slapshotArmed = true;
            swipeData.armedWindup = Math.max(0.45, swipeData.slapshotWindup);
            const maxBackswingRad = (52 * Math.PI) / 180;
            if (typeof window.setStickSlapshotAngle === 'function') {
                window.setStickSlapshotAngle(swipeData.armedWindup * maxBackswingRad);
            }
            const oneTimerTip = document.getElementById('oneTimerTip');
            if (oneTimerTip) {
                const pct = Math.min(100, Math.round(swipeData.armedWindup * 100));
                oneTimerTip.textContent = `⚡ SLAPSHOT GELADEN (${pct}%) · Veeg OMHOOG om te schieten!`;
            }
        } else {
            swipeData.slapshotArmed = false;
            if (typeof window.setStickSlapshotAngle === 'function') {
                window.setStickSlapshotAngle(0);
            }
        }
        return;
    }

    if (forwardDist > minSwipeDist) {
        const forwardPath = isOneTimerSlapshot
          ? swipeData.path.filter(p => (p.t || 0) >= effectiveStartTime)
          : swipeData.path;
        if (forwardPath.length < 2) {
          forwardPath.unshift({ x: effectiveStartX, y: effectiveStartY, t: effectiveStartTime });
        }

        const kinematics = calculateSwipeKinematics(
          forwardPath,
          effectiveStartTime,
          swipeData.endTime,
          effectiveStartY,
          swipeData.endY
        );

        if (kinematics.rawCompositeSpeed < gameSettings.minSwipeSpeed) {
          if (isOneTimerSlapshot && typeof window.setStickSlapshotAngle === 'function') {
            window.setStickSlapshotAngle(0);
          }
          swipeData.slapshotArmed = false;
          return;
        }

        if (isOneTimerSlapshot) {
          // Slapshot power calculation: adds more speed and can easily exceed normal 100% shooting limits when swung hard
          const windupLevel = Math.max(0.5, swipeData.slapshotWindup || 0.8);
          const windupBonus = 1.0 + 0.35 * Math.min(1.25, windupLevel);
          const speedProgress = Math.max(0, (kinematics.normalizedSpeed - 0.30) / 7.5);
          const slapshotRawPower = (40 + 85 * Math.pow(Math.min(1.65, speedProgress), 0.82)) * windupBonus;
          swipeData.power = Math.max(40, Math.round(slapshotRawPower * (gameSettings.swipeRange ?? 1.0) * 10) / 10);

          game.isSlapshot = true;
          game.slapshotWindup = windupLevel;
          game.slapshotMaxAngle = Math.max((28 * Math.PI) / 180, Math.min((62 * Math.PI) / 180, windupLevel * ((52 * Math.PI) / 180)));
          game.slapshotIceHitTime = 380;
          game.slapshotHitIceTriggered = false;
          swipeData.slapshotArmed = false;

          const oneTimerTip = document.getElementById('oneTimerTip');
          if (oneTimerTip) {
            oneTimerTip.textContent = `💥 SLAPSHOT! Power: ${Math.round(swipeData.power)}%`;
          }
        } else {
          swipeData.power = kinematics.power;
          game.isSlapshot = false;
          game.slapshotWindup = 0;
          game.slapshotMaxAngle = 0;
          game.slapshotHitIceTriggered = false;
          swipeData.slapshotArmed = false;
        }

        let maxPathErrorX = 0;
        let maxPathErrorMagnitude = 0;
        const swipeHeight = effectiveStartY - swipeData.endY;
        for (const point of forwardPath) {
          const progress = swipeHeight ? Math.max(0, Math.min(1, (effectiveStartY - point.y) / swipeHeight)) : 0;
          const expectedX = effectiveStartX + (swipeData.endX - effectiveStartX) * progress;
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
        const relSpeedMult = Math.max(0.1, physicsSettings?.releaseSpeedMultiplier ?? 1.0);
        const quickness = Math.max(0.1, game.shotQuickness || 1);
        game.contactTime = Math.max(540, Math.min(660, 600 * stiffnessDynamics.timingScale));
        game.releaseTime = game.contactTime + ((physicsSettings?.puckDwellTime ?? 180) * stiffnessDynamics.timingScale) / (relSpeedMult * quickness);

        // Draw Aim Tracer if enabled
        if(gameSettings.showAimTracer && forwardPath.length > 1) {
            aimCanvas.style.display = 'block';
            aimCtx.clearRect(0, 0, aimCanvas.width, aimCanvas.height);

            // Draw ideal straight line
            aimCtx.beginPath();
            aimCtx.moveTo(effectiveStartX, effectiveStartY);
            aimCtx.lineTo(swipeData.endX, swipeData.endY);
            aimCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            aimCtx.lineWidth = 4;
            aimCtx.setLineDash([10, 10]);
            aimCtx.stroke();

            // Draw actual path
            aimCtx.beginPath();
            aimCtx.moveTo(forwardPath[0].x, forwardPath[0].y);
            for(let i=1; i<forwardPath.length; i++) {
                aimCtx.lineTo(forwardPath[i].x, forwardPath[i].y);
            }
            aimCtx.strokeStyle = isOneTimerSlapshot ? 'rgba(249, 115, 22, 0.9)' : 'rgba(56, 189, 248, 0.8)';
            aimCtx.lineWidth = 6;
            aimCtx.setLineDash([]);
            aimCtx.stroke();

            // Draw accuracy text
            const accuracyScore = Math.max(0, 100 - Math.abs(swipeData.accuracy) * 1000).toFixed(1);
            aimCtx.font = "bold 24px monospace";
            aimCtx.fillStyle = isOneTimerSlapshot ? '#f97316' : '#38bdf8';
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
