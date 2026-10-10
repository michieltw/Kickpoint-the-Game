export const STICK_EFFECT_LIMITS = Object.freeze({
  quickness: Object.freeze({ min: 0.65, max: 1.5 }),
  puckSpeed: Object.freeze({ min: 0.65, max: 1.5 }),
  accuracy: Object.freeze({ min: 0.6, max: 1.5 }),
  shotTendency: Object.freeze({ min: -0.25, max: 0.25 })
});

export const STICK_MODIFIER_RULES = Object.freeze({
  shaftGrip: {
    values: { false: 0, true: 1 },
    effects: {}
  },
  shaftSurface: {
    presets: {
      'mat-without-grip': {},
      'mat-with-grip': { puckSpeed: 1.02, accuracy: 1.01 },
      'gloss-without-grip': {},
      'gloss-with-grip': { puckSpeed: 1.02, accuracy: 1.01 },
      'supergloss-with-grip': { puckSpeed: 1.02, accuracy: 1.01 }
    },
    effects: {}
  },
  shaftShape: {
    values: { 'micro-concaaf': 0, concaaf: 0, pentagon: 0 },
    effects: {}
  },
  shaft3dGrip: {
    values: {
      'fully-covered': 0,
      'candy-cane': 0,
      herringbone: 0,
      'right-angles': 0,
      'slanted-angles': 0,
      none: 0
    },
    effects: {}
  },
  bladeCurve: {
    presets: {
      P02: { quickness: 0.96, puckSpeed: 1.02, accuracy: 1.05, shotTendencyY: -0.005 },
      P08: { quickness: 1.01, puckSpeed: 1.00, accuracy: 1.02, shotTendencyY: 0.008 },
      P14: { quickness: 1.00, puckSpeed: 0.99, accuracy: 1.03, shotTendencyY: 0.008 },
      P92: { quickness: 1.00, puckSpeed: 1.00, accuracy: 1.00, shotTendencyY: 0.005 },
      P28: { quickness: 1.04, puckSpeed: 1.03, accuracy: 1.02, shotTendencyY: 0.025 },
      P28JR: { quickness: 1.04, puckSpeed: 1.02, accuracy: 1.01, shotTendencyY: 0.022 },
      P28M: { quickness: 1.03, puckSpeed: 1.02, accuracy: 1.02, shotTendencyY: 0.021 },
      P77: { quickness: 1.00, puckSpeed: 1.02, accuracy: 1.01, shotTendencyY: 0.008 },
      P88: { quickness: 0.95, puckSpeed: 0.95, accuracy: 1.04, shotTendencyY: 0.001 },
      P90TM: { quickness: 1.02, puckSpeed: 1.01, accuracy: 1.01, shotTendencyY: 0.015 },
      P91: { quickness: 0.98, puckSpeed: 0.99, accuracy: 1.05, shotTendencyY: 0.002 },
      P92JR: { quickness: 1.01, puckSpeed: 1.00, accuracy: 1.02, shotTendencyY: 0.005 },
      P92M: { quickness: 1.01, puckSpeed: 1.00, accuracy: 1.03, shotTendencyY: 0.008 }
    },
    effects: {}
  },
  bladeTexture: {
    presets: {
      '3d-texture': { accuracy: 1.01 },
      sanded: { accuracy: 1.01 },
      'matte-no-texture': {},
      'gloss-no-texture': {}
    },
    effects: {}
  },
  shaftWall: {
    values: {
      'ultra-thin': -1,
      'flinter-thin': -0.5,
      'very-thin': 0,
      thin: 0.5,
      regular: 1
    },
    effects: {}
  },
  bladeGrip: {
    values: { false: 0, true: 1 },
    effects: {}
  },
  stickTape: {
    values: { false: 0, true: 1 },
    effects: {}
  },
  flex: {
    min: 65,
    max: 120,
    neutral: 85,
    effects: {
      quickness: { curve: 'neutral', strength: 0 },
      puckSpeed: { curve: 'neutral', strength: 0 },
      accuracy: { curve: 'neutral', strength: 0 }
    }
  },
  kickpoint: {
    values: { low: -1, hybrid: 0, mid: 1 },
    effects: {
      quickness: { curve: 'neutral', strength: 0 },
      puckSpeed: { curve: 'neutral', strength: 0 },
      accuracy: { curve: 'neutral', strength: 0 },
      shotTendencyY: { curve: 'neutral', strength: 0 }
    }
  },
  shaftThickness: {
    min: 1,
    max: 4,
    neutral: 2,
    effects: {
      puckSpeed: { curve: 'linear', negativeStrength: 0.075, positiveStrength: -0.15 }
    }
  }
});

