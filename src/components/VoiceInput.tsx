"use client";

import { useIsClient } from "@/lib/hooks";
import { isSpeechRecognitionSupported } from "@/lib/speech";

type Props = {
  onTalk: () => void;
  listening: boolean;
  disabled?: boolean;
};

export default function VoiceInput({ onTalk, listening, disabled }: Props) {
  const isClient = useIsClient();
  const supported = isClient && isSpeechRecognitionSupported();
  return (
    <div className="voice-input">
      <button
        type="button"
        className={`pill-btn talk ${listening ? "active" : ""}`}
        onClick={onTalk}
        disabled={disabled}
      >
        <span aria-hidden>🎤</span> Talk
      </button>
      {!supported && (
        <p className="fallback-note">
          Voice input isn&apos;t supported in this browser. You can type instead.
        </p>
      )}
    </div>
  );
}