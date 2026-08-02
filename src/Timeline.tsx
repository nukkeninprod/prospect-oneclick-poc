import type { RunState, StepState } from "./types";

function fmtDuration(ms?: number): string {
  if (!ms) return "";
  return ms >= 1000 ? `${Math.round(ms / 1000)} s` : `${ms} ms`;
}

function StepIcon({ status }: { status: StepState["status"] }) {
  switch (status) {
    case "done":
      return <span className="step-icon done" role="img" aria-label="terminé">✓</span>;
    case "running":
      return <span className="step-icon running" role="img" aria-label="en cours" />;
    case "warning":
      return <span className="step-icon warning" role="img" aria-label="avertissement">!</span>;
    case "stopped":
      return <span className="step-icon stopped" role="img" aria-label="écarté">◦</span>;
    case "error":
      return <span className="step-icon error" role="img" aria-label="échec">✕</span>;
    default:
      return <span className="step-icon pending" aria-hidden="true" />;
  }
}

export function Timeline({ run }: { run: RunState }) {
  return (
    <ol className="timeline" aria-label="Progression de l'analyse">
      {run.steps.map((s) => (
        <li key={s.key} className={`timeline-step ${s.status}`}>
          <StepIcon status={s.status} />
          <span className="step-label">{s.label}</span>
          <span className="step-detail">
            {s.status === "running" ? "en cours…" : s.detail ?? ""}
          </span>
          <span className="step-duration">{fmtDuration(s.durationMs)}</span>
        </li>
      ))}
    </ol>
  );
}
