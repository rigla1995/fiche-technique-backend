// LabFlow Compta, étape S4c (labflow-reprise/achats-compta/PLAN-S4.md §1 ; réponses 2 et 4 du client du 07/10 ;
// ETAPE-S4c.md) : les dossiers de chaque collaborateur. Tests sans base : réglage lu et contrôlé, présentation,
// défauts (nouvel accès : liste vide ; accès existant : inchangé), écriture dans la transaction, ouverture au créateur,
// accès obligatoire vidé → « tous », aucune route nouvelle, migration 210 (manuel seul).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const corpsDe = (src, nom) => {
  const debut = src.indexOf(`const ${nom} = async (req, res) => {`);
  assert.ok(debut > 0, nom);
  return src.slice(debut, src.indexOf('\n};\n', debut));
};

const comptables = require('../src/compta/comptablesClient');
const gerants = require('../src/compta/gerantsCabinet');

const reponse = () => {
  const res = { statut: 200, corps: null };
  res.status = (s) => { res.statut = s; return res; };
  res.json = (c) => { res.corps = c; return res; };
  return res;
};

test('réglage lu : « tous » ou une liste d\'identifiants distincts, triés ; tout le reste est refusé (400)', () => {
  assert.equal(comptables.lireDossiersSaisis('tous'), 'tous');
  assert.deepEqual(comptables.lireDossiersSaisis([]), []);
  assert.deepEqual(comptables.lireDossiersSaisis([3, '1', 1, 2]), [1, 2, 3], 'chaînes acceptées, doublons retirés, tri');
  for (const v of ['x', 'TOUS', null, undefined, {}, 5, [0], [-1], [1.5], ['a'], [{}], [null], [true], ['1;DROP'], Array.from({ length: comptables.DOSSIERS_MAX + 1 }, (_, i) => i + 1)]) {
    assert.throws(() => comptables.lireDossiersSaisis(v), (e) => e.statusCode === 400, JSON.stringify(v)?.slice(0, 40));
  }
  assert.equal(comptables.DOSSIERS_MAX, 5000, 'S4d : des milliers de dossiers par collaborateur');
});

test('présentation : « tous » sans la colonne ou quand elle est vraie ; la liste (nombres) sinon ; comparaison', () => {
  const base = { id: 7, obligatoire: false, niveau: 'saisie', personne_id: 9, nom: 'G', email: 'g@x.tn', personne_role: 'comptable', activated_at: new Date(), a_mot_de_passe: true, etat_acces: 'actif' };
  assert.equal(comptables.presenterComptable(base).dossiers, 'tous', 'accès d\'avant S4c : tous');
  assert.equal(comptables.presenterComptable({ ...base, tous_dossiers: true, dossier_ids: [] }).dossiers, 'tous');
  assert.deepEqual(comptables.presenterComptable({ ...base, tous_dossiers: false, dossier_ids: ['4', 9] }).dossiers, [4, 9]);
  assert.deepEqual(comptables.presenterComptable({ ...base, tous_dossiers: false, dossier_ids: null }).dossiers, []);
  assert.equal(comptables.memeDossiers('tous', 'tous'), true);
  assert.equal(comptables.memeDossiers('tous', []), false);
  assert.equal(comptables.memeDossiers([], 'tous'), false);
  assert.equal(comptables.memeDossiers([1, 2], [1, 2]), true);
  assert.equal(comptables.memeDossiers([1, 2], [1, 3]), false);
  assert.equal(comptables.memeDossiers([], []), true);
  assert.ok(comptables.SQL_COMPTABLES.includes('a.tous_dossiers,') && comptables.SQL_COMPTABLES.includes('AS dossier_ids'));
});

