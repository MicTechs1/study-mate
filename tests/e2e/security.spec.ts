import { expect, test } from "@playwright/test";
import { dismissOnboarding } from "./helpers";

function nonceOf(csp: string | undefined) {
  return /'nonce-([^']+)'/.exec(csp ?? "")?.[1] ?? null;
}

test("serves a strict per-request CSP and hydrates cleanly", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) {
      violations.push(message.text());
    }
  });

  const response = await page.goto("/");
  const csp = response?.headers()["content-security-policy"] ?? "";
  const scriptSrc = /script-src[^;]*/.exec(csp)?.[0] ?? "";

  expect(scriptSrc).toContain("'self'");
  expect(scriptSrc).toContain("'nonce-");
  expect(scriptSrc).toContain("'strict-dynamic'");
  expect(scriptSrc).not.toContain("unsafe-inline");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  expect(nonceOf(csp)).toBeTruthy();

  await page.waitForLoadState("networkidle");
  await dismissOnboarding(page);
  expect(violations).toEqual([]);
});

test("issues a fresh nonce for every response", async ({ request }) => {
  const first = await request.get("/");
  const second = await request.get("/");
  const a = nonceOf(first.headers()["content-security-policy"]);
  const b = nonceOf(second.headers()["content-security-policy"]);

  expect(a).toBeTruthy();
  expect(b).toBeTruthy();
  expect(a).not.toBe(b);
});

test("keeps the production hardening headers", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();

  expect(headers["x-powered-by"]).toBeUndefined();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=(self)");
  expect(headers["strict-transport-security"]).toContain("max-age=15552000");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
});

test("stamps subresource integrity on server-emitted scripts", async ({ request }) => {
  const response = await request.get("/");
  const html = await response.text();
  const stamped = html.match(/<script[^>]*integrity="sha256-[^"]+"/g) ?? [];

  expect(stamped.length).toBeGreaterThan(0);
  expect(html).toMatch(/<script[^>]*nonce="[^"]+"/);
});
