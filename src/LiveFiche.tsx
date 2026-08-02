import { useEffect, useRef, useState } from "react";
import {
  ContactsBlock,
  Etablissements,
  Financiere,
  HealthRow,
  HealthUnknownRow,
  SignalList,
  WhyCall,
} from "./Fiche";
import { fmtDuration, StepIcon } from "./Timeline";
import type { Prospect, RunState, StepState } from "./types";

/**
 * La fiche « vivante » : chaque étape de l'analyse est une section qui
 * apparaît dès que son résultat tombe — la santé financière pop avec son
 * graphe pendant que les signaux chargent encore en dessous. Chaque section
 * terminée est dépliable/repliable (accordéon animé).
 */

const OPENABLE_STATUS = new Set<StepState["status"]>(["done", "warning", "stopped", "error"]);

function bodyFor(s: StepState, p: Prospect): React.ReactNode | null {
  switch (s.key) {
    case "sante":
      if (s.status === "error") {
        return (
          <p className="verdict verdict-error">
            Échec technique réel (l'API santé n'a pas répondu). Rien n'a été écrit — relancer
            quand la source répond.
          </p>
        );
      }
      if (s.status === "warning") return <HealthUnknownRow />;
      if (s.status === "done" && p.healthScore !== null) {
        return (
          <>
            <HealthRow score={p.healthScore} band={p.healthBand} />
            {p.financials && (
              <>
                <Financiere f={p.financials} />
                <Etablissements f={p.financials} />
              </>
            )}
          </>
        );
      }
      return null;

    case "gate":
      if (s.status === "stopped") {
        return (
          <p className="verdict verdict-ecarte">
            Résultat, pas erreur : la règle métier (score &gt; 50) a écarté ce prospect — un
            appel économisé. La fiche n'est pas générée.
          </p>
        );
      }
      return null;

    case "signaux":
      if (s.status === "done") {
        return (
          <>
            {p.whyCallNow && <WhyCall text={p.whyCallNow} />}
            <SignalList signals={p.signals} />
          </>
        );
      }
      return null;

    case "contacts":
      if (s.status === "done" || s.status === "warning") {
        return <ContactsBlock contacts={p.contacts} otherCount={p.otherContactsCount} />;
      }
      return null;

    default:
      return null;
  }
}

export function LiveFiche({ p, run }: { p: Prospect; run: RunState }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const prevStatus = useRef<Record<string, string>>({});

  // Auto-déplier une section à l'instant où son étape se termine.
  useEffect(() => {
    const opened: Record<string, boolean> = {};
    let changed = false;
    for (const s of run.steps) {
      if (prevStatus.current[s.key] !== s.status) {
        prevStatus.current[s.key] = s.status;
        if (OPENABLE_STATUS.has(s.status) && bodyFor(s, p) !== null) {
          opened[s.key] = true;
          changed = true;
        }
      }
    }
    if (changed) setOpen((o) => ({ ...o, ...opened }));
  }, [run, p]);

  return (
    <div className="sections">
      {run.steps.map((s) => {
        const body = bodyFor(s, p);
        const openable = body !== null;
        const isOpen = openable && (open[s.key] ?? false);
        return (
          <div key={s.key} className={`sec ${s.status}`}>
            <button
              type="button"
              className="sec-head"
              disabled={!openable}
              aria-expanded={openable ? isOpen : undefined}
              onClick={() => setOpen((o) => ({ ...o, [s.key]: !isOpen }))}
            >
              <StepIcon status={s.status} />
              <span className="step-label">{s.label}</span>
              <span className="step-detail">
                {s.status === "running" ? "en cours…" : s.detail ?? ""}
              </span>
              <span className="step-duration">{fmtDuration(s.durationMs)}</span>
              <span className={`chev ${isOpen ? "open" : ""} ${openable ? "" : "hidden"}`} aria-hidden="true">
                ▾
              </span>
            </button>
            <div className={`sec-wrap ${isOpen ? "open" : ""}`}>
              <div className="sec-inner">
                {openable && <div className="sec-pad">{body}</div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
