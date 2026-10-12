import { appState, state, game } from './state.js';
import { gameSettings, physicsSettings, StickCustomizerState, DEFAULT_STIFFNESS_CURVE, KICKPOINT_STIFFNESS_CURVES } from './config.js';
import { getStickShotModifiers } from './stick-effects.js';
import { getStiffnessAt, refreshStiffnessCurveCache, sortedStiffnessCurve } from './physics.js';
import { camera, renderer, updateGoalSpeedDisplay } from './scene.js';

export function updateUiMode() {
  const splash = document.getElementById('splash-screen');
  const intro = document.getElementById('intro-screen');
  const profile = document.getElementById('player-profile');
  const menu = document.getElementById('main-menu');
  const gameUi = document.getElementById('game-ui');
  const settings = document.getElementById('workbenchPanel');
  const gameSettingsMenu = document.getElementById('game-settings');
  const customizerMenu = document.getElementById('stick-customizer');
  const buildReview = document.getElementById('build-review');
  const btnPlayNow = document.getElementById('btnPlayNow');
  document.body.classList.toggle('customizer-open', appState.mode === 'customizer');
  buildReview.hidden = appState.mode !== 'build-review';

  const targetHud = document.getElementById('target-hud');
  const tutorialHud = document.getElementById('tutorial-hud');
  if (appState.mode !== 'game' && tutorialHud) {
    tutorialHud.style.display = 'none';
  }
  const isSplash = appState.mode === 'splash';
  const isIntro = appState.mode === 'intro';
  const isProfile = appState.mode === 'profile';

  splash.style.opacity = isSplash ? '1' : '0';
  splash.style.pointerEvents = isSplash ? 'auto' : 'none';
  intro.classList.toggle('visible', isIntro);
  profile.classList.toggle('visible', isProfile);

  if (isSplash || isIntro || isProfile) {
    menu.classList.add('hidden');
    gameUi.classList.remove('visible');
    settings.classList.remove('visible');
    gameSettingsMenu.classList.remove('visible');
    customizerMenu.classList.remove('visible');
    if(targetHud) targetHud.style.display = 'none';
  } else {
    if (appState.mode === 'menu') {
      menu.classList.remove('hidden');
      gameUi.classList.remove('visible');
      settings.classList.remove('visible');
      gameSettingsMenu.classList.remove('visible');
      customizerMenu.classList.remove('visible');
      btnPlayNow.textContent = game && game.shots > 0 ? 'Resume Game' : 'Play Now';
      if(targetHud) targetHud.style.display = 'none';
    } else if (appState.mode === 'game') {
      menu.classList.add('hidden');
      gameUi.classList.add('visible');
      settings.classList.remove('visible');
      gameSettingsMenu.classList.remove('visible');
      customizerMenu.classList.remove('visible');
      if(targetHud) {
          targetHud.style.display = game.mode === 'targets' ? 'flex' : 'none';
      }
    } else if (appState.mode === 'build-review') {
      menu.classList.add('hidden');
      gameUi.classList.remove('visible');
      settings.classList.remove('visible');
      gameSettingsMenu.classList.remove('visible');
      customizerMenu.classList.remove('visible');
      if (targetHud) targetHud.style.display = 'none';
    } else if (appState.mode === 'gameSettings') {
      menu.classList.add('hidden');
      gameUi.classList.remove('visible');
      settings.classList.remove('visible');
      gameSettingsMenu.classList.add('visible');
      customizerMenu.classList.remove('visible');
    } else if (appState.mode === 'customizer') {
      menu.classList.add('hidden');
      gameUi.classList.remove('visible');
      settings.classList.remove('visible');
      gameSettingsMenu.classList.remove('visible');
      customizerMenu.classList.add('visible');
    } else if (appState.mode === 'settings') {
      menu.classList.add('hidden');
      gameUi.classList.remove('visible');
      gameSettingsMenu.classList.remove('visible');
      customizerMenu.classList.remove('visible');
      settings.classList.add('visible');
      settings.classList.remove('collapsed');
    }
  }
}

// Editor state
export const stiffnessPlot = { left: 42, right: 12, top: 14, bottom: 24 };
export let draggedStiffnessPoint = -1;

export function analyzeStiffnessProfile() {
  const points = sortedStiffnessCurve;
  const sampleCount = 100;
  const samples = Array.from({ length: sampleCount + 1 }, (_, i) => getStiffnessAt(i / sampleCount));
  const average = points.slice(1).reduce((sum, point, i) =>
    sum + (point.y - points[i].y) * (50 + 75 * (points[i].x + point.x) / 2), 0
  );
  const softThreshold = average - 4;
  const softZones = [];
  let zoneStart = -1;

  for (let i = 0; i <= sampleCount; i++) {
    const isSoft = samples[i] < softThreshold;
    if (isSoft && zoneStart < 0) zoneStart = i;
    if ((!isSoft || i === sampleCount) && zoneStart >= 0) {
      const zoneEnd = isSoft && i === sampleCount ? i : i - 1;
      if (zoneEnd - zoneStart >= 6) {
        softZones.push((zoneStart + zoneEnd) / (2 * sampleCount));
      }
      zoneStart = -1;
    }
  }

  const labels = [
    'Ultra-Low Kick', 'Low-Kick', 'Mid-Low Kick',
    'Mid Kick', 'Amplified Mid Kick', 'High Kick'
  ];
  const detectedKickpoint = softZones.length >= 2
    ? 'Hybrid Kick'
    : (softZones.length === 0 ? 'Neutraal' : labels[Math.min(5, Math.floor((softZones[0] ?? 0.5) * 6))]);
  const isCustom = StickCustomizerState.kickpoint === 'custom';
  const displayKickpoint = isCustom
    ? `Custom Kick (${detectedKickpoint})`
    : (StickCustomizerState.kickpoint === 'neutral' ? 'Neutraal' : detectedKickpoint);
  const flexValue = Math.round(average / 5) * 5;

  const kickpointReadout = document.getElementById('kickpointReadout');
  const flexReadout = document.getElementById('flexReadout');
  if (kickpointReadout) kickpointReadout.textContent = displayKickpoint;
  if (flexReadout) flexReadout.textContent = `Flex ${flexValue}`;

  const advKickpointReadout = document.getElementById('advKickpointReadout');
  const advFlexReadout = document.getElementById('advFlexReadout');
  if (advKickpointReadout) advKickpointReadout.textContent = displayKickpoint;
  if (advFlexReadout) advFlexReadout.textContent = `Flex ${flexValue}`;
}

function renderStiffnessToCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return; // Hidden

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = rect.width;
  const height = rect.height;
  const plotWidth = width - stiffnessPlot.left - stiffnessPlot.right;
  const plotHeight = height - stiffnessPlot.top - stiffnessPlot.bottom;
  const px = x => stiffnessPlot.left + x * plotWidth;
  const py = y => stiffnessPlot.top + (1 - y) * plotHeight;

  ctx.clearRect(0, 0, width, height);
  ctx.font = '10px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.fillStyle = '#888888';
  for (let i = 0; i <= 3; i++) {
    const x = i / 3;
    const y = i / 3;
    const gx = px(x);
    const gy = py(y);
    ctx.beginPath(); ctx.moveTo(gx, stiffnessPlot.top); ctx.lineTo(gx, height - stiffnessPlot.bottom); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(stiffnessPlot.left, gy); ctx.lineTo(width - stiffnessPlot.right, gy); ctx.stroke();
    ctx.fillText(String(Math.round(50 + x * 75)), gx - 10, height - 10);
    ctx.fillText(y.toFixed(2), 3, gy);
  }
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  sortedStiffnessCurve.forEach((point, index) => {
    const x = px(point.x);
    const y = py(point.y);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  state.stiffnessCurve.forEach(point => {
    ctx.beginPath();
    ctx.arc(px(point.x), py(point.y), 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffeb3b';
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

export function drawStiffnessCurve() {
  renderStiffnessToCanvas('stiffnessCurve');
  renderStiffnessToCanvas('advStiffnessCurve');
  analyzeStiffnessProfile();
}

export function applyKickpointPreset(kickpoint) {
  const curve = KICKPOINT_STIFFNESS_CURVES[kickpoint] || KICKPOINT_STIFFNESS_CURVES.mid;
  if (curve) {
    state.stiffnessCurve = curve.map(p => ({ ...p }));
    refreshStiffnessCurveCache();
    drawStiffnessCurve();
  }
}

export function stiffnessPointFromEvent(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const plotWidth = rect.width - stiffnessPlot.left - stiffnessPlot.right;
  const plotHeight = rect.height - stiffnessPlot.top - stiffnessPlot.bottom;
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left - stiffnessPlot.left) / plotWidth)),
    y: Math.max(0, Math.min(1, 1 - (event.clientY - rect.top - stiffnessPlot.top) / plotHeight)),
    px: event.clientX - rect.left,
    py: event.clientY - rect.top
  };
}

const customizerOptionImages = {
  custHandedness: {
    right: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/RH.png?v=1779129285',
    left: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/LH.png?v=1779129285'
  },
  custShaftShape: {
    'micro-concaaf': 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/V3.png?v=1779130379',
    concaaf: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/V.png?v=1779130378',
    pentagon: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Vijfhoekig.png?v=1779130378'
  },
  custShaftSurface: {
    'mat-without-grip': 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Matte_Shaft.png?v=1779279912',
    'mat-with-grip': 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Matte_Shaft.png?v=1779279912',
    'gloss-without-grip': 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Glossy_Shaft.png?v=1779279912',
    'gloss-with-grip': 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Glossy_Shaft.png?v=1779279912',
    'supergloss-with-grip': 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Glossy_Grip_Shaft.png?v=1779279913'
  },
  custShaft3dGrip: {
    'fully-covered': 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/All_over.png?v=1779227836',
    'candy-cane': 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Candy_Cane.png?v=1779227836',
    herringbone: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Fishbone.png?v=1779227836',
    'right-angles': 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Recht.png?v=1779227836',
    'slanted-angles': 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Diagonaal.png?v=1779227836',
    none: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/NoGrip.png?v=1779227836'
  },
  custKickpoint: {
    low: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Lowkplogo.png?v=1790252741',
    hybrid: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Hybridkplogo.png?v=1790252741',
    mid: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Midkplogo.png?v=1790253037'
  },
  custBladePattern: {
    P02: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/P02.png?v=1779127978',
    P08: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/P08.png?v=1779127978',
    P14: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/P14.png?v=1779127978',
    P28: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/P28.png?v=1779127978',
    P28JR: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/P28.png?v=1779127978',
    P28M: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/P28M.png?v=1779127978',
    P77: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/P77.png?v=1779128098',
    P88: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/P88.png?v=1779127978',
    P90TM: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/P90TM.png?v=1779127978',
    P91: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/P91.png?v=1779127978',
    P92: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/P92.png?v=1779127979',
    P92JR: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/P92.png?v=1779127979',
    P92M: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/P92M.png?v=1779127978'
  },
  custBladeTexture: {
    '3d-texture': 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/3D_Blade_Texture.png?v=1779277364',
    sanded: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Sanded_Blade_Texture.png?v=1779277363',
    'matte-no-texture': 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Matte_Blade_Texture.png?v=1779277363',
    'gloss-no-texture': 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Glossy_Blade_Texture.png?v=1779277364'
  },
  custShaftWall: {
    'ultra-thin': 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Ultra_dun.png?v=1791490931',
    'flinter-thin': 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Flinter_dun.png?v=1791490931',
    'very-thin': 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Zeer_dun.png?v=1791490931',
    thin: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Dun.png?v=1791490931',
    regular: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Regulier.png?v=1791490931'
  }
};

function applyCustomOptionImage(element, selectId, value) {
  const imageUrl = customizerOptionImages[selectId]?.[value];
  const isColorSelect = selectId === 'custColor';
  element.style.backgroundImage = isColorSelect || !imageUrl ? 'none' : `url("${imageUrl}")`;
  element.style.backgroundColor = isColorSelect ? 'var(--swatch-color, #fff)' : '#fff';
  element.style.backgroundSize = 'contain';
  element.style.backgroundPosition = 'center';
  element.style.backgroundRepeat = 'no-repeat';
  element.style.borderRadius = isColorSelect ? '50%' : '10px';
  element.style.boxShadow = isColorSelect ? '0 0 0 1px rgba(15, 23, 42, 0.6)' : 'none';
  element.textContent = isColorSelect ? '' : (imageUrl ? '' : (value || '＋'));
}

const customizerHotspotGroups = {
  color: {
    title: 'Stick kleur',
    selects: ['custColor'],
    flex: false
  },
  blade: {
    title: 'Blad',
    selects: ['custBladePattern', 'custHandedness', 'custBladeTexture'],
    flex: false
  },
  kickpoint: {
    title: 'Kickpoint en flex',
    selects: ['custKickpoint'],
    flex: true
  },
  grip: {
    title: 'Shaft grip',
    selects: ['custShaftSurface', 'custShaft3dGrip'],
    flex: false
  },
  'shaft-top': {
    title: 'Shaftvorm en wand',
    selects: ['custShaftShape', 'custShaftWall'],
    flex: false
  }
};

const customizerLabels = {
  custBladePattern: 'Pattern',
  custHandedness: 'Handvoorkeur',
  custBladeTexture: 'Blade Texture',
  custKickpoint: 'Kickpoint',
  custFlex: 'Flex',
  custShaftSurface: 'Shaft Surface Grip',
  custShaft3dGrip: 'Shaft 3D Grip',
  custColor: 'Stick kleur',
  custShaftShape: 'Shaft Shape',
  custShaftWall: 'Shaft Wand'
};

const customizerSelectionValues = [
  'custBladePattern',
  'custHandedness',
  'custBladeTexture',
  'custKickpoint',
  'custFlex',
  'custShaftSurface',
  'custShaft3dGrip',
  'custColor',
  'custShaftShape',
  'custShaftWall'
];

function initCustomizerSwatches() {
  const stage = document.getElementById('customizer-preview-stage');
  const panel = document.getElementById('customizer-hotspot-panel');
  const panelTitle = document.getElementById('customizer-hotspot-title');
  const panelOptions = document.getElementById('customizer-hotspot-options');
  const overview = document.getElementById('customizer-overview');
  const statsPanel = document.getElementById('customizer-stats');
  const flexInput = document.getElementById('custFlex');
  const swipeCard = document.getElementById('customizer-swipe-card');
  const neutralBuild = {
    ...StickCustomizerState,
    bladeCurve: 'P92',
    bladeTexture: 'matte-no-texture',
    shaftSurface: 'mat-without-grip',
    shaftThickness: 2,
    flex: 85,
    kickpoint: 'hybrid'
  };
  const neutralModifiers = getStickShotModifiers(neutralBuild);
  const statDefinitions = [
    { key: 'puckSpeed', label: 'Schotsnelheid' },
    { key: 'accuracy', label: 'Nauwkeurigheid' },
    { key: 'quickness', label: 'Shot-quickness' }
  ];
  const effectSources = [
    { option: 'bladeCurve', selectId: 'custBladePattern' },
    { option: 'shaftSurface', selectId: 'custShaftSurface' },
    { option: 'bladeTexture', selectId: 'custBladeTexture' },
    { option: 'shaftThickness', selectId: 'custShaftWall', getValue: () => StickCustomizerState.shaftThickness }
  ];
  let currentRandomOption = null;
  let swipeStartX = null;
  let swipeInProgress = false;

  function getFlexAgeCategories(value = Number(flexInput.value)) {
    return [
      ...(value >= 20 && value <= 50 ? ['JR'] : []),
      ...(value >= 35 && value <= 65 ? ['INT'] : []),
      ...(value >= 65 && value <= 125 ? ['SR'] : [])
    ];
  }

  function isCustomizerOptionAllowed(selectId, value) {
    if (StickCustomizerState.ageCategory === 'JR') {
      if (selectId === 'custBladePattern' && !['P28JR', 'P92JR'].includes(value)) return false;
      if (selectId === 'custKickpoint' && value !== 'low') return false;
    }
    return true;
  }

  function syncFlexAgeCategory() {
    StickCustomizerState.flex = flexInput.value;
    const categories = getFlexAgeCategories();
    if (!categories.includes(StickCustomizerState.ageCategory)) {
      StickCustomizerState.ageCategory = categories[0];
    }
    if (categories.length === 1) StickCustomizerState.ageCategory = categories[0];

    if (StickCustomizerState.ageCategory === 'JR') {
      const pattern = document.getElementById('custBladePattern');
      if (!['P28JR', 'P92JR'].includes(pattern.value)) {
        pattern.value = 'P28JR';
        pattern.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const kickpoint = document.getElementById('custKickpoint');
      if (kickpoint.value !== 'low') {
        kickpoint.value = 'low';
        kickpoint.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  function createStatBar(label, multiplier, detail = null) {
    const row = document.createElement('div');
    row.className = detail ? 'customizer-stat-row customizer-stat-row-detail' : 'customizer-stat-row';
    const heading = document.createElement('div');
    heading.className = 'customizer-stat-heading';
    const name = document.createElement('span');
    name.textContent = label;
    const value = document.createElement('strong');
    const percent = (multiplier - 1) * 100;
    value.textContent = detail
      ? `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`
      : `${(multiplier * 100).toFixed(1)}%`;
    heading.append(name, value);

    const track = document.createElement('div');
    track.className = 'customizer-stat-track';
    track.setAttribute('role', 'img');
    track.setAttribute('aria-label', `${label}: ${value.textContent}`);
    const fill = document.createElement('span');
    fill.className = 'customizer-stat-fill';
    fill.style.width = `${Math.max(0, Math.min(100, ((multiplier - 0.6) / 0.9) * 100))}%`;
    const neutralMarker = document.createElement('span');
    neutralMarker.className = 'customizer-stat-neutral';
    track.append(fill, neutralMarker);
    row.append(heading, track);
    return row;
  }

  function renderCustomizerStats() {
    const totals = getStickShotModifiers(StickCustomizerState);
    const totalSection = document.createElement('section');
    totalSection.className = 'customizer-stats-group';
    const totalHeading = document.createElement('h3');
    totalHeading.textContent = 'Totale build';
    totalSection.appendChild(totalHeading);
    for (const stat of statDefinitions) {
      totalSection.appendChild(createStatBar(stat.label, totals[stat.key]));
    }

    const effectsSection = document.createElement('section');
    effectsSection.className = 'customizer-stats-group';
    const effectsHeading = document.createElement('h3');
    effectsHeading.textContent = 'Effect per onderdeel';
    effectsSection.appendChild(effectsHeading);
    for (const source of effectSources) {
      const value = source.getValue?.() ?? StickCustomizerState[source.option];
      const selectedModifiers = getStickShotModifiers({
        ...neutralBuild,
        [source.option]: value
      });
      const effects = statDefinitions
        .map(stat => ({
          label: stat.label,
          multiplier: selectedModifiers[stat.key] / neutralModifiers[stat.key]
        }))
        .filter(effect => Math.abs(effect.multiplier - 1) > 0.0001);
      if (!effects.length) continue;

      const sourceSection = document.createElement('section');
      sourceSection.className = 'customizer-stat-source';
      const title = document.createElement('h4');
      title.textContent = customizerLabels[source.selectId];
      const selectedValue = document.getElementById(source.selectId)?.selectedOptions[0]?.textContent ?? '';
      const selected = document.createElement('span');
      selected.className = 'customizer-stat-selection';
      selected.textContent = selectedValue;
      sourceSection.append(title, selected);
      for (const effect of effects) {
        sourceSection.appendChild(createStatBar(effect.label, effect.multiplier, true));
      }
      effectsSection.appendChild(sourceSection);
    }
    statsPanel.replaceChildren(totalSection, effectsSection);
  }

  function createOptionImage(selectId, value, className) {
    const image = document.createElement('span');
    image.className = className;
    image.setAttribute('aria-hidden', 'true');
    if (selectId === 'custColor') image.style.setProperty('--swatch-color', value);
    applyCustomOptionImage(image, selectId, value);
    return image;
  }

  function renderCustomizerOverview() {
    overview.replaceChildren();
    for (const [groupName, group] of Object.entries(customizerHotspotGroups)) {
      const section = document.createElement('section');
      section.className = 'customizer-overview-group';
      const heading = document.createElement('div');
      heading.className = 'customizer-overview-heading';
      const title = document.createElement('h3');
      title.textContent = group.title;
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'customizer-overview-edit';
      edit.textContent = 'Aanpassen';
      edit.addEventListener('click', () => openCustomizerCategory(groupName));
      heading.append(title, edit);
      const values = document.createElement('div');
      values.className = 'customizer-overview-values';
      for (const selectId of group.selects) {
        const row = document.createElement('div');
        row.className = 'customizer-overview-value';
        const label = document.createElement('span');
        label.textContent = customizerLabels[selectId];
        const selected = document.createElement('strong');
        selected.textContent = document.getElementById(selectId)?.selectedOptions[0]?.textContent ?? '';
        row.append(label, selected);
        values.appendChild(row);
      }
      if (group.flex) {
        const row = document.createElement('div');
        row.className = 'customizer-overview-value';
        const label = document.createElement('span');
        label.textContent = 'Flex';
        const selected = document.createElement('strong');
        selected.textContent = `${flexInput.value} flex`;
        row.append(label, selected);
        values.appendChild(row);
      }
      section.append(heading, values);
      overview.appendChild(section);
    }
    renderCustomizerStats();
  }

  function renderBuildReview() {
    const summary = document.getElementById('build-summary-options');
    const values = Object.fromEntries(customizerSelectionValues.map(selectId => {
      const select = document.getElementById(selectId);
      return [selectId, selectId === 'custFlex' ? flexInput.value : select.value];
    }));
    const encodedValues = btoa(JSON.stringify(values))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    document.getElementById('build-summary-code').textContent = `KP1-${encodedValues}`;

    summary.replaceChildren();
    for (const [groupName, group] of Object.entries(customizerHotspotGroups)) {
      const section = document.createElement('section');
      section.className = 'build-summary-group';
      const heading = document.createElement('div');
      heading.className = 'build-summary-heading';
      const title = document.createElement('h2');
      title.textContent = group.title;
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'customizer-overview-edit';
      edit.dataset.editCategory = groupName;
      edit.textContent = 'Aanpassen';
      heading.append(title, edit);

      const list = document.createElement('dl');
      for (const selectId of group.selects) {
        const row = document.createElement('div');
        row.className = 'build-summary-row';
        const label = document.createElement('dt');
        label.textContent = customizerLabels[selectId];
        const selected = document.createElement('dd');
        selected.textContent = document.getElementById(selectId)?.selectedOptions[0]?.textContent ?? '';
        if (selectId === 'custColor') {
          const swatch = document.createElement('span');
          swatch.className = 'build-summary-color';
          swatch.style.backgroundColor = values.custColor;
          swatch.setAttribute('aria-hidden', 'true');
          selected.prepend(swatch);
        }
        row.append(label, selected);
        list.appendChild(row);
      }
      if (group.flex) {
        const row = document.createElement('div');
        row.className = 'build-summary-row';
        const label = document.createElement('dt');
        label.textContent = 'Flex';
        const selected = document.createElement('dd');
        selected.textContent = `${flexInput.value} flex`;
        row.append(label, selected);
        list.appendChild(row);
      }
      section.append(heading, list);
      summary.appendChild(section);
    }
  }

  function makeSelectOptions(selectId) {
    const select = document.getElementById(selectId);
    const field = document.createElement('section');
    field.className = 'customizer-hotspot-field';
    const title = document.createElement('h3');
    title.textContent = customizerLabels[selectId];
    field.appendChild(title);
    const choices = document.createElement('div');
    choices.className = 'customizer-hotspot-choices';
    field.dataset.selectId = selectId;
    for (const option of select.options) {
      if (!isCustomizerOptionAllowed(selectId, option.value)) continue;
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.className = 'customizer-hotspot-choice';
      choice.dataset.value = option.value;
      choice.setAttribute('aria-pressed', String(option.value === select.value));
      choice.append(
        createOptionImage(selectId, option.value, 'customizer-choice-image'),
        document.createTextNode(option.textContent)
      );
      choice.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      choices.appendChild(choice);
    }
    field.appendChild(choices);
    return field;
  }

  function renderHotspotPanel(groupName) {
    const group = customizerHotspotGroups[groupName];
    panelTitle.textContent = group.title;
    panelOptions.replaceChildren(...group.selects.map(makeSelectOptions));
    if (group.flex) {
      const flexField = document.createElement('section');
      flexField.className = 'customizer-hotspot-field customizer-flex-field';
      const label = document.createElement('h3');
      label.textContent = 'Flex';
      const carousel = document.createElement('div');
      carousel.className = 'customizer-flex-carousel';
      carousel.setAttribute('aria-label', 'Kies flex');
      const currentFlex = Number(flexInput.value);
      const step = Number(flexInput.step) || 1;
      const previous = document.createElement('button');
      previous.type = 'button';
      previous.className = 'customizer-flex-carousel-arrow';
      previous.textContent = `‹ ${currentFlex - step}`;
      previous.disabled = currentFlex <= Number(flexInput.min);
      previous.setAttribute('aria-label', `Flex ${currentFlex - step}`);
      previous.addEventListener('click', () => changeFlex(currentFlex - step));
      const output = document.createElement('output');
      output.className = 'customizer-flex-current';
      output.setAttribute('aria-live', 'polite');
      output.textContent = `${currentFlex} flex`;
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'customizer-flex-carousel-arrow';
      next.textContent = `${currentFlex + step} ›`;
      next.disabled = currentFlex >= Number(flexInput.max);
      next.setAttribute('aria-label', `Flex ${currentFlex + step}`);
      next.addEventListener('click', () => changeFlex(currentFlex + step));
      carousel.append(previous, output, next);
      flexField.append(label, carousel);

      const categories = getFlexAgeCategories(currentFlex);
      const selectedCategory = StickCustomizerState.ageCategory;
      const categoryLabel = document.createElement('p');
      categoryLabel.className = 'customizer-flex-category-label';
      categoryLabel.textContent = categories.length > 1
        ? 'Kies leeftijdscategorie'
        : 'Leeftijdscategorie';
      flexField.appendChild(categoryLabel);
      const categoryOptions = document.createElement('div');
      categoryOptions.className = 'customizer-flex-categories';
      for (const category of categories) {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'customizer-flex-category';
        option.textContent = category;
        option.setAttribute('aria-pressed', String(category === selectedCategory));
        option.addEventListener('click', () => {
          StickCustomizerState.ageCategory = category;
          syncFlexAgeCategory();
          renderCustomizerOverview();
          renderHotspotPanel('kickpoint');
          if (!swipeInProgress) showRandomOption();
        });
        categoryOptions.appendChild(option);
      }
      flexField.appendChild(categoryOptions);
      panelOptions.appendChild(flexField);
    }
    panel.hidden = false;
    overview.hidden = true;
    statsPanel.hidden = true;
    document.getElementById('customizer-prebuilds').hidden = true;
    document.getElementById('customizer-info').hidden = true;
    stage.dataset.zoom = groupName;
    document.querySelectorAll('.customizer-category-tab').forEach(button => {
      const active = button.dataset.tab === 'overview';
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    panelTitle.textContent = group.title;
    document.getElementById('stick-customizer').classList.remove('options-collapsed');
  }

  function openCustomizerCategory(groupName) {
    if (customizerHotspotGroups[groupName]) renderHotspotPanel(groupName);
  }

  function changeFlex(value) {
    const min = Number(flexInput.min);
    const max = Number(flexInput.max);
    flexInput.value = String(Math.max(min, Math.min(max, value)));
    flexInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function closeHotspotPanel() {
    panel.hidden = true;
    overview.hidden = false;
    statsPanel.hidden = true;
    document.getElementById('customizer-prebuilds').hidden = true;
    document.getElementById('customizer-info').hidden = true;
    panelTitle.textContent = 'Alle keuzes';
    stage.dataset.zoom = 'overview';
    document.querySelectorAll('.customizer-category-tab').forEach(button => {
      const active = button.dataset.tab === 'overview';
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function showCustomizerTab(tab) {
    panel.hidden = true;
    overview.hidden = tab !== 'overview';
    statsPanel.hidden = tab !== 'stats';
    document.getElementById('customizer-prebuilds').hidden = tab !== 'prebuilds';
    document.getElementById('customizer-info').hidden = tab !== 'info';
    stage.dataset.zoom = 'overview';
    const titles = {
      overview: 'Alle keuzes',
      prebuilds: 'Pre-builds',
      stats: 'Stats',
      info: 'Info'
    };
    panelTitle.textContent = titles[tab];
    document.querySelectorAll('.customizer-category-tab').forEach(button => {
      const active = button.dataset.tab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function refreshHotspotChoices() {
    panelOptions.querySelectorAll('.customizer-hotspot-choice').forEach(choice => {
      const selectId = choice.closest('.customizer-hotspot-field')?.dataset.selectId;
      const targetSelect = selectId ? document.getElementById(selectId) : null;
      const selected = targetSelect?.value === choice.dataset.value;
      choice.classList.toggle('selected', Boolean(selected));
      choice.setAttribute('aria-pressed', String(Boolean(selected)));
    });
  }

  document.querySelectorAll('.customizer-category-tab').forEach(button => {
    button.addEventListener('click', () => {
      if (button.dataset.tab === 'overview') closeHotspotPanel();
      else showCustomizerTab(button.dataset.tab);
    });
  });
  document.getElementById('customizer-collapse').addEventListener('click', event => {
    const collapsed = document.getElementById('stick-customizer').classList.toggle('options-collapsed');
    event.currentTarget.setAttribute('aria-expanded', String(!collapsed));
    event.currentTarget.setAttribute('aria-label', collapsed ? 'Opties uitklappen' : 'Opties inklappen');
  });

  for (const selectId of Object.values(customizerHotspotGroups).flatMap(group => group.selects)) {
    const select = document.getElementById(selectId);
    select.addEventListener('change', () => {
      if (selectId === 'custColor') stage.style.setProperty('--stick-color', select.value);
      renderCustomizerOverview();
      refreshHotspotChoices();
      if (!swipeInProgress) showRandomOption();
    });
  }
  flexInput.addEventListener('input', () => {
    syncFlexAgeCategory();
    renderCustomizerOverview();
    if (!panel.hidden && panelTitle.textContent === customizerHotspotGroups.kickpoint.title) {
      renderHotspotPanel('kickpoint');
    }
    if (!swipeInProgress) showRandomOption();
  });
  document.getElementById('btnCustomizerBack').addEventListener('click', () => {
    renderBuildReview();
    appState.mode = 'build-review';
    updateUiMode();
  });
  document.getElementById('build-summary-options').addEventListener('click', event => {
    const editButton = event.target.closest('[data-edit-category]');
    if (!editButton) return;
    appState.mode = 'customizer';
    updateUiMode();
    openCustomizerCategory(editButton.dataset.editCategory);
  });
  document.getElementById('btnOrderCustomStick').addEventListener('click', event => {
    const orderUrl = event.currentTarget.dataset.orderUrl.trim();
    if (orderUrl) {
      window.location.assign(orderUrl);
      return;
    }
    document.getElementById('build-order-status').hidden = false;
  });
  document.getElementById('btnTestCustomStick').addEventListener('click', () => {
    game.mode = 'free';
    appState.mode = 'game';
    updateUiMode();
  });
  syncFlexAgeCategory();
  stage.style.setProperty('--stick-color', document.getElementById('custColor').value);
  renderCustomizerOverview();

  function showRandomOption() {
    const candidates = Object.values(customizerHotspotGroups)
      .flatMap(group => group.selects)
      .flatMap(selectId => {
        const select = document.getElementById(selectId);
        return [...select.options]
          .filter(option => option.value !== select.value && isCustomizerOptionAllowed(selectId, option.value))
          .map(option => ({ selectId, value: option.value, label: option.textContent }));
      });
    const flexStep = Number(flexInput.step) || 1;
    for (let value = Number(flexInput.min); value <= Number(flexInput.max); value += flexStep) {
      if (value !== Number(flexInput.value)) {
        candidates.push({ selectId: 'custFlex', value: String(value), label: `${value} flex` });
      }
    }
    currentRandomOption = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
    if (!currentRandomOption) {
      document.getElementById('customizer-swipe-deck').hidden = true;
      return;
    }
    const title = customizerLabels[currentRandomOption.selectId];
    document.getElementById('customizer-swipe-category').textContent = title;
    document.getElementById('customizer-swipe-value').textContent = currentRandomOption.label;
    const image = document.getElementById('customizer-swipe-image');
    image.replaceChildren(createOptionImage(currentRandomOption.selectId, currentRandomOption.value, 'customizer-choice-image'));
    swipeCard.classList.remove('swipe-left', 'swipe-right');
  }

  function finishSwipe(accept) {
    if (swipeInProgress || !currentRandomOption) return;
    swipeInProgress = true;
    swipeCard.classList.add(accept ? 'swipe-right' : 'swipe-left');
    window.setTimeout(() => {
      if (accept) {
        if (currentRandomOption.selectId === 'custFlex') {
          flexInput.value = currentRandomOption.value;
          flexInput.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          const select = document.getElementById(currentRandomOption.selectId);
          select.value = currentRandomOption.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      swipeInProgress = false;
      showRandomOption();
    }, 180);
  }

  document.getElementById('customizer-swipe-accept').addEventListener('click', () => finishSwipe(true));
  document.getElementById('customizer-swipe-reject').addEventListener('click', () => finishSwipe(false));
  swipeCard.addEventListener('pointerdown', event => {
    if (event.target.closest('button')) return;
    swipeStartX = event.clientX;
    swipeCard.setPointerCapture(event.pointerId);
  });
  swipeCard.addEventListener('pointerup', event => {
    if (swipeStartX === null) return;
    const distance = event.clientX - swipeStartX;
    swipeStartX = null;
    if (Math.abs(distance) >= 70) finishSwipe(distance > 0);
  });
  swipeCard.addEventListener('pointercancel', () => { swipeStartX = null; });
  showRandomOption();
}

function syncCustomizerControlsFromState() {
  const selectValues = {
    custHandedness: StickCustomizerState.handedness,
    custColor: StickCustomizerState.color,
    custBladePattern: StickCustomizerState.bladeCurve,
    custShaftShape: StickCustomizerState.shaftShape,
    custShaftSurface: StickCustomizerState.shaftSurface,
    custShaft3dGrip: StickCustomizerState.shaft3dGrip,
    custKickpoint: StickCustomizerState.kickpoint,
    custBladeTexture: StickCustomizerState.bladeTexture,
    custShaftWall: StickCustomizerState.shaftWall
  };
  for (const [id, value] of Object.entries(selectValues)) {
    const select = document.getElementById(id);
    if (select) select.value = value;
  }
  document.getElementById('custFlex').value = StickCustomizerState.flex;
  document.getElementById('custFlexValue').textContent = StickCustomizerState.flex;
  syncAdvancedSettingsUi();
}

export function syncAdvancedSettingsUi() {
  const setRangeVal = (idInput, idOutput, val, suffix = '', factor = 1, decimals = 0) => {
    const el = document.getElementById(idInput);
    const out = document.getElementById(idOutput);
    if (el && val !== undefined && val !== null) el.value = val;
    if (out && val !== undefined && val !== null) {
      const displayVal = (Number(val) * factor).toLocaleString('nl-NL', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: false
      });
      out.textContent = `${displayVal}${suffix}`;
    }
  };

  // Group 1: Shaft & Fulcrum Mechanics
  setRangeVal('advBottomGlovePos', 'advBottomGlovePosVal', state.bottomGlovePos, '%');
  setRangeVal('advBottomGloveAmp', 'advBottomGloveAmpVal', state.bottomGloveAmp, '%');
  setRangeVal('advBottomGloveTimeframe', 'advBottomGloveTimeframeVal', state.bottomGloveTimeframe ?? 250, ' ms');
  setRangeVal('advTopHandAmp', 'advTopHandAmpVal', state.topHandAmp, '%');
  setRangeVal('advTopHandTimeframe', 'advTopHandTimeframeVal', state.topHandTimeframe ?? 250, ' ms');
  setRangeVal('advMaxBend', 'advMaxBendVal', state.maxBendAngle, '°');
  const advBendAxis = document.getElementById('advBendAxis');
  if (advBendAxis && state.bendAxis) advBendAxis.value = state.bendAxis;
  const advAnchorMode = document.getElementById('advAnchorMode');
  if (advAnchorMode && state.anchorMode) advAnchorMode.value = state.anchorMode;
  setRangeVal('advStickLength', 'advStickLengthVal', physicsSettings?.stickLength ?? 1400, ' mm');
  setRangeVal('advHandleStiffness', 'advHandleStiffnessVal', physicsSettings?.handleStiffness ?? 1.5, '×', 1, 1);
  setRangeVal('advHoselStiffness', 'advHoselStiffnessVal', physicsSettings?.hoselStiffness ?? 0.8, '×', 1, 1);

  // Group 2: Flex & Kickpoint Properties
  const advKickpoint = document.getElementById('advKickpoint');
  if (advKickpoint && StickCustomizerState.kickpoint) advKickpoint.value = StickCustomizerState.kickpoint;
  setRangeVal('advFlex', 'advFlexVal', StickCustomizerState.flex, '');
  setRangeVal('advKickpointEffect', 'advKickpointEffectVal', Math.round((gameSettings.kickpointEffect ?? 1) * 100), '%');

  // Group 3: Release Dynamics, Recoil & Vibration
  setRangeVal('advTopPullStart', 'advTopPullStartVal', state.topHandPullStartMs ?? 600, ' ms');
  setRangeVal('advTopPullDown', 'advTopPullDownVal', state.topHandPullDownMm ?? 100, ' mm');
  setRangeVal('advFollowAngle', 'advFollowAngleVal', state.followThroughAngle ?? 50, '°');
  setRangeVal('advBladeWhip', 'advBladeWhipVal', state.bladeWhipStrength ?? 100, '%');
  setRangeVal('advReleaseSpeed', 'advReleaseSpeedVal', Math.round((physicsSettings?.releaseSpeedMultiplier ?? 1.0) * 100), '%');
  setRangeVal('advReleaseDuration', 'advReleaseDurationVal', physicsSettings?.releaseDuration ?? 400, ' ms');
  setRangeVal('advRecoilDamping', 'advRecoilDampingVal', physicsSettings?.recoilDamping ?? 2.2, '', 1, 1);
  setRangeVal('advRecoilFrequency', 'advRecoilFrequencyVal', physicsSettings?.recoilFrequency ?? 2.2, '', 1, 1);
  setRangeVal('advMaxSwingAngleDeg', 'advMaxSwingAngleDegVal', physicsSettings?.maxSwingAngleDeg ?? 78, '°');

  // Group 4: Puck Contact, Launch & Flight Physics
  setRangeVal('advBaseShotSpeed', 'advBaseShotSpeedVal', physicsSettings?.baseShotSpeed ?? 5000, ' mm/s');
  setRangeVal('advWhipBonusSpeed', 'advWhipBonusSpeedVal', physicsSettings?.whipBonusSpeed ?? 7000, ' mm/s');
  setRangeVal('advPuckDwellTime', 'advPuckDwellTimeVal', physicsSettings?.puckDwellTime ?? 180, ' ms');
  setRangeVal('advBladeClearance', 'advBladeClearanceVal', physicsSettings?.bladeClearance ?? 54, ' mm');
  setRangeVal('advBladeCatchDistance', 'advBladeCatchDistanceVal', physicsSettings?.bladeCatchDistance ?? 250, ' mm');
  setRangeVal('advBladeDecelThreshold', 'advBladeDecelThresholdVal', physicsSettings?.bladeDecelThreshold ?? 300, ' mm/s');
  setRangeVal('advReleaseSafetyLimit', 'advReleaseSafetyLimitVal', physicsSettings?.releaseSafetyLimit ?? 420, ' ms');
  setRangeVal('advPuckWobbleFactor', 'advPuckWobbleFactorVal', physicsSettings?.puckWobbleFactor ?? 1.0, '×', 1, 1);
  setRangeVal('advGravityValue', 'advGravityValueVal', physicsSettings?.gravityValue ?? 9810, ' mm/s²');

  // Group 5: Shot Velocity, Aim & Swipe Mechanics
  setRangeVal('advShotSpeed', 'advShotSpeedVal', Math.round((gameSettings.shotSpeed ?? 1.9) * 100), '%');
  setRangeVal('advSwipeRange', 'advSwipeRangeVal', Math.round((gameSettings.swipeRange ?? 1) * 100), '%');
  setRangeVal('advMinSwipeSpeed', 'advMinSwipeSpeedVal', gameSettings.minSwipeSpeed ?? 0.3, ' px/ms', 1, 1);
  setRangeVal('advMinSwipeDistance', 'advMinSwipeDistanceVal', physicsSettings?.minSwipeDistance ?? 100, ' px');
  setRangeVal('advSwipePowerMultiplier', 'advSwipePowerMultiplierVal', physicsSettings?.swipePowerMultiplier ?? 52, '');
  setRangeVal('advAimSensitivity', 'advAimSensitivityVal', physicsSettings?.aimSensitivity ?? 1.5, '×', 1, 1);
  setRangeVal('advPrecisionTolerance', 'advPrecisionToleranceVal', gameSettings.precisionTolerance ?? 12, ' px');
  setRangeVal('advDeviationPenalty', 'advDeviationPenaltyVal', Math.round((gameSettings.deviationPenalty ?? 1) * 100), '%');

  // Group 6: Blade Profile, Construction & Modifiers
  const selectSyncMap = {
    advBladeCurve: StickCustomizerState.bladeCurve,
    advBladeTexture: StickCustomizerState.bladeTexture,
    advShaftWall: StickCustomizerState.shaftWall,
    advShaftSurface: StickCustomizerState.shaftSurface,
    advShaft3dGrip: StickCustomizerState.shaft3dGrip,
    advShaftShape: StickCustomizerState.shaftShape,
    advAgeCategory: StickCustomizerState.ageCategory,
    advHandedness: StickCustomizerState.handedness
  };
  for (const [id, val] of Object.entries(selectSyncMap)) {
    const el = document.getElementById(id);
    if (el && val) el.value = val;
  }
  setRangeVal('advShaftThickness', 'advShaftThicknessVal', StickCustomizerState.shaftThickness ?? 2.0, ' mm', 1, 1);

  const chkShaftGrip = document.getElementById('advShaftGrip');
  if (chkShaftGrip) chkShaftGrip.checked = Boolean(StickCustomizerState.shaftGrip);
  const chkBladeGrip = document.getElementById('advBladeGrip');
  if (chkBladeGrip) chkBladeGrip.checked = Boolean(StickCustomizerState.bladeGrip);
  const chkStickTape = document.getElementById('advStickTape');
  if (chkStickTape) chkStickTape.checked = Boolean(StickCustomizerState.stickTape);

  // Compute live stick shot modifiers and update stat badges
  const mods = getStickShotModifiers(StickCustomizerState);
  const statWeight = document.getElementById('advStatWeight');
  if (statWeight) statWeight.textContent = `${Math.round(mods.stickWeight)} g`;
  const statPuckSpeed = document.getElementById('advStatPuckSpeed');
  if (statPuckSpeed) statPuckSpeed.textContent = `${Math.round(mods.puckSpeed * 100)}%`;
  const statQuickness = document.getElementById('advStatQuickness');
  if (statQuickness) statQuickness.textContent = `${Math.round(mods.quickness * 100)}%`;
  const statAccuracy = document.getElementById('advStatAccuracy');
  if (statAccuracy) statAccuracy.textContent = `${Math.round(mods.accuracy * 100)}%`;
  const statTendency = document.getElementById('advStatTendency');
  if (statTendency) statTendency.textContent = `${mods.shotTendencyY >= 0 ? '+' : ''}${(mods.shotTendencyY * 100).toFixed(1)}%`;

  // Group 7: Timeline & Simulation Preview
  const advTimeline = document.getElementById('advTimeline');
  const advTimelineVal = document.getElementById('advTimelineVal');
  if (advTimeline) advTimeline.value = state.timeline;
  if (advTimelineVal) advTimelineVal.textContent = `${state.timeline} ms`;
  setRangeVal('advAnimPlaybackSpeed', 'advAnimPlaybackSpeedVal', Math.round((physicsSettings?.animPlaybackMultiplier ?? 1.0) * 100), '%');
  const btnAdvHold = document.getElementById('btnAdvHoldMax');
  if (btnAdvHold) {
    btnAdvHold.classList.toggle('active', Boolean(state.holdMaxBend));
    btnAdvHold.textContent = state.holdMaxBend ? '✓ Vasthouden (600 ms)' : 'Dynamische Schotcyclus';
  }
  const btnAdvPlay = document.getElementById('btnAdvPlay');
  if (btnAdvPlay) {
    btnAdvPlay.textContent = state.isPlaying ? '❚❚ Pauze' : '▶ Play';
  }
  document.querySelectorAll('.adv-btn-jump').forEach(btn => {
    const t = parseInt(btn.getAttribute('data-time'), 10);
    btn.classList.toggle('active', t === state.timeline && !state.holdMaxBend);
  });
}

export function syncUiFromState() {
  function sync(idSlider, idNum, val) {
    const sl = document.getElementById(idSlider);
    const num = document.getElementById(idNum);
    if (sl) sl.value = val;
    if (num) num.value = val;
  }
  sync('slBottomGlovePos', 'numBottomGlovePos', state.bottomGlovePos);
  sync('slBottomGloveAmp', 'numBottomGloveAmp', state.bottomGloveAmp);
  sync('slTopHandAmp', 'numTopHandAmp', state.topHandAmp);
  sync('slMaxBend', 'numMaxBend', state.maxBendAngle);
  sync('slTopPullStart', 'numTopPullStart', state.topHandPullStartMs ?? 500);
  sync('slTopPullDown', 'numTopPullDown', state.topHandPullDownMm ?? 85);
  sync('slFollowAngle', 'numFollowAngle', state.followThroughAngle ?? 50);
  sync('slBladeWhip', 'numBladeWhip', state.bladeWhipStrength ?? 100);

  const slTimeline = document.getElementById('slTimeline');
  const lblTimeline = document.getElementById('lblTimeline');
  if (slTimeline) slTimeline.value = state.timeline;
  if (lblTimeline) lblTimeline.textContent = state.timeline + ' ms';

  const btnHold = document.getElementById('btnHoldMax');
  if (btnHold) {
    if (state.holdMaxBend) {
      btnHold.classList.add('active');
      btnHold.textContent = '✓ Vasthouden (600 ms)';
    } else {
      btnHold.classList.remove('active');
      btnHold.textContent = 'Dynamische Schotcyclus';
    }
  }

  document.querySelectorAll('.btn-jump').forEach(btn => {
    const t = parseInt(btn.getAttribute('data-time'));
    if (t === state.timeline && !state.holdMaxBend) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  syncAdvancedSettingsUi();
}

export function initUiBindings(updatePhysics) {
    const profileStorageKey = 'kickpoint-player-profile';
    const profileForm = document.getElementById('player-profile-form');
    const profileStatus = document.getElementById('profile-status');
    const profileName = document.getElementById('player-name');
    const profileJersey = document.getElementById('player-jersey');
    const profileStick = document.getElementById('player-stick');
    let profileSaveFailed = false;

    try {
      const savedProfile = localStorage.getItem(profileStorageKey);
      if (savedProfile) {
        const profile = JSON.parse(savedProfile);
        profileName.value = typeof profile.name === 'string' ? profile.name : '';
        profileJersey.value = typeof profile.jerseyNumber === 'string' ? profile.jerseyNumber : '';
        profileStick.value = typeof profile.stick === 'string' ? profile.stick : '';
        if (profile.handedness === 'left' || profile.handedness === 'right') {
          document.querySelector(`input[name="handedness"][value="${profile.handedness}"]`).checked = true;
          StickCustomizerState.handedness = profile.handedness;
        }
      }
    } catch (error) {
      console.error('Could not load the saved player profile:', error);
      profileStatus.textContent = 'Je opgeslagen profiel kon niet worden geladen. Je kunt hieronder een nieuw profiel invullen.';
      profileStatus.hidden = false;
    }
    profileName.addEventListener('input', () => profileName.setCustomValidity(''));

    const showTutorial = async () => {
      document.getElementById('intro-video').pause();
      const { startTutorial } = await import('./tutorial.js');
      appState.mode = 'game'; // Tutorial runs in game mode
      updateUiMode();
      startTutorial();
    };
    document.getElementById('btnSkipIntro').addEventListener('click', showTutorial);
    document.getElementById('intro-video').addEventListener('ended', showTutorial);
    document.getElementById('intro-video').addEventListener('error', () => {
      document.getElementById('intro-error').hidden = false;
    });
    document.getElementById('btnEditProfile').addEventListener('click', () => {
      document.getElementById('profile-title').textContent = 'Spelersprofiel aanpassen';
      appState.mode = 'profile';
      updateUiMode();
    });
    profileForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const handedness = profileForm.elements.handedness.value;
      const playerProfile = {
        name: profileName.value.trim(),
        jerseyNumber: profileJersey.value,
        stick: profileStick.value.trim(),
        handedness
      };
      if (!playerProfile.name) {
        profileName.setCustomValidity('Vul een gamertag in.');
        profileName.reportValidity();
        return;
      }
      profileName.setCustomValidity('');
      profileStatus.hidden = true;
      try {
        localStorage.setItem(profileStorageKey, JSON.stringify(playerProfile));
        profileSaveFailed = false;
      } catch (error) {
        console.error('Could not save the player profile:', error);
        profileStatus.textContent = 'Je profiel kon niet op dit apparaat worden opgeslagen.';
        profileStatus.hidden = false;
        profileSaveFailed = true;
      }
      StickCustomizerState.handedness = handedness;
      const handednessSelect = document.getElementById('custHandedness');
      handednessSelect.value = handedness;
      handednessSelect.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('menu-player-name').textContent = profileSaveFailed
        ? `Welkom, ${playerProfile.name} · profiel niet opgeslagen`
        : `Welkom, ${playerProfile.name}`;
      appState.mode = 'menu';
      updateUiMode();
    });

    // Basic navigation
    document.getElementById('btnPlayNow').addEventListener('click', () => {
        game.mode = 'free';
        appState.mode = 'game';
        updateUiMode();
    });

    document.getElementById('btnRandomSpawn').addEventListener('click', () => {
        game.mode = 'randomSpawn';
        appState.mode = 'game';
        updateUiMode();
        // The resetPuck logic in main.js will detect this mode and spawn semi-randomly.
        if (typeof window.triggerPuckReset === 'function') window.triggerPuckReset();
    });

    document.getElementById('btnTargetPractice').addEventListener('click', () => {
        game.mode = 'targets';

        // Let main loop handle spawning targets if mode is changed to targets.
        // It will need an explicit initialization sequence.
        game.targetStartTime = performance.now();
        game.targetTimeElapsed = 0;
        document.getElementById('target-count').textContent = '4';
        document.getElementById('target-time').textContent = '0.00';

        // Dispatch an event to main.js so it knows to spawn targets
        window.dispatchEvent(new Event('startTargetPractice'));

        appState.mode = 'game';
        updateUiMode();
    });

    document.getElementById('btnSettings').addEventListener('click', () => {
        appState.mode = 'gameSettings';
        updateUiMode();
        syncAdvancedSettingsUi();
    });
    document.getElementById('btnCustomizer').addEventListener('click', () => { appState.mode = 'customizer'; updateUiMode(); });
    document.getElementById('btnSettingsPlay').addEventListener('click', () => { appState.mode = 'game'; updateUiMode(); });
    document.getElementById('btnPhysicsSettings').addEventListener('click', () => {
        appState.mode = 'settings';
        updateUiMode();
        setTimeout(drawStiffnessCurve, 50); // Redraw after panel shows
    });
    document.getElementById('btnGameSettingsBack').addEventListener('click', () => { appState.mode = 'menu'; updateUiMode(); });
    document.getElementById('btnMenu').addEventListener('click', () => { appState.mode = 'menu'; updateUiMode(); });
    const btnHints = document.getElementById('btnHints');
    if (btnHints) {
        btnHints.addEventListener('click', () => {
            const hud = document.getElementById('tutorial-hud');
            if (!hud) return;
            const isHidden = hud.style.display === 'none' || getComputedStyle(hud).display === 'none';
            hud.style.display = isHidden ? 'flex' : 'none';
        });
    }
    const btnHideTutorialHud = document.getElementById('btnHideTutorialHud');
    if (btnHideTutorialHud) {
        btnHideTutorialHud.addEventListener('click', () => {
            const hud = document.getElementById('tutorial-hud');
            if (hud) hud.style.display = 'none';
        });
    }
    document.getElementById('btnSettingsBack').addEventListener('click', (e) => {
        e.stopPropagation();
        appState.mode = 'gameSettings';
        updateUiMode();
        syncAdvancedSettingsUi();
    });

    // Customizer Hookings
    document.getElementById('custHandedness').addEventListener('change', (e) => {
        StickCustomizerState.handedness = e.target.value;
        syncAdvancedSettingsUi();
    });
    document.getElementById('custColor').addEventListener('change', (e) => {
        StickCustomizerState.color = e.target.value;
    });
    document.getElementById('custBladePattern').addEventListener('change', (e) => {
        StickCustomizerState.bladeCurve = e.target.value;
        syncAdvancedSettingsUi();
    });
    document.getElementById('custShaftShape').addEventListener('change', (e) => {
        StickCustomizerState.shaftShape = e.target.value;
        syncAdvancedSettingsUi();
    });
    document.getElementById('custShaftSurface').addEventListener('change', (e) => {
        StickCustomizerState.shaftSurface = e.target.value;
        syncAdvancedSettingsUi();
    });
    document.getElementById('custShaft3dGrip').addEventListener('change', (e) => {
        StickCustomizerState.shaft3dGrip = e.target.value;
    });
    document.getElementById('custBladeTexture').addEventListener('change', (e) => {
        StickCustomizerState.bladeTexture = e.target.value;
        syncAdvancedSettingsUi();
    });
    document.getElementById('custFlex').addEventListener('input', (e) => {
        StickCustomizerState.flex = e.target.value;
        document.getElementById('custFlexValue').textContent = e.target.value;
        syncAdvancedSettingsUi();
    });
    document.getElementById('custKickpoint').addEventListener('change', (e) => {
        StickCustomizerState.kickpoint = e.target.value;
        applyKickpointPreset(e.target.value);
        window.dispatchEvent(new CustomEvent('tutorialKickpointSwitched'));
        syncAdvancedSettingsUi();
        updatePhysics();
    });

    const shaftWallThicknesses = {
        'ultra-thin': 1,
        'flinter-thin': 1.5,
        'very-thin': 2,
        thin: 2.5,
        regular: 3
    };
    const shaftWallSelect = document.getElementById('custShaftWall');
    shaftWallSelect.addEventListener('change', (e) => {
        const thickness = shaftWallThicknesses[e.target.value];
        StickCustomizerState.shaftWall = e.target.value;
        StickCustomizerState.shaftThickness = thickness;
        syncAdvancedSettingsUi();
    });

    // Game settings bindings
    document.getElementById('settingSpeedUnit').addEventListener('change', (e) => {
        gameSettings.speedUnit = e.target.value;
        document.getElementById('speed-unit-lbl').textContent = e.target.value === 'kmh' ? 'km/h' : 'mp/h';
        updateGoalSpeedDisplay(undefined, e.target.value === 'kmh' ? 'KM/H' : 'MPH');
    });
    document.getElementById('settingShowShotTracer').addEventListener('change', (e) => {
        gameSettings.showShotTracer = e.target.checked;
    });
    document.getElementById('settingShowAimTracer').addEventListener('change', (e) => {
        gameSettings.showAimTracer = e.target.checked;
        if(!e.target.checked) document.getElementById('aimTracerCanvas').style.display = 'none';
    });

    const settingBindings = [
        ['settingShotSpeed', 'settingShotSpeedValue', 'shotSpeed', value => `${value}%`, value => value / 100],
        ['settingSwipeRange', 'settingSwipeRangeValue', 'swipeRange', value => `${value}%`, value => value / 100],
        ['settingKickpointEffect', 'settingKickpointEffectValue', 'kickpointEffect', value => `${value}%`, value => value / 100],
        ['settingMinSwipeSpeed', 'settingMinSwipeSpeedValue', 'minSwipeSpeed', value => `${Number(value).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} px/ms`, value => Number(value)],
        ['settingPrecisionTolerance', 'settingPrecisionToleranceValue', 'precisionTolerance', value => `${value} px`, value => Number(value)],
        ['settingDeviationPenalty', 'settingDeviationPenaltyValue', 'deviationPenalty', value => `${value}%`, value => value / 100]
    ];
    settingBindings.forEach(([inputId, outputId, key, format, parse]) => {
        const input = document.getElementById(inputId);
        const output = document.getElementById(outputId);
        input.addEventListener('input', () => {
            gameSettings[key] = parse(input.value);
            output.textContent = format(input.value);
            if (key === 'kickpointEffect') refreshStiffnessCurveCache();
            updatePhysics();
            syncAdvancedSettingsUi();
        });
    });

    // --- Settings Tab Navigation ---
    const tabBtnGeneral = document.getElementById('tabBtnGeneral');
    const tabBtnAdvanced = document.getElementById('tabBtnAdvanced');
    const tabGeneral = document.getElementById('settingsTabGeneral');
    const tabAdvanced = document.getElementById('settingsTabAdvanced');

    function switchSettingsTab(tabName) {
      if (tabName === 'advanced') {
        tabBtnAdvanced?.classList.add('active');
        tabBtnGeneral?.classList.remove('active');
        if (tabGeneral) tabGeneral.hidden = true;
        if (tabAdvanced) tabAdvanced.hidden = false;
        syncAdvancedSettingsUi();
        requestAnimationFrame(() => {
          drawStiffnessCurve();
        });
      } else {
        tabBtnGeneral?.classList.add('active');
        tabBtnAdvanced?.classList.remove('active');
        if (tabGeneral) tabGeneral.hidden = false;
        if (tabAdvanced) tabAdvanced.hidden = true;
      }
    }

    tabBtnGeneral?.addEventListener('click', () => switchSettingsTab('general'));
    tabBtnAdvanced?.addEventListener('click', () => switchSettingsTab('advanced'));

    // --- Advanced Settings Tab Bindings ---
    // 1. Shaft & Fulcrum State Controls
    const advStateBindings = [
      ['advBottomGlovePos', 'advBottomGlovePosVal', 'bottomGlovePos', v => `${v}%`, ['slBottomGlovePos', 'numBottomGlovePos']],
      ['advBottomGloveAmp', 'advBottomGloveAmpVal', 'bottomGloveAmp', v => `${v}%`, ['slBottomGloveAmp', 'numBottomGloveAmp']],
      ['advBottomGloveTimeframe', 'advBottomGloveTimeframeVal', 'bottomGloveTimeframe', v => `${v} ms`, []],
      ['advTopHandAmp', 'advTopHandAmpVal', 'topHandAmp', v => `${v}%`, ['slTopHandAmp', 'numTopHandAmp']],
      ['advTopHandTimeframe', 'advTopHandTimeframeVal', 'topHandTimeframe', v => `${v} ms`, []],
      ['advMaxBend', 'advMaxBendVal', 'maxBendAngle', v => `${v}°`, ['slMaxBend', 'numMaxBend']],
      ['advTopPullStart', 'advTopPullStartVal', 'topHandPullStartMs', v => `${v} ms`, ['slTopPullStart', 'numTopPullStart']],
      ['advTopPullDown', 'advTopPullDownVal', 'topHandPullDownMm', v => `${v} mm`, ['slTopPullDown', 'numTopPullDown']],
      ['advFollowAngle', 'advFollowAngleVal', 'followThroughAngle', v => `${v}°`, ['slFollowAngle', 'numFollowAngle']],
      ['advBladeWhip', 'advBladeWhipVal', 'bladeWhipStrength', v => `${v}%`, ['slBladeWhip', 'numBladeWhip']]
    ];

    advStateBindings.forEach(([advId, advOutId, stateKey, format, workbenchIds]) => {
      const advInput = document.getElementById(advId);
      const advOut = document.getElementById(advOutId);
      if (!advInput) return;
      advInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        state[stateKey] = val;
        if (advOut) advOut.textContent = format(val);
        workbenchIds.forEach(id => {
          const wb = document.getElementById(id);
          if (wb) wb.value = val;
        });
        updatePhysics();
      });
    });

    const advBendAxis = document.getElementById('advBendAxis');
    if (advBendAxis) {
      advBendAxis.addEventListener('change', (e) => {
        state.bendAxis = e.target.value;
        updatePhysics();
      });
    }

    const advAnchorMode = document.getElementById('advAnchorMode');
    if (advAnchorMode) {
      advAnchorMode.addEventListener('change', (e) => {
        state.anchorMode = e.target.value;
        updatePhysics();
      });
    }

    // 2. PhysicsSettings Controls (Simulation, Dwell, Recoil, Flight & Swipe Constants)
    const advPhysicsBindings = [
      ['advStickLength', 'advStickLengthVal', 'stickLength', v => `${v} mm`, v => parseFloat(v)],
      ['advHandleStiffness', 'advHandleStiffnessVal', 'handleStiffness', v => `${Number(v).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`, v => parseFloat(v)],
      ['advHoselStiffness', 'advHoselStiffnessVal', 'hoselStiffness', v => `${Number(v).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`, v => parseFloat(v)],
      ['advRecoilDamping', 'advRecoilDampingVal', 'recoilDamping', v => Number(v).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), v => parseFloat(v)],
      ['advRecoilFrequency', 'advRecoilFrequencyVal', 'recoilFrequency', v => Number(v).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), v => parseFloat(v)],
      ['advReleaseSpeed', 'advReleaseSpeedVal', 'releaseSpeedMultiplier', v => `${v}%`, v => parseFloat(v) / 100],
      ['advReleaseDuration', 'advReleaseDurationVal', 'releaseDuration', v => `${v} ms`, v => parseFloat(v)],
      ['advAnimPlaybackSpeed', 'advAnimPlaybackSpeedVal', 'animPlaybackMultiplier', v => `${v}%`, v => parseFloat(v) / 100],
      ['advMaxSwingAngleDeg', 'advMaxSwingAngleDegVal', 'maxSwingAngleDeg', v => `${v}°`, v => parseFloat(v)],
      ['advBaseShotSpeed', 'advBaseShotSpeedVal', 'baseShotSpeed', v => `${v} mm/s`, v => parseFloat(v)],
      ['advWhipBonusSpeed', 'advWhipBonusSpeedVal', 'whipBonusSpeed', v => `${v} mm/s`, v => parseFloat(v)],
      ['advPuckDwellTime', 'advPuckDwellTimeVal', 'puckDwellTime', v => `${v} ms`, v => parseFloat(v)],
      ['advBladeClearance', 'advBladeClearanceVal', 'bladeClearance', v => `${v} mm`, v => parseFloat(v)],
      ['advBladeCatchDistance', 'advBladeCatchDistanceVal', 'bladeCatchDistance', v => `${v} mm`, v => parseFloat(v)],
      ['advBladeDecelThreshold', 'advBladeDecelThresholdVal', 'bladeDecelThreshold', v => `${v} mm/s`, v => parseFloat(v)],
      ['advReleaseSafetyLimit', 'advReleaseSafetyLimitVal', 'releaseSafetyLimit', v => `${v} ms`, v => parseFloat(v)],
      ['advPuckWobbleFactor', 'advPuckWobbleFactorVal', 'puckWobbleFactor', v => `${Number(v).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`, v => parseFloat(v)],
      ['advGravityValue', 'advGravityValueVal', 'gravityValue', v => `${v} mm/s²`, v => parseFloat(v)],
      ['advMinSwipeDistance', 'advMinSwipeDistanceVal', 'minSwipeDistance', v => `${v} px`, v => parseFloat(v)],
      ['advSwipePowerMultiplier', 'advSwipePowerMultiplierVal', 'swipePowerMultiplier', v => `${v}`, v => parseFloat(v)],
      ['advAimSensitivity', 'advAimSensitivityVal', 'aimSensitivity', v => `${Number(v).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`, v => parseFloat(v)]
    ];

    advPhysicsBindings.forEach(([advId, advOutId, key, format, parse]) => {
      const el = document.getElementById(advId);
      const out = document.getElementById(advOutId);
      if (!el) return;
      el.addEventListener('input', (e) => {
        const val = parse(e.target.value);
        physicsSettings[key] = val;
        if (out) out.textContent = format(e.target.value);
        updatePhysics();
      });
    });

    // 3. GameSettings Controls (Shot Speed, Swipe Range, Kickpoint Effect, Precision & Deviation)
    const advGameSettingsBindings = [
      ['advShotSpeed', 'advShotSpeedVal', 'shotSpeed', v => `${v}%`, v => v / 100, 'settingShotSpeed', 'settingShotSpeedValue'],
      ['advSwipeRange', 'advSwipeRangeVal', 'swipeRange', v => `${v}%`, v => v / 100, 'settingSwipeRange', 'settingSwipeRangeValue'],
      ['advKickpointEffect', 'advKickpointEffectVal', 'kickpointEffect', v => `${v}%`, v => v / 100, 'settingKickpointEffect', 'settingKickpointEffectValue'],
      ['advMinSwipeSpeed', 'advMinSwipeSpeedVal', 'minSwipeSpeed', v => `${Number(v).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} px/ms`, v => Number(v), 'settingMinSwipeSpeed', 'settingMinSwipeSpeedValue'],
      ['advPrecisionTolerance', 'advPrecisionToleranceVal', 'precisionTolerance', v => `${v} px`, v => Number(v), 'settingPrecisionTolerance', 'settingPrecisionToleranceValue'],
      ['advDeviationPenalty', 'advDeviationPenaltyVal', 'deviationPenalty', v => `${v}%`, v => v / 100, 'settingDeviationPenalty', 'settingDeviationPenaltyValue']
    ];

    advGameSettingsBindings.forEach(([advId, advOutId, key, format, parse, genInputId, genOutId]) => {
      const advInput = document.getElementById(advId);
      const advOut = document.getElementById(advOutId);
      if (!advInput) return;
      advInput.addEventListener('input', () => {
        const val = parse(advInput.value);
        gameSettings[key] = val;
        if (advOut) advOut.textContent = format(advInput.value);
        const genInput = document.getElementById(genInputId);
        const genOut = document.getElementById(genOutId);
        if (genInput) genInput.value = advInput.value;
        if (genOut) genOut.textContent = format(advInput.value);
        if (key === 'kickpointEffect') refreshStiffnessCurveCache();
        updatePhysics();
      });
    });

    // 4. StickCustomizerState Controls
    const advFlex = document.getElementById('advFlex');
    if (advFlex) {
      advFlex.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        StickCustomizerState.flex = val;
        const out = document.getElementById('advFlexVal');
        if (out) out.textContent = val;
        const custFl = document.getElementById('custFlex');
        const custFlVal = document.getElementById('custFlexValue');
        if (custFl) custFl.value = val;
        if (custFlVal) custFlVal.textContent = val;
        syncAdvancedSettingsUi();
        updatePhysics();
      });
    }

    const advKickpoint = document.getElementById('advKickpoint');
    if (advKickpoint) {
      advKickpoint.addEventListener('change', (e) => {
        StickCustomizerState.kickpoint = e.target.value;
        const custKp = document.getElementById('custKickpoint');
        if (custKp) custKp.value = e.target.value;
        applyKickpointPreset(e.target.value);
        window.dispatchEvent(new CustomEvent('tutorialKickpointSwitched'));
        syncAdvancedSettingsUi();
        updatePhysics();
      });
    }

    const advBladeCurve = document.getElementById('advBladeCurve');
    if (advBladeCurve) {
      advBladeCurve.addEventListener('change', (e) => {
        StickCustomizerState.bladeCurve = e.target.value;
        const custBp = document.getElementById('custBladePattern');
        if (custBp) {
          custBp.value = e.target.value;
          custBp.dispatchEvent(new Event('change', { bubbles: true }));
        }
        syncAdvancedSettingsUi();
      });
    }

    const advBladeTexture = document.getElementById('advBladeTexture');
    if (advBladeTexture) {
      advBladeTexture.addEventListener('change', (e) => {
        StickCustomizerState.bladeTexture = e.target.value;
        const custBt = document.getElementById('custBladeTexture');
        if (custBt) custBt.value = e.target.value;
        syncAdvancedSettingsUi();
      });
    }

    const advShaftWall = document.getElementById('advShaftWall');
    if (advShaftWall) {
      advShaftWall.addEventListener('change', (e) => {
        const thickness = shaftWallThicknesses[e.target.value] ?? 2.0;
        StickCustomizerState.shaftWall = e.target.value;
        StickCustomizerState.shaftThickness = thickness;
        const custSw = document.getElementById('custShaftWall');
        if (custSw) custSw.value = e.target.value;
        syncAdvancedSettingsUi();
      });
    }

    const advShaftThickness = document.getElementById('advShaftThickness');
    if (advShaftThickness) {
      advShaftThickness.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        StickCustomizerState.shaftThickness = val;
        const out = document.getElementById('advShaftThicknessVal');
        if (out) out.textContent = `${val.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm`;
        syncAdvancedSettingsUi();
      });
    }

    const advShaftSurface = document.getElementById('advShaftSurface');
    if (advShaftSurface) {
      advShaftSurface.addEventListener('change', (e) => {
        StickCustomizerState.shaftSurface = e.target.value;
        const custSs = document.getElementById('custShaftSurface');
        if (custSs) custSs.value = e.target.value;
        syncAdvancedSettingsUi();
      });
    }

    const advShaft3dGrip = document.getElementById('advShaft3dGrip');
    if (advShaft3dGrip) {
      advShaft3dGrip.addEventListener('change', (e) => {
        StickCustomizerState.shaft3dGrip = e.target.value;
        const cust = document.getElementById('custShaft3dGrip');
        if (cust) cust.value = e.target.value;
        syncAdvancedSettingsUi();
      });
    }

    const advShaftShape = document.getElementById('advShaftShape');
    if (advShaftShape) {
      advShaftShape.addEventListener('change', (e) => {
        StickCustomizerState.shaftShape = e.target.value;
        const custSh = document.getElementById('custShaftShape');
        if (custSh) custSh.value = e.target.value;
        syncAdvancedSettingsUi();
      });
    }

    const advAgeCategory = document.getElementById('advAgeCategory');
    if (advAgeCategory) {
      advAgeCategory.addEventListener('change', (e) => {
        StickCustomizerState.ageCategory = e.target.value;
        syncAdvancedSettingsUi();
      });
    }

    const advHandedness = document.getElementById('advHandedness');
    if (advHandedness) {
      advHandedness.addEventListener('change', (e) => {
        StickCustomizerState.handedness = e.target.value;
        const custHn = document.getElementById('custHandedness');
        if (custHn) {
          custHn.value = e.target.value;
          custHn.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const radio = document.querySelector(`input[name="handedness"][value="${e.target.value}"]`);
        if (radio) radio.checked = true;
        syncAdvancedSettingsUi();
      });
    }

    const bindCheckbox = (id, prop) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', (e) => {
          StickCustomizerState[prop] = e.target.checked;
          syncAdvancedSettingsUi();
        });
      }
    };
    bindCheckbox('advShaftGrip', 'shaftGrip');
    bindCheckbox('advBladeGrip', 'bladeGrip');
    bindCheckbox('advStickTape', 'stickTape');

    // 5. Timeline Controls (Settings Tab)
    const advTimeline = document.getElementById('advTimeline');
    if (advTimeline) {
      advTimeline.addEventListener('input', (e) => {
        state.timeline = parseInt(e.target.value, 10);
        state.holdMaxBend = false;
        syncUiFromState();
        updatePhysics();
      });
    }

    const btnAdvHoldMax = document.getElementById('btnAdvHoldMax');
    if (btnAdvHoldMax) {
      btnAdvHoldMax.addEventListener('click', () => {
        state.holdMaxBend = !state.holdMaxBend;
        if (state.holdMaxBend) state.timeline = 600;
        syncUiFromState();
        updatePhysics();
      });
    }

    const btnAdvPlay = document.getElementById('btnAdvPlay');
    if (btnAdvPlay) {
      btnAdvPlay.addEventListener('click', () => {
        state.isPlaying = !state.isPlaying;
        state.holdMaxBend = false;
        btnAdvPlay.textContent = state.isPlaying ? '❚❚ Pauze' : '▶ Play';
        syncUiFromState();
      });
    }

    document.querySelectorAll('.adv-btn-jump').forEach(btn => {
      btn.addEventListener('click', () => {
        state.timeline = parseInt(btn.getAttribute('data-time'), 10);
        state.holdMaxBend = false;
        syncUiFromState();
        updatePhysics();
      });
    });

    // 6. Reset Advanced Settings to Defaults
    const btnResetAdv = document.getElementById('btnResetAdvSettings');
    if (btnResetAdv) {
      btnResetAdv.addEventListener('click', () => {
        state.bottomGlovePos = 50;
        state.bottomGloveAmp = 100;
        state.bottomGloveTimeframe = 250;
        state.topHandAmp = 100;
        state.topHandTimeframe = 250;
        state.maxBendAngle = 45;
        state.topHandPullStartMs = 600;
        state.topHandPullDownMm = 100;
        state.followThroughAngle = 50;
        state.bladeWhipStrength = 100;
        state.bendAxis = 'forwards';
        state.anchorMode = 'bow';
        state.timeline = 600;
        state.holdMaxBend = false;
        state.isPlaying = false;
        state.stiffnessCurve = DEFAULT_STIFFNESS_CURVE.map(point => ({ ...point }));

        gameSettings.shotSpeed = 1.9;
        gameSettings.swipeRange = 1.0;
        gameSettings.kickpointEffect = 1.0;
        gameSettings.minSwipeSpeed = 0.3;
        gameSettings.precisionTolerance = 12;
        gameSettings.deviationPenalty = 1.0;

        physicsSettings.baseShotSpeed = 5000;
        physicsSettings.whipBonusSpeed = 7000;
        physicsSettings.puckDwellTime = 180;
        physicsSettings.bladeClearance = 54;
        physicsSettings.bladeCatchDistance = 250;
        physicsSettings.bladeDecelThreshold = 300;
        physicsSettings.releaseSafetyLimit = 420;
        physicsSettings.recoilDamping = 2.2;
        physicsSettings.recoilFrequency = 2.2;
        physicsSettings.handleStiffness = 1.5;
        physicsSettings.hoselStiffness = 0.8;
        physicsSettings.maxSwingAngleDeg = 78;
        physicsSettings.stickLength = 1400;
        physicsSettings.minSwipeDistance = 100;
        physicsSettings.swipePowerMultiplier = 28;
        physicsSettings.aimSensitivity = 1.5;
        physicsSettings.gravityValue = 9810;
        physicsSettings.puckWobbleFactor = 1.0;
        physicsSettings.animPlaybackMultiplier = 1.0;
        physicsSettings.releaseSpeedMultiplier = 1.0;
        physicsSettings.releaseDuration = 400;

        StickCustomizerState.flex = 90;
        StickCustomizerState.kickpoint = 'mid';
        StickCustomizerState.bladeCurve = 'P28';
        StickCustomizerState.bladeTexture = '3d-texture';
        StickCustomizerState.shaftWall = 'very-thin';
        StickCustomizerState.shaftThickness = 2.0;
        StickCustomizerState.shaftSurface = 'mat-without-grip';
        StickCustomizerState.shaft3dGrip = 'fully-covered';
        StickCustomizerState.shaftShape = 'micro-concaaf';
        StickCustomizerState.ageCategory = 'SR';
        StickCustomizerState.handedness = 'right';
        StickCustomizerState.shaftGrip = false;
        StickCustomizerState.bladeGrip = false;
        StickCustomizerState.stickTape = false;

        const genMap = {
          settingShotSpeed: ['190', '190%'],
          settingSwipeRange: ['100', '100%'],
          settingKickpointEffect: ['100', '100%'],
          settingMinSwipeSpeed: ['0.3', '0,3 px/ms'],
          settingPrecisionTolerance: ['12', '12 px'],
          settingDeviationPenalty: ['100', '100%']
        };
        for (const [id, [val, display]] of Object.entries(genMap)) {
          const inp = document.getElementById(id);
          const out = document.getElementById(id + 'Value');
          if (inp) inp.value = val;
          if (out) out.textContent = display;
        }

        syncCustomizerControlsFromState();
        const custPattern = document.getElementById('custBladePattern');
        if (custPattern) custPattern.dispatchEvent(new Event('change', { bubbles: true }));
        window.dispatchEvent(new CustomEvent('tutorialKickpointSwitched'));

        refreshStiffnessCurveCache();
        syncUiFromState();
        syncAdvancedSettingsUi();
        drawStiffnessCurve();
        updatePhysics();
      });
    }

    // Two-way bindings for physics workbench
    function bindTwoWay(idSlider, idNum, key) {
        const sl = document.getElementById(idSlider);
        const num = document.getElementById(idNum);
        if (sl && num) {
            sl.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                state[key] = val; num.value = val; updatePhysics();
                syncAdvancedSettingsUi();
            });
            num.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) { state[key] = val; sl.value = val; updatePhysics(); syncAdvancedSettingsUi(); }
            });
        }
    }
    bindTwoWay('slBottomGlovePos', 'numBottomGlovePos', 'bottomGlovePos');
    bindTwoWay('slBottomGloveAmp', 'numBottomGloveAmp', 'bottomGloveAmp');
    bindTwoWay('slTopHandAmp', 'numTopHandAmp', 'topHandAmp');
    bindTwoWay('slMaxBend', 'numMaxBend', 'maxBendAngle');
    bindTwoWay('slTopPullStart', 'numTopPullStart', 'topHandPullStartMs');
    bindTwoWay('slTopPullDown', 'numTopPullDown', 'topHandPullDownMm');
    bindTwoWay('slFollowAngle', 'numFollowAngle', 'followThroughAngle');
    bindTwoWay('slBladeWhip', 'numBladeWhip', 'bladeWhipStrength');

    function bindStiffnessCanvasInteractions(canvasId) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      canvas.addEventListener('pointerdown', event => {
        const point = stiffnessPointFromEvent(event, canvas);
        const rect = canvas.getBoundingClientRect();
        const plotWidth = rect.width - stiffnessPlot.left - stiffnessPlot.right;
        const plotHeight = rect.height - stiffnessPlot.top - stiffnessPlot.bottom;
        let dragIndex = state.stiffnessCurve.findIndex(item =>
          Math.hypot((item.x - point.x) * plotWidth, (item.y - point.y) * plotHeight) < 16
        );
        if (dragIndex < 0) {
          if (point.px < stiffnessPlot.left || point.px > rect.width - stiffnessPlot.right ||
              point.py < stiffnessPlot.top || point.py > rect.height - stiffnessPlot.bottom) return;
          state.stiffnessCurve.push({ x: point.x, y: point.y });
          state.stiffnessCurve.sort((a, b) => a.y - b.y);
          refreshStiffnessCurveCache();
        }
        canvas.setPointerCapture(event.pointerId);
        canvas.dataset.dragIndex = dragIndex;
        drawStiffnessCurve();
        updatePhysics();
      });

      canvas.addEventListener('pointermove', event => {
        let dragIndex = parseInt(canvas.dataset.dragIndex, 10);
        if (isNaN(dragIndex) || dragIndex < 0) return;
        const point = stiffnessPointFromEvent(event, canvas);
        const item = state.stiffnessCurve[dragIndex];
        if (!item) return;
        item.x = point.x;
        const epsilon = 0.005;
        item.y = dragIndex === 0 ? 0 :
          dragIndex === state.stiffnessCurve.length - 1 ? 1 :
          Math.max(state.stiffnessCurve[dragIndex - 1].y + epsilon,
          Math.min(state.stiffnessCurve[dragIndex + 1].y - epsilon, point.y));
        state.stiffnessCurve.sort((a, b) => a.y - b.y);
        refreshStiffnessCurveCache();
        canvas.dataset.dragIndex = state.stiffnessCurve.indexOf(item);
        drawStiffnessCurve();
        updatePhysics();
      });

      const endDrag = () => { canvas.dataset.dragIndex = -1; };
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', endDrag);
    }
    bindStiffnessCanvasInteractions('stiffnessCurve');
    bindStiffnessCanvasInteractions('advStiffnessCurve');

    const onResetStiffness = () => {
      applyKickpointPreset(StickCustomizerState.kickpoint || 'mid');
      updatePhysics();
    };
    document.getElementById('btnResetStiffness')?.addEventListener('click', onResetStiffness);
    document.getElementById('btnResetAdvStiffness')?.addEventListener('click', onResetStiffness);

    const slTimeline = document.getElementById('slTimeline');
    if (slTimeline) {
      slTimeline.addEventListener('input', (e) => {
        state.timeline = parseInt(e.target.value, 10);
        state.holdMaxBend = false;
        syncUiFromState();
        updatePhysics();
      });
    }

    const btnHoldMax = document.getElementById('btnHoldMax');
    if (btnHoldMax) {
      btnHoldMax.addEventListener('click', () => {
        state.holdMaxBend = !state.holdMaxBend;
        if (state.holdMaxBend) state.timeline = 600;
        syncUiFromState();
        updatePhysics();
      });
    }

    const btnPlay = document.getElementById('btnPlay');
    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        state.isPlaying = !state.isPlaying;
        state.holdMaxBend = false;
        btnPlay.textContent = state.isPlaying ? '❚❚ Pauze' : '▶ Play';
        syncUiFromState();
      });
    }

    document.querySelectorAll('.btn-jump').forEach(btn => {
      btn.addEventListener('click', () => {
        state.timeline = parseInt(btn.getAttribute('data-time'), 10);
        state.holdMaxBend = false;
        syncUiFromState();
        updatePhysics();
      });
    });

    const panelHeader = document.querySelector('.panel-header');
    const panel = document.getElementById('workbenchPanel');
    const collapseIcon = document.getElementById('collapseIcon');
    if (panelHeader && panel) {
      panelHeader.addEventListener('click', () => {
        panel.classList.toggle('collapsed');
        collapseIcon.textContent = panel.classList.contains('collapsed') ? '▲ Uitklappen' : '▼ Inklappen';
      });
    }

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      drawStiffnessCurve();
    });
    syncCustomizerControlsFromState();
    initCustomizerSwatches();
    updateUiMode();
}
