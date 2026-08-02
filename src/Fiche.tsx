import { useEffect, useRef, useState } from "react";
import { FinChart, fmtEur } from "./FinChart";
import type { Contact, Financials, Prospect } from "./types";

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
        <span className={`stat-delta ${deltaPct >= 0 ? "delta-up" : "delta-down"}`}>
          {deltaPct >= 0 ? "↗" : "↘"} {Math.abs(deltaPct).toFixed(0)} %
        </span>
      )}
    </span>
  );
}

function delta(last: number, prev: number): number | null {
  return prev === 0 ? null : ((last - prev) / Math.abs(prev)) * 100;
}

/** La section « Données financières » complète : chips, graphique/tableau. */
function Financiere({ f }: { f: Financials }) {
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

function Etablissements({ f }: { f: Financials }) {
  const actifs = f.etablissements.filter((e) => e.status === "actif").length;
  const inactifs = f.etablissements.length - actifs;
  return (
    <>
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
    </>
  );
}

export function Fiche({ prospect, healthUnknown }: { prospect: Prospect; healthUnknown: boolean }) {
  const [showOthers, setShowOthers] = useState(false);
  const p = prospect;

  return (
    <div className="fiche">
      {/* 1. Pourquoi appeler maintenant */}
      {p.whyCallNow && (
        <div className="why-call">
          <div className="why-call-label">Pourquoi appeler maintenant</div>
          <p>{p.whyCallNow}</p>
        </div>
      )}

      {/* 2. Données financières */}
      <section className="fiche-section">
        <h4>
          Données financières{" "}
          <span className="muted">
            — Source : Pappers{p.financials ? ` · ${p.financials.exercices.length} exercices` : ""}
          </span>
        </h4>
        {healthUnknown || p.healthScore === null || !p.financials ? (
          <div className="health-row">
            <span className="badge badge-unknown">? Santé inconnue</span>
            <span className="health-source">Aucune donnée Pappers pour ce numéro d'entreprise</span>
          </div>
        ) : (
          <>
            <div className="health-row">
              <span className={`badge ${p.healthScore > 50 ? "badge-good" : "badge-risk"}`}>
                {p.healthScore > 50 ? "✓" : "!"} {p.healthBand} · {p.healthScore}/100
              </span>
              <span className="health-meter" role="img" aria-label={`Score ${p.healthScore} sur 100`}>
                <span
                  className={`health-meter-fill ${p.healthScore > 50 ? "good" : "risk"}`}
                  style={{ width: `${p.healthScore}%` }}
                />
              </span>
              <span className="health-source">Source : Pappers · 2 août 2026</span>
            </div>
            <Financiere f={p.financials} />
          </>
        )}
      </section>

      {/* 2 bis. Établissements */}
      {!healthUnknown && p.financials && (
        <section className="fiche-section">
          <Etablissements f={p.financials} />
        </section>
      )}

      {/* 3. Signaux */}
      <section className="fiche-section">
        <h4>Signaux — 12 derniers mois</h4>
        {p.signals.length === 0 ? (
          <p className="empty-note">Aucun signal détecté sur la période.</p>
        ) : (
          <ul className="signal-list">
            {p.signals.map((s, i) => (
              <li key={i} className="signal-item">
                <span className="signal-date">{s.date}</span>
                <span className="signal-title">{s.title}</span>
                <span className="signal-source">
                  {s.source} <span aria-hidden="true" title="Lien source (démo)">↗</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 4. Contacts clés */}
      <section className="fiche-section">
        <h4>Contacts clés <span className="muted">— CEO · Comptabilité · Payroll · RH</span></h4>
        {p.contacts.length === 0 ? (
          <p className="empty-note">
            Annuaire indisponible pour cette société (pas de page LinkedIn identifiée).
          </p>
        ) : (
          <>
            <div className="contact-grid">
              {p.contacts.map((c) => (
                <ContactCard key={c.email} contact={c} />
              ))}
            </div>
            {p.otherContactsCount > 0 && (
              <button className="btn-ghost others-toggle" onClick={() => setShowOthers((v) => !v)}>
                {showOthers
                  ? "Masquer les autres contacts"
                  : `Voir les ${p.otherContactsCount} autres contacts`}
              </button>
            )}
            {showOthers && (
              <p className="empty-note">
                {p.otherContactsCount} contacts hors rôles clés (production, commercial, support…) —
                masqués par défaut, recherche email/téléphone à la demande uniquement.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
