import { appState, game } from './state.js';
import { gameSettings } from './config.js';

export const KICKPOINT_LOGOS = Object.freeze({
  low: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Lowkplogo.png?v=1790252741',
  hybrid: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Hybridkplogo.png?v=1790252741',
  mid: 'https://cdn.shopify.com/s/files/1/1038/7203/7203/files/Midkplogo.png?v=1790253037'
});

export const KICKPOINT_COLORS = Object.freeze({
  low: '#38bdf8',
  hybrid: '#ef4444',
  mid: '#eab308'
});

export const KICKPOINT_NAMES = Object.freeze({
  low: 'Low Kick',
  hybrid: 'Hybrid Kick',
  mid: 'Mid Kick'
});

let currentSortBy = 'speed'; // 'speed' | 'release'
let currentFilter = 'all';   // 'all' | 'low' | 'hybrid' | 'mid'
let hoveredShotId = null;

/**
 * Record a shot in the tutorial trial dataset
 */
export function recordTrialShot(shotData) {
  if (!appState.tutorial) return null;
  if (!Array.isArray(appState.tutorial.trialShots)) {
    appState.tutorial.trialShots = [];
  }

  const kp = shotData.kickpoint || 'low';
  const shotsForKp = appState.tutorial.trialShots.filter(s => s.kickpoint === kp).length;
  const shotNumberForKp = shotsForKp + 1;
  const totalCount = appState.tutorial.trialShots.length + 1;

  const speedKmh = Number(Number(shotData.speedKmh || 78).toFixed(1));
  const speedMph = Number((speedKmh * 0.621371).toFixed(1));
  const releaseMs = Math.round(shotData.releaseMs || 150);
  const pathError = Number(shotData.pathError || 0);

  // Compute accuracy rating: 100% is perfectly straight stroke with zero lateral drift
  const accuracyPercent = Math.max(45, Math.min(100, Math.round(100 - (pathError / 6))));

  const record = {
    id: totalCount,
    shotNumberForKp,
    kickpoint: kp,
    kickpointName: KICKPOINT_NAMES[kp] || 'Stick',
    logoUrl: KICKPOINT_LOGOS[kp] || KICKPOINT_LOGOS.low,
    color: KICKPOINT_COLORS[kp] || '#38bdf8',
    speedKmh,
    speedMph,
    releaseMs,
    pathError,
    accuracyPercent,
    // Landing spot on goal plane (in mm)
    targetX: shotData.crossingX !== null && shotData.crossingX !== undefined ? shotData.crossingX : (shotData.flightTargetX || 0),
    targetY: shotData.crossingY !== null && shotData.crossingY !== undefined ? shotData.crossingY : (shotData.flightTargetY || 350),
    aimX: shotData.aimX || 0,
    aimY: shotData.aimY || 300,
    isGoal: Boolean(shotData.isGoal)
  };

  appState.tutorial.trialShots.push(record);
  return record;
}

/**
 * Compute average metrics for each of the three kickpoints
 */
export function getKickpointAverages(shots = []) {
  const result = {};
  ['low', 'hybrid', 'mid'].forEach(kp => {
    const list = shots.filter(s => s.kickpoint === kp);
    if (!list.length) {
      result[kp] = {
        count: 0,
        avgSpeedKmh: 0,
        avgSpeedMph: 0,
        avgReleaseMs: 0,
        avgAccuracy: 0,
        bestSpeedKmh: 0,
        bestReleaseMs: 0
      };
      return;
    }

    const sumSpeedKmh = list.reduce((acc, s) => acc + s.speedKmh, 0);
    const sumRelease = list.reduce((acc, s) => acc + s.releaseMs, 0);
    const sumAccuracy = list.reduce((acc, s) => acc + s.accuracyPercent, 0);

    const avgSpeedKmh = Number((sumSpeedKmh / list.length).toFixed(1));
    const avgSpeedMph = Number((avgSpeedKmh * 0.621371).toFixed(1));
    const avgReleaseMs = Math.round(sumRelease / list.length);
    const avgAccuracy = Math.round(sumAccuracy / list.length);

    const bestSpeedKmh = Math.max(...list.map(s => s.speedKmh));
    const bestReleaseMs = Math.min(...list.map(s => s.releaseMs));

    result[kp] = {
      count: list.length,
      avgSpeedKmh,
      avgSpeedMph,
      avgReleaseMs,
      avgAccuracy,
      bestSpeedKmh,
      bestReleaseMs
    };
  });

  return result;
}

