// HallLab — physique pure (aucun accès au DOM).
// Conventions : toutes les grandeurs d'entrée sont en SI (V, A, T, m, Ω),
// sauf les modèles de dopage, définis comme dans la littérature en
// cm⁻³, cm²/V·s et Ω·cm.

export const Q = 1.602176634e-19; // charge élémentaire (C)

// ---------------------------------------------------------------------------
// Saisie et unités
// ---------------------------------------------------------------------------

// Accepte "1e18", "2,5e-3", "2.5E-3", "−3,9", "1,2×10^18", "4 700".
export function parseNumber(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;
  if (input == null) return NaN;
  let s = String(input).trim().replace(/[\s  ]/g, '');
  if (s === '') return NaN;
  s = s.replace(/[−–]/g, '-').replace(/,/g, '.');
  s = s.replace(/[x×*·]10\^?/i, 'e');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return NaN;
  return Number(s);
}

// Pour chaque type de grandeur : [symbole, facteur vers le SI].
export const UNITS = {
  voltage: [['V', 1], ['mV', 1e-3], ['µV', 1e-6]],
  current: [['A', 1], ['mA', 1e-3], ['µA', 1e-6], ['nA', 1e-9]],
  field: [['T', 1], ['mT', 1e-3], ['G', 1e-4]],
  length: [['nm', 1e-9], ['µm', 1e-6], ['cm', 1e-2]],
  resistance: [['Ω', 1], ['kΩ', 1e3], ['MΩ', 1e6]],
  sheet: [['Ω/□', 1], ['kΩ/□', 1e3], ['MΩ/□', 1e6]],
  resistivity: [['Ω·cm', 1e-2], ['mΩ·cm', 1e-5], ['kΩ·cm', 10]],
};

export function unitFactor(kind, unit) {
  const list = UNITS[kind];
  if (!list) return 1;
  const found = list.find(([u]) => u === unit);
  return found ? found[1] : list[0][1];
}

export function toSI(value, kind, unit) {
  return value * unitFactor(kind, unit);
}

// ---------------------------------------------------------------------------
// Van der Pauw
// ---------------------------------------------------------------------------

// Résout exp(−π·RA/Rs) + exp(−π·RB/Rs) = 1 par Newton-Raphson.
export function solveVdP(RA, RB, tol = 1e-12, maxIter = 200) {
  if (!(RA > 0) || !(RB > 0)) return NaN;
  let Rs = (Math.PI * (RA + RB)) / (2 * Math.LN2);
  for (let i = 0; i < maxIter; i++) {
    const a = Math.exp((-Math.PI * RA) / Rs);
    const b = Math.exp((-Math.PI * RB) / Rs);
    const F = a + b - 1;
    const dF = (Math.PI / (Rs * Rs)) * (RA * a + RB * b);
    let next = Rs - F / dF;
    if (!(next > 0)) next = Rs / 2;
    if (Math.abs(next - Rs) <= tol * Rs) return next;
    Rs = next;
  }
  return Rs;
}

// Facteur f tel que Rs = π/ln2 · (RA+RB)/2 · f
export function vdpFactor(RA, RB, Rs) {
  return (Rs * Math.LN2) / (Math.PI * (RA + RB) / 2);
}

export function relDiff(a, b) {
  const m = (Math.abs(a) + Math.abs(b)) / 2;
  return m > 0 ? Math.abs(Math.abs(a) - Math.abs(b)) / m : 0;
}

