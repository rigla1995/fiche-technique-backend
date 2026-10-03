// Mois des mensualités et des promotions : calendrier UTC, quel que soit le fuseau du serveur.
// Défaut corrigé : setDate(1) (heure locale) suivi de toISOString() (UTC) donnait « 2026-09-30 » comme « premier du
// mois » le 3 octobre à 01:30 à Paris ; la promo « 1er mois offert » (datée du 2026-10-01) ne s'appliquait pas.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DATE_UTILS = path.join(__dirname, '..', 'src', 'utils', 'dateUtils.js');
const FUSEAUX = ['UTC', 'Europe/Paris', 'Africa/Tunis', 'America/New_York', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'];

// Exécute les calculs dans un processus réglé sur le fuseau donné (TZ est lu au démarrage de Node).
const calculer = (tz) => {
  const script = `
    const u = require(${JSON.stringify(DATE_UTILS)});
    const ancien = (instant) => { const d = new Date(instant); d.setDate(1); return d.toISOString().slice(0, 10); };
    let invalide = null;
    try { u.normaliserMoisUTC('pas une date'); } catch (e) { invalide = e.name; }
    process.stdout.write(JSON.stringify({
      decalage: new Date('2026-10-03T12:00:00Z').getTimezoneOffset(),
      ancienParisNuit: ancien('2026-10-03T01:30:00+02:00'),
      premier: [
        u.premierDuMoisUTC(new Date('2026-10-03T01:30:00+02:00')),
        u.premierDuMoisUTC(new Date('2026-10-15T12:00:00Z')),
        u.premierDuMoisUTC(new Date('2026-10-01T00:30:00+02:00')),
        u.premierDuMoisUTC(new Date('2026-12-31T23:59:59Z')),
      ],
      normalise: [u.normaliserMoisUTC('2026-10-15'), u.normaliserMoisUTC('2026-10-01'), u.normaliserMoisUTC('2026-10'), u.normaliserMoisUTC('2027-01-31')],
      fin: [u.finDePeriodeUTC('2026-10-01', 1), u.finDePeriodeUTC('2026-01-15', 3), u.finDePeriodeUTC('2026-11-01', 2), u.finDePeriodeUTC('2026-03-01', 1), u.finDePeriodeUTC('2026-10-01', '12')],
      couverts: [
        u.moisCouvertsUTC('2026-10-01', '2026-10-31'),
        u.moisCouvertsUTC('2026-11-15', '2027-02-01'),
        u.moisCouvertsUTC('2026-10-01', '2026-10-01'),
        u.moisCouvertsUTC('2026-10-20', '2026-09-30'),
      ],
      invalide,
    }));
  `;
  const r = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
  assert.equal(r.status, 0, `processus TZ=${tz} : ${r.stderr}`);
  return JSON.parse(r.stdout);
};

const ATTENDU = {
  // 01:30 à Paris le 3 = 23:30 UTC le 2 → octobre ; 00:30 à Paris le 1er = 22:30 UTC le 30/09 → septembre (UTC).
  premier: ['2026-10-01', '2026-10-01', '2026-09-01', '2026-12-01'],
  normalise: ['2026-10-01', '2026-10-01', '2026-10-01', '2027-01-01'],
  fin: ['2026-10-31', '2026-04-14', '2026-12-31', '2026-03-31', '2027-09-30'],
  couverts: [
    ['2026-10-01'],
    ['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01'],
    ['2026-10-01'],
    [],
  ],
  invalide: 'RangeError',
};

for (const tz of FUSEAUX) {
  test(`mois des mensualités en UTC — TZ=${tz}`, () => {
    const r = calculer(tz);
    assert.deepEqual(r.premier, ATTENDU.premier);
    assert.deepEqual(r.normalise, ATTENDU.normalise);
    assert.deepEqual(r.fin, ATTENDU.fin);
    assert.deepEqual(r.couverts, ATTENDU.couverts);
    assert.equal(r.invalide, ATTENDU.invalide);
  });
}

test('témoin : l\'ancienne formule se trompait à Paris la nuit, pas en UTC', () => {
  const paris = calculer('Europe/Paris');
  assert.equal(paris.decalage, -120, 'le processus doit tourner en heure de Paris (été)');
  assert.equal(paris.ancienParisNuit, '2026-09-30');
  assert.equal(calculer('UTC').ancienParisNuit, '2026-10-01');
});

test('abonnementController ne mélange plus heure locale et UTC pour un mois', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'controllers', 'abonnementController.js'), 'utf8');
  assert.doesNotMatch(src, /\.setDate\(1\)/);
  assert.doesNotMatch(src, /new Date\(\w+\.getFullYear\(\), \w+\.getMonth\(\), 1\)/);
  assert.doesNotMatch(src, /setMonth\(d\.getMonth\(\) \+ Number\(monthsDuration\)\)/);
  for (const f of ['premierDuMoisUTC', 'normaliserMoisUTC', 'finDePeriodeUTC', 'moisCouvertsUTC']) {
    assert.match(src, new RegExp(`${f}\\(`), `${f} doit être employée`);
  }
});
