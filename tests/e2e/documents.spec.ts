import { expect, test } from "@playwright/test";
import { gotoApp, openDocs, saveNote } from "./helpers";

test("saves a note and keeps it after a reload", async ({ page }) => {
  await gotoApp(page);

  await saveNote(page, "Photosynthesis", "Plants convert sunlight into chemical energy.");
  await page.reload();
  await openDocs(page);

  await expect(
    page.getByRole("listitem").filter({ hasText: "Photosynthesis" }),
  ).toBeVisible();
});

test("removes a note from the list", async ({ page }) => {
  await gotoApp(page);
  await saveNote(page, "Ephemeral note", "Delete me.");

  const item = page.getByRole("listitem").filter({ hasText: "Ephemeral note" });
  await item.getByRole("button", { name: "Remove" }).click();

  await expect(item).toHaveCount(0);
});

test("uploads a text file as a document", async ({ page }) => {
  await gotoApp(page);
  await openDocs(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: "lecture.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Mitochondria produce ATP in cells."),
  });

  await expect(
    page.getByRole("listitem").filter({ hasText: "lecture.txt" }),
  ).toBeVisible();
});
