const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    console.log("Navigating to local server...");
    await page.goto('http://localhost:3000');

    // Skip intro and trigger tutorial
    console.log("Clicking Skip Intro...");
    await page.click('#btnSkipIntro');

    // Wait for the popup to be visible
    console.log("Waiting for handedness popup...");
    await page.waitForSelector('#handedness-popup', { state: 'visible' });

    // Test selecting 'Left'
    console.log("Clicking Left handedness...");
    await page.evaluate(() => selectTutorialHandedness('left'));

    console.log("Triggering kickpoint switch...");
    await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('tutorialKickpointSwitched'));
    });

    // Take a few screenshots quickly to verify flashing opacity
    console.log("Taking screenshots...");
    await page.waitForTimeout(100);
    await page.screenshot({ path: 'tutorial_phase1_indicator_flashing_fix.png' });
    await page.waitForTimeout(150);
    await page.screenshot({ path: 'tutorial_phase1_indicator_flashing2_fix.png' });

    await browser.close();
    console.log("Done.");
})();
