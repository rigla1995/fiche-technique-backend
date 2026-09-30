/* Test E2E local — lot 2a (docs/lot-2-spec.md §8 point 3) : le vocabulaire du domaine du compte.
 * TOUT passe par l'API (backend démarré sur :3000, migrations au boot, dont la 191). Le SQL ne
 * sert qu'aux mots de passe, au compte acheteur (créé sans email d'invitation), aux assertions
 * et au nettoyage (super_admin temporaire à mot de passe aléatoire).
 *
 * Couvre :
 *   1. domaines sans écart (Restauration, Boulangerie, Café…) : les 32 clés d'origine du lexique
 *      sont inchangées (sg, pl, g, el, icon — référence : git show du commit d'avant le lot 2) ;
 *   2. migration 191 : appliquée, plus aucune valeur de brouillon 187 visée ; rejouée dans une
 *      transaction ANNULÉE : corrections exactes (§1.5), idempotence, correction admin conservée ;
 *      brouillons RÉ-ENREGISTRÉS par l'interface d'avant le lot 2 (sans g ni el) : complétés par
 *      l'étape 0, les 8 corrections s'appliquent, aucun genre ni aucune élision ne bascule ;
 *   3. comptes de test Hôtellerie et Céramique : /auth/login et /auth/me portent le lexique
 *      RÉSOLU v2 (40 clés, clés dérivées, formes courtes), avec composants et règles ; gérant :
 *      domaine du compte parent ;
 *   4. acheteur d'un compte Hôtellerie : domaine = { id, slug, nom, lexique } du client vendeur,
 *      SANS composants ni règles — dans /auth/login, /auth/me ET GET /api/domaines ;
 *   5. compte restauration créé dans le même test : lexique par défaut ; admin : domaine null ;
 *   6. validation du lexique (PUT /api/domaines/:id sur un domaine de test) : 400 + code sur
 *      entrée incomplète, caractère interdit (dont { } $, tabulation, séparateurs de ligne), texte
 *      trop long, clé réservée, clé dérivée partielle, champ non surchargeable ; rien n'est écrit ;
 *      lexique valide → clés dérivées résolues, propagé à /auth/me du compte rattaché ;
 *      domaine par défaut « restauration » : aucun écart de lexique accepté (invariant I1).
 * Nettoie tout ce qu'il crée (clients, acheteur, gérant, domaine de test, admin temporaire).
 *
 * ⚠️ POST /admin/clients envoie l'email de bienvenue si RESEND_API_KEY est renseignée dans
 * l'environnement du BACKEND. Démarrer le backend de test par le lanceur versionné, qui vide les
 * clés externes, bouchonne `resend` et bloque le réseau sortant :
 *     node scripts/start-test-backend.js
 * (jamais `npm start` avec le .env d'un poste de développement : il contient de vraies clés). */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');
const { LEXIQUE_DEFAUT, LEXIQUE_CLES } = require('../src/config/lexiqueDefaut');
const { resoudreLexique } = require('../src/utils/vocab');

const BASE = 'http://localhost:3000';
const RACINE = path.resolve(__dirname, '..');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};
const egal = (a, b) => {
  try { require('assert').deepStrictEqual(a, b); return true; } catch (_) { return false; }
};
const J5 = (e) => JSON.stringify(e == null ? e : { sg: e.sg, pl: e.pl, g: e.g, el: e.el, icon: e.icon });

const ADMIN_EMAIL = 'test-admin-vocabulaire@example.com';
const HOTEL_EMAIL = 'test-vocabulaire-hotel@example.com';
const CERAM_EMAIL = 'test-vocabulaire-ceramique@example.com';
const RESTO_EMAIL = 'test-vocabulaire-resto@example.com';
const GERANT_EMAIL = 'test-vocabulaire-gerant@example.com';
const ACHETEUR_EMAIL = 'test-vocabulaire-acheteur@example.com';
const TOUS_EMAILS = [ADMIN_EMAIL, HOTEL_EMAIL, CERAM_EMAIL, RESTO_EMAIL, GERANT_EMAIL, ACHETEUR_EMAIL];
const DOM_SLUG = 'test-vocabulaire';
const DOM_NOM = 'TEST-Domaine Vocabulaire';
const PWD = 'TestVocab2026!';
// Le super_admin temporaire reçoit un mot de passe ALÉATOIRE (jamais réutilisable si un crash
// avant le nettoyage laissait la ligne en base).
const ADMIN_PWD = require('crypto').randomBytes(18).toString('base64url');

