import { expect, test } from "@playwright/test";
import { dismissOnboarding, gotoApp, visit } from "./helpers";

async function majorViolations(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const seen = new Set<string>();
    const labelText = (element: Element) =>
      (element.getAttribute("aria-label") ??
        element.getAttribute("title") ??
        element.textContent ??
        "").trim();

    document.querySelectorAll("img").forEach((img) => {
      if (!(img.getAttribute("alt") ?? "").trim()) {
        problems.push(`img without alt: ${img.getAttribute("src") ?? "?"}`);
      }
    });

    document.querySelectorAll("button, a[href], [role='button']").forEach((node) => {
      if ((node as HTMLElement).offsetParent === null) return;
      const name = labelText(node);
      if (!name) {
        const key = `unnamed:${node.tagName.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          problems.push(`${node.tagName.toLowerCase()} without an accessible name`);
        }
      }
    });

    document.querySelectorAll("input, select, textarea").forEach((node) => {
      const control = node as HTMLInputElement;
      if (control.type === "hidden") return;
      const id = control.getAttribute("id");
      const labelled =
        (control.getAttribute("aria-label") ?? "").trim() !== "" ||
        (id !== null && document.querySelector(`label[for="${id}"]`) !== null) ||
        (control as HTMLInputElement).closest("label") !== null;
      if (!labelled) problems.push(`${node.tagName.toLowerCase()} without a label`);
    });

    const h1s = document.querySelectorAll("h1");
    if (h1s.length !== 1) problems.push(`expected exactly one h1, found ${h1s.length}`);

    return problems;
  });
}

test("ships an installable manifest", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");

  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest.name).toBeTruthy();
  expect(manifest.icons.length).toBeGreaterThan(0);
});

test("serves a sitemap and robots policy", async ({ request }) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("<urlset");

  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const body = await robots.text();
  expect(body).toMatch(/User-Agent/i);
  expect(body).toMatch(/Disallow: \/api\//i);
});

test("exposes one labelled landmark set on the home view", async ({ page }) => {
  await gotoApp(page);

  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("h1")).toHaveText("Hi, I'm StudyMate.");
  expect(await majorViolations(page)).toEqual([]);
});

test("has no unnamed controls once the welcome dialog is dismissed", async ({ page }) => {
  await visit(page);
  await dismissOnboarding(page);

  expect(await majorViolations(page)).toEqual([]);
});

test("keeps a single page title and description", async ({ page }) => {
  await visit(page);

  await expect(page).toHaveTitle(/StudyMate/);
  const description = page.locator('meta[name="description"]');
  await expect(description).toHaveCount(1);
  expect((await description.getAttribute("content"))?.length).toBeGreaterThan(20);
});
