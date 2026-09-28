"use client";

import { useEffect, useState } from "react";
import { generateQuizQuestions } from "@/lib/ai";
import { listDocuments } from "@/lib/database";
import type { QuizQuestion, StudyDocument } from "@/lib/types";

type Props = {
  draft?: QuizQuestion[];
  onReady?: (questions: QuizQuestion[]) => void;
};

export default function QuizGenerator({ draft, onReady }: Props) {
  const [docs, setDocs] = useState<StudyDocument[]>([]);
  const [topic, setTopic] = useState("");
  const [quiz, setQuiz] = useState<QuizQuestion[]>(draft ?? []);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [revealed, setRevealed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listDocuments()
      .then((loaded) => {
        if (!cancelled) setDocs(loaded);
      })
      .catch(() => {
        if (!cancelled) setNotice("Couldn't load your notes for quiz creation.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (draft?.length) onReady?.(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.length]);

  async function generate() {
    if (generating) return;
    setGenerating(true);
    setNotice(null);
    setRevealed(false);
    setPicks({});
    try {
      const questions = await generateQuizQuestions({ documents: docs, topic });
      setQuiz(questions);
      if (!questions.length) setNotice("Add some notes first, or type a topic.");
      else onReady?.(questions);
    } catch {
      setNotice("I couldn't build that quiz. Try again in a moment.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="panel-card">
      <h2>Quiz</h2>
      <p className="muted">Turn your notes or a topic into a quick check-in.</p>
      <input
        className="field"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Topic, e.g. public relations"
      />
      <button
        type="button"
        className="pill-btn"
        onClick={() => void generate()}
        disabled={generating}
      >
        {generating ? "Building your quiz…" : "Create a quiz"}
      </button>
      {notice && <p className="fallback-note" role="status">{notice}</p>}
      {quiz.length > 0 && (
        <ol className="quiz-list">
          {quiz.map((q) => (
            <li key={q.id}>
              <p>{q.prompt}</p>
              {q.options.map((opt, i) => (
                <label key={opt} className="quiz-opt">
                  <input
                    type="radio"
                    name={q.id}
                    checked={picks[q.id] === i}
                    onChange={() => setPicks((p) => ({ ...p, [q.id]: i }))}
                  />
                  {opt}
                </label>
              ))}
              {revealed && (
                <p className="muted">
                  {picks[q.id] === q.answerIndex ? "Nice." : "Not quite."} {q.explanation}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      {quiz.length > 0 && (
        <button type="button" className="pill-btn ghost" onClick={() => setRevealed(true)}>
          Check answers
        </button>
      )}
    </section>
  );
}