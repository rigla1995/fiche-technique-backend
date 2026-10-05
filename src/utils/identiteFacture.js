// Identité imprimée sur les factures (lot 3, étape 8 — spec docs/lot-3-spec.md §6).
//
// Une facture émise ne suit plus la fiche : l'identité du VENDEUR (facture de vente) est copiée sur la facture à
// son émission, celle du CLIENT (facture d'abonnement) au passage du paiement à « payé ». La copie porte ce que la
// facture imprimait déjà (nom, adresse, téléphone, email) et les mentions légales de la fiche, quand elles y sont.
// Une facture SANS copie (émise avant la migration 199) se lit sur la fiche, comme avant, et s'imprime sans mention
// légale : pas de reprise (décision du client, 05/10/2026).
// La facture d'approvisionnement n'est pas concernée.

const vide = (v) => v == null || String(v).trim() === '';
const ou = (v) => (vide(v) ? null : String(v).trim());
// Comparaisons tolérantes : sans casse ni espaces multiples (plat), sans aucun séparateur (compact).
const plat = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const compact = (v) => String(v ?? '').toUpperCase().replace(/[\s.\-_/]/g, '');
// `texte` se termine par `fin`, pris comme un MOT entier (« 5 rue X, 2080 Ariana » finit par « 2080 Ariana » ;
// « Immeuble Tunisie » ne finit pas par « Tunis », ni « rue Mariana » par « Ariana »).
const finitParMot = (texte, fin) => {
  const t = plat(texte).replace(/[\s,;.]+$/, '');
  const f = plat(fin);
  if (!f || !t.endsWith(f)) return false;
  return t.length === f.length || !/[\p{L}\p{N}]/u.test(t[t.length - f.length - 1]);
};

// Forme juridique enregistrée → texte imprimé (mêmes libellés que l'écran : src/utils/identiteLegale.ts du
// frontend). « Autre » ne s'imprime pas.
const LIBELLES_FORME = {
  SARL: 'SARL', SUARL: 'SUARL', SA: 'SA', SNC: 'SNC',
  EI: 'Entreprise individuelle', AUTO_ENTREPRENEUR: 'Auto-entrepreneur', ASSOCIATION: 'Association',
};
const libelleForme = (code) => (Object.prototype.hasOwnProperty.call(LIBELLES_FORME, code) ? LIBELLES_FORME[code] : null);

// Mentions légales d'une copie figée, prêtes pour le bloc d'une partie (docuseal-templates/generate.js) : chaque
// valeur vide vaut null (ligne omise). Rien n'est imprimé deux fois :
//   - la forme, quand la raison sociale se termine déjà par elle (« Dar Yasmine SARL ») ;
//   - le RNE, quand il EST le matricule (un auto-entrepreneur n'a qu'un identifiant unique, que la lecture de la
//     patente range dans les deux champs) ;
//   - la ville, quand l'adresse se termine déjà par elle (adresse saisie avant le champ « Ville »).
const mentions = ({ raisonSociale, forme, matricule, rne, adresse, ville }) => {
  const mf = ou(matricule);
  const r = ou(rne);
  const v = ou(ville);
  const libelle = libelleForme(forme);
  return {
    forme: libelle && finitParMot(raisonSociale, libelle) ? null : libelle,
    matricule: mf,
    autoEntrepreneur: forme === 'AUTO_ENTREPRENEUR',
    rne: r && compact(r) !== compact(mf) ? r : null,
    ville: v && finitParMot(adresse, v) ? null : v,
  };
};

// ── Facture de vente (factures_acheteur) ──────────────────────────────────────────────────────────────────────

// Copie l'identité du vendeur sur la facture qui vient d'être émise — à appeler dans la transaction de son INSERT.
// Le compte existe toujours (clé étrangère) ; sans fiche d'entreprise la copie est vide, et figée quand même.
const figerVendeurFacture = (db, factureId) => db.query(
  `UPDATE factures_acheteur fa
      SET vendeur_fige_le = NOW(),
          vendeur_nom = pe.nom, vendeur_adresse = pe.adresse, vendeur_telephone = pe.telephone, vendeur_email = pe.email,
          vendeur_raison_sociale = pe.raison_sociale, vendeur_nom_commercial = pe.nom_commercial,
          vendeur_forme = pe.forme_juridique, vendeur_matricule_fiscal = pe.matricule_fiscal,
          vendeur_rne = pe.rne, vendeur_ville = pe.ville
     FROM utilisateurs u
     LEFT JOIN profil_entreprise pe ON pe.client_id = u.id
    WHERE fa.id = $1 AND u.id = fa.client_id`,
  [factureId]
);

