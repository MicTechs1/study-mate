import {
  apiJson,
  ApiRequestError,
  readJsonRequest,
  trackApiRequest,
  upstreamSignal,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import { SYSTEM_PERSONALITY } from "@/lib/prompts";
import {
  CHAT_LIMIT,
  CHAT_WINDOW_MS,
  clientIp,
  rateLimit,
} from "@/lib/rate-limit";
import { chatBodySchema, fallbackPayload } from "@/lib/schemas";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
const MAX_OUTPUT_TOKENS = 300;

async function handlePost(req: Request, requestId: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  const ip = clientIp(req);
  const limited = await rateLimit(`chat:${ip}`, {
    limit: CHAT_LIMIT,
    windowMs: CHAT_WINDOW_MS,
  });

  if (!limited.allowed) {
    logger.warn("chat: rate limited", {
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
    logger.warn("chat: request rejected", { requestId, issue, status });
    return apiJson(fallbackPayload, { status });
  }

  const parsed = chatBodySchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn("chat: invalid body", {
      requestId,
      issue: parsed.error.issues[0]?.message,
    });
    return apiJson(fallbackPayload, { status: 400 });
  }
  const body = parsed.data;

  if (!apiKey) return apiJson(fallbackPayload);

  const history = body.messages.map((m) => ({ role: m.role, content: m.content }));
  const userParts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [
    {
      type: "text",
      text: [
        body.prompt,
        body.notes ? `\n\nStudent notes:\n${body.notes}` : "",
        body.visionContext ? `\n\n${body.visionContext}` : "",
        body.visionAnswer ? `\n\nOn-device vision hint:\n${body.visionAnswer}` : "",
      ].join(""),
    },
  ];

  if (body.imageDataUrl) {
    userParts.push({ type: "image_url", image_url: { url: body.imageDataUrl } });
  }

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.6,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: "system", content: SYSTEM_PERSONALITY },
          ...history,
          { role: "user", content: userParts },
        ],
      }),
      signal: upstreamSignal(req),
      cache: "no-store",
    });

    if (!res.ok) {
      logger.error("chat: upstream failed", { requestId, status: res.status });
      return apiJson(fallbackPayload, { status: 502 });
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content || null;
    return apiJson({ text });
  } catch (error) {
    const status = error instanceof Error && error.name === "TimeoutError" ? 504 : 502;
    logger.error("chat: upstream error", {
      requestId,
      status,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return apiJson(fallbackPayload, { status });
  }
}

export function POST(req: Request) {
  return trackApiRequest("chat", req, (requestId) => handlePost(req, requestId));
}
