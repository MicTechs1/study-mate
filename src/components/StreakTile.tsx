"use client";

interface Props {
  streak: number;
  activeSec: number;
  goalMinutes: number;
  dueCount: number;
}

function fmtMinutes(sec: number): string {
  const total = Math.max(0, Math.round(sec / 60));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function StreakTile({ streak, activeSec, goalMinutes, dueCount }: Props) {
  const goalSec = Math.max(0, goalMinutes * 60);
  const ratio = goalSec > 0 ? Math.min(1, activeSec / goalSec) : 1;
  const goalMet = goalSec > 0 && activeSec >= goalSec;
  const percent = Math.round(ratio * 100);

  return (
    <section className="panel-card slim streak-tile">
      <h2>
        <span aria-hidden>🔥</span> {streak > 0 ? `${streak}-day streak` : "Start a streak"}
      </h2>
      <p className="muted">
        {goalMet
          ? "Daily goal met. Nice work — come back tomorrow."
          : `${fmtMinutes(activeSec)} studied. ${Math.max(0, goalMinutes - Math.round(activeSec / 60))} min to goal.`}
      </p>
      <div
        className="streak-bar"
        role="progressbar"
        aria-valuenow={streak}
        aria-valuemin={0}
        aria-valuemax={365}
        aria-label={`Daily goal ${percent}% complete`}
      >
        <span className="streak-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="muted">
        {dueCount > 0 ? `${dueCount} review${dueCount === 1 ? "" : "s"} waiting` : "All reviews caught up"}
      </p>
    </section>
  );
}