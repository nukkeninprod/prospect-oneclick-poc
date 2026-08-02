import { useEffect, useRef, useState } from "react";
import { PROSPECTS } from "./data";
import { runAnalysis } from "./engine";
import { Timeline } from "./Timeline";
import type { RunState } from "./types";

/**
 * « Avant · après » : rejoue côte à côte, sur la même société, le parcours
 * actuel observé dans l'app (3 écrans, 2 menus, 3 saisies du même nom) et
 * le flow en un clic. Même temps machine des deux côtés — c'est le point.
 * Échelle : 1 s de démo = 10 s réels.
 */

const SUBJECT = PROSPECTS.find((p) => p.id === "p05")!; // InfraGreen — score 77
const SCALE = 10;

interface BeforeEvent {
  at: number;
  icon: string;
  text: string;
  note?: string;
  tone?: "warn" | "good" | "nav";
}

const BEFORE: BeforeEvent[] = [
  { at: 400, icon: "⌨", text: "Écran « Santé » — recherche : « InfraGreen Wallonie »", note: "saisie du nom n°1" },
  { at: 1200, icon: "🖱", text: "Clic « Revérifier »" },
  { at: 1800, icon: "✓", text: "Toast : « Santé financière vérifiée via Pappers »", tone: "good" },
  { at: 2600, icon: "…", text: "Puis plus rien.", note: "Aucune suite proposée — il faut savoir, de tête, où aller.", tone: "warn" },
  { at: 3600, icon: "🧭", text: "Changement de menu n°1 → Analyse → Analyse des prospects", tone: "nav" },
  { at: 4400, icon: "⌨", text: "Recherche : « InfraGreen Wallonie »", note: "saisie du nom n°2 — le même" },
  { at: 5000, icon: "🖱", text: "Clic « Analyser » → le bouton devient gris et tourne" },
  { at: 11000, icon: "▸", text: "La ligne se met à jour : 3 signaux · 3 sources · potentiel élevé", tone: "good" },
  { at: 12000, icon: "🧭", text: "Changement de menu n°2 → Fiche signalétique → défiler les onglets → « Prospects »", tone: "nav" },
  { at: 12800, icon: "⌨", text: "Recherche : « InfraGreen Wallonie »", note: "saisie du nom n°3" },
  { at: 14800, icon: "▸", text: "La fiche s'affiche enfin.", tone: "good" },
];
const FREEZE = { from: 5000, to: 11000 };
const BLANK = { from: 12800, to: 14800 };
const BEFORE_END = 15400;
const AFTER_END = 6850; // durée du chemin heureux dans engine.ts

