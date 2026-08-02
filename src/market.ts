import { PROSPECTS as HEROES } from "./data";
import type { AttackReco, CrossSell, Prospect, Signal, SignalType } from "./types";

/**
 * Le marché sous veille : 500 sociétés belges 100 % fictives.
 * 14 « héroïnes » écrites à la main (data.ts) + 486 générées de façon
 * DÉTERMINISTE (graine fixe) — même marché à chaque rechargement.
 */

/* ———— Horloge de la démo ———— */

export const DEMO_TODAY = new Date(2026, 7, 2); // 2 août 2026

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export function dateStr(daysAgo: number): string {
  const d = new Date(DEMO_TODAY);
  d.setDate(d.getDate() - daysAgo);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDaysAgo(daysAgo: number): string {
  if (daysAgo <= 0) return "aujourd'hui";
  if (daysAgo === 1) return "hier";
  if (daysAgo < 45) return `il y a ${daysAgo} j`;
  return `il y a ${Math.round(daysAgo / 30)} mois`;
}

/** Parse « 28 juil. 2026 » → jours d'ancienneté (pour les héroïnes). */
function parseDaysAgo(frDate: string): number {
  const m = frDate.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
  if (!m) return 30;
  const mi = MONTHS.findIndex((x) => m[2].startsWith(x.replace(".", "")) || x.startsWith(m[2].slice(0, 3)));
  const d = new Date(Number(m[3]), mi >= 0 ? mi : 0, Number(m[1]));
  return Math.max(0, Math.round((DEMO_TODAY.getTime() - d.getTime()) / 86400000));
}

/* ———— PRNG déterministe ———— */

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260802);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
const rint = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const chance = (p: number) => rnd() < p;

/* ———— Géographie ———— */

interface Geo { province: string; cities: string[]; w: number; fl: boolean }
const GEO: Geo[] = [
  { province: "Hainaut", cities: ["Charleroi", "Mons", "Tournai", "La Louvière", "Mouscron", "Soignies", "Binche", "Ath", "Frameries"], w: 9, fl: false },
  { province: "Liège", cities: ["Liège", "Verviers", "Seraing", "Herstal", "Huy", "Waremme", "Ans"], w: 8, fl: false },
  { province: "Namur", cities: ["Namur", "Gembloux", "Andenne", "Dinant", "Ciney"], w: 5, fl: false },
  { province: "Luxembourg", cities: ["Arlon", "Marche-en-Famenne", "Bastogne", "Libramont", "Virton"], w: 3, fl: false },
  { province: "Brabant wallon", cities: ["Wavre", "Nivelles", "Braine-l'Alleud", "Louvain-la-Neuve", "Jodoigne"], w: 4, fl: false },
  { province: "Bruxelles-Capitale", cities: ["Bruxelles", "Anderlecht", "Schaerbeek", "Uccle", "Forest"], w: 6, fl: false },
  { province: "Flandre-Occidentale", cities: ["Bruges", "Courtrai", "Roulers", "Ostende", "Ypres"], w: 5, fl: true },
  { province: "Flandre-Orientale", cities: ["Gand", "Alost", "Saint-Nicolas", "Deinze"], w: 5, fl: true },
  { province: "Anvers", cities: ["Anvers", "Malines", "Turnhout", "Lierre"], w: 6, fl: true },
  { province: "Brabant flamand", cities: ["Louvain", "Vilvorde", "Hal", "Aarschot"], w: 4, fl: true },
  { province: "Limbourg", cities: ["Hasselt", "Genk", "Saint-Trond", "Tongres"], w: 3, fl: true },
];

const FAM_FR = ["Dupont", "Lambert", "Martin", "Dubois", "Leroy", "Simon", "Denis", "Bertrand", "Petit", "Lejeune", "Renard", "Gérard", "Marchal", "Collard", "Massart", "Delvaux", "Baudouin", "Charlier", "Docquier", "Fontaine", "Michaux", "Toussaint", "Lecomte", "Pirson", "Georges", "Henry", "Adam", "Evrard", "Body", "Nizet"];
const FAM_NL = ["Peeters", "Janssens", "Maes", "Jacobs", "Mertens", "Willems", "Claes", "Goossens", "Wouters", "De Smet", "Vermeulen", "De Clercq", "Segers", "Aerts", "Hermans", "Claessens", "Dierckx", "Verhoeven", "Cools", "Bogaerts"];
const FIRST_FR = ["Marc", "Sophie", "Julien", "Anne", "Vincent", "Céline", "Pierre", "Nathalie", "Olivier", "Isabelle", "Thomas", "Laure", "Benoît", "Sarah", "Hugo", "Amina", "Karim", "Elodie"];
const FIRST_NL = ["Wim", "Els", "Karel", "Inge", "Dries", "Sofie", "Jan", "Lore", "Bart", "Katrien", "Stijn", "Femke"];