/**
 * Returns sorted and filtered shot records with rankings
 */
export function getRankedShots(shots = [], sortBy = 'speed', filterKp = 'all') {
  let list = [...shots];
  if (filterKp && filterKp !== 'all') {
    list = list.filter(s => s.kickpoint === filterKp);
  }

  list.sort((a, b) => {
    if (sortBy === 'release') {
      // Quickest release (lowest ms) gets highest rank
      return a.releaseMs - b.releaseMs;
    }
    // Hardest shot (highest km/h) gets highest rank
    return b.speedKmh - a.speedKmh;
  });

  return list.map((shot, index) => ({
    ...shot,
    rank: index + 1
  }));
}

/**
 * Render the 2D hockey goal shot distribution graph on HTML5 canvas
 */
export function renderShotDistributionCanvas(canvas, shots = [], highlightedShotId = null) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 600;
  const height = rect.height || 380;

  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  // Background stadium ice atmosphere
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, '#0a101d');
  bgGrad.addColorStop(0.65, '#0f172a');
  bgGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Goal geometry parameters (regulation ratio 1830 x 1220 mm)
  const marginX = 70;
  const marginBottom = 50;
  const marginTop = 40;
  const goalWidth = width - marginX * 2;
  const goalHeight = height - marginBottom - marginTop;
  const goalLeft = marginX;
  const goalRight = goalLeft + goalWidth;
  const goalBottom = height - marginBottom;
  const goalTop = goalBottom - goalHeight;
  const goalCenterX = width / 2;

  // Ice surface
  ctx.fillStyle = 'rgba(226, 232, 240, 0.08)';
  ctx.fillRect(0, goalBottom, width, marginBottom);

  // Red Goal line on ice
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, goalBottom);
  ctx.lineTo(width, goalBottom);
  ctx.stroke();

  // Net interior mesh pattern
  ctx.save();
  ctx.beginPath();
  ctx.rect(goalLeft, goalTop, goalWidth, goalHeight);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.lineWidth = 1;
  const meshStep = 18;
  for (let x = goalLeft - goalHeight; x < goalRight + goalHeight; x += meshStep) {
    ctx.beginPath();
    ctx.moveTo(x, goalTop);
    ctx.lineTo(x + goalHeight, goalBottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + goalHeight, goalTop);
    ctx.lineTo(x, goalBottom);
    ctx.stroke();
  }
  ctx.restore();

  // 4 Hockey Target Rings (Top-Left, Top-Right, Bottom-Left, Bottom-Right)
  const targetRadius = 32;
  const targetCenters = [
    { x: goalLeft + 55, y: goalTop + 55 },
    { x: goalRight - 55, y: goalTop + 55 },
    { x: goalLeft + 55, y: goalBottom - 55 },
    { x: goalRight - 55, y: goalBottom - 55 }
  ];
  targetCenters.forEach(tc => {
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tc.x, tc.y, targetRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
    ctx.beginPath();
    ctx.arc(tc.x, tc.y, targetRadius * 0.45, 0, Math.PI * 2);
    ctx.fill();
  });

  // Goal Crossbar & Posts (Regulation red posts)
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#dc2626'; // Goal red

  ctx.beginPath();
  ctx.moveTo(goalLeft, goalBottom);
  ctx.lineTo(goalLeft, goalTop + 14);
  ctx.arcTo(goalLeft, goalTop, goalLeft + 14, goalTop, 14);
  ctx.lineTo(goalRight - 14, goalTop);
  ctx.arcTo(goalRight, goalTop, goalRight, goalTop + 14, 14);
  ctx.lineTo(goalRight, goalBottom);
  ctx.stroke();

  // White inner post highlight
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.moveTo(goalLeft + 2, goalBottom);
  ctx.lineTo(goalLeft + 2, goalTop + 14);
  ctx.arcTo(goalLeft + 2, goalTop + 2, goalLeft + 14, goalTop + 2, 12);
  ctx.lineTo(goalRight - 14, goalTop + 2);
  ctx.arcTo(goalRight - 2, goalTop + 2, goalRight - 2, goalTop + 14, 12);
  ctx.lineTo(goalRight - 2, goalBottom);
  ctx.stroke();

  // Center crosshair
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(goalCenterX, goalTop);
  ctx.lineTo(goalCenterX, goalBottom);
  ctx.moveTo(goalLeft, goalTop + goalHeight / 2);
  ctx.lineTo(goalRight, goalTop + goalHeight / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Plot shots
  // Regulation mm range: X from -915 mm to +915 mm, Y from 0 to 1220 mm
  shots.forEach((shot, index) => {
    const rawX = Number(shot.targetX || 0);
    const rawY = Number(shot.targetY || 400);

    // Map mm to canvas pixels
    const normX = rawX / 915; // -1 to +1 inside goal
    const normY = rawY / 1220; // 0 (ice) to 1 (crossbar)

    const posX = goalCenterX + normX * (goalWidth / 2);
    const posY = goalBottom - normY * goalHeight;

    // Dot sizing based on accuracy error:
    // Small error (< 25 mm) = small dot (radius 6px)
    // Larger error (100+ mm) = correspondingly larger dot (up to 20px)
    const err = Math.max(0, shot.pathError || 0);
    const dotRadius = Math.max(6, Math.min(22, 6 + (err / 8)));

    const isHovered = (shot.id === hoveredShotId) || (shot.id === highlightedShotId);

    // Draw shadow/glow
    ctx.save();
    ctx.shadowColor = shot.color;
    ctx.shadowBlur = isHovered ? 16 : 8;

    // Dot fill (semi-transparent so overlapping clusters are clearly visible)
    ctx.fillStyle = isHovered
      ? shot.color
      : (shot.color + 'b3'); // ~70% opacity
    ctx.beginPath();
    ctx.arc(posX, posY, dotRadius, 0, Math.PI * 2);
    ctx.fill();

    // Dot stroke
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = isHovered ? 3 : 1.5;
    ctx.stroke();

    // Shot identifier label (e.g. L1, M2, H3)
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tag = (shot.kickpoint[0].toUpperCase()) + (shot.shotNumberForKp || (index + 1));
    ctx.fillText(tag, posX, posY);

    ctx.restore();
  });

  ctx.restore();
}

