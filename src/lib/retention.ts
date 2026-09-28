import type { ReviewCard, ReviewGrade } from "./types";

export const DAY_MS = 86_400_000;

export const REVIEW_BOX: { [key in ReviewGrade]: number } = {
  again: 0.6,
  hard: 1.0,
  good: 2.5,
  easy: 3.0,
};

const MIN_INTERVAL_DAYS = 1;
const MAX_INTERVAL_DAYS = 90;

/** Local-timezoned day key, "YYYY-MM-DD". */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Date (start of that local day) for a day key. */
export function dayStartForKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** Consecutive-day streak ending today (or yesterday if today isn't met yet). */
export function computeStreak(activeDays: string[], today: string): number {
  const active = new Set(activeDays);
  let cursor = dayStartForKey(today);
  if (!active.has(dayKey(cursor))) {
    cursor -= DAY_MS; // allow an in-progress day to not break the streak
  }
  let streak = 0;
  while (active.has(dayKey(cursor))) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}

export type DayProgress = {
  activeSec: number;
  goalSec: number;
  goalMet: boolean;
  remainingSec: number;
  ratio: number; // 0..1 clamp
};

export function dailyProgress(activeSec: number, goalMinutes: number): DayProgress {
  const goalSec = Math.max(0, Math.round(goalMinutes * 60));
  const ratio = goalSec > 0 ? Math.min(1, activeSec / goalSec) : 1;
  return {
    activeSec,
    goalSec,
    goalMet: goalSec > 0 && activeSec >= goalSec,
    remainingSec: Math.max(0, goalSec - activeSec),
    ratio,
  };
}

/** SM-2-lite: bump interval by ease; reset on "again". */
export function scheduleNextReview(
  card: Pick<ReviewCard, "intervalDays" | "ease" | "repetitions">,
  grade: ReviewGrade,
): { intervalDays: number; ease: number; repetitions: number } {
  if (grade === "again") {
    return {
      intervalDays: MIN_INTERVAL_DAYS,
      ease: Math.max(1.3, card.ease - 0.2),
      repetitions: 0,
    };
  }
  const ease = Math.max(1.3, card.ease + (grade === "easy" ? 0.15 : grade === "hard" ? -0.15 : 0));
  let intervalDays: number;
  switch (grade) {
    case "hard":
      intervalDays = Math.max(MIN_INTERVAL_DAYS, Math.round(card.intervalDays * REVIEW_BOX.hard));
      break;
    case "good":
      intervalDays = card.repetitions === 0 ? MIN_INTERVAL_DAYS : Math.round(card.intervalDays * REVIEW_BOX.good);
      break;
    case "easy":
      intervalDays = Math.round(card.intervalDays * REVIEW_BOX.easy);
      break;
    default:
      intervalDays = card.intervalDays;
  }
  intervalDays = Math.min(MAX_INTERVAL_DAYS, Math.max(1, intervalDays));
  const repetitions = grade === "easy" ? card.repetitions + 2 : card.repetitions + 1;
  return { intervalDays, ease, repetitions };
}

/** Day key the card is next due. */
export function nextReviewKey(card: ReviewCard): string {
  return dayKey(card.dueAt);
}

export function gradeReviewCard(
  card: ReviewCard,
  grade: ReviewGrade,
  now: number,
): ReviewCard {
  const sched = scheduleNextReview(card, grade);
  const due = now + sched.intervalDays * DAY_MS;
  return {
    ...card,
    intervalDays: sched.intervalDays,
    ease: sched.ease,
    repetitions: sched.repetitions,
    lastReviewAt: now,
    dueAt: due,
    state: sched.repetitions === 0 ? "learning" : "review",
  };
}

export function isDue(card: ReviewCard, now: number): boolean {
  return card.dueAt <= now;
}

export function countDue(cards: ReviewCard[], now: number): number {
  return cards.reduce((n, c) => n + (isDue(c, now) ? 1 : 0), 0);
}
