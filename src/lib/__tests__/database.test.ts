import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllData,
  clearStudyData,
  DB_NAME,
  defaultSettings,
  deleteDocument,
  getDay,
  listDocuments,
  listRecentDays,
  listReviewCards,
  loadSettings,
  resetDatabaseHandle,
  saveDay,
  saveDocument,
  saveReviewCard,
  saveSettings,
  storageCounts,
  storageEstimate,
  StorageQuotaError,
  StorageUnavailableError,
  subscribeDataChanges,
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

function doc(id: string, createdAt: number): StudyDocument {
  return {
    id,
    name: `${id}.txt`,
    type: "text/plain",
    text: `body of ${id}`,
    createdAt,
  };
}

function day(dateKey: string, updatedAt: number, activeSec: number): DayRecord {
  return {
    dateKey,
    activeSec,
    quizCount: 1,
    reviewCount: 2,
    createdAt: updatedAt,
    updatedAt,
  };
}

function card(id: string, lastReviewAt: number | null, repetitions: number): ReviewCard {
  return {
    id,
    kind: "quiz",
    prompt: `prompt ${id}`,
    options: ["a", "b"],
    answerIndex: 0,
    explanation: "because",
    intervalDays: 2,
    ease: 2.5,
    repetitions,
    state: "learning",
    dueAt: 1_000,
    lastReviewAt,
    createdAt: 500,
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

describe("documents", () => {
  it("stores, sorts, and deletes documents", async () => {
    await saveDocument(doc("old", 1_000));
    await saveDocument(doc("new", 2_000));

    const docs = await listDocuments();
    expect(docs.map((d) => d.id)).toEqual(["new", "old"]);

    await deleteDocument("old");
    await expect(listDocuments()).resolves.toHaveLength(1);
  });

  it("reuses one connection across operations", async () => {
    const openSpy = vi.spyOn(indexedDB, "open");
    await saveDocument(doc("a", 1));
    await saveDocument(doc("b", 2));
    await listDocuments();

    expect(openSpy).toHaveBeenCalledTimes(1);
  });
});

describe("days and review cards", () => {
  it("round-trips day records and newest-first day lists", async () => {
    await saveDay(day("2026-01-01", 1_000, 600));
    await saveDay(day("2026-01-02", 2_000, 1_200));

    await expect(getDay("2026-01-01")).resolves.toMatchObject({ activeSec: 600 });
    const days = await listRecentDays();
    expect(days.map((d) => d.dateKey)).toEqual(["2026-01-02", "2026-01-01"]);
  });

  it("limits recent days", async () => {
    await saveDay(day("2026-01-01", 1_000, 600));
    await saveDay(day("2026-01-02", 2_000, 600));
    await saveDay(day("2026-01-03", 3_000, 600));

    await expect(listRecentDays(2)).resolves.toHaveLength(2);
  });

  it("stores review cards", async () => {
    await saveReviewCard(card("quiz-1", null, 0));

    const cards = await listReviewCards();
    expect(cards).toHaveLength(1);
    expect(cards[0]?.id).toBe("quiz-1");
  });
});

describe("settings", () => {
  it("falls back to defaults, persists, and clears", async () => {
    expect(loadSettings()).toEqual(defaultSettings);

    saveSettings({ ...defaultSettings, dailyGoalMinutes: 45, onboarded: true });
    expect(loadSettings().dailyGoalMinutes).toBe(45);

    await clearAllData();
    expect(localStorage.getItem("studymate-settings")).toBeNull();
  });
});

describe("clearing", () => {
  it("clears every study store and reports counts", async () => {
    await saveDocument(doc("a", 1));
    await saveDay(day("2026-01-01", 1, 60));
    await saveReviewCard(card("quiz-1", null, 0));

    await expect(storageCounts()).resolves.toEqual({
      documents: 1,
      reviewCards: 1,
      days: 1,
    });

    await clearAllData();

    await expect(storageCounts()).resolves.toEqual({
      documents: 0,
      reviewCards: 0,
      days: 0,
    });
  });

  it("keeps data when only study stores are cleared", async () => {
    saveSettings({ ...defaultSettings, dailyGoalMinutes: 30 });
    await saveDocument(doc("a", 1));

    await clearStudyData();

    expect(loadSettings().dailyGoalMinutes).toBe(30);
    await expect(listDocuments()).resolves.toEqual([]);
  });
});

describe("change notifications", () => {
  it("notifies subscribers after writes", async () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    const seen: number[] = [];
    const unsubscribe = subscribeDataChanges(() => seen.push(Date.now()));

    await saveDocument(doc("a", 1));
    expect(seen).toHaveLength(1);

    await clearStudyData();
    expect(seen).toHaveLength(2);

    unsubscribe();
    await saveDocument(doc("b", 2));
    expect(seen).toHaveLength(2);
  });
});

describe("storage limits", () => {
  it("fails reads and writes without indexedDB", async () => {
    vi.stubGlobal("indexedDB", undefined);

    await expect(listDocuments()).resolves.toEqual([]);
    await expect(storageCounts()).resolves.toEqual({
      documents: 0,
      reviewCards: 0,
      days: 0,
    });
    await expect(saveDocument(doc("a", 1))).rejects.toBeInstanceOf(
      StorageUnavailableError,
    );
  });

  it("maps quota failures to a friendly error", async () => {
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      const fakeDb = {
        objectStoreNames: { contains: () => true },
        close: () => undefined,
        transaction: () => ({
          objectStore: () => ({
            put: () => {
              throw new DOMException("full", "QuotaExceededError");
            },
          }),
        }),
      };
      const request: Record<string, unknown> = { result: fakeDb };
      queueMicrotask(() => {
        (request.onsuccess as (() => void) | null)?.();
      });
      return request as unknown as IDBOpenDBRequest;
    });
    resetDatabaseHandle();

    await expect(saveDocument(doc("a", 1))).rejects.toBeInstanceOf(StorageQuotaError);
  });
});

describe("storage estimate", () => {
  it("returns nulls without the storage API", async () => {
    vi.stubGlobal("navigator", {});

    await expect(storageEstimate()).resolves.toEqual({ usage: null, quota: null });
  });

  it("reports usage when available", async () => {
    vi.stubGlobal("navigator", {
      storage: { estimate: async () => ({ usage: 10, quota: 100 }) },
    });

    await expect(storageEstimate()).resolves.toEqual({ usage: 10, quota: 100 });
  });
});