/**
 * Open and display the Stick Trial Ranking modal
 */
export function showTrialRankingModal() {
  const modal = document.getElementById('stick-trial-ranking-modal');
  const backdrop = document.getElementById('stick-trial-ranking-backdrop');
  if (!modal) return;

  const shots = appState.tutorial?.trialShots || [];
  renderTrialRankingView(shots);

  if (backdrop) backdrop.hidden = false;
  modal.hidden = false;
}

/**
 * Hide the Stick Trial Ranking modal
 */
export function hideTrialRankingModal() {
  const modal = document.getElementById('stick-trial-ranking-modal');
  const backdrop = document.getElementById('stick-trial-ranking-backdrop');
  if (modal) modal.hidden = true;
  if (backdrop) backdrop.hidden = true;
}

/**
 * Re-render the ranking view contents (averages, table, canvas)
 */
export function renderTrialRankingView(shots = appState.tutorial?.trialShots || []) {
  const averages = getKickpointAverages(shots);
  const ranked = getRankedShots(shots, currentSortBy, currentFilter);

  // 1. Render Averages Grid (Low, Hybrid, Mid)
  const averagesGrid = document.getElementById('rankingAveragesGrid');
  if (averagesGrid) {
    const kps = ['low', 'hybrid', 'mid'];
    averagesGrid.innerHTML = kps.map(kp => {
      const data = averages[kp];
      const logo = KICKPOINT_LOGOS[kp];
      const name = KICKPOINT_NAMES[kp];
      const color = KICKPOINT_COLORS[kp];
      const unit = gameSettings?.speedUnit === 'mph' ? 'MPH' : 'KM/U';
      const speedVal = gameSettings?.speedUnit === 'mph' ? data.avgSpeedMph : data.avgSpeedKmh;

      let perkText = '';
      if (kp === 'low') perkText = '⚡ Snelste release &amp; snap quickness';
      else if (kp === 'hybrid') perkText = '⚖️ Optimale balans all-rounder';
      else if (kp === 'mid') perkText = '💥 Maximale laadkracht &amp; schotsnelheid';

      return `
        <div class="ranking-avg-card" style="border-top: 3px solid ${color};">
          <div class="ranking-avg-header">
            <img src="${logo}" alt="" class="ranking-kp-logo-img">
          </div>
          <div class="ranking-avg-stats">
            <div class="ranking-avg-stat-item">
              <span class="ranking-stat-label">Gem. Snelheid</span>
              <strong class="ranking-stat-value" style="color: ${color};">${speedVal} ${unit}</strong>
            </div>
            <div class="ranking-avg-stat-item">
              <span class="ranking-stat-label">Gem. Release</span>
              <strong class="ranking-stat-value">${data.avgReleaseMs} ms</strong>
            </div>
            <div class="ranking-avg-stat-item">
              <span class="ranking-stat-label">Gem. Precisie</span>
              <strong class="ranking-stat-value">${data.avgAccuracy}%</strong>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 2. Render Ranked Table Rows
  const tableBody = document.getElementById('rankingTableBody');
  if (tableBody) {
    if (!ranked.length) {
      tableBody.innerHTML = '<div class="ranking-empty-notice">Nog geen schoten geregistreerd. Voltooi schoten in de trial!</div>';
    } else {
      tableBody.innerHTML = ranked.map(shot => {
        const isSpeedSort = currentSortBy === 'speed';
        const isReleaseSort = currentSortBy === 'release';
        const unit = gameSettings?.speedUnit === 'mph' ? 'mph' : 'km/u';
        const speedVal = gameSettings?.speedUnit === 'mph' ? shot.speedMph : shot.speedKmh;

        let rankBadgeClass = 'rank-default';
        if (shot.rank === 1) rankBadgeClass = 'rank-gold';
        else if (shot.rank === 2) rankBadgeClass = 'rank-silver';
        else if (shot.rank === 3) rankBadgeClass = 'rank-bronze';

        const dotSize = Math.max(6, Math.min(18, 6 + (shot.pathError / 8)));

        return `
          <div class="ranking-table-row" data-shot-id="${shot.id}">
            <div class="col-rank">
              <span class="rank-badge ${rankBadgeClass}">#${shot.rank}</span>
            </div>
            <div class="col-stick">
              <img src="${shot.logoUrl}" alt="" class="ranking-row-logo">
              <span class="ranking-shot-sub">Schot ${shot.shotNumberForKp}</span>
            </div>
            <div class="col-speed ${isSpeedSort ? 'highlight-stat' : ''}">
              <strong>${speedVal} ${unit}</strong>
            </div>
            <div class="col-release ${isReleaseSort ? 'highlight-stat' : ''}">
              <strong>${shot.releaseMs} ms</strong>
            </div>
            <div class="col-acc">
              <span class="acc-dot" style="width: ${dotSize}px; height: ${dotSize}px; background: ${shot.color};"></span>
              <span>${shot.accuracyPercent}%</span>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 3. Render Canvas
  const canvas = document.getElementById('trialShotDistributionCanvas');
  if (canvas) {
    renderShotDistributionCanvas(canvas, ranked, hoveredShotId);
  }
}

/**
 * Initialize event listeners for the ranking modal
 */
export function initTrialRankingModal(onContinueCrossbar, onToCustomizer) {
  const modal = document.getElementById('stick-trial-ranking-modal');
  if (!modal) return;

  // Close buttons
  document.getElementById('btnCloseTrialRanking')?.addEventListener('click', hideTrialRankingModal);
  document.getElementById('stick-trial-ranking-backdrop')?.addEventListener('click', hideTrialRankingModal);

  // Continue to Crossbar Challenge
  document.getElementById('btnRankingContinueCrossbar')?.addEventListener('click', () => {
    hideTrialRankingModal();
    if (typeof onContinueCrossbar === 'function') {
      onContinueCrossbar();
    }
  });

  // To Stick Customizer
  document.getElementById('btnRankingToCustomizer')?.addEventListener('click', () => {
    hideTrialRankingModal();
    if (typeof onToCustomizer === 'function') {
      onToCustomizer();
    }
  });

  // Sort buttons (Speed vs Release)
  const btnSortSpeed = document.getElementById('btnSortBySpeed');
  const btnSortRelease = document.getElementById('btnSortByRelease');

  btnSortSpeed?.addEventListener('click', () => {
    currentSortBy = 'speed';
    btnSortSpeed.classList.add('active');
    btnSortRelease?.classList.remove('active');
    renderTrialRankingView();
  });

  btnSortRelease?.addEventListener('click', () => {
    currentSortBy = 'release';
    btnSortRelease.classList.add('active');
    btnSortSpeed?.classList.remove('active');
    renderTrialRankingView();
  });

  // Filter chips
  document.querySelectorAll('.ranking-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.ranking-filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.getAttribute('data-filter') || 'all';
      renderTrialRankingView();
    });
  });

  // Interactive Canvas Tooltip on Hover
  const canvas = document.getElementById('trialShotDistributionCanvas');
  const tooltip = document.getElementById('trialGraphTooltip');
  if (canvas && tooltip) {
    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const shots = appState.tutorial?.trialShots || [];
      const dpr = window.devicePixelRatio || 1;
      const width = rect.width;
      const height = rect.height;

      const marginX = 70;
      const marginBottom = 50;
      const marginTop = 40;
      const goalWidth = width - marginX * 2;
      const goalHeight = height - marginBottom - marginTop;
      const goalBottom = height - marginBottom;
      const goalCenterX = width / 2;

      let found = null;
      let minDistance = 25; // hit threshold

      shots.forEach(shot => {
        const normX = Number(shot.targetX || 0) / 915;
        const normY = Number(shot.targetY || 400) / 1220;
        const posX = goalCenterX + normX * (goalWidth / 2);
        const posY = goalBottom - normY * goalHeight;
        const dist = Math.hypot(posX - mouseX, posY - mouseY);
        if (dist < minDistance) {
          minDistance = dist;
          found = { shot, posX, posY };
        }
      });

      if (found) {
        hoveredShotId = found.shot.id;
        tooltip.hidden = false;
        tooltip.style.left = `${found.posX + 12}px`;
        tooltip.style.top = `${found.posY - 12}px`;
        tooltip.innerHTML = `
          <div style="font-weight: 700; color: ${found.shot.color};">${found.shot.kickpointName} · Schot #${found.shot.shotNumberForKp}</div>
          <div>Snelheid: <strong>${found.shot.speedKmh} km/u</strong></div>
          <div>Release: <strong>${found.shot.releaseMs} ms</strong></div>
          <div>Precisie: <strong>${found.shot.accuracyPercent}%</strong> (afwijking: ${Math.round(found.shot.pathError)} mm)</div>
        `;
        renderShotDistributionCanvas(canvas, getRankedShots(shots, currentSortBy, currentFilter), hoveredShotId);
      } else {
        if (hoveredShotId !== null) {
          hoveredShotId = null;
          tooltip.hidden = true;
          renderShotDistributionCanvas(canvas, getRankedShots(shots, currentSortBy, currentFilter), null);
        }
      }
    });

    canvas.addEventListener('mouseleave', () => {
      hoveredShotId = null;
      tooltip.hidden = true;
      const shots = appState.tutorial?.trialShots || [];
      renderShotDistributionCanvas(canvas, getRankedShots(shots, currentSortBy, currentFilter), null);
    });
  }

  // Button in tutorial HUD to view ranking
  document.getElementById('btnShowTrialRanking')?.addEventListener('click', showTrialRankingModal);
}

