import { expect, test } from "@playwright/test";
import { gotoApp, stopCameraButton } from "./helpers";

test("starts and stops the camera without sending a frame", async ({ page }) => {
  await gotoApp(page);

  const visionRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/vision")) visionRequests.push(request.url());
  });

  await page.getByRole("button", { name: "Vision" }).click();

  await expect(stopCameraButton(page)).toBeVisible();
  await expect(page.locator("video")).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(document.querySelector("video")?.srcObject),
      ),
    )
    .toBe(true);
  expect(visionRequests).toHaveLength(0);

  await stopCameraButton(page).click();

  await expect(page.getByRole("button", { name: "Vision" })).toBeVisible();
  const released = await page.evaluate(() => {
    const video = document.querySelector("video");
    return {
      hidden: video?.getAttribute("aria-hidden") === "true",
      hasStream: Boolean(video?.srcObject),
    };
  });
  expect(released).toEqual({ hidden: true, hasStream: false });
});

test("stops the camera when asked in chat", async ({ page }) => {
  await gotoApp(page);

  await page.getByRole("button", { name: "Vision" }).click();
  await expect(stopCameraButton(page)).toBeVisible();

  const input = page.getByPlaceholder("Type to StudyMate…");
  if (!(await input.isVisible())) {
    await page.getByRole("button", { name: "Type instead" }).click();
  }
  await input.fill("stop camera");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByRole("button", { name: "Vision" })).toBeVisible();
  await expect(page.locator(".transcript").first()).toContainText(
    "camera is no longer in use",
  );
});

test("keeps health checks cache-free", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  await expect(response.json()).resolves.toEqual({ status: "ok" });
});
