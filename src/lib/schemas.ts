import { z } from "zod";

/**
 * Server-side validation contracts (zod) for the public API routes.
 * Enforced server-side even though the client also type-checks, because the
 * routes are public endpoints and must not trust the caller.
 */

export const MAX_JSON_BYTES = 7_000_000;
export const MAX_IMAGE_DATA_URL = 6_000_000;
export const MAX_CHAT_HISTORY = 12;
export const MAX_PROMPT_CHARS = 4000;
export const MAX_NOTES_CHARS = 24_000;
export const MAX_SCENE_CHARS = 5000;

const dataUrl = z
  .string()
  .max(MAX_IMAGE_DATA_URL, "frame too large")
  .regex(
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/\s]+={0,2}$/,
    "expected a jpeg/png/webp data URL",
  );

const message = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(MAX_PROMPT_CHARS * 2),
});

export const chatBodySchema = z.object({
  messages: z.array(message).max(MAX_CHAT_HISTORY).default([]),
  prompt: z.string().min(1, "prompt is required").max(MAX_PROMPT_CHARS),
  notes: z.string().max(MAX_NOTES_CHARS).optional(),
  visionContext: z.string().max(MAX_PROMPT_CHARS).optional(),
  visionAnswer: z.string().max(2000).optional(),
  imageDataUrl: dataUrl.optional(),
});

export type ChatBody = z.infer<typeof chatBodySchema>;

export const visionBodySchema = z.object({
  prompt: z.string().min(1, "prompt is required").max(MAX_PROMPT_CHARS),
  imageDataUrl: dataUrl,
  scene: z
    .unknown()
    .optional()
    .refine(
      (value) => value === undefined || JSON.stringify(value).length <= MAX_SCENE_CHARS,
      "scene context too large",
    ),
});

export type VisionBody = z.infer<typeof visionBodySchema>;

/** Shared, stable shape the client expects from hardened routes. */
export const fallbackPayload = { text: null, fallback: true } as const;