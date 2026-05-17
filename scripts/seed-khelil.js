/**
 * Simulation complète — Mohamed Khelil (m.khelil.prof@gmail.com)
 *
 * Structure :
 *   - 60 ingrédients (12 catégories)
 *   - 1 labo central
 *   - 3 activités : 2 liées au labo, 1 indépendante (Stand Hôtel)
 *   - 4 fournisseurs
 *   - 1 gérant pour la 2e boutique
 *   - Abonnement entreprise avec 1 promotion 20% sur mensualité (Jan–Mar)
 *   - Flux complet Jan 1 → Mai 17 2026 :
 *       • Appros labo hebdomadaires (lundi)
 *       • Transferts labo → Boutique 1 & 2 (jeudi + dimanche)
 *       • Appros directes Stand Hôtel (mercredi)
 *       • Pertes hebdomadaires réalistes
 *       • Inventaires bimensuels (15 et fin de mois)
 *
 * Run : node scripts/seed-khelil.js
 * Login : m.khelil.prof@gmail.com / Demo@2026
 */

require('dotenv').config();
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function datesBetween(from, to, dayOfWeek) {
  // dayOfWeek: 0=Sun, 1=Mon, 4=Thu, 6=Sat
  const out = [];
  const f = new Date(from), t = new Date(to);
  const diff = (dayOfWeek - f.getDay() + 7) % 7;
  const cur = new Date(f);
  cur.setDate(cur.getDate() + diff);
  while (cur <= t) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 7);
  }
  return out;
}

function monthEndDates(from, to) {
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const mid = `2026-${String(m).padStart(2,'0')}-15`;
    const last = new Date(2026, m, 0);
    const end = last.toISOString().slice(0,10);
    if (mid >= from && mid <= to) out.push(mid);
    if (end >= from && end <= to && end !== mid) out.push(end);
  }
  return out.sort();
}

