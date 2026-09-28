import { describe, expect, it } from "vitest";
import {
  computeStreak,
  countDue,
  dailyProgress,
  dayKey,
  gradeReviewCard,
  isDue,
  scheduleNextReview,
} from "@/lib/retention";
import type { ReviewCard } from "@/lib/types";

const DAY = 86_400_000;
const NOW = new Date(2026, 0, 15, 12, 0, 0).getTime(); // 2026-01-15

function card(overrides: Partial<ReviewCard> = {}): ReviewCard {
  return {
    id: "c1",
    kind: "quiz",
    prompt: "What is two-way communication?",
    options: ["A", "B"],
    answerIndex: 0,
    explanation: "A loop, not a broadcast.",
    intervalDays: 1,
    ease: 2.5,
    repetitions: 0,
    state: "learning",
    dueAt: NOW,
    lastReviewAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

describe("dayKey", () => {
  it("formats a local-tz day key", () => {
    expect(dayKey(NOW)).toBe("2026-01-15");
  });
});

describe("computeStreak", () => {
  it("counts consecutive active days ending today", () => {
    const active = ["2026-01-15", "2026-01-14", "2026-01-13", "2026-01-11"];
    expect(computeStreak(active, "2026-01-15")).toBe(3);
  });

  it("does not break streak when today is not yet active (yesterday anchor)", () => {
    const active = ["2026-01-14", "2026-01-13", "2026-01-12"];
    expect(computeStreak(active, "2026-01-15")).toBe(3);
  });

  it("returns 0 when the most recent day is stale", () => {
    const active = ["2026-01-10", "2026-01-09"];
    expect(computeStreak(active, "2026-01-15")).toBe(0);
  });

  it("handles empty history", () => {
    expect(computeStreak([], "2026-01-15")).toBe(0);
  });
});

describe("dailyProgress", () => {
  it("is not met below goal and clamps ratio to 1", () => {
    expect(dailyProgress(600, 20)).toEqual({
      activeSec: 600,
      goalSec: 1200,
      goalMet: false,
      remainingSec: 600,
      ratio: 0.5,
    });
    expect(dailyProgress(2000, 20).ratio).toBe(1);
  });

  it("is met once active time reaches the goal", () => {
    const p = dailyProgress(1200, 20);
    expect(p.goalMet).toBe(true);
    expect(p.remainingSec).toBe(0);
  });
});

describe("scheduleNextReview", () => {
  it("reset on again drops back to 1 day and lowers ease", () => {
    const s = scheduleNextReview({ intervalDays: 10, ease: 2.5, repetitions: 3 }, "again");
    expect(s.intervalDays).toBe(1);
    expect(s.repetitions).toBe(0);
    expect(s.ease).toBeCloseTo(2.3);
  });

  it("grows interval on good/easy and caps at 90 days", () => {
    const good = scheduleNextReview({ intervalDays: 1, ease: 2.5, repetitions: 0 }, "good");
    expect(good.intervalDays).toBeGreaterThanOrEqual(1);
    const easy = scheduleNextReview({ intervalDays: 40, ease: 3, repetitions: 5 }, "easy");
    expect(easy.intervalDays).toBeLessThanOrEqual(90);
  });
});

describe("gradeReviewCard / isDue / countDue", () => {
  it("rewrites dueAt into the future after grading", () => {
    const graded = gradeReviewCard(card(), "good", NOW);
    expect(graded.lastReviewAt).toBe(NOW);
    expect(graded.dueAt).toBeGreaterThan(NOW);
    expect(isDue(graded, NOW)).toBe(false);
    expect(countDue([graded], NOW + DAY)).toBe(1);
  });

  it("keeps a freshly created card due now", () => {
    const fresh = card();
    expect(isDue(fresh, NOW)).toBe(true);
    expect(countDue([fresh, gradeReviewCard(fresh, "good", NOW)], NOW)).toBe(1);
  });
});