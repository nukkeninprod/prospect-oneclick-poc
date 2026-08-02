import { useEffect, useRef, useState } from "react";
import { Compare } from "./Compare";
import { PROSPECTS } from "./data";
import { runAnalysis } from "./engine";
import { Fiche } from "./Fiche";
import { Timeline } from "./Timeline";
import type { Prospect, RunPhase, RunState } from "./types";

type Runs = Record<string, RunState>;

const STORAGE_KEY = "poc-runs-v1";
const TERMINAL: RunPhase[] = ["done", "ecarte", "error"];

/** Recharge les états terminés — l'état de la démo survit au rechargement. */
function loadRuns(): Runs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Runs;
    const out: Runs = {};
    for (const [id, rs] of Object.entries(parsed)) {
      if (rs && TERMINAL.includes(rs.phase)) out[id] = rs;
    }
    return out;
  } catch {
    return {};
  }
}

function saveRuns(runs: Runs) {
  const terminal: Runs = {};
  for (const [id, rs] of Object.entries(runs)) {
    if (TERMINAL.includes(rs.phase)) terminal[id] = rs;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(terminal));
  } catch {
    /* stockage indisponible : la démo marche quand même */
  }
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

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

  // La ligne s'ouvre aux TRANSITIONS de phase uniquement : pas à chaque tick
  // du moteur (sinon « Replier » serait annulé), pas au montage (sinon les
  // lignes restaurées du stockage local s'ouvriraient toutes au rechargement).
  const phase = run?.phase;
  const prevPhase = useRef(phase);
  useEffect(() => {
    if (phase !== prevPhase.current && phase && phase !== "idle") setOpen(true);
    prevPhase.current = phase;
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

const FILTERS: { key: "all" | RunPhase; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "idle", label: "À analyser" },
  { key: "running", label: "En cours" },
  { key: "done", label: "Fiches prêtes" },
  { key: "ecarte", label: "Écartés" },
  { key: "error", label: "Échecs" },
];

export default function App() {
  const [view, setView] = useState<"demo" | "compare">("demo");
  const [runs, setRuns] = useState<Runs>(loadRuns);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RunPhase>("all");
  const cancels = useRef<Record<string, () => void>>({});

  useEffect(() => {
    const c = cancels.current;
    return () => Object.values(c).forEach((fn) => fn());
  }, []);

  useEffect(() => {
    saveRuns(runs);
  }, [runs]);

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
    setQ("");
    setStatusFilter("all");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* rien à faire */
    }
  };

  const statusOf = (p: Prospect): RunPhase => runs[p.id]?.phase ?? "idle";

  const counts: Record<string, number> = { all: PROSPECTS.length };
  for (const f of FILTERS) if (f.key !== "all") counts[f.key] = 0;
  PROSPECTS.forEach((p) => {
    counts[statusOf(p)] += 1;
  });

  const nq = norm(q.trim());
  const visible = PROSPECTS.filter((p) => {
    if (statusFilter !== "all" && statusOf(p) !== statusFilter) return false;
    if (!nq) return true;
    return norm(`${p.name} ${p.city} ${p.province} ${p.sector}`).includes(nq);
  });

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
        {view === "demo" && (
          <button className="btn-secondary" onClick={reset}>Réinitialiser la démo</button>
        )}
      </header>

      <div className="tabs">
        <button
          className={`tab ${view === "demo" ? "active" : ""}`}
          aria-pressed={view === "demo"}
          onClick={() => setView("demo")}
        >
          La démo
        </button>
        <button
          className={`tab ${view === "compare" ? "active" : ""}`}
          aria-pressed={view === "compare"}
          onClick={() => setView("compare")}
        >
          Avant · après
        </button>
      </div>

      {view === "compare" ? (
        <Compare />
      ) : (
        <>
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

          <div className="toolbar">
            <input
              className="search"
              type="search"
              placeholder="Rechercher (nom, ville, secteur…)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Rechercher un prospect"
            />
            <div className="chips" role="group" aria-label="Filtrer par statut">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  className={`chip ${statusFilter === f.key ? "active" : ""}`}
                  aria-pressed={statusFilter === f.key}
                  onClick={() => setStatusFilter(f.key)}
                >
                  {f.label} · {counts[f.key]}
                </button>
              ))}
            </div>
          </div>

          <main className="list">
            {visible.length === 0 ? (
              <p className="empty-list">
                Aucun prospect ne correspond — modifier la recherche ou le filtre de statut.
              </p>
            ) : (
              visible.map((p) => (
                <ProspectRow key={p.id} p={p} run={runs[p.id]} onLaunch={launch} />
              ))
            )}
          </main>
        </>
      )}

      <footer className="footer">
        Démo statique — aucun appel réseau, aucune donnée réelle. Le vrai flow enchaîne :
        santé financière (Pappers, seuil &gt; 50) → analyse des tendances → fiche signalétique,
        contacts clés filtrés (CEO · Comptabilité · Payroll · RH), emails à la demande.
        L'état de la démo est mémorisé dans ce navigateur — « Réinitialiser la démo » pour
        repartir de zéro.
      </footer>
    </div>
  );
}
