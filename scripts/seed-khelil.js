/**
 * Simulation complète — Mohamed Khelil (m.khelil.prof@gmail.com)
 * Domaine : Restauration tunisienne
 *
 * Structure :
 *   - 50 ingrédients depuis le catalogue global Restauration
 *   - 1 labo central
 *   - 3 activités : 2 liées au labo, 1 indépendante (Stand Hôtel)
 *   - 4 fournisseurs
 *   - 1 gérant pour la 2e activité
 *   - Abonnement entreprise + promotion 20% Jan–Mar 2026 (créée par super_admin)
 *   - Flux complet Jan 1 → Mai 17 2026 :
 *       • Appros labo hebdomadaires (lundi)
 *       • Transferts labo → activités (jeudi + dimanche)
 *       • Appros directes Stand Hôtel (mercredi)
 *       • Pertes hebdomadaires (vendredi)
 *       • Inventaires bimensuels (15 et fin de mois)
 *   - Agent IA activé + email de bienvenue + email activation agent
 *
 * Run : node scripts/seed-khelil.js
 * Login : m.khelil.prof@gmail.com / Demo@2026
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendWelcomeWithContractEmail, sendAiAgentInviteEmail } = require('../src/services/emailService');

// ─── Auto-apply migration 078 if domaines_activite doesn't exist ──────────────
async function ensureMigration078() {
  // Delegate to the official migration runner — it handles tracking, idempotency,
  // and error reporting for every migration including 078.
  const migrate = require('../src/config/migrate');
  await migrate();

  // Verify the restauration row exists (extra guard for partial-run edge cases).
  const { rows } = await pool.query(
    `SELECT 1 FROM domaines_activite WHERE slug = 'restauration' LIMIT 1`
  ).catch(() => ({ rows: [] }));

  if (rows.length === 0) {
    throw new Error(
      'Migration 078 appliquée mais domaine restauration manquant — vérifiez les logs migrate.'
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function datesBetween(from, to, dayOfWeek) {
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
    const end = last.toISOString().slice(0, 10);
    if (mid >= from && mid <= to) out.push(mid);
    if (end >= from && end <= to && end !== mid) out.push(end);
  }
  return out.sort();
}

const jitter = (base, pct = 0.15) =>
  Math.round(base * (1 - pct + Math.random() * pct * 2) * 1000) / 1000;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await ensureMigration078();

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

    // ── 2. Domaine Restauration ───────────────────────────────────────────────
    const { rows: [domaine] } = await c.query(
      `SELECT id FROM domaines_activite WHERE slug = 'restauration'`
    );
    if (!domaine) throw new Error('Migration 078 non appliquée — domaines_activite manquant');
    const domaineId = domaine.id;

    // ── 3. Profil entreprise ─────────────────────────────────────────────────
    const { rows: [ep] } = await c.query(
      `INSERT INTO profil_entreprise (client_id, nom, email, telephone, adresse, meme_activite, domaine_id)
       VALUES ($1, 'Khelil Restauration & Traiteur', $2, '+216 98 765 432',
               '12 Rue Farhat Hached, 4000 Sousse', false, $3) RETURNING id`,
      [clientId, EMAIL, domaineId]
    );
    const epId = ep.id;

    // ── 4. Abonnement ─────────────────────────────────────────────────────────
    const { rows: [abo] } = await c.query(
      `INSERT INTO abonnements (client_id, compte_type, statut_onboarding, montant_onboarding,
         date_debut, date_onboarding, mode_compte, notes)
       VALUES ($1, 'entreprise', 'payé', 1500, '2026-01-01', '2026-01-03', 'actif',
               'Client premium Restauration — onboarding réglé le 03/01/2026') RETURNING id`,
      [clientId]
    );
    const aboId = abo.id;

    await c.query(
      `INSERT INTO abonnement_config (abonnement_id, nb_activites, nb_labos, nb_gerants, montant_onboarding)
       VALUES ($1, 3, 1, 1, 1500)`,
      [aboId]
    );

    // Paiements — Jan–Avr payés (-20% promo), Mai en attente
    const MONTANT_BASE = 400 + 160 + 80; // 640 DT/mois
    for (const [mois, statut, montant, datePaie] of [
      ['2026-01-01', 'payé',       Math.round(MONTANT_BASE * 0.8), '2026-01-05'],
      ['2026-02-01', 'payé',       Math.round(MONTANT_BASE * 0.8), '2026-02-04'],
      ['2026-03-01', 'payé',       Math.round(MONTANT_BASE * 0.8), '2026-03-06'],
      ['2026-04-01', 'payé',       MONTANT_BASE,                   '2026-04-03'],
      ['2026-05-01', 'en_attente', MONTANT_BASE,                   null],
    ]) {
      await c.query(
        `INSERT INTO paiements (abonnement_id, mois, montant_dt, statut, date_paiement, date_saisie)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [aboId, mois, montant, statut, datePaie]
      );
    }

    // Promotion 20% sur mensualité Jan–Mar 2026 (affectée par le super_admin)
    const adminRes = await c.query(`SELECT id FROM utilisateurs WHERE role = 'super_admin' LIMIT 1`);
    const adminId = adminRes.rows[0]?.id ?? null;
    await c.query(
      `INSERT INTO promotions (abonnement_id, type, applies_to, discount_mensualite,
         date_debut, months_duration, date_fin, notes, created_by)
       VALUES ($1, 'percent_off', 'mensualite', 20,
               '2026-01-01', 3, '2026-03-31',
               'Promotion lancement partenariat Restauration — 3 mois à -20%', $2)`,
      [aboId, adminId]
    );
    console.log('Abonnement + promotion créés.');

    // ── 5. Catalogue global Restauration (50 ingrédients) ────────────────────
    const ingRows = await c.query(
      `SELECT i.id, i.nom, u.nom as unite, c.nom as categorie, i.prix
       FROM ingredients i
       JOIN unites u ON u.id = i.unite_id
       JOIN categories cat_dom ON cat_dom.id = i.categorie_id
       JOIN domaines_activite da ON da.id = cat_dom.domaine_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       WHERE i.client_id IS NULL AND da.slug = 'restauration'
       ORDER BY c.nom, i.nom
       LIMIT 50`
    );

    if (ingRows.rows.length === 0) {
      throw new Error('Aucun ingrédient global Restauration trouvé — migration 078 non exécutée ?');
    }

    const ings = {};
    for (const row of ingRows.rows) {
      ings[row.nom] = { id: row.id, unite: row.unite, prix: parseFloat(row.prix), categorie: row.categorie };
    }
    const ingNames = Object.keys(ings);
    console.log(`${ingNames.length} ingrédients du catalogue global Restauration.`);

    // ── 6. Labo central ──────────────────────────────────────────────────────
    const { rows: [labo] } = await c.query(
      `INSERT INTO labos (entreprise_id, nom, referent_tel, adresse)
       VALUES ($1, 'Cuisine Centrale Khelil', '+216 98 765 433',
               '8 Rue de l''Industrie, Zone Commerciale Sousse') RETURNING id`,
      [epId]
    );
    const laboId = labo.id;
    console.log(`Labo: id=${laboId}`);

    // ── 7. Activités ─────────────────────────────────────────────────────────
    const actDefs = [
      { nom: 'Restaurant Avenue Bourguiba', adresse: '18 Av. Habib Bourguiba, 4000 Sousse', tel: '+216 73 220 001', lieLabo: true },
      { nom: 'Restaurant Zone Touristique', adresse: 'Av. Hedi Chaker, 4002 Sousse',        tel: '+216 73 220 002', lieLabo: true },
      { nom: 'Stand Buffet Hôtel Royal',    adresse: 'Hôtel Royal Palace, 4089 Port El Kantaoui', tel: '+216 73 220 003', lieLabo: false },
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
    const [actResto1, actResto2, actStand] = actIds;

    // ── 8. Gérant pour Restaurant Zone Touristique ───────────────────────────
    const gerantHash = await bcrypt.hash('Gerant@2026', 10);
    const inviteGerant = crypto.randomBytes(24).toString('hex');
    const inviteExp = new Date(Date.now() + 48 * 3600 * 1000);
    await c.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, telephone, role, compte_type,
         gerant_parent_id, gerant_activite_id, gerant_activite_type,
         gerant_est_gratuit, gerant_montant_mensuel, invite_token, invite_token_expires_at, actif)
       VALUES ('Salim Chaabane', 'gerant.resto2@khelil.tn', $1, '+216 55 001 002', 'gerant', 'entreprise',
               $2, $3, 'activite', true, 0, $4, $5, true)`,
      [gerantHash, clientId, actResto2, inviteGerant, inviteExp]
    );
    console.log('Gérant créé: Salim Chaabane (Restaurant Zone Touristique)');

    // ── 9. Fournisseurs ───────────────────────────────────────────────────────
    const fourDefs = [
      { nom: 'Boucherie El Wafa',       adresse: 'Marché Central Sousse',          tel: '+216 73 400 100' },
      { nom: 'Marché de Gros Sousse',   adresse: 'Zone Industrielle Sousse Nord',  tel: '+216 73 400 200' },
      { nom: 'Épicerie Sakia el Hamra', adresse: 'Rue du Sahel, Sousse',           tel: '+216 73 400 300' },
      { nom: 'Embalys Packaging',       adresse: 'Av. de l\'Environnement, Sfax',  tel: '+216 74 300 500' },
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

    // ── 10. Sélections ingrédients labo ──────────────────────────────────────
    // Labo : toutes les matières (hors emballages stand)
    const laboIngNames = ingNames.filter(n =>
      !ings[n].categorie.includes('Emballages')
    );
    for (const nom of laboIngNames) {
      await c.query(
        `INSERT INTO labo_ingredient_selections (labo_id, ingredient_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [laboId, ings[nom].id]
      );
    }

    // Restaurants liés labo : reçoivent via transferts
    const restoIngNames = [
      'Farine blanche T55', 'Semoule fine', 'Riz long grain', 'Pâtes (spaghetti)', 'Couscous moyen',
      'Poulet entier', 'Escalopes de poulet', 'Bœuf haché', 'Merguez fraîche',
      'Tomates fraîches', 'Oignons', 'Pommes de terre', 'Carottes', 'Courgettes', 'Ail',
      'Pois chiches', 'Lentilles corail',
      'Sel fin', 'Cumin moulu', 'Harissa (conserve)', 'Concentré de tomate',
      'Huile végétale', 'Beurre doux',
      'Boîtes à emporter (small)', 'Boîtes à emporter (large)', 'Sacs kraft (emporter)',
    ].filter(n => ings[n]);

    for (const actId of [actResto1, actResto2]) {
      for (const nom of restoIngNames) {
        await c.query(
          `INSERT INTO activite_ingredient_selections (activite_id, ingredient_id, prix_unitaire, seuil_min)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [actId, ings[nom].id, ings[nom].prix, nom.includes('Boîte') || nom.includes('Sac') ? 50 : 10]
        );
      }
    }

    // Stand Buffet (indépendant) : commande directement
    const standIngNames = [
      'Poulet entier', 'Escalopes de poulet', 'Bœuf haché',
      'Tomates fraîches', 'Oignons', 'Pommes de terre', 'Carottes', 'Poivrons rouges',
      'Pois chiches', 'Lentilles corail',
      'Sel fin', 'Cumin moulu', 'Paprika doux', 'Harissa (conserve)',
      'Huile végétale', 'Œufs frais',
      'Boîtes à emporter (small)', 'Boîtes à emporter (large)', 'Couverts jetables (set)',
    ].filter(n => ings[n]);

    for (const nom of standIngNames) {
      await c.query(
        `INSERT INTO activite_ingredient_selections (activite_id, ingredient_id, prix_unitaire, seuil_min)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [actStand, ings[nom].id, ings[nom].prix, 5]
      );
    }
    console.log('Sélections ingrédients créées.');

    // ── 11. Appros labo (chaque lundi) ────────────────────────────────────────
    // [nom, base_qty, fournisseur]
    const laboAppros = {
      'Farine blanche T55':     { base: 80,  four: 'Épicerie Sakia el Hamra' },
      'Semoule fine':           { base: 50,  four: 'Épicerie Sakia el Hamra' },
      'Semoule grosse':         { base: 30,  four: 'Épicerie Sakia el Hamra' },
      'Riz long grain':         { base: 60,  four: 'Épicerie Sakia el Hamra' },
      'Pâtes (spaghetti)':      { base: 40,  four: 'Épicerie Sakia el Hamra' },
      'Couscous moyen':         { base: 35,  four: 'Épicerie Sakia el Hamra' },
      'Poulet entier':          { base: 50,  four: 'Boucherie El Wafa' },
      'Escalopes de poulet':    { base: 30,  four: 'Boucherie El Wafa' },
      'Bœuf haché':             { base: 20,  four: 'Boucherie El Wafa' },
      'Côtelettes d\'agneau':   { base: 10,  four: 'Boucherie El Wafa' },
      'Merguez fraîche':        { base: 15,  four: 'Boucherie El Wafa' },
      'Kefta (viande hachée épicée)': { base: 12, four: 'Boucherie El Wafa' },
      'Sardines fraîches':      { base: 15,  four: 'Marché de Gros Sousse' },
      'Tomates fraîches':       { base: 60,  four: 'Marché de Gros Sousse' },
      'Oignons':                { base: 40,  four: 'Marché de Gros Sousse' },
      'Pommes de terre':        { base: 80,  four: 'Marché de Gros Sousse' },
      'Carottes':               { base: 30,  four: 'Marché de Gros Sousse' },
      'Poivrons rouges':        { base: 15,  four: 'Marché de Gros Sousse' },
      'Courgettes':             { base: 25,  four: 'Marché de Gros Sousse' },
      'Ail':                    { base: 8,   four: 'Marché de Gros Sousse' },
      'Piment rouge frais':     { base: 5,   four: 'Marché de Gros Sousse' },
      'Navets':                 { base: 20,  four: 'Marché de Gros Sousse' },
      'Pois chiches':           { base: 20,  four: 'Épicerie Sakia el Hamra' },
      'Lentilles corail':       { base: 15,  four: 'Épicerie Sakia el Hamra' },
      'Haricots blancs':        { base: 12,  four: 'Épicerie Sakia el Hamra' },
      'Sel fin':                { base: 5,   four: 'Épicerie Sakia el Hamra' },
      'Cumin moulu':            { base: 2,   four: 'Épicerie Sakia el Hamra' },
      'Coriandre moulue':       { base: 1.5, four: 'Épicerie Sakia el Hamra' },
      'Paprika doux':           { base: 1.5, four: 'Épicerie Sakia el Hamra' },
      'Curcuma':                { base: 1,   four: 'Épicerie Sakia el Hamra' },
      'Poivre noir moulu':      { base: 1,   four: 'Épicerie Sakia el Hamra' },
      'Tabel (mélange d\'épices tunisien)': { base: 2, four: 'Épicerie Sakia el Hamra' },
      'Huile végétale':         { base: 40,  four: 'Épicerie Sakia el Hamra' },
      'Concentré de tomate':    { base: 10,  four: 'Épicerie Sakia el Hamra' },
      'Olives noires':          { base: 8,   four: 'Épicerie Sakia el Hamra' },
      'Lait entier':            { base: 30,  four: 'Marché de Gros Sousse' },
      'Crème fraîche 35%':      { base: 10,  four: 'Marché de Gros Sousse' },
      'Œufs frais':             { base: 300, four: 'Marché de Gros Sousse' },
    };

    // Filtrer pour ne garder que ceux dans le catalogue
    const laboApprosFiltres = Object.fromEntries(
      Object.entries(laboAppros).filter(([n]) => ings[n])
    );

    let nAppros = 0;
    for (const dateStr of datesBetween(START, END, 1)) {
      for (const [nom, { base, four }] of Object.entries(laboApprosFiltres)) {
        await c.query(
          `INSERT INTO stock_labo_daily (labo_id, ingredient_id, date_appro, quantite, prix_unitaire, taux_tva)
           VALUES ($1, $2, $3, $4, $5, 19)`,
          [laboId, ings[nom].id, dateStr, jitter(base), jitter(ings[nom].prix, 0.05)]
        );
        nAppros++;
      }
    }
    console.log(`${nAppros} appros labo (lundis).`);

    // ── 12. Transferts labo → Restaurants (jeudi + dimanche) ─────────────────
    const transferDefs = {
      'Farine blanche T55':  20,  'Semoule fine': 12, 'Riz long grain': 15,
      'Pâtes (spaghetti)':   10,  'Couscous moyen': 8,
      'Poulet entier':       12,  'Escalopes de poulet': 8, 'Bœuf haché': 5,
      'Merguez fraîche':     4,
      'Tomates fraîches':    15,  'Oignons': 10, 'Pommes de terre': 20,
      'Carottes':            8,   'Ail': 2,
      'Pois chiches':        5,   'Lentilles corail': 4,
      'Sel fin':             1.5, 'Cumin moulu': 0.5, 'Harissa (conserve)': 2,
      'Huile végétale':      8,   'Concentré de tomate': 3,
    };
    const transferDefsFiltres = Object.fromEntries(
      Object.entries(transferDefs).filter(([n]) => ings[n])
    );

    let nTransfers = 0;
    for (const dateStr of [...datesBetween(START, END, 4), ...datesBetween(START, END, 0)].sort()) {
      for (const actId of [actResto1, actResto2]) {
        for (const [nom, base] of Object.entries(transferDefsFiltres)) {
          const qty = jitter(base);
          const prix = ings[nom].prix;
          await c.query(
            `INSERT INTO labo_transfers (labo_id, activite_id, ingredient_id, quantite, date_transfert, note, prix_unitaire)
             VALUES ($1, $2, $3, $4, $5, 'Transfert bi-hebdomadaire', $6)`,
            [laboId, actId, ings[nom].id, qty, dateStr, jitter(prix, 0.03)]
          );
          await c.query(
            `INSERT INTO stock_entreprise_daily
               (activite_id, ingredient_id, date_appro, quantite, type_appro, prix_unitaire)
             VALUES ($1, $2, $3, $4, 'transfert', $5)`,
            [actId, ings[nom].id, dateStr, qty, prix]
          );
          nTransfers++;
        }
      }
    }
    console.log(`${nTransfers} transferts labo → restaurants.`);

    // ── 13. Appros emballages restaurants (1er et 15 du mois) ────────────────
    const embalResto = [
      ['Boîtes à emporter (small)', 'Embalys Packaging', 100],
      ['Boîtes à emporter (large)', 'Embalys Packaging', 80],
      ['Sacs kraft (emporter)',     'Embalys Packaging', 60],
    ].filter(([n]) => ings[n]);

    let nEmbal = 0;
    for (let m = 1; m <= 5; m++) {
      for (const day of [1, 15]) {
        const dateStr = `2026-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        if (dateStr > END) continue;
        for (const actId of [actResto1, actResto2]) {
          for (const [nom, four, base] of embalResto) {
            await c.query(
              `INSERT INTO stock_entreprise_daily
                 (activite_id, ingredient_id, date_appro, quantite, type_appro, fournisseur_id, prix_unitaire)
               VALUES ($1, $2, $3, $4, 'manuel', $5, $6)`,
              [actId, ings[nom].id, dateStr, jitter(base), fourIds[four], ings[nom].prix]
            );
            nEmbal++;
          }
        }
      }
    }
    console.log(`${nEmbal} appros emballages restaurants.`);

    // ── 14. Appros Stand Buffet Hôtel (mercredi, direct fournisseurs) ─────────
    const standAppros = [
      ['Poulet entier',           'Boucherie El Wafa',       20],
      ['Escalopes de poulet',     'Boucherie El Wafa',       10],
      ['Bœuf haché',              'Boucherie El Wafa',        8],
      ['Tomates fraîches',        'Marché de Gros Sousse',   25],
      ['Oignons',                 'Marché de Gros Sousse',   15],
      ['Pommes de terre',         'Marché de Gros Sousse',   30],
      ['Carottes',                'Marché de Gros Sousse',   10],
      ['Pois chiches',            'Épicerie Sakia el Hamra',  8],
      ['Sel fin',                 'Épicerie Sakia el Hamra',  2],
      ['Cumin moulu',             'Épicerie Sakia el Hamra',  0.5],
      ['Huile végétale',          'Épicerie Sakia el Hamra', 10],
      ['Œufs frais',              'Marché de Gros Sousse',  100],
      ['Boîtes à emporter (small)', 'Embalys Packaging',     60],
      ['Boîtes à emporter (large)', 'Embalys Packaging',     40],
      ['Couverts jetables (set)', 'Embalys Packaging',       80],
    ].filter(([n]) => ings[n]);

    let nStand = 0;
    for (const dateStr of datesBetween(START, END, 3)) {
      for (const [nom, four, base] of standAppros) {
        await c.query(
          `INSERT INTO stock_entreprise_daily
             (activite_id, ingredient_id, date_appro, quantite, type_appro, fournisseur_id, prix_unitaire)
           VALUES ($1, $2, $3, $4, 'manuel', $5, $6)`,
          [actStand, ings[nom].id, dateStr, jitter(base), fourIds[four], ings[nom].prix]
        );
        nStand++;
      }
    }
    console.log(`${nStand} appros stand buffet (mercredis).`);

    // ── 15. Pertes activités (vendredi) — réalistes, jamais > stock hebdo ────
    const pertesDefs = [
      // [actIdx, nom, type, base_qty]
      [0, 'Tomates fraîches',    'avarie', 2.0],
      [0, 'Poulet entier',       'avarie', 1.5],
      [0, 'Merguez fraîche',     'avarie', 0.5],
      [1, 'Tomates fraîches',    'avarie', 1.8],
      [1, 'Escalopes de poulet', 'avarie', 1.0],
      [1, 'Lentilles corail',    'dechet', 0.8],
      [2, 'Tomates fraîches',    'avarie', 1.5],
      [2, 'Œufs frais',          'avarie', 6],
      [2, 'Huile végétale',      'dechet', 0.5],
    ].filter(([, n]) => ings[n]);

    let nPertes = 0;
    for (const dateStr of datesBetween(START, END, 5)) {
      for (const [idx, nom, type, base] of pertesDefs) {
        await c.query(
          `INSERT INTO pertes (activite_id, ingredient_id, quantite, type_perte, date_perte, prix_unitaire)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [actIds[idx], ings[nom].id, jitter(base), type, dateStr, ings[nom].prix]
        );
        nPertes++;
      }
    }
    console.log(`${nPertes} pertes activités (vendredis).`);

    // ── 16. Pertes labo (mensuel, 28) ─────────────────────────────────────────
    const pertesLaboDefs = [
      ['Poulet entier',     'avarie', 3.0],
      ['Tomates fraîches',  'avarie', 5.0],
      ['Lait entier',       'avarie', 2.0],
    ].filter(([n]) => ings[n]);

    let nPertesLabo = 0;
    for (let m = 1; m <= 5; m++) {
      const dateStr = `2026-${String(m).padStart(2,'0')}-28`;
      if (dateStr > END) continue;
      for (const [nom, type, base] of pertesLaboDefs) {
        await c.query(
          `INSERT INTO labo_pertes (labo_id, ingredient_id, quantite, type_perte, date_perte, prix_unitaire)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [laboId, ings[nom].id, jitter(base), type, dateStr, ings[nom].prix]
        );
        nPertesLabo++;
      }
    }
    console.log(`${nPertesLabo} pertes labo.`);

    // ── 17. Inventaires bimensuels ────────────────────────────────────────────
    const invIngLabo = [
      'Poulet entier', 'Bœuf haché', 'Tomates fraîches', 'Oignons', 'Pommes de terre',
      'Riz long grain', 'Pois chiches', 'Huile végétale', 'Sel fin',
    ].filter(n => ings[n]);

    const invIngAct = [
      'Tomates fraîches', 'Oignons', 'Pommes de terre', 'Poulet entier',
      'Boîtes à emporter (small)', 'Sacs kraft (emporter)',
    ].filter(n => ings[n]);

    let nInv = 0;
    for (const dateStr of monthEndDates(START, END)) {
      for (const nom of invIngLabo) {
        const ref = laboApprosFiltres[nom]?.base ?? 20;
        await c.query(
          `INSERT INTO inventaires (labo_id, ingredient_id, quantite_reelle, date_inventaire, note)
           VALUES ($1, $2, $3, $4, 'Inventaire bimensuel cuisine centrale')`,
          [laboId, ings[nom].id, jitter(ref * 0.5), dateStr]
        );
        nInv++;
      }
      for (const actId of [actResto1, actResto2]) {
        for (const nom of invIngAct) {
          await c.query(
            `INSERT INTO inventaires (activite_id, ingredient_id, quantite_reelle, date_inventaire, note)
             VALUES ($1, $2, $3, $4, 'Inventaire bimensuel restaurant')`,
            [actId, ings[nom].id, jitter(15), dateStr]
          );
          nInv++;
        }
      }
      for (const nom of ['Tomates fraîches', 'Oignons', 'Œufs frais', 'Huile végétale'].filter(n => ings[n])) {
        await c.query(
          `INSERT INTO inventaires (activite_id, ingredient_id, quantite_reelle, date_inventaire, note)
           VALUES ($1, $2, $3, $4, 'Inventaire stand buffet')`,
          [actStand, ings[nom].id, jitter(10), dateStr]
        );
        nInv++;
      }
    }
    console.log(`${nInv} inventaires.`);

    // ── 18. Agent IA ──────────────────────────────────────────────────────────
    const inviteToken = crypto.randomBytes(24).toString('hex');
    await c.query(
      `INSERT INTO ai_assistant_config (client_id, enabled, invite_token, confidence_threshold)
       VALUES ($1, true, $2, 0.75)
       ON CONFLICT (client_id) DO UPDATE SET enabled = true, invite_token = $2`,
      [clientId, inviteToken]
    );

    await c.query('COMMIT');

    // ── 19. Emails (hors transaction) ────────────────────────────────────────
    const botUsername = process.env.TELEGRAM_BOT_TOKEN ? 'LabFlowAI' : null;
    const inviteLink = botUsername
      ? `https://t.me/${botUsername}?start=${inviteToken}`
      : `[Configurer TELEGRAM_BOT_TOKEN pour générer le lien]`;

    try {
      await sendWelcomeWithContractEmail({ to: EMAIL, nom: NOM, token: inviteToken });
      console.log('Email de bienvenue envoyé.');
    } catch (e) {
      console.warn('Email bienvenue (skipped):', e.message);
    }

    try {
      await sendAiAgentInviteEmail({ to: EMAIL, clientNom: NOM, inviteLink, appName: 'LabFlow' });
      console.log('Email activation agent IA envoyé.');
    } catch (e) {
      console.warn('Email agent IA (skipped):', e.message);
    }

    // ── Résumé ────────────────────────────────────────────────────────────────
    const nLundis   = datesBetween(START, END, 1).length;
    const nTransDates = datesBetween(START, END, 4).length + datesBetween(START, END, 0).length;
    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log('  ✅ Simulation "Khelil Restauration & Traiteur" créée avec succès !');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log(`  Email    : ${EMAIL}`);
    console.log(`  Password : Demo@2026`);
    console.log(`  Client ID: ${clientId}`);
    console.log(`  Domaine  : Restauration`);
    console.log(`  Labo ID  : ${laboId}`);
    console.log(`  Activités: Restaurant Bourguiba (${actResto1}), Zone Touristique (${actResto2}), Stand Buffet (${actStand})`);
    console.log(`  Gérant   : Salim Chaabane → Restaurant Zone Touristique`);
    console.log(`  Promo    : 20% mensualité Jan–Mar 2026 (par super_admin)`);
    console.log(`  IA Token : ${inviteToken}`);
    console.log(`  IA Link  : ${inviteLink}`);
    console.log('──────────────────────────────────────────────────────────────────────');
    console.log(`  ${ingNames.length} ingrédients catalogue global Restauration`);
    console.log(`  ${nAppros} appros labo (${nLundis} lundis × ${Object.keys(laboApprosFiltres).length} ings)`);
    console.log(`  ${nTransfers} transferts labo → 2 restaurants (${nTransDates} dates)`);
    console.log(`  ${nEmbal} appros emballages restaurants`);
    console.log(`  ${nStand} appros stand buffet (mercredis)`);
    console.log(`  ${nPertes} pertes activités (vendredis) + ${nPertesLabo} pertes labo (mensuelles)`);
    console.log(`  ${nInv} inventaires bimensuels`);
    console.log('══════════════════════════════════════════════════════════════════════\n');

  } catch (err) {
    await c.query('ROLLBACK');
    console.error('❌ Erreur — rollback effectué:', err.message);
    throw err;
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch(() => process.exit(1));
