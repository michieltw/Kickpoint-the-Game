const { chromium } = require('playwright');

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

    console.log("Taking screenshot of popup...");
    await page.screenshot({ path: 'handedness_popup.png' });

    // Test selecting 'Left'
    console.log("Clicking Left handedness...");
    await page.evaluate(() => selectTutorialHandedness('left'));

    // Check if popup is hidden
    const isHidden = await page.evaluate(() => {
        return document.getElementById('handedness-popup').style.display === 'none';
    });

    if (isHidden) {
        console.log("Popup is hidden after selection.");
    } else {
        console.error("Popup is NOT hidden after selection.");
    }

    // Check if stick is left handed
    const handedness = await page.evaluate(() => document.getElementById('custHandedness').value);
    console.log("Selected handedness:", handedness);

    // Wait for stick to load and take a screenshot
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'handedness_left_selected.png' });

    await browser.close();
    console.log("Done.");
})();
