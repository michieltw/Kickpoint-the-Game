import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { appState, state, game, swipeData } from './state.js';
import { gameSettings, physicsSettings, StickCustomizerState, L_total, Z_center, X_center, gravity, puckRadius, rinkWidth, targetRadius, GOAL, flightMinTime, flightMaxTime } from './config.js';
import {
  updatePhysics,
  getStiffnessDynamics,
  getBladeContactProgress,
  getBladePoint,
  initializeBladePath,
  resolveShotPhysics,
  calculateReleaseSpeed,
  calculateShotDispersion,
  calculateLaunchVector,
  getAimAdjustedLaunchVelocity
} from './physics.js';
import { scene, camera, renderer, controls, ghostPuck, projectedArrow, puckSwipeMesh, updateProjectedArrow, stickParams, targetGroup, particleGroup, createTargetTexture, shotTracerGeo, shotTracerLine, updateBoardLogos, updateGoalSpeedDisplay, updateScoreboard } from './scene.js';
import { updateUiMode, syncUiFromState, initUiBindings, drawStiffnessCurve, applyKickpointPreset } from './ui.js';
import { spawnTargets, shatterTarget } from './targets.js';
import { bindInput } from './input.js';
import { getStickShotModifiers } from './stick-effects.js';
import { handleTutorialShotComplete, setupCrossbarChallenge, endTutorial } from './tutorial.js';
import { initTrialRankingModal } from './tutorial-ranking.js';

const STICK_MODEL_URLS = Object.freeze({
  P02: {
    right: 'https://cdn.shopify.com/3d/models/cd2d87b8d6b26bd7/P02_RH.glb',
    left: 'https://cdn.shopify.com/3d/models/58f284073fd3f799/P02_LH.glb'
  },
  P08: {
    right: 'https://cdn.shopify.com/3d/models/7d4cd03834d034d4/P08_RH.glb',
    left: 'https://cdn.shopify.com/3d/models/940d7bdc95647163/P08_LH.glb'
  },
  P14: {
    right: 'https://cdn.shopify.com/3d/models/50f00dd2270ddba8/P14_RH.glb',
    left: 'https://cdn.shopify.com/3d/models/0a7a949a25c5fb72/P14_LH.glb'
  },
  P28: {
    right: 'https://cdn.shopify.com/3d/models/6dc6981a802980a1/P28_RH.glb',
    left: 'https://cdn.shopify.com/3d/models/e71a8e2f973341c2/P28_LH.glb'
  },
  P28JR: {
    right: 'https://cdn.shopify.com/3d/models/4155fbd2b542bdfe/P28JR_RH.glb',
    left: 'https://cdn.shopify.com/3d/models/2ff49b10e6e6ef24/P28JR_LH.glb'
  },
  P28M: {
    right: 'https://cdn.shopify.com/3d/models/55080b51ee3916f0/P28M_RH.glb',
    left: 'https://cdn.shopify.com/3d/models/952f0c502d380828/P28M_LH.glb'
  },
  P77: {
    right: 'https://cdn.shopify.com/3d/models/da2893675325061f/P77_RH.glb',
    left: 'https://cdn.shopify.com/3d/models/031fe16be65368db/P77_LH.glb'
  },
  P88: {
    right: 'https://cdn.shopify.com/3d/models/18e301eb986f31d6/P88_RH.glb',
    left: 'https://cdn.shopify.com/3d/models/17d76c84fca93530/P88_LH.glb'
  },
  P90TM: {
    right: 'https://cdn.shopify.com/3d/models/87bb8cd1b9392e32/P90TM_RH.glb',
    left: 'https://cdn.shopify.com/3d/models/fb3dc634aebb7206/P90TM_LH.glb'
  },
  P91: {
    right: 'https://cdn.shopify.com/3d/models/9a497649283412b7/P91_RH.glb',
    left: 'https://cdn.shopify.com/3d/models/f60bbb594cd11f4f/P91_LH.glb'
  },
  P92: {
    right: 'https://cdn.shopify.com/3d/models/7ee3819dca989fbe/P92_RH.glb',
    left: 'https://cdn.shopify.com/3d/models/b90155611e9b89df/P92_LH.glb'
  },
  P92JR: {
    right: 'https://cdn.shopify.com/3d/models/97a10c3e5d7000f1/P92JR_RH.glb',
    left: 'https://cdn.shopify.com/3d/models/5fc0089cce60157a/P92JR_LH.glb'
  },
  P92M: {
    right: 'https://cdn.shopify.com/3d/models/3053e8d2f2fcbadc/P92M_RH.glb',
    left: 'https://cdn.shopify.com/3d/models/90129ce43667e61e/P92M_LH.glb'
  }
});
let playDirection = 1;
let lastTime = performance.now();
let customizerPreviewGroup = null;
let customizerPreviewModel = null;
let customizerPreviewScale = 1;
let customizerPreviewMesh = null;
let stickModelRoot = null;
let ghostStickModelRoot = null;
let gameplayStickVisibility = null;
let stickModelLoadRequest = 0;
const defaultSceneBackground = scene.background.clone();
let customizerZoom = 1.3;
let customizerFocusProgress = 0.5;
let customizerBackgroundActive = false;

