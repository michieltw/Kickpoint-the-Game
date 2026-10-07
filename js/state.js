import * as THREE from 'three';
import { DEFAULT_STIFFNESS_CURVE } from './config.js';

export const appState = { mode: 'splash' }; // 'splash', 'menu', 'game', 'gameSettings', 'settings'

export const state = {
  bottomGlovePos: 50,
  bottomGloveAmp: 100,
  bottomGloveTimeframe: 250,
  topHandAmp: 100,
  topHandTimeframe: 250,
  maxBendAngle: 45,
  topHandPullStartMs: 600,
  topHandPullDownMm: 100,
  followThroughAngle: 50,
  bladeWhipStrength: 100,
  timeline: 600,
  isPlaying: false,
  holdMaxBend: false,
  bendAxis: 'forwards',
  anchorMode: 'bow',
  stiffnessCurve: DEFAULT_STIFFNESS_CURVE.map(point => ({ ...point }))
};

export const game = {
  score: 0,
  shots: 0,
  puck: null,
  puckVelocity: new THREE.Vector3(0, 0, 0),
  net: null,
  ice: null,
  puckState: 'idle', // idle, attached, shot, goal
  shotAim: null,
  contactTime: 0,
  releaseTime: 0,
  shotElapsed: 0,
  shotWobble: 0,
  shotWobbleOffset: 0,
  shotDeviationX: 0,
  flightStart: new THREE.Vector3(),
  flightDuration: 0,
  bladeTipSpeed: 0,
  lastBladeTipPosition: null,
  bladeVelocity: new THREE.Vector3(),
  bladeForwardSpeed: 0,
  peakBladeForwardSpeed: 0,
  bladeDecelerationFrames: 0,
  lastBladeCenterPosition: null,
  replayFrames: [],
  replayRecording: false,
  replayPlayback: null,
  bladeHeelIndex: -1,
  bladeTipIndex: -1,
  bladeContactProgress: 0,
  bladeContactOffset: new THREE.Vector3(),
  bladeContactAxis: new THREE.Vector3(1, 0, 0)
};

export const swipeData = {
   isSwiping: false,
   startY: 0,
   startX: 0,
   startTime: 0,
   puckHitY: 0,
   puckHitTime: 0,
   endY: 0,
   endX: 0,
   endTime: 0,
   power: 0, // speed
   accuracy: 0, // swipe-path error
   path: [],
   triggered: false
};
