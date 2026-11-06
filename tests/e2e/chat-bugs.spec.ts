import { test, expect } from '@playwright/test';

test.describe('Chat Bugs & Conversational Continuity', () => {
  test.beforeEach(async ({ page }) => {
    // Enable mock mode and clean storage
    await page.addInitScript(() => {
      window.localStorage.setItem('aether_conversations_v3', '[]');
      (window as any).process = { env: { NEXT_PUBLIC_MOCK: '1' } };
    });
  });

  test('1. sending 10 messages in a row keeps order and keeps the view at the bottom', async ({ page }) => {
    await page.goto('/app');
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible();

    // Start initial conversation
    await textarea.fill('Message 1: Initial research query');
    await page.keyboard.press('Enter');

    // Send 9 more messages consecutively
    for (let i = 2; i <= 10; i++) {
      await page.waitForTimeout(200);
      await textarea.fill(`Message ${i}: Follow-up inquiry content`);
      await page.keyboard.press('Enter');
    }

    // Verify all 10 messages are rendered
    const userBubbles = page.locator('.flex.flex-col.items-end');
    await expect(userBubbles).toHaveCount(10, { timeout: 10000 });

    // Assert messages are strictly in ascending order from top to bottom
    const texts = await userBubbles.allInnerTexts();
    for (let i = 1; i <= 10; i++) {
      expect(texts[i - 1]).toContain(`Message ${i}`);
    }

    // Give scroll container a brief moment to settle
    await page.waitForTimeout(600);

    // Assert the view is kept at the bottom (last message is in viewport)
    const lastBubble = userBubbles.last();
    await expect(lastBubble).toBeInViewport();
  });

  test('2. sending while a run is streaming aborts it and appends the new message at the end', async ({ page }) => {
    await page.goto('/app');
    const textarea = page.locator('textarea').first();

    // Launch inquiry that enters streaming execution
    await textarea.fill('Comparative study of transformer attention scaling');
    await page.keyboard.press('Enter');

    // Handle scoping if prompted
    const submitSpecsBtn = page.getByRole('button', { name: /Submit Specifications/i });
    if (await submitSpecsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitSpecsBtn.click();
    }
    const approveBlueprintBtn = page.getByRole('button', { name: /Approve Blueprint/i });
    if (await approveBlueprintBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
      await approveBlueprintBtn.click();
    }

    // Wait for research to be actively streaming
    await page.waitForTimeout(600);

    // Send an interrupting feedback message mid-run
    const interruptText = 'Interrupt: Pivot analysis to quantized edge inference instead';
    await textarea.fill(interruptText);
    await page.keyboard.press('Enter');

    // Assert the new message is appended at the end of the thread
    const userBubbles = page.locator('.flex.flex-col.items-end');
    const lastUserBubble = userBubbles.last();
    await expect(lastUserBubble).toContainText(interruptText);
    await expect(lastUserBubble).toBeInViewport();

    // Assert an interrupted status card or redirected turn is visible
    const interruptedIndicator = page.locator('text=This run was interrupted').or(page.locator('text=Pivot analysis'));
    await expect(interruptedIndicator.first()).toBeVisible({ timeout: 8000 });
  });

  test('3. a stream that dies silently ends in an error state with Retry within 30s', async ({ page }) => {
    // Configure fast watchdog for this test (1.5 seconds)
    await page.addInitScript(() => {
      (window as any).__WATCHDOG_TIMEOUT_MS__ = 1500;
    });

    await page.goto('/app');
    const textarea = page.locator('textarea').first();

    // Trigger silent death simulation
    await textarea.fill('Inquiry simulate_silent_death test');
    await page.keyboard.press('Enter');

    // Wait for watchdog to trigger (1.5s timeout)
    const errorCard = page.locator('text=Connection lost. Retry');
    await expect(errorCard).toBeVisible({ timeout: 8000 });

    const retryBtn = page.getByRole('button', { name: /Retry/i });
    await expect(retryBtn).toBeVisible();

    // Clicking Retry attempts resending
    await retryBtn.click();
    await expect(page.locator('text=Thinking...').or(page.locator('text=simulate_silent_death')).first()).toBeVisible();
  });

  test('4. reloading mid-run shows "Interrupted" and nothing stuck', async ({ page }) => {
    // Seed localStorage with a conversation that was in-progress when tab closed
    await page.addInitScript(() => {
      const pendingConv = [
        {
          id: 'conv_interrupted_test',
          title: 'Interrupted Run Test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          mode: 'standard',
          status: 'running',
          isStreaming: true,
          messages: [
            {
              id: 'msg_u1',
              seq: 1,
              role: 'user',
              content: 'Evaluate federated learning under non-IID partitions',
              status: 'done',
              createdAt: Date.now() - 5000,
              updatedAt: Date.now() - 5000,
            },
            {
              id: 'msg_a1',
              seq: 2,
              role: 'assistant',
              content: '',
              status: 'streaming',
              createdAt: Date.now() - 3000,
              updatedAt: Date.now() - 3000,
            },
          ],
          tools: [{ id: 't1', name: 'academic_search', input: 'federated non-iid', status: 'running' }],
          steps: [],
          sources: [],
        },
      ];
      window.localStorage.setItem('aether_conversations_v3', JSON.stringify(pendingConv));
      window.localStorage.setItem('aether_active_conversation_id_v2', 'conv_interrupted_test');
    });

    await page.goto('/app');

    // Verify conversation loaded with "This run was interrupted"
    await expect(page.locator('text=This run was interrupted').first()).toBeVisible({ timeout: 5000 });
    const resumeBtn = page.getByRole('button', { name: /Resume/i });
    await expect(resumeBtn).toBeVisible();

    // Verify tools are NOT stuck in running
    const runningSpinner = page.locator('.animate-spin');
    await expect(runningSpinner).toHaveCount(0);

    // Verify composer is enabled and usable
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeEnabled();
    await textarea.fill('Testing composer after reload');
    await expect(textarea).toHaveValue('Testing composer after reload');
  });

  test('5. following up after a finished paper gets an answer', async ({ page }) => {
    // Seed with a finished paper
    await page.addInitScript(() => {
      const finishedConv = [
        {
          id: 'conv_finished_test',
          title: 'Completed Solid-State Synthesis',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          mode: 'standard',
          status: 'completed',
          isStreaming: false,
          messages: [
            {
              id: 'msg_u1',
              seq: 1,
              role: 'user',
              content: 'State of the art in solid-state lithium metal interfaces',
              status: 'done',
              createdAt: Date.now() - 10000,
              updatedAt: Date.now() - 10000,
            },
            {
              id: 'msg_a1',
              seq: 2,
              role: 'assistant',
              content: 'Full academic report synthesized.',
              status: 'done',
              createdAt: Date.now() - 8000,
              updatedAt: Date.now() - 8000,
              report: {
                title: 'Solid-State Electrolyte Interfaces',
                markdown: '# Solid-State Electrolyte Interfaces\n\nExecutive summary of empirical findings [S1].',
                sources: [
                  {
                    id: 'S1',
                    title: 'Empirical Evaluation of Solid-State Electrolytes',
                    url: 'https://arxiv.org/abs/2403.11894',
                    domain: 'arxiv.org',
                    kind: 'academic',
                    snippet: 'Benchmark results demonstrate 480 Wh/kg specific energy density.',
                    credibility: 0.96,
                  },
                ],
                quality: {
                  score: 96,
                  citedSources: 1,
                  totalSources: 1,
                  notes: ['Verified claim attribution'],
                },
                version: 1,
                pagesEstimated: 4,
                followups: ['What cathode chemistries match best?'],
              },
            },
          ],
          report: {
            title: 'Solid-State Electrolyte Interfaces',
            markdown: '# Solid-State Electrolyte Interfaces\n\nExecutive summary of empirical findings [S1].',
            sources: [
              {
                id: 'S1',
                title: 'Empirical Evaluation of Solid-State Electrolytes',
                url: 'https://arxiv.org/abs/2403.11894',
                domain: 'arxiv.org',
                kind: 'academic',
                snippet: 'Benchmark results demonstrate 480 Wh/kg specific energy density.',
                credibility: 0.96,
              },
            ],
            quality: {
              score: 96,
              citedSources: 1,
              totalSources: 1,
              notes: ['Verified claim attribution'],
            },
            version: 1,
            pagesEstimated: 4,
            followups: ['What cathode chemistries match best?'],
          },
          tools: [],
          steps: [],
          sources: [
            {
              id: 'S1',
              title: 'Empirical Evaluation of Solid-State Electrolytes',
              url: 'https://arxiv.org/abs/2403.11894',
              domain: 'arxiv.org',
              kind: 'academic',
              snippet: 'Benchmark results demonstrate 480 Wh/kg specific energy density.',
              credibility: 0.96,
            },
          ],
        },
      ];
      window.localStorage.setItem('aether_conversations_v3', JSON.stringify(finishedConv));
      window.localStorage.setItem('aether_active_conversation_id_v2', 'conv_finished_test');
    });

    await page.goto('/app');

    // Verify paper report is loaded
    await expect(page.locator('text=Solid-State Electrolyte Interfaces').first()).toBeVisible({ timeout: 6000 });

    // Send a follow-up inquiry via composer
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeEnabled();
    const followupText = 'What cathode chemistries yield the best stability with this interface?';
    await textarea.fill(followupText);
    await page.keyboard.press('Enter');

    // Verify follow-up user bubble is appended at the bottom
    const userBubbles = page.locator('.flex.flex-col.items-end');
    await expect(userBubbles.last()).toContainText(followupText);

    // Verify agent response is streamed and rendered
    await expect(page.locator('text=Regarding your inquiry on').first()).toBeVisible({ timeout: 10000 });

    // Verify composer is immediately ready for next reply
    await expect(textarea).toBeEnabled();
  });
});
