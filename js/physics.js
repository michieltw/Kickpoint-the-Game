import * as THREE from 'three';
import { L_total, Z_center, X_center, SEGMENTS, gameSettings } from './config.js?v=goal-net-3';
import { state, game } from './state.js?v=goal-net-3';
import { bgMarker, thMarker, stickParams } from './scene.js?v=goal-net-3';

export let sortedStiffnessCurve = [...state.stiffnessCurve].sort((a, b) => a.y - b.y);
export let cachedStiffnessDynamics = null;

export function refreshStiffnessCurveCache() {
  sortedStiffnessCurve = [...state.stiffnessCurve].sort((a, b) => a.y - b.y);
  cachedStiffnessDynamics = null;
}

export function getStiffnessAt(position) {
  const y = Math.max(0, Math.min(1, position));
  const points = sortedStiffnessCurve;
  if (y <= points[0].y) return 50 + points[0].x * 75;
  for (let i = 1; i < points.length; i++) {
    if (y <= points[i].y) {
      const span = points[i].y - points[i - 1].y;
      const t = span > 0 ? (y - points[i - 1].y) / span : 0;
      const x = points[i - 1].x + (points[i].x - points[i - 1].x) * t;
      return 50 + x * 75;
    }
  }
  return 50 + points[points.length - 1].x * 75;
}

export function getStiffnessDynamics() {
  if (cachedStiffnessDynamics) return cachedStiffnessDynamics;
  const points = sortedStiffnessCurve;
  const average = points.slice(1).reduce((sum, point, i) =>
    sum + (point.y - points[i].y) * (50 + 75 * (points[i].x + point.x) / 2), 0
  );
  const sampleCount = 100;
  const threshold = average - 4;
  const softZoneCenters = [];
  let zoneStart = -1;

  for (let i = 0; i <= sampleCount; i++) {
    const isSoft = getStiffnessAt(i / sampleCount) < threshold;
    if (isSoft && zoneStart < 0) zoneStart = i;
    if ((!isSoft || i === sampleCount) && zoneStart >= 0) {
      const zoneEnd = isSoft && i === sampleCount ? i : i - 1;
      if (zoneEnd - zoneStart >= 6) {
        softZoneCenters.push((zoneStart + zoneEnd) / (2 * sampleCount));
      }
      zoneStart = -1;
    }
  }

  const kickPosition = softZoneCenters.length
    ? softZoneCenters.reduce((sum, position) => sum + position, 0) / softZoneCenters.length
    : 0.5;
  const stiffnessBias = ((average - 87.5) / 37.5) * 0.08;
  const kickPositionBias = (kickPosition - 0.5) * 0.12 * gameSettings.kickpointEffect;
  const timingScale = Math.max(0.84, Math.min(1.16, 1 + stiffnessBias + kickPositionBias));
  const powerScale = Math.max(0.7, Math.min(1.5, 1 + ((average - 87.5) / 37.5) * 0.08 + kickPositionBias * 2.0));

  cachedStiffnessDynamics = { average, timingScale, powerScale };
  return cachedStiffnessDynamics;
}

