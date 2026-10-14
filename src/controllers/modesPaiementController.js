// P2 « Conditions des prestataires et chiffre net » : les MODES DE PAIEMENT des prestataires (Espèces, Virement…), liste
// tenue par l'admin (ajout, renommage, désactivation ; jamais effacés : des ventes les citent) et lue par le client à
// l'activation d'un prestataire (migration 238).
const pool = require('../config/database');
const { codeMode } = require('../utils/conditionsPrestataire');

const presenter = (r) => ({
  id: r.id, code: r.code, libelle: r.libelle, actif: r.actif, ordre: r.ordre,
  ...(r.nb_prestataires != null ? { nbPrestataires: parseInt(r.nb_prestataires, 10) } : {}),
});

// Admin : tous les modes, avec le nombre de prestataires activés qui les utilisent.
const lister = async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT mp.*, (SELECT COUNT(*) FROM activite_prestataires ap WHERE ap.mode_paiement_id = mp.id) AS nb_prestataires
         FROM modes_paiement mp ORDER BY mp.ordre, mp.libelle`
    );
    res.json(r.rows.map(presenter));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Client : les modes actifs, proposés à l'activation d'un prestataire.
const listerActifs = async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM modes_paiement WHERE actif = true ORDER BY ordre, libelle');
    res.json(r.rows.map(presenter));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const lireLibelle = (v) => {
  const s = String(v ?? '').trim();
  return s.length >= 1 && s.length <= 60 ? s : null;
};

const creer = async (req, res) => {
  try {
    const libelle = lireLibelle(req.body.libelle);
    if (!libelle) return res.status(400).json({ code: 'LIBELLE_REQUIS', message: 'Le libellé du mode de paiement est requis (60 caractères au plus).' });
    const code = codeMode(libelle);
    if (!code) return res.status(400).json({ code: 'LIBELLE_REQUIS', message: 'Le libellé du mode de paiement doit contenir une lettre ou un chiffre.' });
    const deja = await pool.query('SELECT 1 FROM modes_paiement WHERE code = $1 OR lower(libelle) = lower($2)', [code, libelle]);
    if (deja.rows.length) return res.status(409).json({ code: 'MODE_PAIEMENT_EXISTANT', message: 'Ce mode de paiement existe déjà.' });
    const r = await pool.query(
      `INSERT INTO modes_paiement (code, libelle, ordre)
       VALUES ($1, $2, (SELECT COALESCE(MAX(ordre), 0) + 1 FROM modes_paiement)) RETURNING *`,
      [code, libelle]
    );
    res.status(201).json(presenter(r.rows[0]));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const modifier = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ message: 'Mode de paiement introuvable.' });
    const { libelle, actif, ordre } = req.body;
    const nouveauLibelle = libelle !== undefined ? lireLibelle(libelle) : undefined;
    if (libelle !== undefined && !nouveauLibelle) return res.status(400).json({ code: 'LIBELLE_REQUIS', message: 'Le libellé du mode de paiement est requis (60 caractères au plus).' });
    if (actif !== undefined && typeof actif !== 'boolean') return res.status(400).json({ message: 'actif invalide' });
    if (ordre !== undefined && !(Number.isInteger(Number(ordre)) && Number(ordre) >= 0)) return res.status(400).json({ message: 'ordre invalide' });
    if (nouveauLibelle) {
      const deja = await pool.query('SELECT 1 FROM modes_paiement WHERE lower(libelle) = lower($1) AND id <> $2', [nouveauLibelle, id]);
      if (deja.rows.length) return res.status(409).json({ code: 'MODE_PAIEMENT_EXISTANT', message: 'Ce mode de paiement existe déjà.' });
    }
    const r = await pool.query(
      `UPDATE modes_paiement SET libelle = COALESCE($2, libelle), actif = COALESCE($3, actif), ordre = COALESCE($4, ordre), updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [id, nouveauLibelle ?? null, actif ?? null, ordre !== undefined ? Number(ordre) : null]
    );
    if (!r.rows.length) return res.status(404).json({ message: 'Mode de paiement introuvable.' });
    res.json(presenter(r.rows[0]));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

module.exports = { lister, listerActifs, creer, modifier };
