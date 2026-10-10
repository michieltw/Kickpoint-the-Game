import { appState, state, game } from './state.js?v=customizer-patterns-1';
import { gameSettings, StickCustomizerState, DEFAULT_STIFFNESS_CURVE } from './config.js?v=customizer-patterns-1';
import { getStiffnessAt, refreshStiffnessCurveCache, sortedStiffnessCurve } from './physics.js?v=customizer-patterns-1';
import { camera, renderer } from './scene.js?v=customizer-patterns-1';

export function updateUiMode() {
  const splash = document.getElementById('splash-screen');
  const intro = document.getElementById('intro-screen');
  const profile = document.getElementById('player-profile');
  const menu = document.getElementById('main-menu');
  const gameUi = document.getElementById('game-ui');
  const settings = document.getElementById('workbenchPanel');
  const gameSettingsMenu = document.getElementById('game-settings');
  const customizerMenu = document.getElementById('stick-customizer');
  const btnPlayNow = document.getElementById('btnPlayNow');
  document.body.classList.toggle('customizer-open', appState.mode === 'customizer');

  const targetHud = document.getElementById('target-hud');
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
    settings.style.display = 'none';
    gameSettingsMenu.classList.remove('visible');
    customizerMenu.classList.remove('visible');
    if(targetHud) targetHud.style.display = 'none';
  } else {
    if (appState.mode === 'menu') {
      menu.classList.remove('hidden');
      gameUi.classList.remove('visible');
      settings.style.display = 'none';
      gameSettingsMenu.classList.remove('visible');
      customizerMenu.classList.remove('visible');
      btnPlayNow.textContent = game && game.shots > 0 ? 'Resume Game' : 'Play Now';
      if(targetHud) targetHud.style.display = 'none';
    } else if (appState.mode === 'game') {
      menu.classList.add('hidden');
      gameUi.classList.add('visible');
      settings.style.display = 'none';
      gameSettingsMenu.classList.remove('visible');
      customizerMenu.classList.remove('visible');
      if(targetHud) {
          targetHud.style.display = game.mode === 'targets' ? 'flex' : 'none';
      }
    } else if (appState.mode === 'gameSettings') {
      menu.classList.add('hidden');
      gameUi.classList.remove('visible');
      settings.style.display = 'none';
      gameSettingsMenu.classList.add('visible');
      customizerMenu.classList.remove('visible');
    } else if (appState.mode === 'customizer') {
      menu.classList.add('hidden');
      gameUi.classList.remove('visible');
      settings.style.display = 'none';
      gameSettingsMenu.classList.remove('visible');
      customizerMenu.classList.add('visible');
    } else if (appState.mode === 'settings') {
      menu.classList.add('hidden');
      gameUi.classList.remove('visible');
      gameSettingsMenu.classList.remove('visible');
      customizerMenu.classList.remove('visible');
      settings.style.display = 'flex';
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
  const kickpoint = softZones.length >= 2
    ? 'Hybrid Kick'
    : labels[Math.min(5, Math.floor((softZones[0] ?? 0.5) * 6))];
  const flexValue = Math.round(average / 5) * 5;

  const kickpointReadout = document.getElementById('kickpointReadout');
  const flexReadout = document.getElementById('flexReadout');
  if (kickpointReadout) kickpointReadout.textContent = kickpoint;
  if (flexReadout) flexReadout.textContent = `Flex ${flexValue}`;
}

export function drawStiffnessCurve() {
  const stiffnessCanvas = document.getElementById('stiffnessCurve');
  if (!stiffnessCanvas) return;
  const stiffnessCtx = stiffnessCanvas.getContext('2d');
  const rect = stiffnessCanvas.getBoundingClientRect();
  if(rect.width === 0) return; // Hidden

  const dpr = window.devicePixelRatio || 1;
  stiffnessCanvas.width = Math.round(rect.width * dpr);
  stiffnessCanvas.height = Math.round(rect.height * dpr);
  stiffnessCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = rect.width;
  const height = rect.height;
  const plotWidth = width - stiffnessPlot.left - stiffnessPlot.right;
  const plotHeight = height - stiffnessPlot.top - stiffnessPlot.bottom;
  const px = x => stiffnessPlot.left + x * plotWidth;
  const py = y => stiffnessPlot.top + (1 - y) * plotHeight;

  stiffnessCtx.clearRect(0, 0, width, height);
  stiffnessCtx.font = '10px sans-serif';
  stiffnessCtx.textBaseline = 'middle';
  stiffnessCtx.lineWidth = 1;
  stiffnessCtx.strokeStyle = 'rgba(255,255,255,0.1)';
  stiffnessCtx.fillStyle = '#888888';
  for (let i = 0; i <= 3; i++) {
    const x = i / 3;
    const y = i / 3;
    const gx = px(x);
    const gy = py(y);
    stiffnessCtx.beginPath(); stiffnessCtx.moveTo(gx, stiffnessPlot.top); stiffnessCtx.lineTo(gx, height - stiffnessPlot.bottom); stiffnessCtx.stroke();
    stiffnessCtx.beginPath(); stiffnessCtx.moveTo(stiffnessPlot.left, gy); stiffnessCtx.lineTo(width - stiffnessPlot.right, gy); stiffnessCtx.stroke();
    stiffnessCtx.fillText(String(Math.round(50 + x * 75)), gx - 10, height - 10);
    stiffnessCtx.fillText(y.toFixed(2), 3, gy);
  }
  stiffnessCtx.strokeStyle = '#ffffff';
  stiffnessCtx.lineWidth = 2;
  stiffnessCtx.beginPath();
  sortedStiffnessCurve.forEach((point, index) => {
    const x = px(point.x);
    const y = py(point.y);
    if (index === 0) stiffnessCtx.moveTo(x, y);
    else stiffnessCtx.lineTo(x, y);
  });
  stiffnessCtx.stroke();
  state.stiffnessCurve.forEach(point => {
    stiffnessCtx.beginPath();
    stiffnessCtx.arc(px(point.x), py(point.y), 5, 0, Math.PI * 2);
    stiffnessCtx.fillStyle = '#000000';
    stiffnessCtx.fill();
    stiffnessCtx.strokeStyle = '#ffffff';
    stiffnessCtx.lineWidth = 2;
    stiffnessCtx.stroke();
  });
  analyzeStiffnessProfile();
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
  blade: {
    title: 'Pattern',
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
  color: {
    title: 'Stick kleur',
    selects: ['custColor'],
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
  const flexInput = document.getElementById('custFlex');
  const swipeCard = document.getElementById('customizer-swipe-card');
  let currentRandomOption = null;
  let swipeStartX = null;
  let swipeInProgress = false;

  function createOptionImage(selectId, value, className) {
    const image = document.createElement('span');
    image.className = className;
    image.setAttribute('aria-hidden', 'true');
    if (selectId === 'custColor') image.style.setProperty('--swatch-color', value);
    applyCustomOptionImage(image, selectId, value);
    return image;
  }

  function renderCustomizerOverview() {
    const overview = document.getElementById('customizer-overview');
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
      const label = document.createElement('label');
      label.htmlFor = 'custFlex';
      label.textContent = 'Flex';
      const output = document.createElement('output');
      output.textContent = flexInput.value;
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = flexInput.min;
      slider.max = flexInput.max;
      slider.step = flexInput.step;
      slider.value = flexInput.value;
      slider.setAttribute('aria-label', 'Flex');
      slider.addEventListener('input', () => {
        flexInput.value = slider.value;
        flexInput.dispatchEvent(new Event('input', { bubbles: true }));
        output.textContent = slider.value;
      });
      flexField.append(label, output, slider);
      panelOptions.appendChild(flexField);
    }
    panel.hidden = false;
    document.getElementById('customizer-overview').hidden = true;
    stage.dataset.zoom = groupName;
    document.querySelectorAll('.customizer-category-tab').forEach(button => {
      const active = button.dataset.category === groupName;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    document.getElementById('stick-customizer').classList.remove('options-collapsed');
  }

  function openCustomizerCategory(groupName) {
    if (customizerHotspotGroups[groupName]) renderHotspotPanel(groupName);
  }

  function closeHotspotPanel() {
    panel.hidden = true;
    document.getElementById('customizer-overview').hidden = false;
    panelTitle.textContent = 'Alle keuzes';
    stage.dataset.zoom = 'overview';
    document.querySelectorAll('.customizer-category-tab').forEach(button => {
      const active = button.dataset.category === 'overview';
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
      if (button.dataset.category === 'overview') closeHotspotPanel();
      else openCustomizerCategory(button.dataset.category);
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
    renderCustomizerOverview();
    const visibleFlex = panelOptions.querySelector('.customizer-flex-field');
    if (visibleFlex) visibleFlex.querySelector('output').textContent = flexInput.value;
    if (!swipeInProgress) showRandomOption();
  });
  stage.style.setProperty('--stick-color', document.getElementById('custColor').value);
  renderCustomizerOverview();

  function showRandomOption() {
    const candidates = Object.values(customizerHotspotGroups)
      .flatMap(group => group.selects)
      .flatMap(selectId => {
        const select = document.getElementById(selectId);
        return [...select.options]
          .filter(option => option.value !== select.value)
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

    const showPlayerProfile = () => {
      document.getElementById('intro-video').pause();
      document.getElementById('profile-title').textContent = 'Maak je spelersprofiel';
      appState.mode = 'profile';
      updateUiMode();
      profileName.focus();
    };
    document.getElementById('btnSkipIntro').addEventListener('click', showPlayerProfile);
    document.getElementById('intro-video').addEventListener('ended', showPlayerProfile);
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

    document.getElementById('btnSettings').addEventListener('click', () => { appState.mode = 'gameSettings'; updateUiMode(); });
    document.getElementById('btnCustomizer').addEventListener('click', () => { appState.mode = 'customizer'; updateUiMode(); });
    document.getElementById('btnSettingsPlay').addEventListener('click', () => { appState.mode = 'game'; updateUiMode(); });
    document.getElementById('btnPhysicsSettings').addEventListener('click', () => {
        appState.mode = 'settings';
        updateUiMode();
        setTimeout(drawStiffnessCurve, 50); // Redraw after panel shows
    });
    document.getElementById('btnGameSettingsBack').addEventListener('click', () => { appState.mode = 'menu'; updateUiMode(); });
    document.getElementById('btnCustomizerBack').addEventListener('click', () => { appState.mode = 'menu'; updateUiMode(); });
    document.getElementById('btnMenu').addEventListener('click', () => { appState.mode = 'menu'; updateUiMode(); });
    document.getElementById('btnSettingsBack').addEventListener('click', (e) => {
        e.stopPropagation();
        appState.mode = 'gameSettings';
        updateUiMode();
    });

    // Customizer Hookings
    document.getElementById('custHandedness').addEventListener('change', (e) => {
        StickCustomizerState.handedness = e.target.value;
    });
    document.getElementById('custColor').addEventListener('change', (e) => {
        StickCustomizerState.color = e.target.value;
    });
    document.getElementById('custBladePattern').addEventListener('change', (e) => StickCustomizerState.bladeCurve = e.target.value);
    document.getElementById('custShaftShape').addEventListener('change', (e) => StickCustomizerState.shaftShape = e.target.value);
    document.getElementById('custShaftSurface').addEventListener('change', (e) => StickCustomizerState.shaftSurface = e.target.value);
    document.getElementById('custShaft3dGrip').addEventListener('change', (e) => StickCustomizerState.shaft3dGrip = e.target.value);
    document.getElementById('custBladeTexture').addEventListener('change', (e) => StickCustomizerState.bladeTexture = e.target.value);
    document.getElementById('custFlex').addEventListener('input', (e) => {
        StickCustomizerState.flex = e.target.value;
        document.getElementById('custFlexValue').textContent = e.target.value;
    });
    document.getElementById('custKickpoint').addEventListener('change', (e) => StickCustomizerState.kickpoint = e.target.value);

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
    });

    // Game settings bindings
    document.getElementById('settingSpeedUnit').addEventListener('change', (e) => {
        gameSettings.speedUnit = e.target.value;
        document.getElementById('speed-unit-lbl').textContent = e.target.value === 'kmh' ? 'km/h' : 'mp/h';
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
        });
    });

    // Two-way bindings for physics workbench
    function bindTwoWay(idSlider, idNum, key) {
        const sl = document.getElementById(idSlider);
        const num = document.getElementById(idNum);
        if (sl && num) {
            sl.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                state[key] = val; num.value = val; updatePhysics();
            });
            num.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) { state[key] = val; sl.value = val; updatePhysics(); }
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

    const stiffnessCanvas = document.getElementById('stiffnessCurve');
    if (stiffnessCanvas) {
        stiffnessCanvas.addEventListener('pointerdown', event => {
            const point = stiffnessPointFromEvent(event, stiffnessCanvas);
            const rect = stiffnessCanvas.getBoundingClientRect();
            const plotWidth = rect.width - stiffnessPlot.left - stiffnessPlot.right;
            const plotHeight = rect.height - stiffnessPlot.top - stiffnessPlot.bottom;
            let draggedStiffnessPoint = state.stiffnessCurve.findIndex(item =>
                Math.hypot((item.x - point.x) * plotWidth, (item.y - point.y) * plotHeight) < 14
            );
            if (draggedStiffnessPoint < 0) {
                if (point.px < stiffnessPlot.left || point.px > rect.width - stiffnessPlot.right ||
                    point.py < stiffnessPlot.top || point.py > rect.height - stiffnessPlot.bottom) return;
                state.stiffnessCurve.push({ x: point.x, y: point.y });
                state.stiffnessCurve.sort((a, b) => a.y - b.y);
                refreshStiffnessCurveCache();
            }
            stiffnessCanvas.setPointerCapture(event.pointerId);
            stiffnessCanvas.dataset.dragIndex = draggedStiffnessPoint;
            drawStiffnessCurve();
            updatePhysics();
        });

        stiffnessCanvas.addEventListener('pointermove', event => {
            let dragIndex = parseInt(stiffnessCanvas.dataset.dragIndex);
            if (isNaN(dragIndex) || dragIndex < 0) return;
            const point = stiffnessPointFromEvent(event, stiffnessCanvas);
            const item = state.stiffnessCurve[dragIndex];
            item.x = point.x;
            const epsilon = 0.005;
            item.y = dragIndex === 0 ? 0 :
                dragIndex === state.stiffnessCurve.length - 1 ? 1 :
                Math.max(state.stiffnessCurve[dragIndex - 1].y + epsilon,
                Math.min(state.stiffnessCurve[dragIndex + 1].y - epsilon, point.y));
            state.stiffnessCurve.sort((a, b) => a.y - b.y);
            refreshStiffnessCurveCache();
            stiffnessCanvas.dataset.dragIndex = state.stiffnessCurve.indexOf(item);
            drawStiffnessCurve();
            updatePhysics();
        });

        const endDrag = () => stiffnessCanvas.dataset.dragIndex = -1;
        stiffnessCanvas.addEventListener('pointerup', endDrag);
        stiffnessCanvas.addEventListener('pointercancel', endDrag);
    }

    document.getElementById('btnResetStiffness').addEventListener('click', () => {
        state.stiffnessCurve = DEFAULT_STIFFNESS_CURVE.map(point => ({ ...point }));
        refreshStiffnessCurveCache();
        drawStiffnessCurve();
        updatePhysics();
    });

    const slTimeline = document.getElementById('slTimeline');
    if (slTimeline) {
      slTimeline.addEventListener('input', (e) => {
        state.timeline = parseInt(e.target.value);
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
        state.timeline = parseInt(btn.getAttribute('data-time'));
        state.holdMaxBend = false;
        syncUiFromState();
        updatePhysics();
      });
    });

    const btnResetAll = document.getElementById('btnResetAll');
    if (btnResetAll) {
      btnResetAll.addEventListener('click', () => {
        Object.assign(state, {"bottomGlovePos":50,"bottomGloveAmp":100,"bottomGloveTimeframe":250,"topHandAmp":100,"topHandTimeframe":250,"maxBendAngle":40,"topHandPullStartMs":600,"topHandPullDownMm":130,"followThroughAngle":35,"bladeWhipStrength":100,"timeline":500,"isPlaying":false,"holdMaxBend":true,"bendAxis":"forwards","anchorMode":"bow"});
        state.stiffnessCurve = DEFAULT_STIFFNESS_CURVE.map(point => ({ ...point }));
        refreshStiffnessCurveCache();
        drawStiffnessCurve();
        syncUiFromState();
        updatePhysics();
      });
    }

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