function fmtReal(ms: number): string {
  const s = Math.round((ms * SCALE) / 1000);
  return s < 60 ? `≈ ${s} s` : `≈ ${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

export function Compare() {
  const [started, setStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [run, setRun] = useState<RunState | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval>>();
  const cancel = useRef<() => void>();

  useEffect(
    () => () => {
      clearInterval(ticker.current);
      cancel.current?.();
    },
    [],
  );

  const start = () => {
    clearInterval(ticker.current);
    cancel.current?.();
    setElapsed(0);
    setRun(null);
    setStarted(true);
    const t0 = Date.now();
    ticker.current = setInterval(() => {
      const e = Date.now() - t0;
      setElapsed(e);
      if (e >= BEFORE_END) clearInterval(ticker.current);
    }, 100);
    cancel.current = runAnalysis(SUBJECT, setRun);
  };

  const leftDone = started && elapsed >= BEFORE_END;
  const rightDone = run?.phase === "done";
  const freezeMs = Math.max(0, Math.min(elapsed, FREEZE.to) - FREEZE.from);
  const blankMs = Math.max(0, Math.min(elapsed, BLANK.to) - BLANK.from);

  const items: { at: number; node: React.ReactNode }[] = [
    ...BEFORE.map((e, i) => ({
      at: e.at,
      node: (
        <li key={i} className={`before-event ${e.tone ?? ""}`}>
          <span className="before-icon" aria-hidden="true">{e.icon}</span>
          <span className="before-text">
            {e.text}
            {e.note && <span className="before-note">{e.note}</span>}
          </span>
        </li>
      ),
    })),
    {
      at: FREEZE.from + 1,
      node: (
        <li key="freeze" className="mock-wait">
          <span className="mock-btn">
            {elapsed < FREEZE.to && <span className="mock-spinner" aria-hidden="true" />}
            Analyser
          </span>
          <span className="wait-count">{fmtReal(freezeMs)} sans un mot, sans une étape</span>
          {freezeMs >= 2000 && (
            <span className="wait-warn">
              Au bout de 20 s, un utilisateur normal pense que c'est planté — et reclique.
            </span>
          )}
        </li>
      ),
    },
    {
      at: BLANK.from + 1,
      node: (
        <li key="blank" className="mock-wait">
          <span className="wait-count">Écran vide… {fmtReal(blankMs)} avant que la fiche n'apparaisse</span>
        </li>
      ),
    },
  ].sort((a, b) => a.at - b.at);

  return (
    <div>
      <div className="insight">
        <p>
          On ne gagne pas du temps machine — Pappers et l'IA prennent le même temps des deux
          côtés. On gagne le temps humain de plomberie, la confiance pendant l'attente, et un
          statut lisible à la fin.
        </p>
        <button className="btn-primary" onClick={start}>
          {started ? "Rejouer la comparaison" : "Lancer la comparaison"}
        </button>
      </div>

      <div className="compare-grid">
        {/* ——— Aujourd'hui ——— */}
        <section className="panel" aria-label="Parcours actuel">
          <div className="panel-head">
            <span className="panel-title">Aujourd'hui — trois guichets</span>
            <span className="panel-chrono">
              {started ? fmtReal(Math.min(elapsed, BEFORE_END)) : "—"}
            </span>
          </div>
          {!started ? (
            <p className="empty-note">
              Le parcours actuel sera rejoué ici, geste par geste, tel qu'observé dans l'app.
            </p>
          ) : (
            <>
              <ul className="before-list">
                {items.filter((x) => x.at <= elapsed).map((x) => x.node)}
              </ul>
              {leftDone && (
                <p className="panel-verdict">
                  Bilan : 3 écrans, 2 changements de menu, 3 fois le même nom tapé. Le statut
                  final du prospect n'est affiché nulle part.
                </p>
              )}
            </>
          )}
        </section>

        {/* ——— Le flow en un clic ——— */}
        <section className="panel" aria-label="Flow en un clic">
          <div className="panel-head">
            <span className="panel-title">Le flow en un clic</span>
            {rightDone ? (
              <span className="badge badge-good">✓ Fiche prête · {fmtReal(AFTER_END)}</span>
            ) : (
              <span className="panel-chrono">
                {started ? fmtReal(Math.min(elapsed, AFTER_END)) : "—"}
              </span>
            )}
          </div>
          {!started ? (
            <p className="empty-note">
              Un clic sur « Lancer la comparaison » — et c'est le seul de tout ce panneau.
            </p>
          ) : (
            <>
              <div className="row-meta" style={{ marginBottom: 8 }}>
                {SUBJECT.name} · {SUBJECT.enterpriseNumber} · {SUBJECT.city}
              </div>
              {run && <Timeline run={run} />}
              {rightDone && (
                <>
                  <div className="why-call" style={{ marginTop: 12 }}>
                    <div className="why-call-label">Pourquoi appeler maintenant</div>
                    <p>{SUBJECT.whyCallNow}</p>
                  </div>
                  {!leftDone && (
                    <p className="panel-done-note">
                      ✓ Terminé — le parcours d'en face est encore en train de naviguer.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>

      {leftDone && rightDone && (
        <div className="scoreboard">
          <table>
            <thead>
              <tr>
                <th scope="col"></th>
                <th scope="col">Aujourd'hui</th>
                <th scope="col">Flow en un clic</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Écrans traversés</td><td>3</td><td className="score-after">1</td></tr>
              <tr><td>Changements de menu</td><td>2</td><td className="score-after">0</td></tr>
              <tr><td>Saisies du même nom</td><td>3</td><td className="score-after">0</td></tr>
              <tr><td>Pendant l'attente</td><td>un bouton gris figé</td><td className="score-after">chaque étape, en direct</td></tr>
              <tr><td>« Écarté » vs « planté »</td><td>indiscernables</td><td className="score-after">deux états distincts</td></tr>
              <tr><td>Statut final</td><td>à reconstituer de tête</td><td className="score-after">✓ Fiche prête, sur la ligne</td></tr>
              <tr><td>Temps total vécu</td><td>{fmtReal(BEFORE_END)}</td><td className="score-after">{fmtReal(AFTER_END)}</td></tr>
            </tbody>
          </table>
          <p className="empty-note" style={{ padding: "8px 0 12px" }}>
            Le temps machine (Pappers + analyse IA) est identique des deux côtés — ce que le
            flow supprime, c'est tout le reste.
          </p>
        </div>
      )}
    </div>
  );
}
