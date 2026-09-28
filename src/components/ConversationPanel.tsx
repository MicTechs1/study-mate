"use client";

import type { Message } from "@/lib/types";

type Props = {
  messages: Message[];
  expanded: boolean;
  onToggle: () => void;
  compact?: boolean;
};

export default function ConversationPanel({
  messages,
  expanded,
  onToggle,
  compact = true,
}: Props) {
  const visible = compact && !expanded ? messages.slice(-4) : messages;

  return (
    <aside className={`conversation-panel ${expanded ? "expanded" : ""}`}>
      <div className="panel-head">
        <h2>Conversation</h2>
        <button type="button" className="text-link" onClick={onToggle}>
          {expanded ? "Minimize" : "Open chat"}
        </button>
      </div>
      {visible.length === 0 ? (
        <p className="muted">Talk to StudyMate and a light transcript will appear here.</p>
      ) : (
        <ul className="transcript">
          {visible.map((m) => (
            <li key={m.id} className={m.role}>
              <strong>{m.role === "user" ? "You" : "StudyMate"}:</strong>
              <span>{m.content}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
