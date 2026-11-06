const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function record() {
  const artifactsDir = path.resolve('C:/Users/jasma/.gemini/antigravity/brain/c9edf2f7-7ae4-400a-8b94-a4bacaf88ec8');
  const tempRecordingsDir = path.resolve('./temp_recordings');
  if (!fs.existsSync(tempRecordingsDir)) {
    fs.mkdirSync(tempRecordingsDir, { recursive: true });
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    recordVideo: {
      dir: tempRecordingsDir,
      size: { width: 1280, height: 720 },
    },
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  // Enable mock mode for deterministic, rich streaming responses
  await page.addInitScript(() => {
    window.localStorage.setItem('aether_conversations_v3', '[]');
    window.process = { env: { NEXT_PUBLIC_MOCK: '1' } };
  });

  console.log('1. Navigating to /app...');
  await page.goto('http://localhost:3000/app');
  await page.waitForTimeout(1000);

  const textarea = page.locator('textarea').first();

  // 1. Initial Inquiry Launch
  console.log('2. Entering initial research query...');
  await textarea.fill('State of solid-state lithium-metal battery interfaces');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);

  // 2. Clarifying Card Flow
  console.log('3. Handling Clarify scoping card...');
  const submitSpecsBtn = page.getByRole('button', { name: /Submit Specifications/i });
  await submitSpecsBtn.waitFor({ state: 'visible', timeout: 8000 });
  await page.waitForTimeout(1000);
  await submitSpecsBtn.click();
  await page.waitForTimeout(1500);

  // 3. Proposal Blueprint Card Flow
  console.log('4. Approving research proposal blueprint...');
  const approveBtn = page.getByRole('button', { name: /Approve Blueprint/i });
  await approveBtn.waitFor({ state: 'visible', timeout: 8000 });
  await page.waitForTimeout(1000);
  await approveBtn.click();

  // 4. Paper Streaming to Completion
  console.log('5. Streaming publication-grade paper...');
  await page.waitForTimeout(1000);
  // Wait for research to finish and paper report view to be present
  const reportHeader = page.locator('text=Score:');
  await reportHeader.waitFor({ state: 'visible', timeout: 25000 });
  await page.waitForTimeout(2000);

  // 5. Follow-up 1
  console.log('6. Follow-up 1: Cathode compatibility...');
  await textarea.fill('What cathode chemistries yield maximum voltage stability with this solid electrolyte?');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);

  // 6. Follow-up 2
  console.log('7. Follow-up 2: Dendrite suppression...');
  await textarea.fill('How does interfacial pressure prevent lithium dendrite penetration at high C-rates?');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);

  // 7. Follow-up 3
  console.log('8. Follow-up 3: Temperature operating window...');
  await textarea.fill('What is the ionic conductivity degradation rate below -10 degrees Celsius?');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);

  // 8. Follow-up 4
  console.log('9. Follow-up 4: Manufacturing scalability...');
  await textarea.fill('Can roll-to-roll dry coating processes be integrated without separator microcracks?');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);

  // 9. Mid-Run Interruption
  console.log('10. Triggering mid-run interruption...');
  await textarea.fill('Evaluate pouch cell volumetric expansion dynamics');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400); // Interrupt while assistant message is pending/streaming
  await textarea.fill('Wait, pivot focus immediately: compare sulfide vs oxide solid electrolytes instead');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);

  // 10. Follow-up 5 (Post-interruption reply)
  console.log('11. Follow-up 5: Final synthesis inquiry...');
  await textarea.fill('Provide a summary recommendation matrix for EV vs consumer electronics');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);

  console.log('12. Closing browser and finalizing video recording...');
  await page.close();
  await context.close();
  await browser.close();

  // Move recorded video to artifact directory
  const files = fs.readdirSync(tempRecordingsDir).filter((f) => f.endsWith('.webm'));
  if (files.length > 0) {
    const videoFile = files[0];
    const sourcePath = path.join(tempRecordingsDir, videoFile);
    const destPath = path.join(artifactsDir, 'chat_flow_recording.webm');
    fs.copyFileSync(sourcePath, destPath);
    console.log(`Video saved to: ${destPath}`);
  }
}

record().catch((err) => {
  console.error('Recording error:', err);
  process.exit(1);
});
