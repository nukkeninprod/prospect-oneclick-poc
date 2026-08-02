import { useEffect, useRef, useState } from "react";
import { FinChart, fmtEur } from "./FinChart";
import type {
  Contact,
  Employee,
  Financials,
  NewsItem,
  Officer,
  Prospect,
  Signal,
  SignalType,
} from "./types";

/**
 * Les blocs de la fiche signalétique. Ils ne sont plus rendus d'un seul
 * tenant : LiveFiche les fait apparaître section par section, au fil de
 * l'analyse (la santé financière pop dès que l'étape 1 est terminée, etc.).
 */

/* ———— Pourquoi appeler maintenant ———— */

export function WhyCall({ text }: { text: string }) {
  return (
    <div className="why-call">
      <div className="why-call-label">Pourquoi appeler maintenant</div>
      <p>{text}</p>
    </div>
  );
}

/* ———— Santé + données financières ———— */

export function HealthRow({ score, band }: { score: number; band: string }) {
  return (
    <div className="health-row">
      <span className={`badge ${score > 50 ? "badge-good" : "badge-risk"}`}>
        {score > 50 ? "✓" : "!"} {band} · {score}/100
      </span>
      <span className="health-meter" role="img" aria-label={`Score ${score} sur 100`}>
        <span
          className={`health-meter-fill ${score > 50 ? "good" : "risk"}`}
          style={{ width: `${score}%` }}
        />
      </span>
      <span className="health-source">Source : Pappers · 2 août 2026</span>
    </div>
  );
}

export function HealthUnknownRow() {
  return (
    <div className="health-row">
      <span className="badge badge-unknown">? Santé inconnue</span>
      <span className="health-source">Aucune donnée Pappers pour ce numéro d'entreprise</span>
    </div>
  );
}

function StatChip({
  label,
  value,
  deltaPct,
}: {
  label: string;
  value: string;
  deltaPct: number | null;
}) {
  return (
    <span className="stat-chip">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {deltaPct !== null && (
        <span
          className={`stat-delta ${deltaPct >= 0 ? "delta-up" : "delta-down"}`}
          aria-label={`en ${deltaPct >= 0 ? "hausse" : "baisse"} de ${Math.abs(deltaPct).toFixed(0)} %`}
        >
          {deltaPct >= 0 ? "↗" : "↘"} {Math.abs(deltaPct).toFixed(0)} %
        </span>
      )}
    </span>
  );
}

function delta(last: number, prev: number): number | null {
  return prev === 0 ? null : ((last - prev) / Math.abs(prev)) * 100;
}

