// HallLab — interface. Toute la physique est dans physics.js.
import * as P from './physics.js';
import * as S from './storage.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plain = (html) => String(html).replace(/<[^>]+>/g, '');

const TAB_NAMES = { vdp: 'Van der Pauw', hall: 'Effet Hall', dop: 'Résistivité ↔ Dopage', hist: 'Historique' };
const TAB_SHORT = { vdp: 'VdP', hall: 'Hall', dop: 'Dopage' };

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

const settings = S.loadSettings();
const values = {}; // id du champ → texte saisi
const units = { ...settings.units }; // id du champ → unité affichée
const defs = {}; // id du champ → définition
const shared = { Rs: NaN }; // Rs (Ω/□) partagé de VdP vers Hall
const lastResults = { vdp: [], hall: [], dop: [] };

const state = {
  vdpMode: '2',
  vdpVI: false,
  hallMode: '1',
  hallRsSource: 'vdp',
  hallMaterial: settings.material,
  hallInvert: settings.invertHallSign,
  dopMaterial: settings.material,
  dopDopant: settings.dopant,
  dopDir: 'N2rho',
};

const STATE_KEYS = {
  vdp: ['vdpMode', 'vdpVI'],
  hall: ['hallMode', 'hallRsSource', 'hallMaterial', 'hallInvert'],
  dop: ['dopMaterial', 'dopDopant', 'dopDir'],
};

const MATERIAL_KEYS = Object.keys(P.MATERIALS);
const ALLOWED = {
  vdpMode: ['1', '2', '4', '8'],
  vdpVI: [true, false],
  hallMode: ['1', '2', '8'],
  hallRsSource: ['vdp', 'manual'],
  hallMaterial: MATERIAL_KEYS,
  hallInvert: [true, false],
  dopMaterial: MATERIAL_KEYS,
  dopDir: ['N2rho', 'rho2N'],
};

function sanitizeState() {
  for (const [k, allowed] of Object.entries(ALLOWED)) {
    if (!allowed.includes(state[k])) state[k] = allowed.includes(String(state[k])) ? String(state[k]) : allowed[0];
  }
  if (!P.MATERIALS[state.dopMaterial].dopants[state.dopDopant]) {
    state.dopDopant = Object.keys(P.MATERIALS[state.dopMaterial].dopants)[0];
  }
}

const persist = () => S.saveSettings(settings);

// ---------------------------------------------------------------------------
// Formatage des nombres (virgule décimale, puissances de dix en exposant)
// ---------------------------------------------------------------------------

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map((c) => SUP[c] ?? c).join('');
const fr = (s) => String(s).replace('.', ',').replace(/^-/, '−');

export function fmt(x, digits = 4) {
  if (typeof x === 'string') return x;
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  let e = Math.floor(Math.log10(Math.abs(x)));
  if (e >= -3 && e < 5) return fr(Number(x.toPrecision(digits)));
  let m = Number((x / 10 ** e).toPrecision(digits));
  if (Math.abs(m) >= 10) {
    m /= 10;
    e += 1;
  }
  return `${fr(m)}×10${sup(e)}`;
}

// ---------------------------------------------------------------------------
// Champs de saisie
// ---------------------------------------------------------------------------

function unitOf(id) {
  const d = defs[id];
  const list = P.UNITS[d?.kind];
  if (!list) return '';
  const u = units[id] ?? d.unit;
  return list.some(([x]) => x === u) ? u : list[0][0];
}

function fieldHTML(d) {
  defs[d.id] = d;
  const list = P.UNITS[d.kind];
  let unit = '';
  if (list) {
    const cur = unitOf(d.id);
    unit = `<select id="${d.id}-u" data-unit-for="${d.id}" aria-label="Unité : ${esc(plain(d.label))}">${list
      .map(([u]) => `<option value="${u}"${u === cur ? ' selected' : ''}>${u}</option>`)
      .join('')}</select>`;
  } else if (d.suffix) {
    unit = `<span class="suffix">${d.suffix}</span>`;
  }
  return `<div class="field">
    <label for="${d.id}">${d.label}</label>
    <div class="input-row">
      <input id="${d.id}" data-field="${d.id}" type="text" inputmode="decimal" autocomplete="off"
        autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next"
        placeholder="${esc(d.hint ?? '')}" value="${esc(values[d.id] ?? '')}">
      ${unit}
    </div>
    ${d.help ? `<p class="help">${d.help}</p>` : ''}
    <p class="field-err" id="${d.id}-err" hidden>Nombre invalide. Exemples : 2,5 · 1e18 · −3,9e-3</p>
  </div>`;
}

function renderFields(containerId, list) {
  $(`#${containerId}`).innerHTML = list.map(fieldHTML).join('');
  list.forEach((d) => validateField(d.id));
}

function validateField(id) {
  const err = document.getElementById(`${id}-err`);
  if (!err) return;
  const txt = (values[id] ?? '').trim();
  const bad = txt !== '' && Number.isNaN(P.parseNumber(txt));
  err.hidden = !bad;
  document.getElementById(id)?.setAttribute('aria-invalid', bad ? 'true' : 'false');
}

// Valeur en SI (NaN si vide ou invalide)
function getSI(id) {
  const v = P.parseNumber(values[id]);
  if (Number.isNaN(v)) return NaN;
  const d = defs[id];
  return P.UNITS[d?.kind] ? P.toSI(v, d.kind, unitOf(id)) : v;
}

// ---------------------------------------------------------------------------
// Onglet 1 — Van der Pauw
// ---------------------------------------------------------------------------

