import { z } from "zod";
import {
  clearStudyData,
  listDocuments,
  listRecentDays,
  listReviewCards,
  loadSettings,
  saveDay,
  saveDocuments,
  saveReviewCards,
  saveSettings,
} from "./database";
import type { DayRecord, ReviewCard, StudyDocument } from "./types";

export const BACKUP_VERSION = 1;

const MAX_BACKUP_BYTES = 25_000_000;
const MAX_DOCUMENTS = 2_000;
const MAX_DAYS = 3_660;
const MAX_CARDS = 20_000;

const documentSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(500),
  type: z.string().min(1).max(200),
  text: z.string().max(2_000_000),
  createdAt: z.number().int().nonnegative(),
});

const daySchema = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  activeSec: z.number().int().nonnegative(),
  quizCount: z.number().int().nonnegative(),
  reviewCount: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

const cardSchema = z
  .object({
    id: z.string().min(1).max(200),
    sourceDocId: z.string().min(1).max(200).optional(),
    kind: z.enum(["quiz", "note"]),
    prompt: z.string().min(1).max(10_000),
    options: z.array(z.string().max(2_000)).max(26),
    answerIndex: z.number().int().nonnegative(),
    explanation: z.string().max(20_000),
    intervalDays: z.number().min(0).max(365),
    ease: z.number().min(0).max(10),
    repetitions: z.number().int().nonnegative(),
    state: z.enum(["learning", "review"]),
    dueAt: z.number().int().nonnegative(),
    lastReviewAt: z.number().int().nonnegative().nullable(),
    createdAt: z.number().int().nonnegative(),
  })
  .refine((card) => card.options.length === 0 || card.answerIndex < card.options.length, {
    message: "answer index is out of range",
    path: ["answerIndex"],
  });

const settingsSchema = z.object({
  voiceEnabled: z.boolean(),
  voiceRate: z.number().min(0.1).max(3),
  autoSpeak: z.boolean(),
  compactTranscript: z.boolean(),
  onboarded: z.boolean(),
  dailyGoalMinutes: z.number().int().min(0).max(1_440),
});

export const backupSchema = z.object({
  app: z.literal("studymate"),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.number().int().nonnegative(),
  documents: z.array(documentSchema).max(MAX_DOCUMENTS),
  days: z.array(daySchema).max(MAX_DAYS),
  reviewCards: z.array(cardSchema).max(MAX_CARDS),
  settings: settingsSchema,
});

export type Backup = z.infer<typeof backupSchema>;

export class BackupError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "BackupError";
    this.issues = issues;
  }
}

export async function buildBackup(): Promise<Backup> {
  const [documents, days, reviewCards] = await Promise.all([
    listDocuments(),
    listRecentDays(MAX_DAYS),
    listReviewCards(),
  ]);
  return {
    app: "studymate",
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    documents,
    days,
    reviewCards,
    settings: loadSettings(),
  };
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 2);
}

export function parseBackup(raw: string): Backup {
  if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) {
    throw new BackupError("That backup file is too large to be a StudyMate backup.");
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new BackupError("That file is not valid JSON.");
  }
  const result = backupSchema.safeParse(json);
  if (!result.success) {
    throw new BackupError(
      "That file is not a StudyMate backup.",
      result.error.issues.slice(0, 5).map((issue) => issue.path.join(".")),
    );
  }
  return result.data;
}

function newerDay(current: DayRecord, incoming: DayRecord) {
  return incoming.updatedAt > current.updatedAt ? incoming : current;
}

function newerCard(current: ReviewCard, incoming: ReviewCard) {
  const currentReview = current.lastReviewAt ?? 0;
  const incomingReview = incoming.lastReviewAt ?? 0;
  if (incomingReview !== currentReview) return incomingReview > currentReview ? incoming : current;
  return incoming.createdAt > current.createdAt ? incoming : current;
}

export type ImportMode = "replace" | "merge";

export type ImportSummary = {
  mode: ImportMode;
  documents: number;
  days: number;
  reviewCards: number;
  settingsRestored: boolean;
};

/**
 * Apply a validated backup. `replace` wipes local study data first. `merge`
 * keeps the more recent record per id so a restore never rolls back progress
 * that happened after the backup was taken.
 */
export async function applyBackup(
  backup: Backup,
  mode: ImportMode = "merge",
): Promise<ImportSummary> {
  let documents: StudyDocument[];
  let days: DayRecord[];
  let cards: ReviewCard[];

  if (mode === "replace") {
    documents = backup.documents;
    days = backup.days;
    cards = backup.reviewCards;
  } else {
    const [existingDocs, existingDays, existingCards] = await Promise.all([
      listDocuments(),
      listRecentDays(MAX_DAYS),
      listReviewCards(),
    ]);
    const mergedDocs = new Map(existingDocs.map((doc) => [doc.id, doc]));
    for (const doc of backup.documents) mergedDocs.set(doc.id, doc);
    const mergedDays = new Map(existingDays.map((day) => [day.dateKey, day]));
    for (const day of backup.days) {
      const current = mergedDays.get(day.dateKey);
      mergedDays.set(day.dateKey, current ? newerDay(current, day) : day);
    }
    const mergedCards = new Map(existingCards.map((card) => [card.id, card]));
    for (const card of backup.reviewCards) {
      const current = mergedCards.get(card.id);
      mergedCards.set(card.id, current ? newerCard(current, card) : card);
    }
    documents = [...mergedDocs.values()];
    days = [...mergedDays.values()];
    cards = [...mergedCards.values()];
  }

  if (mode === "replace") {
    await clearStudyData();
  }
  await saveDocuments(documents);
  for (const day of days) {
    await saveDay(day);
  }
  await saveReviewCards(cards);
  if (mode === "replace") {
    saveSettings(backup.settings);
  }

  return {
    mode,
    documents: documents.length,
    days: days.length,
    reviewCards: cards.length,
    settingsRestored: mode === "replace",
  };
}

export function backupFileName(now: Date): string {
  const stamp = now.toISOString().slice(0, 10);
  return `studymate-backup-${stamp}.json`;
}

/** Trigger a browser download of the backup; returns the serialized payload. */
export function downloadBackup(backup: Backup, target: Document = document): string {
  const data = serializeBackup(backup);
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const anchor = target.createElement("a");
  anchor.href = url;
  anchor.download = backupFileName(new Date(backup.exportedAt));
  target.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return data;
}

export async function readBackupFile(file: File): Promise<Backup> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new BackupError("That backup file is too large to be a StudyMate backup.");
  }
  return parseBackup(await file.text());
}
