const pool = require('../config/database');
const ExcelJS = require('exceljs');
const multer = require('multer');
const { vocabDefaut } = require('../utils/vocab');
const { ongletSur } = require('../utils/excelNoms');
const { withTransaction } = require('../utils/db');
const { controlerMatriculeFiscal, normaliserMatriculeFiscal } = require('../utils/matriculeFiscal');
const { verrouillerFactures, sansBalise } = require('../services/facturesAppro');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
// Ajout dynamique (import Excel) — même gabarit que le carnet d'acheteurs. Étape F2 (factures fournisseur) : trois
// colonnes de plus, facultatives ; un ancien modèle à trois colonnes reste accepté.
const IMPORT_HEADERS = ['Nom', 'Téléphone', 'Adresse', 'Ville', 'Matricule fiscal', 'Email'];
const IMPORT_HEADERS_ANCIENS = IMPORT_HEADERS.slice(0, 3);
const IMPORT_MAX_ROWS = 500;

const getEntrepriseId = async (clientId) => {
  const r = await pool.query('SELECT id FROM profil_entreprise WHERE client_id = $1', [clientId]);
  return r.rows[0]?.id ?? null;
};

/* Fiche d'un fournisseur (étape F2 — labflow-reprise/achats-compta/PLAN-FACTURES.md §4 « Le fournisseur ») : nom
 * (obligatoire), téléphone, adresse, et l'identité légale — raison sociale, matricule fiscal (forme contrôlée et
 * normalisée comme pour le client ; unique par compte), email, ville. Lève { status, code, message }. */