export function computeBeamProfile(currentBendDeg, bgPercent, isReleased, leverAngleDeg, topPullDownMm, followProgress, peakBendDeg) {
  const ds = L_total / (SEGMENTS - 1);
  const s_bg = Math.max(0.12 * L_total, Math.min(0.88 * L_total, (bgPercent / 100) * L_total));
  const kappa = new Float64Array(SEGMENTS);
  let referenceCurvature = 0;

  for (let i = 0; i < SEGMENTS; i++) {
    const s = i * ds;
    const u = s / L_total;
    let M = (s <= s_bg) ? Math.sin((Math.PI / 2) * (s / s_bg)) : Math.cos((Math.PI / 2) * ((s - s_bg) / (L_total - s_bg)));
    const handleStiff = 1.5 * Math.pow(Math.max(0, (u - 0.88) / 0.12), 2);
    const hoselStiff = 0.8 * Math.pow(Math.max(0, (0.08 - u) / 0.08), 2);
    const baseEI = 1.0 + handleStiff + hoselStiff;
    const localStiffness = getStiffnessAt(u);
    const EI = baseEI * (localStiffness / 87.5);
    const k = M / EI;
    kappa[i] = k;
    referenceCurvature += (M / baseEI) * ds;
  }

  const targetRad = (currentBendDeg * Math.PI) / 180;
  const scale = referenceCurvature !== 0 ? targetRad / referenceCurvature : 0;
  for (let i = 0; i < SEGMENTS; i++) kappa[i] *= scale;

  const rawTheta = new Float64Array(SEGMENTS);
  rawTheta[0] = 0;
  for (let i = 1; i < SEGMENTS; i++) {
    rawTheta[i] = rawTheta[i - 1] + 0.5 * (kappa[i - 1] + kappa[i]) * ds;
  }

  let th = 0;
  for (let iter = 0; iter < 10; iter++) {
    let zEnd = 0, dz_dth = 0;
    for (let i = 1; i < SEGMENTS; i++) {
      const thMid = 0.5 * (rawTheta[i - 1] + rawTheta[i]) + th;
      zEnd += Math.sin(thMid) * ds;
      dz_dth += Math.cos(thMid) * ds;
    }
    if (Math.abs(zEnd) < 1e-7) break;
    th -= zEnd / (dz_dth || 1);
  }
  const theta0 = th;

  const cumulativeAngle = new Float32Array(SEGMENTS);
  const cumulativeZ = new Float32Array(SEGMENTS);
  const cumulativeY = new Float32Array(SEGMENTS);

  if (isReleased) {
    const i_bg = Math.round(s_bg / ds);
    const peakBend = peakBendDeg || 35;
    const peakScale = currentBendDeg !== 0 ? peakBend / currentBendDeg : 0;
    const peakRawTheta = new Float64Array(SEGMENTS);
    for (let i = 1; i < SEGMENTS; i++) peakRawTheta[i] = rawTheta[i] * peakScale;
    let peakTh = 0;
    for (let iter = 0; iter < 10; iter++) {
      let zEnd = 0, dz_dth = 0;
      for (let i = 1; i < SEGMENTS; i++) {
        const thMid = 0.5 * (peakRawTheta[i - 1] + peakRawTheta[i]) + peakTh;
        zEnd += Math.sin(thMid) * ds;
        dz_dth += Math.cos(thMid) * ds;
      }
      if (Math.abs(zEnd) < 1e-7) break;
      peakTh -= zEnd / (dz_dth || 1);
    }
    let refZ_bg = 0, refY_bg = 0;
    for (let i = 1; i <= i_bg; i++) {
      const thMid = 0.5 * (peakRawTheta[i - 1] + peakRawTheta[i]) + peakTh;
      refZ_bg += Math.sin(thMid) * ds;
      refY_bg += Math.cos(thMid) * ds;
    }

    const progress = Math.max(0, Math.min(1, followProgress || 0));
    const upperCurvature = 1 - progress;
    const maxSwingAngle = (78 * Math.PI) / 180;
    const peakTopAngle = peakRawTheta[SEGMENTS - 1] + peakTh;
    const requestedTopAngle = peakTopAngle + (leverAngleDeg * Math.PI / 180) * progress;
    let minRelativeAngle = Infinity, maxRelativeAngle = -Infinity;

    for (let i = 0; i < SEGMENTS; i++) {
      const relativeAngle = rawTheta[i] - rawTheta[i_bg];
      const adjustedRelative = i > i_bg ? relativeAngle * upperCurvature : relativeAngle;
      minRelativeAngle = Math.min(minRelativeAngle, adjustedRelative);
      maxRelativeAngle = Math.max(maxRelativeAngle, adjustedRelative);
    }

    const minFulcrumAngle = -maxSwingAngle - minRelativeAngle;
    const maxFulcrumAngle = maxSwingAngle - maxRelativeAngle;
    const topRelativeAngle = (rawTheta[SEGMENTS - 1] - rawTheta[i_bg]) * upperCurvature;
    const minTopAngle = minFulcrumAngle + topRelativeAngle;
    const maxTopAngle = maxFulcrumAngle + topRelativeAngle;
    const targetTopAngle = Math.max(minTopAngle, Math.min(maxTopAngle, Math.max(peakTopAngle, requestedTopAngle)));
    const th_bg = targetTopAngle - topRelativeAngle;

    for (let i = 0; i < SEGMENTS; i++) {
      const relativeAngle = rawTheta[i] - rawTheta[i_bg];
      cumulativeAngle[i] = th_bg + (i > i_bg ? relativeAngle * upperCurvature : relativeAngle);
    }

    const fulcrumZ = refZ_bg;
    const fulcrumY = refY_bg - (topPullDownMm || 0) * progress * 0.3;

    const absZ = new Float64Array(SEGMENTS);
    const absY = new Float64Array(SEGMENTS);
    absZ[i_bg] = fulcrumZ;
    absY[i_bg] = fulcrumY;

    for (let i = i_bg + 1; i < SEGMENTS; i++) {
      const thMid = 0.5 * (cumulativeAngle[i - 1] + cumulativeAngle[i]);
      absZ[i] = absZ[i - 1] + Math.sin(thMid) * ds;
      absY[i] = absY[i - 1] + Math.cos(thMid) * ds;
    }
    for (let i = i_bg - 1; i >= 0; i--) {
      const thMid = 0.5 * (cumulativeAngle[i] + cumulativeAngle[i + 1]);
      absZ[i] = absZ[i + 1] - Math.sin(thMid) * ds;
      absY[i] = absY[i + 1] - Math.cos(thMid) * ds;
    }
    for (let i = 0; i < SEGMENTS; i++) {
      cumulativeZ[i] = absZ[i];
      cumulativeY[i] = absY[i] - i * ds;
    }
  } else {
    for (let i = 0; i < SEGMENTS; i++) cumulativeAngle[i] = rawTheta[i] + theta0;
    cumulativeZ[0] = 0;
    let curY = 0;
    cumulativeY[0] = 0;
    for (let i = 1; i < SEGMENTS; i++) {
      const s = i * ds;
      const thMid = 0.5 * (cumulativeAngle[i - 1] + cumulativeAngle[i]);
      cumulativeZ[i] = cumulativeZ[i - 1] + Math.sin(thMid) * ds;
      curY += Math.cos(thMid) * ds;
      cumulativeY[i] = curY - s;
    }
  }

  return {
    cumulativeAngle,
    cumulativeZ,
    cumulativeY,
    thetaHosel: cumulativeAngle[0],
    deltaZHosel: cumulativeZ[0],
    deltaYHosel: cumulativeY[0]
  };
}

