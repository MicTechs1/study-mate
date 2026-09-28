import { afterEach, describe, expect, it, vi } from "vitest";
import { askStudyMate, buildQuizFromText, localReply, pickDistinctiveSentences } from "../ai";
import type { StudyDocument } from "../types";

const NOTES = `Photosynthesis is the process by which green plants convert sunlight into chemical energy. This process uses water and carbon dioxide as raw materials. Oxygen is released as a byproduct during photosynthesis. The captured energy is stored in glucose molecules. Chlorophyll gives leaves their green color and absorbs the light needed for photosynthesis.`;

const DOCUMENT: StudyDocument = {
  id: "doc-1",
  name: "Photosynthesis notes",
  type: "text/plain",
  text: NOTES,
  createdAt: 0,
};

describe("pickDistinctiveSentences", () => {
  it("returns substantive sentences from a passage", () => {
    const picked = pickDistinctiveSentences(NOTES, 3);
    expect(picked.length).toBeGreaterThanOrEqual(2);
    expect(picked[0].length).toBeGreaterThan(0);
  });
});

describe("buildQuizFromText", () => {
  it("builds content-derived questions from notes", () => {
    const quiz = buildQuizFromText(NOTES, "Photosynthesis");
    expect(quiz.length).toBeGreaterThanOrEqual(2);
    for (const question of quiz) {
      expect(question.prompt).toBeTruthy();
      expect(question.options.length).toBeGreaterThanOrEqual(2);
      expect(question.answerIndex).toBeGreaterThanOrEqual(0);
      expect(question.answerIndex).toBeLessThan(question.options.length);
      expect(question.explanation).toBeTruthy();
    }
  });

  it("generates deterministic answer positions within bounds", () => {
    const quiz = buildQuizFromText(NOTES, "Photosynthesis");
    const first = quiz[0];
    expect(first.options[first.answerIndex]).toBeTruthy();
  });

  it("keeps the correct answer sourced from the notes", () => {
    const quiz = buildQuizFromText(NOTES, "Photosynthesis");
    const answerPool = quiz.flatMap((q) => q.options);
    expect(answerPool.some((o) => o.includes("sunlight"))).toBe(true);
  });

  it("falls back to a generic quiz when there is no source text", () => {
    const quiz = buildQuizFromText("", "Physics");
    expect(quiz).toHaveLength(4);
    for (const question of quiz) {
      expect(question.options).toHaveLength(4);
    }
  });
});

describe("localReply", () => {
  it("tells the user to add notes before summarizing", () => {
    expect(localReply({ prompt: "summarize my notes" })).toContain(
      "don't have any notes",
    );
  });

  it("summarizes when documents exist", () => {
    const reply = localReply({
      prompt: "summarize my notes",
      documents: [DOCUMENT],
    });
    expect(reply).toContain("Photosynthesis");
  });

  it("greets without routing to the model", () => {
    expect(localReply({ prompt: "hello" })).toContain("What are we working on");
  });

  it("surfaces an existing vision answer", () => {
    const reply = localReply({
      prompt: "what do you see?",
      visionAnswer: "I can see 1 person.",
    });
    expect(reply).toBe("I can see 1 person.");
  });
});

describe("askStudyMate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("omits an absent image instead of sending null", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "answer" }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const reply = await askStudyMate({ messages: [], prompt: "hello" });

    expect(reply).toBe("answer");
    const body = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty("imageDataUrl");
    expect(body.visionAnswer).toBeUndefined();
  });
});