const LIMITES = { nom: 255, telephone: 50, adresse: 500, raisonSociale: 200, email: 200, ville: 100 };
const LIBELLES = { nom: 'Nom', telephone: 'Téléphone', adresse: 'Adresse', raisonSociale: 'Raison sociale', email: 'Email', ville: 'Ville', matriculeFiscal: 'Matricule fiscal' };
// Caractères de contrôle (NUL compris : PostgreSQL le refuse dans un texte) — un texte lu sur un PDF peut en porter.
const CONTROLE = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`, 'g');
// Champs de l'identité légale (F2) : absents du corps d'un PUT, ils restent tels quels (un ancien écran ne les efface pas).
const CHAMPS_IDENTITE = ['raisonSociale', 'matriculeFiscal', 'email', 'ville'];
const ID_MAX = 2147483647;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const erreur = (status, code, message, extra = {}) => Object.assign(new Error(message), { status, code, corps: { code, message, ...extra } });

const champTexte = (body, cle) => {
  const v = body[cle];
  if (v == null) return null;
  if (typeof v !== 'string' && typeof v !== 'number') throw erreur(400, 'CHAMP_INVALIDE', `${LIBELLES[cle]} : valeur invalide.`);
  const s = String(v).replace(CONTROLE, ' ').replace(/\s+/g, ' ').trim();
  if (s.length > LIMITES[cle]) throw erreur(400, 'TROP_LONG', `${LIBELLES[cle]} : ${LIMITES[cle]} caractères au plus.`);
  return s || null;
};

/** Lit les champs fournis. `partiel` : seuls les champs présents dans le corps sont rendus (complément d'une fiche). */
const lireFiche = (body = {}, { partiel = false } = {}) => {
  const fiche = {};
  for (const cle of Object.keys(LIMITES)) {
    if (partiel && !(cle in body)) continue;
    fiche[cle] = champTexte(body, cle);
  }
  if (!partiel || 'nom' in body) {
    if (!fiche.nom) throw erreur(400, 'NOM_REQUIS', 'Nom requis');
  }
  if (fiche.email && !EMAIL.test(fiche.email)) throw erreur(400, 'EMAIL_INVALIDE', 'Email invalide (exemple : contact@societe.tn).');
  if (!partiel || 'matriculeFiscal' in body) {
    const brut = body.matriculeFiscal;
    if (brut != null && typeof brut !== 'string') throw erreur(400, 'CHAMP_INVALIDE', 'Matricule fiscal : valeur invalide.');
    const mf = controlerMatriculeFiscal(brut == null ? brut : brut.replace(CONTROLE, ' '));
    if (!mf.ok) throw erreur(400, 'MATRICULE_INVALIDE', mf.erreur);
    fiche.matriculeFiscal = mf.valeur || null;
  }
  return fiche;
};

const COLONNES = { nom: 'nom', telephone: 'telephone', adresse: 'adresse', raisonSociale: 'raison_sociale', email: 'email', ville: 'ville', matriculeFiscal: 'matricule_fiscal' };

const dejaPris = (f) => erreur(409, 'MATRICULE_EXISTANT', `Ce matricule fiscal est déjà celui de « ${sansBalise(f.nom)} ».`, { fournisseur: { id: f.id, nom: f.nom } });

/** Un autre fournisseur du compte porte-t-il déjà ce matricule ? → 409 avec son nom (pour le choisir à la place). La forme
 * courte (« 1234567A ») et la forme complète (« 1234567A/A/M/000 ») d'une même entreprise sont tenues pour le même. */
const controlerMatriculeLibre = async (db, entrepriseId, matricule, saufId = null) => {
  if (!matricule) return;
  // Le matricule du compte (imprimé sur ses factures comme destinataire) n'est jamais celui d'un fournisseur.
  const compte = await db.query('SELECT matricule_fiscal FROM profil_entreprise WHERE id = $1', [entrepriseId]);
  const propre = String(compte.rows[0]?.matricule_fiscal ?? '').replace(/[^0-9A-Z]/gi, '').slice(0, 7);
  if (propre.length === 7 && matricule.slice(0, 7) === propre) {
    throw erreur(400, 'MATRICULE_DU_COMPTE', 'Ce matricule fiscal est celui de votre entreprise : il ne peut pas servir à [[un:fournisseur]].');
  }
  const r = await db.query(
    `SELECT id, nom FROM fournisseurs
     WHERE entreprise_id = $1 AND ($3::int IS NULL OR id <> $3)
       AND (matricule_fiscal = $2
            OR (length($2) = 8 AND left(matricule_fiscal, 8) = $2)
            OR (length(matricule_fiscal) = 8 AND left($2, 8) = matricule_fiscal))
     ORDER BY (matricule_fiscal = $2) DESC, id LIMIT 1`,
    [entrepriseId, matricule, saufId]
  );
  if (r.rows.length) throw dejaPris(r.rows[0]);
};

// Course entre deux enregistrements du même matricule : l'index unique tranche, le message est le même.
const enConflit = async (err, entrepriseId, matricule) => {
  if (err?.code !== '23505' || !matricule) return err;
  const r = await pool.query('SELECT id, nom FROM fournisseurs WHERE entreprise_id = $1 AND matricule_fiscal = $2', [entrepriseId, matricule]);
  const f = r.rows[0];
  return f ? dejaPris(f) : err;
};

const repondreErreur = (res, err) => {
  if (err?.status && err?.corps) return res.status(err.status).json(err.corps);
  console.error(err);
  return res.status(500).json({ message: 'Erreur serveur' });
};

const ficheApi = (r) => ({
  id: r.id, nom: r.nom, adresse: r.adresse, telephone: r.telephone,
  raisonSociale: r.raison_sociale ?? null, matriculeFiscal: r.matricule_fiscal ?? null, email: r.email ?? null, ville: r.ville ?? null,
});

// Le gérant n'agit que sur les fournisseurs de ses activités et labos.
const dansPerimetreGerant = async (req, fournisseurId) => {
  if (req.user.role !== 'gerant') return true;
  const actIds = req.user.gerantActiviteIds || [];
  const laboIds = req.user.gerantLaboIds || [];
  const r = await pool.query(
    `SELECT 1 FROM fournisseurs f WHERE f.id = $1 AND (
       EXISTS (SELECT 1 FROM fournisseur_activites fa WHERE fa.fournisseur_id = f.id AND fa.activite_id = ANY($2::int[]))
       OR EXISTS (SELECT 1 FROM fournisseur_labos fl WHERE fl.fournisseur_id = f.id AND fl.labo_id = ANY($3::int[])))`,
    [fournisseurId, actIds.length ? actIds : [-1], laboIds.length ? laboIds : [-1]]
  );
  return r.rows.length > 0;
};

// Affectations demandées : activités et labos du compte ; pour un gérant, de son périmètre seulement — sauf celles que
// le fournisseur a DÉJÀ (`dejaLies`) : l'écran renvoie la liste complète, le gérant ne fait que les garder.
const lireAffectations = async (req, entrepriseId, activiteIds, laboIds, dejaLies = { acts: [], labs: [] }) => {
  const ids = (v) => (Array.isArray(v) ? [...new Set(v.map(Number))] : []);
  const acts = ids(activiteIds), labs = ids(laboIds);
  if ([...acts, ...labs].some((id) => !Number.isInteger(id) || id <= 0 || id > ID_MAX)) throw erreur(400, 'AFFECTATION_INVALIDE', 'Affectation invalide');
  if (req.user.role === 'gerant') {
    const okA = req.user.gerantActiviteIds || [], okL = req.user.gerantLaboIds || [];
    if (acts.some((id) => !okA.includes(id) && !dejaLies.acts.includes(id)) || labs.some((id) => !okL.includes(id) && !dejaLies.labs.includes(id))) {
      throw erreur(403, 'HORS_PERIMETRE', 'Affectation hors de votre périmètre');
    }
  }
  const [ra, rl] = await Promise.all([
    acts.length ? pool.query('SELECT id FROM activites WHERE entreprise_id = $1 AND id = ANY($2::int[])', [entrepriseId, acts]) : { rows: [] },
    labs.length ? pool.query('SELECT id FROM labos WHERE entreprise_id = $1 AND id = ANY($2::int[])', [entrepriseId, labs]) : { rows: [] },
  ]);
  if (ra.rows.length !== acts.length || rl.rows.length !== labs.length) throw erreur(404, 'AFFECTATION_INTROUVABLE', 'Affectation introuvable');
  return { acts, labs };
};

// Un fournisseur est « utilisé » dès qu'une ligne de stock, une production ou une facture DU COMPTE le cite (une
// référence posée par un autre compte ne bloque pas sa suppression). `f` = l'alias de la table fournisseurs.
const SQL_UTILISE = (col) => `(
  EXISTS (SELECT 1 FROM stock_entreprise_daily u JOIN activites a ON a.id = u.activite_id
          WHERE u.fournisseur_id = ${col} AND a.entreprise_id = f.entreprise_id)
  OR EXISTS (SELECT 1 FROM stock_labo_daily u JOIN labos l ON l.id = u.labo_id
             WHERE u.fournisseur_id = ${col} AND l.entreprise_id = f.entreprise_id)
  OR EXISTS (SELECT 1 FROM stock_produits_transformes u JOIN activites a ON a.id = u.activite_id
             WHERE u.fournisseur_id = ${col} AND a.entreprise_id = f.entreprise_id)
  OR EXISTS (SELECT 1 FROM stock_labo_pt_daily u JOIN labos l ON l.id = u.labo_id
             WHERE u.fournisseur_id = ${col} AND l.entreprise_id = f.entreprise_id)
  OR EXISTS (SELECT 1 FROM factures u JOIN profil_entreprise pe ON pe.client_id = u.client_id
             WHERE u.fournisseur_id = ${col} AND pe.id = f.entreprise_id))`;

const listFournisseurs = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  const isGerant = req.user.role === 'gerant';
  try {
    const entrepriseId = await getEntrepriseId(clientId);
    if (!entrepriseId) return res.json([]);

    const params = [entrepriseId];
    let gerantClause = '';
    if (isGerant) {
      const actIds = (req.user.gerantActiviteIds || []);
      const laboIds = (req.user.gerantLaboIds || []);
      params.push(actIds.length ? actIds : [-1]); const _ai = params.length;
      params.push(laboIds.length ? laboIds : [-1]); const _li = params.length;
      gerantClause = ` AND (EXISTS (SELECT 1 FROM fournisseur_activites fag WHERE fag.fournisseur_id = f.id AND fag.activite_id = ANY($${_ai}::int[])) OR EXISTS (SELECT 1 FROM fournisseur_labos flg WHERE flg.fournisseur_id = f.id AND flg.labo_id = ANY($${_li}::int[])))`;
    }

    const result = await pool.query(
      `SELECT f.id, f.nom, f.adresse, f.telephone, f.is_labo, f.created_at,
              f.raison_sociale, f.matricule_fiscal, f.email, f.ville,
              COALESCE(
                json_agg(DISTINCT fa.activite_id) FILTER (WHERE fa.activite_id IS NOT NULL),
                '[]'
              ) as activite_ids,
              COALESCE(
                json_agg(DISTINCT fl.labo_id) FILTER (WHERE fl.labo_id IS NOT NULL),
                '[]'
              ) as labo_ids,
              (SELECT COUNT(*) FROM stock_entreprise_daily sed WHERE sed.fournisseur_id = f.id AND sed.quantite > 0) AS appro_count,
              (SELECT COALESCE(json_agg(json_build_object('activiteId', sub.activite_id, 'nom', a.nom, 'count', sub.cnt)), '[]')
               FROM (
                 SELECT sed2.activite_id, COUNT(*) AS cnt
                 FROM stock_entreprise_daily sed2
                 WHERE sed2.fournisseur_id = f.id AND sed2.quantite > 0
                 GROUP BY sed2.activite_id
               ) sub
               JOIN activites a ON a.id = sub.activite_id
              ) AS appro_by_activite,
              ${SQL_UTILISE('f.id')} AS utilise
       FROM fournisseurs f
       LEFT JOIN fournisseur_activites fa ON fa.fournisseur_id = f.id
       LEFT JOIN fournisseur_labos fl ON fl.fournisseur_id = f.id
       WHERE f.entreprise_id = $1 AND f.nom != 'AUTO'${gerantClause}
       GROUP BY f.id
       ORDER BY f.is_labo DESC, f.nom`,
      params
    );
    res.json(result.rows.map((r) => ({
      ...ficheApi(r),
      isLabo: r.is_labo ?? false,
      createdAt: r.created_at,
      activiteIds: r.activite_ids,
      laboIds: r.labo_ids,
      // Depuis F2 : vrai dès que le fournisseur figure quelque part (activités, labos, productions, factures).
      hasAppros: r.utilise === true,
      approCount: Number(r.appro_count),
      approByActivite: r.appro_by_activite ?? [],
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getFournisseursForActivite = async (req, res) => {
  const { activiteId } = req.params;
  if (!/^\d{1,9}$/.test(String(activiteId))) return res.json([]);
  const clientId = req.user.gerant_parent_id || req.user.id;
  // Périmètre gérant : interdire l'accès à une activité non affectée
  if (req.user.role === 'gerant' && !(req.user.gerantActiviteIds || []).includes(Number(activiteId))) {
    return res.status(403).json({ message: 'Accès non autorisé à [[ce:activite]]' });
  }
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, clientId]
    );
    if (check.rows.length === 0) return res.json([]);

    const result = await pool.query(
      `SELECT f.id, f.nom, f.telephone, f.is_labo, f.raison_sociale, f.matricule_fiscal
       FROM fournisseurs f
       JOIN fournisseur_activites fa ON fa.fournisseur_id = f.id
       WHERE f.nom != 'AUTO' AND fa.activite_id = $1 AND f.is_labo = false
       ORDER BY f.nom`,
      [activiteId]
    );
    res.json(result.rows.map((r) => ({
      id: r.id, nom: r.nom, telephone: r.telephone, isLabo: r.is_labo ?? false,
      raisonSociale: r.raison_sociale ?? null, matriculeFiscal: r.matricule_fiscal ?? null,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const createFournisseur = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  let entrepriseId = null;
  let fiche = null;
  try {
    fiche = lireFiche(req.body);
    entrepriseId = await getEntrepriseId(clientId);
    if (!entrepriseId) return res.status(403).json({ message: 'Entreprise introuvable' });
    // Affectations contrôlées AVANT d'écrire quoi que ce soit (périmètre du gérant, activités et labos du compte).
    const { acts, labs } = await lireAffectations(req, entrepriseId, req.body.activiteIds, req.body.laboIds);
    await controlerMatriculeLibre(pool, entrepriseId, fiche.matriculeFiscal);
    const cree = await withTransaction(async (db) => {
      const r = await db.query(
        `INSERT INTO fournisseurs (entreprise_id, nom, adresse, telephone, raison_sociale, matricule_fiscal, email, ville, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [entrepriseId, fiche.nom, fiche.adresse, fiche.telephone, fiche.raisonSociale, fiche.matriculeFiscal, fiche.email, fiche.ville, req.user.id]
      );
      const f = r.rows[0];
      if (acts.length) {
        await db.query('INSERT INTO fournisseur_activites (fournisseur_id, activite_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING', [f.id, acts]);
      }
      if (labs.length) {
        await db.query('INSERT INTO fournisseur_labos (fournisseur_id, labo_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING', [f.id, labs]);
      }
      return f;
    });
    res.status(201).json({ ...ficheApi(cree), activiteIds: acts, laboIds: labs });
  } catch (err) {
    repondreErreur(res, await enConflit(err, entrepriseId, fiche?.matriculeFiscal));
  }
};