/* ———— Secteurs ———— */

type SigT = SignalType;
interface SectorDef {
  group: string;
  label: string;
  w: number;
  words: string[]; // préfixes de nom
  types: SigT[];
}
const SECTORS: SectorDef[] = [
  { group: "Production", label: "Métallurgie & fabrication", w: 7, words: ["Ateliers", "Usinage", "Métallerie", "Constructions métalliques", "Tôlerie"], types: ["talent", "expansion", "contract_opportunity", "growth_signal"] },
  { group: "Production", label: "Agroalimentaire", w: 6, words: ["Salaisons", "Biscuiterie", "Laiterie", "Boulangeries", "Conserverie"], types: ["talent", "expansion", "contract_opportunity", "growth_signal"] },
  { group: "Production", label: "Plasturgie & emballage", w: 4, words: ["Plastiques", "Emballages", "Cartonnerie"], types: ["talent", "expansion", "contract_opportunity"] },
  { group: "Production", label: "Bois & ameublement", w: 4, words: ["Menuiserie industrielle", "Mobilier", "Scierie"], types: ["talent", "expansion", "growth_signal"] },
  { group: "Production", label: "Imprimerie & packaging", w: 3, words: ["Imprimerie", "Étiquettes"], types: ["talent", "acquisition", "growth_signal"] },
  { group: "Construction", label: "Construction & gros œuvre", w: 8, words: ["Constructions", "Entreprises", "Bâtiments", "Toitures"], types: ["talent", "contract_opportunity", "expansion"] },
  { group: "Construction", label: "Électrotechnique & HVAC", w: 5, words: ["Électro", "Installations", "Chauffage"], types: ["talent", "contract_opportunity", "expansion"] },
  { group: "Transport & logistique", label: "Transport & logistique", w: 7, words: ["Transports", "Logistique", "Distribution"], types: ["talent", "expansion", "acquisition", "contract_opportunity"] },
  { group: "Commerce & retail", label: "Commerce & retail", w: 6, words: ["Comptoir", "Maison", "Établissements"], types: ["talent", "expansion", "acquisition"] },
  { group: "Horeca", label: "Horeca & traiteur", w: 4, words: ["Brasserie", "Traiteur", "Hôtel"], types: ["talent", "expansion"] },
  { group: "Services aux entreprises", label: "Nettoyage & facility", w: 4, words: ["Nettoyage", "Facility", "Services"], types: ["talent", "contract_opportunity", "decision_maker_change"] },
  { group: "Services aux entreprises", label: "Sécurité & gardiennage", w: 2, words: ["Sécurité", "Gardiennage"], types: ["talent", "contract_opportunity"] },
  { group: "Santé & soins", label: "Santé & soins", w: 4, words: ["Clinique", "Résidence", "Centre médical"], types: ["talent", "expansion", "acquisition"] },
  { group: "IT & conseil", label: "IT & conseil", w: 4, words: ["Solutions", "Consulting", "Studio"], types: ["talent", "fundraising", "growth_signal", "decision_maker_change"] },
  { group: "Agriculture & espaces verts", label: "Agriculture & espaces verts", w: 3, words: ["Pépinières", "Jardins", "Cultures"], types: ["talent", "contract_opportunity"] },
  { group: "Intérim & titres-services", label: "Intérim & titres-services", w: 3, words: ["Intérim", "Titres-Services", "Talents"], types: ["talent", "expansion", "decision_maker_change"] },
];

function weighted<T extends { w: number }>(arr: T[]): T {
  const total = arr.reduce((s, x) => s + x.w, 0);
  let r = rnd() * total;
  for (const x of arr) {
    r -= x.w;
    if (r <= 0) return x;
  }
  return arr[arr.length - 1];
}

/* ———— Signaux générés ———— */

const IMPACT_BY_TYPE: Record<SigT, "low" | "medium" | "high"> = {
  expansion: "high", acquisition: "high", contract_opportunity: "high",
  fundraising: "medium", decision_maker_change: "medium", talent: "medium", growth_signal: "medium",
};
const PRESS = ["L'Echo", "Trends-Tendances", "L'Avenir", "La Libre Eco", "Le Soir", "De Tijd", "La Meuse"];