test('saisie : les dossiers seulement s\'ils sont donnés (la page Gérants de LabFlow ne les envoie pas) ; corps vide refusé', async () => {
  assert.deepEqual(comptables.lireSaisie({ nom: 'A', email: 'a@x.tn', niveau: 'saisie' }), { nom: 'A', email: 'a@x.tn', niveau: 'saisie' }, 'aucune clé dossiers ajoutée');
  assert.deepEqual(comptables.lireSaisie({ dossiers: [2] }, true), { dossiers: [2] });
  assert.deepEqual(comptables.lireSaisie({ niveau: 'saisie', dossiers: null }, true), { niveau: 'saisie' }, 'null vaut absent (pas de changement)');
  assert.throws(() => comptables.lireDossiersSaisis(Array.from({ length: comptables.DOSSIERS_MAX + 1 }, (_, i) => i + 1)), (e) => /au plus 5000/.test(e.message));
  assert.deepEqual(comptables.lireSaisie({ niveau: 'complet', dossiers: 'tous' }, true), { niveau: 'complet', dossiers: 'tous' });
  assert.throws(() => comptables.lireSaisie({ nom: 'A', email: 'a@x.tn', dossiers: 'x' }), (e) => e.statusCode === 400);
  // Modifier sans rien : 400 avant toute requête (« Ma comptabilité » n'envoie que `dossiers`, jamais un corps vide).
  for (const [ctrl, user] of [[comptables, { id: 1, role: 'client' }], [gerants, { id: 1, role: 'comptable' }]]) {
    const r1 = reponse();
    await ctrl.modifier({ user, params: { id: '1' }, body: {} }, r1);
    assert.equal(r1.statut, 400);
    const r2 = reponse();
    await ctrl.modifier({ user, params: { id: '1' }, body: { dossiers: ['x'] } }, r2);
    assert.equal(r2.statut, 400);
    const r3 = reponse();
    await ctrl.ajouter({ user, body: { nom: 'A', email: 'a@x.tn', dossiers: 5 } }, r3);
    assert.equal(r3.statut, 400);
  }
});