// Fournisseur du compte modifiable ici : ni celui d'un labo (géré par le labo), ni le fournisseur technique AUTO.
const ficheModifiable = async (res, id, entrepriseId) => {
  const check = await pool.query('SELECT * FROM fournisseurs WHERE id = $1 AND entreprise_id = $2', [id, entrepriseId]);
  const f = check.rows[0];
  if (!f || f.nom === 'AUTO') { res.status(404).json({ message: '[[Nom:fournisseur]] introuvable' }); return null; }
  if (f.is_labo) { res.status(403).json({ message: '[[Ce:fournisseur]] est [[acc:fournisseur:géré:gérée]] automatiquement par [[le:labo]].' }); return null; }
  return f;
};

const updateFournisseur = async (req, res) => {
  const { id } = req.params;
  if (!/^\d{1,9}$/.test(String(id))) return res.status(404).json({ message: '[[Nom:fournisseur]] introuvable' });
  const clientId = req.user.gerant_parent_id || req.user.id;
  let entrepriseId = null;
  let fiche = null;
  try {
    fiche = lireFiche(req.body);
    entrepriseId = await getEntrepriseId(clientId);
    const actuel = await ficheModifiable(res, id, entrepriseId);
    if (!actuel) return;
    if (!(await dansPerimetreGerant(req, id))) return res.status(403).json({ message: 'Accès refusé' });
    // Identité légale absente du corps : gardée telle quelle (un null explicite l'efface).
    for (const cle of CHAMPS_IDENTITE) if (!(cle in req.body)) fiche[cle] = actuel[COLONNES[cle]] ?? null;
    const [liesA, liesL] = await Promise.all([
      pool.query('SELECT activite_id FROM fournisseur_activites WHERE fournisseur_id = $1', [id]),
      pool.query('SELECT labo_id FROM fournisseur_labos WHERE fournisseur_id = $1', [id]),
    ]);
    const { acts, labs } = await lireAffectations(req, entrepriseId, req.body.activiteIds, req.body.laboIds,
      { acts: liesA.rows.map((r) => r.activite_id), labs: liesL.rows.map((r) => r.labo_id) });
    await controlerMatriculeLibre(pool, entrepriseId, fiche.matriculeFiscal, Number(id));

    await withTransaction(async (db) => {
      await db.query(
        `UPDATE fournisseurs SET nom = $1, adresse = $2, telephone = $3, raison_sociale = $4, matricule_fiscal = $5, email = $6, ville = $7
         WHERE id = $8`,
        [fiche.nom, fiche.adresse, fiche.telephone, fiche.raisonSociale, fiche.matriculeFiscal, fiche.email, fiche.ville, id]
      );
      // Un gérant ne retire pas les affectations qu'il ne voit pas (activités et labos hors de son périmètre).
      const gerant = req.user.role === 'gerant';
      await db.query(
        `DELETE FROM fournisseur_activites WHERE fournisseur_id = $1 ${gerant ? 'AND activite_id = ANY($2::int[])' : ''}`,
        gerant ? [id, req.user.gerantActiviteIds || []] : [id]
      );
      if (acts.length) await db.query('INSERT INTO fournisseur_activites (fournisseur_id, activite_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING', [id, acts]);
      await db.query(
        `DELETE FROM fournisseur_labos WHERE fournisseur_id = $1 ${gerant ? 'AND labo_id = ANY($2::int[])' : ''}`,
        gerant ? [id, req.user.gerantLaboIds || []] : [id]
      );
      if (labs.length) await db.query('INSERT INTO fournisseur_labos (fournisseur_id, labo_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING', [id, labs]);
    });
    res.json({ success: true });
  } catch (err) {
    repondreErreur(res, await enConflit(err, entrepriseId, fiche?.matriculeFiscal));
  }
};