function mkSignal(sd: SectorDef, city: string, size: number): Signal {
  const type = pick(sd.types);
  const daysAgo = chance(0.55) ? rint(2, 45) : rint(46, 170);
  const n = rint(2, Math.max(3, Math.round(size / 8)));
  const T: Record<SigT, [string, string, string]> = {
    talent: [`Publication de ${n} offres d'emploi en ${n > 4 ? "rafale" : "cours"}`, "Site web", `${n} postes ouverts simultanément — la charge contrats/DIMONA suit.`],
    expansion: [`Extension du site de ${city} annoncée`, pick(PRESS), "Un site qui s'agrandit = des embauches et une paie qui change d'échelle."],
    acquisition: ["Reprise d'un concurrent local finalisée", pick(PRESS), "Deux régimes de paie à fusionner — fenêtre d'appel idéale."],
    fundraising: [`Levée de fonds de ${rint(1, 6)} M€ annoncée`, "Trends-Tendances", "Du cash pour structurer : le moment de vendre l'accompagnement RH."],
    decision_maker_change: ["Changement à la direction générale", "LinkedIn", "Un décideur neuf rebat les cartes prestataires pendant 90 jours."],
    contract_opportunity: ["Nouveau marché pluriannuel remporté", pick(PRESS), "Un marché gagné impose des équipes en règle au jour 1."],
    growth_signal: [`Investissement de ${rint(1, 4)},${rint(1, 9)} M€ dans l'outil de production`, pick(PRESS), "La capacité monte — les effectifs suivront."],
  };
  const [title, source, salesAngle] = T[type];
  return {
    date: dateStr(daysAgo), daysAgo, title, source, type,
    impact: daysAgo < 30 ? IMPACT_BY_TYPE[type] : chance(0.5) ? "medium" : "low",
    description: "", salesAngle,
  };
}

/* ———— Fiche profonde générée ———— */

const BANDS: [string, number, number][] = [["5-9", 7, 6], ["10-19", 14, 20], ["20-49", 34, 34], ["50-99", 74, 24], ["100-199", 149, 11], ["200-499", 349, 5]];

function mkAttack(group: string): AttackReco[] {
  return [
    { type: "quick_win", title: "Premier contact utile", action: "Ouvrir sur le signal détecté avec une proposition datée, sans engagement." },
    { type: "core_bet", title: "Payroll & administration", action: `Reprendre la paie ${group === "Construction" ? "chantier (CP 124)" : group === "Transport & logistique" ? "roulants (CP 140)" : "complète"} avec les pics d'activité.` },
    { type: "decision_maker_hook", title: "Décideur en direct", action: "Viser le dirigeant avec une note d'une page adossée au signal." },
  ];
}
function mkCross(group: string): CrossSell[] {
  const base: CrossSell = { product: "Payroll & administration salariale", justification: "L'activité bouge — la paie doit suivre sans friction." };
  const extra: Record<string, CrossSell> = {
    Horeca: { product: "Gestion flexi-jobs", justification: "Modèle saisonnier : flexi et extras à administrer." },
    "Construction": { product: "Support juridique social", justification: "CP 124 : détachements et intempéries à cadrer." },
    "Transport & logistique": { product: "Support juridique social", justification: "Temps de conduite et primes à sécuriser." },
  };
  return extra[group] ? [base, extra[group]] : [base];
}

/* ———— Génération des 486 ———— */