function getNormalizedValue(value, rule) {
  if (rule.values) {
    const level = rule.values[String(value)];
    return Number.isFinite(level) ? Math.max(-1, Math.min(1, level)) : 0;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || rule.min === rule.neutral || rule.max === rule.neutral) return 0;
  const normalized = numericValue >= rule.neutral
    ? (numericValue - rule.neutral) / (rule.max - rule.neutral)
    : (numericValue - rule.neutral) / (rule.neutral - rule.min);
  return Math.max(-1, Math.min(1, normalized));
}

function getCurveDelta(normalizedValue, effect) {
  const { curve = 'neutral', strength = 0, curvature = 2 } = effect;
  const directionalStrength = normalizedValue < 0
    ? effect.negativeStrength ?? strength
    : effect.positiveStrength ?? strength;
  if (curve === 'neutral' || directionalStrength === 0 || normalizedValue === 0) return 0;

  const magnitude = Math.abs(normalizedValue);
  const hasExplicitDirection = normalizedValue < 0
    ? effect.negativeStrength !== undefined
    : effect.positiveStrength !== undefined;
  const direction = hasExplicitDirection
    ? Math.sign(directionalStrength)
    : Math.sign(normalizedValue) * Math.sign(directionalStrength);
  const amount = Math.abs(directionalStrength);

  switch (curve) {
    case 'linear':
      return direction * amount * magnitude;
    case 'exponential': {
      const exponent = Math.max(0.01, curvature);
      return direction * amount * (Math.exp(exponent * magnitude) - 1) / (Math.exp(exponent) - 1);
    }
    case 'hyperbolic': {
      const bend = Math.max(0, curvature);
      return direction * amount * magnitude * (1 + bend) / (1 + bend * magnitude);
    }
    case 'fixed':
      return direction * amount;
    default:
      throw new RangeError(`Unknown stick effect curve: ${curve}`);
  }
}

function clamp(value, limits) {
  return Math.max(limits.min, Math.min(limits.max, value));
}

export function getStickShotModifiers(customizer = {}) {
  const totals = {
    quickness: 1,
    puckSpeed: 1,
    accuracy: 1,
    shotTendencyX: 0,
    shotTendencyY: 0
  };

  for (const [option, rule] of Object.entries(STICK_MODIFIER_RULES)) {
    const normalizedValue = getNormalizedValue(customizer[option], rule);
    for (const [target, effect] of Object.entries(rule.effects)) {
      const delta = getCurveDelta(normalizedValue, effect);
      if (target === 'shotTendencyX' || target === 'shotTendencyY') {
        totals[target] += delta;
      } else {
        totals[target] *= 1 + delta;
      }
    }

    const preset = rule.presets?.[String(customizer[option])];
    if (preset) {
      for (const [target, multiplier] of Object.entries(preset)) {
        if (target === 'shotTendencyX' || target === 'shotTendencyY') {
          totals[target] += multiplier;
        } else {
          totals[target] *= multiplier;
        }
      }
    }
  }

  totals.quickness = clamp(totals.quickness, STICK_EFFECT_LIMITS.quickness);
  totals.puckSpeed = clamp(totals.puckSpeed, STICK_EFFECT_LIMITS.puckSpeed);
  totals.accuracy = clamp(totals.accuracy, STICK_EFFECT_LIMITS.accuracy);
  totals.shotTendencyX = clamp(totals.shotTendencyX, STICK_EFFECT_LIMITS.shotTendency);
  totals.shotTendencyY = clamp(totals.shotTendencyY, STICK_EFFECT_LIMITS.shotTendency);
  return totals;
}
