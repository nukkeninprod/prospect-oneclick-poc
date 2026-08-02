import type { StepState } from "./types";

export function fmtDuration(ms?: number): string {
  if (!ms) return "";
  return ms >= 1000 ? `${Math.round(ms / 1000)} s` : `${ms} ms`;
}

export function StepIcon({ status }: { status: StepState["status"] }) {
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
