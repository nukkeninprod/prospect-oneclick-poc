import { useEffect, useRef, useState } from "react";
import { ackFor, EMPTY_CRITERIA, parse, rank, reasonFor } from "./brain";
import type { Criteria, Ranked, RankResult } from "./brain";
import { Chat, type ChatMsg } from "./Chat";
import { runAnalysis } from "./engine";
import { LiveFiche } from "./LiveFiche";
import { getStoredKey, llmParse, setStoredKey } from "./llm";
import { MARKET, TOTAL_SIGNALS } from "./market";
import type { Prospect, RunPhase, RunState } from "./types";

type Runs = Record<string, RunState>;

const STORAGE_KEY = "poc-runs-v2";
const TERMINAL: RunPhase[] = ["done", "ecarte", "error"];
const SWEEP_CONCURRENCY = 3;

const DREAM_PHRASE =
  "Il me manque du volume en Hainaut, plutôt des boîtes de production sous 50 personnes, où il vient de se passer quelque chose";
const CHAT_SUGGESTIONS = [DREAM_PHRASE, "Enlève l'intérim", "Seulement celles où le dirigeant a changé"];

/** Recharge les états terminés — la mémoire de la machine survit au rechargement. */
function loadRuns(): Runs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Runs;
    const out: Runs = {};
    for (const [id, rs] of Object.entries(parsed)) {
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

function phaseBadge(run: RunState | undefined, p: Prospect, queued: boolean) {
  if (!run || run.phase === "idle") {
    // Pas de badge tant que rien ne tourne — l'écran reste silencieux.
    return queued ? <span className="badge badge-running">En file…</span> : null;
  }
  switch (run.phase) {
    case "running":
      return <span className="badge badge-running">Analyse en cours…</span>;
    case "done":
      return <span className="badge badge-good">✓ Fiche prête</span>;
    case "ecarte":
      return <span className="badge badge-risk">! Écarté · santé {p.healthScore}/100</span>;
    case "error":
      return <span className="badge badge-error">✕ Échec technique</span>;
  }
}

function ResultRow({
  r,
  index,
  run,
  queued,
  onDismiss,
  onRetry,
}: {
  r: Ranked;
  index: number;
  run: RunState | undefined;
  queued: boolean;
  onDismiss: (id: string) => void;
  onRetry: (p: Prospect) => void;
}) {
  const [open, setOpen] = useState(false);
  const p = r.p;
  const launched = run && run.phase !== "idle";
  const reason = reasonFor(r);

  return (
    <div
      className={`row result-enter ${open && launched ? "row-open" : ""}`}
      style={{ animationDelay: `${Math.min(index, 12) * 70}ms` }}
    >
      <div className="row-main">
        <span className="rank" aria-label={`Position ${index + 1}`}>{index + 1}</span>
        <div className="row-id">
          <div className="row-name">{p.name}</div>
          <div className="row-meta">
            {p.enterpriseNumber} · {p.city} ({p.province}) · {p.sector} · {p.workerBand} trav.
          </div>
        </div>
        <div className="row-status">{phaseBadge(run, p, queued)}</div>
        <div className="row-actions">
          {launched && (
            <button className="btn-ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? "Replier" : "Détail"}
            </button>
          )}
          {run?.phase === "error" && (
            <button className="btn-primary" onClick={() => onRetry(p)}>Réessayer</button>
          )}
          <button
            className="btn-ghost dismiss"
            title="Écarter ce dossier"
            aria-label={`Écarter ${p.name}`}
            onClick={() => onDismiss(p.id)}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="reason">
        <div className="reason-line">{reason.line}</div>
        <div className="reason-meta">
          {reason.meta} · pertinence {r.score}
        </div>
        <div className="reason-why">{reason.why}</div>
      </div>

      {open && launched && (
        <div className="row-detail">
          <LiveFiche p={p} run={run!} />
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [runs, setRuns] = useState<Runs>(loadRuns);
  const [queue, setQueue] = useState<string[]>([]);
  const [criteria, setCriteria] = useState<Criteria>({ ...EMPTY_CRITERIA });
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // Les sociétés sont visibles d'entrée : top du marché, trié par pertinence.
  const [result, setResult] = useState<RankResult>(() => rank({ ...EMPTY_CRITERIA }, new Set()));
  const [refined, setRefined] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: 0,
      from: "bot",
      text: `${MARKET.length} sociétés sous veille, ${TOTAL_SIGNALS} signaux. Dis-moi ce qu'il te faut.`,
    },
  ]);
  const [llmKey, setLlmKey] = useState<string | null>(getStoredKey);
  const [busy, setBusy] = useState(false);

  const cancels = useRef<Record<string, () => void>>({});
  const msgId = useRef(0);
  const sweepActive = useRef(false);
  const sweepIds = useRef<Set<string>>(new Set());
  // États déjà en mémoire au chargement : ne pas re-notifier dans le chat.
  const prevPhases = useRef<Record<string, RunPhase> | null>(null);
  if (prevPhases.current === null) {
    prevPhases.current = Object.fromEntries(Object.entries(runs).map(([id, r]) => [id, r.phase]));
  }

  useEffect(() => {
    const c = cancels.current;
    return () => Object.values(c).forEach((fn) => fn());
  }, []);

  useEffect(() => {
    saveRuns(runs);
  }, [runs]);

  const pushMsg = (from: ChatMsg["from"], text: string) => {
    msgId.current += 1;
    const id = msgId.current;
    setMessages((m) => [...m, { id, from, text }]);
  };

  const startRun = (p: Prospect) => {
    cancels.current[p.id]?.();
    cancels.current[p.id] = runAnalysis(p, (rs) =>
      setRuns((prev) => ({ ...prev, [p.id]: rs })),
    );
  };

  // File de la « traite » : SWEEP_CONCURRENCY analyses en parallèle.
  useEffect(() => {
    if (queue.length === 0) return;
    const running = Object.values(runs).filter((r) => r.phase === "running").length;
    const slots = SWEEP_CONCURRENCY - running;
    if (slots <= 0) return;
    const toStart = queue.slice(0, slots);
    setQueue((prev) => prev.filter((id) => !toStart.includes(id)));
    for (const id of toStart) {
      const p = MARKET.find((x) => x.id === id);
      if (p) startRun(p);
    }
  }, [queue, runs]);

  // Le copilote signale les écartés et les échecs en direct.
  useEffect(() => {
    for (const [id, rs] of Object.entries(runs)) {
      const prev = prevPhases.current![id] ?? "idle";
      if (rs.phase === prev) continue;
      prevPhases.current![id] = rs.phase;
      const p = MARKET.find((x) => x.id === id);
      if (!p) continue;
      if (rs.phase === "ecarte") {
        pushMsg("bot", `◦ ${p.name} écarté en cours d'analyse (santé ${p.healthScore}/100) — un appel économisé.`);
      } else if (rs.phase === "error") {
        pushMsg("bot", `✕ ${p.name} : la source santé n'a pas répondu — « Réessayer » sur la ligne.`);
      }
    }
  }, [runs]);

  // Bilan de fin de traite.
  useEffect(() => {
    if (!sweepActive.current || queue.length > 0) return;
    if (Object.values(runs).some((r) => r.phase === "running")) return;
    sweepActive.current = false;
    const lot = [...sweepIds.current].map((id) => runs[id]).filter(Boolean);
    const done = lot.filter((r) => r.phase === "done").length;
    const ec = lot.filter((r) => r.phase === "ecarte").length;
    const er = lot.filter((r) => r.phase === "error").length;
    pushMsg(
      "bot",
      `Analyses terminées d'une traite : ${done} fiche${done > 1 ? "s" : ""} prête${done > 1 ? "s" : ""}${ec > 0 ? ` · ${ec} écarté${ec > 1 ? "s" : ""}` : ""}${er > 0 ? ` · ${er} échec${er > 1 ? "s" : ""}` : ""}. Ouvre un dossier — ou affine encore.`,
    );
  }, [queue, runs]);

  /** (Re)compose la liste et lance les analyses du haut du classement d'une traite. */
  const compose = (c: Criteria, dis: Set<string>) => {
    const res = rank(c, dis);
    setResult(res);
    const idle = res.top
      .slice(0, c.topN)
      .filter((r) => (runs[r.p.id]?.phase ?? "idle") === "idle")
      .map((r) => r.p.id);
    if (idle.length > 0) {
      sweepActive.current = true;
      for (const id of idle) sweepIds.current.add(id);
    }
    setQueue(idle);
    return res;
  };

  /** Repli scripté (pas de clé, ou Claude injoignable). */
  const scriptedHandle = (text: string) => {
    const { criteria: c2, understood, isReset, matchedAnything } = parse(text, criteria);

    if (isReset) {
      setCriteria({ ...EMPTY_CRITERIA });
      setDismissed(new Set());
      setResult(rank({ ...EMPTY_CRITERIA }, new Set()));
      setRefined(false);
      pushMsg("bot", "Vue d'ensemble rétablie — exprime un besoin quand tu veux.");
      return;
    }
    if (!matchedAnything) {
      pushMsg(
        "bot",
        "Je n'ai pas saisi de critère. Province, secteur, taille (« sous 50 »), actualité (« où il se passe quelque chose », « le dirigeant a changé ») — ou « recommence ».",
      );
      return;
    }
    setCriteria(c2);
    setRefined(true);
    const res = compose(c2, dismissed);
    pushMsg("bot", ackFor(understood, res, c2));
  };

  const handleChat = async (text: string) => {
    pushMsg("user", text);

    if (!llmKey) {
      scriptedHandle(text);
      return;
    }

    // Vraie LLM : Claude traduit le besoin en critères (tool use strict),
    // le classement reste local et déterministe.
    setBusy(true);
    try {
      const history = [...messages, { id: -1, from: "user" as const, text }];
      const { criteria: c2, reply, reset: isReset } = await llmParse(llmKey, history, criteria);
      if (isReset) {
        setCriteria({ ...EMPTY_CRITERIA });
        setDismissed(new Set());
        setResult(rank({ ...EMPTY_CRITERIA }, new Set()));
        setRefined(false);
        pushMsg("bot", reply);
      } else {
        setCriteria(c2);
        setRefined(true);
        const res = compose(c2, dismissed);
        const sweep = Math.min(c2.topN, res.matchCount);
        pushMsg(
          "bot",
          res.matchCount === 0
            ? `${reply} Aucune société ne correspond — élargis un critère et je recompose.`
            : `${reply} ${res.matchCount} ${res.matchCount > 1 ? "sociétés correspondent" : "société correspond"} sur ${MARKET.length} — ${res.excludedCount} écartées d'office. J'analyse le top ${sweep} d'une traite.`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushMsg("bot", `⚠️ Claude injoignable (${msg.slice(0, 80)}) — je bascule en mode scripté.`);
      scriptedHandle(text);
    } finally {
      setBusy(false);
    }
  };

  const dismissOne = (id: string) => {
    cancels.current[id]?.();
    const dis = new Set(dismissed);
    dis.add(id);
    setDismissed(dis);
    compose(criteria, dis);
  };

  const retryOne = (p: Prospect) => {
    sweepActive.current = true;
    sweepIds.current.add(p.id);
    startRun(p);
  };

  const reset = () => {
    for (const id of Object.keys(cancels.current)) {
      cancels.current[id]();
      delete cancels.current[id];
    }
    setRuns({});
    setQueue([]);
    setCriteria({ ...EMPTY_CRITERIA });
    setDismissed(new Set());
    setResult(rank({ ...EMPTY_CRITERIA }, new Set()));
    setRefined(false);
    sweepActive.current = false;
    sweepIds.current.clear();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* rien à faire */
    }
    pushMsg("bot", "Démo réinitialisée — exprime un nouveau besoin quand tu veux.");
  };

  return (
    <div className="shell">
      <Chat
        messages={messages}
        suggestions={CHAT_SUGGESTIONS}
        busy={busy}
        llmActive={!!llmKey}
        onSend={handleChat}
        onSetKey={(k) => {
          setStoredKey(k);
          setLlmKey(k);
          pushMsg("bot", k
            ? "Claude est branché — ta clé reste dans ce navigateur, jamais dans le code. Parle-moi librement."
            : "Clé retirée — je repasse en mode scripté.");
        }}
      />
      <div className="page">
        <header className="header">
          <div>
            <h1>Prospection</h1>
            <p className="subtitle">
              {MARKET.length} sociétés sous veille · {TOTAL_SIGNALS} signaux · dernière passe 06:12
            </p>
          </div>
          <button className="btn-secondary" onClick={reset}>Réinitialiser</button>
        </header>

        <div className="result-head">
          <span>
            {refined ? (
              <>
                <strong>{result.matchCount}</strong> correspondent ·{" "}
                <strong>{result.excludedCount}</strong> écartées d'office
              </>
            ) : (
              <>
                <strong>{result.matchCount}</strong> sociétés · triées par pertinence du moment
              </>
            )}
          </span>
          {refined && (
            <button className="chip" onClick={() => handleChat("recommence")}>
              Nouveau besoin
            </button>
          )}
        </div>
        <main className="list">
          {result.top.length === 0 ? (
            <p className="empty-list">
              Aucune société ne correspond — élargis un critère dans le chat.
            </p>
          ) : (
            result.top.map((r, i) => (
              <ResultRow
                key={r.p.id}
                r={r}
                index={i}
                run={runs[r.p.id]}
                queued={queue.includes(r.p.id)}
                onDismiss={dismissOne}
                onRetry={retryOne}
              />
            ))
          )}
        </main>

        <footer className="footer">Démo · données 100 % fictives.</footer>
      </div>
    </div>
  );
}
