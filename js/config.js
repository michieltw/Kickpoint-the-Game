export const L_total = 1400;
export const Z_center = 23;
export const X_center = -100;
export const SEGMENTS = 140;

export const gravity = 9810;
export const puckRadius = 38;
export const rinkWidth = 26000;
export const targetRadius = 240;

export const KICKPOINT_STIFFNESS_CURVES = Object.freeze({
  'ultra-low': [
    { y: 0, x: 0.55 },
    { y: 0.10, x: 0.22 },
    { y: 0.20, x: 0.55 },
    { y: 1.0, x: 0.55 }
  ],
  low: [
    { y: 0, x: 0.55 },
    { y: 0.12, x: 0.55 },
    { y: 0.22, x: 0.25 },
    { y: 0.35, x: 0.55 },
    { y: 1.0, x: 0.55 }
  ],
  'mid-low': [
    { y: 0, x: 0.55 },
    { y: 0.25, x: 0.55 },
    { y: 0.40, x: 0.25 },
    { y: 0.55, x: 0.55 },
    { y: 1.0, x: 0.55 }
  ],
  hybrid: [
    { y: 0, x: 0.55 },
    { y: 0.12, x: 0.55 },
    { y: 0.22, x: 0.25 },
    { y: 0.40, x: 0.55 },
    { y: 0.65, x: 0.25 },
    { y: 0.82, x: 0.55 },
    { y: 1.0, x: 0.55 }
  ],
  mid: [
    { y: 0, x: 0.55 },
    { y: 0.35, x: 0.55 },
    { y: 0.55, x: 0.25 },
    { y: 0.75, x: 0.55 },
    { y: 1.0, x: 0.55 }
  ],
  'amplified-mid': [
    { y: 0, x: 0.55 },
    { y: 0.55, x: 0.55 },
    { y: 0.72, x: 0.25 },
    { y: 0.85, x: 0.55 },
    { y: 1.0, x: 0.55 }
  ],
  high: [
    { y: 0, x: 0.55 },
    { y: 0.72, x: 0.55 },
    { y: 0.88, x: 0.25 },
    { y: 1.0, x: 0.55 }
  ],
  neutral: [
    { y: 0, x: 0.55 },
    { y: 0.33, x: 0.55 },
    { y: 0.66, x: 0.55 },
    { y: 1.0, x: 0.55 }
  ],
  custom: [
    { y: 0, x: 0.55 },
    { y: 0.35, x: 0.55 },
    { y: 0.55, x: 0.25 },
    { y: 0.75, x: 0.55 },
    { y: 1.0, x: 0.55 }
  ]
});

export const DEFAULT_STIFFNESS_CURVE = KICKPOINT_STIFFNESS_CURVES.mid;

export const KICKPOINT_ORDER = Object.freeze([
  'ultra-low',
  'low',
  'mid-low',
  'hybrid',
  'mid',
  'amplified-mid',
  'high'
]);

export const kickpointSpeedBoosts = {
  low: 2.2,          // km/h boost t.o.v. ultra-low bij max power
  'mid-low': 1.8,    // km/h boost t.o.v. low bij max power
  hybrid: 1.2,       // km/h boost t.o.v. mid-low bij max power
  mid: 4.5,          // km/h boost t.o.v. hybrid bij max power (Low -> Mid totaal: ~7.5 km/h)
  'amplified-mid': 2.5,// km/h boost t.o.v. mid bij max power
  high: 2.5          // km/h boost t.o.v. amplified-mid bij max power
};

export function getKickpointCumulativeBoost(kickpoint) {
  let kp = kickpoint || 'mid';
  if (kp === 'neutral' || kp === 'custom') kp = 'hybrid';
  const index = KICKPOINT_ORDER.indexOf(kp);
  if (index <= 0) return 0;
  let cum = 0;
  for (let i = 1; i <= index; i++) {
    const key = KICKPOINT_ORDER[i];
    cum += (kickpointSpeedBoosts[key] ?? 0);
  }
  return cum;
}

export const gameSettings = {
  shotSpeed: 1.9,
  swipeRange: 1,
  kickpointEffect: 1,
  minSwipeSpeed: 0.3,
  precisionTolerance: 12,
  deviationPenalty: 1,
  speedUnit: 'kmh', // 'kmh' or 'mph'
  showShotTracer: true,
  showAimTracer: true
};

export const physicsSettings = {
  baseShotSpeed: 5000,
  whipBonusSpeed: 7000,
  puckDwellTime: 180,
  bladeClearance: 54,
  bladeCatchDistance: 250,
  bladeDecelThreshold: 300,
  releaseSafetyLimit: 420,
  recoilDamping: 2.2,
  recoilFrequency: 2.2,
  handleStiffness: 1.5,
  hoselStiffness: 0.8,
  maxSwingAngleDeg: 78,
  minSwipeDistance: 100,
  swipePowerMultiplier: 28,
  aimSensitivity: 1.5,
  gravityValue: 9810,
  puckWobbleFactor: 1.0,
  stickLength: 1400,
  animPlaybackMultiplier: 1.0,
  releaseSpeedMultiplier: 1.0,
  releaseDuration: 400
};

export const StickCustomizerState = {
  handedness: 'right',
  color: '#ffffff',
  shaftGrip: false,
  bladeGrip: false,
  stickTape: false,
  shaftShape: 'micro-concaaf',
  shaftSurface: 'mat-without-grip',
  shaft3dGrip: 'fully-covered',
  bladeCurve: 'P28',
  bladeTexture: '3d-texture',
  flex: 90,
  ageCategory: 'SR',
  kickpoint: 'mid',
  shaftThickness: 2.0, // mm
  shaftWall: 'very-thin'
};

export const GOAL = Object.freeze({
    width: 1830,
    height: 1220,
    depth: 1000,
    rearWidth: 1400,
    rearHeight: 900,
    rearTopDepth: 400,
    cornerRadius: 215,
    postRadius: 30
});

export const flightMinTime = 0.02;
export const flightMaxTime = 4;
