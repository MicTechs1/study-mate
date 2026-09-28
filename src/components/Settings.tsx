"use client";

import { useCallback, useEffect, useState } from "react";
import {
  applyBackup,
  BackupError,
  buildBackup,
  downloadBackup,
  readBackupFile,
  type ImportMode,
} from "@/lib/backup";
import {
  clearAllData,
  defaultSettings,
  storageCounts,
  storageEstimate,
  StorageQuotaError,
  subscribeDataChanges,
} from "@/lib/database";
import { useSettings } from "@/lib/hooks";

type Notice = { tone: "ok" | "error"; text: string };

type Usage = {
  counts: { documents: number; reviewCards: number; days: number } | null;
  usage: number | null;
  quota: number | null;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function describeError(error: unknown): string {
  if (error instanceof BackupError) return error.message;
  if (error instanceof StorageQuotaError) return error.message;
  return "That didn't work. Your existing data is unchanged.";
}

export default function Settings() {
  const [settings, update] = useSettings();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [local, setLocal] = useState<Usage>({
    counts: null,
    usage: null,
    quota: null,
  });

  const refreshUsage = useCallback(async () => {
    const [counts, estimate] = await Promise.all([storageCounts(), storageEstimate()]);
    setLocal({ counts, usage: estimate.usage, quota: estimate.quota });
  }, []);

  useEffect(() => {
    const load = () => {
      void Promise.all([storageCounts(), storageEstimate()]).then(
        ([counts, estimate]) => {
          setLocal({ counts, usage: estimate.usage, quota: estimate.quota });
        },
      );
    };
    load();
    return subscribeDataChanges(load);
  }, []);

  async function exportBackup() {
    setBusy(true);
    try {
      const backup = await buildBackup();
      downloadBackup(backup);
      setNotice({
        tone: "ok",
        text: `Exported ${backup.documents.length} notes, ${backup.reviewCards.length} review cards, and ${backup.days.length} study days.`,
      });
    } catch (error) {
      setNotice({ tone: "error", text: describeError(error) });
    } finally {
      setBusy(false);
    }
  }

  async function importBackup(file: File) {
    setBusy(true);
    try {
      const backup = await readBackupFile(file);
      const summary = await applyBackup(backup, mode);
      if (summary.settingsRestored) {
        update({ ...backup.settings });
      }
      await refreshUsage();
      setNotice({
        tone: "ok",
        text:
          summary.mode === "replace"
            ? `Restored ${summary.documents} notes and ${summary.reviewCards} review cards, replacing local study data.`
            : `Merged ${summary.documents} notes and ${summary.reviewCards} review cards, keeping newer local progress.`,
      });
    } catch (error) {
      setNotice({ tone: "error", text: describeError(error) });
    } finally {
      setBusy(false);
    }
  }

  async function eraseEverything() {
    const confirmed = window.confirm(
      "Erase all local StudyMate data? Notes, review cards, study days, and settings are removed from this device. Export a backup first if you want to keep them.",
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await clearAllData();
      update({ ...defaultSettings });
      await refreshUsage();
      setNotice({ tone: "ok", text: "Local study data erased from this device." });
    } catch (error) {
      setNotice({ tone: "error", text: describeError(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel-card">
      <h2>Settings</h2>
      <label className="toggle">
        <input
          type="checkbox"
          checked={settings.voiceEnabled}
          onChange={(e) => update({ ...settings, voiceEnabled: e.target.checked })}
        />
        Speak replies aloud
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={settings.autoSpeak}
          onChange={(e) => update({ ...settings, autoSpeak: e.target.checked })}
        />
        Auto-speak after each answer
      </label>
      <label className="toggle">
        Voice rate
        <input
          type="range"
          min={0.7}
          max={1.3}
          step={0.05}
          value={settings.voiceRate}
          onChange={(e) =>
            update({ ...settings, voiceRate: Number(e.target.value) })
          }
        />
      </label>
      <label className="toggle">
        Daily study goal
        <input
          type="range"
          min={5}
          max={120}
          step={5}
          value={settings.dailyGoalMinutes}
          onChange={(e) =>
            update({ ...settings, dailyGoalMinutes: Number(e.target.value) })
          }
        />
        <span className="muted">{settings.dailyGoalMinutes} minutes a day</span>
      </label>
      <p className="muted">
        Camera and microphone never start on their own. Vision frames are only sent
        when you ask about what StudyMate can see, and people stay anonymous
        (Person 1, Person 2). Add <code>OPENAI_API_KEY</code> in <code>.env.local</code> for
        a hosted model; otherwise StudyMate still answers locally.
      </p>

      <h3>Your data</h3>
      <p className="muted">
        Notes, review cards, and study days live only in this browser. Export a
        backup to move them to another device, or erase everything permanently.
        {local.counts
          ? ` Right now: ${local.counts.documents} notes, ${local.counts.reviewCards} review cards, ${local.counts.days} study days.`
          : null}
        {local.usage !== null ? ` Using ${formatBytes(local.usage)} of browser storage.` : null}
      </p>
      <div className="row">
        <button
          type="button"
          className="pill-btn"
          disabled={busy}
          onClick={() => void exportBackup()}
        >
          Export backup
        </button>
        <label className="pill-btn ghost">
          Import backup
          <input
            type="file"
            accept="application/json,.json"
            hidden
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importBackup(file);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          className="pill-btn ghost"
          disabled={busy}
          onClick={() => void eraseEverything()}
        >
          Erase all data
        </button>
      </div>
      <label className="toggle">
        When importing
        <select
          className="field"
          value={mode}
          onChange={(e) => setMode(e.target.value === "replace" ? "replace" : "merge")}
        >
          <option value="merge">Merge and keep newer local progress</option>
          <option value="replace">Replace local study data</option>
        </select>
      </label>
      {notice && (
        <p
          className={notice.tone === "ok" ? "muted" : "fallback-note"}
          role="status"
        >
          {notice.text}
        </p>
      )}
    </section>
  );
}