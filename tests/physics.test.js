import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNumber, toSI, solveVdP, vanDerPauw, hallVoltage, hall, hallMobility,
  mobility, resistivity, dopingFromResistivity, compareMobility,
} from '../physics.js';

const close = (actual, expected, relTol, msg) => {
  const rel = Math.abs(actual - expected) / Math.abs(expected);
  assert.ok(rel <= relTol, `${msg ?? ''} attendu ≈ ${expected}, obtenu ${actual} (écart ${(rel * 100).toFixed(3)} %)`);
};

test('Van der Pauw symétrique : R_A = R_B = 2 Ω → Rs = 9,064 Ω/□ et ρ = 7,25e-4 Ω·cm', () => {
  const Rs = solveVdP(2, 2);
  close(Rs, 9.064, 2e-4, 'Rs');
  const r = vanDerPauw(2, { RA: 2, RB: 2 }, 800e-9);
  close(r.Rs, 9.064, 2e-4, 'Rs (mode 2)');
  close(r.rho * 100, 7.25e-4, 1e-3, 'ρ (Ω·cm)');
  close(vanDerPauw(1, { R: 2 }).Rs, Math.PI * 2 / Math.LN2, 1e-12, 'mode 1');
});

test('Van der Pauw asymétrique : R_A = 1, R_B = 3 vérifie l’équation à 1e-10 près', () => {
  const Rs = solveVdP(1, 3);
  const residual = Math.exp(-Math.PI * 1 / Rs) + Math.exp(-Math.PI * 3 / Rs) - 1;
  assert.ok(Math.abs(residual) < 1e-10, `résidu ${residual}`);
  const r = vanDerPauw(2, { RA: 1, RB: 3 });
  assert.ok(r.f < 1 && r.f > 0.8, `f = ${r.f}`);
  assert.ok(r.warnings.some((w) => w.includes('R_A/R_B')), 'avertissement rapport > 2');
});

test('Van der Pauw 4 et 8 valeurs : moyennes et avertissement de réciprocité', () => {
  const r4 = vanDerPauw(4, { R1234: 1, R3412: 1.2, R2341: 3, R4123: 3 });
  close(r4.RA, 1.1, 1e-12);
  close(r4.RB, 3, 1e-12);
  assert.ok(r4.warnings.some((w) => w.includes('R12,34')));
  const r8 = vanDerPauw(8, {
    R1234p: 2, R1234m: -2, R3412p: 2, R3412m: 2, R2341p: 2, R2341m: 2, R4123p: 2, R4123m: 2,
  });
  close(r8.Rs, 9.064, 2e-4);
  assert.equal(r8.warnings.length, 0);
});

test('Hall : I = 1 mA, B = 0,5 T, t = 800 nm, V_H = −3,90 mV → n ≈ 1,0e18 cm⁻³, type n', () => {
  const r = hall({ VH: -3.90e-3, I: 1e-3, B: 0.5, t: 800e-9 });
  assert.equal(r.type, 'n');
  close(r.n, 1.0e18, 0.01, 'n');
  close(r.RHs, -7.8, 1e-12, 'R_Hs');
  // la convention inversée donne le type p
  assert.equal(hall({ VH: -3.90e-3, I: 1e-3, B: 0.5, t: 800e-9, invert: true }).type, 'p');
});

test('Tension de Hall : modes 2 et 8 annulent les offsets', () => {
  assert.equal(hallVoltage(2, { Vp: 1.5e-3, Vm: -0.5e-3 }), 1e-3);
  const VH = 2e-3, off = 0.7e-3;
  // V = s_I·(s_B·VH + offset)  (l'offset change de signe avec I, pas avec B)
  const v = {};
  for (const d of ['d1', 'd2']) {
    for (const [si, sI] of [['p', 1], ['m', -1]]) {
      for (const [sb, sB] of [['p', 1], ['m', -1]]) v[d + si + sb] = sI * (sB * VH + off);
    }
  }
  close(hallVoltage(8, v), VH, 1e-12);
});

test('Hall + VdP : Rs = 100 Ω/□, R_Hs = 7,8 m²/C → μ_H = 780 cm²/V·s', () => {
  close(hallMobility(7.8, 100), 780, 1e-12);
  close(hallMobility(-7.8, 100), 780, 1e-12);
});

test('Si : P à 1e15 → ρ ≈ 4,6 Ω·cm ; B à 1e15 → ρ ≈ 13,5 Ω·cm (±5 %)', () => {
  close(resistivity('Si', 'P', 1e15), 4.6, 0.05, 'Si:P');
  close(resistivity('Si', 'B', 1e15), 13.5, 0.05, 'Si:B');
});

test('GaAs n à 1e18 → μ ≈ 2700 cm²/V·s', () => {
  close(mobility('GaAs', 'n', 1e18), 2700, 0.02);
});

test('Aller-retour ρ → N → ρ cohérent à 1e-6 près', () => {
  for (const [mat, dop] of [['Si', 'P'], ['Si', 'As'], ['Si', 'B'], ['GaAs', 'n'], ['GaAs', 'p'], ['Ge', 'n'], ['Ge', 'p']]) {
    for (const rho of [1e-3, 0.05, 1, 4.6, 100]) {
      const { N, outOfRange } = dopingFromResistivity(mat, dop, rho);
      if (outOfRange) continue;
      close(resistivity(mat, dop, N), rho, 1e-6, `${mat}:${dop} ρ=${rho}`);
    }
  }
  const { N } = dopingFromResistivity('Si', 'P', resistivity('Si', 'P', 3e16));
  close(N, 3e16, 1e-6, 'N retrouvé');
});

test('Saisie : notation scientifique, virgule ou point, unités', () => {
  assert.equal(parseNumber('1e18'), 1e18);
  assert.equal(parseNumber('2,5e-3'), 2.5e-3);
  assert.equal(parseNumber(' −3,90 '), -3.9);
  assert.equal(parseNumber('1,2×10^18'), 1.2e18);
  assert.ok(Number.isNaN(parseNumber('abc')));
  assert.ok(Number.isNaN(parseNumber('')));
  close(toSI(800, 'length', 'nm'), 800e-9, 1e-12);
  close(toSI(5000, 'field', 'G'), 0.5, 1e-12);
});

test('Comparaison au modèle : mobilité nettement inférieure → compensation', () => {
  const c = compareMobility('GaAs', 'n', 1e18, 1500);
  close(c.muTh, 2708, 0.01);
  assert.equal(c.verdict, 'low');
});
