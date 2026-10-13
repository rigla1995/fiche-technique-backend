// P1 « L'unité des produits utilisables » (labflow-reprise/produits-prestataires/PLAN.md §2 ligne P1, §3, §4 question 1 ;
// réponses du client du 13/10). Un produit utilisable a une UNITÉ FINALE (kg, pièce…) et la QUANTITÉ que produit sa
// recette (4,6 kg). Sa recette s'enregistre pour 1 unité : l'écran envoie les quantités pour 1 unité (2 kg pour 4,6 kg
// → 0,434783), et la production, le stock, les coûts et les transferts restent « portion × quantité » dans cette unité.
// Les produits d'avant n'ont ni unité ni quantité : ils restent comptés « à la recette » (1 unité = 1 recette).
// Règles (question 1, recommandé et accepté) :
//  - l'unité ne change plus dès que le produit a un mouvement de stock (production, réception, transfert, perte,
//    inventaire, activité ou labo) : le stock déjà compté le serait dans l'ancienne unité ;
//  - la quantité produite peut changer (la recette pour 1 unité est recalculée par l'écran ; des kg restent des kg) ;
//  - quand l'unité change, les recettes qui utilisent le produit sont converties (0,2 recette → 0,92 kg) : même quantité
//    de matière, comptée dans la nouvelle unité.

const DECIMALES = 6;
const arrondi6 = (x) => Math.round(Number(x) * 10 ** DECIMALES) / 10 ** DECIMALES;

// Erreur à statut et code ; le message (balisé) est écrit dans le new Error de l'appel, où il est rendu au bord.
const erreur = (status, code, e) => Object.assign(e, { status, code });

// Lit l'unité et la quantité produite d'une demande (création ou modification). → { fournie, uniteId, quantiteProduite }
// `fournie` = false quand la demande n'en parle pas (modification partielle : rien ne change). Lève 400 si incomplète.
function lireUniteProduit(body = {}) {
  const aUnite = Object.prototype.hasOwnProperty.call(body, 'uniteId');
  const aQuantite = Object.prototype.hasOwnProperty.call(body, 'quantiteProduite');
  if (!aUnite && !aQuantite) return { fournie: false, uniteId: null, quantiteProduite: null };
  const uniteId = body.uniteId == null || body.uniteId === '' ? null : Number(body.uniteId);
  const brute = body.quantiteProduite == null || body.quantiteProduite === '' ? null : Number(body.quantiteProduite);
  if (uniteId == null && brute == null) return { fournie: true, uniteId: null, quantiteProduite: null };
  if (!Number.isInteger(uniteId) || uniteId <= 0) throw erreur(400, 'UNITE_REQUISE', new Error("Choisissez l'unité finale [[du:produit_utilisable]]."));
  if (!Number.isFinite(brute) || brute <= 0) throw erreur(400, 'QUANTITE_PRODUITE_REQUISE', new Error('Indiquez la quantité obtenue avec [[le:recette]] (plus de 0).'));
  const quantiteProduite = Math.round(brute * 1000) / 1000;
  if (quantiteProduite <= 0) throw erreur(400, 'QUANTITE_PRODUITE_REQUISE', new Error('Indiquez la quantité obtenue avec [[le:recette]] (plus de 0).'));
  if (quantiteProduite >= 1e9) throw erreur(400, 'QUANTITE_PRODUITE_TROP_GRANDE', new Error('Quantité produite trop grande.'));
  return { fournie: true, uniteId, quantiteProduite };
}

// Facteur qui convertit une quantité du produit de l'ancienne unité vers la nouvelle, par l'équivalence « 1 recette » :
// ancienne quantité ÷ ancienne quantité produite × nouvelle quantité produite (un produit sans unité : 1 recette = 1).
// null quand l'unité ne change pas (rien à convertir).
function facteurConversion(ancien, nouveau) {
  const memeUnite = (ancien.uniteId ?? null) === (nouveau.uniteId ?? null);
  if (memeUnite) return null;
  const qa = ancien.uniteId == null ? 1 : Number(ancien.quantiteProduite);
  const qn = nouveau.uniteId == null ? 1 : Number(nouveau.quantiteProduite);
  return qn / qa;
}

// Les quantités d'une recette envoyées par l'écran, arrondies à 6 décimales ; une quantité qui tomberait à 0 est refusée
// (trop petite pour 1 unité : changer l'unité de l'article ou la quantité produite).
function portionsArrondies(lignes) {
  return (lignes || []).map((l) => {
    const portion = arrondi6(l.portion);
    if (!(portion > 0)) throw erreur(400, 'PORTION_TROP_PETITE', new Error('Une quantité [[du:recette]] est trop petite pour 1 unité.'));
    return { ...l, portion };
  });
}

// Le produit a-t-il déjà un mouvement de stock, quelque part ? (production, réception, consommation, transfert, perte,
// inventaire ; activité ou labo)
const SQL_MOUVEMENTS = `SELECT
    EXISTS (SELECT 1 FROM stock_produits_transformes WHERE produit_id = $1)
 OR EXISTS (SELECT 1 FROM stock_labo_pt_daily WHERE produit_id = $1)
 OR EXISTS (SELECT 1 FROM labo_transfers WHERE produit_id = $1)
 OR EXISTS (SELECT 1 FROM labo_pertes WHERE produit_id = $1)
 OR EXISTS (SELECT 1 FROM pertes WHERE produit_id = $1)
 OR EXISTS (SELECT 1 FROM inventaires WHERE produit_id = $1) AS a_mouvements`;
async function aDesMouvements(db, produitId) {
  const r = await db.query(SQL_MOUVEMENTS, [produitId]);
  return r.rows[0].a_mouvements === true;
}

module.exports = { DECIMALES, arrondi6, lireUniteProduit, facteurConversion, portionsArrondies, aDesMouvements, SQL_MOUVEMENTS };
