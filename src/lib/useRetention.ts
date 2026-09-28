"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDay,
  listRecentDays,
  listReviewCards,
  saveDay,
  saveReviewCard,
  subscribeDataChanges,
} from "./database";
import {
  computeStreak,
  dayKey,
  gradeReviewCard,
} from "./retention";
import type {
  DayRecord,
  QuizQuestion,
  ReviewCard,
  ReviewGrade,
} from "./types";

const FLUSH_EVERY_MS = 15_000;

function emptyCards(): ReviewCard[] {
  return [];
}

export function useRetention() {
  const [day, setDay] = useState<DayRecord | null>(null);
  const [streak, setStreak] = useState(0);
  const [cards, setCards] = useState<ReviewCard[]>(emptyCards);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [ready, setReady] = useState(false);
  const accSecRef = useRef(0);
  const mountedRef = useRef(false);

  const refreshDay = useCallback(async () => {
    const now = Date.now();
    const key = dayKey(now);
    const current = (await getDay(key)) ?? {
      dateKey: key,
      activeSec: 0,
      quizCount: 0,
      reviewCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    setDay(current);
  }, []);

  const refreshDashboard = useCallback(async () => {
    const [days, reviewCards] = await Promise.all([
      listRecentDays(365),
      listReviewCards(),
    ]);
    const key = dayKey(Date.now());
    const activeDays = days.filter((d) => d.activeSec > 0).map((d) => d.dateKey);
    setStreak(computeStreak(activeDays, key));
    setCards(reviewCards);
    setReady(true);
    void refreshDay();
  }, [refreshDay]);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    void refreshDashboard();
  }, [refreshDashboard]);

  useEffect(() => {
    return subscribeDataChanges(() => {
      void refreshDashboard();
    });
  }, [refreshDashboard]);

  const flushSeconds = useCallback(async () => {
    const acc = accSecRef.current;
    if (acc <= 0) return;
    accSecRef.current = 0;
    const now = Date.now();
    const key = dayKey(now);
    const prev = await getDay(key);
    const updated: DayRecord = {
      dateKey: key,
      activeSec: (prev?.activeSec ?? 0) + acc,
      quizCount: prev?.quizCount ?? 0,
      reviewCount: prev?.reviewCount ?? 0,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    await saveDay(updated);
    setDay(updated);
    const activeDays = await listRecentDays(365);
    setStreak(
      computeStreak(
        activeDays.filter((d) => d.activeSec > 0).map((d) => d.dateKey),
        key,
      ),
    );
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const tick = () => {
      if (document.visibilityState === "visible") {
        accSecRef.current += 1;
      }
    };
    const flush = () => {
      setNowMs(Date.now());
      void flushSeconds();
    };
    const timer = window.setInterval(tick, 1000);
    const interval = window.setInterval(flush, FLUSH_EVERY_MS);
    const onHidden = () => void flushSeconds();
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onHidden);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onHidden);
      onHidden();
    };
  }, [flushSeconds]);

  /** Turn fresh quiz questions into due review cards (identity-stable upserts). */
  const scheduleQuiz = useCallback(
    async (questions: QuizQuestion[], now = Date.now()) => {
      let added = 0;
      const existing = await listReviewCards();
      for (const q of questions) {
        if (existing.some((c) => c.prompt === q.prompt)) continue;
        const card: ReviewCard = {
          id: `quiz-${q.id}`,
          kind: "quiz",
          prompt: q.prompt,
          options: q.options,
          answerIndex: q.answerIndex,
          explanation: q.explanation,
          intervalDays: 1,
          ease: 2.5,
          repetitions: 0,
          state: "learning",
          dueAt: now,
          lastReviewAt: null,
          createdAt: now,
        };
        await saveReviewCard(card);
        existing.push(card);
        added += 1;
      }
      if (added) await refreshDashboard();
      return added;
    },
    [refreshDashboard],
  );

  /** Grade a card; persists the rescheduled card and bumps today's review count. */
  const grade = useCallback(
    async (cardId: string, grade: ReviewGrade) => {
      const existing = await listReviewCards();
      const card = existing.find((c) => c.id === cardId);
      if (!card) return;
      const now = Date.now();
      const updated = gradeReviewCard(card, grade, now);
      await saveReviewCard(updated);
      const key = dayKey(now);
      const prev = await getDay(key);
      const dayUpdated: DayRecord = {
        dateKey: key,
        activeSec: prev?.activeSec ?? 0,
        quizCount: prev?.quizCount ?? 0,
        reviewCount: (prev?.reviewCount ?? 0) + 1,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      };
      await saveDay(dayUpdated);
      setDay(dayUpdated);
      const cardsAfter = await listReviewCards();
      setCards(cardsAfter);
      const activeDays = await listRecentDays(365);
      setStreak(
        computeStreak(
          activeDays.filter((d) => d.activeSec > 0).map((d) => d.dateKey),
          key,
        ),
      );
    },
    [],
  );

  const dueCards = cards
    .filter((c) => c.dueAt <= nowMs)
    .sort((a, b) => a.dueAt - b.dueAt);

  return {
    ready,
    day,
    streak,
    dueCount: dueCards.length,
    dueCards,
    scheduleQuiz,
    grade,
  };
}

export type Retention = ReturnType<typeof useRetention>;