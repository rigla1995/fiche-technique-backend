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
 * @param {boolean}      opts.timbreFiscal  - whether to apply 1 DT timbre fiscal charge
 * @param {string}       opts.stockTable    - 'stock_client_daily' | 'stock_entreprise_daily' | 'stock_labo_daily'
 * @param {number}       opts.stockRowId    - id of the stock row to link
 * @param {object}       [db=pool]          - optional transaction client; pass a pg client
 *                                            to run within the caller's transaction (atomicity
 *                                            with the stock write). Defaults to the shared pool.
 * @returns {Promise<number>} factureId
 */
async function upsertFacture(clientId, opts, db = pool) {
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
    timbreFiscal = false,
    stockTable,
    stockRowId,
  } = opts;

  // Determine the date (strip time if present)
  const dateFact = dateAppro ? dateAppro.slice(0, 10) : new Date().toISOString().slice(0, 10);

  // Try to find an existing facture matching the natural key
  const findRes = await pool.query(
    `SELECT id, montant_ht, montant_tva, montant_ttc, timbre_fiscal, montant_timbre FROM factures
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
    let newTTC = parseFloat(existing.montant_ttc) + (montantTTC || 0);

    // Handle timbre fiscal changes
    let newTimbreFiscal = existing.timbre_fiscal;
    let newTimbre = parseFloat(existing.montant_timbre);
    if (timbreFiscal && !existing.timbre_fiscal) {
      newTTC += 1;
      newTimbreFiscal = true;
      newTimbre = 1;
    } else if (!timbreFiscal && existing.timbre_fiscal) {
      newTTC -= parseFloat(existing.montant_timbre);
      newTimbreFiscal = false;
      newTimbre = 0;
    }

    await db.query(
      `UPDATE factures SET montant_ht = $1, montant_tva = $2, montant_ttc = $3, timbre_fiscal = $4, montant_timbre = $5 WHERE id = $6`,
      [newHT, newTva, newTTC, newTimbreFiscal, newTimbre, existing.id]
    );
    factureId = existing.id;
  } else {
    // Insert new facture
    const timbreVal = timbreFiscal ? 1 : 0;
    const ttcWithTimbre = (montantTTC || 0) + timbreVal;
    const insRes = await pool.query(
      `INSERT INTO factures
         (client_id, ref_facture, date_facture, fournisseur_id, activite_id, labo_id,
          type_source, montant_ht, montant_tva, montant_ttc, timbre_fiscal, montant_timbre, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [clientId, refFacture || null, dateFact, fournisseurId, activiteId, laboId,
       typeSource, montantHT || 0, montantTva || 0, ttcWithTimbre, !!timbreFiscal, timbreVal, createdBy]
    );
    factureId = insRes.rows[0].id;
  }

  // Link the stock row to this facture
  if (stockTable && stockRowId) {
    // Only allow known tables to prevent injection
    const allowed = ['stock_client_daily', 'stock_entreprise_daily', 'stock_labo_daily'];
    if (allowed.includes(stockTable)) {
      await db.query(
        `UPDATE ${stockTable} SET facture_id = $1 WHERE id = $2`,
        [factureId, stockRowId]
      );
    }
  }

  return factureId;
}

module.exports = { upsertFacture };
