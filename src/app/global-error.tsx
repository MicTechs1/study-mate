"use client";

import "./globals.css";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="app-state-wrap">
        <div className="app-state">
          <h1>Something went wrong</h1>
          <p className="muted">StudyMate couldn&apos;t start.</p>
          {error.digest ? <p className="muted">Reference: {error.digest}</p> : null}
          <button type="button" className="pill-btn" onClick={() => retry()}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}