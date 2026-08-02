import { useEffect, useRef, useState } from "react";
import type { Contact, Prospect } from "./types";

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

      {/* 2. Santé */}
      <section className="fiche-section">
        <h4>Santé financière</h4>
        {healthUnknown || p.healthScore === null ? (
          <div className="health-row">
            <span className="badge badge-unknown">? Santé inconnue</span>
            <span className="health-source">Aucune donnée Pappers pour ce numéro d'entreprise</span>
          </div>
        ) : (
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
        )}
      </section>

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
