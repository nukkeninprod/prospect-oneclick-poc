import { fmtDaysAgo, MARKET } from "./market";
import type { Prospect, Signal, SignalType } from "./types";

/**
 * Le « cerveau » scripté de la démo : il traduit un besoin exprimé en
 * français en critères, filtre les 500 sociétés du marché, classe par
 * pertinence et fabrique la justification de chaque résultat.
 * Zéro backend — la magie d'abord.
 */

export interface Criteria {
  provinces: string[];
  groups: string[];
  excludeGroups: string[];
  sizeMax?: number;
  sizeMin?: number;
  signalTypes: SignalType[];
  requireSignal: boolean;
  recentDays: number;
  topN: number;
}

export const EMPTY_CRITERIA: Criteria = {
  provinces: [], groups: [], excludeGroups: [],
  signalTypes: [], requireSignal: false, recentDays: 120, topN: 10,
};

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/* ———— Vocabulaire ———— */

const PROVINCES: [string, string][] = [
  ["hainaut", "Hainaut"], ["liege", "Liège"], ["namur", "Namur"],
  ["luxembourg", "Luxembourg"], ["brabant wallon", "Brabant wallon"],
  ["bruxelles", "Bruxelles-Capitale"], ["flandre-occidentale", "Flandre-Occidentale"],
  ["flandre-orientale", "Flandre-Orientale"], ["anvers", "Anvers"],
  ["brabant flamand", "Brabant flamand"], ["limbourg", "Limbourg"],
];
const WALLONIE = ["Hainaut", "Liège", "Namur", "Luxembourg", "Brabant wallon"];
const FLANDRE = ["Flandre-Occidentale", "Flandre-Orientale", "Anvers", "Brabant flamand", "Limbourg"];

const GROUPS: [RegExp, string][] = [
  [/\bproduction|industri|manufactur|usine|fabri/, "Production"],
  [/\bconstruction|batiment|chantier|toiture|electrotech|hvac/, "Construction"],
  [/\btransport|logisti/, "Transport & logistique"],
  [/\bcommerce|retail|magasin/, "Commerce & retail"],
  [/\bhoreca|restaurant|traiteur|hotel/, "Horeca"],
  [/\bnettoyage|facility|gardiennage|securite/, "Services aux entreprises"],
  [/\bsante|soins|clinique|medical/, "Santé & soins"],
  [/\binformatique|\bit\b|digital|conseil|consulting/, "IT & conseil"],
  [/\bagricol|espaces verts|horticult|pepinier/, "Agriculture & espaces verts"],
  [/\binterim|titres?-services/, "Intérim & titres-services"],
];