const VDP_KEYS = {
  1: [['R', 'R (échantillon symétrique)']],
  2: [['RA', 'R<sub>A</sub> (horizontale)'], ['RB', 'R<sub>B</sub> (verticale)']],
  4: [
    ['R1234', 'R<sub>12,34</sub>'],
    ['R3412', 'R<sub>34,12</sub>'],
    ['R2341', 'R<sub>23,41</sub>'],
    ['R4123', 'R<sub>41,23</sub>'],
  ],
};
VDP_KEYS[8] = VDP_KEYS[4].flatMap(([k, l]) => [[`${k}p`, `${l} (+I)`], [`${k}m`, `${l} (−I)`]]);

const VDP_HELP = {
  1: 'R<sub>s</sub> = π·R / ln 2. À réserver aux échantillons carrés et symétriques.',
  2: 'R<sub>A</sub> et R<sub>B</sub> : résistances mesurées sur deux bords perpendiculaires.',
  4: 'R<sub>ij,kl</sub> = V<sub>kl</sub> / I<sub>ij</sub> (courant de i vers j, tension entre k et l). R<sub>A</sub> = moyenne des deux premières, R<sub>B</sub> des deux dernières.',
  8: 'Même chose avec inversion du courant : chaque paire (+I, −I) est moyennée, puis R<sub>A</sub> et R<sub>B</sub> comme en mode 4.',
};

function renderVdpFields() {
  const mode = state.vdpMode;
  const list = [];
  if (state.vdpVI) list.push({ id: 'vdp-I', label: 'Courant I', kind: 'current', unit: 'mA', hint: 'ex. 1' });
  for (const [k, l] of VDP_KEYS[mode]) {
    list.push(
      state.vdpVI
        ? { id: `vdp-V-${k}`, label: `V pour ${l}`, kind: 'voltage', unit: 'mV' }
        : { id: `vdp-R-${k}`, label: l, kind: 'resistance', unit: 'Ω' },
    );
  }
  renderFields('vdp-fields', list);
  $('#vdp-help').innerHTML =
    VDP_HELP[mode] + (state.vdpVI ? ' Chaque R est calculée comme |V| / |I|.' : '');
}

function computeVdp() {
  const mode = Number(state.vdpMode);
  const I = getSI('vdp-I');
  const v = {};
  for (const [k] of VDP_KEYS[mode]) {
    v[k] = state.vdpVI ? P.resistanceFromVI(getSI(`vdp-V-${k}`), I) : getSI(`vdp-R-${k}`);
  }
  const t = getSI('vdp-t');
  const r = P.vanDerPauw(mode, v, t);
  shared.Rs = r.Rs;

  const rows = [
    { key: 'Rs', label: 'Résistance carrée R<sub>s</sub>', value: r.Rs, unit: 'Ω/□', main: true },
    {
      key: 'rho', label: 'Résistivité ρ = R<sub>s</sub>·t', value: r.rho * 100, unit: 'Ω·cm', main: true,
      missing: Number.isFinite(r.Rs) && !(t > 0) ? 'saisis l’épaisseur t' : null,
    },
  ];
  if (mode !== 1) {
    rows.push(
      { key: 'f', label: 'Facteur f de van der Pauw', value: r.f, unit: '' },
      { key: 'ratio', label: 'Rapport R<sub>A</sub>/R<sub>B</sub>', value: r.ratio, unit: '' },
      { key: 'RA', label: 'R<sub>A</sub>', value: r.RA, unit: 'Ω' },
      { key: 'RB', label: 'R<sub>B</sub>', value: r.RB, unit: 'Ω' },
    );
  }
  if (Number.isFinite(r.Rs) && t > 0) rows.push({ key: 't', label: 'Épaisseur t', value: t * 1e9, unit: 'nm' });
  renderResults('vdp', rows, r.warnings);
}

// ---------------------------------------------------------------------------
// Onglet 2 — Effet Hall
// ---------------------------------------------------------------------------

const HALL_DIAGS = [
  ['d1', 'Diagonale A — courant 1→3, tension V<sub>2</sub> − V<sub>4</sub>'],
  ['d2', 'Diagonale B — courant 2→4, tension V<sub>3</sub> − V<sub>1</sub>'],
];
const HALL_SIGNS = [['pp', '+I, +B'], ['pm', '+I, −B'], ['mp', '−I, +B'], ['mm', '−I, −B']];

const HALL_KEYS = {
  1: [['VH', 'Tension de Hall V<sub>H</sub>']],
  2: [['Vp', 'V(+B)'], ['Vm', 'V(−B)']],
  8: HALL_DIAGS.flatMap(([d]) => HALL_SIGNS.map(([s, l]) => [d + s, `V(${l})`])),
};

const HALL_HELP = {
  1: 'Une seule tension : on suppose l’offset (désalignement des contacts) nul.',
  2: 'V<sub>H</sub> = (V(+B) − V(−B)) / 2 : l’offset, indépendant de B, s’annule.',
  8: 'V<sub>H</sub> = Σ [V(+I,+B) − V(+I,−B) − V(−I,+B) + V(−I,−B)] / 8 sur les deux diagonales : offset et effets thermoélectriques s’annulent. Saisis les tensions avec leur signe.',
};

function renderHallFields() {
  const mode = state.hallMode;
  const box = $('#hall-fields');
  if (mode === '8') {
    box.innerHTML = HALL_DIAGS.map(([d, title]) => {
      const list = HALL_SIGNS.map(([s, l]) => ({ id: `hall-${d}${s}`, label: `V(${l})`, kind: 'voltage', unit: 'mV' }));
      return `<fieldset class="group"><legend>${title}</legend><div class="fields">${list.map(fieldHTML).join('')}</div></fieldset>`;
    }).join('');
    HALL_KEYS[8].forEach(([k]) => validateField(`hall-${k}`));
  } else {
    renderFields('hall-fields', HALL_KEYS[mode].map(([k, l]) => ({ id: `hall-${k}`, label: l, kind: 'voltage', unit: 'mV' })));
  }
  $('#hall-help').innerHTML = HALL_HELP[mode];
}

