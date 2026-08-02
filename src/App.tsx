import { useEffect, useRef, useState } from "react";
import { Chat, type ChatMsg } from "./Chat";
import { PROSPECTS } from "./data";
import { runAnalysis } from "./engine";
import { LiveFiche } from "./LiveFiche";
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
      // steps doit être un tableau, sinon Timeline crashe sur une valeur
      // corrompue/ancienne — et le poison persisterait à chaque rechargement.
      if (rs && TERMINAL.includes(rs.phase) && Array.isArray(rs.steps)) out[id] = rs;
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

function phaseBadge(run: RunState | undefined, p: Prospect, queued: boolean) {
  if (!run || run.phase === "idle") {
    return queued ? (
      <span className="badge badge-running">En file d'attente…</span>
    ) : (
      <span className="badge badge-neutral">À analyser</span>
    );
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
  queued,
  autoOpen,
  onLaunch,
}: {
  p: Prospect;
  run: RunState | undefined;
  queued: boolean;
  autoOpen: boolean;
  onLaunch: (p: Prospect) => void;
}) {
  const [open, setOpen] = useState(false);
  const finished = run && run.phase !== "idle" && run.phase !== "running";

  // La ligne s'ouvre aux TRANSITIONS de phase uniquement : pas à chaque tick
  // du moteur (sinon « Replier » serait annulé), pas au montage (sinon les
  // lignes restaurées du stockage local s'ouvriraient toutes au rechargement),
  // et jamais en mode lot (14 lignes ouvertes d'un coup = illisible).
  const phase = run?.phase;
  const prevPhase = useRef(phase);
  useEffect(() => {
    if (autoOpen && phase !== prevPhase.current && phase && phase !== "idle") setOpen(true);
    prevPhase.current = phase;
  }, [phase, autoOpen]);

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
        <div className="row-status">{phaseBadge(run, p, queued)}</div>
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
              disabled={run?.phase === "running" || queued}
            >
              {run?.phase === "running" ? "Analyse…" : queued ? "En file…" : "Lancer l'analyse"}
            </button>
          )}
        </div>
      </div>

      {open && launched && (
        <div className="row-detail">
          <LiveFiche p={p} run={run!} />
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

const BATCH_CONCURRENCY = 3;

const CHAT_SUGGESTIONS = ["Analyse Fonderie", "Tout analyser", "Montre les écartés"];

export default function App() {
  const [runs, setRuns] = useState<Runs>(loadRuns);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RunPhase>("all");
  const [queue, setQueue] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: 0, from: "bot", text: "Bonjour 👋 Je surveille les analyses. Lance une société, ou dis-moi « tout analyser »." },
  ]);
  const cancels = useRef<Record<string, () => void>>({});
  const manual = useRef<Set<string>>(new Set()); // lancés à la main → auto-ouverture
  const msgId = useRef(0);
  const batchActive = useRef(false);
  const batchIds = useRef<Set<string>>(new Set());
  // États déjà en mémoire au chargement : ne pas re-notifier dans le chat.
  const prevPhases = useRef<Record<string, RunPhase> | null>(null);
  if (prevPhases.current === null) {
    prevPhases.current = Object.fromEntries(
      Object.entries(runs).map(([id, r]) => [id, r.phase]),
    );
  }

  const pushMsg = (from: ChatMsg["from"], text: string) => {
    msgId.current += 1;
    const id = msgId.current;
    setMessages((m) => [...m, { id, from, text }]);
  };

  useEffect(() => {
    const c = cancels.current;
    return () => Object.values(c).forEach((fn) => fn());
  }, []);

  useEffect(() => {
    saveRuns(runs);
  }, [runs]);

  // Le copilote commente chaque analyse qui se termine.
  useEffect(() => {
    for (const p of PROSPECTS) {
      const ph = runs[p.id]?.phase ?? "idle";
      const prev = prevPhases.current![p.id] ?? "idle";
      if (ph === prev) continue;
      prevPhases.current![p.id] = ph;
      if (ph === "done") {
        pushMsg("bot", `✓ ${p.name} : fiche prête — potentiel ${p.potential ?? "à qualifier"} · ${p.signals.length} signaux.`);
      } else if (ph === "ecarte") {
        pushMsg("bot", `◦ ${p.name} écarté (santé ${p.healthScore}/100) — un appel économisé.`);
      } else if (ph === "error") {
        pushMsg("bot", `✕ ${p.name} : Pappers n'a pas répondu — « Réessayer » quand tu veux.`);
      }
    }
  }, [runs]);

  // Bilan de fin de lot.
  useEffect(() => {
    if (!batchActive.current || queue.length > 0) return;
    const running = PROSPECTS.some((p) => runs[p.id]?.phase === "running");
    if (running) return;
    batchActive.current = false;
    const lot = [...batchIds.current].map((id) => runs[id]).filter(Boolean);
    const done = lot.filter((r) => r.phase === "done").length;
    const ec = lot.filter((r) => r.phase === "ecarte").length;
    const er = lot.filter((r) => r.phase === "error").length;
    pushMsg("bot", `Lot terminé : ${done} fiches prêtes · ${ec} écartés · ${er} échec${er > 1 ? "s" : ""}. Les filtres en haut te donnent le tri.`);
  }, [queue, runs]);

  const startRun = (p: Prospect) => {
    cancels.current[p.id]?.();
    cancels.current[p.id] = runAnalysis(p, (rs) =>
      setRuns((prev) => ({ ...prev, [p.id]: rs })),
    );
  };

  // File d'attente du mode lot : max BATCH_CONCURRENCY analyses en parallèle,
  // la suivante part dès qu'une place se libère.
  useEffect(() => {
    if (queue.length === 0) return;
    const running = PROSPECTS.filter((p) => runs[p.id]?.phase === "running").length;
    const slots = BATCH_CONCURRENCY - running;
    if (slots <= 0) return;
    const toStart = queue.slice(0, slots);
    setQueue((prev) => prev.filter((id) => !toStart.includes(id)));
    for (const id of toStart) {
      const p = PROSPECTS.find((x) => x.id === id);
      if (p) startRun(p);
    }
  }, [queue, runs]);

  const launch = (p: Prospect) => {
    // Lancement manuel : la ligne s'auto-ouvrira, et on revient sur « Tous »
    // (sous un filtre de statut, la ligne changerait de statut et disparaîtrait).
    manual.current.add(p.id);
    setStatusFilter("all");
    setQueue((prev) => prev.filter((id) => id !== p.id));
    startRun(p);
  };

  const launchBatch = () => {
    const ids = PROSPECTS.filter(
      (p) => (runs[p.id]?.phase ?? "idle") === "idle" && !queue.includes(p.id),
    ).map((p) => p.id);
    if (ids.length === 0) return;
    for (const id of ids) manual.current.delete(id); // lot → pas d'auto-ouverture
    batchActive.current = true;
    batchIds.current = new Set(ids); // le bilan ne compte que le lot, pas les analyses antérieures
    setQueue((prev) => [...prev, ...ids]);
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
    setQueue([]);
    manual.current.clear();
    batchActive.current = false; // sinon le bilan « Lot terminé : 0 … » part après un reset en plein lot
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* rien à faire */
    }
  };

  // Commandes scriptées du copilote.
  const handleChat = (text: string) => {
    pushMsg("user", text);
    const t = norm(text);
    // \btous?\b : « tout analyser » oui, « toutes les fiches » non
    if (/\btous?\b/.test(t)) {
      if (PROSPECTS.some((p) => (runs[p.id]?.phase ?? "idle") === "idle")) {
        launchBatch();
        pushMsg("bot", `C'est parti — j'analyse tout le lot, ${BATCH_CONCURRENCY} en parallèle. Regarde les filtres se remplir.`);
      } else {
        pushMsg("bot", "Tout est déjà analysé — « Réinitialiser la démo » pour rejouer.");
      }
      return;
    }
    const tWords = t.split(/\s+/);
    const target = PROSPECTS.find((p) =>
      norm(p.name)
        .split(" ")
        .some((w) => w.length > 3 && tWords.includes(w)),
    );
    if (target) {
      launch(target);
      pushMsg("bot", `J'analyse ${target.name} — santé, signaux, contacts, fiche.`);
      return;
    }
    if (t.includes("ecart")) {
      setStatusFilter("ecarte");
      pushMsg("bot", "Voici les écartés par la règle métier (score ≤ 50) — résultat, pas erreur.");
      return;
    }
    if (t.includes("echec")) {
      setStatusFilter("error");
      pushMsg("bot", "Voici les échecs techniques — rien n'a été écrit, « Réessayer » relance.");
      return;
    }
    if (t.includes("fiche") || t.includes("pret")) {
      setStatusFilter("done");
      pushMsg("bot", "Voici les fiches prêtes.");
      return;
    }
    if (t.includes("reinitialis") || t.includes("reset")) {
      reset();
      pushMsg("bot", "Démo réinitialisée — tout est reparti de zéro.");
      return;
    }
    pushMsg(
      "bot",
      "Dans ce POC je suis scripté : essaie « tout analyser », un nom de société (« analyse Fonderie »), « montre les écartés / échecs / fiches prêtes » ou « réinitialise ».",
    );
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
    <div className="shell">
      <Chat messages={messages} suggestions={CHAT_SUGGESTIONS} onSend={handleChat} />
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
            <div className="batch-controls">
              {queue.length > 0 && (
                <span className="badge badge-running">File : {queue.length}</span>
              )}
              <button
                className="btn-primary"
                onClick={launchBatch}
                disabled={counts.idle === 0 || queue.length > 0}
              >
                {queue.length > 0 ? "Analyse du lot…" : `Tout analyser · ${counts.idle}`}
              </button>
            </div>
          </div>

          <main className="list">
            {visible.length === 0 ? (
              <p className="empty-list">
                Aucun prospect ne correspond — modifier la recherche ou le filtre de statut.
              </p>
            ) : (
              visible.map((p) => (
                <ProspectRow
                  key={p.id}
                  p={p}
                  run={runs[p.id]}
                  queued={queue.includes(p.id)}
                  autoOpen={manual.current.has(p.id)}
                  onLaunch={launch}
                />
              ))
            )}
          </main>
        </>

      <footer className="footer">
        Démo statique — aucun appel réseau, aucune donnée réelle. Le vrai flow enchaîne :
        santé financière (Pappers, seuil &gt; 50) → analyse des tendances → fiche signalétique,
        contacts clés filtrés (CEO · Comptabilité · Payroll · RH), emails à la demande.
        L'état de la démo est mémorisé dans ce navigateur — « Réinitialiser la démo » pour
        repartir de zéro.
      </footer>
      </div>
    </div>
  );
}