/** Chips + bascule Graphique/Tableau — calqué sur SectionFinancials de l'app. */
export function Financiere({ f }: { f: Financials }) {
  const [tab, setTab] = useState<"graph" | "table">("graph");
  const ex = f.exercices;
  const last = ex[ex.length - 1];
  const prev = ex[ex.length - 2];

  return (
    <div className="financiere">
      <div className="fin-chips">
        <StatChip label="Dernier CA" value={fmtEur(last.ca)} deltaPct={prev ? delta(last.ca, prev.ca) : null} />
        <StatChip label="Résultat net" value={fmtEur(last.resultat)} deltaPct={prev ? delta(last.resultat, prev.resultat) : null} />
        <StatChip label="Marge nette" value={`${((last.resultat / last.ca) * 100).toFixed(1).replace(".", ",")} %`} deltaPct={null} />
      </div>
      <div className="fin-toggle" role="group" aria-label="Affichage des données financières">
        <button className={`chip ${tab === "graph" ? "active" : ""}`} aria-pressed={tab === "graph"} onClick={() => setTab("graph")}>
          Graphique
        </button>
        <button className={`chip ${tab === "table" ? "active" : ""}`} aria-pressed={tab === "table"} onClick={() => setTab("table")}>
          Tableau détaillé
        </button>
      </div>
      {tab === "graph" ? (
        <FinChart exercices={ex} />
      ) : (
        <table className="fin-table">
          <thead>
            <tr>
              <th scope="col">Exercice</th>
              <th scope="col">CA</th>
              <th scope="col">Résultat net</th>
              <th scope="col">Marge nette</th>
            </tr>
          </thead>
          <tbody>
            {[...ex].reverse().map((e) => (
              <tr key={e.year}>
                <td>{e.year}</td>
                <td>{fmtEur(e.ca)}</td>
                <td className={e.resultat < 0 ? "neg" : ""}>{fmtEur(e.resultat)}</td>
                <td className={e.resultat < 0 ? "neg" : ""}>
                  {((e.resultat / e.ca) * 100).toFixed(1).replace(".", ",")} %
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function Etablissements({ f }: { f: Financials }) {
  const actifs = f.etablissements.filter((e) => e.status === "actif").length;
  const inactifs = f.etablissements.length - actifs;
  return (
    <div className="fiche-section">
      <h4>
        Établissements{" "}
        <span className="muted">
          — Source : Pappers · {actifs} actif{actifs > 1 ? "s" : ""}
          {inactifs > 0 ? ` · ${inactifs} inactif${inactifs > 1 ? "s" : ""}` : ""}
        </span>
      </h4>
      <div className="etab-list">
        {f.etablissements.map((e) => (
          <div className="etab-row" key={`${e.name}-${e.city}`}>
            <span className="etab-name">{e.name}</span>
            <span className="etab-city">{e.city}</span>
            {e.status === "inactif" && <span className="badge badge-unknown">inactif</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ———— Signaux (cartes typées — calqué sur ProspectSignals) ———— */

const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  talent: "Recrutement / Croissance",
  growth_signal: "Croissance",
  decision_maker_change: "Changement décideur",
  expansion: "Expansion",
  acquisition: "Acquisition / Fusion",
  fundraising: "Levée de fonds",
  contract_opportunity: "Opportunité contrat",
};

const IMPACT_LABELS = {
  high: { label: "Impact fort", cls: "imp-high" },
  medium: { label: "Impact moyen", cls: "imp-med" },
  low: { label: "Impact faible", cls: "imp-low" },
} as const;

export function SignalList({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) {
    return <p className="empty-note">Aucun signal détecté sur la période.</p>;
  }
  return (
    <div className="signal-cards">
      {signals.map((s, i) => {
        const imp = s.impact ? IMPACT_LABELS[s.impact] : null;
        return (
          <div key={i} className="signal-card">
            <div className="sig-head">
              {s.type && <span className="sig-type">{SIGNAL_TYPE_LABELS[s.type]}</span>}
              {imp && <span className={`sig-impact ${imp.cls}`}>{imp.label}</span>}
            </div>
            <div className="sig-title">{s.title}</div>
            {s.description && <p className="sig-desc">{s.description}</p>}
            {s.salesAngle && (
              <p className="sig-angle">
                <strong>Angle Sales :</strong> {s.salesAngle}
              </p>
            )}
            <div className="sig-foot">
              <span>{s.date}</span>
              <span className="signal-source">
                {s.source} <span aria-hidden="true" title="Lien source (démo)">↗</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ———— Actualités (ProspectNews) ———— */

export function NewsBlock({ news }: { news: NewsItem[] }) {
  return (
    <div className="fiche-section">
      <h4>Actualités</h4>
      <div className="news-list">
        {news.map((n, i) => (
          <div key={i} className="news-row">
            <div className="news-main">
              <span className="news-title">{n.title}</span>
              <span className="news-date">{n.date}</span>
            </div>
            <p className="news-relevance">{n.relevance}</p>
            <span className={`badge ${n.tier === "verified" ? "badge-good" : "badge-warn"}`}>
              {n.tier === "verified" ? "✓ Vérifiée" : "◇ Citée"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ———— Annuaire LinkedIn (ProspectDirectory) ———— */

export function AnnuaireBlock({ employees }: { employees: Employee[] }) {
  const [q, setQ] = useState("");

  if (employees.length === 0) {
    return (
      <div className="fiche-section">
        <h4>Décideurs &amp; annuaire LinkedIn</h4>
        <p className="ann-empty">
          Aucun employé LinkedIn pour l'instant. Relancez le scraping pour rafraîchir l'annuaire.
        </p>
      </div>
    );
  }

  const nq = q.trim().toLowerCase();
  const rows = nq
    ? employees.filter((e) => `${e.name} ${e.title} ${e.domain}`.toLowerCase().includes(nq))
    : employees;

  return (
    <div className="fiche-section">
      <h4>
        Décideurs &amp; annuaire LinkedIn <span className="muted">— {employees.length}</span>
      </h4>
      <input
        className="search ann-search"
        type="search"
        placeholder="Filtrer l'annuaire…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Filtrer l'annuaire"
      />
      {rows.length === 0 ? (
        <p className="empty-note">Aucun résultat</p>
      ) : (
        <div className="ann-list">
          {rows.map((e) => (
            <div key={e.name} className="ann-row">
              <span className="contact-avatar" aria-hidden="true">{initials(e.name)}</span>
              <div className="contact-id">
                <div className="contact-name">{e.name}</div>
                <div className="contact-role">{e.title} · {e.location}</div>
              </div>
              <span className="badge badge-neutral ann-domain">{e.domain}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ———— Dirigeants Pappers (SectionOfficers) ———— */

export function OfficersBlock({ officers }: { officers: Officer[] }) {
  return (
    <div className="fiche-section">
      <h4>
        Dirigeants et Représentants{" "}
        <span className="muted">— Source : Pappers.be · {officers.length}</span>
      </h4>
      <div className="off-list">
        {officers.map((o) => (
          <div key={o.name} className="off-row">
            <span className="contact-avatar off-avatar" aria-hidden="true">
              {o.kind === "legal" ? "🏛" : initials(o.name)}
            </span>
            <div className="contact-id">
              <div className="contact-name">{o.name}</div>
              <div className="contact-role">{o.role}</div>
            </div>
            {o.gender && (
              <span className="badge badge-neutral">{o.gender === "F" ? "Femme" : "Homme"}</span>
            )}
            <span className="badge badge-neutral">Depuis {o.since}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ———— Synthèse commerciale (Hero + KpiBar + AttackPlan + CrossSell) ———— */

const ATTACK_LABELS = {
  quick_win: "Quick win",
  core_bet: "Cœur de cible",
  decision_maker_hook: "Hook décideur",
} as const;

export function FicheSynthese({ p }: { p: Prospect }) {
  return (
    <>
      <div className="syn-badges">
        {p.potential && (
          <span className={`badge ${p.potential === "élevé" ? "badge-good" : "badge-running"}`}>
            Potentiel {p.potential}
          </span>
        )}
        {p.healthScore !== null && (
          <span className={`badge ${p.healthScore > 50 ? "badge-good" : "badge-risk"}`}>
            Santé {p.healthBand}
          </span>
        )}
        {p.verifiedSources !== undefined && (
          <span className="badge badge-neutral">{p.verifiedSources} sources vérifiées</span>
        )}
      </div>
      <div className="mini-kpis">
        <div className="mini-kpi"><span className="mini-kpi-value">{p.priority ?? "—"}</span><span className="mini-kpi-label">Priorité</span></div>
        <div className="mini-kpi"><span className="mini-kpi-value">{p.signals.length}</span><span className="mini-kpi-label">Signaux</span></div>
        <div className="mini-kpi"><span className="mini-kpi-value">{p.employees?.length ?? 0}</span><span className="mini-kpi-label">Décideurs</span></div>
        <div className="mini-kpi"><span className="mini-kpi-value">{p.crossSell?.length ?? 0}</span><span className="mini-kpi-label">Cross-sell</span></div>
        <div className="mini-kpi"><span className="mini-kpi-value">{p.attack?.length ?? 0}</span><span className="mini-kpi-label">Actions</span></div>
      </div>
      {p.attack && p.attack.length > 0 && (
        <div className="fiche-section">
          <h4>Plan d'attaque</h4>
          <div className="attack-grid">
            {p.attack.map((a) => (
              <div key={a.type} className="attack-card">
                <span className="sig-type">{ATTACK_LABELS[a.type]}</span>
                <div className="attack-title">{a.title}</div>
                <p className="attack-action">{a.action}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {p.crossSell && p.crossSell.length > 0 && (
        <div className="fiche-section">
          <h4>Opportunités de cross-sell</h4>
          <div className="cross-grid">
            {p.crossSell.map((c) => (
              <div key={c.product} className="cross-card">
                <div className="attack-title">{c.product}</div>
                <p className="attack-action">{c.justification}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ———— Contacts clés ———— */

function ContactCard({ contact }: { contact: Contact }) {
  const [state, setState] = useState<"hidden" | "loading" | "shown">("hidden");
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const reveal = () => {
    if (state !== "hidden") return;
    setState("loading");
    timer.current = setTimeout(() => setState("shown"), 800);
  };

  return (
    <div className="contact-card">
      <span className="contact-avatar" aria-hidden="true">{initials(contact.name)}</span>
      <div className="contact-id">
        <div className="contact-name">{contact.name}</div>
        <div className="contact-role">{contact.role}</div>
      </div>
      {state === "shown" ? (
        <span className="contact-email">{contact.email}</span>
      ) : (
        <button className="btn-ghost" onClick={reveal} disabled={state === "loading"}>
          {state === "loading" ? "Recherche…" : "Révéler l'email · 1 jeton"}
        </button>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .replace(/^Dr /, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function ContactsBlock({
  contacts,
  otherCount,
}: {
  contacts: Contact[];
  otherCount: number;
}) {
  const [showOthers, setShowOthers] = useState(false);

  if (contacts.length === 0) {
    return (
      <p className="empty-note">
        Annuaire indisponible pour cette société (pas de page LinkedIn identifiée).
      </p>
    );
  }
  return (
    <>
      <p className="empty-note">Filtré par défaut : CEO · Comptabilité · Payroll · RH</p>
      <div className="contact-grid">
        {contacts.map((c) => (
          <ContactCard key={c.email} contact={c} />
        ))}
      </div>
      {otherCount > 0 && (
        <button className="btn-ghost others-toggle" onClick={() => setShowOthers((v) => !v)}>
          {showOthers ? "Masquer les autres contacts" : `Voir les ${otherCount} autres contacts`}
        </button>
      )}
      {showOthers && (
        <p className="empty-note">
          {otherCount} contacts hors rôles clés (production, commercial, support…) — masqués
          par défaut, recherche email/téléphone à la demande uniquement.
        </p>
      )}
    </>
  );
}
