import { QUIZ_JSON_SCHEMA_HINT } from "./prompts";
import type { Message, SceneSummary, StudyDocument, QuizQuestion } from "./types";

function localKnowledge(prompt: string) {
  const q = prompt.toLowerCase();
  if (/two-way communication|two way communication/.test(q)) {
    return "Two-way communication is a loop, not a broadcast. One person sends a message, the other receives it, then responds — questions, feedback, a nod, a reply. That's how both sides can check meaning instead of assuming it landed. In class or PR work, it looks like listening, clarifying, and adjusting, not just talking at someone.";
  }
  if (/public relations|^pr\b|what is pr/.test(q)) {
    return "Sure. Think of public relations as how an organization builds and keeps a healthy relationship with the people who matter to it — customers, communities, media, employees. It's less about spinning a story and more about earning trust: clear communication, listening, and showing up consistently when things go well and when they don't.";
  }
  if (/hey|hi|hello/.test(q) && q.split(" ").length < 8) {
    return "Hey! I'm here. What are we working on?";
  }
  if (/who are you|what are you/.test(q)) {
    return "I'm StudyMate — a study companion. Talk to me, show me something with Vision, or open your notes and I'll help you think it through.";
  }
  return null;
}

export function localReply(input: {
  prompt: string;
  documents?: StudyDocument[];
  scene?: SceneSummary | null;
  visionAnswer?: string | null;
}): string {
  if (input.visionAnswer) return input.visionAnswer;
  const known = localKnowledge(input.prompt);
  if (known) return known;

  if (/summarize|summarise/.test(input.prompt.toLowerCase())) {
    if (!input.documents?.length) {
      return "I don't have any notes yet. Open Documents and add something, then ask me to summarize.";
    }
    const excerpt = input.documents
      .slice(0, 2)
      .map((d) => d.text.slice(0, 400))
      .join("\n\n");
    return `Here's the heart of your notes: ${excerpt.slice(0, 500)}${excerpt.length > 500 ? "…" : ""}`;
  }

  return `I can help with that. ${input.prompt.replace(/^hey studymate[,.]?\s*/i, "")} is worth unpacking slowly — tell me if you want a simple definition, an example, or a quiz on it. If I don't have a live model connected, I'll still reason with what you've given me, including your notes and anything currently in Vision.`;
}

export async function askStudyMate(input: {
  messages: Message[];
  prompt: string;
  documents?: StudyDocument[];
  scene?: SceneSummary | null;
  visionAnswer?: string | null;
  imageDataUrl?: string | null;
}): Promise<string> {
  const notes = (input.documents || [])
    .slice(0, 4)
    .map((d) => `### ${d.name}\n${d.text.slice(0, 2500)}`)
    .join("\n\n");

  const visionContext = input.scene
    ? `Current anonymous vision snapshot (do not invent extra detail): ${JSON.stringify({
        peopleCount: input.scene.peopleCount,
        people: input.scene.people.map((p) => ({
          name: p.anonymousName,
          posture: p.postureHint,
          position: p.positionHint,
        })),
        objects: input.scene.objects.map((o) => o.label),
      })}`
    : "Vision is off or no snapshot is available.";

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: input.messages.slice(-12),
        prompt: input.prompt,
        notes,
        visionContext,
        visionAnswer: input.visionAnswer ?? undefined,
        ...(input.imageDataUrl ? { imageDataUrl: input.imageDataUrl } : {}),
      }),
    });
    if (!res.ok) throw new Error("chat failed");
    const data = (await res.json()) as { text?: string };
    if (data.text?.trim()) return data.text.trim();
  } catch {
    // local fallback
  }

  return localReply(input);
}

/* ------------------------------------------------------------------------- */
/* Quiz generation                                                           */
/* ------------------------------------------------------------------------- */

function extractSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function wordFrequency(sentences: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const sentence of sentences) {
    const words = sentence
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3);
    for (const word of words) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }
  }
  return freq;
}

function scoreSentence(sentence: string, freq: Map<string, number>): number {
  const words = sentence
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  if (words.length < 4) return 0;
  const contentScore = words.reduce((sum, w) => sum + (freq.get(w) || 0), 0);
  return contentScore + Math.min(words.length, 18) * 0.5;
}

/** Picks up to 4 distinctive, non-overlapping sentences from the notes. */
export function pickDistinctiveSentences(text: string, limit = 4): string[] {
  const sentences = extractSentences(text).filter(
    (s) => s.length >= 6 && s.length <= 220,
  );
  if (!sentences.length) return [];
  const freq = wordFrequency(sentences);
  const scored = sentences.map((sentence) => ({
    sentence,
    score: scoreSentence(sentence, freq),
  }));
  scored.sort((a, b) => b.score - a.score);

  const chosen: string[] = [];
  for (const { sentence } of scored) {
    const stem = sentence.slice(0, 40).toLowerCase();
    if (chosen.some((c) => c.slice(0, 40).toLowerCase() === stem)) continue;
    chosen.push(sentence);
    if (chosen.length >= limit) break;
  }
  return chosen;
}

