import { appState, state, game } from './state.js';
import { gameSettings, StickCustomizerState, DEFAULT_STIFFNESS_CURVE } from './config.js';
import { getStiffnessAt, refreshStiffnessCurveCache, sortedStiffnessCurve } from './physics.js';
import { camera, renderer } from './scene.js';

export function updateUiMode() {
  const splash = document.getElementById('splash-screen');
  const menu = document.getElementById('main-menu');
  const gameUi = document.getElementById('game-ui');
  const settings = document.getElementById('workbenchPanel');
  const gameSettingsMenu = document.getElementById('game-settings');
  const customizerMenu = document.getElementById('stick-customizer');
  const btnPlayNow = document.getElementById('btnPlayNow');

  const targetHud = document.getElementById('target-hud');

  if (appState.mode === 'splash') {
    splash.style.opacity = '1';
    splash.style.pointerEvents = 'auto';
    menu.classList.add('hidden');
    gameUi.classList.remove('visible');
    settings.style.display = 'none';
    gameSettingsMenu.classList.remove('visible');
    customizerMenu.style.display = 'none';
    if(targetHud) targetHud.style.display = 'none';
  } else {
    splash.style.opacity = '0';
    splash.style.pointerEvents = 'none';

    if (appState.mode === 'menu') {
      menu.classList.remove('hidden');
      gameUi.classList.remove('visible');
      settings.style.display = 'none';
      gameSettingsMenu.classList.remove('visible');
      customizerMenu.style.display = 'none';
      btnPlayNow.textContent = game && game.shots > 0 ? 'Resume Game' : 'Play Now';
      if(targetHud) targetHud.style.display = 'none';
    } else if (appState.mode === 'game') {
      menu.classList.add('hidden');
      gameUi.classList.add('visible');
      settings.style.display = 'none';
      gameSettingsMenu.classList.remove('visible');
      customizerMenu.style.display = 'none';
      if(targetHud) {
          targetHud.style.display = game.mode === 'targets' ? 'flex' : 'none';
      }
    } else if (appState.mode === 'gameSettings') {
      menu.classList.add('hidden');
      gameUi.classList.remove('visible');
      settings.style.display = 'none';
      gameSettingsMenu.classList.add('visible');
      customizerMenu.style.display = 'none';
    } else if (appState.mode === 'customizer') {
      menu.classList.add('hidden');
      gameUi.classList.remove('visible');
      settings.style.display = 'none';
      gameSettingsMenu.classList.remove('visible');
      customizerMenu.style.display = 'flex';
    } else if (appState.mode === 'settings') {
      menu.classList.add('hidden');
      gameUi.classList.remove('visible');
      gameSettingsMenu.classList.remove('visible');
      customizerMenu.style.display = 'none';
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
    // Basic navigation
    document.getElementById('btnPlayNow').addEventListener('click', () => {
        game.mode = 'free';
        appState.mode = 'game';
        updateUiMode();
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
    document.getElementById('custColor').addEventListener('change', (e) => StickCustomizerState.color = e.target.value);
    document.getElementById('custModel').addEventListener('change', (e) => StickCustomizerState.model = e.target.value);
    document.getElementById('custShaftGrip').addEventListener('change', (e) => StickCustomizerState.shaftGrip = e.target.checked);
    document.getElementById('custBladeGrip').addEventListener('change', (e) => StickCustomizerState.bladeGrip = e.target.checked);
    document.getElementById('custStickTape').addEventListener('change', (e) => StickCustomizerState.stickTape = e.target.checked);

    document.getElementById('custFlex').addEventListener('input', (e) => {
        StickCustomizerState.flex = e.target.value;
        document.getElementById('custFlexValue').textContent = e.target.value;
    });
    document.getElementById('custKickpoint').addEventListener('change', (e) => StickCustomizerState.kickpoint = e.target.value);

    document.getElementById('custThickness').addEventListener('input', (e) => {
        StickCustomizerState.shaftThickness = parseFloat(e.target.value);
        document.getElementById('custThicknessValue').textContent = parseFloat(e.target.value).toFixed(1);
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
}
