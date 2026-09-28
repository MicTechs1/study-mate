export default function Loading() {
  return (
    <main className="app-state-wrap">
      <div className="orb-loader" role="status" aria-label="Loading StudyMate">
        <span className="loader-ring" aria-hidden />
      </div>
      <p className="muted">Waking up…</p>
    </main>
  );
}