function clip(text: string, max = 110) {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function genericQuiz(subject: string): QuizQuestion[] {
  return [
    {
      id: "q1",
      prompt: `What is the main idea in ${subject}?`,
      options: [
        "The core concept described in the material",
        "A random unrelated fact",
        "A definition from another course",
        "None of the above",
      ],
      answerIndex: 0,
      explanation: "Start from the central claim in the material, then build details around it.",
    },
    {
      id: "q2",
      prompt: "Which of these best describes an active study habit?",
      options: [
        "Testing yourself and recalling ideas",
        "Re-reading notes without pausing",
        "Highlighting entire pages",
        "Cramming the night before",
      ],
      answerIndex: 0,
      explanation: "Retrieval practice — testing and recall — beats passive re-reading.",
    },
    {
      id: "q3",
      prompt: `Studying "${subject}" most likely means…`,
      options: [
        "Applying the ideas to examples and practice",
        "Memorizing terms without meaning",
        "Avoiding practice questions",
        "Skipping explanations",
      ],
      answerIndex: 0,
      explanation: "Turning facts into understanding happens through application and practice.",
    },
    {
      id: "q4",
      prompt: "When StudyMate is unsure about what the camera sees, it should…",
      options: [
        "Say it's not sure",
        "Guess extra detail",
        "Name private individuals",
        "Keep the camera on after you leave",
      ],
      answerIndex: 0,
      explanation: "Never invent visual information. Uncertainty is the honest answer.",
    },
  ];
}

/**
 * Deterministic, offline, content-derived quiz: pulls the most distinctive
 * sentences from the user's notes and builds multiple-choice questions around
 * them. Used both as a fallback when no hosted model is available and as a
 * speedier first paint while the AI answer is being generated.
 */
export function buildQuizFromText(text: string, topic?: string): QuizQuestion[] {
  const source = text.replace(/\s+/g, " ").trim();
  const subject = topic || "your notes";

  if (!source) return genericQuiz(subject);

  const sentences = pickDistinctiveSentences(source, 5);
  if (sentences.length < 2) return genericQuiz(subject);

  const correct = sentences.slice(0, 4);
  const distractors = [...sentences].reverse();

  return correct.map((sentence, i) => {
    const opts = new Set<string>([clip(sentence)]);
    for (const distractor of distractors) {
      const option = clip(distractor);
      if (option !== clip(sentence)) opts.add(option);
      if (opts.size === 4) break;
    }
    const options = [...opts];
    while (options.length < 4) {
      options.push(`Another topic ${options.length}`);
    }
    const answerIndex = i % options.length;
    return {
      id: `q${i + 1}`,
      prompt: `Which statement is supported by your notes?`,
      options,
      answerIndex,
      explanation: `This is drawn from: "${clip(sentence, 160)}".`,
    };
  });
}

function parseQuizJson(text: string | null | undefined): QuizQuestion[] {
  if (!text) return [];
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  try {
    const raw: unknown = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(raw)) return [];
    const questions: QuizQuestion[] = [];
    raw.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const record = item as Record<string, unknown>;
      if (typeof record.prompt !== "string") return;
      if (!Array.isArray(record.options)) return;
      const options = record.options
        .filter((o): o is string => typeof o === "string")
        .slice(0, 4);
      if (options.length < 2) return;
      const answerIndex =
        typeof record.answerIndex === "number"
          ? Math.min(Math.max(Math.floor(record.answerIndex), 0), options.length - 1)
          : 0;
      questions.push({
        id: `ai-${index + 1}`,
        prompt: record.prompt,
        options,
        answerIndex,
        explanation:
          typeof record.explanation === "string" ? record.explanation : "Review your notes for the supporting detail.",
      });
    });
    return questions;
  } catch {
    return [];
  }
}

/**
 * Tries the hosted model for structured questions grounded in the user's notes
 * and silently falls back to the offline builder on any failure. Never throws.
 */
export async function generateQuizQuestions(input: {
  documents: StudyDocument[];
  topic?: string;
}): Promise<QuizQuestion[]> {
  const source = input.documents
    .map((d) => d.text)
    .join("\n\n")
    .slice(0, 6000);
  const subject = input.topic?.trim() || input.documents[0]?.name || "your notes";
  const fallback = buildQuizFromText(source, subject);
  if (!source) return fallback;

  try {
    const focus = input.topic?.trim()
      ? ` focusing on: ${input.topic.trim()}`
      : "";
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [],
        prompt: `Create 4 short multiple-choice study questions from my notes${focus}. ${QUIZ_JSON_SCHEMA_HINT}`,
        notes: source,
      }),
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as { text?: string | null };
    const parsed = parseQuizJson(data.text ?? null);
    return parsed.length >= 2 ? parsed : fallback;
  } catch {
    return fallback;
  }
}