import type { Instrumentation } from "next";
import { logger } from "@/lib/logger";

function errorDigest(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return undefined;
  }
  return String(error.digest);
}

export function register() {
  logger.info("server: instrumentation ready", {
    runtime: process.env.NEXT_RUNTIME ?? "nodejs",
  });
}

export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  logger.error("server: request error", {
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    errorType: error instanceof Error ? error.name : "unknown",
    digest: errorDigest(error),
  });
};
