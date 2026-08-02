import Anthropic from "@anthropic-ai/sdk";
import type { ChatMsg } from "./Chat";
import type { Criteria } from "./brain";
import { EMPTY_CRITERIA } from "./brain";
import { MARKET, TOTAL_SIGNALS } from "./market";
import type { SignalType } from "./types";

/**
 * Le concierge LLM : Claude traduit le besoin exprimé en français en critères
 * structurés (tool use forcé + schéma strict → il ne peut répondre QUE des
 * valeurs valides ; le classement reste local et déterministe — zéro société
 * hallucinée par construction).
 *
 * La clé API vit UNIQUEMENT dans le localStorage du navigateur de l'utilisateur
 * (jamais dans le code : le site est public). Sans clé → parseur scripté.
 */

export const KEY_STORAGE = "anthropic-key";

export function getStoredKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function setStoredKey(key: string | null) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* stockage indisponible */
  }
}

const PROVINCES = [
  "Hainaut", "Liège", "Namur", "Luxembourg", "Brabant wallon", "Bruxelles-Capitale",
  "Flandre-Occidentale", "Flandre-Orientale", "Anvers", "Brabant flamand", "Limbourg",
] as const;

const GROUPS = [
  "Production", "Construction", "Transport & logistique", "Commerce & retail", "Horeca",
  "Services aux entreprises", "Santé & soins", "IT & conseil", "Agriculture & espaces verts",
  "Intérim & titres-services",
] as const;

const SIGNAL_TYPES = [
  "talent", "growth_signal", "decision_maker_change", "expansion", "acquisition",
  "fundraising", "contract_opportunity",
] as const;

const TOOL = {
  name: "set_criteria",
  description:
    "Applique les critères de tri du marché. Toujours renvoyer l'état COMPLET des critères (pas un delta) : partir des critères courants et appliquer la demande de l'utilisateur.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "reply", "reset", "provinces", "groups", "excludeGroups",
      "sizeMax", "sizeMin", "signalTypes", "requireSignal", "recentDays", "topN",
    ],
    properties: {
      reply: {
        type: "string",
        description:
          "Réponse conversationnelle en français, UNE phrase courte, ton collègue de confiance. NE PAS citer de chiffres de résultats (l'app les ajoute). NE PAS inventer de sociétés.",
      },
      reset: {
        type: "boolean",
        description: "true si l'utilisateur veut repartir de zéro / voir tout le marché.",
      },
      provinces: { type: "array", items: { type: "string", enum: [...PROVINCES] } },
      groups: {
        type: "array",
        items: { type: "string", enum: [...GROUPS] },
        description: "Secteurs à INCLURE (vide = tous).",
      },
      excludeGroups: {
        type: "array",
        items: { type: "string", enum: [...GROUPS] },
        description: "Secteurs à EXCLURE.",
      },
      sizeMax: { type: ["integer", "null"], description: "Effectif strictement inférieur à N (null = pas de limite)." },
      sizeMin: { type: ["integer", "null"], description: "Effectif d'au moins N (null = pas de limite)." },
      signalTypes: {
        type: "array",
        items: { type: "string", enum: [...SIGNAL_TYPES] },
        description:
          "Types de signaux exigés (vide = tous types). talent=recrutement, expansion=agrandissement/nouveau site, decision_maker_change=changement de dirigeant, acquisition=rachat/fusion, fundraising=levée de fonds, contract_opportunity=marché/contrat remporté, growth_signal=investissement/croissance.",
      },
      requireSignal: {
        type: "boolean",
        description: "true si l'utilisateur veut des dossiers où « il se passe quelque chose » (signal récent exigé).",
      },
      recentDays: {
        type: "integer",
        description: "Fenêtre de récence des signaux en jours (90 par défaut, 30 pour « ce mois-ci », 120 si indifférent).",
      },
      topN: { type: "integer", description: "Nombre de dossiers à analyser d'une traite (défaut 10, min 3, max 30)." },
    },
  },
} as const;

