"use client";

import { useState } from "react";
import type { ReviewCard, ReviewGrade } from "@/lib/types";

const GRADES: { id: ReviewGrade; label: string }[] = [
  { id: "again", label: "Again" },
  { id: "hard", label: "Hard" },
  { id: "good", label: "Good" },
  { id: "easy", label: "Easy" },
];

type Props = {
  due: ReviewCard[];
  onGrade: (cardId: string, grade: ReviewGrade) => Promise<void>;
};

export default function ReviewQueue({ due, onGrade }: Props) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [doneInSession, setDoneInSession] = useState(0);

  if (!due.length) {
    return (
      <section className="panel-card slim review-card">
        <h2>Review</h2>
        <p className="muted">
          Nothing due right now. Make a quiz or study a bit and I&apos;ll schedule
          the next review for you.
        </p>
      </section>
    );
  }

  const current = due[Math.min(index, due.length - 1)];

  async function grade(choice: ReviewGrade) {
    if (busy) return;
    setBusy(true);
    await onGrade(current.id, choice);
    setBusy(false);
    setDoneInSession((n) => n + 1);
    if (due.length - 1 > index) setIndex((i) => i + 1);
    else setIndex((i) => (i + 1) % due.length);
  }

  return (
    <section className="panel-card slim review-card">
      <h2>Review · {due.length} due</h2>
      <p className="muted">
        {doneInSession} answered this session. How well did you recall it?
      </p>
      <p className="review-prompt">{current.prompt}</p>
      {current.options.length > 0 && (
        <ul className="review-options">
          {current.options.map((opt) => (
            <li key={opt}>{opt}</li>
          ))}
        </ul>
      )}
      <div className="hero-actions">
        {GRADES.map((g) => (
          <button
            key={g.id}
            type="button"
            className="pill-btn ghost"
            disabled={busy}
            onClick={() => void grade(g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>
    </section>
  );
}