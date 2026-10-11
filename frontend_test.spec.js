const { test, expect } = require('@playwright/test');

test('Tutorial Stick Colors', async ({ page }) => {
    // Navigate to the local server
    await page.goto('http://localhost:3000');

    // Skip intro
    await page.evaluate(() => {
        const btn = document.getElementById('btnSkipIntro');
        if (btn) btn.click();
    });

    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'tutorial_phase1_blue.png' });

    // Move to Phase 2 (Mid Kick)
    await page.evaluate(() => {
        import('./js/state.js').then(stateModule => {
            stateModule.appState.tutorial.shotsTaken = 2;
            import('./js/tutorial.js').then(module => {
                module.handleTutorialShotComplete();
            });
        });
    });

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tutorial_phase2_yellow.png' });

    // Move to Phase 3 (Hybrid Kick)
    await page.evaluate(() => {
        import('./js/state.js').then(stateModule => {
            stateModule.appState.tutorial.shotsTaken = 2;
            import('./js/tutorial.js').then(module => {
                module.handleTutorialShotComplete();
            });
        });
    });

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tutorial_phase3_red.png' });
});
