import { appState } from './state.js';
import { updateUiMode } from './ui.js';
import { StickCustomizerState } from './config.js';

// Helper to trigger the main model load since handleStickModelChange is private in main.js
// but we can trigger it via firing the change event on custKickpoint
function triggerStickUpdate(kickpoint) {
    StickCustomizerState.kickpoint = kickpoint;
    const custKickpoint = document.getElementById('custKickpoint');
    if (custKickpoint) {
        custKickpoint.value = kickpoint;
        custKickpoint.dispatchEvent(new Event('change'));
    } else {
        window.dispatchEvent(new CustomEvent('tutorialKickpointSwitched'));
    }
}

export function startTutorial() {
    // Show handedness popup before actually starting the first phase
    document.getElementById('handedness-popup').style.display = 'block';
}

function beginTutorialPhases() {
    appState.tutorial = {
        isActive: true,
        phase: 1, // 1: Low Kick, 2: Mid Kick, 3: Hybrid Kick, 4: Crossbar challenge
        shotsTaken: 0,
        hits: 0,
        maxShotsPerPhase: 3
    };

    // Start with low kick
    triggerStickUpdate('low');

    // Show tutorial HUD
    document.getElementById('tutorial-hud').style.display = 'flex';
    document.getElementById('tutorial-phase').innerText = 'Phase 1: Low Kick (0/3)';
    document.getElementById('tutorial-instruction').innerText = 'Take 3 shots to feel the quick release of the Low Kick stick.';
    document.getElementById('crossbar-selection').style.display = 'none';
}

export function selectTutorialHandedness(handedness) {
    document.getElementById('handedness-popup').style.display = 'none';
    const custHandedness = document.getElementById('custHandedness');
    if (custHandedness) {
        custHandedness.value = handedness;
        custHandedness.dispatchEvent(new Event('change'));
    }
    beginTutorialPhases();
}

export function skipTutorialHandedness() {
    document.getElementById('handedness-popup').style.display = 'none';
    beginTutorialPhases();
}

window.selectTutorialHandedness = selectTutorialHandedness;
window.skipTutorialHandedness = skipTutorialHandedness;

export function handleTutorialShotComplete() {
    if (!appState.tutorial || !appState.tutorial.isActive) return;

    if (appState.tutorial.phase < 4) {
        appState.tutorial.shotsTaken++;

        let phaseName = '';
        if (appState.tutorial.phase === 1) phaseName = 'Low Kick';
        else if (appState.tutorial.phase === 2) phaseName = 'Mid Kick';
        else if (appState.tutorial.phase === 3) phaseName = 'Hybrid Kick';

        document.getElementById('tutorial-phase').innerText = `Phase ${appState.tutorial.phase}: ${phaseName} (${appState.tutorial.shotsTaken}/${appState.tutorial.maxShotsPerPhase})`;

        if (appState.tutorial.shotsTaken >= appState.tutorial.maxShotsPerPhase) {
            appState.tutorial.phase++;
            appState.tutorial.shotsTaken = 0;

            if (appState.tutorial.phase === 2) {
                document.getElementById('tutorial-phase').innerText = 'Phase 2: Mid Kick (0/3)';
                document.getElementById('tutorial-instruction').innerText = 'Notice the different flex point and shot power.';
                triggerStickUpdate('mid');
            } else if (appState.tutorial.phase === 3) {
                document.getElementById('tutorial-phase').innerText = 'Phase 3: Hybrid Kick (0/3)';
                document.getElementById('tutorial-instruction').innerText = 'A balance between quick release and power.';
                triggerStickUpdate('hybrid');
            } else if (appState.tutorial.phase === 4) {
                // Move to crossbar challenge
                setupCrossbarChallenge();
            }
        }
    } else if (appState.tutorial.phase === 4) {
        // Handled differently via main.js checking crossbar hits, but count missed shots
    }
}

function setupCrossbarChallenge() {
    document.getElementById('tutorial-phase').innerText = 'Phase 4: Crossbar Challenge';
    document.getElementById('tutorial-instruction').innerText = 'Choose your preferred stick and hit the crossbar from the blue line!';

    // Show stick selection for crossbar challenge
    document.getElementById('crossbar-selection').style.display = 'flex';

    // The puck reset logic in main.js handles placing it at the blue line
}

export function selectCrossbarStick(kickpoint) {
    triggerStickUpdate(kickpoint);
    window.dispatchEvent(new CustomEvent("tutorialKickpointSwitched"));
    document.getElementById('crossbar-selection').style.display = 'none';
    document.getElementById('tutorial-instruction').innerText = 'Hit the crossbar!';
}

export function endTutorial() {
    appState.tutorial.isActive = false;
    document.getElementById('tutorial-hud').style.display = 'none';

    // Go to customizer
    appState.mode = 'customizer';
    updateUiMode();
    window.dispatchEvent(new CustomEvent('tutorialKickpointSwitched'));
}

window.selectCrossbarStick = selectCrossbarStick;
