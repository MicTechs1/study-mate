"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("StudyMate route error", {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <main className="app-state-wrap">
      <div className="panel-card app-state">
        <h1>Something went wrong</h1>
        <p className="muted">
          StudyMate hit an unexpected error. Your notes are safe on this device.
        </p>
        {error.digest && <p className="muted">Reference: {error.digest}</p>}
        <div className="row">
          <button type="button" className="pill-btn" onClick={() => retry()}>
            Try again
          </button>
          <Link className="pill-btn ghost" href="/">
            Back home
          </Link>
        </div>
      </div>
    </main>
  );
}