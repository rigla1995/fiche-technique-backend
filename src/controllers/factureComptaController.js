/* Factures d'appro → LabFlow Compta (étape F4 « Vers la comptabilité » — labflow-reprise/achats-compta/PLAN-FACTURES.md
 * §4, notes ETAPE-F4.md).
 *
 *   GET  /api/factures/compta        { actif } : le module LabFlow Compta est-il actif pour le compte ? (client, gérant)
 *   POST /api/factures/:id/compta    envoie la facture en comptabilité (client ; gérant : factures de ses lieux)
 *                                    → 201 { compta } (écriture créée, en brouillard) ; 200 { compta, deja } ; refus
 *                                    { code, message } (la facture reste « à envoyer »). */
const pool = require('../config/database');
const F = require('../services/facturesAppro');
const Pont = require('../services/pontCompta');

const etatModule = async (req, res) => {
  try {
    res.json({ actif: Boolean(await Pont.moduleActif(pool, F.clientDe(req))) });
  } catch (err) {
    console.error('[facture → compta] état du module', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const envoyer = async (req, res) => {
  const clientId = F.clientDe(req);
  try {
    const f = await F.factureDuCompte(pool, req.params.id, clientId);
    if (!f || !F.gerantVoit(req, f)) return res.status(404).json({ message: 'Facture introuvable' });
    if (!F.gerantAgitSur(req, f)) return res.status(403).json({ message: 'Accès non autorisé à cette facture' });
    const r = await Pont.envoyerFacture({ clientId, factureId: f.id, auteurId: req.user.id });
    return res.status(r.deja ? 200 : 201).json(r);
  } catch (err) {
    if (err instanceof Pont.RefusCompta) return res.status(err.status).json({ code: err.code, message: err.message });
    console.error('[facture → compta] envoi', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { etatModule, envoyer };
