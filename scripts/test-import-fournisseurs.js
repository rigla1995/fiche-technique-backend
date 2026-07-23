/* Test E2E — Ajout dynamique des fournisseurs (backend démarré sur :3000).
 * Vérifie : modèle Excel, import (création + affectation à TOUTES les activités
 * et labos), doublons fichier/répertoire ignorés, nom requis. Auto-nettoyage. */
require('dotenv').config();
const pool = require('../src/config/database');
const ExcelJS = require('exceljs');

const BASE = 'http://localhost:3000';
const EMAIL = process.env.E2E_EMAIL || 'demo@dar-yasmine.tn';
const PASSWORD = process.env.E2E_PASSWORD || 'DemoVitrine2026!';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

(async () => {
  try {
    const login = await fetch(`${BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const { token, user } = await login.json();
    check('login client démo', !!token);
    const H = { Authorization: `Bearer ${token}` };

    // Modèle Excel
    const tpl = await fetch(`${BASE}/api/entreprise/fournisseurs/template`, { headers: H });
    check('modèle xlsx', tpl.status === 200 && (tpl.headers.get('content-type') || '').includes('spreadsheetml'));

    // Un nom déjà existant dans le répertoire (pour le check de doublon)
    const fList = await (await fetch(`${BASE}/api/entreprise/fournisseurs`, { headers: H })).json();
    const existant = (Array.isArray(fList) ? fList : fList.fournisseurs || [])[0]?.nom || null;

    // Fichier d'import : 2 valides, 1 doublon fichier, 1 doublon répertoire, 1 sans nom
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Fournisseurs');
    ws.addRow(['Nom', 'Téléphone', 'Adresse']);
    ws.addRow(['TEST-IMPORT-F1', '71 111 111', 'Rue de test, Tunis']);
    ws.addRow(['TEST-IMPORT-F2', '', '']);
    ws.addRow(['test-import-f1', '71 222 222', '']); // doublon (insensible à la casse)
    if (existant) ws.addRow([existant, '', '']);     // déjà dans le répertoire
    ws.addRow(['', '71 333 333', '']);               // nom requis
    const buf = await wb.xlsx.writeBuffer();
    const form = new FormData();
    form.append('file', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'import.xlsx');
    const imp = await fetch(`${BASE}/api/entreprise/fournisseurs/import`, { method: 'POST', headers: H, body: form });
    const res = await imp.json();
    check('import 200', imp.status === 200, JSON.stringify(res.stats || res.message));
    check('2 fournisseurs créés', res.processed === 2, `processed=${res.processed}`);
    const attendus = existant ? 3 : 2;
    check(`${attendus} lignes rejetées (doublons + nom requis)`, res.errors === attendus, `errors=${res.errors}`);
    const dupFichier = res.details?.find((d) => d.nom === 'test-import-f1');
    check('doublon fichier signalé', dupFichier?.status === 'error', dupFichier?.error);

    // Affectations : TOUTES les activités + TOUS les labos du compte
    const pe = await pool.query('SELECT id FROM profil_entreprise WHERE client_id = $1', [user.id]);
    const entrepriseId = pe.rows[0].id;
    const [nbAct, nbLabo, crees] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS n FROM activites WHERE entreprise_id = $1', [entrepriseId]),
      pool.query('SELECT COUNT(*)::int AS n FROM labos WHERE entreprise_id = $1', [entrepriseId]),
      pool.query(`SELECT id, nom FROM fournisseurs WHERE entreprise_id = $1 AND nom LIKE 'TEST-IMPORT-%'`, [entrepriseId]),
    ]);
    check('les 2 fiches sont en base', crees.rows.length === 2);
    for (const f of crees.rows) {
      const [fa, fl] = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS n FROM fournisseur_activites WHERE fournisseur_id = $1', [f.id]),
        pool.query('SELECT COUNT(*)::int AS n FROM fournisseur_labos WHERE fournisseur_id = $1', [f.id]),
      ]);
      check(`« ${f.nom} » assigné à ${nbAct.rows[0].n} activité(s) + ${nbLabo.rows[0].n} labo(s)`,
        fa.rows[0].n === nbAct.rows[0].n && fl.rows[0].n === nbLabo.rows[0].n,
        `act ${fa.rows[0].n}/${nbAct.rows[0].n} · labo ${fl.rows[0].n}/${nbLabo.rows[0].n}`);
    }

    // Ré-import du même fichier : tout doit être rejeté en doublon répertoire
    const form2 = new FormData();
    form2.append('file', new Blob([buf]), 'import.xlsx');
    const imp2 = await fetch(`${BASE}/api/entreprise/fournisseurs/import`, { method: 'POST', headers: H, body: form2 });
    const res2 = await imp2.json();
    check('ré-import : 0 créé, tout en doublon', (res2.processed || 0) === 0, `status ${imp2.status}, processed=${res2.processed}`);
  } catch (e) {
    check('exception', false, e.message);
  } finally {
    await pool.query(`DELETE FROM fournisseurs WHERE nom LIKE 'TEST-IMPORT-%'`);
    console.log('🧹 fournisseurs de test supprimés');
    await pool.end();
    const ko = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - ko}/${results.length} checks verts${ko ? ` — ${ko} ÉCHEC(S)` : ''}`);
    process.exit(ko ? 1 : 0);
  }
})();
