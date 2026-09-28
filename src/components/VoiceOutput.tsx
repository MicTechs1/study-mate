"use client";

import { isSpeechSynthesisSupported } from "@/lib/speech";

type Props = {
  speaking: boolean;
  onStop?: () => void;
};

export default function VoiceOutput({ speaking, onStop }: Props) {
  if (!speaking) return null;
  if (!isSpeechSynthesisSupported()) return null;
  return (
    <button type="button" className="text-link" onClick={onStop}>
      Stop speaking
    </button>
  );
}
