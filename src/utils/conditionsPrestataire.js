// P2 « Conditions des prestataires et chiffre net » (labflow-reprise/produits-prestataires/PLAN.md §2 ligne P2, §3 ;
// réponses du client du 13/10 : le client saisit lui-même, à l'activation de chaque prestataire pour une activité, la
// commission (%), la TVA (%) sur cette commission et le mode de paiement, dans la liste tenue par l'admin). Chaque vente
// par prestataire fige ces conditions le jour de sa saisie (migration 238). Le chiffre net du prestataire :
//   net = prix de vente − commission − TVA sur la commission   (30,000 à 25 % et 19 % : 7,500 + 1,425 → 21,075).

const erreur = (status, code, e) => Object.assign(e, { status, code });
const r3 = (x) => Math.round(x * 1000) / 1000;
// Un taux : un nombre de 0 à 100, gardé à 2 décimales ; null sinon.
const lireTaux = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
};
const present = (body, cle) => Object.prototype.hasOwnProperty.call(body, cle) && body[cle] !== null && body[cle] !== '';

// Lit les conditions d'une demande (clés de l'écran : taux_commission, taux_tva, mode_paiement_id). complet : les trois
// sont exigées (activation) ; sinon seules celles présentes sont lues (modification) et les autres restent undefined.
function lireConditions(body = {}, { complet = true } = {}) {
  const manque = () => erreur(400, 'CONDITIONS_REQUISES', new Error('Renseignez la commission, la TVA et le mode de paiement [[du:prestataire]].'));
  const out = { tauxCommission: undefined, tauxTva: undefined, modePaiementId: undefined };
  for (const [cle, champ] of [['taux_commission', 'tauxCommission'], ['taux_tva', 'tauxTva']]) {
    if (!present(body, cle)) { if (complet) throw manque(); continue; }
    const t = lireTaux(body[cle]);
    if (t == null) throw erreur(400, 'TAUX_INVALIDE', new Error('Un taux est un nombre de 0 à 100.'));
    out[champ] = t;
  }
  if (!present(body, 'mode_paiement_id')) { if (complet) throw manque(); }
  else {
    const id = Number(body.mode_paiement_id);
    if (!Number.isInteger(id) || id <= 0) throw erreur(400, 'MODE_PAIEMENT_INVALIDE', new Error('Mode de paiement invalide.'));
    out.modePaiementId = id;
  }
  return out;
}

// Le chiffre net d'un prestataire sur un chiffre d'affaires, avec les taux figés (3 décimales, comme les montants).
function netPrestataire(ca, tauxCommission, tauxTva) {
  const commission = r3(Number(ca || 0) * Number(tauxCommission || 0) / 100);
  const tva = r3(commission * Number(tauxTva || 0) / 100);
  return { commission, tva, net: r3(Number(ca || 0) - commission - tva) };
}

// Code d'un mode de paiement à partir de son libellé (« Chèque bancaire » → « cheque_bancaire »), 30 caractères au plus.
function codeMode(libelle) {
  return String(libelle || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
}

// Expressions SQL d'une ligne de vente (alias v = ventes, vl = vente_lignes) : la commission et sa TVA, aux taux FIGÉS
// sur la vente (jamais ceux du prestataire aujourd'hui).
const SQL_COMMISSION_LIGNE = `CASE WHEN v.type_vente = 'prestataire' THEN vl.quantite * vl.prix_unitaire * COALESCE(v.taux_commission, 0) / 100 ELSE 0 END`;
const SQL_TVA_COMMISSION_LIGNE = `(${SQL_COMMISSION_LIGNE}) * COALESCE(v.taux_tva_commission, 0) / 100`;

module.exports = { lireConditions, lireTaux, netPrestataire, codeMode, SQL_COMMISSION_LIGNE, SQL_TVA_COMMISSION_LIGNE };