function updateStickIndicator() {
  if (!stickParams.indicatorMesh) return;
  if (appState.tutorial && appState.tutorial.isActive && appState.tutorial.phase < 4) {
    const tutorialColors = { 'low': '#0000ff', 'mid': '#ffff00', 'hybrid': '#ff0000' };
    let currentKp = StickCustomizerState.kickpoint;
    if (appState.tutorial.phase === 1) currentKp = 'low';
    else if (appState.tutorial.phase === 2) currentKp = 'mid';
    else if (appState.tutorial.phase === 3) currentKp = 'hybrid';

    const tutColor = tutorialColors[currentKp] || tutorialColors['low'];
    stickParams.indicatorMesh.material.color.set(tutColor);

    if (currentKp === 'low') {
      stickParams.indicatorMesh.position.set(-110, 350, 23);
    } else if (currentKp === 'mid') {
      stickParams.indicatorMesh.position.set(-110, 750, 23);
    } else if (currentKp === 'hybrid') {
      stickParams.indicatorMesh.position.set(-110, 550, 23);
    }
  } else {
    stickParams.indicatorMesh.visible = false;
    stickParams.indicatorStartTime = 0;
  }
}

function applyCarbonPattern(material, geometry) {
  if (!geometry) return;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.attributes?.normal) geometry.computeVertexNormals();

  const boxSize = geometry.boundingBox?.getSize(new THREE.Vector3()) || new THREE.Vector3(20, 1500, 20);
  const minDim = Math.min(boxSize.x || 20, boxSize.z || 20);
  const shaftThickness = (minDim > 1 && Number.isFinite(minDim)) ? minDim : 20;
  const cellSize = Math.max(shaftThickness * 0.35, 3.0);

  material.userData = material.userData || {};
  material.userData.checkerCellSize = { value: cellSize };
  material.onBeforeCompile = shader => {
    shader.uniforms.customizerCheckerCellSize = material.userData.checkerCellSize;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vCustomizerCheckerPosition;\nvarying vec3 vCustomizerCheckerNormal;'
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvCustomizerCheckerPosition = position;\nvCustomizerCheckerNormal = normal;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vCustomizerCheckerPosition;\nvarying vec3 vCustomizerCheckerNormal;\nuniform float customizerCheckerCellSize;'
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 checkerNormal = abs(normalize(vCustomizerCheckerNormal));
        vec2 checkerCoordinates = checkerNormal.x > checkerNormal.y && checkerNormal.x > checkerNormal.z
          ? vCustomizerCheckerPosition.yz
          : checkerNormal.y > checkerNormal.z
            ? vCustomizerCheckerPosition.xz
            : vCustomizerCheckerPosition.xy;
        vec2 cellCoord = checkerCoordinates / max(customizerCheckerCellSize, 0.001);
        float checkerParity = mod(floor(cellCoord.x) + floor(cellCoord.y), 2.0);
        vec2 cellFract = fract(cellCoord);
        float fiberLine = checkerParity > 0.5 ? sin(cellFract.y * 18.8495) : sin(cellFract.x * 18.8495);
        float fiberGrain = 1.0 + fiberLine * 0.08;

        float stickBrightness = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 rawCarbon = mix(vec3(0.045, 0.045, 0.05), vec3(0.18, 0.18, 0.20), checkerParity) * fiberGrain;
        vec3 tintedCarbon = diffuseColor.rgb * mix(0.70, 1.22, checkerParity) * fiberGrain;

        float colorMix = clamp(stickBrightness / 0.12, 0.0, 1.0);
        diffuseColor.rgb = mix(rawCarbon, tintedCarbon, colorMix);`
      );
  };
  material.customProgramCacheKey = () => 'carbon-weave-v3';
}

function applyStickColor(material, color = StickCustomizerState.color) {
  const normalizedColor = (color || '#ffffff').toLowerCase();
  const isBlack = normalizedColor === '#000000';
  const isMetallic = ['#c0c0c0', '#d4af37', '#bfc7ce'].includes(normalizedColor);

  let activeColor = color;
  if (appState.tutorial && appState.tutorial.isActive) {
    const tutorialColors = { 'low': '#0000ff', 'mid': '#ffff00', 'hybrid': '#ff0000' };
    let currentKp = StickCustomizerState.kickpoint;
    if (appState.tutorial.phase === 1) currentKp = 'low';
    else if (appState.tutorial.phase === 2) currentKp = 'mid';
    else if (appState.tutorial.phase === 3) currentKp = 'hybrid';

    activeColor = tutorialColors[currentKp] || tutorialColors['low'];
  }

  updateStickIndicator();
  material.color?.set(activeColor);
  if (material.emissive) {
    material.emissive.set('#000000');
    material.emissiveIntensity = 0;
  }
  if ('metalness' in material) {
    material.metalness = isMetallic ? 0.65 : 0.08;
    material.roughness = normalizedColor === '#bfc7ce' ? 0.18 : isMetallic ? 0.28 : 0.48;
  }
  material.needsUpdate = true;
}

function updateStickColors(color = StickCustomizerState.color) {
  updateStickIndicator();
  for (const modelRoot of [stickModelRoot, ghostStickModelRoot, customizerPreviewModel]) {
    modelRoot?.traverse(child => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => applyStickColor(material, color));
    });
  }
}

function disposeModelObject(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse(child => {
    if (!child.isMesh) return;
    geometries.add(child.geometry);
    for (const material of (Array.isArray(child.material) ? child.material : [child.material])) {
      materials.add(material);
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

function createPreviewModel(root) {
  if (!customizerPreviewGroup) {
    customizerPreviewGroup = new THREE.Group();
    customizerPreviewGroup.add(new THREE.AmbientLight(0xffffff, 1.8));
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
    scene.add(customizerPreviewGroup);
  }

  if (customizerPreviewModel) {
    customizerPreviewGroup.remove(customizerPreviewModel);
    disposeModelObject(customizerPreviewModel);
  }
  customizerPreviewMesh = null;

  const previewModel = root.clone(true);
  previewModel.traverse(child => {
    if (!child.isMesh) return;
    if (!customizerPreviewMesh) customizerPreviewMesh = child;
    child.geometry = child.geometry.clone();
    child.geometry.computeBoundingBox();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const previewMaterials = materials.map(material => {
      const previewMaterial = material.clone();
      applyCarbonPattern(previewMaterial, child.geometry);
      applyStickColor(previewMaterial, StickCustomizerState.color);
      previewMaterial.depthTest = false;
      previewMaterial.depthWrite = false;
      return previewMaterial;
    });
    child.material = Array.isArray(child.material) ? previewMaterials : previewMaterials[0];
    child.renderOrder = 1000;
  });

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
  if (!Number.isFinite(previewHeight) || previewHeight <= 0) {
    disposeModelObject(previewModel);
    throw new Error('The selected 3D stick model has invalid dimensions.');
  }
  previewModel.position.sub(previewCenter);
  customizerPreviewScale = 1100 / previewHeight;
  previewModel.scale.setScalar(customizerPreviewScale);
  customizerPreviewModel = previewModel;
  customizerPreviewGroup.add(previewModel);
  customizerPreviewGroup.visible = false;
}

function installStickModel(root) {
  if (StickCustomizerState.bladeCurve === 'P28') {
    const alignP28Model = new THREE.Matrix4().makeRotationY(Math.PI);
    root.traverse(child => {
      if (!child.isMesh) return;
      child.geometry.applyMatrix4(alignP28Model);
      child.geometry.computeVertexNormals();
    });
  }

  let stickMesh = null;
  root.traverse(child => {
    if (!stickMesh && child.isMesh) stickMesh = child;
  });
  if (!stickMesh?.geometry?.attributes?.position) {
    disposeModelObject(root);
    throw new Error('The selected 3D stick model contains no mesh geometry.');
  }

  if (!stickParams.stickGroup) {
    stickParams.stickGroup = new THREE.Group();
    scene.add(stickParams.stickGroup);
  }

  {
    // Always compute the right-handed placement first.
    stickParams.stickGroup.rotation.set(0, 0.22, 0.40 + (20 * Math.PI / 180));
    stickParams.stickGroup.position.set(0, 0, -20500);

    const topHandLocal = new THREE.Vector3(X_center, L_total, Z_center);
    const topHandWorld = topHandLocal.clone()
      .applyQuaternion(stickParams.stickGroup.quaternion)
      .add(stickParams.stickGroup.position);
    stickParams.stickGroup.rotation.y -= THREE.MathUtils.degToRad(25);
    const rotatedTopHand = topHandLocal.clone().applyQuaternion(stickParams.stickGroup.quaternion);
    stickParams.stickGroup.position.x = topHandWorld.x - rotatedTopHand.x;
    stickParams.stickGroup.position.z = topHandWorld.z - rotatedTopHand.z;

    // Left-handed: exact mirror image of the right-handed placement, reflected across
    // the vertical plane through the puck start (x = 95) so the blade stays at the puck.
    if (StickCustomizerState.handedness === 'left') {
      const PUCK_START_X = 95;
      stickParams.stickGroup.position.x = 2 * PUCK_START_X - stickParams.stickGroup.position.x;
      stickParams.stickGroup.rotation.y = -stickParams.stickGroup.rotation.y;
      stickParams.stickGroup.rotation.z = -stickParams.stickGroup.rotation.z;
    }
  }

  if (stickModelRoot) {
    stickParams.stickGroup.remove(stickModelRoot);
    disposeModelObject(stickModelRoot);
  }
  if (stickParams.ghostStickGroup) {
    scene.remove(stickParams.ghostStickGroup);
    disposeModelObject(stickParams.ghostStickGroup);
  }

  stickModelRoot = root;
  root.traverse(child => {
    if (!child.isMesh) return;
    child.geometry.computeBoundingBox();
    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const materials = sourceMaterials.map(material => {
      const clonedMaterial = material.clone();
      applyCarbonPattern(clonedMaterial, child.geometry);
      applyStickColor(clonedMaterial, StickCustomizerState.color);
      return clonedMaterial;
    });
    child.material = Array.isArray(child.material) ? materials : materials[0];
  });
  stickParams.stickGroup.add(root);
  stickParams.stickMesh = stickMesh;
  stickParams.stickMesh.geometry.computeVertexNormals();
  stickParams.originalPositions = new Float32Array(stickMesh.geometry.attributes.position.array);
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

  stickParams.stickGroup.position.y = 0;
  stickParams.stickGroup.updateMatrixWorld(true);
  const stickBounds = new THREE.Box3().setFromObject(stickParams.stickGroup, true);
  stickParams.stickGroup.position.y -= stickBounds.min.y;
  stickParams.stickRestY = stickParams.stickGroup.position.y;
  stickParams.initialGroupPosition = stickParams.stickGroup.position.clone();

  if (!stickParams.indicatorMesh) {
    const indicatorGeo = new THREE.CylinderGeometry(20, 20, 150, 16);
    // Make it slightly open at ends and use an additive material
    const indicatorMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    stickParams.indicatorMesh = new THREE.Mesh(indicatorGeo, indicatorMat);
    stickParams.indicatorMesh.visible = false;
    stickParams.stickGroup.add(stickParams.indicatorMesh);
  }
  updateStickIndicator();

  stickParams.ghostStickGroup = stickParams.stickGroup.clone(false);
  ghostStickModelRoot = root.clone(true);
  stickParams.ghostStickGroup.add(ghostStickModelRoot);
  stickParams.ghostStickMesh = null;
  stickParams.ghostStickGroup.visible = false;
  stickParams.ghostStickGroup.traverse(child => {
    if (!child.isMesh) return;
    child.geometry = child.geometry.clone();
    child.geometry.computeBoundingBox();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const ghostMaterials = materials.map(material => {
      const ghostMaterial = material.clone();
      applyCarbonPattern(ghostMaterial, child.geometry);
      applyStickColor(ghostMaterial, StickCustomizerState.color);
      ghostMaterial.transparent = true;
      ghostMaterial.opacity = 0.32;
      ghostMaterial.depthWrite = false;
      return ghostMaterial;
    });
    child.material = Array.isArray(child.material) ? ghostMaterials : ghostMaterials[0];
    if (!stickParams.ghostStickMesh) stickParams.ghostStickMesh = child;
  });
  scene.add(stickParams.ghostStickGroup);

  createPreviewModel(root);
  if (!stickParams.ghostStickMesh || !customizerPreviewMesh) {
    throw new Error('The selected 3D stick model is missing required mesh geometry.');
  }
  document.getElementById('customizer-preview-stage').classList.add('has-stick-preview');
  stickParams.stickGroup.updateMatrixWorld(true);
  initializeBladePath();
  updatePhysics();
}

// Replay controls
let replayPaused = false;
let replayDirection = 1;

function updateGameScore() {
  const scoreVal = document.getElementById('score-val');
  if (scoreVal) scoreVal.textContent = game.score;
  const shotsVal = document.getElementById('shots-val');
  if (shotsVal) shotsVal.textContent = game.shots;
  if (game.shots > 0 && projectedArrow.visible) {
    projectedArrow.visible = false;
  }
  updateScoreboard({
    score: game.score,
    shots: game.shots,
    fastestRelease: game.fastestRelease,
    fastestReleaseKp: game.fastestReleaseKp,
    hardestShot: game.hardestShot,
    hardestShotKp: game.hardestShotKp,
    unit: gameSettings.speedUnit === 'mph' ? 'MPH' : 'KM/H'
  });
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

  for (let i = 0; i < frameSegments.length; i++) {
    const [frameStart, frameEnd] = frameSegments[i];
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

    // Check if tutorial phase 4 and hit the crossbar (index 2 is the crossbar)
    if (appState.tutorial && appState.tutorial.isActive && appState.tutorial.phase === 4 && i === 2) {
      appState.tutorial.hits++;
      const tutInstr = document.getElementById('tutorial-instruction');
      if (tutInstr) {
         tutInstr.innerText = 'Crossbar Hit! Tutorial Complete!';
         tutInstr.style.color = '#16a34a';
      }
      setTimeout(() => {
        endTutorial();
      }, 3000);
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

  // Radar tripod & box collision (next to right goal post, behind red line at x = 1600, z = -26100)
  const radarAssemblyX = 1600;
  const radarAssemblyZ = -26100;
  const radarRadius = 300;
  const dx = game.puck.position.x - radarAssemblyX;
  const dz = game.puck.position.z - radarAssemblyZ;
  if (dx * dx + dz * dz < (radarRadius + puckRadius) * (radarRadius + puckRadius) &&
      game.puck.position.y < 1000 + puckRadius) {
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.001) {
      const nx = dx / dist;
      const nz = dz / dist;
      game.puck.position.x = radarAssemblyX + nx * (radarRadius + puckRadius);
      game.puck.position.z = radarAssemblyZ + nz * (radarRadius + puckRadius);
      const dot = game.puckVelocity.x * nx + game.puckVelocity.z * nz;
      if (dot < 0) {
        game.puckVelocity.x -= 1.4 * dot * nx;
        game.puckVelocity.z -= 1.4 * dot * nz;
        game.puckVelocity.multiplyScalar(0.6);
      }
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

  if (appState.tutorial && appState.tutorial.isActive && appState.tutorial.phase === 4) {
      const startZ = -10000; // Blue line roughly
      game.puck.position.set(95, 12.5, startZ);
      if (stickParams.stickGroup && stickParams.initialGroupPosition) {
          const deltaZ = startZ - (-20120);
          stickParams.stickGroup.position.set(
              stickParams.initialGroupPosition.x,
              stickParams.stickRestY,
              stickParams.initialGroupPosition.z + deltaZ
          );
      }
      camera.position.set(0, 1000, startZ + 2420);
      controls.target.set(0, 600, startZ - 580);
  } else if (game.mode === 'randomSpawn') {
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
  updateProjectedArrow(game.puck.position);

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
window.addEventListener('startTargetPractice', () => {
    spawnTargets();
    resetPuck();
});

// Animation Loop
function animate() {
  const resetBtn = document.getElementById('btnResetAll');
  if (resetBtn) {
    // Only offer Reset between shots; hide it while the puck lies ready to be shot.
    const betweenShots = game.puckState === 'shot' || game.puckState === 'goal' || game.puckState === 'missed';
    if (resetBtn.hidden === betweenShots) resetBtn.hidden = !betweenShots;
  }
  const isReadyToShoot = appState.mode === 'game' && game.puckState === 'idle' && !state.isPlaying && !swipeData.isSwiping;
  if (puckSwipeMesh) {
    puckSwipeMesh.visible = isReadyToShoot;
    if (isReadyToShoot) {
      // Pulse & float on ice behind puck towards the goal
      const animTime = performance.now() * 0.003;
      puckSwipeMesh.material.opacity = 0.5 + 0.4 * Math.sin(animTime * 2);
    }
  }
  if (stickParams.indicatorMesh && stickParams.indicatorStartTime > 0) {
    const now = performance.now();
    const elapsed = now - stickParams.indicatorStartTime;
    if (elapsed < 1500) {
      stickParams.indicatorMesh.visible = true;
      const pulse = (Math.sin(elapsed / 50) + 1) / 2;
      stickParams.indicatorMesh.material.opacity = pulse;
    } else {
      stickParams.indicatorMesh.visible = false;
      stickParams.indicatorStartTime = 0;
    }
  }
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
    const relSpeedMult = Math.max(0.1, physicsSettings?.releaseSpeedMultiplier ?? 1.0);
    const shotQuickness = swipeData.triggered || ['shot', 'goal', 'missed'].includes(game.puckState)
      ? game.shotQuickness * relSpeedMult
      : 1;
    const swipeAnimBonus = swipeData.triggered
      ? (0.88 + 0.22 * ((swipeData.power || 80) / 100))
      : 1;
    const animMultiplier = physicsSettings?.animPlaybackMultiplier ?? 1.0;
    const stepRate = 800 * animMultiplier * delta * shotQuickness * swipeAnimBonus;
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
      const relSpeedMult = Math.max(0.1, physicsSettings?.releaseSpeedMultiplier ?? 1.0);
      const quickness = Math.max(0.1, game.shotQuickness || 1);
      game.releaseTime = game.contactTime + ((physicsSettings?.puckDwellTime ?? 180) * stiffnessDynamics.timingScale) / (relSpeedMult * quickness);

      const contactHeel = getBladePoint(game.bladeHeelIndex);
      const contactTip = getBladePoint(game.bladeTipIndex);
      const contactBladeAxis = contactTip.clone().sub(contactHeel);

      game.bladeContactAxis.copy(contactBladeAxis.normalize());

      const upVector = new THREE.Vector3(0, 1, 0);
      let frontNormal = new THREE.Vector3().crossVectors(game.bladeContactAxis, upVector).normalize();

      if (frontNormal.z > 0) frontNormal.negate();

      const bladeClearance = physicsSettings?.bladeClearance ?? 54;
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
          } else if (game.peakBladeForwardSpeed > (physicsSettings?.bladeDecelThreshold ?? 300) && game.bladeForwardSpeed < game.peakBladeForwardSpeed * 0.92) {
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

      const bladeHasStartedSlowing = game.peakBladeForwardSpeed > (physicsSettings?.bladeDecelThreshold ?? 300) && game.bladeDecelerationFrames >= 3;
      const relSpeedMult = Math.max(0.1, physicsSettings?.releaseSpeedMultiplier ?? 1.0);
      const quickness = Math.max(0.1, game.shotQuickness || 1);
      const releaseSafetyLimitReached = state.timeline >= game.contactTime + ((physicsSettings?.releaseSafetyLimit ?? 420) / (relSpeedMult * quickness));
      const rollOffBlade = (game.bladeContactProgress + (1.05 - game.bladeContactProgress) * Math.max(0, Math.min(1, (state.timeline - game.contactTime) / (game.releaseTime - game.contactTime)))) >= 1.0;

      if (bladeHasStartedSlowing || releaseSafetyLimitReached || rollOffBlade) {
        let currentKp = StickCustomizerState.kickpoint || 'mid';
        if (appState.tutorial && appState.tutorial.isActive && appState.tutorial.phase < 4) {
          if (appState.tutorial.phase === 1) currentKp = 'low';
          else if (appState.tutorial.phase === 2) currentKp = 'mid';
          else if (appState.tutorial.phase === 3) currentKp = 'hybrid';
          StickCustomizerState.kickpoint = currentKp;
        }

        const swipePower = swipeData.power ? swipeData.power / 100 : 0.8;
        const shotPhysics = resolveShotPhysics({
          power: swipeData.power,
          timingQuality: getStiffnessDynamics(),
          stick: StickCustomizerState,
          kickPoint: currentKp,
          state: state,
          aimPoint: game.shotAim || new THREE.Vector3(0, 300, game.net.position.z)
        });

        game.puckVelocity.copy(shotPhysics.launchVector);
        const speed = shotPhysics.speed;

        // Calculate and show speed on the in-goal digital radar display.
        // speed is in mm/s. Convert to m/s by dividing by 1000.
        const speedMs = speed / 1000;
        const speedKmh = speedMs * 3.6;
        const speedMph = speedKmh * 0.621371;
        const speedVal = gameSettings.speedUnit === 'kmh' ? speedKmh : speedMph;

        updateGoalSpeedDisplay(speedVal, gameSettings.speedUnit === 'kmh' ? 'KM/H' : 'MPH');

        // Track Scoreboard Record Stats (Fastest Release and Hardest Shot)
        const shotReleaseMs = Math.max(10, state.timeline - game.contactTime);
        if (game.fastestRelease === 0 || shotReleaseMs < game.fastestRelease) {
          game.fastestRelease = shotReleaseMs;
          game.fastestReleaseKp = currentKp;
        }

        if (!game.hardestShotKmh || speedKmh > game.hardestShotKmh) {
          game.hardestShotKmh = speedKmh;
          game.hardestShotKp = currentKp;
        }
        const currentHardestShot = gameSettings.speedUnit === 'mph' ? (game.hardestShotKmh * 0.621371) : game.hardestShotKmh;
        game.hardestShot = currentHardestShot;

        updateScoreboard({
          score: game.score,
          shots: game.shots,
          fastestRelease: game.fastestRelease,
          fastestReleaseKp: game.fastestReleaseKp,
          hardestShot: game.hardestShot,
          hardestShotKp: game.hardestShotKp,
          unit: gameSettings.speedUnit === 'mph' ? 'MPH' : 'KM/H'
        });

        // Store shot record for tutorial trial ranking & analysis
        game.lastShotRecord = {
          kickpoint: currentKp,
          speedKmh: speedKmh,
          speedMph: speedMph,
          releaseMs: shotReleaseMs,
          pathError: Math.abs(game.shotDeviationX || 0),
          aimX: game.shotAim ? game.shotAim.x : 0,
          aimY: game.shotAim ? game.shotAim.y : 300,
          flightTargetX: shotPhysics.flightTarget ? shotPhysics.flightTarget.x : (game.shotAim ? game.shotAim.x : 0),
          flightTargetY: shotPhysics.flightTarget ? shotPhysics.flightTarget.y : (game.shotAim ? game.shotAim.y : 300),
          crossingX: null,
          crossingY: null,
          isGoal: false
        };

        game.flightStart.copy(game.puck.position);
        game.flightDuration = shotPhysics.flightDuration;

        game.shotElapsed = 0;
        game.shotWobbleOffset = 0;
        const wobbleFactor = physicsSettings?.puckWobbleFactor ?? 1.0;
        game.shotWobble = THREE.MathUtils.clamp(((1 - swipePower) * 90 + Math.abs(swipeData.accuracy) * 1000) * wobbleFactor, 0, 240);
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
    const activeGravity = physicsSettings?.gravityValue ?? gravity;
    const previousPuckPosition = game.puck.position.clone();
    if (game.puckState === 'goal') game.puckVelocity.y -= 3800 * delta;
    if (game.puckState === 'shot') {
      game.shotElapsed += delta;
      game.puck.position.x += game.puckVelocity.x * delta;
      game.puck.position.y += game.puckVelocity.y * delta - 0.5 * activeGravity * delta * delta;
      game.puck.position.z += game.puckVelocity.z * delta;
      game.puckVelocity.y -= activeGravity * delta;
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

    if (Math.abs(game.puck.position.x) > (rinkWidth / 2) - puckRadius) {
       game.puck.position.x = Math.sign(game.puck.position.x) * ((rinkWidth / 2) - puckRadius);
       game.puckVelocity.x *= -0.8;
    }
    if (game.puck.position.z < -30000 + puckRadius) {
       game.puck.position.z = -30000 + puckRadius;
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
           Math.abs(crossingX - netX) < GOAL.width / 2 - GOAL.postRadius - puckRadius &&
           crossingY > 12.5 &&
           crossingY < GOAL.height - GOAL.postRadius - puckRadius) {
            game.puckState = 'goal';
            game.score++;
            updateGameScore();
            goalOverlay = document.createElement('div');
            goalOverlay.textContent = 'GOAL!';
            goalOverlay.className = "goal-overlay";
            document.body.appendChild(goalOverlay);

            game.puckVelocity.multiplyScalar(0.1);
            game.replayFrames.push(captureReplayFrame());
            game.replayRecording = false;
            document.getElementById('btnInstantReplay').disabled = game.replayFrames.length < 2;

            if (game.lastShotRecord) {
              game.lastShotRecord.crossingX = crossingX;
              game.lastShotRecord.crossingY = crossingY;
              game.lastShotRecord.isGoal = true;
            }

            if (appState.tutorial && appState.tutorial.isActive) {
              handleTutorialShotComplete(game.lastShotRecord);
            }

            schedulePuckReset(2000);
       }
       if (game.puckState === 'shot' && (
         game.puck.position.z < netZ - 1000 ||
         game.puck.position.z < -30500 ||
         Math.abs(game.puck.position.x) > 13000 ||
         (game.puckVelocity.lengthSq() < 1000 && game.puck.position.z < -20600) ||
         game.shotElapsed > 8
       )) {
          if (game.lastShotRecord) {
            game.lastShotRecord.crossingX = game.lastShotRecord.flightTargetX;
            game.lastShotRecord.crossingY = game.lastShotRecord.flightTargetY;
            game.lastShotRecord.isGoal = false;
          }
          finishMissedShot();
         if (appState.tutorial && appState.tutorial.isActive) {
           handleTutorialShotComplete(game.lastShotRecord);
         }
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
      p.vy -= gravity * delta; // gravity
      p.mesh.rotation.x += p.rx * delta;
      p.mesh.rotation.y += p.ry * delta;
      p.life -= delta;
      p.mesh.material.opacity = p.life;

      if(p.life <= 0) {
          particleGroup.remove(p.mesh);
          if (p.mesh.geometry) p.mesh.geometry.dispose();
          if (p.mesh.material) p.mesh.material.dispose();
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
      const previewStage = document.getElementById('customizer-preview-stage');
      const stageBounds = previewStage.getBoundingClientRect();
      const previewTargetY = stageBounds.top + stageBounds.height / 2;
      const worldUnitsPerPixel = (2 * 2400 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / window.innerHeight;
      const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const previewTargetX = stageBounds.left + stageBounds.width * 0.5;
      const zoomByCategory = {
        overview: 1.3,
        blade: 2.15,
        kickpoint: 1.8,
        grip: 1.8,
        color: 1.55,
        'shaft-top': 1.8
      };
      const focusByCategory = {
        overview: 0.5,
        blade: 0.85,
        kickpoint: 0.73,
        grip: 0.49,
        color: 0.24,
        'shaft-top': 0.03
      };
      const zoomCategory = previewStage.dataset.zoom || 'overview';
      const targetZoom = zoomByCategory[zoomCategory] ?? zoomByCategory.overview;
      const targetFocusProgress = focusByCategory[zoomCategory] ?? 0.5;
      customizerZoom += (targetZoom - customizerZoom) * 0.12;
      customizerFocusProgress += (targetFocusProgress - customizerFocusProgress) * 0.12;
      customizerPreviewModel.scale.setScalar(customizerPreviewScale * customizerZoom);
      if (!customizerBackgroundActive) {
        scene.background.set('#f1f2f4');
        customizerBackgroundActive = true;
      }
      customizerPreviewGroup.position.copy(camera.position)
        .addScaledVector(cameraForward, 2400)
        .addScaledVector(cameraUp, (window.innerHeight / 2 - previewTargetY) * worldUnitsPerPixel)
        .addScaledVector(cameraRight, (previewTargetX - window.innerWidth / 2) * worldUnitsPerPixel)
        .addScaledVector(cameraUp, (customizerFocusProgress - 0.5) * 1100 * customizerZoom);
      customizerPreviewGroup.quaternion.copy(camera.quaternion);
      customizerPreviewGroup.updateMatrixWorld(true);
    }
  }
  if (!isCustomizerVisible && customizerBackgroundActive) {
    scene.background.copy(defaultSceneBackground);
    customizerBackgroundActive = false;
  }
  renderer.render(scene, camera);
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('tutorialKickpointSwitched', () => {
    let currentKp = StickCustomizerState.kickpoint;
    if (appState.tutorial && appState.tutorial.isActive && appState.tutorial.phase < 4) {
      if (appState.tutorial.phase === 1) currentKp = 'low';
      else if (appState.tutorial.phase === 2) currentKp = 'mid';
      else if (appState.tutorial.phase === 3) currentKp = 'hybrid';
      StickCustomizerState.kickpoint = currentKp;
    }
    applyKickpointPreset(currentKp);
    updateBoardLogos(currentKp);
    updateStickColors();
    if (stickParams.indicatorMesh) {
      if (appState.tutorial && appState.tutorial.isActive && appState.tutorial.phase < 4) {
        stickParams.indicatorStartTime = performance.now();
      } else {
        stickParams.indicatorMesh.visible = false;
        stickParams.indicatorStartTime = 0;
      }
    }
  });
  document.getElementById('canvas-container').appendChild(renderer.domElement);
  initUiBindings(updatePhysics);
  applyKickpointPreset(StickCustomizerState.kickpoint || 'mid');
  bindInput(controls, syncUiFromState);
  let customizerDragStart = null;
  renderer.domElement.addEventListener('pointerdown', event => {
    if (appState.mode !== 'customizer') return;
    const previewStage = document.getElementById('customizer-preview-stage');
    const bounds = previewStage.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) return;
    customizerDragStart = { x: event.clientX, y: event.clientY };
  });
  renderer.domElement.addEventListener('pointerup', event => {
    if (!customizerDragStart || appState.mode !== 'customizer') {
      customizerDragStart = null;
      return;
    }
    const deltaX = event.clientX - customizerDragStart.x;
    const deltaY = event.clientY - customizerDragStart.y;
    customizerDragStart = null;
    if (Math.abs(deltaX) < 70 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
    const customizer = document.getElementById('stick-customizer');
    const collapsed = deltaX > 0;
    customizer.classList.toggle('options-collapsed', collapsed);
    const collapseButton = document.getElementById('customizer-collapse');
    collapseButton.setAttribute('aria-expanded', String(!collapsed));
    collapseButton.setAttribute('aria-label', collapsed ? 'Opties uitklappen' : 'Opties inklappen');
  });
  renderer.domElement.addEventListener('pointercancel', () => { customizerDragStart = null; });

  const loader = new GLTFLoader();
  const modelStatus = document.getElementById('customizer-model-status');
  let hasStarted = false;

  const handleStickModelChange = () => {
    const pattern = StickCustomizerState.bladeCurve;
    const handedness = StickCustomizerState.handedness;
    const modelUrl = STICK_MODEL_URLS[pattern]?.[handedness];
    if (!modelUrl) {
      modelStatus.textContent = `Pattern ${pattern} is niet beschikbaar voor deze handvoorkeur.`;
      modelStatus.hidden = false;
      console.error(`No GLB URL is configured for pattern "${pattern}" (${handedness}).`);
      return;
    }

    const requestId = ++stickModelLoadRequest;
    modelStatus.textContent = 'Stickmodel wordt geladen…';
    modelStatus.hidden = false;
    loader.load(modelUrl, gltf => {
      if (requestId !== stickModelLoadRequest) {
        disposeModelObject(gltf.scene);
        return;
      }

      let installed = false;
      try {
        installStickModel(gltf.scene);
        installed = true;
        modelStatus.textContent = '';
        modelStatus.hidden = true;
      } catch (error) {
        console.error(`Could not install the ${pattern} stick model:`, error);
        modelStatus.textContent = `Pattern ${pattern} kon niet worden geladen. Probeer het later opnieuw.`;
        modelStatus.hidden = false;
      }

      if (installed && !hasStarted) {
        hasStarted = true;
        appState.mode = 'intro';
        updateUiMode();
        const introVideo = document.getElementById('intro-video');
        introVideo.currentTime = 0;
        introVideo.play().catch(error => {
          console.error('Could not start the intro video:', error);
          const introError = document.getElementById('intro-error');
          introError.textContent = 'De intro kon niet automatisch starten. Je kunt hem overslaan.';
          introError.hidden = false;
        });
        syncUiFromState();
        updatePhysics();
        initializeBladePath();
        animate();
      }
    }, undefined, error => {
      if (requestId !== stickModelLoadRequest) return;
      console.error(`Could not load the ${pattern} stick model:`, error);
      modelStatus.textContent = `Pattern ${pattern} kon niet worden geladen. Probeer het later opnieuw.`;
      modelStatus.hidden = false;
      if (!hasStarted) {
        const splashText = document.getElementById('splash-text');
        if (splashText) splashText.textContent = 'Fout bij laden van 3D model.';
      }
    });
  };

  // Reset (between shots): put the puck back in the shooting position, ready for another shot.
  document.getElementById('btnResetAll').addEventListener('click', () => {
    if (game.puckState === 'shot' || game.puckState === 'goal' || game.puckState === 'missed') resetPuck();
  });
  document.getElementById('custBladePattern').addEventListener('change', handleStickModelChange);
  document.getElementById('custHandedness').addEventListener('change', handleStickModelChange);
  document.getElementById('custColor').addEventListener('change', event => {
    updateStickColors(event.target.value);
  });
  document.getElementById('settingSpeedUnit')?.addEventListener('change', () => {
    const unit = gameSettings.speedUnit === 'mph' ? 'MPH' : 'KM/H';
    updateScoreboard({ unit });
  });
  initTrialRankingModal(setupCrossbarChallenge, endTutorial);
  updateScoreboard();
  handleStickModelChange();
});