function renderHallSignHelp() {
  $('#hall-sign-help').innerHTML = state.hallInvert
    ? 'Convention <strong>inversée</strong> : R<sub>H</sub> = −V<sub>H</sub>/(I·B). Le R<sub>H</sub> affiché est déjà corrigé : R<sub>H</sub> &lt; 0 ⇒ type n.'
    : 'Convention : R<sub>H</sub> = V<sub>H</sub>/(I·B) ; R<sub>H</sub> &lt; 0 ⇒ électrons (type n), R<sub>H</sub> &gt; 0 ⇒ trous (type p). Le signe dépend du câblage (sens de B, ordre des pointes) : si un échantillon de type connu sort à l’envers, coche l’inversion.';
}

const MOBILITY_VERDICT = {
  low: 'μ<sub>H</sub> est nettement inférieure au modèle : compensation (donneurs + accepteurs) ou défauts / joints de grains probables. Le dopage total N<sub>D</sub> + N<sub>A</sub> est sans doute supérieur à n.',
  high: 'μ<sub>H</sub> dépasse le modèle : vérifie r<sub>H</sub>, l’épaisseur, R<sub>s</sub>, ou une conduction parallèle (substrat, couche d’interface).',
  ok: 'Mobilité cohérente avec le modèle (écart inférieur à 20 %).',
};

function computeHall() {
  const mode = Number(state.hallMode);
  const v = {};
  for (const [k] of HALL_KEYS[mode]) v[k] = getSI(`hall-${k}`);
  const VH = P.hallVoltage(mode, v);
  const I = getSI('hall-I');
  const B = getSI('hall-B');
  const t = getSI('hall-t');
  const rHtxt = (values['hall-rH'] ?? '').trim();
  const rH = rHtxt === '' ? 1 : P.parseNumber(rHtxt);
  const Rs = state.hallRsSource === 'vdp' ? shared.Rs : getSI('hall-Rs');

  $('#hall-rs-shared').innerHTML = state.hallRsSource === 'vdp'
    ? Number.isFinite(shared.Rs)
      ? `R<sub>s</sub> repris de l’onglet Van der Pauw : <strong>${fmt(shared.Rs)} Ω/□</strong>`
      : 'Pas encore de R<sub>s</sub> : remplis l’onglet Van der Pauw ou passe en saisie manuelle.'
    : 'R<sub>s</sub> saisie à la main ci-dessous.';
  $('#hall-rs-box').hidden = state.hallRsSource !== 'manual';

  const r = P.hall({ VH, I, B, t, rH: rH > 0 ? rH : 1, Rs, invert: state.hallInvert });
  const warnings = [...r.warnings];
  if (rHtxt !== '' && !(rH > 0)) warnings.push('Facteur de Hall r<sub>H</sub> invalide : 1 utilisé.');

  const ok = Number.isFinite(r.RHs);
  const rows = [
    { key: 'type', label: 'Type de porteurs', value: r.type ? (r.type === 'n' ? 'n (électrons)' : 'p (trous)') : NaN, unit: '', main: true, chip: r.type },
    { key: 'ns', label: 'Densité surfacique n<sub>s</sub>', value: r.ns, unit: 'cm⁻²', main: true },
    { key: 'n', label: 'Densité volumique n', value: r.n, unit: 'cm⁻³', main: true, missing: ok && !(t > 0) ? 'saisis l’épaisseur t' : null },
    { key: 'muH', label: 'Mobilité de Hall μ<sub>H</sub>', value: r.muH, unit: 'cm²/V·s', main: true, missing: ok && !(Rs > 0) ? 'R<sub>s</sub> manquante' : null },
    { key: 'rho', label: 'Résistivité ρ = R<sub>s</sub>·t', value: r.rho, unit: 'Ω·cm', missing: ok && !(Rs > 0 && t > 0) ? 'R<sub>s</sub> et t requis' : null },
    { key: 'RHs', label: 'Coefficient de Hall carré R<sub>Hs</sub>', value: r.RHs * 1e4, unit: 'cm²/C' },
    { key: 'RH', label: 'Coefficient de Hall R<sub>H</sub>', value: r.RH, unit: 'cm³/C' },
    { key: 'VH', label: 'V<sub>H</sub> retenue', value: ok ? VH * 1e3 : NaN, unit: 'mV' },
    { key: 'RsUsed', label: 'R<sub>s</sub> utilisée', value: ok ? Rs : NaN, unit: 'Ω/□' },
  ];

  let note = null;
  const c = P.compareMobility(state.hallMaterial, r.type, r.n, r.muH);
  if (c) {
    const mat = P.MATERIALS[state.hallMaterial];
    const dop = mat.dopants[c.dopant];
    rows.push(
      { key: 'muTh', label: `μ modèle (${mat.label}, ${dop.label}) au même dopage`, value: c.muTh, unit: 'cm²/V·s' },
      { key: 'dev', label: 'Écart μ<sub>H</sub> / modèle', value: `${c.dev > 0 ? '+' : ''}${fr((c.dev * 100).toFixed(1))}`, unit: '%' },
    );
    note = { cls: c.verdict, html: MOBILITY_VERDICT[c.verdict] + (mat.approx ? ' (modèle du Ge approximatif)' : '') };
  }
  renderResults('hall', rows, warnings, note);
}

// ---------------------------------------------------------------------------
// Onglet 3 — Résistivité ↔ Dopage
// ---------------------------------------------------------------------------

