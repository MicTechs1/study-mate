import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app-state-wrap">
      <div className="panel-card app-state">
        <h1>Page not found</h1>
        <p className="muted">There&apos;s no StudyMate page at this address.</p>
        <Link className="pill-btn" href="/">
          Back home
        </Link>
      </div>
    </main>
  );
}