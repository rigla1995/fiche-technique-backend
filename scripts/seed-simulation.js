/**
 * Simulation complète — Boulangerie-Pâtisserie "Mahdia Délices"
 *
 * Compte entreprise avec :
 *   - 1 labo central (Labo de Production)
 *   - 2 activités (Boutique Médina, Boutique Lac)
 *   - 4 fournisseurs
 *   - 12 ingrédients sélectionnés
 *   - Appros hebdomadaires + transferts labo → activités (Jan–Mai 2026)
 *   - Pertes mensuelles réalistes
 *   - Inventaires bimensuels
 *   - Abonnement entreprise avec paiements Jan–Avr payés, Mai en attente
 *   - Agent IA activé (token d'invitation pré-généré)
 *
 * Run: node scripts/seed-simulation.js
 * Email: mahdia@demo.tn  /  Mot de passe: Demo@1234
 */

require('dotenv').config();
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// ─── Helpers ────────────────────────────────────────────────────────────────

const d = (y, m, day) => `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

// Generate weekly Monday dates between two dates
function mondays(fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const result = [];
  // align to next monday
  const dow = from.getDay();
  const diff = dow === 1 ? 0 : (8 - dow) % 7;
  const cur = new Date(from);
  cur.setDate(cur.getDate() + diff);
  while (cur <= to) {
    result.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 7);
  }
  return result;
}

// Jitter ±20% on a base qty
function jitter(base) {
  return Math.round(base * (0.8 + Math.random() * 0.4) * 100) / 100;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const EMAIL = 'mahdia@demo.tn';
    const PASSWORD = 'Demo@1234';
    const START = '2026-01-01';
    const END   = '2026-05-17';

    // ── Wipe previous demo account ──────────────────────────────────────────
    await client.query(
      `DELETE FROM produit_sous_produits WHERE sous_produit_id IN (
         SELECT p.id FROM produits p JOIN utilisateurs u ON p.client_id = u.id WHERE u.email = $1)`,
      [EMAIL]
    );
    await client.query(`DELETE FROM utilisateurs WHERE email = $1`, [EMAIL]);
    console.log('Old demo account cleaned up.');

    // ── 1. Utilisateur client ────────────────────────────────────────────────
    const hash = await bcrypt.hash(PASSWORD, 10);
    const { rows: [u] } = await client.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, telephone, role, compte_type, onboarding_step, actif)
       VALUES ('Mahdia Délices SARL', $1, $2, '+216 73 220 100', 'client', 'entreprise', 0, true)
       RETURNING id`,
      [EMAIL, hash]
    );
    const clientId = u.id;
    console.log(`Client créé: id=${clientId} (${EMAIL})`);

    // ── 2. Profil entreprise ─────────────────────────────────────────────────
    const { rows: [ep] } = await client.query(
      `INSERT INTO profil_entreprise (client_id, nom, email, telephone, adresse, meme_activite)
       VALUES ($1, 'Mahdia Délices', 'contact@mahdia-delices.tn', '+216 73 220 100',
               '12 Rue de la République, 5100 Mahdia', false)
       RETURNING id`,
      [clientId]
    );
    const epId = ep.id;
    console.log(`Profil entreprise: id=${epId}`);

    // ── 3. Abonnement ────────────────────────────────────────────────────────
    const { rows: [abo] } = await client.query(
      `INSERT INTO abonnements (client_id, compte_type, statut_onboarding, montant_onboarding,
        date_debut, mode_compte, notes)
       VALUES ($1, 'entreprise', 'payé', 1500, '2026-01-01', 'actif',
               'Client pilote simulation — onboarding payé en espèces le 02/01/2026')
       RETURNING id`,
      [clientId]
    );
    const aboId = abo.id;

    // Paiements Jan → Avr payés, Mai en attente
    for (const [mois, statut, montant] of [
      ['2026-01-01', 'payé',       400],
      ['2026-02-01', 'payé',       400],
      ['2026-03-01', 'payé',       400],
      ['2026-04-01', 'payé',       400],
      ['2026-05-01', 'en_attente', 400],
    ]) {
      await client.query(
        `INSERT INTO paiements (abonnement_id, mois, montant_dt, statut, date_saisie)
         VALUES ($1, $2, $3, $4, NOW())`,
        [aboId, mois, montant, statut]
      );
    }
    console.log('Abonnement + paiements créés.');

    // ── 4. Unités ────────────────────────────────────────────────────────────
    const uniteNames = ['kg', 'g', 'L', 'pièces', 'sachet'];
    const unites = {};
    for (const nom of uniteNames) {
      const { rows: [row] } = await client.query(
        `INSERT INTO unites (nom, client_id) VALUES ($1, $2)
         ON CONFLICT (nom, client_id) DO UPDATE SET nom = EXCLUDED.nom RETURNING id, nom`,
        [nom, clientId]
      );
      unites[nom] = row.id;
    }

    // ── 5. Catégories ────────────────────────────────────────────────────────
    const catNames = ['Matières premières', 'Emballages', 'Produits laitiers', 'Épicerie', 'Boissons'];
    const cats = {};
    for (const nom of catNames) {
      const { rows: [row] } = await client.query(
        `INSERT INTO categories (nom) VALUES ($1) ON CONFLICT (nom) DO UPDATE SET nom = EXCLUDED.nom RETURNING id, nom`
        , [nom]
      );
      cats[nom] = row.id;
    }

    // ── 6. Ingrédients ───────────────────────────────────────────────────────
    // [nom, unite, categorie, prix]
    const ingDefs = [
      ['Farine T55',        'kg',      'Matières premières', 1.200],
      ['Sucre blanc',       'kg',      'Épicerie',           0.900],
      ['Beurre doux',       'kg',      'Produits laitiers',  12.500],
      ['Lait entier',       'L',       'Produits laitiers',  1.050],
      ['Oeufs frais',       'pièces',  'Produits laitiers',  0.450],
      ['Levure fraîche',    'kg',      'Matières premières', 4.200],
      ['Huile végétale',    'L',       'Épicerie',           2.800],
      ['Sel fin',           'kg',      'Épicerie',           0.250],
      ['Cacao en poudre',   'kg',      'Épicerie',           18.000],
      ['Amandes effilées',  'kg',      'Épicerie',           22.000],
      ['Caissettes papier', 'sachet',  'Emballages',         3.500],
      ['Sachets kraft',     'sachet',  'Emballages',         5.200],
    ];

    const ings = {};
    for (const [nom, unite, cat, prix] of ingDefs) {
      const { rows: [row] } = await client.query(
        `INSERT INTO ingredients (nom, prix, unite_id, client_id)
         VALUES ($1, $2, $3, $4) RETURNING id, nom`,
        [nom, prix, unites[unite], clientId]
      );
      ings[nom] = row.id;
      console.log(`  Ingrédient: ${nom} (id=${row.id})`);
    }

    // ── 7. Labo central ──────────────────────────────────────────────────────
    const { rows: [labo] } = await client.query(
      `INSERT INTO labos (entreprise_id, franchise_group, nom, referent_tel, adresse)
       VALUES ($1, 'mahdia', 'Labo de Production Central', '+216 73 220 101',
               'Zone Industrielle, 5100 Mahdia')
       RETURNING id`,
      [epId]
    );
    const laboId = labo.id;
    console.log(`Labo: id=${laboId}`);

    // ── 8. Activités ─────────────────────────────────────────────────────────
    const actDefs = [
      { nom: 'Boutique Médina',  adresse: '5 Rue Sidi Ali el-Kebti, 5100 Mahdia', tel: '+216 73 220 200' },
      { nom: 'Boutique Yasmine', adresse: 'Av. Habib Bourguiba, 5111 Ksour Essef', tel: '+216 73 220 300' },
    ];
    const actIds = [];
    for (const { nom, adresse, tel } of actDefs) {
      const { rows: [act] } = await client.query(
        `INSERT INTO activites (entreprise_id, nom, adresse, telephone, labo_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [epId, nom, adresse, tel, laboId]
      );
      actIds.push(act.id);
      console.log(`  Activité: ${nom} (id=${act.id})`);
    }

    // ── 9. Sélections ingrédients ────────────────────────────────────────────
    // Labo sélectionne tous les ingrédients matières premières + épicerie
    const laboIngredients = ['Farine T55','Sucre blanc','Beurre doux','Lait entier','Oeufs frais','Levure fraîche','Huile végétale','Sel fin','Cacao en poudre','Amandes effilées'];
    for (const nom of laboIngredients) {
      await client.query(
        `INSERT INTO labo_ingredient_selections (labo_id, ingredient_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [laboId, ings[nom]]
      );
    }

    // Activités sélectionnent emballages + matières premières de base
    const actIngredients = ['Farine T55','Sucre blanc','Beurre doux','Lait entier','Oeufs frais','Caissettes papier','Sachets kraft'];
    for (const actId of actIds) {
      for (const nom of actIngredients) {
        await client.query(
          `INSERT INTO activite_ingredient_selections (activite_id, ingredient_id, prix_unitaire, seuil_min)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [actId, ings[nom],
            ingDefs.find(d => d[0] === nom)?.[3] ?? null,
            nom === 'Caissettes papier' ? 5 : nom === 'Sachets kraft' ? 3 : 10]
        );
      }
    }
    console.log('Sélections ingrédients créées.');

    // ── 10. Fournisseurs ─────────────────────────────────────────────────────
    const fournisseurDefs = [
      { nom: 'Minoterie de Mahdia',   adresse: 'ZI Mahdia',             tel: '+216 73 680 100' },
      { nom: 'Frigorifique Sahel',    adresse: 'Route de Sousse, Mahdia', tel: '+216 73 681 200' },
      { nom: 'Épicerie Centrale TN',  adresse: 'Tunis',                  tel: '+216 71 234 000' },
      { nom: 'Embal Marché',          adresse: 'Zone Commerciale, Sfax', tel: '+216 74 400 500' },
    ];
    const fourIds = {};
    for (const { nom, adresse, tel } of fournisseurDefs) {
      const { rows: [f] } = await client.query(
        `INSERT INTO fournisseurs (entreprise_id, nom, adresse, telephone) VALUES ($1, $2, $3, $4) RETURNING id`,
        [epId, nom, adresse, tel]
      );
      fourIds[nom] = f.id;
      // Lier aux activités
      for (const actId of actIds) {
        await client.query(
          `INSERT INTO fournisseur_activites (fournisseur_id, activite_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [f.id, actId]
        );
      }
    }
    console.log('Fournisseurs créés.');

    // ── 11. Appros labo (hebdomadaires) ──────────────────────────────────────
    // Chaque lundi, le labo reçoit du fournisseur pour toutes ses matières premières
    const laboAppros = {
      'Farine T55':       { base: 200, four: 'Minoterie de Mahdia',  prixBase: 1.200 },
      'Sucre blanc':      { base: 50,  four: 'Épicerie Centrale TN', prixBase: 0.900 },
      'Beurre doux':      { base: 30,  four: 'Frigorifique Sahel',   prixBase: 12.500 },
      'Lait entier':      { base: 100, four: 'Frigorifique Sahel',   prixBase: 1.050 },
      'Oeufs frais':      { base: 500, four: 'Frigorifique Sahel',   prixBase: 0.450 },
      'Levure fraîche':   { base: 10,  four: 'Épicerie Centrale TN', prixBase: 4.200 },
      'Huile végétale':   { base: 20,  four: 'Épicerie Centrale TN', prixBase: 2.800 },
      'Sel fin':          { base: 5,   four: 'Épicerie Centrale TN', prixBase: 0.250 },
      'Cacao en poudre':  { base: 8,   four: 'Épicerie Centrale TN', prixBase: 18.000 },
      'Amandes effilées': { base: 6,   four: 'Épicerie Centrale TN', prixBase: 22.000 },
    };

    let nApprosLabo = 0;
    for (const dateStr of mondays(START, END)) {
      for (const [nom, { base, four, prixBase }] of Object.entries(laboAppros)) {
        const qty = jitter(base);
        // légère variation de prix ±5%
        const prix = Math.round(prixBase * (0.95 + Math.random() * 0.1) * 1000) / 1000;
        await client.query(
          `INSERT INTO stock_labo_daily (labo_id, ingredient_id, date_appro, quantite, prix_unitaire)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (labo_id, ingredient_id, date_appro) DO UPDATE SET quantite = EXCLUDED.quantite`,
          [laboId, ings[nom], dateStr, qty, prix]
        );
        nApprosLabo++;
      }
    }
    console.log(`${nApprosLabo} appros labo insérées.`);

    // ── 12. Transferts labo → activités (chaque mercredi) ───────────────────
    // Le mercredi, le labo transfère les matières premières aux 2 boutiques
    const transferDefs = {
      'Farine T55':     50,
      'Sucre blanc':    12,
      'Beurre doux':    7,
      'Lait entier':    25,
      'Oeufs frais':    120,
      'Levure fraîche': 2.5,
      'Huile végétale': 5,
      'Sel fin':        1,
      'Cacao en poudre': 2,
      'Amandes effilées': 1.5,
    };

    // Mercredis dans la période
    function wednesdays(from, to) {
      const f = new Date(from), t = new Date(to), out = [];
      const dif = (3 - f.getDay() + 7) % 7;
      const cur = new Date(f); cur.setDate(cur.getDate() + dif);
      while (cur <= t) { out.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 7); }
      return out;
    }

    let nTransfers = 0;
    for (const dateStr of wednesdays(START, END)) {
      for (const actId of actIds) {
        for (const [nom, base] of Object.entries(transferDefs)) {
          const qty = jitter(base);
          await client.query(
            `INSERT INTO labo_transfers (labo_id, activite_id, ingredient_id, quantite, date_transfert, note)
             VALUES ($1, $2, $3, $4, $5, 'Transfert hebdomadaire')`,
            [laboId, actId, ings[nom], qty, dateStr]
          );
          // Enregistrer aussi côté stock activité
          await client.query(
            `INSERT INTO stock_entreprise_daily
               (activite_id, ingredient_id, date_appro, quantite, type_appro, prix_unitaire)
             VALUES ($1, $2, $3, $4, 'transfert', $5)
             ON CONFLICT (activite_id, ingredient_id, date_appro, type_appro) DO UPDATE
               SET quantite = EXCLUDED.quantite`,
            [actId, ings[nom], dateStr, qty,
              ingDefs.find(d => d[0] === nom)?.[3] ?? 1]
          );
          nTransfers++;
        }
      }
    }
    console.log(`${nTransfers} transferts insérés.`);

    // ── 13. Appros emballages pour activités (chaque 1er et 15 du mois) ────
    const embalDefs = [
      ['Caissettes papier', 'Embal Marché', 20, 3.500],
      ['Sachets kraft',     'Embal Marché', 10, 5.200],
    ];
    const embalDates = [];
    for (let m = 1; m <= 5; m++) {
      embalDates.push(d(2026, m, 1));
      if (m < 5) embalDates.push(d(2026, m, 15));
      else if (m === 5) embalDates.push(d(2026, m, 15)); // 15 mai OK
    }

    let nEmbal = 0;
    for (const dateStr of embalDates) {
      if (dateStr > END) continue;
      for (const actId of actIds) {
        for (const [nom, fourNom, base, prix] of embalDefs) {
          const qty = jitter(base);
          await client.query(
            `INSERT INTO stock_entreprise_daily
               (activite_id, ingredient_id, date_appro, quantite, type_appro, fournisseur_id, prix_unitaire)
             VALUES ($1, $2, $3, $4, 'manuel', $5, $6)
             ON CONFLICT (activite_id, ingredient_id, date_appro, type_appro) DO UPDATE
               SET quantite = EXCLUDED.quantite`,
            [actId, ings[nom], dateStr, qty, fourIds[fourNom], prix]
          );
          nEmbal++;
        }
      }
    }
    console.log(`${nEmbal} appros emballages insérées.`);

    // ── 14. Pertes mensuelles (activités) ────────────────────────────────────
    // Fin de chaque mois, pertes réalistes sur farine + beurre + oeufs
    const pertesDefs = [
      // [mois, nom, qty, type_perte]
      [1,  'Farine T55',    8.5,  'dechet'],
      [1,  'Beurre doux',   2.0,  'avarie'],
      [1,  'Oeufs frais',  15,    'avarie'],
      [2,  'Farine T55',    6.0,  'dechet'],
      [2,  'Levure fraîche', 1.2, 'avarie'],
      [2,  'Oeufs frais',  12,    'avarie'],
      [3,  'Farine T55',    9.0,  'dechet'],
      [3,  'Beurre doux',   1.5,  'avarie'],
      [3,  'Cacao en poudre', 0.8,'avarie'],
      [4,  'Farine T55',    7.5,  'dechet'],
      [4,  'Oeufs frais',  18,    'avarie'],
      [4,  'Lait entier',   4.0,  'avarie'],
      [5,  'Farine T55',    3.0,  'dechet'],
      [5,  'Beurre doux',   1.0,  'avarie'],
    ];

    let nPertes = 0;
    for (const actId of actIds) {
      for (const [mois, nom, qty, type] of pertesDefs) {
        const lastDay = new Date(2026, mois, 0).getDate();
        const day = Math.min(lastDay, mois < 5 ? lastDay : 15);
        const dateStr = d(2026, mois, day);
        if (dateStr > END) continue;
        const qtyJ = jitter(qty);
        const prix = ingDefs.find(x => x[0] === nom)?.[3] ?? 1;
        await client.query(
          `INSERT INTO pertes (activite_id, ingredient_id, quantite, type_perte, date_perte)
           VALUES ($1, $2, $3, $4, $5)`,
          [actId, ings[nom], qtyJ, type, dateStr]
        );
        nPertes++;
      }
    }
    console.log(`${nPertes} pertes activités insérées.`);

    // ── 15. Inventaires bimensuels (15 et fin de mois) ──────────────────────
    const invDates = [];
    for (let m = 1; m <= 5; m++) {
      invDates.push(d(2026, m, 15));
      const lastDay = new Date(2026, m, 0).getDate();
      invDates.push(d(2026, m, lastDay));
    }

    const invIngredients = ['Farine T55','Sucre blanc','Beurre doux','Lait entier','Oeufs frais'];
    let nInv = 0;
    for (const actId of actIds) {
      for (const dateStr of invDates) {
        if (dateStr > END) continue;
        for (const nom of invIngredients) {
          // Quantité inventaire = stock théorique ±15%
          const { base } = laboAppros[nom] || {};
          const qRef = base ? base * 0.4 : 20;
          const qReelle = jitter(qRef);
          await client.query(
            `INSERT INTO inventaires (activite_id, ingredient_id, quantite_reelle, date_inventaire, note)
             VALUES ($1, $2, $3, $4, 'Inventaire bimensuel automatique')`,
            [actId, ings[nom], qReelle, dateStr]
          );
          nInv++;
        }
      }
    }

    // Inventaires labo aussi
    for (const dateStr of invDates) {
      if (dateStr > END) continue;
      for (const nom of laboIngredients) {
        const { base } = laboAppros[nom] || {};
        const qRef = base ? base * 0.6 : 30;
        await client.query(
          `INSERT INTO inventaires (labo_id, ingredient_id, quantite_reelle, date_inventaire, note)
           VALUES ($1, $2, $3, $4, 'Inventaire labo bimensuel')`,
          [laboId, ings[nom], jitter(qRef), dateStr]
        );
        nInv++;
      }
    }
    console.log(`${nInv} inventaires insérés.`);

    // ── 16. Agent IA (Telegram) ──────────────────────────────────────────────
    const inviteToken = crypto.randomBytes(24).toString('hex');
    await client.query(
      `INSERT INTO ai_assistant_config (client_id, enabled, invite_token, confidence_threshold)
       VALUES ($1, true, $2, 0.75)
       ON CONFLICT (client_id) DO UPDATE SET enabled = true, invite_token = $2`,
      [clientId, inviteToken]
    );
    console.log(`Agent IA activé. Invite token: ${inviteToken}`);

    // ── COMMIT ───────────────────────────────────────────────────────────────
    await client.query('COMMIT');

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ✅ Simulation "Mahdia Délices" créée avec succès !');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Email    : ${EMAIL}`);
    console.log(`  Password : ${PASSWORD}`);
    console.log(`  Client ID: ${clientId}`);
    console.log(`  Labo ID  : ${laboId}`);
    console.log(`  Activités: ${actIds.join(', ')}`);
    console.log(`  Abonnement: entreprise / actif / Jan–Avr payés / Mai en attente`);
    console.log(`  IA Token : ${inviteToken}`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Données générées (Jan 1 → Mai 17, 2026) :');
    console.log(`    - ${nApprosLabo} appros labo (hebdomadaires)`);
    console.log(`    - ${nTransfers} transferts labo → activités (hebdomadaires)`);
    console.log(`    - ${nEmbal} appros emballages (bimensuelles)`);
    console.log(`    - ${nPertes} pertes activités (mensuelles)`);
    console.log(`    - ${nInv} inventaires (bimensuels labo + activités)`);
    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌ Erreur:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
