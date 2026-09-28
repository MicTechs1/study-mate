export type SpeechRecognitionResultHandler = (text: string, isFinal: boolean) => void;

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported() {
  return Boolean(getRecognitionCtor());
}

export function isSpeechSynthesisSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export async function requestMicrophonePermission() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone access isn't available in this browser.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
}

export function createRecognizer(options: {
  onResult: SpeechRecognitionResultHandler;
  onEnd: () => void;
  onError: (message: string) => void;
}) {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let transcript = "";
    let isFinal = false;
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      transcript += result[0].transcript;
      if (result.isFinal) isFinal = true;
    }
    options.onResult(transcript.trim(), isFinal);
  };

  recognition.onerror = (event) => {
    if (event.error === "aborted" || event.error === "no-speech") {
      options.onEnd();
      return;
    }
    const messages: Record<string, string> = {
      "not-allowed": "Microphone permission was denied.",
      "audio-capture": "No microphone was found.",
      network: "Speech recognition needs a network connection in this browser.",
    };
    options.onError(
      messages[event.error] || "Sorry, I couldn't hear you. Try again.",
    );
  };

  recognition.onend = () => options.onEnd();
  return recognition;
}

export function speakText(
  text: string,
  options?: { rate?: number; onend?: () => void; onboundary?: () => void },
) {
  if (!isSpeechSynthesisSupported()) {
    options?.onend?.();
    return null;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options?.rate ?? 1;
  utterance.pitch = 1;
  utterance.lang = "en-US";

  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => /google|natural|samantha|aria|jenny/i.test(v.name)) ||
    voices.find((v) => v.lang.startsWith("en")) ||
    voices[0];
  if (preferred) utterance.voice = preferred;

  utterance.onend = () => options?.onend?.();
  utterance.onerror = () => options?.onend?.();
  utterance.onboundary = () => options?.onboundary?.();
  window.speechSynthesis.speak(utterance);
  return utterance;
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
