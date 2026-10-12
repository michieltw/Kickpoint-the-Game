import { appState } from './state.js';
import { updateUiMode, applyKickpointPreset } from './ui.js';
import { StickCustomizerState } from './config.js';
import { recordTrialShot, showTrialRankingModal, initTrialRankingModal } from './tutorial-ranking.js';

// Helper to trigger the main model load since handleStickModelChange is private in main.js
// but we can trigger it via firing the change event on custKickpoint
function triggerStickUpdate(kickpoint) {
    StickCustomizerState.kickpoint = kickpoint;
    applyKickpointPreset(kickpoint);
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
    const popup = document.getElementById('handedness-popup');
    if (popup) {
        popup.hidden = false;
        popup.style.display = 'block';
    }
}

function beginTutorialPhases() {
    appState.tutorial = {
        isActive: true,
        phase: 1, // 1: Low Kick, 2: Mid Kick, 3: Hybrid Kick, 4: Crossbar challenge
        shotsTaken: 0,
        hits: 0,
        maxShotsPerPhase: 3,
        trialShots: []
    };

    // Initialize ranking modal hooks
    initTrialRankingModal(setupCrossbarChallenge, endTutorial);

    // Hide ranking button until all trial shots are completed
    const btnRanking = document.getElementById('btnShowTrialRanking');
    if (btnRanking) btnRanking.style.display = 'none';

    // Start with low kick
    triggerStickUpdate('low');

    // Show tutorial HUD
    const hud = document.getElementById('tutorial-hud');
    if (hud) hud.style.display = 'flex';
    document.getElementById('tutorial-phase').innerText = 'Phase 1: Low Kick (0/3)';
    document.getElementById('tutorial-instruction').innerText = 'Take 3 shots to feel the quick release of the Low Kick stick.';
    const crossbar = document.getElementById('crossbar-selection');
    if (crossbar) {
        crossbar.hidden = true;
        crossbar.style.display = 'none';
    }
}

export function selectTutorialHandedness(handedness) {
    const popup = document.getElementById('handedness-popup');
    if (popup) {
        popup.hidden = true;
        popup.style.display = 'none';
    }
    const custHandedness = document.getElementById('custHandedness');
    if (custHandedness) {
        custHandedness.value = handedness;
        custHandedness.dispatchEvent(new Event('change'));
    }
    beginTutorialPhases();
}

export function skipTutorial() {
    const popup = document.getElementById('handedness-popup');
    if (popup) {
        popup.hidden = true;
        popup.style.display = 'none';
    }
    const hud = document.getElementById('tutorial-hud');
    if (hud) {
        hud.style.display = 'none';
    }
    appState.tutorial = {
        isActive: false,
        phase: 0,
        shotsTaken: 0,
        hits: 0,
        maxShotsPerPhase: 3,
        trialShots: []
    };
    appState.mode = 'menu';
    updateUiMode();
    window.dispatchEvent(new CustomEvent('tutorialKickpointSwitched'));
}

export const skipTutorialHandedness = skipTutorial;

window.selectTutorialHandedness = selectTutorialHandedness;
window.skipTutorial = skipTutorial;
window.skipTutorialHandedness = skipTutorial;

export function handleTutorialShotComplete(shotData) {
    if (!appState.tutorial || !appState.tutorial.isActive) return;

    if (shotData) {
        recordTrialShot(shotData);
    }

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
                // Completed all 3 sticks (3 shots each, 9 shots total)!
                // Enable HUD ranking button so player can re-open results anytime
                const btnRanking = document.getElementById('btnShowTrialRanking');
                if (btnRanking) btnRanking.style.display = 'inline-flex';

                // Display the Stick Trial Ranking modal with rankings, averages, and shot distribution graph
                showTrialRankingModal();
            }
        }
    } else if (appState.tutorial.phase === 4) {
        // Handled differently via main.js checking crossbar hits, but count missed shots
    }
}

export function setupCrossbarChallenge() {
    document.getElementById('tutorial-phase').innerText = 'Phase 4: Crossbar Challenge';
    document.getElementById('tutorial-instruction').innerText = 'Choose your preferred stick and hit the crossbar from the blue line!';

    // Show stick selection for crossbar challenge
    const crossbar = document.getElementById('crossbar-selection');
    if (crossbar) {
        crossbar.hidden = false;
        crossbar.style.display = 'flex';
    }

    const btnRanking = document.getElementById('btnShowTrialRanking');
    if (btnRanking) btnRanking.style.display = 'inline-flex';

    // The puck reset logic in main.js handles placing it at the blue line
}

export function selectCrossbarStick(kickpoint) {
    triggerStickUpdate(kickpoint);
    window.dispatchEvent(new CustomEvent("tutorialKickpointSwitched"));
    const crossbar = document.getElementById('crossbar-selection');
    if (crossbar) {
        crossbar.hidden = true;
        crossbar.style.display = 'none';
    }
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
