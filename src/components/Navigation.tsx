"use client";

import type { AppView } from "@/lib/types";

const items: { id: AppView; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "chat", label: "Chat" },
  { id: "docs", label: "Docs" },
  { id: "quiz", label: "Quiz" },
  { id: "settings", label: "Settings" },
];

type Props = {
  view: AppView;
  onNavigate: (view: AppView) => void;
  dueCount?: number;
};

export default function Navigation({ view, onNavigate, dueCount = 0 }: Props) {
  return (
    <>
      <nav className="side-nav" aria-label="Primary">
        <div className="brand">StudyMate</div>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? "nav-item active" : "nav-item"}
            aria-current={view === item.id ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            {item.label}
            {item.id === "quiz" && dueCount > 0 && (
              <span className="nav-badge" aria-label={`${dueCount} reviews due`}>
                {dueCount > 9 ? "9+" : dueCount}
              </span>
            )}
          </button>
        ))}
      </nav>
      <nav className="bottom-nav" aria-label="Primary navigation">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? "nav-item active" : "nav-item"}
            aria-current={view === item.id ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            {item.label}
            {item.id === "quiz" && dueCount > 0 && (
              <span className="nav-badge" aria-label={`${dueCount} reviews due`}>
                {dueCount > 9 ? "9+" : dueCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </>
  );
}