function fillMaterialSelect(sel) {
  sel.innerHTML = MATERIAL_KEYS.map((k) => `<option value="${k}">${P.MATERIALS[k].label}${P.MATERIALS[k].approx ? ' (approx.)' : ''}</option>`).join('');
}

function fillDopantSelect() {
  const dopants = P.MATERIALS[state.dopMaterial].dopants;
  $('#dop-dopant').innerHTML = Object.entries(dopants)
    .map(([k, d]) => `<option value="${k}">${d.label}</option>`)
    .join('');
}

function renderDopFields() {
  const list = state.dopDir === 'N2rho'
    ? [{ id: 'dop-N', label: 'Dopage N', suffix: 'cm⁻³', hint: 'ex. 1e16' }]
    : [{ id: 'dop-rho', label: 'Résistivité ρ', kind: 'resistivity', unit: 'Ω·cm', hint: 'ex. 4,6' }];
  renderFields('dop-fields', list);
}

let chartArgs = { N: NaN, rho: NaN };

function computeDop() {
  const mat = state.dopMaterial;
  const dop = state.dopDopant;
  const info = P.MATERIALS[mat].dopants[dop];
  const warnings = [];
  let N = NaN;
  let rho = NaN;
  let mu = NaN;
  if (state.dopDir === 'N2rho') {
    N = P.parseNumber(values['dop-N']);
    if (N > 0) {
      mu = P.mobility(mat, dop, N);
      rho = P.resistivity(mat, dop, N);
    } else {
      N = NaN;
    }
  } else {
    const r = getSI('dop-rho') * 100; // Ω·m → Ω·cm
    if (r > 0) {
      const res = P.dopingFromResistivity(mat, dop, r);
      if (res.outOfRange === 'high') warnings.push('ρ trop élevée : il faudrait N &lt; 1e12 cm⁻³, hors du domaine du modèle.');
      if (res.outOfRange === 'low') warnings.push('ρ trop faible : il faudrait N &gt; 1e21 cm⁻³, hors du domaine du modèle.');
      if (!res.outOfRange) {
        N = res.N;
        mu = res.mu;
        rho = r;
      }
    }
  }
  if (N > 0) warnings.push(...P.dopingWarnings(mat, dop, N));
  else if (P.MATERIALS[mat].approx) warnings.push('Modèle du germanium approximatif (paramètres Caughey-Thomas génériques).');

  const rows = [
    { key: 'N', label: 'Dopage N', value: N, unit: 'cm⁻³', main: true },
    { key: 'rho', label: 'Résistivité ρ', value: rho, unit: 'Ω·cm', main: true },
    { key: 'mu', label: 'Mobilité μ', value: mu, unit: 'cm²/V·s', main: true },
    { key: 'material', label: 'Matériau', value: Number.isFinite(N) ? `${P.MATERIALS[mat].label}, ${info.label}` : NaN, unit: '' },
    { key: 'model', label: 'Modèle (300 K, ionisation complète)', value: Number.isFinite(N) ? P.MATERIALS[mat].modelName : NaN, unit: '' },
  ];
  renderResults('dop', rows, warnings);
  chartArgs = { N, rho };
  drawChart();
}

// Courbe log-log ρ(N) en canvas
const CURVE_DASH = [[], [7, 4], [2, 3]];

function drawChart() {
  const canvas = $('#dop-chart');
  if (!canvas || canvas.offsetParent === null) return;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  if (!W || !H) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const cs = getComputedStyle(document.documentElement);
  const col = (name) => cs.getPropertyValue(name).trim();
  const mat = P.MATERIALS[state.dopMaterial];

  // une courbe par jeu de paramètres distinct (Sb = As pour Masetti)
  const seen = new Set();
  const curves = [];
  for (const [key, d] of Object.entries(mat.dopants)) {
    if (seen.has(d.p)) continue;
    seen.add(d.p);
    const pts = [];
    for (let i = 0; i <= 180; i++) {
      const lx = 12 + (9 * i) / 180;
      pts.push([lx, Math.log10(P.resistivity(state.dopMaterial, key, 10 ** lx))]);
    }
    curves.push({ key, d, pts });
  }
  const selectedP = mat.dopants[state.dopDopant].p;
  const ys = curves.flatMap((c) => c.pts.map((p) => p[1]));
  const ymin = Math.floor(Math.min(...ys));
  const ymax = Math.ceil(Math.max(...ys));

  const m = { l: 44, r: 10, t: 10, b: 36 };
  const X = (lx) => m.l + ((lx - 12) / 9) * (W - m.l - m.r);
  const Y = (ly) => m.t + ((ymax - ly) / (ymax - ymin)) * (H - m.t - m.b);

  ctx.font = '11px system-ui, sans-serif';
  ctx.lineWidth = 1;
  ctx.strokeStyle = col('--grid');
  ctx.fillStyle = col('--muted');

  const xStep = Math.max(1, Math.ceil(9 / Math.floor((W - m.l - m.r) / 32)));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let e = 12; e <= 21; e++) {
    ctx.beginPath();
    ctx.moveTo(X(e), m.t);
    ctx.lineTo(X(e), H - m.b);
    ctx.stroke();
    if ((e - 12) % xStep === 0) ctx.fillText(`10${sup(e)}`, X(e), H - m.b + 5);
  }
  const yStep = Math.max(1, Math.ceil((ymax - ymin) / Math.floor((H - m.t - m.b) / 22)));
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let e = ymin; e <= ymax; e++) {
    ctx.beginPath();
    ctx.moveTo(m.l, Y(e));
    ctx.lineTo(W - m.r, Y(e));
    ctx.stroke();
    if ((e - ymin) % yStep === 0) ctx.fillText(`10${sup(e)}`, m.l - 5, Y(e));
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('N (cm⁻³)', m.l + (W - m.l - m.r) / 2, H - 1);
  ctx.save();
  ctx.translate(11, m.t + (H - m.t - m.b) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = 'middle';
  ctx.fillText('ρ (Ω·cm)', 0, 0);
  ctx.restore();

  // courbes : les autres en pointillés discrets, la sélection par-dessus
  const legend = [];
  let dashIdx = 1;
  const ordered = [...curves.filter((c) => c.d.p !== selectedP), ...curves.filter((c) => c.d.p === selectedP)];
  for (const c of ordered) {
    const selected = c.d.p === selectedP;
    const dash = selected ? [] : CURVE_DASH[dashIdx++ % CURVE_DASH.length];
    ctx.setLineDash(dash);
    ctx.strokeStyle = selected ? col('--accent') : col('--curve-muted');
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.beginPath();
    c.pts.forEach(([lx, ly], i) => (i ? ctx.lineTo(X(lx), Y(ly)) : ctx.moveTo(X(lx), Y(ly))));
    ctx.stroke();
    const names = Object.entries(mat.dopants).filter(([, d]) => d.p === c.d.p).map(([, d]) => d.label).join(' / ');
    legend.push({ names, dash, selected });
  }
  ctx.setLineDash([]);

  const { N, rho } = chartArgs;
  if (N > 0 && rho > 0) {
    const lx = Math.log10(N);
    const ly = Math.log10(rho);
    if (lx >= 12 && lx <= 21 && ly >= ymin && ly <= ymax) {
      ctx.strokeStyle = col('--accent');
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(lx), H - m.b);
      ctx.lineTo(X(lx), Y(ly));
      ctx.lineTo(m.l, Y(ly));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(X(lx), Y(ly), 5.5, 0, 2 * Math.PI);
      ctx.fillStyle = col('--accent');
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = col('--surface');
      ctx.stroke();
    }
  }

  $('#dop-legend').innerHTML = legend
    .reverse()
    .map(({ names, dash, selected }) => `<span class="${selected ? 'sel' : ''}"><svg width="26" height="8" aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" stroke-dasharray="${dash.join(' ')}"/></svg>${esc(names)}</span>`)
    .join('');
}

