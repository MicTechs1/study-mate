import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rateLimitMock } = vi.hoisted(() => ({
  rateLimitMock: vi.fn(),
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../rate-limit")>();
  return { ...actual, rateLimit: rateLimitMock };
});

import { POST as chat } from "../../app/api/chat/route";
import { GET as health } from "../../app/api/health/route";
import { POST as vision } from "../../app/api/vision/route";
import { MAX_JSON_BYTES } from "../schemas";

function jsonRequest(
  path: string,
  body: unknown,
  headers: HeadersInit = {},
): Request {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("content-type", "application/json");
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  rateLimitMock.mockReset();
  rateLimitMock.mockResolvedValue({
    allowed: true,
    remaining: 19,
    resetAtMs: Date.now() + 60_000,
  });
  vi.stubEnv("OPENAI_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("health route", () => {
  it("returns a no-store liveness response", async () => {
    const response = health();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});

describe("API request boundaries", () => {
  it("rejects requests without a JSON content type", async () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ prompt: "hello" }),
    });

    const response = await chat(request);

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({ text: null, fallback: true });
  });

  it("rejects malformed JSON", async () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    const response = await chat(request);

    expect(response.status).toBe(400);
  });

  it("enforces the byte limit for streamed bodies", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_JSON_BYTES + 1));
        controller.close();
      },
    });
    const request = new Request(
      "http://localhost/api/chat",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        duplex: "half",
      } as RequestInit & { duplex: "half" },
    );

    const response = await chat(request);

    expect(response.status).toBe(413);
  });

  it("preserves rate-limit responses and request IDs", async () => {
    rateLimitMock.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSec: 7,
    });

    const response = await chat(
      jsonRequest("/api/chat", { prompt: "hello" }, { "x-request-id": "req-123" }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("7");
    expect(response.headers.get("x-request-id")).toBe("req-123");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects invalid vision payloads", async () => {
    const response = await vision(
      jsonRequest("/api/vision", {
        prompt: "What is this?",
        imageDataUrl: "not-a-data-url",
      }),
    );

    expect(response.status).toBe(400);
  });
});

describe("API upstream handling", () => {
  it("uses a timeout signal and returns safe upstream failures", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("sensitive upstream detail", { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await chat(jsonRequest("/api/chat", { prompt: "hello" }));

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ text: null, fallback: true });
    expect(consoleError).toHaveBeenCalled();
  });
});
