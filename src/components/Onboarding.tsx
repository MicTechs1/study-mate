"use client";

const STEPS = [
  {
    icon: "🎤",
    title: "Talk",
    text: "Tap the orb and speak. StudyMate listens and answers out loud.",
  },
  {
    icon: "👁️",
    title: "Vision",
    text: "Open the camera and ask what's around you. People stay anonymous.",
  },
  {
    icon: "🗒️",
    title: "Notes & quizzes",
    text: "Add notes, then turn them into a summary or a fresh quiz.",
  },
  {
    icon: "🔒",
    title: "Private by default",
    text: "Camera and mic only start when you tap. Everything stays on this device.",
  },
];

type Props = {
  onDone: () => void;
};

export default function Onboarding({ onDone }: Props) {
  return (
    <div className="onboarding-backdrop">
      <div
        className="onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <h2 id="onboarding-title">Welcome to StudyMate</h2>
        <p className="muted">A voice-first study companion that keeps you private.</p>
        <div className="onboarding-steps">
          {STEPS.map((step) => (
            <div key={step.title} className="onboarding-step">
              <span className="onboarding-icon" aria-hidden>
                {step.icon}
              </span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="pill-btn" onClick={onDone}>
          Get started
        </button>
      </div>
    </div>
  );
}