function marketDigest(): string {
  const byProv = new Map<string, number>();
  const byGroup = new Map<string, number>();
  for (const p of MARKET) {
    byProv.set(p.province, (byProv.get(p.province) ?? 0) + 1);
    byGroup.set(p.sectorGroup ?? "?", (byGroup.get(p.sectorGroup ?? "?") ?? 0) + 1);
  }
  const fmt = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
  return `Provinces : ${fmt(byProv)}. Secteurs : ${fmt(byGroup)}.`;
}

const SYSTEM = `Tu es le copilote de prospection d'un commercial de secrétariat social belge. Une base de ${MARKET.length} sociétés belges (fictives, démo) est sous veille continue, avec ${TOTAL_SIGNALS} signaux détectés (recrutements, expansions, changements de dirigeant, rachats, levées, marchés remportés). ${marketDigest()}

L'utilisateur exprime son besoin en langage naturel (ICP, territoire, taille, actualité). Tu traduis ce besoin en critères via l'outil set_criteria — TOUJOURS l'état complet, en partant des critères courants fournis et en appliquant la demande. Les critères filtrent et classent la liste à droite de l'écran ; l'app analyse ensuite le top d'une traite.

Règles :
- Un raffinement (« enlève l'intérim », « seulement Liège ») MODIFIE les critères courants ; un besoin nouveau les remplace quand c'est manifestement une nouvelle recherche.
- « seulement celles où X » remplace signalTypes par les types correspondants.
- « où il vient de se passer quelque chose » → requireSignal=true, recentDays=90.
- Tailles : « sous 50 » → sizeMax=50 ; « petites » → sizeMax=50 ; « grosses » → sizeMin=100.
- reply : une phrase courte en français, naturelle, sans chiffres de résultats, sans inventer de sociétés. Aujourd'hui : 2 août 2026.`;

export interface LlmResult {
  criteria: Criteria;
  reply: string;
  reset: boolean;
}

export async function llmParse(
  apiKey: string,
  history: ChatMsg[],
  current: Criteria,
): Promise<LlmResult> {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    timeout: 20_000,
    maxRetries: 1,
  });

  const turns = history.slice(-8).map((m) => ({
    role: m.from === "user" ? ("user" as const) : ("assistant" as const),
    content: m.text,
  }));

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system: SYSTEM,
    tools: [TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: "set_criteria" },
    messages: [
      ...turns.slice(0, -1),
      {
        role: "user",
        content: `Critères courants : ${JSON.stringify({
          provinces: current.provinces, groups: current.groups, excludeGroups: current.excludeGroups,
          sizeMax: current.sizeMax ?? null, sizeMin: current.sizeMin ?? null,
          signalTypes: current.signalTypes, requireSignal: current.requireSignal,
          recentDays: current.recentDays, topN: current.topN,
        })}\n\nMessage de l'utilisateur : ${history[history.length - 1]?.text ?? ""}`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Pas de tool_use dans la réponse");
  const input = block.input as Record<string, unknown>;

  // Ceinture-bretelles : re-valider contre les enums avant d'appliquer.
  const arr = (v: unknown, allowed: readonly string[]): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && allowed.includes(x)) : [];
  const intOr = (v: unknown, fallback: number | undefined): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;

  const criteria: Criteria = {
    provinces: arr(input.provinces, PROVINCES),
    groups: arr(input.groups, GROUPS),
    excludeGroups: arr(input.excludeGroups, GROUPS),
    sizeMax: input.sizeMax === null ? undefined : intOr(input.sizeMax, undefined),
    sizeMin: input.sizeMin === null ? undefined : intOr(input.sizeMin, undefined),
    signalTypes: arr(input.signalTypes, SIGNAL_TYPES) as SignalType[],
    requireSignal: input.requireSignal === true,
    recentDays: Math.min(365, Math.max(7, intOr(input.recentDays, 120) ?? 120)),
    topN: Math.min(30, Math.max(3, intOr(input.topN, EMPTY_CRITERIA.topN) ?? EMPTY_CRITERIA.topN)),
  };

  return {
    criteria,
    reply: typeof input.reply === "string" && input.reply.trim() ? input.reply.trim() : "C'est fait.",
    reset: input.reset === true,
  };
}