test('défauts et écritures : nouvel accès → liste vide ; réglage écrit dans la transaction, journal avant / après', () => {
  for (const fichier of ['comptablesClient.js', 'gerantsCabinet.js']) {
    const src = lire('src', 'compta', fichier);
    const ajouter = corpsDe(src, 'ajouter');
    assert.ok(ajouter.includes('const dossiers = saisie.dossiers ?? [];'), `${fichier} : « Choisir », liste vide, par défaut (réponses 2 et 4)`);
    assert.ok(ajouter.includes("[espace.id, saisie.niveau, dossiers === 'tous']"), `${fichier} : tous_dossiers posé à la création`);
    assert.ok(ajouter.includes("if (dossiers !== 'tous' && dossiers.length) await ecrireDossiers(db, espace.id, accesId, dossiers);"), `${fichier} : liste écrite dans la transaction`);
    assert.ok(ajouter.includes('nouvelle: attribution.nouvelle, dossiers,'), `${fichier} : journal de l'attribution avec les dossiers`);
    const modifier = corpsDe(src, 'modifier');
    assert.ok(modifier.includes("if (!Object.keys(saisie).length) throw erreur(400, 'Rien à modifier');"), `${fichier}`);
    assert.ok(modifier.includes("if (acces.personne_id == null && saisie.nom === undefined && saisie.email === undefined) throw erreur(409, 'Désignez d\\'abord une personne pour cet accès', 'ACCES_VIDE');"), `${fichier} : régler un accès vide n'a pas de sens`);
    // Réattribution : sans réglage envoyé, l'accès OBLIGATOIRE (page Gérants de LabFlow, qui ne montre pas les dossiers)
    // revient à « tous » ; un accès de cabinet ou supplémentaire garde le sien. Journal de l'attribution PUIS des dossiers.
    const attendu = fichier === 'comptablesClient.js' ? "const dossiers = saisie.dossiers ?? (acces.obligatoire ? 'tous' : dossiersDe(acces));" : 'const dossiers = saisie.dossiers ?? dossiersDe(acces);';
    assert.ok(modifier.includes(attendu), `${fichier} : réglage à la (ré)attribution`);
    const journalAttribution = modifier.indexOf("acces.personne_id == null ? 'acces_attribue' : 'acces_reattribue'");
    const reglage = modifier.indexOf('await reglerDossiers(db, espace, acces, dossiers, req.user.id, attribution.personneId);');
    assert.ok(journalAttribution > 0 && reglage > journalAttribution, `${fichier} : la nouvelle personne au journal, après la ligne d'attribution`);
    assert.ok(modifier.includes('await reglerDossiers(db, espace, acces, saisie.dossiers, req.user.id);'), `${fichier} : modification`);
    assert.ok(modifier.includes('if (saisie.niveau !== undefined || saisie.nom !== undefined) {'), `${fichier} : nom et niveau écrits seulement s'ils sont donnés (pas de journal vide)`);
  }
  const cc = lire('src', 'compta', 'comptablesClient.js');
  const regler = cc.slice(cc.indexOf('const reglerDossiers = async'), cc.indexOf('\n};\n', cc.indexOf('const reglerDossiers = async')));
  assert.ok(regler.includes('if (dossiers === undefined || memeDossiers(avant, dossiers)) return avant;'), 'rien n\'est écrit ni journalisé sans changement');
  assert.ok(regler.includes("'acces_dossiers_modifies', { acces: acces.id, personne: personneId, avant, apres: dossiers }"), 'journal (D16)');
  const ecrire = cc.slice(cc.indexOf('const ecrireDossiers = async'), cc.indexOf('\n};\n', cc.indexOf('const ecrireDossiers = async')));
  assert.ok(ecrire.includes("WHERE espace_id = $1 AND id = ANY($2::int[])"), 'les dossiers choisis sont ceux de la comptabilité');
  assert.ok(ecrire.includes("'DOSSIER_INCONNU'"));
  assert.ok(ecrire.indexOf('DELETE FROM compta.acces_dossiers') < ecrire.indexOf('INSERT INTO compta.acces_dossiers'));
  // L'accès obligatoire vidé revient à « tous » (réponse 4 ; la page Gérants de LabFlow ne montre pas les dossiers).
  const vider = cc.slice(cc.indexOf('const viderOuSupprimer = async'), cc.indexOf('\n};\n', cc.indexOf('const viderOuSupprimer = async')));
  assert.ok(vider.includes('attribue_le = NULL, tous_dossiers = true, updated_at = NOW()'));
  assert.ok(vider.includes("return db.query('DELETE FROM compta.acces_dossiers WHERE acces_id = $1', [acces.id]);"));
  // S4d : le catalogue des dossiers ne voyage plus dans les réponses des accès (la liste à cocher le lit par pages).
  for (const f of ['gerantsCabinet.js', 'comptablesClient.js', 'accesController.js']) assert.ok(!lire('src', 'compta', f).includes('lireDossiersEspace'), f);
  // Pages du collaborateur et du comptable : « tous » ou une sélection ; « Ma comptabilité » : l'état de l'abonnement
  // (« Régler » fermé quand la comptabilité n'est pas modifiable).
  assert.ok(lire('src', 'compta', 'gerantsCabinet.js').includes('membreDepuis: acces.attribue_le, tousDossiers: acces.tous_dossiers'));
  assert.ok(cc.includes('confieeLe: acces.attribue_le, tousDossiers: acces.tous_dossiers'));
  const maComptabilite = corpsDe(lire('src', 'compta', 'accesController.js'), 'maComptabilite');
  assert.ok(maComptabilite.includes('modeTitulaire(pool, espace.id)') && maComptabilite.includes('etatAbonnement: etatAbonnement(mode),'));
});

