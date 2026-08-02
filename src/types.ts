/** Scénario joué par le moteur de démo pour un prospect donné. */
export type Scenario =
  | "ok" // chemin heureux : santé > 50, signaux, contacts
  | "below_threshold" // score < 50 → écarté (résultat, pas erreur)
  | "no_pappers" // pas de données Pappers → continue, santé inconnue
  | "no_linkedin" // annuaire introuvable → fiche sans contacts
  | "api_error"; // timeout Pappers → vrai échec, bouton réessayer

export interface Contact {
  name: string;
  role: string;
  roleGroup: "CEO" | "Comptabilité" | "Payroll" | "RH";
  email: string;
}

export interface Signal {
  date: string; // "12 juin 2026"
  title: string;
  source: string; // "L'Echo", "LinkedIn", "Le Soir", "Site web"
}

/** Un exercice comptable (montants en k€), calqué sur l'historique Pappers. */
export interface Exercice {
  year: number;
  ca: number;
  resultat: number;
}

export interface Etablissement {
  name: string;
  city: string;
  status: "actif" | "inactif";
}

export interface Financials {
  exercices: Exercice[]; // du plus ancien au plus récent
  etablissements: Etablissement[];
}

export interface Prospect {
  id: string;
  name: string;
  enterpriseNumber: string;
  city: string;
  province: string;
  workerBand: string; // bande ONSS
  sector: string;
  scenario: Scenario;
  healthScore: number | null; // null = pas de données Pappers
  healthBand: "Solide" | "À risque" | "Inconnue";
  financials?: Financials; // absent si pas de données Pappers
  whyCallNow: string; // la ligne qui vend
  signals: Signal[];
  contacts: Contact[];
  otherContactsCount: number;
}

export type StepStatus = "pending" | "running" | "done" | "warning" | "stopped" | "error";

export interface StepState {
  key: string;
  label: string;
  status: StepStatus;
  detail?: string;
  durationMs?: number;
}

export type RunPhase = "idle" | "running" | "done" | "ecarte" | "error";

export interface RunState {
  phase: RunPhase;
  steps: StepState[];
  finishedAtLabel?: string;
}
