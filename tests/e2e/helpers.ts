import { expect, type Page } from "@playwright/test";

export async function visit(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

export async function dismissOnboarding(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Welcome to StudyMate" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Get started" }).click();
  await expect(dialog).toHaveCount(0);
}

export async function gotoApp(page: Page) {
  await visit(page);
  await expect(page.getByRole("heading", { name: "Hi, I'm StudyMate." })).toBeVisible();
  await dismissOnboarding(page);
}

export function navButton(page: Page, label: string) {
  return page.locator("nav[aria-label='Primary']").first().getByRole("button", { name: label });
}

export function stopCameraButton(page: Page) {
  return page.getByRole("button", { name: "Stop Camera" }).first();
}

export async function openSettings(page: Page) {
  await navButton(page, "Settings").click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

export async function openDocs(page: Page) {
  await navButton(page, "Docs").click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
}

export async function openTypeInput(page: Page) {
  const input = page.getByPlaceholder("Type to StudyMate…");
  if (!(await input.isVisible())) {
    await page.getByRole("button", { name: "Type instead" }).click();
  }
  await expect(input).toBeVisible();
  return input;
}

export async function sendPrompt(page: Page, text: string) {
  const input = await openTypeInput(page);
  await input.fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

export async function saveNote(page: Page, name: string, text: string) {
  await openDocs(page);
  await page.getByPlaceholder("Note title").fill(name);
  await page.getByPlaceholder("Paste lecture notes…").fill(text);
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name }).first()).toBeVisible();
}
