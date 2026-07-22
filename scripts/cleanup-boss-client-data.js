// One-shot (clé _migrations : 180_cleanup_boss_client_data.js) — le compte
// m.khelil.prof@gmail.com a été PROMU de client à boss (migr 178) : ses données
// « client » (abonnement, profil, activités, stock…) sont devenues des fantômes
// (ex. page Abonnements = 8 lignes pour 7 clients). On les purge en GARDANT le
// compte utilisateur (rôle boss). Même logique que la purge admin d'un client
// (clientsController.remove), sauf qu'on ne supprime pas la ligne utilisateurs :
// on supprime les RACINES (profil_entreprise, abonnements, tables client-scopées)
// et les cascades font le reste.
const pool = require('../src/config/database');

async function run() {
  const client = await pool.connect();
  try {
    const bossRes = await client.query(
      `SELECT id FROM utilisateurs WHERE LOWER(email) = LOWER($1) AND role = 'boss'`,
      ['m.khelil.prof@gmail.com']
    );
    if (bossRes.rows.length === 0) {
      console.log('[cleanup-boss] aucun compte boss trouvé — rien à faire');
      return;
    }
    const bossId = bossRes.rows[0].id;

    await client.query('BEGIN');

    // Ids possédés : le boss (ex-client) + ses éventuels gérants.
    const usersRes = await client.query(
      'SELECT id FROM utilisateurs WHERE id = $1 OR gerant_parent_id = $1',
      [bossId]
    );
    const userIds = usersRes.rows.map((r) => r.id);
    const uPh = userIds.map((_, i) => `$${i + 1}`).join(', ');

    // Colonnes d'audit sans ON DELETE : SET NULL avant suppression des gérants.
    const auditTables = [
      'stock_entreprise_daily', 'stock_labo_daily',
      'pertes', 'labo_transfers', 'inventaires', 'ventes',
      'acheteurs', 'commandes_acheteur', 'acheteur_offre_prix_historique',
    ];
    for (const t of auditTables) {
      await client.query('SAVEPOINT sp');
      try {
        await client.query(`UPDATE ${t} SET created_by = NULL WHERE created_by IN (${uPh})`, userIds);
        await client.query('RELEASE SAVEPOINT sp');
      } catch (_) { await client.query('ROLLBACK TO SAVEPOINT sp'); }
    }
    await client.query('SAVEPOINT sp');
    try {
      await client.query(`UPDATE commandes_acheteur SET traite_par = NULL WHERE traite_par IN (${uPh})`, userIds);
      await client.query('RELEASE SAVEPOINT sp');
    } catch (_) { await client.query('ROLLBACK TO SAVEPOINT sp'); }

    // Bloqueurs RESTRICT avant la cascade produits/articles/unites.
    await client.query(
      `DELETE FROM produit_ingredients WHERE produit_id IN (SELECT id FROM produits WHERE client_id = $1)`,
      [bossId]
    );
    await client.query(
      `DELETE FROM produit_sous_produits
        WHERE produit_id IN (SELECT id FROM produits WHERE client_id = $1)
           OR sous_produit_id IN (SELECT id FROM produits WHERE client_id = $1)`,
      [bossId]
    );
    await client.query('SAVEPOINT sp');
    try {
      await client.query(
        `DELETE FROM article_vendable_prix_historique
          WHERE article_id IN (SELECT id FROM articles WHERE client_id = $1)`,
        [bossId]
      );
      await client.query('RELEASE SAVEPOINT sp');
    } catch (_) { await client.query('ROLLBACK TO SAVEPOINT sp'); }

    // Commandes acheteurs AVANT le profil : commandes_acheteur.labo_id est la SEULE
    // FK vers labos SANS ON DELETE — elle bloquerait la cascade des labos (erreur
    // rencontrée en prod). Leurs lignes + factures cascadent avec (commande_id CASCADE).
    await client.query('SAVEPOINT sp');
    try {
      await client.query('DELETE FROM factures_acheteur WHERE client_id = $1', [bossId]);
      await client.query('RELEASE SAVEPOINT sp');
    } catch (_) { await client.query('ROLLBACK TO SAVEPOINT sp'); }
    await client.query('DELETE FROM commandes_acheteur WHERE client_id = $1', [bossId]);

    // Racines : profil (cascade activités/labos/stock/ventes/inventaires/fournisseurs),
    // carnet acheteurs, gérants, abonnement (cascade paiements/promotions/config).
    await client.query('DELETE FROM profil_entreprise WHERE client_id = $1', [bossId]);
    await client.query('SAVEPOINT sp');
    try {
      await client.query('DELETE FROM acheteurs WHERE client_id = $1', [bossId]);
      await client.query('RELEASE SAVEPOINT sp');
    } catch (_) { await client.query('ROLLBACK TO SAVEPOINT sp'); }
    await client.query(`DELETE FROM utilisateurs WHERE gerant_parent_id = $1 AND role = 'gerant'`, [bossId]);

    // Tables directement scopées client (tolérant : certaines peuvent ne pas exister).
    for (const t of ['produits', 'articles', 'unites', 'familles', 'categories',
                     'categories_produit', 'client_domaines', 'support_demandes', 'conversations']) {
      await client.query('SAVEPOINT sp');
      try {
        await client.query(`DELETE FROM ${t} WHERE client_id = $1`, [bossId]);
        await client.query('RELEASE SAVEPOINT sp');
      } catch (_) { await client.query('ROLLBACK TO SAVEPOINT sp'); }
    }

    await client.query('DELETE FROM abonnements WHERE client_id = $1', [bossId]);

    // Comptes acheteurs devenus orphelins (leur fiche carnet a cascadé).
    await client.query(
      `DELETE FROM utilisateurs u
        WHERE u.role = 'acheteur'
          AND NOT EXISTS (SELECT 1 FROM acheteurs a WHERE a.user_id = u.id)`
    );

    // Le boss n'est plus un client : état neutre.
    await client.query(
      `UPDATE utilisateurs SET onboarding_step = 0, origine = 'manuel', updated_at = NOW() WHERE id = $1`,
      [bossId]
    );

    await client.query('COMMIT');
    console.log(`[cleanup-boss] données client du compte boss (id=${bossId}) purgées`);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { run };