// ---------------------------------------------------------------------------
// Affichage des résultats
// ---------------------------------------------------------------------------

const isValue = (v) => (typeof v === 'string' ? v !== '' : Number.isFinite(v));

function renderResults(tab, rows, warnings = [], note = null) {
  lastResults[tab] = rows.filter((r) => isValue(r.value));
  const el = $(`#${tab}-results`);
  const anyMain = rows.some((r) => r.main && isValue(r.value));
  let html = '';
  if (!anyMain) {
    html = '<p class="placeholder">Saisis les mesures : les résultats s’affichent ici en direct.</p>';
  } else {
    html = '<dl class="result-list">' + rows
      .filter((r) => isValue(r.value) || r.missing)
      .map((r) => {
        const val = isValue(r.value)
          ? r.chip
            ? `<span class="chip chip-${r.chip}">${esc(r.value)}</span>`
            : `${fmt(r.value)}${r.unit ? `<span class="unit">${r.unit}</span>` : ''}`
          : `<span class="missing">${r.missing}</span>`;
        return `<div class="result${r.main ? ' main' : ''}"><dt>${r.label}</dt><dd>${val}</dd></div>`;
      })
      .join('') + '</dl>';
    if (note) html += `<p class="note note-${note.cls}">${note.html}</p>`;
  }
  if (warnings.length) {
    html += `<ul class="warnings">${warnings.map((w) => `<li>${w}</li>`).join('')}</ul>`;
  }
  el.innerHTML = html;
}

function computeAll() {
  computeVdp();
  computeHall();
  computeDop();
}

// ---------------------------------------------------------------------------
// Rendu global et synchronisation des contrôles
// ---------------------------------------------------------------------------

const THICKNESS = { label: 'Épaisseur t', kind: 'length', unit: 'nm', hint: 'ex. 800' };

function renderAllFields() {
  renderVdpFields();
  renderFields('vdp-static', [{ id: 'vdp-t', ...THICKNESS, help: 'Facultative : sert seulement à calculer ρ.' }]);
  renderFields('hall-static', [
    { id: 'hall-I', label: 'Courant I', kind: 'current', unit: 'mA', hint: 'ex. 1' },
    { id: 'hall-B', label: 'Champ magnétique B', kind: 'field', unit: 'T', hint: 'ex. 0,5' },
    { id: 'hall-t', ...THICKNESS },
  ]);
  renderHallFields();
  renderFields('hall-rs-box', [{ id: 'hall-Rs', label: 'R<sub>s</sub>', kind: 'sheet', unit: 'Ω/□' }]);
  renderFields('hall-options', [{ id: 'hall-rH', label: 'Facteur de Hall r<sub>H</sub>', hint: '1', help: '1 par défaut. Typiquement 1,1 à 1,9 selon le mécanisme de diffusion dominant.' }]);
  renderDopFields();
  renderFields('set-fields', [{ id: 'set-t', label: 'Épaisseur par défaut', kind: 'length', unit: 'nm', hint: 'ex. 800' }]);
}

function syncControls() {
  fillDopantSelect();
  for (const el of $$('[data-state]')) {
    const v = state[el.dataset.state];
    if (el.type === 'radio') el.checked = el.value === v;
    else if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  }
  renderHallSignHelp();
}

