import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyBackup,
  BACKUP_VERSION,
  BackupError,
  backupFileName,
  buildBackup,
  downloadBackup,
  parseBackup,
  readBackupFile,
  serializeBackup,
  type Backup,
} from "../backup";
import {
  DB_NAME,
  defaultSettings,
  getDay,
  listDocuments,
  listReviewCards,
  resetDatabaseHandle,
  saveDay,
  saveDocument,
  saveReviewCard,
  saveSettings,
} from "../database";
import type { DayRecord, ReviewCard, StudyDocument } from "../types";

function deleteDatabase(name: string) {
  return new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function makeMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

function doc(id: string, text = "body", createdAt = 1_000): StudyDocument {
  return { id, name: `${id}.txt`, type: "text/plain", text, createdAt };
}

function day(dateKey: string, updatedAt: number, activeSec: number): DayRecord {
  return {
    dateKey,
    activeSec,
    quizCount: 0,
    reviewCount: 0,
    createdAt: updatedAt,
    updatedAt,
  };
}

function card(
  id: string,
  lastReviewAt: number | null,
  repetitions: number,
  prompt = `prompt ${id}`,
): ReviewCard {
  return {
    id,
    kind: "quiz",
    prompt,
    options: ["a", "b"],
    answerIndex: 0,
    explanation: "because",
    intervalDays: 1,
    ease: 2.5,
    repetitions,
    state: "review",
    dueAt: 5_000,
    lastReviewAt,
    createdAt: 500,
  };
}

function emptyBackup(overrides: Partial<Backup> = {}): Backup {
  return {
    app: "studymate",
    version: BACKUP_VERSION,
    exportedAt: 1_700_000_000_000,
    documents: [],
    days: [],
    reviewCards: [],
    settings: { ...defaultSettings },
    ...overrides,
  };
}

beforeEach(async () => {
  resetDatabaseHandle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await deleteDatabase(DB_NAME);
  vi.stubGlobal("localStorage", makeMemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseBackup", () => {
  it("rejects non-JSON input", () => {
    expect(() => parseBackup("not json")).toThrow(BackupError);
  });

  it("rejects a different app or version", () => {
    expect(() => parseBackup(JSON.stringify({ ...emptyBackup(), app: "other" }))).toThrow(
      /not a StudyMate backup/,
    );
    expect(() => parseBackup(JSON.stringify({ ...emptyBackup(), version: 99 }))).toThrow(
      BackupError,
    );
  });

  it("reports the offending fields", () => {
    const broken = { ...emptyBackup(), documents: [{ id: "", name: "x" }] };

    try {
      parseBackup(JSON.stringify(broken));
      expect.unreachable("expected a BackupError");
    } catch (error) {
      expect(error).toBeInstanceOf(BackupError);
      expect((error as BackupError).issues.join(" ")).toContain("documents.0");
    }
  });

  it("rejects an out-of-range answer index", () => {
    const broken = emptyBackup({
      reviewCards: [{ ...card("quiz-1", null, 1), answerIndex: 5 }],
    });

    expect(() => parseBackup(JSON.stringify(broken))).toThrow(BackupError);
  });

  it("rejects files above the size cap", async () => {
    const oversized = {
      size: 30_000_000,
      text: async () => "{}",
    } as unknown as File;

    await expect(readBackupFile(oversized)).rejects.toThrow(BackupError);
  });
});

describe("buildBackup", () => {
  it("captures local data and settings", async () => {
    await saveDocument(doc("a"));
    await saveDay(day("2026-01-01", 1_000, 600));
    await saveReviewCard(card("quiz-1", null, 0));
    saveSettings({ ...defaultSettings, dailyGoalMinutes: 35 });

    const backup = await buildBackup();

    expect(backup.app).toBe("studymate");
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.documents.map((d) => d.id)).toEqual(["a"]);
    expect(backup.days).toHaveLength(1);
    expect(backup.reviewCards).toHaveLength(1);
    expect(backup.settings.dailyGoalMinutes).toBe(35);
  });

  it("round-trips through serialize and parse", async () => {
    await saveDocument(doc("a", "text"));
    const backup = await buildBackup();

    const parsed = parseBackup(serializeBackup(backup));

    expect(parsed).toEqual(backup);
  });
});

describe("applyBackup replace", () => {
  it("wipes local data and restores the backup", async () => {
    await saveDocument(doc("stale"));
    const backup = emptyBackup({
      documents: [doc("fresh")],
      days: [day("2026-01-02", 2_000, 900)],
      reviewCards: [card("quiz-9", 1_000, 3)],
      settings: { ...defaultSettings, dailyGoalMinutes: 55 },
    });

    const summary = await applyBackup(backup, "replace");

    expect(summary).toEqual({
      mode: "replace",
      documents: 1,
      days: 1,
      reviewCards: 1,
      settingsRestored: true,
    });
    await expect(listDocuments()).resolves.toEqual([doc("fresh")]);
    await expect(getDay("2026-01-02")).resolves.toMatchObject({ activeSec: 900 });
    await expect(listReviewCards()).resolves.toHaveLength(1);
  });
});

describe("applyBackup merge", () => {
  it("keeps the newer day record", async () => {
    await saveDay(day("2026-01-01", 5_000, 900));
    const backup = emptyBackup({ days: [day("2026-01-01", 1_000, 60)] });

    await applyBackup(backup, "merge");

    await expect(getDay("2026-01-01")).resolves.toMatchObject({ activeSec: 900 });
  });

  it("takes a newer incoming day record", async () => {
    await saveDay(day("2026-01-01", 1_000, 60));
    const backup = emptyBackup({ days: [day("2026-01-01", 5_000, 900)] });

    await applyBackup(backup, "merge");

    await expect(getDay("2026-01-01")).resolves.toMatchObject({ activeSec: 900 });
  });

  it("keeps the card with the later review and adds unseen cards", async () => {
    await saveReviewCard(card("quiz-1", 4_000, 7));
    const backup = emptyBackup({
      reviewCards: [card("quiz-1", 1_000, 1), card("quiz-2", 2_000, 2)],
    });

    await applyBackup(backup, "merge");

    const cards = await listReviewCards();
    expect(cards).toHaveLength(2);
    expect(cards.find((c) => c.id === "quiz-1")?.repetitions).toBe(7);
  });

  it("lets an incoming document replace the same id and keeps the rest", async () => {
    await saveDocument(doc("a", "old"));
    await saveDocument(doc("b", "untouched"));
    const backup = emptyBackup({ documents: [doc("a", "new"), doc("c", "added")] });

    await applyBackup(backup, "merge");

    const docs = await listDocuments();
    expect(docs.map((d) => d.id).sort()).toEqual(["a", "b", "c"]);
    expect(docs.find((d) => d.id === "a")?.text).toBe("new");
    expect(docs.find((d) => d.id === "b")?.text).toBe("untouched");
  });

  it("restores settings on replace and leaves them alone on merge", async () => {
    const backup = emptyBackup({
      settings: { ...defaultSettings, dailyGoalMinutes: 42 },
    });

    await applyBackup(backup, "merge");
    expect(localStorage.getItem("studymate-settings")).toBeNull();

    await applyBackup(backup, "replace");
    expect(localStorage.getItem("studymate-settings")).toContain("42");
  });
});

describe("downloadBackup", () => {
  it("creates a dated file name and returns the payload", () => {
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:studymate",
      revokeObjectURL: () => undefined,
    });
    const events: string[] = [];
    const anchor = {
      href: "",
      download: "",
      click: () => events.push("click"),
      remove: () => events.push("remove"),
    };
    const target = {
      createElement: () => anchor,
      body: {
        appendChild: () => events.push("append"),
      },
    } as unknown as Document;
    const backup = emptyBackup({ documents: [doc("a")] });

    const data = downloadBackup(backup, target);

    expect(anchor.download).toBe(backupFileName(new Date(backup.exportedAt)));
    expect(JSON.parse(data).documents).toHaveLength(1);
    expect(events).toEqual(["append", "click", "remove"]);
  });

  it("formats the file name from a date", () => {
    expect(backupFileName(new Date("2026-03-04T10:00:00.000Z"))).toBe(
      "studymate-backup-2026-03-04.json",
    );
  });
});
