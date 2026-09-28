import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { gotoApp, navButton, openSettings, saveNote } from "./helpers";

function backupJson(documents: unknown[]) {
  return JSON.stringify(
    {
      app: "studymate",
      version: 1,
      exportedAt: Date.now(),
      documents,
      days: [],
      reviewCards: [],
      settings: {
        voiceEnabled: true,
        voiceRate: 1,
        autoSpeak: true,
        compactTranscript: true,
        onboarded: true,
        dailyGoalMinutes: 25,
      },
    },
    null,
    2,
  );
}

const IMPORTED = {
  id: "imported-doc",
  name: "Imported note",
  type: "text/plain",
  text: "Restored from a backup file.",
  createdAt: 1_700_000_000_000,
};

test("exports a dated backup file", async ({ page }) => {
  await gotoApp(page);
  await saveNote(page, "Exportable note", "Include me in the backup.");
  await openSettings(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /^studymate-backup-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const path = await download.path();
  expect(path).not.toBeNull();
  const payload = JSON.parse(await readFile(path as string, "utf8"));
  expect(payload.app).toBe("studymate");
  expect(payload.version).toBe(1);
  expect(payload.documents).toHaveLength(1);
  await expect(page.getByRole("status")).toContainText("Exported 1 notes");
});

test("merges an imported backup and refreshes live counts", async ({ page }) => {
  await gotoApp(page);
  await saveNote(page, "Existing note", "Local text stays.");
  await openSettings(page);

  await expect(page.getByText("Right now: 1 notes")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backupJson([IMPORTED])),
  });

  await expect(page.getByRole("status")).toContainText("Merged");
  await expect(page.getByText("Right now: 2 notes")).toBeVisible();
  await expect(page.getByText("of browser storage")).toBeVisible();

  await navButton(page, "Docs").click();
  await expect(page.getByRole("listitem").filter({ hasText: "Imported note" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Existing note" })).toBeVisible();
});

test("replaces local study data when replace mode is chosen", async ({ page }) => {
  await gotoApp(page);
  await saveNote(page, "Existing note", "Local text goes away.");
  await openSettings(page);

  await page.getByLabel("When importing").selectOption("replace");
  await page.locator('input[type="file"]').setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backupJson([IMPORTED])),
  });

  await expect(page.getByRole("status")).toContainText("replacing local study data");
  await navButton(page, "Docs").click();
  await expect(page.getByRole("listitem").filter({ hasText: "Existing note" })).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ hasText: "Imported note" })).toBeVisible();
});

test("rejects a file that is not a StudyMate backup", async ({ page }) => {
  await gotoApp(page);
  await saveNote(page, "Existing note", "Local text stays.");
  await openSettings(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: "random.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ hello: "world" })),
  });

  await expect(page.getByRole("status")).toContainText("not a StudyMate backup");
  await expect(page.getByText("Right now: 1 notes")).toBeVisible();
});

test("erases local data after confirmation", async ({ page }) => {
  await gotoApp(page);
  await saveNote(page, "Existing note", "Local text goes away.");
  await openSettings(page);

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Erase all data" }).click();

  await expect(page.getByRole("status")).toContainText("erased");
  await expect(page.getByText("Right now: 0 notes")).toBeVisible();

  await navButton(page, "Docs").click();
  await expect(page.getByRole("listitem")).toHaveCount(0);
});

test("keeps local data when the erase confirmation is dismissed", async ({ page }) => {
  await gotoApp(page);
  await saveNote(page, "Existing note", "Local text stays.");
  await openSettings(page);

  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("button", { name: "Erase all data" }).click();

  await expect(page.getByText("Right now: 1 notes")).toBeVisible();

  await navButton(page, "Docs").click();
  await expect(page.getByRole("listitem").filter({ hasText: "Existing note" })).toBeVisible();
});
