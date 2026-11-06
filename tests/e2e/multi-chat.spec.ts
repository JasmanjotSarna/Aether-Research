import { test, expect } from '@playwright/test';

test.describe('Multi-Chat State Isolation', () => {
  test('starts two parallel runs, switches 10 times, asserts strict state isolation without bleed', async ({
    page,
  }) => {
    // Enable mock mode in browser environment
    await page.addInitScript(() => {
      window.localStorage.setItem('aether_conversations_v3', '[]');
      (window as any).process = { env: { NEXT_PUBLIC_MOCK: '1' } };
    });

    await page.goto('/app');

    // 1. Start Chat 1: DeepFake recognition
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible();
    await textarea.fill('DeepFake recognition across compressed video streams');
    await page.keyboard.press('Enter');

    // Handle clarify card if prompted
    const submitSpecsBtn = page.getByRole('button', { name: /Submit Specifications/i });
    if (await submitSpecsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitSpecsBtn.click();
    }

    // Handle proposal card if prompted
    const approveBlueprintBtn = page.getByRole('button', { name: /Approve Blueprint/i });
    if (await approveBlueprintBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
      await approveBlueprintBtn.click();
    }

    // Wait for Chat 1 to show active execution
    await expect(page.locator('text=DeepFake').first()).toBeVisible({ timeout: 8000 });

    // 2. Start Chat 2: Compare RAG vs fine-tuning
    const newResearchBtn = page.getByRole('button', { name: /New Research/i });
    await newResearchBtn.click();

    await textarea.fill('Compare RAG vs fine-tuning for technical documentation');
    await page.keyboard.press('Enter');

    if (await submitSpecsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitSpecsBtn.click();
    }

    if (await approveBlueprintBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
      await approveBlueprintBtn.click();
    }

    // Wait for Chat 2 to appear
    await expect(page.locator('text=RAG').first()).toBeVisible({ timeout: 8000 });

    // 3. Switch back and forth 10 times between the two chats
    const chatItems = page.locator('aside .group');
    await expect(chatItems).toHaveCount(2, { timeout: 8000 });

    for (let i = 0; i < 10; i++) {
      // Select Chat 1 (DeepFake)
      const chat1 = chatItems.filter({ hasText: /DeepFake/i }).first();
      await chat1.click();
      await page.waitForTimeout(100);

      // Verify active view contains DeepFake and not RAG paper heading
      const mainContent = page.locator('main');
      await expect(mainContent).toContainText('DeepFake');
      const hasBleedInChat1 = await mainContent.locator('h1:has-text("RAG")').count();
      expect(hasBleedInChat1).toBe(0);

      // Select Chat 2 (RAG)
      const chat2 = chatItems.filter({ hasText: /RAG/i }).first();
      await chat2.click();
      await page.waitForTimeout(100);

      // Verify active view contains RAG and not DeepFake paper heading
      await expect(mainContent).toContainText('RAG');
      const hasBleedInChat2 = await mainContent.locator('h1:has-text("DeepFake")').count();
      expect(hasBleedInChat2).toBe(0);
    }
  });
});

