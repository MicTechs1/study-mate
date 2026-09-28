import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { MAX_JSON_BYTES } from "@/lib/schemas";

const OPENAI_TIMEOUT_MS = 20_000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export class ApiRequestError extends Error {
  readonly name = "ApiRequestError";

  constructor(
    readonly status: 400 | 413 | 415,
    readonly code: string,
  ) {
    super(code);
  }
}

function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

function getRequestId(request: Request): string {
  const incoming = request.headers.get("x-request-id")?.trim();
  return incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : crypto.randomUUID();
}

export function apiJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(body, { ...init, headers });
}

export async function readJsonRequest(request: Request): Promise<unknown> {
  if (!isJsonContentType(request.headers.get("content-type"))) {
    await request.body?.cancel().catch(() => undefined);
    throw new ApiRequestError(415, "unsupported_content_type");
  }

  const declaredLength = request.headers.get("content-length")?.trim();
  if (declaredLength !== undefined) {
    if (!/^\d+$/.test(declaredLength)) {
      await request.body?.cancel().catch(() => undefined);
      throw new ApiRequestError(400, "invalid_content_length");
    }
    if (Number(declaredLength) > MAX_JSON_BYTES) {
      await request.body?.cancel().catch(() => undefined);
      throw new ApiRequestError(413, "body_too_large");
    }
  }

  if (!request.body) throw new ApiRequestError(400, "missing_body");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JSON_BYTES) {
        await reader.cancel();
        throw new ApiRequestError(413, "body_too_large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError(400, "body_read_failed");
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ApiRequestError(400, "invalid_encoding");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiRequestError(400, "invalid_json");
  }
}

export function upstreamSignal(request: Request): AbortSignal {
  return AbortSignal.any([
    request.signal,
    AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  ]);
}

export async function trackApiRequest(
  route: string,
  request: Request,
  handler: (requestId: string) => Promise<Response>,
): Promise<Response> {
  const requestId = getRequestId(request);
  const startedAt = Date.now();

  try {
    const response = await handler(requestId);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Request-Id", requestId);
    logger.info("api: request completed", {
      route,
      requestId,
      method: request.method,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    logger.error("api: request failed", {
      route,
      requestId,
      method: request.method,
      durationMs: Date.now() - startedAt,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }
}
