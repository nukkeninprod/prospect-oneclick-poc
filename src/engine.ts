import type { Prospect, RunState, StepState } from "./types";

/**
 * Moteur de démo : rejoue le flow "un clic" avec des timings réalistes
 * (échelle réduite ~×10 : le vrai flow prend ~90 s, la démo ~9 s).
 * Chaque scénario est déterministe — relancer un prospect redonne le même film.
 */

const STEP_LABELS = {
  sante: "Santé financière",
  gate: "Feu vert",
  signaux: "Signaux détectés",
  contacts: "Contacts clés",
  fiche: "Fiche prête",
} as const;

type StepKey = keyof typeof STEP_LABELS;

function baseSteps(): StepState[] {
  return (Object.keys(STEP_LABELS) as StepKey[]).map((key) => ({
    key,
    label: STEP_LABELS[key],
    status: "pending",
  }));
}

interface TimedEvent {
  afterMs: number;
  apply: (steps: StepState[]) => { phase?: RunState["phase"] };
}

function set(steps: StepState[], key: StepKey, patch: Partial<StepState>) {
  const s = steps.find((x) => x.key === key)!;
  Object.assign(s, patch);
}

/** Construit le scénario (liste d'événements datés) pour un prospect. */
function script(p: Prospect): TimedEvent[] {
  const ev: TimedEvent[] = [];
  let t = 0;
  const push = (delta: number, apply: TimedEvent["apply"]) => {
    t += delta;
    ev.push({ afterMs: t, apply });
  };

  // Étape 1 — santé financière
  push(150, (s) => {
    set(s, "sante", { status: "running" });
    return {};
  });

  if (p.scenario === "api_error") {
    push(3200, (s) => {
      set(s, "sante", { status: "error", detail: "Pappers ne répond pas (timeout après 30 s)" });
      set(s, "gate", { detail: "non lancé" });
      set(s, "signaux", { detail: "non lancés" });
      set(s, "contacts", { detail: "non lancés" });
      set(s, "fiche", { detail: "non lancée" });
      return { phase: "error" };
    });
    return ev;
  }

  if (p.scenario === "no_pappers") {
    push(1600, (s) => {
      set(s, "sante", {
        status: "warning",
        detail: "Pas trouvé chez Pappers — santé inconnue",
        durationMs: 6400,
      });
      set(s, "gate", { status: "running" });
      return {};
    });
    push(500, (s) => {
      set(s, "gate", { status: "warning", detail: "Seuil non vérifiable — on continue, fiche marquée « santé inconnue »" });
      return {};
    });
  } else {
    const score = p.healthScore!;
    push(1400, (s) => {
      set(s, "sante", {
        status: "done",
        detail: `Pappers · score ${score} · ${p.healthBand}`,
        durationMs: 4200,
      });
      set(s, "gate", { status: "running" });
      return {};
    });

    if (p.scenario === "below_threshold") {
      push(600, (s) => {
        set(s, "gate", { status: "stopped", detail: `Écarté — santé financière ${score}/100 (seuil : 50)` });
        set(s, "signaux", { detail: "non lancés" });
        set(s, "contacts", { detail: "non lancés" });
        set(s, "fiche", { detail: "non lancée" });
        return { phase: "ecarte" };
      });
      return ev;
    }

    push(500, (s) => {
      set(s, "gate", { status: "done", detail: "Seuil > 50 franchi" });
      return {};
    });
  }

  // Étape 3 — signaux
  push(200, (s) => {
    set(s, "signaux", { status: "running" });
    return {};
  });
  push(2400, (s) => {
    const n = p.signals.length;
    set(s, "signaux", {
      status: "done",
      detail: `${n} signa${n > 1 ? "ux" : "l"} sur 12 mois`,
      durationMs: 38000,
    });
    return {};
  });

  // Étape 4 — contacts
  push(200, (s) => {
    set(s, "contacts", { status: "running" });
    return {};
  });
  if (p.scenario === "no_linkedin") {
    push(1900, (s) => {
      set(s, "contacts", {
        status: "warning",
        detail: "Page LinkedIn introuvable — 0 contact (fiche générée sans annuaire)",
        durationMs: 21000,
      });
      return {};
    });
  } else {
    push(1600, (s) => {
      const n = p.contacts.length;
      const ann = p.otherContactsCount || (p.employees?.length ?? 0);
      set(s, "contacts", {
        status: "done",
        detail: `${n} rôle${n > 1 ? "s" : ""} clé${n > 1 ? "s" : ""} · ${ann} dans l'annuaire`,
        durationMs: 22000,
      });
      return {};
    });
  }

  // Étape 5 — fiche
  push(400, (s) => {
    set(s, "fiche", {
      status: "done",
      detail: p.potential
        ? `Potentiel ${p.potential} · plan d'attaque prêt`
        : "Fiche signalétique générée",
    });
    return { phase: "done" };
  });

  return ev;
}

/**
 * Lance l'analyse. Appelle onUpdate à chaque événement avec un RunState frais.
 * Retourne une fonction d'annulation (démontage du composant, relance).
 */
export function runAnalysis(p: Prospect, onUpdate: (rs: RunState) => void): () => void {
  const steps = baseSteps();
  const events = script(p);
  const timers: ReturnType<typeof setTimeout>[] = [];

  onUpdate({ phase: "running", steps: clone(steps) });

  for (const e of events) {
    timers.push(
      setTimeout(() => {
        const { phase } = e.apply(steps);
        const finished = phase && phase !== "running";
        onUpdate({
          phase: phase ?? "running",
          steps: clone(steps),
          finishedAtLabel: finished
            ? new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })
            : undefined,
        });
      }, e.afterMs),
    );
  }

  return () => timers.forEach(clearTimeout);
}

function clone(steps: StepState[]): StepState[] {
  return steps.map((s) => ({ ...s }));
}
