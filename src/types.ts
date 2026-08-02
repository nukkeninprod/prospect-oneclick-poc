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

/** Types de signaux — labels calqués sur signalConfig de l'app. */
export type SignalType =
  | "talent" // Recrutement / Croissance
  | "growth_signal" // Croissance
  | "decision_maker_change" // Changement décideur
  | "expansion" // Expansion
  | "acquisition" // Acquisition / Fusion
  | "fundraising" // Levée de fonds
  | "contract_opportunity"; // Opportunité contrat

export interface Signal {
  date: string; // "12 juin 2026"
  title: string;
  source: string; // "L'Echo", "LinkedIn", "Le Soir", "Site web"
  type?: SignalType;
  impact?: "low" | "medium" | "high";
  description?: string;
  salesAngle?: string;
  daysAgo?: number; // ancienneté machine-lisible (tri par pertinence)
}

export interface NewsItem {
  title: string;
  date: string;
  relevance: string; // pourquoi c'est pertinent
  tier: "verified" | "cited";
}

export interface AttackReco {
  type: "quick_win" | "core_bet" | "decision_maker_hook";
  title: string;
  action: string;
}

export interface CrossSell {
  product: string;
  justification: string;
}

export interface Employee {
  name: string;
  title: string;
  domain: string; // "Direction", "Finance", "RH", "Production"…
  location: string;
}

export interface Officer {
  name: string;
  role: string;
  since: string; // "2011"
  kind?: "legal"; // personne morale
  gender?: "F" | "M";
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
  news?: NewsItem[];
  attack?: AttackReco[];
  crossSell?: CrossSell[];
  employees?: Employee[]; // annuaire LinkedIn
  officers?: Officer[]; // dirigeants Pappers
  potential?: "élevé" | "moyen"; // potentiel commercial de l'analyse
  priority?: number; // priority_score
  verifiedSources?: number;
  sizeNum?: number; // effectif médian de la bande ONSS (filtres taille)
  sectorGroup?: string; // "Production", "Construction", "Intérim & titres-services"…
  whyCallNow: string; // la ligne qui vend
  signals: Signal[];
  contacts: Contact[];
  /** Taille TOTALE de l'annuaire LinkedIn — `employees` n'en est qu'un aperçu. */
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
