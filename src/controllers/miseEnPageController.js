/* Étape F5 des factures fournisseur : la mise en page apprise d'un fournisseur, lue par l'écran au moment de lire une
 * photo de facture (src/services/misesEnPage.js).
 *   GET /api/factures/mise-en-page?matricule=1234567A/A/M/000   → { miseEnPage: { colonnes } | null }
 * Le matricule vient de la lecture de la facture ; la réponse ne contient que des positions de colonnes. */
const pool = require('../config/database');
const M = require('../services/misesEnPage');

const lire = async (req, res) => {
  try {
    const identifiant = M.identifiantMatricule(String(req.query.matricule || '').slice(0, 50));
    if (!identifiant) return res.status(400).json({ code: 'MATRICULE_INVALIDE', message: 'Matricule fiscal illisible.' });
    const m = await M.lire(pool, identifiant);
    res.json({ miseEnPage: m ? { colonnes: m.colonnes } : null });
  } catch (err) {
    console.error('[mise en page]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { lire };
