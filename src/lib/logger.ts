/**
 * Tiny structured logger for the server. Kept dependency-free and secret-safe:
 * callers must never pass API keys or bearer tokens as meta.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function minimumLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  if (raw && raw in LEVEL_WEIGHT) return raw;
  return process.env.NODE_ENV === "test" ? "error" : "info";
}

const threshold = LEVEL_WEIGHT[minimumLevel()];

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  if (LEVEL_WEIGHT[level] < threshold) return;
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...(meta ? { ...meta } : {}),
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
};

/** Convenience alias for error paths. */
export const reportError = logger.error;