export function sampleDeformation(origY, profile) {
  const u = Math.max(0, Math.min(1, origY / L_total));
  const segs = profile.cumulativeZ.length;
  const idx = u * (segs - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(segs - 1, i0 + 1);
  const frac = idx - i0;

  const dz = profile.cumulativeZ[i0] + (profile.cumulativeZ[i1] - profile.cumulativeZ[i0]) * frac;
  const dy = profile.cumulativeY[i0] + (profile.cumulativeY[i1] - profile.cumulativeY[i0]) * frac;
  const theta = profile.cumulativeAngle[i0] + (profile.cumulativeAngle[i1] - profile.cumulativeAngle[i0]) * frac;

  return { dz, dy, theta };
}

export function updatePhysics() {
  const t = state.timeline;
  const stiffnessDynamics = getStiffnessDynamics();
  const loadTimeScale = stiffnessDynamics.timingScale;
  const recoveryTimeScale = stiffnessDynamics.timingScale;
  const tPeak = Math.max(540, Math.min(660, 600 * loadTimeScale));
  const bgAmpMag = Math.abs(state.bottomGloveAmp) / 100;
  const thAmpMag = Math.abs(state.topHandAmp) / 100;
  const bgWindow = Math.max(20, Math.abs(state.bottomGloveTimeframe) * loadTimeScale);
  const thWindow = Math.max(20, Math.abs(state.topHandTimeframe) * loadTimeScale);

  let bgPulse = 0, thPulse = 0;
  if (state.holdMaxBend) {
    bgPulse = 1.0; thPulse = 1.0;
  } else if (t <= tPeak) {
    const dtBg = Math.abs(t - tPeak);
    if (dtBg <= bgWindow / 2) bgPulse = Math.sin(((t - (tPeak - bgWindow / 2)) / bgWindow) * Math.PI);
    const dtTh = Math.abs(t - tPeak);
    if (dtTh <= thWindow / 2) thPulse = Math.sin(((t - (tPeak - thWindow / 2)) / thWindow) * Math.PI);
  }

  const fBottom = bgAmpMag * bgPulse;
  const fTop = thAmpMag * thPulse;
  const netForceFactor = (fBottom + fTop) / 1.6;
  const peakBendDeg = state.maxBendAngle * ((bgAmpMag + thAmpMag) / 1.6) * stiffnessDynamics.powerScale;

  let isReleased = false, currentBendDeg = 0, leverAngleDeg = 0, topPullDownMm = 0, pullProgress = 0;

  if (state.holdMaxBend || t <= tPeak) {
    currentBendDeg = netForceFactor * state.maxBendAngle * stiffnessDynamics.powerScale;
    isReleased = false;
  } else {
    isReleased = true;
    const releaseDuration = (1000 - 600) * recoveryTimeScale;
    const tau = Math.max(0, Math.min(1, (t - tPeak) / releaseDuration));
    const decay = Math.exp(-2.2 * tau);
    const whipScale = (state.bladeWhipStrength ?? 100) / 100;
    const whipPhase = 2.2 * Math.PI * tau;
    const osc = Math.cos(whipPhase) + (1 / Math.PI) * Math.sin(whipPhase) + (whipScale - 1) * Math.sin(whipPhase) ** 2;
    const window = Math.cos((Math.PI / 2) * Math.pow(tau, 1.3));
    currentBendDeg = peakBendDeg * decay * osc * window;

    const baseFollowAngle = state.followThroughAngle ?? 28;
    const topScale = Math.max(0.2, thAmpMag / 0.8);
    const configuredPullStart = state.topHandPullStartMs ?? 600;
    const pullStartMs = tPeak + (configuredPullStart - 600);
    const pullDuration = Math.max(1, (850 - configuredPullStart) * recoveryTimeScale);
    const pullTau = Math.max(0, Math.min(1, (t - pullStartMs) / pullDuration));
    pullProgress = 0.5 * (1 - Math.cos(pullTau * Math.PI));

    leverAngleDeg = baseFollowAngle * topScale;
    topPullDownMm = (state.topHandPullDownMm ?? 100) * topScale;
  }

  let profile = computeBeamProfile(currentBendDeg, state.bottomGlovePos, isReleased, leverAngleDeg, topPullDownMm, pullProgress, peakBendDeg);

  if (isReleased && t < tPeak + 60) {
    const releaseBlend = Math.max(0, Math.min(1, (t - tPeak) / 60));
    const blend = releaseBlend * releaseBlend * (3 - 2 * releaseBlend);
    const initialProfile = computeBeamProfile(currentBendDeg, state.bottomGlovePos, false, 0, 0, 0, peakBendDeg);

    for (let i = 0; i < profile.cumulativeAngle.length; i++) {
      profile.cumulativeAngle[i] = initialProfile.cumulativeAngle[i] + (profile.cumulativeAngle[i] - initialProfile.cumulativeAngle[i]) * blend;
      profile.cumulativeZ[i] = initialProfile.cumulativeZ[i] + (profile.cumulativeZ[i] - initialProfile.cumulativeZ[i]) * blend;
      profile.cumulativeY[i] = initialProfile.cumulativeY[i] + (profile.cumulativeY[i] - initialProfile.cumulativeY[i]) * blend;
    }
    profile.thetaHosel = profile.cumulativeAngle[0];
    profile.deltaZHosel = profile.cumulativeZ[0];
    profile.deltaYHosel = profile.cumulativeY[0];
  }

  if (stickParams.stickMesh && stickParams.originalPositions) {
    const pos = stickParams.stickMesh.geometry.attributes.position.array;
    const orig = stickParams.originalPositions;
    const cosHosel = Math.cos(profile.thetaHosel);
    const sinHosel = Math.sin(profile.thetaHosel);

    for (const row of stickParams.vertexRows) {
      const origY = row.y;
      if (origY >= 0) {
        const deform = sampleDeformation(origY, profile);
        const cosT = Math.cos(deform.theta);
        const sinT = Math.sin(deform.theta);
        for (const i of row.indices) {
          const relX = orig[i] - X_center;
          const relZ = orig[i + 2] - Z_center;
          pos[i] = X_center + relX;
          pos[i + 1] = origY + deform.dy - relZ * sinT;
          pos[i + 2] = Z_center + deform.dz + relZ * cosT;
        }
      } else {
        for (const i of row.indices) {
          const relX = orig[i] - X_center;
          const relZ = orig[i + 2] - Z_center;
          pos[i] = X_center + relX;
          pos[i + 1] = profile.deltaYHosel + origY * cosHosel - relZ * sinHosel;
          pos[i + 2] = Z_center + profile.deltaZHosel + origY * sinHosel + relZ * cosHosel;
        }
      }
    }
    stickParams.stickMesh.geometry.attributes.position.needsUpdate = true;
    stickParams.stickMesh.geometry.computeVertexNormals();
    stickParams.stickMesh.geometry.computeBoundingBox();
    stickParams.stickMesh.geometry.computeBoundingSphere();

    stickParams.stickGroup.position.y = stickParams.stickRestY;
    stickParams.stickGroup.updateMatrixWorld(true);
    const deformedBox = new THREE.Box3().setFromObject(stickParams.stickGroup, true);
    const floorLift = Math.max(0, -deformedBox.min.y);
    stickParams.stickGroup.position.y += floorLift;

    const y_bg = (state.bottomGlovePos / 100) * L_total;
    const d_bg = sampleDeformation(y_bg, profile);
    bgMarker.position.set(X_center, y_bg + d_bg.dy + floorLift, Z_center + d_bg.dz);
    bgMarker.rotation.set(-d_bg.theta, 0, 0);

    const y_th = L_total;
    const d_th = sampleDeformation(y_th, profile);
    thMarker.position.set(X_center, y_th + d_th.dy + floorLift, Z_center + d_th.dz);
    thMarker.rotation.set(-d_th.theta, 0, 0);
  }
}

export function initializeBladePath() {
  if (!stickParams.stickMesh || !stickParams.originalPositions) return;
  const puckStart = new THREE.Vector3(95, 12.5, -20120);
  const position = stickParams.stickMesh.geometry.attributes.position.array;
  let nearestDistance = Infinity;
  let heelIndex = -1;
  const bladeIndices = [];

  for (let i = 0; i < stickParams.originalPositions.length; i += 3) {
    if (stickParams.originalPositions[i + 1] >= 0) continue;
    bladeIndices.push(i);
    const worldPoint = stickParams.stickMesh.localToWorld(
      new THREE.Vector3(position[i], position[i + 1], position[i + 2])
    );
    const distance = worldPoint.distanceToSquared(puckStart);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      heelIndex = i;
    }
  }

  if (heelIndex < 0) return;
  const heel = stickParams.stickMesh.localToWorld(
    new THREE.Vector3(position[heelIndex], position[heelIndex + 1], position[heelIndex + 2])
  );
  let farthestDistance = -1;
  let tipIndex = heelIndex;
  for (const i of bladeIndices) {
    const point = stickParams.stickMesh.localToWorld(
      new THREE.Vector3(position[i], position[i + 1], position[i + 2])
    );
    const distance = point.distanceToSquared(heel);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      tipIndex = i;
    }
  }
  game.bladeHeelIndex = heelIndex;
  game.bladeTipIndex = tipIndex;
}

export function getBladePoint(vertexIndex) {
  const position = stickParams.stickMesh.geometry.attributes.position.array;
  return stickParams.stickMesh.localToWorld(
    new THREE.Vector3(position[vertexIndex], position[vertexIndex + 1], position[vertexIndex + 2])
  );
}

export function getBladeContactProgress() {
  if (game.bladeHeelIndex < 0 || game.bladeTipIndex < 0) return null;
  const heel = getBladePoint(game.bladeHeelIndex);
  const tip = getBladePoint(game.bladeTipIndex);
  const bladeAxis = tip.clone().sub(heel);
  const lengthSq = bladeAxis.lengthSq();
  if (lengthSq === 0) return null;

  const progress = THREE.MathUtils.clamp(
    game.puck.position.clone().sub(heel).dot(bladeAxis) / lengthSq,
    0, 1
  );
  const closestPoint = heel.addScaledVector(bladeAxis, progress);
  const contactDistance = 250;
  return closestPoint.distanceToSquared(game.puck.position) <= contactDistance ** 2 ? progress : null;
}
