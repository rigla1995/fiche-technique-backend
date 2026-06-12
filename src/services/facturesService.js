const pool = require('../config/database');

/**
 * Upsert a facture record and link the given stock row to it.
 *
 * @param {number} clientId
 * @param {object} opts
 * @param {string|null}  opts.refFacture
 * @param {string}       opts.dateAppro     - ISO date string (YYYY-MM-DD)
 * @param {number|null}  opts.fournisseurId
 * @param {number|null}  opts.activiteId
 * @param {number|null}  opts.laboId
 * @param {string}       opts.typeSource    - 'manuel' | 'transfert' | etc.
 * @param {number}       opts.montantHT
 * @param {number}       opts.montantTva
 * @param {number}       opts.montantTTC
 * @param {number|null}  opts.createdBy
 * @param {string}       opts.stockTable    - 'stock_client_daily' | 'stock_entreprise_daily' | 'stock_labo_daily'
 * @param {number}       opts.stockRowId    - id of the stock row to link
 * @returns {Promise<number>} factureId
 */
async function upsertFacture(clientId, opts) {
  const {
    refFacture,
    dateAppro,
    fournisseurId = null,
    activiteId = null,
    laboId = null,
    typeSource = 'manuel',
    montantHT = 0,
    montantTva = 0,
    montantTTC = 0,
    createdBy = null,
    stockTable,
    stockRowId,
  } = opts;

  // Determine the date (strip time if present)
  const dateFact = dateAppro ? dateAppro.slice(0, 10) : new Date().toISOString().slice(0, 10);

  // Try to find an existing facture matching the natural key
  const findRes = await pool.query(
    `SELECT id, montant_ht, montant_tva, montant_ttc FROM factures
     WHERE client_id = $1
       AND ref_facture IS NOT DISTINCT FROM $2
       AND date_facture = $3
       AND (fournisseur_id IS NOT DISTINCT FROM $4)
       AND (activite_id IS NOT DISTINCT FROM $5)
       AND (labo_id IS NOT DISTINCT FROM $6)
       AND type_source = $7
     LIMIT 1`,
    [clientId, refFacture || null, dateFact, fournisseurId, activiteId, laboId, typeSource]
  );

  let factureId;

  if (findRes.rows.length > 0) {
    // Update totals by adding the new line's amounts
    const existing = findRes.rows[0];
    const newHT  = parseFloat(existing.montant_ht)  + (montantHT  || 0);
    const newTva = parseFloat(existing.montant_tva) + (montantTva || 0);
    const newTTC = parseFloat(existing.montant_ttc) + (montantTTC || 0);
    await pool.query(
      `UPDATE factures SET montant_ht = $1, montant_tva = $2, montant_ttc = $3 WHERE id = $4`,
      [newHT, newTva, newTTC, existing.id]
    );
    factureId = existing.id;
  } else {
    // Insert new facture
    const insRes = await pool.query(
      `INSERT INTO factures
         (client_id, ref_facture, date_facture, fournisseur_id, activite_id, labo_id,
          type_source, montant_ht, montant_tva, montant_ttc, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [clientId, refFacture || null, dateFact, fournisseurId, activiteId, laboId,
       typeSource, montantHT || 0, montantTva || 0, montantTTC || 0, createdBy]
    );
    factureId = insRes.rows[0].id;
  }

  // Link the stock row to this facture
  if (stockTable && stockRowId) {
    // Only allow known tables to prevent injection
    const allowed = ['stock_client_daily', 'stock_entreprise_daily', 'stock_labo_daily'];
    if (allowed.includes(stockTable)) {
      await pool.query(
        `UPDATE ${stockTable} SET facture_id = $1 WHERE id = $2`,
        [factureId, stockRowId]
      );
    }
  }

  return factureId;
}

module.exports = { upsertFacture };