const SIGNAL_TYPES: [RegExp, SignalType][] = [
  [/dirigeant|direction .{0,12}chang|nouveau (patron|dirigeant|ceo|directeur)|changement de direction/, "decision_maker_change"],
  [/recrute|embauche|offres? d'emploi|postes? ouverts/, "talent"],
  [/extension|agrandi|nouveau site|expansion|s'etend/, "expansion"],
  [/levee|leve des fonds|fonds/, "fundraising"],
  [/rachat|rachete|fusion|acquisition|repris/, "acquisition"],
  [/marche public|marches publics|remporte|contrat/, "contract_opportunity"],
];

const NEGATION = /(enleve|retire|sans|pas d[e']|exclu[st]?|vire|supprime|plus d[e'])/;

/* ———— Parse ———— */

export interface ParseResult {
  criteria: Criteria;
  understood: string[]; // ce que la machine a compris, pour l'accusé
  isReset: boolean;
  matchedAnything: boolean;
}

export function parse(text: string, prev: Criteria): ParseResult {
  const t = norm(text);
  const understood: string[] = [];

  if (/recommence|repar[st]|nouveau besoin|oublie tout|remise a zero/.test(t)) {
    return { criteria: { ...EMPTY_CRITERIA }, understood: ["nouveau besoin"], isReset: true, matchedAnything: true };
  }

  const c: Criteria = {
    ...prev,
    provinces: [...prev.provinces],
    groups: [...prev.groups],
    excludeGroups: [...prev.excludeGroups],
    signalTypes: [...prev.signalTypes],
  };

  // Provinces / régions
  for (const [kw, prov] of PROVINCES) {
    if (t.includes(kw) && !c.provinces.includes(prov)) {
      c.provinces.push(prov);
      understood.push(prov);
    }
  }
  if (/wallonie|wallon(?!ne)/.test(t) && !t.includes("brabant")) {
    for (const p of WALLONIE) if (!c.provinces.includes(p)) c.provinces.push(p);
    understood.push("Wallonie");
  }
  if (/flandre(?!-)/.test(t)) {
    for (const p of FLANDRE) if (!c.provinces.includes(p)) c.provinces.push(p);
    understood.push("Flandre");
  }

  // Secteurs — avec détection de négation dans la clause
  const clauses = t.split(/[,;.]| et | mais /);
  for (const clause of clauses) {
    for (const [re, group] of GROUPS) {
      if (!re.test(clause)) continue;
      if (NEGATION.test(clause)) {
        if (!c.excludeGroups.includes(group)) {
          c.excludeGroups.push(group);
          c.groups = c.groups.filter((g) => g !== group);
          understood.push(`sans ${group.toLowerCase()}`);
        }
      } else if (!c.groups.includes(group) && !c.excludeGroups.includes(group)) {
        c.groups.push(group);
        understood.push(group);
      }
    }
  }

  // Taille
  const below = t.match(/(?:sous|moins de|max(?:imum)?|<)\s*(\d{1,4})/);
  if (below) { c.sizeMax = Number(below[1]); understood.push(`< ${c.sizeMax} trav.`); }
  const above = t.match(/(?:plus de|au moins|min(?:imum)?|>)\s*(\d{1,4})/);
  if (above) { c.sizeMin = Number(above[1]); understood.push(`> ${c.sizeMin} trav.`); }
  if (/\bpetites?\b|\btpe\b/.test(t) && !below) { c.sizeMax = 50; understood.push("< 50 trav."); }
  if (/grandes|grosses/.test(t) && !above) { c.sizeMin = 100; understood.push("> 100 trav."); }

  // Récence / « il se passe quelque chose »
  if (/vient de se passer|se passe quelque chose|recent|recemment|bouge|actualite|trimestre|dossiers? chauds?/.test(t)) {
    c.requireSignal = true;
    c.recentDays = /mois-ci|ce mois/.test(t) ? 30 : 90;
    understood.push(`signal < ${c.recentDays} j`);
  }

  // Types de signaux — « seulement celles où … » remplace, sinon ajoute
  const only = /seulement|uniquement|que celles/.test(t);
  const found: SignalType[] = [];
  for (const [re, st] of SIGNAL_TYPES) if (re.test(t)) found.push(st);
  if (found.length > 0) {
    c.signalTypes = only ? found : [...new Set([...c.signalTypes, ...found])];
    c.requireSignal = true;
    understood.push(
      (only ? "seulement : " : "") + found.map((f) => SIGNAL_LABELS[f].toLowerCase()).join(", "),
    );
  }

  // Combien
  const topn = t.match(/(?:top|donne(?:-|\s)?m?'?en|montre(?:-|\s)?m?'?en)\s*(\d{1,2})/);
  if (topn) { c.topN = Math.min(30, Math.max(3, Number(topn[1]))); understood.push(`top ${c.topN}`); }

  return { criteria: c, understood, isReset: false, matchedAnything: understood.length > 0 };
}

/* ———— Classement ———— */

export const SIGNAL_LABELS: Record<SignalType, string> = {
  talent: "Recrutement", growth_signal: "Croissance", decision_maker_change: "Changement décideur",
  expansion: "Expansion", acquisition: "Acquisition", fundraising: "Levée de fonds",
  contract_opportunity: "Marché remporté",
};

export interface Ranked {
  p: Prospect;
  score: number;
  bestSignal: Signal | null;
}

export interface RankResult {
  top: Ranked[];
  matchCount: number;
  excludedCount: number;
}

function matchingSignals(p: Prospect, c: Criteria): Signal[] {
  return p.signals.filter((s) => {
    if (c.signalTypes.length > 0 && (!s.type || !c.signalTypes.includes(s.type))) return false;
    if (c.requireSignal && (s.daysAgo ?? 999) > c.recentDays) return false;
    return true;
  });
}

export function rank(c: Criteria, dismissed: Set<string>): RankResult {
  const matches: Ranked[] = [];
  for (const p of MARKET) {
    if (dismissed.has(p.id)) continue;
    if (c.provinces.length > 0 && !c.provinces.includes(p.province)) continue;
    if (c.groups.length > 0 && !c.groups.includes(p.sectorGroup ?? "")) continue;
    if (c.excludeGroups.includes(p.sectorGroup ?? "")) continue;
    const size = p.sizeNum ?? 34;
    if (c.sizeMax !== undefined && size >= c.sizeMax) continue;
    if (c.sizeMin !== undefined && size < c.sizeMin) continue;
    const sigs = matchingSignals(p, c);
    if ((c.requireSignal || c.signalTypes.length > 0) && sigs.length === 0) continue;

    const best = sigs[0] ?? p.signals[0] ?? null;
    const recency = best ? Math.exp(-(best.daysAgo ?? 120) / 45) : 0.04;
    const impact = best ? { high: 1, medium: 0.65, low: 0.4 }[best.impact ?? "low"] : 0.3;
    const multi = 1 + 0.12 * Math.max(0, sigs.length - 1);
    const health = p.healthScore === null ? 0.75 : p.healthScore < 50 ? 0.35 : 0.85 + p.healthScore / 400;
    matches.push({ p, bestSignal: best, score: Math.min(99, Math.round(100 * recency * impact * multi * health)) });
  }
  matches.sort((a, b) => b.score - a.score);
  return {
    // TOUTES les correspondances, classées — l'écran montre le marché entier.
    top: matches,
    matchCount: matches.length,
    excludedCount: MARKET.length - matches.length - dismissed.size,
  };
}

/* ———— Justifications ———— */

export function reasonFor(r: Ranked): { line: string; meta: string; why: string } {
  const s = r.bestSignal;
  if (!s) {
    return { line: "Profil conforme au besoin exprimé", meta: `${r.p.sector} · ${r.p.city}`, why: "Aucun signal récent — à garder en veille plutôt qu'à appeler en premier." };
  }
  return {
    line: s.title,
    meta: `${s.type ? SIGNAL_LABELS[s.type] : "Signal"} · ${fmtDaysAgo(s.daysAgo ?? 0)} · ${s.source}`,
    why: s.salesAngle || "Un événement récent = une raison légitime d'appeler maintenant.",
  };
}

/** Accusé de réception du copilote après un (re)tri. */
export function ackFor(understood: string[], res: RankResult, c: Criteria): string {
  const crit = understood.length > 0 ? `Compris : ${understood.join(" · ")}. ` : "";
  if (res.matchCount === 0) {
    return `${crit}Aucune société ne correspond — élargis un critère (taille, province, récence) et je recompose.`;
  }
  const sweep = Math.min(c.topN, res.matchCount);
  return `${crit}${res.matchCount} société${res.matchCount > 1 ? "s" : ""} correspondent sur ${MARKET.length} — j'ai écarté les ${res.excludedCount} autres. Classées par pertinence ; j'analyse le top ${sweep} d'une traite.`;
}