/* PATCH /api/entreprise/fournisseurs/:id/identite — complète la fiche avec ce qu'une facture a appris (étape F2) :
 * seuls les champs PRÉSENTS dans le corps sont écrits (matricule lu, raison sociale, email, ville…). Le reste de la
 * fiche et ses affectations ne bougent pas. */
const completerFournisseur = async (req, res) => {
  const { id } = req.params;
  if (!/^\d{1,9}$/.test(String(id))) return res.status(404).json({ message: '[[Nom:fournisseur]] introuvable' });
  const clientId = req.user.gerant_parent_id || req.user.id;
  let entrepriseId = null;
  let fiche = null;
  try {
    fiche = lireFiche(req.body, { partiel: true });
    const cles = Object.keys(fiche);
    if (!cles.length) return res.status(400).json({ code: 'RIEN_A_ECRIRE', message: 'Aucun champ à enregistrer.' });
    entrepriseId = await getEntrepriseId(clientId);
    if (!(await ficheModifiable(res, id, entrepriseId))) return;
    if (!(await dansPerimetreGerant(req, id))) return res.status(403).json({ message: 'Accès refusé' });
    if ('matriculeFiscal' in fiche) await controlerMatriculeLibre(pool, entrepriseId, fiche.matriculeFiscal, Number(id));
    const sets = cles.map((c, i) => `${COLONNES[c]} = $${i + 2}`);
    const r = await pool.query(`UPDATE fournisseurs SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, [id, ...cles.map((c) => fiche[c])]);
    res.json(ficheApi(r.rows[0]));
  } catch (err) {
    repondreErreur(res, await enConflit(err, entrepriseId, fiche?.matriculeFiscal));
  }
};

/* POST /api/entreprise/fournisseurs/:id/lier — rattache un fournisseur du compte à une activité ou à un labo (étape F2 :
 * la facture déposée a reconnu un fournisseur qui n'était pas encore proposé à cet endroit). Corps : { activiteId } ou
 * { laboId }, et le matricule lu sur la facture (`matriculeFiscal`). Un gérant ne rattache qu'à ses activités et labos,
 * et seulement un fournisseur qu'il voit déjà, ou dont il présente le matricule enregistré (lu sur la facture) : il ne
 * peut pas s'approprier un fournisseur du compte par son seul identifiant. */
const lierFournisseur = async (req, res) => {
  const { id } = req.params;
  if (!/^\d{1,9}$/.test(String(id))) return res.status(404).json({ message: '[[Nom:fournisseur]] introuvable' });
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    const entrepriseId = await getEntrepriseId(clientId);
    const f = await ficheModifiable(res, id, entrepriseId);
    if (!f) return;
    if (req.user.role === 'gerant' && !(await dansPerimetreGerant(req, id))) {
      const presente = typeof req.body?.matriculeFiscal === 'string' ? normaliserMatriculeFiscal(req.body.matriculeFiscal) : '';
      if (!f.matricule_fiscal || presente !== f.matricule_fiscal) return res.status(404).json({ message: '[[Nom:fournisseur]] introuvable' });
    }
    const activiteId = req.body?.activiteId != null ? [req.body.activiteId] : [];
    const laboId = req.body?.laboId != null ? [req.body.laboId] : [];
    if (activiteId.length + laboId.length !== 1) return res.status(400).json({ code: 'CIBLE_INVALIDE', message: 'Choisissez [[le:activite]] ou [[le:labo]].' });
    const { acts, labs } = await lireAffectations(req, entrepriseId, activiteId, laboId);
    if (acts.length) await pool.query('INSERT INTO fournisseur_activites (fournisseur_id, activite_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, acts[0]]);
    if (labs.length) await pool.query('INSERT INTO fournisseur_labos (fournisseur_id, labo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, labs[0]]);
    res.json(ficheApi(f));
  } catch (err) {
    repondreErreur(res, err);
  }
};

const deleteFournisseur = async (req, res) => {
  const { id } = req.params;
  if (!/^\d{1,9}$/.test(String(id))) return res.status(404).json({ message: '[[Nom:fournisseur]] introuvable' });
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    const entrepriseId = await getEntrepriseId(clientId);
    if (!(await ficheModifiable(res, id, entrepriseId))) return;
    if (!(await dansPerimetreGerant(req, id))) return res.status(403).json({ message: 'Accès refusé' });
    // Garde du serveur (étape F2) : un fournisseur cité par des approvisionnements ou des factures ne se supprime pas.
    // Sous le verrou des factures du compte, la fiche verrouillée (une ligne qui la cite attend), puis relue : une
    // facture enregistrée pendant la suppression ne perd pas son fournisseur.
    await withTransaction(async (db) => {
      await verrouillerFactures(db, clientId);
      await db.query('SELECT id FROM fournisseurs WHERE id = $1 FOR UPDATE', [id]);
      const u = await db.query(`SELECT ${SQL_UTILISE('f.id')} AS utilise FROM fournisseurs f WHERE f.id = $1`, [id]);
      if (u.rows[0]?.utilise) {
        throw erreur(409, 'FOURNISSEUR_UTILISE', 'Suppression impossible : [[ce:fournisseur]] figure dans [[votre:appro:pl:court]] ou vos factures.');
      }
      await db.query('DELETE FROM fournisseurs WHERE id = $1', [id]);
    });
    res.json({ success: true });
  } catch (err) {
    repondreErreur(res, err);
  }
};

// GET /api/entreprise/fournisseurs/template — modèle Excel de l'ajout dynamique
const getFournisseursTemplate = async (req, res) => {
  try {
    const { brandTemplate } = require('../services/excelBrandService');
    const voc = req.voc ?? vocabDefaut;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(ongletSur(wb, voc.Court('fournisseur', true)));
    brandTemplate(wb, ws, {
      titre: `Modèle d'import — ${voc.Court('fournisseur', true)}`,
      sousTitre: `Ajout dynamique ${voc.du('fournisseur', true)} : une ligne = ${voc.un('fournisseur')}`,
      meta: "Remplissez vos lignes sous les en-têtes — la ligne d'exemple (grisée) sera ignorée à l'import. Seul le nom est obligatoire ; le matricule fiscal permet de reconnaître les factures déposées.",
      headers: IMPORT_HEADERS,
      widths: [30, 20, 38, 18, 22, 28],
      exemple: ['Exemple : Société Ben Ammar', '71 234 567', 'Zone industrielle', 'Ben Arous', '1234567A/A/M/000', 'contact@benammar.tn'],
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="modele_fournisseurs.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur lors de la génération du modèle' });
  }
};

// POST /api/entreprise/fournisseurs/import — ajout dynamique (Excel).
// Chaque fournisseur importé est assigné à l'ENSEMBLE des activités et labos
// (périmètre du gérant s'il importe en tant que gérant) ; les affectations
// restent modifiables fournisseur par fournisseur après l'import.
const importFournisseurs = [
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Fichier requis' });
    const clientId = req.user.gerant_parent_id || req.user.id;
    const isGerant = req.user.role === 'gerant';
    try {
      const entrepriseId = await getEntrepriseId(clientId);
      if (!entrepriseId) return res.status(403).json({ message: 'Entreprise introuvable' });

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);
      const ws = wb.worksheets[0];
      if (!ws) return res.status(400).json({ message: 'Fichier Excel vide ou illisible' });

      // Les données commencent APRÈS la ligne d'en-têtes (bandeau de marque au-dessus),
      // et la ligne d'exemple grisée du modèle est ignorée. Ancien modèle (3 colonnes) : accepté.
      const { findHeaderRow, isExampleRow } = require('../services/excelBrandService');
      const headerRowNum = findHeaderRow(ws, IMPORT_HEADERS_ANCIENS) ?? 1;
      // Colonnes ajoutées par F2 (Ville, Matricule fiscal, Email) : cherchées par leur titre, dans n'importe quel ordre
      // après les trois premières (« matricule », « e-mail » admis) ; absentes : ancien modèle.
      const titre = (i) => String(ws.getRow(headerRowNum).getCell(i).text || '').trim().toLowerCase()
        .normalize('NFD').replace(/[^a-z]/g, '');
      const colonne = (...noms) => {
        for (let i = 4; i <= Math.max(6, ws.getRow(headerRowNum).cellCount); i++) if (noms.includes(titre(i))) return i;
        return null;
      };
      const cVille = colonne('ville');
      const cMatricule = colonne('matriculefiscal', 'matricule', 'mf');
      const cEmail = colonne('email', 'mail', 'courriel');
      const lignes = [];
      ws.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowNum || isExampleRow(row)) return;
        const cell = (i) => (i ? String(row.getCell(i).text || '').trim() : '');
        lignes.push({
          row: rowNumber, nom: cell(1), telephone: cell(2), adresse: cell(3),
          ville: cell(cVille), matriculeFiscal: cell(cMatricule), email: cell(cEmail),
        });
      });
      const nonVides = lignes.filter((l) => l.nom || l.telephone || l.adresse || l.ville || l.matriculeFiscal || l.email);
      if (nonVides.length === 0) return res.status(400).json({ message: 'Aucune ligne à importer' });
      if (nonVides.length > IMPORT_MAX_ROWS) return res.status(400).json({ message: `Maximum ${IMPORT_MAX_ROWS} lignes par fichier` });

      // Doublons : dans le fichier ET contre le répertoire existant (nom insensible à la casse ; matricule)
      const existants = await pool.query('SELECT LOWER(nom) AS nom, matricule_fiscal FROM fournisseurs WHERE entreprise_id = $1', [entrepriseId]);
      const dejaLa = new Set(existants.rows.map((r) => r.nom));
      const matriculesPris = new Set(existants.rows.map((r) => r.matricule_fiscal).filter(Boolean));
      const compte = await pool.query('SELECT matricule_fiscal FROM profil_entreprise WHERE id = $1', [entrepriseId]);
      const propre = String(compte.rows[0]?.matricule_fiscal ?? '').replace(/[^0-9A-Z]/gi, '').slice(0, 7);
      const vusFichier = new Set();
      const valides = [];
      const details = [];
      for (const l of nonVides) {
        let fiche;
        try {
          fiche = lireFiche({ nom: l.nom, telephone: l.telephone, adresse: l.adresse, ville: l.ville, matriculeFiscal: l.matriculeFiscal, email: l.email });
        } catch (e) {
          details.push({ row: l.row, nom: l.nom, status: 'error', error: e.corps?.message || 'Ligne invalide' });
          continue;
        }
        const cle = fiche.nom.toLowerCase();
        if (dejaLa.has(cle)) { details.push({ row: l.row, nom: l.nom, status: 'error', error: 'Existe déjà dans votre répertoire' }); continue; }
        if (vusFichier.has(cle)) { details.push({ row: l.row, nom: l.nom, status: 'error', error: 'Nom en double dans le fichier' }); continue; }
        if (fiche.matriculeFiscal && propre.length === 7 && fiche.matriculeFiscal.slice(0, 7) === propre) {
          details.push({ row: l.row, nom: l.nom, status: 'error', error: 'Matricule fiscal de votre propre entreprise' });
          continue;
        }
        if (fiche.matriculeFiscal && matriculesPris.has(fiche.matriculeFiscal)) {
          details.push({ row: l.row, nom: l.nom, status: 'error', error: 'Matricule fiscal déjà présent (répertoire ou fichier)' });
          continue;
        }
        vusFichier.add(cle);
        if (fiche.matriculeFiscal) matriculesPris.add(fiche.matriculeFiscal);
        valides.push({ row: l.row, ...fiche });
      }
      if (valides.length === 0) {
        return res.status(400).json({ message: 'Aucune ligne valide', processed: 0, errors: details.length, details });
      }

      // Cibles d'affectation : toutes les activités + tous les labos du compte
      // (restreints au périmètre du gérant le cas échéant).
      const [acts, labs] = await Promise.all([
        pool.query('SELECT id FROM activites WHERE entreprise_id = $1', [entrepriseId]),
        pool.query('SELECT id FROM labos WHERE entreprise_id = $1', [entrepriseId]),
      ]);
      let actIds = acts.rows.map((r) => Number(r.id));
      let laboIds = labs.rows.map((r) => Number(r.id));
      if (isGerant) {
        const aOk = new Set(req.user.gerantActiviteIds || []);
        const lOk = new Set(req.user.gerantLaboIds || []);
        actIds = actIds.filter((id) => aOk.has(id));
        laboIds = laboIds.filter((id) => lOk.has(id));
      }

      const db = await pool.connect();
      let crees = 0;
      try {
        await db.query('BEGIN');
        for (const v of valides) {
          // SAVEPOINT par ligne : une erreur SQL isolée ne doit pas avorter
          // silencieusement toute la transaction (leçon de l'import acheteurs).
          await db.query('SAVEPOINT ligne');
          try {
            const r = await db.query(
              `INSERT INTO fournisseurs (entreprise_id, nom, telephone, adresse, ville, matricule_fiscal, email, created_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
              [entrepriseId, v.nom, v.telephone, v.adresse, v.ville, v.matriculeFiscal, v.email, req.user.id]
            );
            const fid = r.rows[0].id;
            if (actIds.length) {
              await db.query(
                `INSERT INTO fournisseur_activites (fournisseur_id, activite_id)
                 SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
                [fid, actIds]
              );
            }
            if (laboIds.length) {
              await db.query(
                `INSERT INTO fournisseur_labos (fournisseur_id, labo_id)
                 SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
                [fid, laboIds]
              );
            }
            crees++;
            details.push({ row: v.row, nom: v.nom, status: 'ok' });
          } catch (e) {
            await db.query('ROLLBACK TO SAVEPOINT ligne');
            details.push({ row: v.row, nom: v.nom, status: 'error', error: e.code === '23505' ? 'Matricule fiscal déjà présent' : 'Ligne rejetée par la base' });
            console.error('Import fournisseur ligne', v.row, e.message);
          }
        }
        await db.query('COMMIT');
      } catch (err) {
        await db.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        db.release();
      }

      details.sort((a, b) => a.row - b.row);
      res.json({
        processed: crees,
        stats: { crees, activites: actIds.length, labos: laboIds.length },
        errors: details.filter((d) => d.status === 'error').length,
        details,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Erreur lors de l'import" });
    }
  },
];

module.exports = {
  listFournisseurs, getFournisseursForActivite, createFournisseur, updateFournisseur, deleteFournisseur,
  completerFournisseur, lierFournisseur, getFournisseursTemplate, importFournisseurs, lireFiche,
};