// Commit de référence d'avant le lot 2 (scripts/vocab-check.base, s'il existe, fait foi).
const BASE_DEFAUT = '13d99d054b96eba7192d48d58b276fff756c4418';
const fichierBase = path.join(__dirname, 'vocab-check.base');
const REF = fs.existsSync(fichierBase) ? fs.readFileSync(fichierBase, 'utf8').trim() || BASE_DEFAUT : BASE_DEFAUT;
const lexiqueOrigine = () => {
  try {
    const source = execFileSync('git', ['-C', RACINE, 'show', `${REF}:src/config/lexiqueDefaut.js`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const mod = { exports: {} };
    vm.runInThisContext(`(function (module, exports) {\n${source}\n})`)(mod, mod.exports);
    return mod.exports.LEXIQUE_DEFAUT;
  } catch (_) {
    return null;
  }
};

// Les 8 entrées de brouillon visées par la migration 191 : valeur posée par la 187, valeur
// attendue après la 191 (spec §1.5 ; null = surcharge retirée).
const e4 = (sg, pl, g, el = false) => ({ sg, pl, g, el });
const CIBLES_191 = [
  ['hotellerie', 'food_cost', e4('Coût matière', 'Coûts matière', 'm'), e4('Ratio matière', 'Ratios matière', 'm')],
  ['hotellerie', 'labo', e4('Cuisine centrale', 'Cuisines centrales', 'f'), { ...e4('Cuisine centrale', 'Cuisines centrales', 'f'), court: { sg: 'Cuisine', pl: 'Cuisines' } }],
  ['hotellerie', 'pt', e4('Préparation', 'Préparations', 'f'), { ...e4('Préparation', 'Préparations', 'f'), court: { sg: 'Prépa', pl: 'Prépas' } }],
  ['ceramique', 'perte', e4('Casse / Rebut / Second choix', 'Casses / Rebuts / Seconds choix', 'f'), null],
  ['ceramique', 'labo', e4('Site de production', 'Sites de production', 'm'), { ...e4('Site de production', 'Sites de production', 'm'), court: { sg: 'Site', pl: 'Sites' } }],
  ['ceramique', 'pt', e4('Produit fabriqué', 'Produits fabriqués', 'm'), { ...e4('Produit fabriqué', 'Produits fabriqués', 'm'), court: { sg: 'PF', pl: 'PF' } }],
  ['ceramique', 'fiche_technique', e4('Fiche de coût de revient', 'Fiches de coût de revient', 'f'), { ...e4('Fiche de coût de revient', 'Fiches de coût de revient', 'f'), court: { sg: 'FCR', pl: 'FCR' } }],
  ['ceramique', 'appro', e4('Réception', 'Réceptions', 'f'), { ...e4('Réception', 'Réceptions', 'f'), court: { sg: 'Réception', pl: 'Réceptions' } }],
];

(async () => {
  const hash = await bcrypt.hash(PWD, 10);
  const adminHash = await bcrypt.hash(ADMIN_PWD, 10);
  const wipe = async () => {
    await pool.query(`DELETE FROM acheteurs WHERE nom LIKE 'TEST-Voc %'`).catch(() => {});
    await pool.query(`DELETE FROM utilisateurs WHERE email = ANY($1)`, [TOUS_EMAILS]);
    await pool.query(`DELETE FROM domaines_activite WHERE slug = $1 OR nom = $2`, [DOM_SLUG, DOM_NOM]).catch(() => {});
  };
  await wipe();
  await pool.query(
    `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminVocab', $1, $2, 'super_admin', true)`,
    [ADMIN_EMAIL, adminHash]
  );
  const login = async (email, password = PWD) => {
    const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    let body = null;
    try { body = await r.json(); } catch (_) { body = null; }
    return { status: r.status, token: body?.token || null, user: body?.user || null };
  };
  const mk = (tok) => async (url, opts = {}) => {
    const res = await fetch(`${BASE}${url}`, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, ...opts });
    let body = null;
    try { body = await res.json(); } catch (_) { body = null; }
    return { status: res.status, body };
  };
  const post = (J, url, body) => J(url, { method: 'POST', body: JSON.stringify(body) });
  const put = (J, url, body) => J(url, { method: 'PUT', body: JSON.stringify(body) });
  const del = (J, url) => J(url, { method: 'DELETE' });
  const ecartsEnBase = async (id) => (await pool.query('SELECT lexique FROM domaines_activite WHERE id = $1', [id])).rows[0]?.lexique || {};

  const adm = await login(ADMIN_EMAIL, ADMIN_PWD);
  const A = mk(adm.token);
  check('login super_admin temporaire', !!adm.token);
  check('/auth/login admin : domaine null (vocabulaire LabFlow)', adm.user && adm.user.domaine === null, JSON.stringify(adm.user?.domaine));

  const createdClients = [];
  let domId = null;
  try {
    // ── 1. Domaines sans écart : les 32 clés d'origine sont inchangées ─────────────────────────
    let { status, body } = await A('/api/domaines');
    const domaines = Array.isArray(body) ? body : [];
    check('GET /api/domaines (admin) → 200', status === 200 && domaines.length >= 1, String(status));
    const parSlug = (slug) => domaines.find((d) => d.slug === slug) || null;
    const restau = parSlug('restauration');
    const hot = parSlug('hotellerie');
    const cer = parSlug('ceramique');
    check('domaines restauration, hôtellerie et céramique présents', !!restau && !!hot && !!cer, domaines.map((d) => d.slug).join(', '));
    if (!restau || !hot || !cer) throw new Error('domaines de base absents');
    check('chaque domaine : lexique résolu = 40 clés du défaut (dans l\'ordre) + lexiqueEcarts (admin)',
      domaines.every((d) => egal(Object.keys(d.lexique).slice(0, LEXIQUE_CLES.length), [...LEXIQUE_CLES]) && d.lexiqueEcarts && typeof d.lexiqueEcarts === 'object'),
      `${LEXIQUE_CLES.length} clés`);
    check('chaque domaine : lexique exposé = résolution de ses écarts stockés',
      domaines.every((d) => egal(d.lexique, resoudreLexique(LEXIQUE_DEFAUT, d.lexiqueEcarts))));

    const origine = lexiqueOrigine();
    check(`lexique d'origine lu dans git (${REF.slice(0, 7)}:src/config/lexiqueDefaut.js) : 32 clés`, !!origine && Object.keys(origine).length === 32,
      origine ? '' : 'git show indisponible');
    const sansEcart = domaines.filter((d) => Object.keys(d.lexiqueEcarts || {}).length === 0);
    check('domaines sans écart : restauration, boulangerie et café en font partie',
      ['restauration', 'boulangerie', 'cafe'].every((s) => !parSlug(s) || sansEcart.some((d) => d.slug === s)),
      sansEcart.map((d) => d.slug).join(', '));
    if (origine) {
      for (const d of sansEcart) {
        const diffs = [];
        for (const k of Object.keys(origine)) if (J5(origine[k]) !== J5(d.lexique[k])) diffs.push(`${k} : ${J5(origine[k])} → ${J5(d.lexique[k])}`);
        check(`domaine « ${d.slug} » (sans écart) : 32 clés d'origine inchangées (sg, pl, g, el, icon)`, diffs.length === 0, diffs.slice(0, 3).join(' ; '));
      }
    }
    check('domaine sans écart : lexique exposé = lexique par défaut v2 (au caractère près)',
      sansEcart.every((d) => JSON.stringify(d.lexique) === JSON.stringify(LEXIQUE_DEFAUT)));

    // ── 2. Migration 191 ────────────────────────────────────────────────────────────────────────
    const mig = await pool.query(`SELECT filename FROM _migrations WHERE filename = '191_lexique_v2_brouillons.sql'`);
    check('migration 191_lexique_v2_brouillons.sql appliquée', mig.rows.length === 1);
    const restantes = CIBLES_191.filter(([slug, cle, brouillon]) => egal(parSlug(slug).lexiqueEcarts[cle], brouillon));
    check('après la 191 : plus aucune entrée visée n\'a sa valeur de brouillon 187', restantes.length === 0, restantes.map((c) => `${c[0]}.${c[1]}`).join(', '));
    check('domaine restauration : lexique stocké non touché par la 191 (aucun écart)', Object.keys(restau.lexiqueEcarts).length === 0, JSON.stringify(restau.lexiqueEcarts));

    // Rejouée dans une transaction ANNULÉE, en repartant des valeurs de brouillon 187.
    {
      const sql191 = fs.readFileSync(path.join(RACINE, 'migrations', '191_lexique_v2_brouillons.sql'), 'utf8');
      const c = await pool.connect();
      const notices = [];
      const onNotice = (n) => notices.push(n.message);
      c.on('notice', onNotice);
      const lex = async (slug) => (await c.query('SELECT lexique FROM domaines_activite WHERE slug = $1', [slug])).rows[0].lexique;
      const poser = async (slug, surcharge = {}) => {
        const actuel = await lex(slug);
        const brouillons = Object.fromEntries(CIBLES_191.filter((x) => x[0] === slug).map((x) => [x[1], x[2]]));
        const etat = { ...actuel, ...brouillons, ...surcharge };
        await c.query('UPDATE domaines_activite SET lexique = $1 WHERE slug = $2', [JSON.stringify(etat), slug]);
        return etat;
      };
      try {
        await c.query('BEGIN');
        const restauAvant = await lex('restauration');
        const depart = { hotellerie: await poser('hotellerie'), ceramique: await poser('ceramique') };
        await c.query(sql191);
        const apres = { hotellerie: await lex('hotellerie'), ceramique: await lex('ceramique') };
        for (const [slug, cle, , attendu] of CIBLES_191) {
          const obtenu = apres[slug][cle];
          check(`191 (transaction annulée) : ${slug}.${cle} → ${attendu ? JSON.stringify(attendu.court || attendu.sg) : 'surcharge retirée'}`,
            attendu === null ? obtenu === undefined : egal(obtenu, attendu), JSON.stringify(obtenu));
        }
        const intactes = ['hotellerie', 'ceramique'].every((slug) => Object.keys(depart[slug])
          .filter((k) => !CIBLES_191.some((x) => x[0] === slug && x[1] === k))
          .every((k) => egal(depart[slug][k], apres[slug][k])));
        check('191 : les autres entrées des deux brouillons sont intactes, restauration non touchée', intactes && egal(await lex('restauration'), restauAvant));
        check('191 : RAISE NOTICE de chaque correction + bilan (8)', notices.filter((n) => /^Migration 191 : (hotellerie|ceramique)\.\w+ — /.test(n)).length === 8
          && notices.some((n) => /8 correction\(s\)/.test(n)), `${notices.length} notices`);
        notices.length = 0;
        await c.query(sql191);
        check('191 : idempotente (2e passage : 0 correction, état identique)',
          egal(await lex('hotellerie'), apres.hotellerie) && egal(await lex('ceramique'), apres.ceramique) && notices.some((n) => /0 correction\(s\)/.test(n)),
          notices[notices.length - 1] || '');
        // Une correction faite par l'admin AVANT la 191 n'est jamais écrasée.
        const admin = { labo: e4('Cuisine', 'Cuisines', 'f'), food_cost: e4('Coût denrées', 'Coûts denrées', 'm') };
        await poser('hotellerie', admin);
        notices.length = 0;
        await c.query(sql191);
        const h = await lex('hotellerie');
        check('191 : entrées corrigées par l\'admin conservées (labo, food_cost), les autres corrigées (pt)',
          egal(h.labo, admin.labo) && egal(h.food_cost, admin.food_cost) && egal(h.pt.court, { sg: 'Prépa', pl: 'Prépas' })
          && notices.some((n) => /1 correction\(s\)/.test(n)),
          JSON.stringify({ labo: h.labo, food_cost: h.food_cost.sg, pt: h.pt.court }));

        // Brouillons RÉ-ENREGISTRÉS par l'interface d'avant le lot 2 : l'onglet Lexique du lot 1a renvoyait
        // TOUS les écarts, avec pl, g, el seulement quand ils différaient du défaut d'origine ; le serveur
        // complétait par ce défaut. Ici l'admin a modifié un seul autre terme (marge) puis enregistré.
        const origine32 = lexiqueOrigine();
        if (!origine32) {
          check('191 étape 0 : lexique d\'origine indisponible (git) — scénario « ancien format » sauté', true);
        } else {
          const ancienFormat = (ecarts) => Object.fromEntries(Object.entries(ecarts).map(([k, e]) => {
            const d = origine32[k] || {};
            const o = {};
            if (e.sg !== d.sg) o.sg = e.sg;
            if (e.pl !== d.pl) o.pl = e.pl;
            if (e.g !== d.g) o.g = e.g;
            if (e.el !== d.el) o.el = e.el;
            return [k, o];
          }).filter(([, o]) => Object.keys(o).length));
          const resolutionAvant = (ecarts) => Object.fromEntries(Object.keys(origine32).map((k) => [k, { ...origine32[k], ...(ecarts[k] || {}) }]));
          const reenregistres = {};
          for (const slug of ['hotellerie', 'ceramique']) {
            reenregistres[slug] = { ...ancienFormat(depart[slug]), marge: { sg: 'Marge brute', pl: 'Marges brutes' } };
            await c.query('UPDATE domaines_activite SET lexique = $1 WHERE slug = $2', [JSON.stringify(reenregistres[slug]), slug]);
          }
          const incompletes = Object.values(reenregistres).flatMap((l) => Object.values(l)).filter((e) => e.sg && !(e.pl && e.g && typeof e.el === 'boolean')).length;
          check('191 étape 0 : le scénario pose bien des entrées SANS g ou el (format de l\'ancienne interface)', incompletes >= 10, String(incompletes));
          notices.length = 0;
          await c.query(sql191);
          const apresAncien = { hotellerie: await lex('hotellerie'), ceramique: await lex('ceramique') };
          check(`191 étape 0 : ${incompletes} entrée(s) incomplète(s) complétée(s), puis les 8 corrections`,
            notices.some((n) => new RegExp(`${incompletes} entrée\\(s\\) incomplète\\(s\\) complétée\\(s\\)`).test(n)) && notices.some((n) => /8 correction\(s\)/.test(n)),
            notices.filter((n) => /complétée\(s\)|correction\(s\)/.test(n)).join(' | '));
          for (const [slug, cle, , attendu] of CIBLES_191) {
            const obtenu = apresAncien[slug][cle];
            check(`191 après ré-enregistrement ancien format : ${slug}.${cle} corrigé`, attendu === null ? obtenu === undefined : egal(obtenu, attendu), JSON.stringify(obtenu));
          }
          for (const slug of ['hotellerie', 'ceramique']) {
            const avant = resolutionAvant(reenregistres[slug]);
            const apresR = resoudreLexique(LEXIQUE_DEFAUT, apresAncien[slug]);
            const bascules = Object.keys(avant).filter((k) => avant[k].g !== apresR[k].g || avant[k].el !== apresR[k].el)
              .map((k) => `${k} g ${avant[k].g}→${apresR[k].g} el ${avant[k].el}→${apresR[k].el}`);
            check(`191 étape 0 : ${slug} — aucun genre ni élision ne bascule entre la résolution d'avant le lot 2 et celle d'après`, bascules.length === 0, bascules.join(' ; '));
            const restees = Object.entries(apresAncien[slug]).filter(([, e]) => e.sg && !(e.pl && (e.g === 'm' || e.g === 'f') && typeof e.el === 'boolean')).map(([k]) => k);
            check(`191 étape 0 : ${slug} — plus aucune entrée à singulier sans pluriel, genre ou élision`, restees.length === 0, restees.join(', '));
          }
          check('191 étape 0 : marge « Marge brute » reste féminin (complété par le défaut d\'origine)',
            egal(apresAncien.hotellerie.marge, { sg: 'Marge brute', pl: 'Marges brutes', g: 'f', el: false }), JSON.stringify(apresAncien.hotellerie.marge));
          notices.length = 0;
          await c.query(sql191);
          check('191 étape 0 : idempotente (2e passage : 0 complétée, 0 correction, état identique)',
            notices.some((n) => /^Migration 191 : 0 entrée\(s\) incomplète\(s\)/.test(n)) && notices.some((n) => /0 correction\(s\)/.test(n))
            && egal(await lex('hotellerie'), apresAncien.hotellerie) && egal(await lex('ceramique'), apresAncien.ceramique),
            notices.filter((n) => /complétée\(s\)|correction\(s\)/.test(n)).join(' | '));
          // Entrée incomplète hors des 32 clés d'origine, entrée sans singulier, entrée complète : non touchées.
          const divers = { chantier: { sg: 'Chantier' }, labo: { g: 'f' }, vente: { sg: 'Commande', pl: 'Commandes', g: 'm', el: false } };
          await c.query('UPDATE domaines_activite SET lexique = $1 WHERE slug = $2', [JSON.stringify(divers), 'hotellerie']);
          notices.length = 0;
          await c.query(sql191);
          check('191 étape 0 : clé hors des 32 d\'origine, entrée sans singulier, entrée complète — laissées telles quelles',
            egal(await lex('hotellerie'), divers) && notices.some((n) => /entrée incomplète hotellerie\.chantier hors des 32 clés/.test(n)),
            JSON.stringify(await lex('hotellerie')));
        }
      } finally {
        await c.query('ROLLBACK').catch(() => {});
        c.removeListener('notice', onNotice);
        c.release();
      }
      check('191 : transaction d\'essai annulée (base inchangée)',
        egal(await ecartsEnBase(hot.id), hot.lexiqueEcarts) && egal(await ecartsEnBase(cer.id), cer.lexiqueEcarts));
    }

    // ── 3. Comptes de test Hôtellerie et Céramique ──────────────────────────────────────────────
    const creer = async (payload, libelle) => {
      const r = await post(A, '/admin/clients', payload);
      check(`POST /admin/clients ${libelle} → 201`, r.status === 201 && r.body?.id, `${r.status} ${r.body?.message || ''}`);
      if (!r.body?.id) throw new Error(`création du compte ${libelle} impossible`);
      createdClients.push(r.body.id);
      await pool.query(`UPDATE utilisateurs SET mot_de_passe = $1, actif = true WHERE id = $2`, [hash, r.body.id]);
      return r.body.id;
    };
    const hotelId = await creer({
      nom: 'TEST-Voc Hotel', email: HOTEL_EMAIL, telephone: '20999101', domaineId: hot.id, formuleActivites: 'premium', montantOnboarding: 700,
      composants: [{ code: 'restaurant', nb: 1 }, { code: 'cuisine', nb: 1 }, { code: 'responsable', nb: 1 }, { code: 'client_pro', nb: 10 }],
    }, 'Hôtellerie');
    await creer({
      nom: 'TEST-Voc Ceramique', email: CERAM_EMAIL, telephone: '20999102', domaineId: cer.id, formuleActivites: 'premium', montantOnboarding: 700,
      composants: [{ code: 'showroom', nb: 1 }, { code: 'usine', nb: 1 }],
    }, 'Céramique');
    const restoId = await creer({
      nom: 'TEST-Voc Resto', email: RESTO_EMAIL, telephone: '20999103', nbActivites: 1, nbLabos: 0, nbGerants: 0, nbAcheteurs: 0, montantOnboarding: 500,
    }, 'Restauration (payload historique, sans domaineId)');

    // Contrôles communs d'un domaine de compte (client / gérant) : profil complet, lexique résolu v2.
    const controlerDomaine = (libelle, domaine, dom) => {
      const attendu = resoudreLexique(LEXIQUE_DEFAUT, dom.lexiqueEcarts);
      check(`${libelle} : domaine { id, slug, nom } = ${dom.slug}`, domaine?.id === dom.id && domaine.slug === dom.slug && domaine.nom === dom.nom, JSON.stringify({ id: domaine?.id, slug: domaine?.slug }));
      check(`${libelle} : composants et règles présents (profil complet)`, Array.isArray(domaine?.composants) && domaine.composants.length > 0 && domaine.regles && typeof domaine.regles === 'object');
      check(`${libelle} : lexique entièrement résolu (40 clés du défaut, dans l'ordre)`, egal(Object.keys(domaine?.lexique || {}).slice(0, LEXIQUE_CLES.length), [...LEXIQUE_CLES]), String(Object.keys(domaine?.lexique || {}).length));
      check(`${libelle} : lexique = résolution v2 des écarts du domaine (clés dérivées, formes courtes)`, egal(domaine?.lexique, attendu));
      const derivees = LEXIQUE_CLES.filter((k) => LEXIQUE_DEFAUT[k].derive_de);
      check(`${libelle} : ${derivees.length} clés dérivées avec leur parent et leur mode`,
        derivees.every((k) => domaine?.lexique?.[k]?.derive_de === LEXIQUE_DEFAUT[k].derive_de && domaine.lexique[k].mode === LEXIQUE_DEFAUT[k].mode && !!domaine.lexique[k].sg));
    };

    // Hôtellerie
    const hotel = await login(HOTEL_EMAIL);
    check('login client Hôtellerie', !!hotel.token);
    const H = mk(hotel.token);
    controlerDomaine('/auth/login client Hôtellerie', hotel.user?.domaine, hot);
    ({ status, body } = await H('/auth/me'));
    check('/auth/me client Hôtellerie → 200', status === 200 && body?.role === 'client', String(status));
    const meHotel = body;
    controlerDomaine('/auth/me client Hôtellerie', meHotel?.domaine, hot);
    check('/auth/me = /auth/login (même domaine)', egal(meHotel?.domaine, hotel.user?.domaine));
    const lh = meHotel?.domaine?.lexique || {};
    const brouillonH = CIBLES_191.filter((x) => x[0] === 'hotellerie').every(([, cle, , attendu]) => egal(hot.lexiqueEcarts[cle], attendu))
      && egal(hot.lexiqueEcarts.activite, e4('Service', 'Services', 'm')) && egal(hot.lexiqueEcarts.acheteur, e4('Client professionnel', 'Clients professionnels', 'm'))
      && egal(hot.lexiqueEcarts.produit_vendable, e4('Prestation vendue', 'Prestations vendues', 'f'));
    if (brouillonH) {
      check('Hôtellerie : clés dérivées par gabarit — Espace Cuisine / Espaces Cuisine, Espace Services, Espace Clients professionnels',
        lh.espace_labo?.sg === 'Espace Cuisine' && lh.espace_labo.pl === 'Espaces Cuisine' && lh.espace_labo.g === 'm'
        && lh.espace_activites?.sg === 'Espace Services' && lh.espace_acheteurs?.sg === 'Espace Clients professionnels',
        JSON.stringify([lh.espace_labo?.sg, lh.espace_labo?.pl, lh.espace_activites?.sg, lh.espace_acheteurs?.sg]));
      check('Hôtellerie : gabarit dont le parent n\'est pas surchargé — Espace Vente, Espace Produit (défaut)',
        lh.espace_vente?.sg === 'Espace Vente' && lh.espace_produits?.sg === 'Espace Produit');
      check('Hôtellerie : clés dérivées par copie — labo_long / labo_desc = Cuisine centrale (f), activite_desc = Service (m)',
        lh.labo_long?.sg === 'Cuisine centrale' && lh.labo_long.g === 'f' && lh.labo_desc?.sg === 'Cuisine centrale' && lh.activite_desc?.sg === 'Service' && lh.activite_desc.g === 'm',
        JSON.stringify([lh.labo_long?.sg, lh.labo_desc?.sg, lh.activite_desc?.sg]));
      check('Hôtellerie : clés dérivées pluriel_titre — Prestations Vendues (f), Consommables, Prestations Catalogue',
        lh.cat_pt_vendable?.sg === 'Prestations Vendues' && lh.cat_pt_vendable.pl === 'Prestations Vendues' && lh.cat_pt_vendable.g === 'f'
        && lh.cat_pt_utilisable?.sg === 'Consommables' && lh.cat_pt_valorise?.sg === 'Prestations Catalogue',
        JSON.stringify([lh.cat_pt_vendable?.sg, lh.cat_pt_utilisable?.sg, lh.cat_pt_valorise?.sg]));
      check('Hôtellerie : formes courtes du brouillon — labo « Cuisine / Cuisines », pt « Prépa / Prépas »',
        egal(lh.labo?.court, { sg: 'Cuisine', pl: 'Cuisines' }) && egal(lh.pt?.court, { sg: 'Prépa', pl: 'Prépas' }), JSON.stringify([lh.labo?.court, lh.pt?.court]));
      check('Hôtellerie : forme courte du défaut héritée quand sg n\'est pas surchargé (appro « Appro », fiche_technique « FT »)',
        egal(lh.appro?.court, { sg: 'Appro', pl: 'Appros' }) && egal(lh.fiche_technique?.court, { sg: 'FT', pl: 'FT' }));
      check('Hôtellerie : sg surchargé sans forme courte → pas de forme courte ni d\'apposition héritées (activite, acheteur, gerant)',
        ['activite', 'acheteur', 'gerant'].every((k) => lh[k] && lh[k].court === undefined && lh[k].appo === undefined));
      check('Hôtellerie : food_cost « Ratio matière » ≠ cout_matiere « Coût matière »', lh.food_cost?.sg === 'Ratio matière' && lh.cout_matiere?.sg === 'Coût matière');
    } else {
      check('Hôtellerie : brouillon modifié depuis la migration 191 — contrôles littéraux sautés (contrôles génériques faits)', true);
    }
    ({ status, body } = await H('/api/domaines'));
    check('GET /api/domaines (client) → son seul domaine, lexique résolu, sans lexiqueEcarts',
      status === 200 && Array.isArray(body) && body.length === 1 && body[0].id === hot.id && egal(body[0].lexique, meHotel?.domaine?.lexique) && body[0].lexiqueEcarts === undefined,
      `${status}`);

    // Gérant du compte Hôtellerie (compte créé en SQL : aucun email) → domaine du compte parent.
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, gerant_parent_id, activated_at)
       VALUES ('TEST-Voc Gerant', $1, $2, 'gerant', true, $3, NOW())`,
      [GERANT_EMAIL, hash, hotelId]
    );
    const gerant = await login(GERANT_EMAIL);
    check('login gérant du compte Hôtellerie', !!gerant.token && gerant.user?.role === 'gerant', String(gerant.status));
    check('/auth/login gérant : même domaine que le compte parent (profil complet)', egal(gerant.user?.domaine, meHotel?.domaine));
    ({ status, body } = await mk(gerant.token)('/auth/me'));
    check('/auth/me gérant : même domaine que le compte parent', status === 200 && egal(body?.domaine, meHotel?.domaine), String(status));

    // Céramique
    const ceram = await login(CERAM_EMAIL);
    check('login client Céramique', !!ceram.token);
    controlerDomaine('/auth/login client Céramique', ceram.user?.domaine, cer);
    ({ status, body } = await mk(ceram.token)('/auth/me'));
    controlerDomaine('/auth/me client Céramique', body?.domaine, cer);
    const lc = body?.domaine?.lexique || {};
    const brouillonC = CIBLES_191.filter((x) => x[0] === 'ceramique').every(([, cle, , attendu]) => (attendu === null ? cer.lexiqueEcarts[cle] === undefined : egal(cer.lexiqueEcarts[cle], attendu)))
      && egal(cer.lexiqueEcarts.activite, e4('Point de vente', 'Points de vente', 'm')) && egal(cer.lexiqueEcarts.produit_valorise, e4('Produit fini catalogue', 'Produits finis catalogue', 'm'));
    if (brouillonC) {
      check('Céramique : perte revenue au défaut « Perte / Pertes » (f)', lc.perte?.sg === 'Perte' && lc.perte.pl === 'Pertes' && lc.perte.g === 'f', JSON.stringify(lc.perte));
      check('Céramique : formes courtes — labo « Site », pt « PF », fiche_technique « FCR », appro « Réception / Réceptions »',
        egal(lc.labo?.court, { sg: 'Site', pl: 'Sites' }) && egal(lc.pt?.court, { sg: 'PF', pl: 'PF' })
        && egal(lc.fiche_technique?.court, { sg: 'FCR', pl: 'FCR' }) && egal(lc.appro?.court, { sg: 'Réception', pl: 'Réceptions' }));
      check('Céramique : clés dérivées — Espace Site, Espace Points de vente, Espace Revendeurs, Produits Finis Catalogue, Semi-finis',
        lc.espace_labo?.sg === 'Espace Site' && lc.espace_activites?.sg === 'Espace Points de vente' && lc.espace_acheteurs?.sg === 'Espace Revendeurs'
        && lc.cat_pt_valorise?.sg === 'Produits Finis Catalogue' && lc.cat_pt_utilisable?.sg === 'Semi-finis',
        JSON.stringify([lc.espace_labo?.sg, lc.espace_activites?.sg, lc.espace_acheteurs?.sg, lc.cat_pt_valorise?.sg, lc.cat_pt_utilisable?.sg]));
      check('Céramique : copies — labo_long = Site de production (forme courte « Site »), activite_desc = Point de vente',
        lc.labo_long?.sg === 'Site de production' && egal(lc.labo_long.court, { sg: 'Site', pl: 'Sites' }) && lc.activite_desc?.sg === 'Point de vente');
    } else {
      check('Céramique : brouillon modifié depuis la migration 191 — contrôles littéraux sautés (contrôles génériques faits)', true);
    }

    // ── 4. Acheteur d'un compte Hôtellerie → lexique du vendeur, sans composants ni règles ──────
    ({ status, body } = await post(H, '/api/acheteurs', { nom: 'TEST-Voc Acheteur', entreprise: 'TEST-Voc Superette', email: ACHETEUR_EMAIL }));
    const fiche = body?.acheteurs?.[0];
    check('POST /api/acheteurs (fiche sans compte : aucune invitation envoyée) → 201', status === 201 && !!fiche?.id && body.invitations === 0, `${status} ${body?.message || ''}`);
    if (fiche?.id) {
      // Compte de connexion de l'acheteur posé en SQL (mot de passe connu, aucun email).
      const u = await pool.query(
        `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, activated_at)
         VALUES ('TEST-Voc Acheteur', $1, $2, 'acheteur', true, NOW()) RETURNING id`,
        [ACHETEUR_EMAIL, hash]
      );
      await pool.query('UPDATE acheteurs SET user_id = $1, updated_at = NOW() WHERE id = $2', [u.rows[0].id, fiche.id]);
      const ach = await login(ACHETEUR_EMAIL);
      check('login acheteur du compte Hôtellerie', !!ach.token && ach.user?.role === 'acheteur', String(ach.status));
      const controlerAcheteur = (libelle, domaine) => {
        check(`${libelle} : domaine = exactement { id, slug, nom, lexique } du client vendeur`,
          !!domaine && egal(Object.keys(domaine).sort(), ['id', 'lexique', 'nom', 'slug']) && domaine.id === hot.id && domaine.slug === 'hotellerie' && domaine.nom === hot.nom,
          JSON.stringify(domaine ? Object.keys(domaine) : domaine));
        check(`${libelle} : ni composants ni règles du vendeur`, !!domaine && !('composants' in domaine) && !('regles' in domaine));
        check(`${libelle} : lexique = lexique résolu du vendeur`, egal(domaine?.lexique, meHotel?.domaine?.lexique));
      };
      controlerAcheteur('/auth/login acheteur', ach.user?.domaine);
      ({ status, body } = await mk(ach.token)('/auth/me'));
      check('/auth/me acheteur → 200', status === 200 && body?.role === 'acheteur', String(status));
      controlerAcheteur('/auth/me acheteur', body?.domaine);
      // GET /api/domaines : même réduction (avant : profil « restauration » complet, composants et règles compris).
      const dAch = await mk(ach.token)('/api/domaines');
      check('GET /api/domaines (acheteur) → 200, un seul domaine', dAch.status === 200 && Array.isArray(dAch.body) && dAch.body.length === 1, String(dAch.status));
      controlerAcheteur('GET /api/domaines acheteur', Array.isArray(dAch.body) ? dAch.body[0] : null);
      if (brouillonH) {
        check('acheteur : il lit les mots du vendeur (acheteur = « Client professionnel », Espace Clients professionnels)',
          body?.domaine?.lexique?.acheteur?.sg === 'Client professionnel' && body.domaine.lexique.espace_acheteurs?.sg === 'Espace Clients professionnels');
      }
    }

    // ── 5. Compte restauration créé dans le même test → lexique par défaut ──────────────────────
    const resto = await login(RESTO_EMAIL);
    check('login client Restauration', !!resto.token);
    const R = mk(resto.token);
    controlerDomaine('/auth/login client Restauration', resto.user?.domaine, restau);
    ({ status, body } = await R('/auth/me'));
    controlerDomaine('/auth/me client Restauration', body?.domaine, restau);
    const lr = body?.domaine?.lexique || {};
    check('Restauration : lexique = lexique par défaut v2, au caractère près', JSON.stringify(lr) === JSON.stringify(LEXIQUE_DEFAUT));
    if (origine) {
      const diffs = Object.keys(origine).filter((k) => J5(origine[k]) !== J5(lr[k]));
      check('Restauration : les 32 clés d\'origine inchangées dans /auth/me (sg, pl, g, el, icon)', diffs.length === 0, diffs.join(', '));
    }
    check('Restauration : formes du défaut — Espace Labo, PT, Appro, FT, Laboratoire de production',
      lr.espace_labo?.sg === 'Espace Labo' && lr.pt?.court?.sg === 'PT' && lr.appro?.court?.sg === 'Appro' && lr.fiche_technique?.court?.sg === 'FT' && lr.labo_desc?.sg === 'Laboratoire de production');
    ({ status, body } = await A('/auth/me'));
    check('/auth/me admin : domaine null', status === 200 && body?.domaine === null, JSON.stringify(body?.domaine));

    // ── 6. Validation du lexique (PUT /api/domaines/:id) sur un domaine de test ─────────────────
    ({ status, body } = await post(A, '/api/domaines', { nom: DOM_NOM, slug: DOM_SLUG, description: 'Domaine de test du vocabulaire' }));
    check('POST /api/domaines (domaine de test) → 201, lexique par défaut, aucun écart',
      status === 201 && body?.slug === DOM_SLUG && JSON.stringify(body.lexique) === JSON.stringify(LEXIQUE_DEFAUT) && egal(body.lexiqueEcarts, {}), String(status));
    domId = body?.id;
    const refus = async (libelle, lexique, code, motif) => {
      const r = await put(A, `/api/domaines/${domId}`, { lexique });
      check(`PUT lexique ${libelle} → 400 ${code}`, r.status === 400 && r.body?.code === code && typeof r.body.message === 'string' && (!motif || motif.test(r.body.message)),
        `${r.status} ${r.body?.code} — ${r.body?.message}`);
    };
    // entrée incomplète : sg surchargé ⇒ pl, g, el obligatoires
    await refus('entrée incomplète { sg } seul', { labo: { sg: 'Atelier' } }, 'LEXIQUE_ENTREE_INCOMPLETE', /le pluriel, le genre, l'élision/);
    await refus('sg + pl sans genre ni élision', { labo: { sg: 'Atelier', pl: 'Ateliers' } }, 'LEXIQUE_ENTREE_INCOMPLETE', /le genre, l'élision/);
    await refus('sg + pl + g sans élision', { labo: { sg: 'Atelier', pl: 'Ateliers', g: 'm' } }, 'LEXIQUE_ENTREE_INCOMPLETE', /l'élision/);
    await refus('sg + g + el sans pluriel', { labo: { sg: 'Atelier', g: 'm', el: true } }, 'LEXIQUE_ENTREE_INCOMPLETE', /le pluriel/);
    await refus('clé dérivée incomplète', { espace_labo: { sg: 'Coin Atelier' } }, 'LEXIQUE_ENTREE_INCOMPLETE');
    await refus('forme courte : pluriel sans singulier', { labo: { court: { pl: 'Labs' } } }, 'LEXIQUE_ENTREE_INCOMPLETE', /forme courte/);
    // caractères interdits dans sg, pl, forme courte
    const complet = (patch) => ({ labo: { sg: 'Atelier', pl: 'Ateliers', g: 'm', el: true, ...patch } });
    await refus('« [ » dans sg', complet({ sg: 'Ate[lier' }), 'LEXIQUE_CARACTERE_INTERDIT', /le singulier/);
    await refus('balise « [[nom:vente]] » dans sg', complet({ sg: '[[nom:vente]]' }), 'LEXIQUE_CARACTERE_INTERDIT');
    await refus('« ] » dans pl', complet({ pl: 'Ateliers]' }), 'LEXIQUE_CARACTERE_INTERDIT', /le pluriel/);
    await refus('« | » dans pl', complet({ pl: 'Ateliers | Usines' }), 'LEXIQUE_CARACTERE_INTERDIT');
    await refus('« * » dans sg', complet({ sg: '*Atelier*' }), 'LEXIQUE_CARACTERE_INTERDIT');
    await refus('« \\ » dans sg', complet({ sg: 'Atelier\\Usine' }), 'LEXIQUE_CARACTERE_INTERDIT');
    await refus('« ` » dans sg', complet({ sg: '`Atelier`' }), 'LEXIQUE_CARACTERE_INTERDIT');
    await refus('retour à la ligne dans pl', complet({ pl: 'Ateliers\nUsines' }), 'LEXIQUE_CARACTERE_INTERDIT', /retour à la ligne/);
    await refus('« [ » dans la forme courte', complet({ court: { sg: '[At]', pl: 'At' } }), 'LEXIQUE_CARACTERE_INTERDIT', /forme courte \(singulier\)/);
    await refus('« * » dans le pluriel de la forme courte', complet({ court: { sg: 'At', pl: 'At*' } }), 'LEXIQUE_CARACTERE_INTERDIT', /forme courte \(pluriel\)/);
    await refus('pl seul avec « | » (sg non surchargé)', { labo: { pl: 'Labos | Usines' } }, 'LEXIQUE_CARACTERE_INTERDIT');
    // interpolation i18next ({{…}}, $t(…)), tabulation, séparateur de ligne Unicode, icône
    await refus('« $t( » dans sg (interpolation i18next)', complet({ sg: 'Atelier $t(common.save)' }), 'LEXIQUE_CARACTERE_INTERDIT', /« \$ »/);
    await refus('« {{ » dans pl', complet({ pl: 'Ateliers {{n}}' }), 'LEXIQUE_CARACTERE_INTERDIT', /« \{ »/);
    await refus('« } » dans la forme courte', complet({ court: { sg: 'At}', pl: 'At' } }), 'LEXIQUE_CARACTERE_INTERDIT');
    await refus('tabulation dans sg', complet({ sg: 'Ate\tlier' }), 'LEXIQUE_CARACTERE_INTERDIT', /tabulation/);
    await refus('séparateur de ligne U+2028 dans sg', complet({ sg: `Ate${String.fromCodePoint(0x2028)}lier` }), 'LEXIQUE_CARACTERE_INTERDIT', /retour à la ligne/);
    await refus('balise et retour à la ligne dans l\'icône', complet({ icon: '[[Nom:labo]]\n**x**' }), 'LEXIQUE_CARACTERE_INTERDIT', /l'icône/);
    // longueurs : 60 (sg, pl), 20 (forme courte), 8 (icône)
    await refus('sg de 61 caractères', complet({ sg: 'A'.repeat(61) }), 'LEXIQUE_TROP_LONG', /dépasse 60 caractères \(61 saisis\)/);
    await refus('pl de 5000 caractères', complet({ pl: 'A'.repeat(5000) }), 'LEXIQUE_TROP_LONG');
    await refus('forme courte de 21 caractères', complet({ court: { sg: 'A'.repeat(21), pl: 'A' } }), 'LEXIQUE_TROP_LONG', /forme courte/);
    await refus('icône de 9 caractères', complet({ icon: 'abcdefghi' }), 'LEXIQUE_TROP_LONG', /l'icône/);
    // clés réservées (noms d'Object.prototype)
    await refus('clé « constructor »', { constructor: { sg: 'X', pl: 'X', g: 'm', el: false } }, 'LEXIQUE_INVALIDE', /clé réservée « constructor »/);
    await refus('clé « __proto__ »', { ['__proto__']: { sg: 'X', pl: 'X', g: 'm', el: false } }, 'LEXIQUE_INVALIDE', /clé réservée « __proto__ »/);
    await refus('clé « prototype »', { prototype: { sg: 'X', pl: 'X', g: 'm', el: false } }, 'LEXIQUE_INVALIDE', /clé réservée/);
    // clé dérivée sans singulier : seule l'icône se change à part (un pluriel seul serait perdu en silence)
    await refus('clé dérivée : pluriel sans singulier', { labo_long: { pl: 'Grandes cuisines' } }, 'LEXIQUE_ENTREE_INCOMPLETE', /suit « labo »/);
    await refus('clé dérivée : genre sans singulier', { espace_labo: { g: 'f' } }, 'LEXIQUE_ENTREE_INCOMPLETE');
    // derive_de / mode / gabarit non surchargeables
    await refus('gabarit surchargé', { espace_labo: { gabarit: 'Coin [[Court:labo]]' } }, 'LEXIQUE_CHAMP_NON_SURCHARGEABLE', /gabarit/);
    await refus('derive_de surchargé', { labo_long: { sg: 'Grand atelier', pl: 'Grands ateliers', g: 'm', el: false, derive_de: 'activite' } }, 'LEXIQUE_CHAMP_NON_SURCHARGEABLE', /derive_de/);
    await refus('mode surchargé', { labo: { mode: 'copie' } }, 'LEXIQUE_CHAMP_NON_SURCHARGEABLE', /mode/);
    // formes invalides
    await refus('champ inconnu', { labo: { couleur: 'rouge' } }, 'LEXIQUE_INVALIDE');
    await refus('genre invalide', { labo: { g: 'x' } }, 'LEXIQUE_INVALIDE');
    await refus('lexique non objet', ['labo'], 'LEXIQUE_INVALIDE');
    check('après les refus : rien n\'a été écrit (aucun écart en base)', egal(await ecartsEnBase(domId), {}), JSON.stringify(await ecartsEnBase(domId)));

    // lexique valide : écarts nettoyés, clés dérivées résolues
    const valide = {
      labo: { sg: ' Atelier ', pl: 'Ateliers', g: 'm', el: true, court: { sg: 'Atel.', pl: 'Atel.' } },
      activite: { sg: 'Boutique', pl: 'Boutiques', g: 'f', el: false },
      pt: { court: { sg: 'PF' } },
      vente: { sg: '', pl: '' },
      stock: null,
    };
    ({ status, body } = await put(A, `/api/domaines/${domId}`, { lexique: valide }));
    const attenduEcarts = {
      labo: { sg: 'Atelier', pl: 'Ateliers', g: 'm', el: true, court: { sg: 'Atel.', pl: 'Atel.' } },
      activite: { sg: 'Boutique', pl: 'Boutiques', g: 'f', el: false },
      pt: { court: { sg: 'PF' } },
    };
    check('PUT lexique valide → 200, écarts stockés nettoyés (textes rognés, lignes vides retirées)', status === 200 && egal(body?.lexiqueEcarts, attenduEcarts) && egal(await ecartsEnBase(domId), attenduEcarts),
      `${status} ${JSON.stringify(body?.lexiqueEcarts || body?.message)}`);
    const lt = body?.lexique || {};
    check('PUT lexique valide : clés dérivées résolues — Espace Atel., Espace Boutiques, labo_long = Atelier, activite_desc = Boutique',
      lt.espace_labo?.sg === 'Espace Atel.' && lt.espace_activites?.sg === 'Espace Boutiques' && lt.labo_long?.sg === 'Atelier' && lt.labo_desc?.sg === 'Atelier' && lt.activite_desc?.sg === 'Boutique',
      JSON.stringify([lt.espace_labo?.sg, lt.espace_activites?.sg, lt.labo_long?.sg, lt.activite_desc?.sg]));
    check('PUT lexique valide : forme courte seule surchargée (pt : sg du défaut, court « PF ») ; appro garde « Appro »',
      lt.pt?.sg === 'Produit transformé' && egal(lt.pt.court, { sg: 'PF', pl: 'PF' }) && egal(lt.appro?.court, { sg: 'Appro', pl: 'Appros' }), JSON.stringify(lt.pt));
    check('PUT lexique valide : sg surchargé → apposition du défaut non héritée (labo, activite)', lt.labo?.appo === undefined && lt.activite?.appo === undefined);
    ({ status, body } = await A(`/api/domaines/${domId}`));
    check('GET /api/domaines/:id → lexique résolu + lexiqueEcarts + tarifs', status === 200 && egal(body?.lexiqueEcarts, attenduEcarts) && egal(body.lexique, lt) && !!body.tarifs, String(status));

    // Propagation : le compte restauration de test passe sur le domaine de test.
    ({ status, body } = await put(A, `/admin/clients/${restoId}`, { domaineId: domId }));
    check('PUT /admin/clients/:id { domaineId } (compte de test → domaine de test) → 200', status === 200 && body?.domaineId === domId, `${status} ${body?.message || ''}`);
    ({ status, body } = await R('/auth/me'));
    check('/auth/me du compte rattaché : lexique du domaine de test (Espace Atel., l\'atelier)',
      status === 200 && body?.domaine?.slug === DOM_SLUG && egal(body.domaine.lexique, lt), `${status} ${body?.domaine?.slug}`);
    ({ status, body } = await put(A, `/api/domaines/${domId}`, { lexique: { labo: { sg: 'Usine', pl: 'Usines', g: 'f', el: true } } }));
    check('PUT lexique (remplacement complet des écarts) → 200', status === 200 && egal(Object.keys(body?.lexiqueEcarts || {}), ['labo']) && body.lexique.activite.sg === 'Activité', String(status));
    ({ status, body } = await R('/auth/me'));
    check('/auth/me après changement de lexique : nouveau lexique sans attendre (cache du profil invalidé)',
      status === 200 && body?.domaine?.lexique?.labo?.sg === 'Usine' && body.domaine.lexique.espace_labo.sg === 'Espace Usine' && body.domaine.lexique.espace_activites.sg === 'Espace Activités',
      JSON.stringify([body?.domaine?.lexique?.labo?.sg, body?.domaine?.lexique?.espace_labo?.sg]));
    ({ status, body } = await put(A, `/api/domaines/${domId}`, { lexique: {} }));
    check('PUT lexique {} → retour au lexique par défaut', status === 200 && JSON.stringify(body?.lexique) === JSON.stringify(LEXIQUE_DEFAUT) && egal(body.lexiqueEcarts, {}), String(status));
    ({ status, body } = await put(A, `/api/domaines/${domId}`, { description: 'sans toucher au lexique' }));
    check('PUT sans lexique : écarts inchangés', status === 200 && egal(body?.lexiqueEcarts, {}), String(status));
    // Entrée redéclarée À L'IDENTIQUE du défaut : retirée au nettoyage (stockée, elle ferait perdre « PT » et l'apposition).
    ({ status, body } = await put(A, `/api/domaines/${domId}`, { lexique: {
      pt: { sg: 'Produit transformé', pl: 'Produits transformés', g: 'm', el: false },
      labo: { sg: 'Labo', pl: 'Labos', g: 'm', el: false, icon: '🏭' },
      labo_long: { icon: '🔬' },
    } }));
    check('PUT entrées identiques au défaut → 200, non stockées ; forme courte « PT » et apposition conservées ; icône seule d\'une clé dérivée admise',
      status === 200 && egal(body?.lexiqueEcarts, { labo_long: { icon: '🔬' } }) && egal(body.lexique.pt.court, { sg: 'PT', pl: 'PT' })
      && body.lexique.labo.appo === true && body.lexique.labo_long.sg === 'Laboratoire' && body.lexique.labo_long.icon === '🔬',
      `${status} ${JSON.stringify(body?.lexiqueEcarts || body?.message)}`);
    ({ status, body } = await put(A, `/api/domaines/${domId}`, { lexique: {} }));
    check('PUT lexique {} (remise à zéro du domaine de test) → 200', status === 200 && egal(body?.lexiqueEcarts, {}), String(status));

    // Domaine par défaut « restauration » : référence de l'invariant I1, son lexique ne reçoit aucun écart.
    ({ status, body } = await put(A, `/api/domaines/${restau.id}`, { lexique: { labo: { sg: 'Atelier', pl: 'Ateliers', g: 'm', el: true } } }));
    check('PUT lexique sur le domaine « restauration » → 400 LEXIQUE_DOMAINE_DEFAUT, rien n\'est écrit',
      status === 400 && body?.code === 'LEXIQUE_DOMAINE_DEFAUT' && egal(body.cles, ['labo']) && egal(await ecartsEnBase(restau.id), restau.lexiqueEcarts),
      `${status} ${body?.code} — ${body?.message}`);

    // Les domaines réels n'ont pas été modifiés par ce test.
    check('domaines hôtellerie, céramique et restauration : écarts en base inchangés par le test',
      egal(await ecartsEnBase(hot.id), hot.lexiqueEcarts) && egal(await ecartsEnBase(cer.id), cer.lexiqueEcarts) && egal(await ecartsEnBase(restau.id), restau.lexiqueEcarts));
  } catch (e) {
    check(`exécution interrompue : ${e.message}`, false);
  } finally {
    // ── Nettoyage ───────────────────────────────────────────────────────────────────────────────
    for (const id of createdClients) {
      const res = await fetch(`${BASE}/admin/clients/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adm.token}` } });
      check(`nettoyage client ${id} (DELETE 204)`, res.status === 204, String(res.status));
    }
    if (domId) {
      const res = await del(A, `/api/domaines/${domId}`);
      check('nettoyage domaine de test (DELETE 200 après suppression des clients)', res.status === 200, `${res.status} ${res.body?.message || ''}`);
    }
    await wipe().catch((e) => console.error('nettoyage SQL :', e.message));
    const reste = await pool.query(
      `SELECT (SELECT COUNT(*)::int FROM utilisateurs WHERE email = ANY($1)) AS users,
              (SELECT COUNT(*)::int FROM domaines_activite WHERE slug = $2 OR nom = $3) AS domaines,
              (SELECT COUNT(*)::int FROM acheteurs WHERE nom LIKE 'TEST-Voc %') AS acheteurs,
              (SELECT COUNT(*)::int FROM abonnements WHERE client_id = ANY($4)) AS abonnements`,
      [TOUS_EMAILS, DOM_SLUG, DOM_NOM, createdClients.length ? createdClients : [0]]
    );
    check('nettoyage complet (0 utilisateur, 0 domaine, 0 acheteur, 0 abonnement de test)',
      egal(reste.rows[0], { users: 0, domaines: 0, acheteurs: 0, abonnements: 0 }), JSON.stringify(reste.rows[0]));
  }

  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} tests OK${failed.length ? ' — ÉCHECS : ' + failed.map((f) => f.name).join(', ') : ''}`);
  await pool.end().catch(() => {});
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('ERREUR FATALE', e); process.exit(1); });
