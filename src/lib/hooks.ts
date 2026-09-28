"use client";

import { useCallback, useSyncExternalStore } from "react";
import { defaultSettings, loadSettings, saveSettings } from "./database";
import type { CompanionSettings } from "./types";

const emptySubscribe = () => () => {};

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

/**
 * Hydration-safe "is this running on the client?" check.
 * The server snapshot (false) is used on both the server and the initial
 * client render, so markup always matches; the client value flips to true
 * only after hydration. Use this instead of branching on `typeof window`
 * at render time, which causes hydration mismatches.
 */
export function useIsClient() {
  return useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
}

const SETTINGS_EVENT = "studymate:settings-changed";

let settingsCache: CompanionSettings | null = null;

function refreshSettingsCache(): CompanionSettings {
  const next = loadSettings();
  if (!settingsCache || JSON.stringify(settingsCache) !== JSON.stringify(next)) {
    settingsCache = next;
  }
  return settingsCache;
}

function subscribeSettings(onStoreChange: () => void) {
  window.addEventListener(SETTINGS_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(SETTINGS_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getSettingsSnapshot(): CompanionSettings {
  return refreshSettingsCache();
}

function getSettingsServerSnapshot(): CompanionSettings {
  return defaultSettings;
}

/**
 * Reactive settings store backed by localStorage, hydration-safe via
 * `useSyncExternalStore`. Writes are broadcast so every subscriber stays in
 * sync without bespoke prop drilling.
 */
export function useSettings(): [CompanionSettings, (next: CompanionSettings) => void] {
  const settings = useSyncExternalStore(
    subscribeSettings,
    getSettingsSnapshot,
    getSettingsServerSnapshot,
  );

  const update = useCallback((next: CompanionSettings) => {
    saveSettings(next);
    settingsCache = next;
    window.dispatchEvent(new Event(SETTINGS_EVENT));
  }, []);

  return [settings, update];
}