// Colonnes du vendeur pour le téléchargement d'une facture de vente : la copie si elle existe, sinon la fiche
// (alias fa = factures_acheteur, pe = profil_entreprise du compte). À placer APRÈS « fa.* » : ces alias remplacent
// les colonnes de même nom, comme le font déjà ceux de l'acheteur.
const VENDEUR_FACTURE_SQL = `CASE WHEN fa.vendeur_fige_le IS NULL THEN pe.nom ELSE fa.vendeur_nom END AS vendeur_nom,
              CASE WHEN fa.vendeur_fige_le IS NULL THEN pe.adresse ELSE fa.vendeur_adresse END AS vendeur_adresse,
              CASE WHEN fa.vendeur_fige_le IS NULL THEN pe.telephone ELSE fa.vendeur_telephone END AS vendeur_tel,
              CASE WHEN fa.vendeur_fige_le IS NULL THEN pe.email ELSE fa.vendeur_email END AS vendeur_email`;

// Ligne SQL d'une facture de vente → vendeur du PDF. Sans copie : nom, adresse, téléphone, email, comme avant.
// Avec copie : la raison sociale remplace le nom du contact, et les mentions légales présentes s'ajoutent.
const vendeurFacture = (f = {}) => {
  const base = {
    nom: f.vendeur_nom || 'Vendeur',
    adresse: f.vendeur_adresse || null,
    tel: f.vendeur_tel || null,
    email: f.vendeur_email || null,
  };
  if (!f.vendeur_fige_le) return base;
  const raisonSociale = ou(f.vendeur_raison_sociale);
  const nom = raisonSociale || base.nom;
  const nomCommercial = ou(f.vendeur_nom_commercial);
  return {
    ...base,
    nom,
    nomCommercial: nomCommercial && plat(nomCommercial) !== plat(nom) ? nomCommercial : null,
    ...mentions({
      raisonSociale, forme: f.vendeur_forme, matricule: f.vendeur_matricule_fiscal, rne: f.vendeur_rne,
      adresse: base.adresse, ville: f.vendeur_ville,
    }),
  };
};

// ── Facture d'abonnement (paiements) ──────────────────────────────────────────────────────────────────────────

// Copie l'identité du client sur le paiement qui passe à « payé » ; la PREMIÈRE copie est gardée (payé → autre
// statut → payé ne la remplace pas). Rend la ligne du paiement à jour, ou null si la copie existait déjà.
const figerClientPaiement = async (db, paiementId) => {
  const r = await db.query(
    `UPDATE paiements p
        SET client_fige_le = NOW(),
            client_nom = u.nom, client_email = u.email,
            client_raison_sociale = pe.raison_sociale, client_forme = pe.forme_juridique,
            client_matricule_fiscal = pe.matricule_fiscal, client_rne = pe.rne,
            client_adresse = pe.adresse, client_ville = pe.ville
       FROM abonnements a
       JOIN utilisateurs u ON u.id = a.client_id
       LEFT JOIN profil_entreprise pe ON pe.client_id = u.id
      WHERE p.id = $1 AND a.id = p.abonnement_id AND p.client_fige_le IS NULL
      RETURNING p.*`,
    [paiementId]
  );
  return r.rows[0] || null;
};

// Ligne de paiement + compte ({ nom, email } lus en direct) → « Facturé à » du PDF. Sans copie : nom et email du
// compte, comme avant. Avec copie : la raison sociale (sinon le nom copié), l'email copié, les mentions présentes.
const clientFacture = (paiement = {}, compte = null) => {
  if (!paiement.client_fige_le) {
    return { clientNom: compte?.nom || 'Client', clientEmail: compte?.email || '' };
  }
  const raisonSociale = ou(paiement.client_raison_sociale);
  const adresse = ou(paiement.client_adresse);
  return {
    clientNom: raisonSociale || ou(paiement.client_nom) || 'Client',
    clientEmail: paiement.client_email || '',
    client: {
      ...mentions({
        raisonSociale, forme: paiement.client_forme, matricule: paiement.client_matricule_fiscal,
        rne: paiement.client_rne, adresse, ville: paiement.client_ville,
      }),
      adresse,
    },
  };
};

module.exports = {
  libelleForme, figerVendeurFacture, VENDEUR_FACTURE_SQL, vendeurFacture, figerClientPaiement, clientFacture,
};
