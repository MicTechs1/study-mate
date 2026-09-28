import { expect, test } from "@playwright/test";
import { dismissOnboarding, gotoApp, openTypeInput, sendPrompt, visit } from "./helpers";

test("shows the welcome dialog on a first visit", async ({ page }) => {
  await visit(page);

  const dialog = page.getByRole("dialog", { name: "Welcome to StudyMate" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Get started" })).toBeVisible();
});

test("remembers onboarding dismissal across reloads", async ({ page }) => {
  await visit(page);
  await dismissOnboarding(page);

  await page.reload(); await page.waitForLoadState("networkidle");

  await expect(page.getByRole("dialog", { name: "Welcome to StudyMate" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Hi, I'm StudyMate." })).toBeVisible();
});

test("answers typed prompts locally without a hosted key", async ({ page }) => {
  await gotoApp(page);

  await sendPrompt(page, "what is pr");

  const transcript = page.locator(".transcript");
  await expect(transcript).toContainText("You:");
  await expect(transcript).toContainText("public relations");
});

test("navigates to the requested view from a typed command", async ({ page }) => {
  await gotoApp(page);

  await sendPrompt(page, "open my settings");

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your data" })).toBeVisible();
});

test("offers a typed fallback when speech input is unavailable", async ({ page }) => {
  await gotoApp(page);

  const input = await openTypeInput(page);

  await expect(input).toBeEditable();
});

test("keeps chat history in the conversation panel", async ({ page }) => {
  await gotoApp(page);

  await sendPrompt(page, "hello");
  await expect(page.locator(".transcript")).toContainText("StudyMate:");

  await page.getByRole("button", { name: "Open chat" }).click();

  await expect(page.getByRole("heading", { name: "Conversation" })).toBeVisible();
  await expect(page.locator(".transcript").first()).toContainText("You:");
});
