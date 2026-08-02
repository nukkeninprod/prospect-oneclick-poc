import { useEffect, useRef, useState } from "react";
import { PROSPECTS } from "./data";
import { runAnalysis } from "./engine";
import { Fiche } from "./Fiche";
import { Timeline } from "./Timeline";
import type { Prospect, RunState } from "./types";

type Runs = Record<string, RunState>;

function phaseBadge(run: RunState | undefined, p: Prospect) {
  if (!run || run.phase === "idle") {
    return <span className="badge badge-neutral">À analyser</span>;
  }
  switch (run.phase) {
    case "running":
      return <span className="badge badge-running">Analyse en cours…</span>;
    case "done":
      return (
        <span className="badge badge-good">
          ✓ Fiche prête{run.finishedAtLabel ? ` · ${run.finishedAtLabel}` : ""}
        </span>
      );
    case "ecarte":
      return <span className="badge badge-risk">! Écarté · santé {p.healthScore}/100</span>;
    case "error":
      return <span className="badge badge-error">✕ Échec technique</span>;
  }
}

function ProspectRow({
  p,
  run,
  onLaunch,
}: {
  p: Prospect;
  run: RunState | undefined;
  onLaunch: (p: Prospect) => void;
}) {
  const [open, setOpen] = useState(false);
  const finished = run && run.phase !== "idle" && run.phase !== "running";

  // La ligne s'ouvre aux transitions de phase (pas à chaque tick du moteur,
  // sinon « Replier » serait annulé par le tick suivant pendant l'analyse).
  const phase = run?.phase;
  useEffect(() => {
    if (phase && phase !== "idle") setOpen(true);
  }, [phase]);

  const launched = run && run.phase !== "idle";

  return (
    <div className={`row ${open && launched ? "row-open" : ""}`}>
      <div className="row-main">
        <div className="row-id">
          <div className="row-name">{p.name}</div>
          <div className="row-meta">
            {p.enterpriseNumber} · {p.city} ({p.province}) · {p.sector} · {p.workerBand} trav.
          </div>
        </div>
        <div className="row-status">{phaseBadge(run, p)}</div>
        <div className="row-actions">
          {launched && (
            <button
              className="btn-ghost"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              {open ? "Replier" : "Détail"}
            </button>
          )}
          {run?.phase === "error" ? (
            <button className="btn-primary" onClick={() => onLaunch(p)}>Réessayer</button>
          ) : finished ? (
            <button className="btn-secondary" onClick={() => onLaunch(p)}>Réanalyser</button>
          ) : (
            <button
              className="btn-primary"
              onClick={() => onLaunch(p)}
              disabled={run?.phase === "running"}
            >
              {run?.phase === "running" ? "Analyse…" : "Lancer l'analyse"}
            </button>
          )}
        </div>
      </div>

      {open && launched && (
        <div className="row-detail">
          <Timeline run={run!} />
          {run!.phase === "done" && (
            <Fiche prospect={p} healthUnknown={p.scenario === "no_pappers"} />
          )}
          {run!.phase === "ecarte" && (
            <p className="verdict verdict-ecarte">
              Résultat, pas erreur : la règle métier (score &gt; 50) a écarté ce prospect —
              un appel économisé. La fiche n'est pas générée.
            </p>
          )}
          {run!.phase === "error" && (
            <p className="verdict verdict-error">
              Échec technique réel (l'API santé n'a pas répondu). Rien n'a été écrit —
              relancer quand la source répond.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [runs, setRuns] = useState<Runs>({});
  const cancels = useRef<Record<string, () => void>>({});

  useEffect(() => {
    const c = cancels.current;
    return () => Object.values(c).forEach((fn) => fn());
  }, []);

  const launch = (p: Prospect) => {
    cancels.current[p.id]?.();
    cancels.current[p.id] = runAnalysis(p, (rs) =>
      setRuns((prev) => ({ ...prev, [p.id]: rs })),
    );
  };

  const reset = () => {
    // Vider EN PLACE : le cleanup d'unmount a capturé cette référence.
    for (const id of Object.keys(cancels.current)) {
      cancels.current[id]();
      delete cancels.current[id];
    }
    setRuns({});
  };

  const states = Object.values(runs);
  const analysed = states.filter((r) => r.phase === "done").length;
  const ecartes = states.filter((r) => r.phase === "ecarte").length;
  const echecs = states.filter((r) => r.phase === "error").length;

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>Prospection — flow en un clic</h1>
          <p className="subtitle">
            POC · données 100 % fictives · échantillon de {PROSPECTS.length} prospects ·
            timings réels ÷ 10
          </p>
        </div>
        <button className="btn-secondary" onClick={reset}>Réinitialiser la démo</button>
      </header>

      <section className="kpis" aria-label="Compteurs">
        <div className="kpi">
          <div className="kpi-value">{PROSPECTS.length}</div>
          <div className="kpi-label">Prospects</div>
        </div>
        <div className="kpi">
          <div className="kpi-value">{analysed}</div>
          <div className="kpi-label">Fiches prêtes</div>
        </div>
        <div className="kpi">
          <div className="kpi-value">{ecartes}</div>
          <div className="kpi-label">Écartés (règle métier)</div>
        </div>
        <div className="kpi">
          <div className="kpi-value">{echecs}</div>
          <div className="kpi-label">Échecs techniques</div>
        </div>
      </section>

      <main className="list">
        {PROSPECTS.map((p) => (
          <ProspectRow key={p.id} p={p} run={runs[p.id]} onLaunch={launch} />
        ))}
      </main>

      <footer className="footer">
        Démo statique — aucun appel réseau, aucune donnée réelle. Le vrai flow enchaîne :
        santé financière (Pappers, seuil &gt; 50) → analyse des tendances → fiche signalétique,
        contacts clés filtrés (CEO · Comptabilité · Payroll · RH), emails à la demande.
      </footer>
    </div>
  );
}
