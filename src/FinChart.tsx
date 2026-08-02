import type { Exercice } from "./types";

/**
 * Graphe CA + résultat net sur 5 exercices — SVG maison, calqué sur la
 * section « Données Financières » de l'app (aire bleue = CA, ligne = résultat).
 * Un seul axe, légende toujours présente, valeurs de fin en étiquette directe.
 */

export function fmtEur(kEur: number): string {
  if (Math.abs(kEur) >= 1000) {
    // arrondi demi-supérieur explicite (1650 → « 1,7 M€ », pas « 1,6 »)
    return `${(Math.round(kEur / 100) / 10).toFixed(1).replace(".", ",")} M€`;
  }
  return `${Math.round(kEur)} k€`;
}

const W = 640;
const H = 210;
const M = { l: 62, r: 14, t: 16, b: 26 };

export function FinChart({ exercices }: { exercices: Exercice[] }) {
  const caMax = Math.max(...exercices.map((e) => e.ca)) * 1.06;
  const resMin = Math.min(0, ...exercices.map((e) => e.resultat)) * 1.4;

  const x = (i: number) =>
    M.l + (i * (W - M.l - M.r)) / Math.max(1, exercices.length - 1);
  const y = (v: number) =>
    M.t + ((caMax - v) * (H - M.t - M.b)) / (caMax - resMin);

  const caPts = exercices.map((e, i) => `${x(i)},${y(e.ca)}`).join(" ");
  const caArea = `${M.l},${y(0)} ${caPts} ${x(exercices.length - 1)},${y(0)}`;
  const resPts = exercices.map((e, i) => `${x(i)},${y(e.resultat)}`).join(" ");

  const last = exercices[exercices.length - 1];
  const ticks = [0, caMax / 2, caMax];

  return (
    <figure className="finchart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Chiffre d'affaires et résultat net, ${exercices[0].year}–${last.year}`}
      >
        {/* grille + libellés d'axe */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={M.l - 8} y={y(t) + 3.5} className="tick" textAnchor="end">
              {fmtEur(t)}
            </text>
          </g>
        ))}
        {/* aire + ligne CA */}
        <polygon points={caArea} className="ca-area" />
        <polyline points={caPts} className="ca-line" />
        {/* ligne résultat net */}
        <polyline points={resPts} className="res-line" />
        {/* points + années */}
        {exercices.map((e, i) => (
          <g key={e.year}>
            <circle cx={x(i)} cy={y(e.ca)} r="3" className="ca-dot" />
            <circle cx={x(i)} cy={y(e.resultat)} r="3" className="res-dot" />
            <text x={x(i)} y={H - 8} className="tick" textAnchor="middle">
              {e.year}
            </text>
          </g>
        ))}
        {/* étiquettes directes de fin de série */}
        <text x={x(exercices.length - 1) - 8} y={y(last.ca) - 9} className="endlabel" textAnchor="end">
          {fmtEur(last.ca)}
        </text>
        <text
          x={x(exercices.length - 1) - 8}
          y={y(last.resultat) - 9}
          className="endlabel"
          textAnchor="end"
        >
          {fmtEur(last.resultat)}
        </text>
      </svg>
      <figcaption className="fin-legend">
        <span><span className="dot dot-ca" aria-hidden="true" /> Chiffre d'affaires</span>
        <span><span className="dot dot-res" aria-hidden="true" /> Résultat net</span>
      </figcaption>
    </figure>
  );
}
