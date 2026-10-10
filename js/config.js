export const L_total = 1400;
export const Z_center = 23;
export const X_center = -100;
export const SEGMENTS = 140;

export const DEFAULT_STIFFNESS_CURVE = [
  { y: 0, x: 0.5 },
  { y: 0.33, x: 0.5 },
  { y: 0.66, x: 0.5 },
  { y: 1, x: 0.5 }
];

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
  kickpoint: 'mid',
  shaftThickness: 2.0, // mm
  shaftWall: 'very-thin'
};
