import { useEffect, useRef, useState } from "react";
import { FinChart, fmtEur } from "./FinChart";
import type { Contact, Financials, Signal } from "./types";

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

/* ———— Signaux ———— */

export function SignalList({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) {
    return <p className="empty-note">Aucun signal détecté sur la période.</p>;
  }
  return (
    <ul className="signal-list">
      {signals.map((s, i) => (
        <li key={i} className="signal-item">
          <span className="signal-date">{s.date}</span>
          <span className="signal-title">{s.title}</span>
          <span className="signal-source">
            {s.source} <span aria-hidden="true" title="Lien source (démo)">↗</span>
          </span>
        </li>
      ))}
    </ul>
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