test('un dossier créé par un gérant qui n\'a pas « tous » lui est ouvert dans la même transaction', () => {
  const dj = lire('src', 'compta', 'dossiers.js');
  const creer = corpsDe(dj, 'creer');
  const ouverture = creer.indexOf("if (!acces.tous_dossiers) await db.query('INSERT INTO compta.acces_dossiers (acces_id, dossier_id) VALUES ($1, $2)', [acces.acces_id, d.id]);");
  assert.ok(ouverture > creer.indexOf('const d = ins.rows[0];'), 'après l\'insertion du dossier');
  assert.ok(ouverture < creer.indexOf('fiche: await presenterFiche(db, acces, d),'), 'avant la fiche (la carte « Accès » le montre)');
  assert.ok(creer.includes("...(acces.tous_dossiers ? {} : { ouvertA: acces.acces_id })"), 'journal');
  // Un dossier supprimé sort des listes (cascade) : le journal nomme les accès qui l'avaient.
  assert.ok(corpsDe(dj, 'supprimer').includes("SELECT acces_id FROM compta.acces_dossiers WHERE dossier_id = $1 ORDER BY acces_id"));
  // Relecture : le dossier est relu (404 s'il est caché) AVANT la garde par comptabilité — pas d'oracle d'existence par
  // un 403 en lecture seule.
  const debut = dj.indexOf('const dansEspaceDuDossier = async');
  const corps = dj.slice(debut, dj.indexOf('\n};\n', debut));
  const relecture = corps.indexOf('const d = await dossierDe(db, acces, dossierId, true);');
  const garde = corps.indexOf('if (garde) await exigerEcriture(db, acces.espace_id);');
  assert.ok(relecture > 0 && garde > relecture, 'dossier relu avant la garde');
  assert.ok(corps.includes('}, { garde: false });'), 'la transaction de la comptabilité ne garde pas elle-même');
});

test('aucune route nouvelle : le réglage voyage dans PUT …/gerants/:id et PUT /mes-comptables/:id', () => {
  const src = lire('src', 'compta', 'routes.js');
  assert.ok(!/dossiers'/.test(src.split('\n').filter((l) => /cabinet\/gerants|mes-comptables/.test(l)).join('\n')));
  assert.equal(src.split('\n').filter((l) => /^router\.(post|put|patch|delete)\(/.test(l)).length, 51, 'toujours 51 routes d\'écriture (test S3b ; S5a : + 5 du plan de comptes ; S5b : + 9 des journaux et des taxes ; S5c : + 8 des tiers et des imports ; S6a : + 5 des écritures et des aides ; S6b : + 5 de la validation et des périodes)');
});

test('migration 210 : manuel seul, quatre fiches gardées par empreinte, sans balise, en LF', () => {
  const sql = fs.readFileSync(path.join(RACINE, 'migrations', '210_compta_dossiers_collaborateurs.sql'), 'utf8');
  assert.ok(!sql.includes('\r'), 'fins de ligne LF');
  assert.match(sql, /'compta-gerants', '470eebf93ea7be6a7f4b96bd98ea4c96'/);
  assert.match(sql, /'compta-ma-comptabilite', 'c8bf2076d534e27cbb6bda1a4a5c6b5f'/);
  assert.match(sql, /'compta-confiee', '18fb0e64cf95959a10e5f774c9992851'/);
  assert.match(sql, /'compta-cabinet-membre', '5f9958d8b9413806bb03a220cb169ec6'/);
  assert.match(sql, /md5\(replace\(manuel_sections\.contenu_defaut, chr\(13\), ''\)\) = f\.garde/);
  assert.match(sql, /SET contenu = CASE WHEN contenu = contenu_defaut THEN f\.texte ELSE contenu END/, 'une fiche retouchée garde sa retouche');
  assert.ok(!/\[\[/.test(sql), 'jamais de balise de vocabulaire dans une fiche Compta');
  assert.ok(!/ALTER TABLE|CREATE TABLE|CREATE INDEX|INSERT INTO|DELETE FROM/.test(sql), 'manuel seul : aucune table ne change');
  for (const marque of ['$f210a$', '$f210b$', '$f210c$', '$f210d$']) {
    const debut = sql.indexOf(marque);
    const fiche = sql.slice(debut, sql.indexOf(marque, debut + 1));
    assert.ok(fiche.includes('Tous les dossiers'), marque);
  }
});