function generate(count: number): Prospect[] {
  const out: Prospect[] = [];
  const seen = new Set<string>(HEROES.map((h) => h.name));

  for (let i = 0; i < count; i++) {
    const geo = weighted(GEO);
    const sd = weighted(SECTORS);
    const fam = geo.fl ? pick(FAM_NL) : pick(FAM_FR);
    const suffix = geo.fl ? pick(["BV", "NV"]) : pick(["SRL", "SA"]);
    const city = pick(geo.cities);
    let name = `${pick(sd.words)} ${fam} ${suffix}`;
    if (seen.has(name)) name = `${pick(sd.words)} ${fam} & ${geo.fl ? "Zonen" : "Fils"} ${suffix}`;
    if (seen.has(name)) name = `${pick(sd.words)} ${city} ${suffix}`;
    if (seen.has(name)) continue;
    seen.add(name);

    const bandPick = weighted(BANDS.map(([b, s, w]) => ({ b, s, w })));
    const band = bandPick.b;
    const sizeNum = bandPick.s;

    const health = chance(0.08) ? null : rint(30, 88);
    const nSignals = chance(0.38) ? 0 : chance(0.55) ? 1 : chance(0.75) ? 2 : 3;
    const signals: Signal[] = Array.from({ length: nSignals }, () => mkSignal(sd, city, sizeNum))
      .sort((a, b) => (a.daysAgo ?? 99) - (b.daysAgo ?? 99));
    const top = signals[0];

    const first = geo.fl ? pick(FIRST_NL) : pick(FIRST_FR);
    const first2 = geo.fl ? pick(FIRST_NL) : pick(FIRST_FR);
    const domain = name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "").slice(0, 18);
    const ca0 = sizeNum * rint(90, 160);

    out.push({
      id: `g${String(i).padStart(3, "0")}`,
      name,
      enterpriseNumber: `0${rint(400, 799)}.${String(rint(100, 999))}.${String(rint(100, 999))}`,
      city,
      province: geo.province,
      workerBand: band,
      sizeNum,
      sector: sd.label,
      sectorGroup: sd.group,
      scenario: health === null ? "no_pappers" : health < 50 ? "below_threshold" : "ok",
      healthScore: health,
      healthBand: health === null ? "Inconnue" : health < 50 ? "À risque" : "Solide",
      whyCallNow: top?.salesAngle ?? "",
      signals,
      contacts: health === null || health < 50 ? [] : [
        { name: `${first} ${fam}`, role: geo.fl ? "Zaakvoerder" : "Gérant(e)", roleGroup: "CEO", email: `${first.toLowerCase()}@${domain}.example` },
        { name: `${first2} ${geo.fl ? pick(FAM_NL) : pick(FAM_FR)}`, role: "Comptabilité", roleGroup: "Comptabilité", email: `compta@${domain}.example` },
      ],
      otherContactsCount: rint(Math.max(2, Math.round(sizeNum / 4)), Math.max(4, sizeNum)),
      financials: health === null ? undefined : {
        exercices: Array.from({ length: 5 }, (_, k) => {
          const growth = 1 + (health - 50) / 400;
          const ca = Math.round(ca0 * Math.pow(growth, k) * (0.95 + rnd() * 0.1));
          const marge = (health < 55 && k === 2 ? -1 : 1) * (0.02 + rnd() * 0.05);
          return { year: 2021 + k, ca, resultat: Math.round(ca * marge) };
        }),
        etablissements: [{ name: "Siège", city, status: "actif" }],
      },
      employees: health === null || health < 50 ? [] : [
        { name: `${first} ${fam}`, title: geo.fl ? "Zaakvoerder" : "Gérant(e)", domain: "Direction", location: city },
        { name: `${first2} ${geo.fl ? pick(FAM_NL) : pick(FAM_FR)}`, title: "Office manager", domain: "Finance", location: city },
      ],
      officers: health === null ? [] : [{ name: `${first} ${fam}`, role: geo.fl ? "Zaakvoerder" : "Gérant(e)", since: String(rint(2003, 2023)), gender: chance(0.6) ? "M" : "F" }],
      attack: mkAttack(sd.group),
      crossSell: mkCross(sd.group),
      potential: health !== null && health > 62 && nSignals >= 2 ? "élevé" : "moyen",
      priority: health === null ? 45 : Math.min(95, Math.round(health * 0.7 + nSignals * 8)),
      verifiedSources: rint(2, 7),
    });
  }
  return out;
}

/* ———— Héroïnes patchées (daysAgo + groupes + tailles) ———— */

const HERO_GROUP: Record<string, string> = {
  "Métallurgie": "Production", "Transport & logistique": "Transport & logistique",
  "Nettoyage": "Services aux entreprises", "Construction — bois": "Construction",
  "Énergie & environnement": "Construction", "Alimentaire": "Production",
  "IT & conseil": "IT & conseil", "Maintenance industrielle": "Production",
  "Santé animale": "Santé & soins", "Brasserie": "Horeca",
  "Sécurité": "Services aux entreprises", "Horticulture": "Agriculture & espaces verts",
};
const BAND_NUM: Record<string, number> = { "5-9": 7, "10-19": 14, "20-49": 34, "50-99": 74, "100-199": 149, "200-499": 349 };

const heroes: Prospect[] = HEROES.map((h) => ({
  ...h,
  sizeNum: BAND_NUM[h.workerBand] ?? 34,
  sectorGroup: HERO_GROUP[h.sector] ?? "Production",
  signals: h.signals.map((s) => ({ ...s, daysAgo: s.daysAgo ?? parseDaysAgo(s.date) })),
}));

export const MARKET: Prospect[] = [...heroes, ...generate(486)];
export const TOTAL_SIGNALS = MARKET.reduce((s, p) => s + p.signals.length, 0);
