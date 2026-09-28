import {
  apiJson,
  ApiRequestError,
  readJsonRequest,
  trackApiRequest,
  upstreamSignal,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { VISION_SYSTEM } from "@/lib/prompts";
import {
  VISION_LIMIT,
  VISION_WINDOW_MS,
  clientIp,
  rateLimit,
} from "@/lib/rate-limit";
import { fallbackPayload, visionBodySchema } from "@/lib/schemas";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
const MAX_OUTPUT_TOKENS = 220;

async function handlePost(req: Request, requestId: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  const ip = clientIp(req);
  const limited = await rateLimit(`vision:${ip}`, {
    limit: VISION_LIMIT,
    windowMs: VISION_WINDOW_MS,
  });

  if (!limited.allowed) {
    logger.warn("vision: rate limited", {
      requestId,
      retryAfterSec: limited.retryAfterSec,
    });
    return apiJson(fallbackPayload, {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfterSec) },
    });
  }

  let raw: unknown;
  try {
    raw = await readJsonRequest(req);
  } catch (error) {
    const status = error instanceof ApiRequestError ? error.status : 400;
    const issue = error instanceof ApiRequestError ? error.code : "invalid_body";
    logger.warn("vision: request rejected", { requestId, issue, status });
    return apiJson(fallbackPayload, { status });
  }

  const parsed = visionBodySchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn("vision: invalid body", {
      requestId,
      issue: parsed.error.issues[0]?.message,
    });
    return apiJson(fallbackPayload, { status: 400 });
  }
  const body = parsed.data;

  if (!apiKey) return apiJson(fallbackPayload);

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: "system", content: VISION_SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${body.prompt}\nOn-device detections (may be incomplete): ${JSON.stringify(body.scene ?? {})}`,
              },
              { type: "image_url", image_url: { url: body.imageDataUrl } },
            ],
          },
        ],
      }),
      signal: upstreamSignal(req),
      cache: "no-store",
    });

    if (!res.ok) {
      logger.error("vision: upstream failed", { requestId, status: res.status });
      return apiJson(fallbackPayload, { status: 502 });
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content || null;
    return apiJson({ text });
  } catch (error) {
    const status = error instanceof Error && error.name === "TimeoutError" ? 504 : 502;
    logger.error("vision: upstream error", {
      requestId,
      status,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return apiJson(fallbackPayload, { status });
  }
}

export function POST(req: Request) {
  return trackApiRequest("vision", req, (requestId) => handlePost(req, requestId));
}