const jitter = (base, pct = 0.2) =>
  Math.round(base * (1 - pct + Math.random() * pct * 2) * 1000) / 1000;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    const EMAIL    = 'm.khelil.prof@gmail.com';
    const PASSWORD = 'Demo@2026';
    const NOM      = 'Mohamed Khelil';
    const START    = '2026-01-01';
    const END      = '2026-05-17';

    // ── Nettoyage ────────────────────────────────────────────────────────────
    await c.query(`DELETE FROM produit_sous_produits WHERE sous_produit_id IN (
      SELECT p.id FROM produits p JOIN utilisateurs u ON p.client_id = u.id WHERE u.email = $1)`, [EMAIL]);
    await c.query(`DELETE FROM utilisateurs WHERE email = $1`, [EMAIL]);
    console.log('Ancien compte nettoyé.');

    // ── 1. Utilisateur ────────────────────────────────────────────────────────
    const hash = await bcrypt.hash(PASSWORD, 10);
    const { rows: [u] } = await c.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, telephone, role, compte_type, onboarding_step, actif)
       VALUES ($1, $2, $3, '+216 98 765 432', 'client', 'entreprise', 0, true) RETURNING id`,
      [NOM, EMAIL, hash]
    );
    const clientId = u.id;
    console.log(`Client: ${NOM} (id=${clientId})`);

    // ── 2. Profil entreprise ─────────────────────────────────────────────────
    const { rows: [ep] } = await c.query(
      `INSERT INTO profil_entreprise (client_id, nom, email, telephone, adresse, meme_activite)
       VALUES ($1, 'Khelil Pâtisserie & Traiteur', $2, '+216 98 765 432',
               '14 Rue Ibn Khaldoun, 4000 Sousse', false) RETURNING id`,
      [clientId, EMAIL]
    );
    const epId = ep.id;

    // ── 3. Abonnement ─────────────────────────────────────────────────────────
    const { rows: [abo] } = await c.query(
      `INSERT INTO abonnements (client_id, compte_type, statut_onboarding, montant_onboarding,
         date_debut, date_onboarding, mode_compte, notes)
       VALUES ($1, 'entreprise', 'payé', 1500, '2026-01-01', '2026-01-03', 'actif',
               'Client premium — onboarding réglé le 03/01/2026') RETURNING id`,
      [clientId]
    );
    const aboId = abo.id;

    // Config abonnement (3 activités + 1 labo + 1 gérant)
    await c.query(
      `INSERT INTO abonnement_config (abonnement_id, nb_activites, nb_labos, nb_gerants, montant_onboarding)
       VALUES ($1, 3, 1, 1, 1500)`,
      [aboId]
    );

    // Paiements — Jan–Avr payés, Mai en attente
    const MONTANT_BASE = 400 + 160 + 80; // mensualite + labo + gérant = 640 DT/mois
    for (const [mois, statut, montant, datePaie] of [
      ['2026-01-01', 'payé',       Math.round(MONTANT_BASE * 0.8), '2026-01-05'], // -20% promo
      ['2026-02-01', 'payé',       Math.round(MONTANT_BASE * 0.8), '2026-02-04'], // -20% promo
      ['2026-03-01', 'payé',       Math.round(MONTANT_BASE * 0.8), '2026-03-06'], // -20% promo
      ['2026-04-01', 'payé',       MONTANT_BASE,                   '2026-04-03'], // plein tarif
      ['2026-05-01', 'en_attente', MONTANT_BASE,                   null],
    ]) {
      await c.query(
        `INSERT INTO paiements (abonnement_id, mois, montant_dt, statut, date_paiement, date_saisie)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [aboId, mois, montant, statut, datePaie]
      );
    }

    // Promotion : 20% sur mensualité pendant 3 mois (Jan–Mar 2026)
    const adminRes = await c.query(`SELECT id FROM utilisateurs WHERE role = 'super_admin' LIMIT 1`);
    const adminId = adminRes.rows[0]?.id ?? null;
    await c.query(
      `INSERT INTO promotions (abonnement_id, type, applies_to, discount_mensualite,
         date_debut, months_duration, date_fin, notes, created_by)
       VALUES ($1, 'percent_off', 'mensualite', 20,
               '2026-01-01', 3, '2026-03-31',
               'Promotion lancement partenariat — 3 mois à -20%', $2)`,
      [aboId, adminId]
    );
    console.log('Abonnement + promotion créés.');

    // ── 4. Unités globales (lookup only) ────────────────────────────────────
    const uniteNames = ['kg','g','L','ml','cl','pièces','sachet','boîte','rouleau'];
    const unites = {};
    for (const nom of uniteNames) {
      const { rows: [row] } = await c.query(
        `INSERT INTO unites (nom, client_id) VALUES ($1, NULL)
         ON CONFLICT (nom, client_id) DO UPDATE SET nom = EXCLUDED.nom RETURNING id`,
        [nom]
      );
      unites[nom] = row.id;
    }

    // ── 5. Catégories globales ────────────────────────────────────────────────
    const catDefs = [
      'Farines & Céréales', 'Sucres & Confiseries', 'Corps gras',
      'Produits laitiers & Œufs', 'Levures & Agents levants', 'Épices & Arômes',
      'Chocolat & Cacao', 'Fruits secs & Oléagineux', 'Emballages',
      'Produits frais', 'Boissons', 'Divers',
    ];
    const cats = {};
    for (const nom of catDefs) {
      const { rows: [row] } = await c.query(
        `INSERT INTO categories (nom) VALUES ($1) ON CONFLICT (nom) DO UPDATE SET nom = EXCLUDED.nom RETURNING id`,
        [nom]
      );
      cats[nom] = row.id;
    }

    // ── 6. 60 ingrédients ────────────────────────────────────────────────────
    // [nom, unite, categorie, prix_ref]
    const ingDefs = [
      // Farines & Céréales (8)
      ['Farine T45',              'kg',      'Farines & Céréales',          1.100],
      ['Farine T55',              'kg',      'Farines & Céréales',          1.050],
      ['Farine T65',              'kg',      'Farines & Céréales',          1.150],
      ['Farine de blé complet',   'kg',      'Farines & Céréales',          1.300],
      ['Fécule de maïs',          'kg',      'Farines & Céréales',          2.800],
      ['Semoule fine',            'kg',      'Farines & Céréales',          0.950],
      ['Flocons d\'avoine',        'kg',      'Farines & Céréales',          3.200],
      ['Farine de riz',           'kg',      'Farines & Céréales',          2.500],
      // Sucres & Confiseries (6)
      ['Sucre blanc',             'kg',      'Sucres & Confiseries',        0.900],
      ['Sucre glace',             'kg',      'Sucres & Confiseries',        1.200],
      ['Sucre roux',              'kg',      'Sucres & Confiseries',        1.400],
      ['Miel d\'acacia',           'kg',      'Sucres & Confiseries',        18.000],
      ['Glucose liquide',         'kg',      'Sucres & Confiseries',        4.500],
      ['Sirop d\'agave',           'L',       'Sucres & Confiseries',        12.000],
      // Corps gras (5)
      ['Beurre doux',             'kg',      'Corps gras',                  12.500],
      ['Beurre de cacao',         'kg',      'Corps gras',                  28.000],
      ['Huile végétale',          'L',       'Corps gras',                   2.800],
      ['Huile d\'olive vierge',    'L',       'Corps gras',                   7.500],
      ['Margarine pâtissière',    'kg',      'Corps gras',                   5.200],
      // Produits laitiers & Œufs (7)
      ['Lait entier',             'L',       'Produits laitiers & Œufs',    1.050],
      ['Lait concentré sucré',    'boîte',   'Produits laitiers & Œufs',    4.200],
      ['Crème fraîche 35%',       'L',       'Produits laitiers & Œufs',    6.800],
      ['Crème fraîche 15%',       'L',       'Produits laitiers & Œufs',    4.200],
      ['Fromage blanc',           'kg',      'Produits laitiers & Œufs',    5.500],
      ['Yaourt nature',           'kg',      'Produits laitiers & Œufs',    3.200],
      ['Œufs frais',               'pièces',  'Produits laitiers & Œufs',    0.450],
      // Levures & Agents levants (4)
      ['Levure fraîche',          'kg',      'Levures & Agents levants',    4.200],
      ['Levure sèche',            'g',       'Levures & Agents levants',    0.025],
      ['Bicarbonate alimentaire', 'kg',      'Levures & Agents levants',    2.100],
      ['Poudre à lever',          'kg',      'Levures & Agents levants',    8.500],
      // Épices & Arômes (8)
      ['Sel fin',                 'kg',      'Épices & Arômes',             0.250],
      ['Vanille en poudre',       'kg',      'Épices & Arômes',             120.000],
      ['Extrait de vanille',      'L',       'Épices & Arômes',             35.000],
      ['Cannelle moulue',         'kg',      'Épices & Arômes',             15.000],
      ['Anis vert',               'kg',      'Épices & Arômes',             12.000],
      ['Fleur d\'oranger',         'L',       'Épices & Arômes',             8.000],
      ['Colorant alimentaire',    'g',       'Épices & Arômes',             0.180],
      ['Zeste de citron séché',   'kg',      'Épices & Arômes',             22.000],
      // Chocolat & Cacao (5)
      ['Cacao en poudre',         'kg',      'Chocolat & Cacao',            18.000],
      ['Chocolat noir 70%',       'kg',      'Chocolat & Cacao',            32.000],
      ['Chocolat au lait',        'kg',      'Chocolat & Cacao',            28.000],
      ['Chocolat blanc',          'kg',      'Chocolat & Cacao',            30.000],
      ['Pâte à tartiner',         'kg',      'Chocolat & Cacao',            14.000],
      // Fruits secs & Oléagineux (8)
      ['Amandes effilées',        'kg',      'Fruits secs & Oléagineux',    22.000],
      ['Amandes entières',        'kg',      'Fruits secs & Oléagineux',    20.000],
      ['Pistaches décortiquées',  'kg',      'Fruits secs & Oléagineux',    45.000],
      ['Noisettes moulues',       'kg',      'Fruits secs & Oléagineux',    18.000],
      ['Noix de coco râpée',      'kg',      'Fruits secs & Oléagineux',    8.500],
      ['Raisins secs',            'kg',      'Fruits secs & Oléagineux',    6.200],
      ['Dattes dénoyautées',      'kg',      'Fruits secs & Oléagineux',    9.500],
      ['Pignons de pin',          'kg',      'Fruits secs & Oléagineux',    55.000],
      // Emballages (5)
      ['Boîtes gâteaux S',        'sachet',  'Emballages',                  0.800],
      ['Boîtes gâteaux M',        'sachet',  'Emballages',                  1.200],
      ['Caissettes dorées',       'sachet',  'Emballages',                  3.500],
      ['Sachets kraft',           'sachet',  'Emballages',                  5.200],
      ['Film alimentaire',        'rouleau', 'Emballages',                  2.800],
      // Produits frais (4)
      ['Citrons frais',           'kg',      'Produits frais',              1.800],
      ['Oranges fraîches',        'kg',      'Produits frais',              1.200],
      ['Fraises fraîches',        'kg',      'Produits frais',              6.500],
      ['Framboises fraîches',     'kg',      'Produits frais',              12.000],
      // Boissons (4)
      ['Eau minérale (bidons)',    'L',       'Boissons',                    0.350],
      ['Jus d\'orange pur',        'L',       'Boissons',                    2.800],
      ['Sirop de grenadine',      'L',       'Boissons',                    3.200],
      ['Lait de coco',            'L',       'Boissons',                    4.500],
      // Divers (1 — on arrive bien à 60)
      ['Gélatine (feuilles)',     'g',       'Divers',                      0.080],
    ];

    const ings = {};
    for (const [nom, unite, cat, prix] of ingDefs) {
      const { rows: [row] } = await c.query(
        `INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [nom, prix, unites[unite], clientId, cats[cat]]
      );
      ings[nom] = row.id;
    }
    console.log(`${ingDefs.length} ingrédients créés.`);

    // ── 7. Labo central ──────────────────────────────────────────────────────
    const { rows: [labo] } = await c.query(
      `INSERT INTO labos (entreprise_id, nom, referent_tel, adresse)
       VALUES ($1, 'Labo Central de Pâtisserie', '+216 98 765 433',
               '8 Rue des Artisans, Zone Industrielle Sousse') RETURNING id`,
      [epId]
    );
    const laboId = labo.id;
    console.log(`Labo: id=${laboId}`);

    // ── 8. Activités ─────────────────────────────────────────────────────────
    const actDefs = [
      { nom: 'Boutique Avenue Bourguiba', adresse: '22 Av. Habib Bourguiba, 4000 Sousse', tel: '+216 73 220 001', lieLabo: true },
      { nom: 'Boutique Zone Touristique', adresse: 'Av. Hedi Chaker, 4002 Sousse',        tel: '+216 73 220 002', lieLabo: true },
      { nom: 'Stand Hôtel Royal Palace',  adresse: 'Hôtel Royal Palace, 4089 Port El Kantaoui', tel: '+216 73 220 003', lieLabo: false },
    ];
    const actIds = [];
    for (const { nom, adresse, tel, lieLabo } of actDefs) {
      const { rows: [act] } = await c.query(
        `INSERT INTO activites (entreprise_id, nom, adresse, telephone, labo_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [epId, nom, adresse, tel, lieLabo ? laboId : null]
      );
      actIds.push(act.id);
      console.log(`  Activité: ${nom} (labo_id=${lieLabo ? laboId : 'NULL'})`);
    }
    const [actBourguiba, actZoneTour, actStand] = actIds;

    // ── 9. Gérant pour la Boutique Zone Touristique ──────────────────────────
    const gerantHash = await bcrypt.hash('Gerant@2026', 10);
    const inviteGerant = crypto.randomBytes(24).toString('hex');
    const inviteExp = new Date(Date.now() + 48 * 3600 * 1000);
    await c.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, telephone, role, compte_type,
         gerant_parent_id, gerant_activite_id, gerant_activite_type,
         gerant_est_gratuit, gerant_montant_mensuel, invite_token, invite_token_expires_at, actif)
       VALUES ('Salim Chaabane', 'gerant.zonetour@khelil.tn', $1, '+216 55 001 002', 'gerant', 'entreprise',
               $2, $3, 'activite', true, 0, $4, $5, true)`,
      [gerantHash, clientId, actZoneTour, inviteGerant, inviteExp]
    );
    console.log('Gérant créé: Salim Chaabane (Boutique Zone Touristique)');

    // ── 10. Fournisseurs ─────────────────────────────────────────────────────
    const fourDefs = [
      { nom: 'Minoterie du Sahel',     adresse: 'ZI Sousse Sud',             tel: '+216 73 400 100' },
      { nom: 'Frigorifique Sousse',    adresse: 'Route de Sfax, Sousse',     tel: '+216 73 400 200' },
      { nom: 'Épicerie Confiserie TN', adresse: 'Zone Commerciale, Tunis',   tel: '+216 71 234 001' },
      { nom: 'Embalys Packaging',      adresse: 'Av. de l\'Environnement, Sfax', tel: '+216 74 300 500' },
    ];
    const fourIds = {};
    for (const { nom, adresse, tel } of fourDefs) {
      const { rows: [f] } = await c.query(
        `INSERT INTO fournisseurs (entreprise_id, nom, adresse, telephone) VALUES ($1, $2, $3, $4) RETURNING id`,
        [epId, nom, adresse, tel]
      );
      fourIds[nom] = f.id;
      for (const actId of actIds) {
        await c.query(
          `INSERT INTO fournisseur_activites (fournisseur_id, activite_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [f.id, actId]
        );
      }
    }
    console.log('Fournisseurs créés.');

    // ── 11. Sélections ingrédients ───────────────────────────────────────────
    // Labo : toutes les matières premières (pas emballages, pas boissons, pas produits frais)
    const laboIngNames = ingDefs
      .filter(([,, cat]) => !['Emballages','Boissons','Produits frais'].includes(cat))
      .map(([nom]) => nom);
    for (const nom of laboIngNames) {
      await c.query(
        `INSERT INTO labo_ingredient_selections (labo_id, ingredient_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [laboId, ings[nom]]
      );
    }

    // Boutiques liées au labo : base + emballages (reçoivent via transferts pour les MP)
    const boutiqueIngNames = ['Farine T45','Farine T55','Sucre blanc','Sucre glace','Beurre doux',
      'Lait entier','Œufs frais','Cacao en poudre','Amandes effilées','Levure fraîche',
      'Boîtes gâteaux S','Boîtes gâteaux M','Caissettes dorées','Sachets kraft','Film alimentaire'];
    for (const actId of [actBourguiba, actZoneTour]) {
      for (const nom of boutiqueIngNames) {
        await c.query(
          `INSERT INTO activite_ingredient_selections (activite_id, ingredient_id, prix_unitaire, seuil_min)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [actId, ings[nom], ingDefs.find(d => d[0] === nom)?.[3] ?? 1, nom.includes('Boîte') ? 5 : nom.includes('Sachet') ? 3 : 15]
        );
      }
    }

    // Stand Hôtel (indépendant) : sélection plus petite, achète directement
    const standIngNames = ['Farine T55','Sucre blanc','Beurre doux','Lait entier','Œufs frais',
      'Cacao en poudre','Amandes effilées','Chocolat noir 70%','Crème fraîche 35%',
      'Vanille en poudre','Sel fin','Pistaches décortiquées','Dattes dénoyautées',
      'Boîtes gâteaux S','Boîtes gâteaux M','Caissettes dorées','Sachets kraft',
      'Fraises fraîches','Framboises fraîches'];
    for (const nom of standIngNames) {
      await c.query(
        `INSERT INTO activite_ingredient_selections (activite_id, ingredient_id, prix_unitaire, seuil_min)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [actStand, ings[nom], ingDefs.find(d => d[0] === nom)?.[3] ?? 1, 5]
      );
    }
    console.log('Sélections ingrédients créées.');

    // ── 12. Appros labo (chaque lundi) ───────────────────────────────────────
    const laboAppros = {
      'Farine T45':           { base: 150, four: 'Minoterie du Sahel' },
      'Farine T55':           { base: 120, four: 'Minoterie du Sahel' },
      'Farine T65':           { base: 40,  four: 'Minoterie du Sahel' },
      'Farine de blé complet':{ base: 25,  four: 'Minoterie du Sahel' },
      'Fécule de maïs':       { base: 15,  four: 'Épicerie Confiserie TN' },
      'Sucre blanc':          { base: 80,  four: 'Épicerie Confiserie TN' },
      'Sucre glace':          { base: 30,  four: 'Épicerie Confiserie TN' },
      'Sucre roux':           { base: 20,  four: 'Épicerie Confiserie TN' },
      'Beurre doux':          { base: 50,  four: 'Frigorifique Sousse' },
      'Beurre de cacao':      { base: 5,   four: 'Épicerie Confiserie TN' },
      'Huile végétale':       { base: 30,  four: 'Épicerie Confiserie TN' },
      'Margarine pâtissière': { base: 20,  four: 'Épicerie Confiserie TN' },
      'Lait entier':          { base: 100, four: 'Frigorifique Sousse' },
      'Lait concentré sucré': { base: 24,  four: 'Épicerie Confiserie TN' },
      'Crème fraîche 35%':    { base: 20,  four: 'Frigorifique Sousse' },
      'Œufs frais':           { base: 600, four: 'Frigorifique Sousse' },
      'Levure fraîche':       { base: 12,  four: 'Frigorifique Sousse' },
      'Levure sèche':         { base: 500, four: 'Épicerie Confiserie TN' },
      'Bicarbonate alimentaire':{ base: 3, four: 'Épicerie Confiserie TN' },
      'Poudre à lever':       { base: 4,   four: 'Épicerie Confiserie TN' },
      'Sel fin':              { base: 5,   four: 'Épicerie Confiserie TN' },
      'Vanille en poudre':    { base: 0.5, four: 'Épicerie Confiserie TN' },
      'Extrait de vanille':   { base: 1,   four: 'Épicerie Confiserie TN' },
      'Cannelle moulue':      { base: 2,   four: 'Épicerie Confiserie TN' },
      'Anis vert':            { base: 2,   four: 'Épicerie Confiserie TN' },
      'Fleur d\'oranger':      { base: 3,   four: 'Épicerie Confiserie TN' },
      'Cacao en poudre':      { base: 15,  four: 'Épicerie Confiserie TN' },
      'Chocolat noir 70%':    { base: 20,  four: 'Épicerie Confiserie TN' },
      'Chocolat au lait':     { base: 15,  four: 'Épicerie Confiserie TN' },
      'Chocolat blanc':       { base: 10,  four: 'Épicerie Confiserie TN' },
      'Amandes effilées':     { base: 12,  four: 'Épicerie Confiserie TN' },
      'Amandes entières':     { base: 8,   four: 'Épicerie Confiserie TN' },
      'Pistaches décortiquées':{ base: 5,  four: 'Épicerie Confiserie TN' },
      'Noisettes moulues':    { base: 6,   four: 'Épicerie Confiserie TN' },
      'Noix de coco râpée':   { base: 8,   four: 'Épicerie Confiserie TN' },
      'Raisins secs':         { base: 7,   four: 'Épicerie Confiserie TN' },
      'Dattes dénoyautées':   { base: 10,  four: 'Épicerie Confiserie TN' },
      'Pignons de pin':       { base: 2,   four: 'Épicerie Confiserie TN' },
    };

    let nAppros = 0;
    for (const dateStr of datesBetween(START, END, 1)) { // lundi
      for (const [nom, { base, four }] of Object.entries(laboAppros)) {
        const prix = jitter(ingDefs.find(d => d[0] === nom)?.[3] ?? 1, 0.05);
        await c.query(
          `INSERT INTO stock_labo_daily (labo_id, ingredient_id, date_appro, quantite, prix_unitaire, taux_tva)
           VALUES ($1, $2, $3, $4, $5, 19)`,
          [laboId, ings[nom], dateStr, jitter(base), prix]
        );
        nAppros++;
      }
    }
    console.log(`${nAppros} appros labo (lundis).`);

    // ── 13. Transferts labo → Boutiques (jeudi + dimanche) ──────────────────
    const transferDefs = {
      'Farine T45': 30, 'Farine T55': 25, 'Sucre blanc': 18, 'Sucre glace': 8,
      'Beurre doux': 12, 'Lait entier': 25, 'Œufs frais': 150, 'Levure fraîche': 3,
      'Cacao en poudre': 4, 'Amandes effilées': 3, 'Chocolat noir 70%': 5,
      'Crème fraîche 35%': 5, 'Vanille en poudre': 0.1,
    };

    let nTransfers = 0;
    for (const dateStr of [...datesBetween(START, END, 4), ...datesBetween(START, END, 0)].sort()) {
      for (const actId of [actBourguiba, actZoneTour]) {
        for (const [nom, base] of Object.entries(transferDefs)) {
          const qty = jitter(base);
          const prix = ingDefs.find(d => d[0] === nom)?.[3] ?? 1;
          await c.query(
            `INSERT INTO labo_transfers (labo_id, activite_id, ingredient_id, quantite, date_transfert, note, prix_unitaire)
             VALUES ($1, $2, $3, $4, $5, 'Transfert bi-hebdomadaire', $6)`,
            [laboId, actId, ings[nom], qty, dateStr, jitter(prix, 0.03)]
          );
          await c.query(
            `INSERT INTO stock_entreprise_daily
               (activite_id, ingredient_id, date_appro, quantite, type_appro, prix_unitaire)
             VALUES ($1, $2, $3, $4, 'transfert', $5)`,
            [actId, ings[nom], dateStr, qty, prix]
          );
          nTransfers++;
        }
      }
    }
    console.log(`${nTransfers} transferts labo → boutiques.`);

    // ── 14. Appros directes Boutiques (emballages, chaque 1er et 15) ────────
    const embalBoutique = [
      ['Boîtes gâteaux S',  'Embalys Packaging', 25],
      ['Boîtes gâteaux M',  'Embalys Packaging', 20],
      ['Caissettes dorées', 'Embalys Packaging', 15],
      ['Sachets kraft',     'Embalys Packaging', 10],
      ['Film alimentaire',  'Embalys Packaging', 5],
    ];
    let nEmbal = 0;
    for (let m = 1; m <= 5; m++) {
      for (const day of [1, 15]) {
        const dateStr = `2026-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        if (dateStr > END) continue;
        for (const actId of [actBourguiba, actZoneTour]) {
          for (const [nom, four, base] of embalBoutique) {
            const prix = ingDefs.find(d => d[0] === nom)?.[3] ?? 1;
            await c.query(
              `INSERT INTO stock_entreprise_daily
                 (activite_id, ingredient_id, date_appro, quantite, type_appro, fournisseur_id, prix_unitaire)
               VALUES ($1, $2, $3, $4, 'manuel', $5, $6)`,
              [actId, ings[nom], dateStr, jitter(base), fourIds[four], prix]
            );
            nEmbal++;
          }
        }
      }
    }
    console.log(`${nEmbal} appros emballages boutiques.`);

    // ── 15. Appros Stand Hôtel (mercredi) ────────────────────────────────────
    const standAppros = [
      ['Farine T55',          'Minoterie du Sahel',     15],
      ['Sucre blanc',         'Épicerie Confiserie TN', 10],
      ['Beurre doux',         'Frigorifique Sousse',     8],
      ['Lait entier',         'Frigorifique Sousse',    15],
      ['Œufs frais',           'Frigorifique Sousse',    80],
      ['Cacao en poudre',     'Épicerie Confiserie TN',  3],
      ['Amandes effilées',    'Épicerie Confiserie TN',  2],
      ['Chocolat noir 70%',   'Épicerie Confiserie TN',  4],
      ['Crème fraîche 35%',   'Frigorifique Sousse',     4],
      ['Pistaches décortiquées','Épicerie Confiserie TN', 1.5],
      ['Dattes dénoyautées',  'Épicerie Confiserie TN',  3],
      ['Fraises fraîches',    'Frigorifique Sousse',     5],
      ['Framboises fraîches', 'Frigorifique Sousse',     2],
      ['Boîtes gâteaux S',    'Embalys Packaging',       8],
      ['Caissettes dorées',   'Embalys Packaging',       5],
    ];
    let nStand = 0;
    for (const dateStr of datesBetween(START, END, 3)) { // mercredi
      for (const [nom, four, base] of standAppros) {
        const prix = ingDefs.find(d => d[0] === nom)?.[3] ?? 1;
        await c.query(
          `INSERT INTO stock_entreprise_daily
             (activite_id, ingredient_id, date_appro, quantite, type_appro, fournisseur_id, prix_unitaire)
           VALUES ($1, $2, $3, $4, 'manuel', $5, $6)`,
          [actStand, ings[nom], dateStr, jitter(base), fourIds[four], prix]
        );
        nStand++;
      }
    }
    console.log(`${nStand} appros stand hôtel (mercredis).`);

    // ── 16. Pertes activités (hebdomadaires, vendredi) ───────────────────────
    const pertesDefs = [
      // [actIdx, ing, type, base_qty]
      [0, 'Farine T55',        'dechet', 2.0],
      [0, 'Beurre doux',       'avarie', 0.5],
      [0, 'Œufs frais',         'avarie', 6],
      [1, 'Farine T45',        'dechet', 1.8],
      [1, 'Levure fraîche',    'avarie', 0.3],
      [1, 'Crème fraîche 35%', 'avarie', 0.5],
      [2, 'Fraises fraîches',  'avarie', 0.8],  // Stand — fruits frais
      [2, 'Framboises fraîches','avarie',0.4],
      [2, 'Beurre doux',       'avarie', 0.3],
    ];
    let nPertes = 0;
    for (const dateStr of datesBetween(START, END, 5)) { // vendredi
      for (const [idx, nom, type, base] of pertesDefs) {
        const prix = ingDefs.find(d => d[0] === nom)?.[3] ?? 1;
        await c.query(
          `INSERT INTO pertes (activite_id, ingredient_id, quantite, type_perte, date_perte, prix_unitaire)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [actIds[idx], ings[nom], jitter(base), type, dateStr, prix]
        );
        nPertes++;
      }
    }
    console.log(`${nPertes} pertes activités (vendredis).`);

    // ── 17. Pertes labo (mensuel) ────────────────────────────────────────────
    const pertesLaboDefs = [
      ['Farine T55',   'dechet', 6.0],
      ['Levure fraîche','avarie', 0.8],
      ['Beurre de cacao','avarie',0.5],
    ];
    let nPertesLabo = 0;
    for (let m = 1; m <= 5; m++) {
      const dateStr = `2026-${String(m).padStart(2,'0')}-28`;
      if (dateStr > END) continue;
      for (const [nom, type, base] of pertesLaboDefs) {
        const prix = ingDefs.find(d => d[0] === nom)?.[3] ?? 1;
        await c.query(
          `INSERT INTO labo_pertes (labo_id, ingredient_id, quantite, type_perte, date_perte, prix_unitaire)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [laboId, ings[nom], jitter(base), type, dateStr, prix]
        );
        nPertesLabo++;
      }
    }
    console.log(`${nPertesLabo} pertes labo.`);

    // ── 18. Inventaires bimensuels ───────────────────────────────────────────
    const invIngLabo = ['Farine T55','Sucre blanc','Beurre doux','Lait entier','Œufs frais',
      'Cacao en poudre','Amandes effilées','Chocolat noir 70%','Levure fraîche'];
    const invIngAct  = ['Farine T55','Sucre blanc','Beurre doux','Lait entier','Œufs frais',
      'Boîtes gâteaux S','Caissettes dorées'];

    let nInv = 0;
    for (const dateStr of monthEndDates(START, END)) {
      // Labo
      for (const nom of invIngLabo) {
        const ref = laboAppros[nom]?.base ?? 20;
        await c.query(
          `INSERT INTO inventaires (labo_id, ingredient_id, quantite_reelle, date_inventaire, note)
           VALUES ($1, $2, $3, $4, 'Inventaire bimensuel labo')`,
          [laboId, ings[nom], jitter(ref * 0.55), dateStr]
        );
        nInv++;
      }
      // Boutiques (liées labo)
      for (const actId of [actBourguiba, actZoneTour]) {
        for (const nom of invIngAct) {
          await c.query(
            `INSERT INTO inventaires (activite_id, ingredient_id, quantite_reelle, date_inventaire, note)
             VALUES ($1, $2, $3, $4, 'Inventaire bimensuel boutique')`,
            [actId, ings[nom], jitter(20), dateStr]
          );
          nInv++;
        }
      }
      // Stand Hôtel
      for (const nom of ['Farine T55','Beurre doux','Œufs frais','Fraises fraîches']) {
        await c.query(
          `INSERT INTO inventaires (activite_id, ingredient_id, quantite_reelle, date_inventaire, note)
           VALUES ($1, $2, $3, $4, 'Inventaire stand hôtel')`,
          [actStand, ings[nom], jitter(8), dateStr]
        );
        nInv++;
      }
    }
    console.log(`${nInv} inventaires.`);

    // ── 19. Agent IA ─────────────────────────────────────────────────────────
    const inviteToken = crypto.randomBytes(24).toString('hex');
    await c.query(
      `INSERT INTO ai_assistant_config (client_id, enabled, invite_token, confidence_threshold)
       VALUES ($1, true, $2, 0.75)
       ON CONFLICT (client_id) DO UPDATE SET enabled = true, invite_token = $2`,
      [clientId, inviteToken]
    );

    await c.query('COMMIT');

    const monLundi = datesBetween(START, END, 1).length;
    const nbTransferDates = (datesBetween(START, END, 4).length + datesBetween(START, END, 0).length);

    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log('  ✅ Simulation "Khelil Pâtisserie & Traiteur" créée avec succès !');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log(`  Email    : ${EMAIL}`);
    console.log(`  Password : ${PASSWORD}`);
    console.log(`  Client ID: ${clientId}`);
    console.log(`  Labo ID  : ${laboId}`);
    console.log(`  Activités: Boutique Bourguiba (${actBourguiba}), Zone Touristique (${actZoneTour}), Stand Hôtel (${actStand})`);
    console.log(`  Gérant   : Salim Chaabane → Boutique Zone Touristique`);
    console.log(`  Promo    : 20% sur mensualité Jan–Mar 2026`);
    console.log(`  IA Token : ${inviteToken}`);
    console.log('──────────────────────────────────────────────────────────────────────');
    console.log(`  60 ingrédients / 12 catégories / 4 fournisseurs`);
    console.log(`  ${nAppros} appros labo (${monLundi} lundis × ${Object.keys(laboAppros).length} ings)`);
    console.log(`  ${nTransfers} transferts labo → 2 boutiques (${nbTransferDates} dates × 2 acts × ${Object.keys(transferDefs).length} ings)`);
    console.log(`  ${nEmbal} appros emballages boutiques`);
    console.log(`  ${nStand} appros stand hôtel (mercredis)`);
    console.log(`  ${nPertes + nPertesLabo} pertes (${nPertes} activités vendredis + ${nPertesLabo} labo mensuelles)`);
    console.log(`  ${nInv} inventaires bimensuels (labo + 3 activités)`);
    console.log('══════════════════════════════════════════════════════════════════════\n');

  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('\n❌ Erreur:', err.message);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
}

main();