const mean = (...xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

// R = |V| / |I| (signe ignoré : on saisit des tensions signées ou non)
export function resistanceFromVI(V, I) {
  if (!Number.isFinite(V) || !Number.isFinite(I) || I === 0) return NaN;
  return Math.abs(V) / Math.abs(I);
}

/**
 * Analyse complète Van der Pauw.
 * mode 1 : { R }
 * mode 2 : { RA, RB }
 * mode 4 : { R1234, R3412, R2341, R4123 }
 * mode 8 : mêmes clés suffixées p (+I) et m (−I) : R1234p, R1234m, …
 * t (m) facultatif.
 */
export function vanDerPauw(mode, v, t) {
  const warnings = [];
  const out = { RA: NaN, RB: NaN, Rs: NaN, f: NaN, ratio: NaN, rho: NaN, warnings };
  const abs = (x) => Math.abs(x);
  let pairs = null;

  if (mode === 1) {
    const R = abs(v.R);
    if (!(R > 0)) return out;
    out.RA = out.RB = R;
    out.Rs = (Math.PI * R) / Math.LN2;
    out.f = 1;
  } else {
    if (mode === 2) {
      out.RA = abs(v.RA);
      out.RB = abs(v.RB);
    } else if (mode === 4 || mode === 8) {
      if (mode === 4) {
        pairs = { R1234: abs(v.R1234), R3412: abs(v.R3412), R2341: abs(v.R2341), R4123: abs(v.R4123) };
      } else {
        pairs = {};
        for (const k of ['R1234', 'R3412', 'R2341', 'R4123']) {
          const p = abs(v[k + 'p']);
          const m = abs(v[k + 'm']);
          pairs[k] = mean(p, m);
          if (p > 0 && m > 0 && relDiff(p, m) > 0.05) {
            warnings.push(`${label(k)} : écart de ${pct(relDiff(p, m))} entre +I et −I (contacts non ohmiques ou offset important ?).`);
          }
        }
      }
      out.RA = mean(pairs.R1234, pairs.R3412);
      out.RB = mean(pairs.R2341, pairs.R4123);
      const dA = relDiff(pairs.R1234, pairs.R3412);
      const dB = relDiff(pairs.R2341, pairs.R4123);
      out.reciprocityA = dA;
      out.reciprocityB = dB;
      if (pairs.R1234 > 0 && pairs.R3412 > 0 && dA > 0.05) {
        warnings.push(`R12,34 et R34,12 diffèrent de ${pct(dA)} (> 5 %) : contacts probablement non ohmiques.`);
      }
      if (pairs.R2341 > 0 && pairs.R4123 > 0 && dB > 0.05) {
        warnings.push(`R23,41 et R41,23 diffèrent de ${pct(dB)} (> 5 %) : contacts probablement non ohmiques.`);
      }
    } else {
      return out;
    }
    if (!(out.RA > 0) || !(out.RB > 0)) return out;
    out.Rs = solveVdP(out.RA, out.RB);
    out.f = vdpFactor(out.RA, out.RB, out.Rs);
  }

  out.ratio = out.RA / out.RB;
  if (Math.max(out.ratio, 1 / out.ratio) > 2) {
    warnings.push(`Rapport R_A/R_B = ${out.ratio.toPrecision(3)} : hors de [0,5 ; 2], géométrie ou contacts douteux.`);
  }
  if (t > 0) out.rho = out.Rs * t; // Ω·m
  return out;
}

function label(k) {
  return 'R' + k.slice(1, 3) + ',' + k.slice(3, 5);
}

function pct(x) {
  return (x * 100).toFixed(1).replace('.', ',') + ' %';
}

// ---------------------------------------------------------------------------
// Effet Hall
// ---------------------------------------------------------------------------

/**
 * Tension de Hall à partir des mesures.
 * mode 1 : { VH }
 * mode 2 : { Vp, Vm }  → (V(+B) − V(−B)) / 2
 * mode 8 : { d1pp, d1pm, d1mp, d1mm, d2pp, d2pm, d2mp, d2mm }
 *          dX = diagonale, 1re lettre = signe de I, 2e = signe de B.
 *          V_H = Σ_d [V(+I,+B) − V(+I,−B) − V(−I,+B) + V(−I,−B)] / 8
 */
export function hallVoltage(mode, v) {
  if (mode === 1) return v.VH;
  if (mode === 2) return (v.Vp - v.Vm) / 2;
  if (mode === 8) {
    const d = (p) => v[p + 'pp'] - v[p + 'pm'] - v[p + 'mp'] + v[p + 'mm'];
    return (d('d1') + d('d2')) / 8;
  }
  return NaN;
}

// Mobilité de Hall en cm²/V·s à partir de R_Hs (m²/C) et Rs (Ω/□)
export function hallMobility(RHs, Rs) {
  if (!(Rs > 0) || !Number.isFinite(RHs)) return NaN;
  return (Math.abs(RHs) / Rs) * 1e4;
}

/**
 * Analyse Hall. Entrées SI : VH (V), I (A), B (T), t (m, facultatif),
 * rH (sans dimension), Rs (Ω/□, facultatif), invert (inverse la convention).
 * Convention par défaut : R_H < 0 → type n.
 */
export function hall({ VH, I, B, t, rH = 1, Rs, invert = false }) {
  const out = {
    RHs: NaN, ns: NaN, n: NaN, RH: NaN, type: null, muH: NaN, rho: NaN, warnings: [],
  };
  if (!Number.isFinite(VH) || !(Math.abs(I) > 0) || !(Math.abs(B) > 0)) return out;
  if (VH === 0) {
    out.warnings.push('Tension de Hall nulle : impossible de déterminer la densité de porteurs.');
    return out;
  }
  const r = rH > 0 ? rH : 1;
  out.RHs = (VH / (I * B)) * (invert ? -1 : 1); // m²/C
  out.type = out.RHs < 0 ? 'n' : 'p';
  const nsSI = r / (Q * Math.abs(out.RHs)); // m⁻²
  out.ns = nsSI * 1e-4; // cm⁻²
  if (t > 0) {
    out.n = (nsSI / t) * 1e-6; // cm⁻³
    out.RH = out.RHs * t * 1e6; // cm³/C
  }
  if (Rs > 0) {
    out.muH = hallMobility(out.RHs, Rs);
    if (t > 0) out.rho = Rs * t * 100; // Ω·cm
  }
  return out;
}

// ---------------------------------------------------------------------------
// Modèles de mobilité à 300 K (N en cm⁻³, μ en cm²/V·s)
// ---------------------------------------------------------------------------

const MASETTI_P = { muMin1: 68.5, muMin2: 68.5, muMax: 1414, mu1: 56.1, Pc: 0, Cr: 9.20e16, Cs: 3.41e20, alpha: 0.711, beta: 1.98 };
const MASETTI_AS = { muMin1: 52.2, muMin2: 52.2, muMax: 1417, mu1: 43.4, Pc: 0, Cr: 9.68e16, Cs: 3.43e20, alpha: 0.680, beta: 2.0 };
const MASETTI_B = { muMin1: 44.9, muMin2: 0, muMax: 470.5, mu1: 29.0, Pc: 9.23e16, Cr: 2.23e17, Cs: 6.10e20, alpha: 0.719, beta: 2.0 };

export const MATERIALS = {
  Si: {
    label: 'Si',
    dopants: {
      P: { label: 'n — Phosphore (P)', type: 'n', model: 'masetti', p: MASETTI_P },
      As: { label: 'n — Arsenic (As)', type: 'n', model: 'masetti', p: MASETTI_AS },
      Sb: { label: 'n — Antimoine (Sb)', type: 'n', model: 'masetti', p: MASETTI_AS },
      B: { label: 'p — Bore (B)', type: 'p', model: 'masetti', p: MASETTI_B },
    },
    defaults: { n: 'P', p: 'B' },
    modelName: 'Masetti (1983)',
  },
  GaAs: {
    label: 'GaAs',
    dopants: {
      n: { label: 'type n', type: 'n', model: 'ct', p: { muMin: 500, muMax: 9400, Nref: 6e16, alpha: 0.394 } },
      p: { label: 'type p', type: 'p', model: 'ct', p: { muMin: 20, muMax: 491.5, Nref: 1.48e17, alpha: 0.38 } },
    },
    defaults: { n: 'n', p: 'p' },
    modelName: 'Caughey-Thomas',
  },
  Ge: {
    label: 'Ge',
    approx: true,
    dopants: {
      n: { label: 'type n', type: 'n', model: 'ct', p: { muMin: 150, muMax: 3900, Nref: 1e17, alpha: 0.55 } },
      p: { label: 'type p', type: 'p', model: 'ct', p: { muMin: 50, muMax: 1900, Nref: 2.7e17, alpha: 0.55 } },
    },
    defaults: { n: 'n', p: 'p' },
    modelName: 'Caughey-Thomas (approximatif)',
  },
};

export const N_MIN = 1e12;
export const N_MAX = 1e21;

function masetti(N, p) {
  return (
    p.muMin1 * Math.exp(-p.Pc / N) +
    (p.muMax - p.muMin2) / (1 + Math.pow(N / p.Cr, p.alpha)) -
    p.mu1 / (1 + Math.pow(p.Cs / N, p.beta))
  );
}

function caugheyThomas(N, p) {
  return p.muMin + (p.muMax - p.muMin) / (1 + Math.pow(N / p.Nref, p.alpha));
}

function getDopant(material, dopant) {
  const m = MATERIALS[material];
  if (!m) throw new Error(`Matériau inconnu : ${material}`);
  const d = m.dopants[dopant];
  if (!d) throw new Error(`Dopant inconnu pour ${material} : ${dopant}`);
  return d;
}

export function mobility(material, dopant, N) {
  if (!(N > 0)) return NaN;
  const d = getDopant(material, dopant);
  return d.model === 'masetti' ? masetti(N, d.p) : caugheyThomas(N, d.p);
}

// ρ en Ω·cm (ionisation complète)
export function resistivity(material, dopant, N) {
  const mu = mobility(material, dopant, N);
  return 1 / (Q * N * mu);
}

// Bissection en log10(N) sur [1e12, 1e21]. Renvoie { N, mu, outOfRange }.
export function dopingFromResistivity(material, dopant, rho) {
  if (!(rho > 0)) return { N: NaN, mu: NaN, outOfRange: null };
  const rhoLow = resistivity(material, dopant, N_MAX);
  const rhoHigh = resistivity(material, dopant, N_MIN);
  if (rho > rhoHigh) return { N: NaN, mu: NaN, outOfRange: 'high' };
  if (rho < rhoLow) return { N: NaN, mu: NaN, outOfRange: 'low' };
  let lo = Math.log10(N_MIN);
  let hi = Math.log10(N_MAX);
  // ρ décroît quand N augmente
  for (let i = 0; i < 200 && hi - lo > 1e-14; i++) {
    const mid = (lo + hi) / 2;
    if (resistivity(material, dopant, 10 ** mid) > rho) lo = mid;
    else hi = mid;
  }
  const N = 10 ** ((lo + hi) / 2);
  return { N, mu: mobility(material, dopant, N), outOfRange: null };
}

export function dopingWarnings(material, dopant, N) {
  const w = [];
  const m = MATERIALS[material];
  if (m?.approx) w.push('Modèle du germanium approximatif (paramètres Caughey-Thomas génériques).');
  if (material === 'GaAs' && m.dopants[dopant]?.type === 'n' && N > 1e19) {
    w.push('n-GaAs au-delà de 1e19 cm⁻³ : le dopage actif sature, la valeur réelle de N est probablement plus faible.');
  }
  if (N > 0 && (N < N_MIN || N > N_MAX)) w.push('Dopage hors du domaine 1e12 – 1e21 cm⁻³ des modèles.');
  return w;
}

/**
 * Compare la mobilité de Hall mesurée au modèle du matériau.
 * n : densité volumique (cm⁻³), type 'n' ou 'p'.
 */
export function compareMobility(material, type, n, muH) {
  const m = MATERIALS[material];
  if (!m || !type || !(n > 0) || !(muH > 0)) return null;
  const dopant = m.defaults[type];
  const muTh = mobility(material, dopant, n);
  const dev = (muH - muTh) / muTh;
  let verdict = 'ok';
  if (dev < -0.2) verdict = 'low';
  else if (dev > 0.2) verdict = 'high';
  return { dopant, muTh, dev, verdict };
}
