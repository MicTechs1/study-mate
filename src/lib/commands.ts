import type { AppAction } from "./types";

const WAKE = /^(hey|hi|hello)\s+(studymate|study mate)[,.]?\s*/i;

export function stripWakePhrase(text: string) {
  return text.replace(WAKE, "").trim() || text.trim();
}

export function interpretCommand(raw: string): {
  action: AppAction;
  remainder: string;
} {
  const text = stripWakePhrase(raw).toLowerCase().trim();

  if (!text) return { action: "none", remainder: raw };

  if (/(stop listening|stop talking|be quiet|mute)/.test(text)) {
    return { action: "stop_listen", remainder: text };
  }
  if (/(stop camera|stop vision|turn off (the )?camera|close camera)/.test(text)) {
    return { action: "stop_vision", remainder: text };
  }
  if (/(go home|open home|take me home)/.test(text)) {
    return { action: "home", remainder: text };
  }
  if (/(open (my )?documents|show (my )?notes|open notes)/.test(text)) {
    return { action: "docs", remainder: text };
  }
  if (/(open quiz|create a quiz|make a quiz|quiz me)/.test(text)) {
    return { action: "create_quiz", remainder: text };
  }
  if (/(open (the )?chat|show (the )?conversation)/.test(text)) {
    return { action: "chat", remainder: text };
  }
  if (/(open (my |the )?settings|show (my |the )?settings)/.test(text)) {
    return { action: "settings", remainder: text };
  }
  if (/(summarize (my )?notes|summarise (my )?notes)/.test(text)) {
    return { action: "summarize_notes", remainder: text };
  }
  if (
    /(what (can you |do you )?see|how many people|where is the person|what objects|is there a |what's in (front|the room)|what is in (front|the room)|describe (the )?(scene|room|image))/i.test(
      text,
    )
  ) {
    return { action: "vision_question", remainder: stripWakePhrase(raw) };
  }
  if (/^(start listening|listen|talk)$/.test(text)) {
    return { action: "start_listen", remainder: text };
  }
  if (/(start vision|open camera|turn on (the )?camera|vision mode)/.test(text)) {
    return { action: "start_vision", remainder: text };
  }

  return { action: "none", remainder: stripWakePhrase(raw) };
}

export function isVisionQuestion(text: string) {
  return interpretCommand(text).action === "vision_question";
}
