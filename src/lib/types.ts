export type OrbState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

export type AppView = "home" | "chat" | "docs" | "quiz" | "settings";

export type AppAction =
  | "home"
  | "chat"
  | "docs"
  | "quiz"
  | "settings"
  | "start_listen"
  | "stop_listen"
  | "start_vision"
  | "stop_vision"
  | "summarize_notes"
  | "create_quiz"
  | "vision_question"
  | "none";

export type Role = "user" | "assistant" | "system";

export type Message = {
  id: string;
  role: Exclude<Role, "system">;
  content: string;
  createdAt: number;
};

export type DetectionBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Detection = {
  id: string;
  label: string;
  score: number;
  box: DetectionBox;
  anonymousName?: string;
  positionHint?: string;
  postureHint?: string;
};

export type SceneSummary = {
  peopleCount: number;
  people: Detection[];
  objects: Detection[];
  textHint?: string;
  capturedAt: number;
};

export type StudyDocument = {
  id: string;
  name: string;
  type: string;
  text: string;
  createdAt: number;
};

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

export type CompanionSettings = {
  voiceEnabled: boolean;
  voiceRate: number;
  autoSpeak: boolean;
  compactTranscript: boolean;
  onboarded: boolean;
  dailyGoalMinutes: number;
};

export type ReviewGrade = "again" | "hard" | "good" | "easy";

/**
 * A persisted study-review card (SM-2-lite). `source` says what backs the
 * recall: a generated quiz question or a note you want to revisit.
 */
export type ReviewCard = {
  id: string;
  sourceDocId?: string;
  kind: "quiz" | "note";
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  intervalDays: number;
  ease: number;
  repetitions: number;
  state: "learning" | "review";
  dueAt: number;
  lastReviewAt: number | null;
  createdAt: number;
};

/** One studied day, keyed by local dateKey "YYYY-MM-DD". */
export type DayRecord = {
  dateKey: string;
  activeSec: number;
  quizCount: number;
  reviewCount: number;
  createdAt: number;
  updatedAt: number;
};