function onStateChange(key) {
  switch (key) {
    case 'vdpMode':
    case 'vdpVI':
      renderVdpFields();
      break;
    case 'hallMode':
      renderHallFields();
      break;
    case 'hallMaterial':
      settings.material = state.hallMaterial;
      break;
    case 'hallInvert':
      settings.invertHallSign = state.hallInvert;
      renderHallSignHelp();
      break;
    case 'dopMaterial': {
      settings.material = state.dopMaterial;
      const dopants = P.MATERIALS[state.dopMaterial].dopants;
      if (!dopants[state.dopDopant]) state.dopDopant = dopants[settings.dopant] ? settings.dopant : Object.keys(dopants)[0];
      fillDopantSelect();
      $('#dop-dopant').value = state.dopDopant;
      break;
    }
    case 'dopDopant':
      settings.dopant = state.dopDopant;
      break;
    case 'dopDir':
      renderDopFields();
      break;
  }
  persist();
}

// ---------------------------------------------------------------------------
// Navigation entre onglets
// ---------------------------------------------------------------------------

function showTab(tab) {
  if (!TAB_NAMES[tab]) tab = 'vdp';
  for (const b of $$('[data-tab]')) {
    const on = b.dataset.tab === tab;
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  }
  for (const p of $$('.panel')) p.hidden = p.id !== `panel-${tab}`;
  $('#tab-title').textContent = TAB_NAMES[tab];
  settings.tab = tab;
  persist();
  if (tab === 'dop') drawChart();
  if (tab === 'hist') refreshHistory();
  window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------------------
// Enregistrement et historique
// ---------------------------------------------------------------------------

function snapshot(tab) {
  const prefix = `${tab}-`;
  const vals = {};
  const uns = {};
  for (const [id, txt] of Object.entries(values)) {
    if (!id.startsWith(prefix) || !document.getElementById(id) || !String(txt).trim()) continue;
    if (id === 'hall-Rs' && state.hallRsSource !== 'manual') continue;
    vals[id] = txt;
    if (P.UNITS[defs[id]?.kind]) uns[id] = unitOf(id);
  }
  const st = {};
  for (const k of STATE_KEYS[tab]) st[k] = state[k];
  // Rs venue de l'onglet VdP : on la fige pour pouvoir rouvrir la mesure telle quelle
  if (tab === 'hall' && state.hallRsSource === 'vdp' && Number.isFinite(shared.Rs)) {
    st.hallRsSource = 'manual';
    vals['hall-Rs'] = fr(Number(shared.Rs.toPrecision(10)));
    uns['hall-Rs'] = 'Ω/□';
  }
  return { state: st, values: vals, units: uns };
}

function resultsRecord(tab) {
  return Object.fromEntries(
    lastResults[tab].map((r) => [r.key, { label: plain(r.label), value: r.value, unit: r.unit }]),
  );
}

function openRecord(rec) {
  const prefix = `${rec.tab}-`;
  for (const id of Object.keys(values)) if (id.startsWith(prefix)) delete values[id];
  for (const [id, txt] of Object.entries(rec.inputs?.values ?? {})) {
    if (id.startsWith(prefix) && typeof txt === 'string') values[id] = txt;
  }
  for (const [id, u] of Object.entries(rec.inputs?.units ?? {})) {
    if (id.startsWith(prefix) && typeof u === 'string') units[id] = u;
  }
  for (const k of STATE_KEYS[rec.tab]) {
    if (rec.inputs?.state && k in rec.inputs.state) state[k] = rec.inputs.state[k];
  }
  sanitizeState();
  renderAllFields();
  syncControls();
  computeAll();
  showTab(rec.tab);
  toast(`« ${rec.name} » rouverte dans l’onglet ${TAB_NAMES[rec.tab]}.`);
}

let saveTab = null;

function openSaveDialog(tab) {
  saveTab = tab;
  $('#save-tab-label').textContent = `Onglet : ${TAB_NAMES[tab]}`;
  $('#save-name').value = settings.lastSample ?? '';
  $('#save-notes').value = '';
  $('#save-date').textContent = `Date : ${new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}`;
  const warn = $('#save-warning');
  warn.hidden = lastResults[tab].length > 0;
  warn.textContent = 'Aucun résultat calculé pour l’instant : seules les entrées seront enregistrées.';
  $('#save-dialog').showModal();
  $('#save-name').select();
}

async function submitSave() {
  const name = $('#save-name').value.trim();
  if (!name) {
    $('#save-name').reportValidity();
    return;
  }
  const rec = {
    id: S.newId(),
    tab: saveTab,
    name,
    notes: $('#save-notes').value.trim(),
    date: new Date().toISOString(),
    inputs: snapshot(saveTab),
    results: resultsRecord(saveTab),
  };
  try {
    await S.saveMeasurement(rec);
    navigator.storage?.persist?.().catch(() => {});
    settings.lastSample = name;
    persist();
    $('#save-dialog').close();
    const durable = await S.isPersistent();
    toast(durable ? `Mesure « ${name} » enregistrée.` : `« ${name} » gardée en mémoire seulement (stockage indisponible dans ce navigateur).`);
  } catch (err) {
    toast(`Échec de l’enregistrement : ${err.message}`);
  }
}

const SUMMARY = {
  vdp: [['Rs', 'Rs'], ['rho', 'ρ']],
  hall: [['type', 'type'], ['n', 'n'], ['muH', 'μH']],
  dop: [['N', 'N'], ['rho', 'ρ'], ['mu', 'μ']],
};

function summaryOf(rec) {
  return (SUMMARY[rec.tab] ?? [])
    .filter(([k]) => rec.results?.[k] && isValue(rec.results[k].value))
    .map(([k, short]) => {
      const r = rec.results[k];
      return `${short} = ${esc(fmt(r.value))}${r.unit ? ' ' + esc(r.unit) : ''}`;
    })
    .join(' · ');
}

let historyCache = [];

async function refreshHistory() {
  try {
    historyCache = await S.listMeasurements();
  } catch (err) {
    historyCache = [];
    toast(`Lecture de l’historique impossible : ${err.message}`);
  }
  renderHistory();
}

function renderHistory() {
  const q = $('#hist-search').value.trim().toLocaleLowerCase('fr');
  const items = historyCache.filter((r) => !q || String(r.name).toLocaleLowerCase('fr').includes(q));
  const total = historyCache.length;
  $('#hist-count').textContent = total === 0
    ? 'Aucune mesure enregistrée. Utilise « Enregistrer la mesure » dans les autres onglets.'
    : q
      ? `${items.length} mesure(s) sur ${total} pour « ${$('#hist-search').value.trim()} »`
      : `${total} mesure(s), la plus récente en premier`;
  $('#hist-list').innerHTML = items
    .map((r) => {
      const date = new Date(r.date);
      const dateTxt = Number.isNaN(date.getTime()) ? esc(r.date) : date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
      return `<li class="card hist-item" data-id="${esc(r.id)}">
        <div class="hist-head">
          <span class="badge badge-${esc(r.tab)}">${TAB_SHORT[r.tab] ?? esc(r.tab)}</span>
          <strong>${esc(r.name)}</strong>
        </div>
        <div class="hist-meta">${dateTxt}</div>
        ${summaryOf(r) ? `<div class="hist-summary">${summaryOf(r)}</div>` : ''}
        ${r.notes ? `<p class="hist-notes">${esc(r.notes)}</p>` : ''}
        <div class="btn-row hist-actions">
          <button class="btn btn-small" type="button" data-act="open">Ouvrir</button>
          <button class="btn btn-small btn-ghost-danger" type="button" data-act="delete">Supprimer</button>
        </div>
        <div class="hist-confirm" hidden>
          <p>Supprimer définitivement « ${esc(r.name)} » ?</p>
          <div class="btn-row">
            <button class="btn btn-small btn-danger" type="button" data-act="confirm-delete">Oui, supprimer</button>
            <button class="btn btn-small" type="button" data-act="cancel-delete">Annuler</button>
          </div>
        </div>
      </li>`;
    })
    .join('');
}

async function onHistoryClick(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const item = btn.closest('.hist-item');
  const rec = historyCache.find((r) => r.id === item.dataset.id);
  if (!rec) return;
  const confirmBox = $('.hist-confirm', item);
  switch (btn.dataset.act) {
    case 'open':
      openRecord(rec);
      break;
    case 'delete':
      confirmBox.hidden = false;
      $('.hist-actions', item).hidden = true;
      $('[data-act="cancel-delete"]', item).focus();
      break;
    case 'cancel-delete':
      confirmBox.hidden = true;
      $('.hist-actions', item).hidden = false;
      break;
    case 'confirm-delete':
      await S.deleteMeasurement(rec.id);
      toast(`« ${rec.name} » supprimée.`);
      refreshHistory();
      break;
  }
}

// --- Export / import -------------------------------------------------------

const csvCell = (v) => {
  let s = typeof v === 'number' ? (Number.isFinite(v) ? String(v).replace('.', ',') : '') : String(v ?? '');
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
};

function toCSV(records) {
  const inputIds = [];
  const resultCols = new Map(); // "clé|unité" → titre
  for (const r of records) {
    for (const id of Object.keys(r.inputs?.values ?? {})) if (!inputIds.includes(id)) inputIds.push(id);
    for (const [k, v] of Object.entries(r.results ?? {})) {
      const key = `${k}|${v.unit}`;
      if (!resultCols.has(key)) resultCols.set(key, v.unit ? `${v.label} (${v.unit})` : v.label);
    }
  }
  const header = ['date', 'échantillon', 'onglet', 'notes', ...inputIds.flatMap((id) => [id, `${id} unité`]), ...resultCols.values()];
  const lines = [header.map(csvCell).join(';')];
  for (const r of records) {
    const row = [r.date, r.name, TAB_NAMES[r.tab] ?? r.tab, r.notes ?? ''];
    for (const id of inputIds) row.push(r.inputs?.values?.[id] ?? '', r.inputs?.units?.[id] ?? '');
    for (const key of resultCols.keys()) {
      const [k, unit] = key.split('|');
      const res = r.results?.[k];
      row.push(res && res.unit === unit ? res.value : '');
    }
    lines.push(row.map(csvCell).join(';'));
  }
  return '﻿' + lines.join('\r\n');
}

// Dans l'APK (Capacitor), on écrit le fichier puis on ouvre le partage Android.
const native = () => window.Capacitor?.isNativePlatform?.() === true;

async function shareNative(filename, text) {
  const { Filesystem, Share } = window.Capacitor.Plugins;
  const { uri } = await Filesystem.writeFile({ path: filename, data: text, directory: 'CACHE', encoding: 'utf8' });
  try {
    await Share.share({ title: filename, files: [uri] });
  } catch (err) {
    if (!/cancel/i.test(err?.message ?? '')) throw err;
  }
}

async function shareOrDownload(filename, text, mime) {
  if (native()) {
    try {
      await shareNative(filename, text);
    } catch (err) {
      toast(`Export impossible : ${err.message}`);
    }
    return;
  }
  const blob = new Blob([text], { type: mime });
  const mobile = window.matchMedia('(pointer: coarse)').matches;
  if (mobile && navigator.canShare) {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const today = () => new Date().toISOString().slice(0, 10);

async function exportData(kind) {
  const records = await S.listMeasurements();
  if (!records.length) {
    toast('Rien à exporter : l’historique est vide.');
    return;
  }
  if (kind === 'csv') {
    await shareOrDownload(`halllab-mesures-${today()}.csv`, toCSV(records), 'text/csv');
  } else {
    const data = { app: 'HallLab', format: 1, exportedAt: new Date().toISOString(), measurements: records };
    await shareOrDownload(`halllab-sauvegarde-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
  }
}

function isValidRecord(r) {
  return (
    r && typeof r === 'object' &&
    typeof r.id === 'string' && r.id.length > 0 &&
    ['vdp', 'hall', 'dop'].includes(r.tab) &&
    typeof r.name === 'string' &&
    typeof r.date === 'string' &&
    r.inputs && typeof r.inputs === 'object'
  );
}

async function importJSON(file) {
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data?.measurements;
    if (!Array.isArray(list)) throw new Error('aucune liste de mesures trouvée');
    const valid = list.filter(isValidRecord).map((r) => ({
      id: r.id, tab: r.tab, name: r.name, notes: typeof r.notes === 'string' ? r.notes : '', date: r.date,
      inputs: r.inputs, results: r.results && typeof r.results === 'object' ? r.results : {},
    }));
    await S.saveMany(valid);
    const skipped = list.length - valid.length;
    toast(`${valid.length} mesure(s) importée(s)${skipped ? `, ${skipped} ignorée(s) (format invalide)` : ''}.`);
    refreshHistory();
  } catch (err) {
    toast(`Import impossible : ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Petits éléments d'interface
// ---------------------------------------------------------------------------

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3500);
}

// Barre de touches ± / ×10ⁿ / − : le clavier décimal des téléphones n'a ni « e » ni « − »
function setupKeybar() {
  const bar = $('#keybar');
  let target = null;
  document.addEventListener('focusin', (e) => {
    if (e.target.matches?.('input[data-field]')) {
      target = e.target;
      target.closest('.field').append(bar);
      bar.hidden = false;
    }
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!document.activeElement?.matches?.('input[data-field]')) bar.hidden = true;
    }, 0);
  });
  bar.addEventListener('pointerdown', (e) => e.preventDefault()); // garde le focus dans le champ
  bar.addEventListener('click', (e) => {
    const key = e.target.closest('button')?.dataset.key;
    if (!key || !target) return;
    const v = target.value;
    const start = target.selectionStart ?? v.length;
    const end = target.selectionEnd ?? v.length;
    if (key === 'sign') {
      target.value = /^[-−]/.test(v) ? v.slice(1) : `-${v}`;
      const shift = target.value.length - v.length;
      target.setSelectionRange(start + shift, end + shift);
    } else {
      const ins = key === 'exp' ? 'e' : '-';
      target.value = v.slice(0, start) + ins + v.slice(end);
      target.setSelectionRange(start + 1, start + 1);
    }
    target.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function setupInstall() {
  let deferred = null;
  const btn = $('#install-btn');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });
  btn.addEventListener('click', async () => {
    if (!deferred) return;
    btn.hidden = true;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null;
  });
  window.addEventListener('appinstalled', () => (btn.hidden = true));
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

function applyDefaultThickness() {
  const { value, unit } = settings.thickness ?? {};
  values['set-t'] = value ?? '';
  if (unit) units['set-t'] = unit;
  if (!value) return;
  for (const id of ['vdp-t', 'hall-t']) {
    if (!values[id]) {
      values[id] = value;
      units[id] = unit;
    }
  }
}

function init() {
  sanitizeState();
  applyDefaultThickness();
  fillMaterialSelect($('#hall-material'));
  fillMaterialSelect($('#dop-material'));
  renderAllFields();
  syncControls();

  document.addEventListener('input', (e) => {
    const id = e.target.dataset?.field;
    if (!id) return;
    values[id] = e.target.value;
    validateField(id);
    if (id === 'set-t') {
      settings.thickness = { value: e.target.value.trim(), unit: unitOf('set-t') };
      persist();
      return;
    }
    computeAll();
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset?.state) {
      const key = el.dataset.state;
      state[key] = el.type === 'checkbox' ? el.checked : el.value;
      onStateChange(key);
      computeAll();
    } else if (el.dataset?.unitFor) {
      const id = el.dataset.unitFor;
      units[id] = el.value;
      settings.units[id] = el.value;
      if (id === 'set-t') settings.thickness = { value: (values['set-t'] ?? '').trim(), unit: el.value };
      persist();
      computeAll();
    } else if (el.dataset?.field === 'set-t') {
      // remplit t dans les onglets où il est encore vide
      for (const id of ['vdp-t', 'hall-t']) {
        const input = document.getElementById(id);
        if (input && !values[id] && settings.thickness.value) {
          values[id] = settings.thickness.value;
          units[id] = settings.thickness.unit;
          input.value = values[id];
          document.getElementById(`${id}-u`).value = unitOf(id);
        }
      }
      computeAll();
    }
  });

  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('.tabbar').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tabs = $$('[data-tab]');
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
    showTab(next.dataset.tab);
  });

  $$('[data-save]').forEach((b) => b.addEventListener('click', () => openSaveDialog(b.dataset.save)));
  $('#save-form').addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'save') return; // « Annuler » ferme simplement le dialogue
    e.preventDefault();
    submitSave();
  });

  $('#hist-search').addEventListener('input', renderHistory);
  $('#hist-list').addEventListener('click', onHistoryClick);
  $('#export-csv').addEventListener('click', () => exportData('csv'));
  $('#export-json').addEventListener('click', () => exportData('json'));
  $('#import-json').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) importJSON(file);
    e.target.value = '';
  });

  setupKeybar();
  setupInstall();

  const canvas = $('#dop-chart');
  if ('ResizeObserver' in window) new ResizeObserver(() => drawChart()).observe(canvas);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', drawChart);

  computeAll();
  showTab(settings.tab);

  // Dans l'APK, les fichiers sont déjà embarqués : pas besoin du service worker.
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !native()) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker :', err));
  }
}

init();
