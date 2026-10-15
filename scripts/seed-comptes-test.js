/**
 * Seeds — trois comptes de TEST avec un flux complet, de LabFlow jusqu'à LabFlow Compta (données fictives) :
 *   • « Le Patio des Oliviers »     — Restauration : cuisine centrale + restaurant + salon de thé, 1 gérant ;
 *   • « Hôtel Les Dunes d'Or »      — Hôtellerie : cuisine centrale, économat, restaurant, bar, room service,
 *                                     housekeeping (centre de coût), 1 responsable de service ;
 *   • « Céramiques de Nabeul »      — Industrie (céramique) : site de production, showroom, 3 revendeurs (B2B),
 *                                     1 responsable de site.
 * Pour chacun : référentiel (unités, familles, catégories, articles), sites, fournisseurs (matricule fiscal), produits
 * (préparations, produits finis), réceptions par FACTURE FOURNISSEUR envoyée à la comptabilité (une écriture d'achat en
 * brouillard par facture), productions, livraisons internes, ventes, pertes, inventaire ; puis, dans LabFlow Compta
 * (module activé, dossier « Mon entreprise ») : capital, immobilisations, loyer, énergie, salaires, ventes du mois,
 * remises en banque, règlements des fournisseurs, dotation ; mois validés de janvier à septembre, clos de janvier à juin ;
 * octobre en brouillard (les factures du pont).
 *
 * Le script tourne LÀ OÙ LE SERVEUR TOURNE (il lit la base ET appelle l'API) :
 *   • en PROD, dans le conteneur du serveur :
 *       docker exec -it $(docker ps -q --filter name=ymet7rvc34rovueke7e4ohes) node scripts/seed-comptes-test.js
 *   • en local : BASE_URL=http://localhost:3000 node scripts/seed-comptes-test.js
 * Options : --refaire (efface les trois comptes puis les recrée), --nettoyer (efface seulement).
 * Réglages (variables d'environnement) : SEED_EMAIL (boîte qui reçoit les comptes, par alias « +… » : défaut
 * m.khelil.prof@gmail.com), SEED_DEBUT / SEED_FIN (période du flux LabFlow, défaut 2026-07-06 → 2026-10-10),
 * SEED_COMPTES (lesquels : resto, hotel, usine — séparés par des virgules ; défaut les trois ; --refaire et --nettoyer
 * ne touchent qu'à ceux-là). Le domaine de chaque compte est retrouvé par son slug, sinon par son nom (en prod,
 * l'industrie s'appelle « Industrie », slug usine) ; un composant renommé est retrouvé par son type.
 * Les comptes sont créés par l'API d'administration (l'email d'activation part donc vers l'alias), puis activés ici :
 * les mots de passe, tirés au sort, sont AFFICHÉS À LA FIN et nulle part ailleurs. Un super_admin temporaire sert le
 * temps du script et est supprimé à la fin.
 */
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../src/config/database');

const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const BOITE = (process.env.SEED_EMAIL || 'm.khelil.prof@gmail.com').trim().toLowerCase();
const DEBUT = process.env.SEED_DEBUT || '2026-07-06';
const FIN = process.env.SEED_FIN || '2026-10-10';
const ANNEE = DEBUT.slice(0, 4);
const ADMIN_EMAIL = 'seed-admin-temporaire@labflow.local';
const COMPTES = (process.env.SEED_COMPTES || 'resto,hotel,usine').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const alias = (suffixe) => BOITE.replace('@', `+${suffixe}@`);
// Le type technique attendu d'un composant du domaine, par code (pour retrouver un composant renommé).
const TYPE_PAR_CODE = { usine: 'labo', entrepot: 'labo', atelier: 'labo', cuisine: 'labo', economat: 'labo', labo: 'labo', showroom: 'activite', restaurant: 'activite', bar: 'activite', room_service: 'activite', housekeeping: 'activite', spa: 'activite', activite: 'activite', revendeur: 'acheteurs', client_pro: 'acheteurs', acheteurs: 'acheteurs', responsable: 'gerant', gerant: 'gerant' };
const mdp = () => `${crypto.randomBytes(9).toString('base64url')}Aa1!`;

// ─── Outils ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const r3 = (x) => Math.round(x * 1000) / 1000;
const ttc = (ht, tva) => r3(ht * (1 + tva / 100));
const jitter = (base, pct = 0.12) => r3(base * (1 - pct + Math.random() * pct * 2));
const qte = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const joursEntre = (de, a, jourSemaine) => {
  const out = [];
  const f = new Date(`${de}T00:00:00Z`);
  const t = new Date(`${a}T00:00:00Z`);
  const cur = new Date(f);
  cur.setUTCDate(cur.getUTCDate() + ((jourSemaine - f.getUTCDay() + 7) % 7));
  while (cur <= t) { out.push(cur.toISOString().slice(0, 10)); cur.setUTCDate(cur.getUTCDate() + 7); }
  return out;
};
const finDeMois = (ym) => { const [a, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`; };
const mois = (ym, j) => `${ym}-${String(j).padStart(2, '0')}`;
const montant = (n) => r3(n).toFixed(3);

const api = async (methode, chemin, corps, jeton) => {
  const r = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await r.text();
  let data = null;
  try { data = texte ? JSON.parse(texte) : null; } catch { data = texte; }
  if (!r.ok) throw new Error(`${methode} ${chemin} → ${r.status} ${typeof data === 'object' ? JSON.stringify(data) : data}`);
  return data;
};
// Une pièce PDF fictive d'une page (le pont ne passe en comptabilité qu'une facture accompagnée de sa pièce — F4).
const pdfFictif = (() => {
  const objets = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const flux = 'BT /F1 18 Tf 72 760 Td (Facture fictive - compte de test LabFlow) Tj ET';
  objets[3] = `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`;
  let corps = '%PDF-1.4\n';
  const offsets = [];
  objets.forEach((o, i) => { offsets.push(corps.length); corps += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = corps.length;
  corps += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(corps, 'latin1');
})();
// Une facture fournisseur saisie à la main (corps multipart, pièce fictive jointe), envoyée à la comptabilité.
const facture = async (jeton, donnees) => {
  const fd = new FormData();
  fd.append('donnees', JSON.stringify(donnees));
  fd.append('pieces', new Blob([pdfFictif], { type: 'application/pdf' }), `${donnees.refFacture}.pdf`);
  const r = await fetch(`${BASE}/api/appros/facture`, { method: 'POST', headers: { Authorization: `Bearer ${jeton}` }, body: fd });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`POST /api/appros/facture → ${r.status} ${JSON.stringify(data)}`);
  return data;
};
const login = async (email, password) => (await api('POST', '/auth/login', { email, password })).token;
// Un compte créé par l'API (email d'activation parti), activé ici avec un mot de passe tiré au sort.
const activer = async (email, password) => {
  const hash = await bcrypt.hash(password, 10);
  const u = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = $1', [email.toLowerCase()])).rows[0];
  if (!u) throw new Error(`compte ${email} introuvable`);
  await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, actif = true, activated_at = NOW(), password_changed_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, u.id]);
  return u.id;
};

// ─── Les trois scénarios ────────────────────────────────────────────────────────────────────────────────────────────
// Un site : { cle, type: 'labo' | 'activite', composant (code du domaine), nom, ref?, laboCle? (rattachement), vend }.
// Un article : { nom, unite, famille, categorie, prixHT, tva, fournisseur, appro: { cle du site: quantité hebdo },
//   valorise?: true, prixVenteTTC? }. Un produit utilisable : { nom, labo, unite, prodHebdo, ingredients: [[article, q]] }.
// Un produit vendable : { nom, cat, prixVenteTTC, origine: 'labo' | 'activite', labo?, sites: [cle], prodHebdo?,
//   transferts?: { cle: quantité hebdo }, composition: [[nom, q, 'art' | 'sous']] }.
const SCENARIOS = [
  {
    cle: 'resto', domaine: ['restauration'], domaineNom: 'restau%', suffixe: 'test-resto', tvaVentes: 7,
    contact: { nom: 'Leïla Mansour', telephone: '+216 71 884 210' },
    identite: { raisonSociale: 'Le Patio des Oliviers SARL', nomCommercial: 'Le Patio des Oliviers', formeJuridique: 'SARL', matriculeFiscal: '1457821K/A/M/000', adresse: '14 rue des Oliviers, Mutuelleville', ville: '1082 Tunis', representantNom: 'Leïla Mansour', representantQualite: 'Gérante' },
    composants: [{ code: 'activite', nb: 2 }, { code: 'labo', nb: 1 }, { code: 'gerant', nb: 1 }],
    sites: [
      { cle: 'cuisine', type: 'labo', composant: 'labo', nom: 'Cuisine centrale', ref: 'CUI-01', adresse: '14 rue des Oliviers, Mutuelleville, 1082 Tunis' },
      { cle: 'resto', type: 'activite', composant: 'activite', nom: 'Le Patio — Restaurant', adresse: '14 rue des Oliviers, Mutuelleville, 1082 Tunis', laboCle: 'cuisine', vend: true },
      { cle: 'salon', type: 'activite', composant: 'activite', nom: 'Le Patio — Salon de thé', adresse: '3 avenue de Carthage, 1000 Tunis', laboCle: 'cuisine', vend: true },
    ],
    gerant: { nom: 'Karim Jaziri', telephone: '+216 22 418 905', siteCle: 'resto', suffixe: 'test-resto-gerant' },
    unites: ['kg', 'L', 'pièce', 'botte'],
    familles: [{ nom: 'Matières premières', consommable: true, vendable: false }, { nom: 'Boissons revendables', consommable: false, vendable: true }, { nom: 'Emballages', consommable: false, vendable: false }],
    categories: { 'Épicerie': 'Matières premières', 'Viandes & volailles': 'Matières premières', 'Fruits & légumes': 'Matières premières', 'Crèmerie': 'Matières premières', 'Boissons': 'Boissons revendables', 'Emballages': 'Emballages' },
    fournisseurs: [
      { nom: 'Comptoir Ben Miled & Cie', matriculeFiscal: '0712345L/A/M/000', adresse: '14 rue de la Verrerie, 2033 Mégrine', telephone: '+216 71 296 430' },
      { nom: 'Ferme Belhadj & Fils', matriculeFiscal: '0823456M/A/P/000', adresse: 'Route de Mateur km 12, 2020 Sidi Thabet', telephone: '+216 70 528 316' },
      { nom: 'Primeurs du Cap Bon', matriculeFiscal: '0934567N/A/M/000', adresse: 'Marché de gros, 2013 Bir El Kassâa', telephone: '+216 79 412 508' },
      { nom: 'Laiterie El Fejja', matriculeFiscal: '1045678P/A/M/000', adresse: 'Zone industrielle El Fejja, 1110 Mornaguia', telephone: '+216 71 654 218' },
    ],
    articles: [
      { nom: 'Semoule moyenne', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 1.7, tva: 7, fournisseur: 'Comptoir Ben Miled & Cie', appro: { cuisine: 30, resto: 10 } },
      { nom: "Huile d'olive", unite: 'L', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 27, tva: 7, fournisseur: 'Comptoir Ben Miled & Cie', appro: { cuisine: 12, resto: 6 } },
      { nom: 'Concentré de tomate', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 5.5, tva: 7, fournisseur: 'Comptoir Ben Miled & Cie', appro: { cuisine: 8 } },
      { nom: 'Pois chiches', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 4.5, tva: 7, fournisseur: 'Comptoir Ben Miled & Cie', appro: { cuisine: 6, resto: 4 } },
      { nom: 'Farine pâtissière', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 1.9, tva: 7, fournisseur: 'Comptoir Ben Miled & Cie', appro: { cuisine: 40 } },
      { nom: 'Sucre', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 1.6, tva: 7, fournisseur: 'Comptoir Ben Miled & Cie', appro: { cuisine: 20, resto: 5, salon: 8 } },
      { nom: 'Café en grains', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 36, tva: 19, fournisseur: 'Comptoir Ben Miled & Cie', appro: { resto: 4, salon: 8 } },
      { nom: 'Thé vert', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 21, tva: 19, fournisseur: 'Comptoir Ben Miled & Cie', appro: { salon: 2 } },
      { nom: 'Amandes émondées', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 38, tva: 7, fournisseur: 'Comptoir Ben Miled & Cie', appro: { cuisine: 8 } },
      { nom: 'Poulet fermier', unite: 'kg', famille: 'Matières premières', categorie: 'Viandes & volailles', prixHT: 9.8, tva: 7, fournisseur: 'Ferme Belhadj & Fils', appro: { resto: 30 } },
      { nom: 'Épaule de bœuf', unite: 'kg', famille: 'Matières premières', categorie: 'Viandes & volailles', prixHT: 39, tva: 7, fournisseur: 'Ferme Belhadj & Fils', appro: { resto: 10 } },
      { nom: 'Œufs frais', unite: 'pièce', famille: 'Matières premières', categorie: 'Crèmerie', prixHT: 0.42, tva: 7, fournisseur: 'Ferme Belhadj & Fils', appro: { cuisine: 240, resto: 120 } },
      { nom: 'Tomates', unite: 'kg', famille: 'Matières premières', categorie: 'Fruits & légumes', prixHT: 1.8, tva: 7, fournisseur: 'Primeurs du Cap Bon', appro: { cuisine: 90, resto: 25 } },
      { nom: 'Oignons', unite: 'kg', famille: 'Matières premières', categorie: 'Fruits & légumes', prixHT: 1.3, tva: 7, fournisseur: 'Primeurs du Cap Bon', appro: { cuisine: 15, resto: 12 } },
      { nom: 'Poivrons', unite: 'kg', famille: 'Matières premières', categorie: 'Fruits & légumes', prixHT: 2.4, tva: 7, fournisseur: 'Primeurs du Cap Bon', appro: { resto: 18 } },
      { nom: 'Citrons', unite: 'kg', famille: 'Matières premières', categorie: 'Fruits & légumes', prixHT: 3.2, tva: 7, fournisseur: 'Primeurs du Cap Bon', appro: { resto: 8, salon: 10 } },
      { nom: 'Oranges à jus', unite: 'kg', famille: 'Matières premières', categorie: 'Fruits & légumes', prixHT: 1.9, tva: 7, fournisseur: 'Primeurs du Cap Bon', appro: { resto: 30, salon: 30 } },
      { nom: 'Menthe fraîche', unite: 'botte', famille: 'Matières premières', categorie: 'Fruits & légumes', prixHT: 0.8, tva: 7, fournisseur: 'Primeurs du Cap Bon', appro: { resto: 20, salon: 20 } },
      { nom: 'Lait demi-écrémé', unite: 'L', famille: 'Matières premières', categorie: 'Crèmerie', prixHT: 1.45, tva: 7, fournisseur: 'Laiterie El Fejja', appro: { cuisine: 40, resto: 20, salon: 40 } },
      { nom: 'Beurre pâtissier', unite: 'kg', famille: 'Matières premières', categorie: 'Crèmerie', prixHT: 26.5, tva: 7, fournisseur: 'Laiterie El Fejja', appro: { cuisine: 30 } },
      { nom: 'Crème liquide', unite: 'L', famille: 'Matières premières', categorie: 'Crèmerie', prixHT: 11.5, tva: 7, fournisseur: 'Laiterie El Fejja', appro: { cuisine: 12 } },
      { nom: 'Eau minérale 0,5 L', unite: 'pièce', famille: 'Boissons revendables', categorie: 'Boissons', prixHT: 0.55, tva: 19, fournisseur: 'Comptoir Ben Miled & Cie', appro: { resto: 120, salon: 100 }, valorise: true, prixVenteTTC: 1.5 },
      { nom: 'Boisson gazeuse 33 cl', unite: 'pièce', famille: 'Boissons revendables', categorie: 'Boissons', prixHT: 1.45, tva: 19, fournisseur: 'Comptoir Ben Miled & Cie', appro: { resto: 80, salon: 60 }, valorise: true, prixVenteTTC: 3 },
      { nom: 'Boîte pâtisserie', unite: 'pièce', famille: 'Emballages', categorie: 'Emballages', prixHT: 0.85, tva: 19, fournisseur: 'Comptoir Ben Miled & Cie', appro: { cuisine: 60, salon: 50 } },
    ],
    categoriesProduit: { 'Pâtisseries': 'vendable', 'Plats cuisinés': 'vendable', 'Boissons': 'vendable', 'Boissons & épicerie': 'valorise' },
    utilisables: [
      { nom: 'Crème pâtissière', labo: 'cuisine', unite: 'kg', prodHebdo: 20, ingredients: [['Lait demi-écrémé', 0.75], ['Sucre', 0.15], ['Œufs frais', 3], ['Farine pâtissière', 0.07], ['Beurre pâtissier', 0.03]] },
      { nom: 'Pâte feuilletée', labo: 'cuisine', unite: 'kg', prodHebdo: 35, ingredients: [['Farine pâtissière', 0.55], ['Beurre pâtissier', 0.42]] },
      { nom: 'Sauce tomate maison', labo: 'cuisine', unite: 'kg', prodHebdo: 50, ingredients: [['Tomates', 0.9], ['Oignons', 0.15], ["Huile d'olive", 0.06], ['Concentré de tomate', 0.08]] },
    ],
    vendables: [
      { nom: 'Mille-feuille', cat: 'Pâtisseries', prixVenteTTC: 4.8, origine: 'labo', labo: 'cuisine', sites: ['salon'], prodHebdo: 100, transferts: { salon: 80 }, composition: [['Pâte feuilletée', 0.09, 'sous'], ['Crème pâtissière', 0.08, 'sous']] },
      { nom: 'Tarte aux amandes', cat: 'Pâtisseries', prixVenteTTC: 5.8, origine: 'labo', labo: 'cuisine', sites: ['salon'], prodHebdo: 50, transferts: { salon: 40 }, composition: [['Pâte feuilletée', 0.08, 'sous'], ['Amandes émondées', 0.05, 'art'], ['Sucre', 0.03, 'art'], ['Œufs frais', 1, 'art']] },
      { nom: 'Couscous au poulet', cat: 'Plats cuisinés', prixVenteTTC: 18, origine: 'activite', sites: ['resto'], composition: [['Semoule moyenne', 0.12, 'art'], ['Poulet fermier', 0.35, 'art'], ['Pois chiches', 0.04, 'art'], ['Oignons', 0.05, 'art'], ["Huile d'olive", 0.03, 'art']] },
      { nom: 'Ojja aux œufs', cat: 'Plats cuisinés', prixVenteTTC: 12, origine: 'activite', sites: ['resto'], composition: [['Œufs frais', 2, 'art'], ['Tomates', 0.25, 'art'], ['Poivrons', 0.08, 'art'], ["Huile d'olive", 0.03, 'art']] },
      { nom: 'Grillade de bœuf', cat: 'Plats cuisinés', prixVenteTTC: 26, origine: 'activite', sites: ['resto'], composition: [['Épaule de bœuf', 0.25, 'art'], ['Tomates', 0.1, 'art'], ['Oignons', 0.05, 'art']] },
      { nom: "Jus d'orange frais", cat: 'Boissons', prixVenteTTC: 6, origine: 'activite', sites: ['resto', 'salon'], composition: [['Oranges à jus', 0.4, 'art']] },
      { nom: 'Citronnade', cat: 'Boissons', prixVenteTTC: 4.5, origine: 'activite', sites: ['resto', 'salon'], composition: [['Citrons', 0.15, 'art'], ['Sucre', 0.04, 'art'], ['Menthe fraîche', 0.05, 'art']] },
      { nom: 'Café', cat: 'Boissons', prixVenteTTC: 3.8, origine: 'activite', sites: ['resto', 'salon'], composition: [['Café en grains', 0.014, 'art'], ['Lait demi-écrémé', 0.1, 'art']] },
      { nom: 'Thé à la menthe', cat: 'Boissons', prixVenteTTC: 4, origine: 'activite', sites: ['salon'], composition: [['Thé vert', 0.008, 'art'], ['Menthe fraîche', 0.1, 'art'], ['Sucre', 0.02, 'art']] },
    ],
    ventes: {
      resto: [['Couscous au poulet', 6, 14], ['Ojja aux œufs', 4, 10], ['Grillade de bœuf', 3, 8], ["Jus d'orange frais", 8, 18], ['Café', 15, 35], ['art:Eau minérale 0,5 L', 10, 25]],
      salon: [['Mille-feuille', 8, 18], ['Tarte aux amandes', 4, 9], ['Café', 20, 40], ['Thé à la menthe', 10, 22], ['Citronnade', 6, 14], ['art:Boisson gazeuse 33 cl', 6, 15]],
    },
    pertes: [['resto', 'art:Tomates', 1.8, 'avarie'], ['salon', 'prod:Mille-feuille', 3, 'dechet'], ['cuisine', 'art:Lait demi-écrémé', 2.5, 'avarie']],
    chargesFixes: { resto: { loyer: 1600, charges_personnel: 4200, electricite_gaz: 550, eau: 130 }, salon: { loyer: 1200, charges_personnel: 2600, electricite_gaz: 400, eau: 90 } },
    compta: {
      capital: 60000, immobilisations: [{ compte: '223', libelle: 'Équipement de cuisine', montant: 28000, financement: 'emprunt' }, { compte: '228', libelle: 'Mobilier des salles', montant: 9000, financement: 'capital' }],
      salaires: { brut: 7600, charges: 1250 }, loyer: 2800, energie: 950, compteVentes: '707', ventesEstimees: { 1: 31500, 2: 29800, 3: 33200, 4: 34100, 5: 36400, 6: 38900 },
    },
  },
  {
    cle: 'hotel', domaine: ['hotellerie'], domaineNom: 'h_tel%', suffixe: 'test-hotel', tvaVentes: 7,
    contact: { nom: 'Sofiane Trabelsi', telephone: '+216 73 240 150' },
    identite: { raisonSociale: "Société Hôtelière des Dunes d'Or SA", nomCommercial: "Hôtel Les Dunes d'Or", formeJuridique: 'SA', matriculeFiscal: '0998877Q/A/M/000', adresse: 'Zone touristique, route de la Corniche', ville: '4089 Sousse', representantNom: 'Sofiane Trabelsi', representantQualite: 'Directeur général' },
    composants: [{ code: 'restaurant', nb: 1 }, { code: 'bar', nb: 1 }, { code: 'room_service', nb: 1 }, { code: 'housekeeping', nb: 1 }, { code: 'cuisine', nb: 1 }, { code: 'economat', nb: 1 }, { code: 'responsable', nb: 1 }],
    sites: [
      { cle: 'cuisine', type: 'labo', composant: 'cuisine', nom: 'Cuisine centrale', ref: 'CUI-01', adresse: 'Zone touristique, route de la Corniche, 4089 Sousse' },
      { cle: 'economat', type: 'labo', composant: 'economat', nom: 'Économat', ref: 'ECO-01', adresse: 'Zone touristique, route de la Corniche, 4089 Sousse' },
      { cle: 'resto', type: 'activite', composant: 'restaurant', nom: 'Restaurant Le Jasmin', laboCle: 'cuisine', vend: true },
      { cle: 'bar', type: 'activite', composant: 'bar', nom: 'Bar La Terrasse', laboCle: 'economat', vend: true },
      { cle: 'room', type: 'activite', composant: 'room_service', nom: 'Room service', laboCle: 'cuisine', vend: true },
      { cle: 'housekeeping', type: 'activite', composant: 'housekeeping', nom: 'Housekeeping', laboCle: 'economat', vend: false },
    ],
    gerant: { nom: 'Amel Chaabane', telephone: '+216 98 702 441', siteCle: 'resto', suffixe: 'test-hotel-responsable' },
    unites: ['kg', 'L', 'pièce', 'botte', 'bouteille', 'rouleau'],
    familles: [{ nom: 'Denrées', consommable: true, vendable: false }, { nom: 'Boissons revendables', consommable: false, vendable: true }, { nom: 'Fournitures', consommable: false, vendable: false }],
    categories: { 'Épicerie': 'Denrées', 'Viandes & poissons': 'Denrées', 'Fruits & légumes': 'Denrées', 'Crèmerie': 'Denrées', 'Boissons': 'Boissons revendables', 'Entretien & accueil': 'Fournitures' },
    fournisseurs: [
      { nom: 'Grossiste Sahel Distribution', matriculeFiscal: '1122334R/A/M/000', adresse: 'Zone industrielle Sidi Abdelhamid, 4061 Sousse', telephone: '+216 73 330 210' },
      { nom: 'Pêcherie Bou Jaafar', matriculeFiscal: '1233445S/A/P/000', adresse: 'Port de pêche, 4000 Sousse', telephone: '+216 73 225 118' },
      { nom: 'Fruits & Légumes du Sahel', matriculeFiscal: '1344556T/A/M/000', adresse: 'Marché de gros, 4054 Sousse', telephone: '+216 73 271 904' },
      { nom: 'Hygiène Pro Tunisie', matriculeFiscal: '1455667U/A/M/000', adresse: 'Rue de la Zone industrielle, 2035 Charguia', telephone: '+216 71 940 312' },
    ],
    articles: [
      { nom: 'Riz long', unite: 'kg', famille: 'Denrées', categorie: 'Épicerie', prixHT: 2.4, tva: 7, fournisseur: 'Grossiste Sahel Distribution', appro: { cuisine: 40 } },
      { nom: 'Pâtes', unite: 'kg', famille: 'Denrées', categorie: 'Épicerie', prixHT: 1.9, tva: 7, fournisseur: 'Grossiste Sahel Distribution', appro: { cuisine: 30 } },
      { nom: "Huile d'olive", unite: 'L', famille: 'Denrées', categorie: 'Épicerie', prixHT: 27, tva: 7, fournisseur: 'Grossiste Sahel Distribution', appro: { cuisine: 15 } },
      { nom: 'Café en grains', unite: 'kg', famille: 'Denrées', categorie: 'Épicerie', prixHT: 36, tva: 19, fournisseur: 'Grossiste Sahel Distribution', appro: { economat: 14 } },
      { nom: 'Sucre', unite: 'kg', famille: 'Denrées', categorie: 'Épicerie', prixHT: 1.6, tva: 7, fournisseur: 'Grossiste Sahel Distribution', appro: { cuisine: 15, economat: 10 } },
      { nom: 'Farine', unite: 'kg', famille: 'Denrées', categorie: 'Épicerie', prixHT: 1.7, tva: 7, fournisseur: 'Grossiste Sahel Distribution', appro: { cuisine: 35 } },
      { nom: 'Filet de daurade', unite: 'kg', famille: 'Denrées', categorie: 'Viandes & poissons', prixHT: 32, tva: 7, fournisseur: 'Pêcherie Bou Jaafar', appro: { cuisine: 36 } },
      { nom: 'Crevettes', unite: 'kg', famille: 'Denrées', categorie: 'Viandes & poissons', prixHT: 48, tva: 7, fournisseur: 'Pêcherie Bou Jaafar', appro: { cuisine: 14 } },
      { nom: 'Poulet', unite: 'kg', famille: 'Denrées', categorie: 'Viandes & poissons', prixHT: 9.8, tva: 7, fournisseur: 'Grossiste Sahel Distribution', appro: { cuisine: 55 } },
      { nom: 'Tomates', unite: 'kg', famille: 'Denrées', categorie: 'Fruits & légumes', prixHT: 1.8, tva: 7, fournisseur: 'Fruits & Légumes du Sahel', appro: { cuisine: 70 } },
      { nom: 'Salade', unite: 'pièce', famille: 'Denrées', categorie: 'Fruits & légumes', prixHT: 1.2, tva: 7, fournisseur: 'Fruits & Légumes du Sahel', appro: { cuisine: 60 } },
      { nom: 'Citrons', unite: 'kg', famille: 'Denrées', categorie: 'Fruits & légumes', prixHT: 3.2, tva: 7, fournisseur: 'Fruits & Légumes du Sahel', appro: { cuisine: 10, economat: 10 } },
      { nom: 'Oranges à jus', unite: 'kg', famille: 'Denrées', categorie: 'Fruits & légumes', prixHT: 1.9, tva: 7, fournisseur: 'Fruits & Légumes du Sahel', appro: { economat: 80, cuisine: 60 } },
      { nom: 'Menthe fraîche', unite: 'botte', famille: 'Denrées', categorie: 'Fruits & légumes', prixHT: 0.8, tva: 7, fournisseur: 'Fruits & Légumes du Sahel', appro: { economat: 30 } },
      { nom: 'Lait', unite: 'L', famille: 'Denrées', categorie: 'Crèmerie', prixHT: 1.45, tva: 7, fournisseur: 'Grossiste Sahel Distribution', appro: { cuisine: 80, economat: 40 } },
      { nom: 'Œufs', unite: 'pièce', famille: 'Denrées', categorie: 'Crèmerie', prixHT: 0.42, tva: 7, fournisseur: 'Grossiste Sahel Distribution', appro: { cuisine: 480 } },
      { nom: 'Eau minérale 1 L', unite: 'bouteille', famille: 'Boissons revendables', categorie: 'Boissons', prixHT: 0.75, tva: 19, fournisseur: 'Grossiste Sahel Distribution', appro: { economat: 320, room: 100 }, valorise: true, prixVenteTTC: 3 },
      { nom: 'Soda 33 cl', unite: 'pièce', famille: 'Boissons revendables', categorie: 'Boissons', prixHT: 1.45, tva: 19, fournisseur: 'Grossiste Sahel Distribution', appro: { economat: 240 }, valorise: true, prixVenteTTC: 4.5 },
      { nom: 'Jus de fruits 1 L', unite: 'bouteille', famille: 'Boissons revendables', categorie: 'Boissons', prixHT: 3.2, tva: 19, fournisseur: 'Grossiste Sahel Distribution', appro: { economat: 80 }, valorise: true, prixVenteTTC: 9 },
      { nom: 'Gel douche chambre', unite: 'pièce', famille: 'Fournitures', categorie: 'Entretien & accueil', prixHT: 0.9, tva: 19, fournisseur: 'Hygiène Pro Tunisie', appro: { economat: 400 } },
      { nom: 'Papier toilette', unite: 'rouleau', famille: 'Fournitures', categorie: 'Entretien & accueil', prixHT: 0.45, tva: 19, fournisseur: 'Hygiène Pro Tunisie', appro: { economat: 600 } },
      { nom: 'Détergent sols 5 L', unite: 'bouteille', famille: 'Fournitures', categorie: 'Entretien & accueil', prixHT: 14, tva: 19, fournisseur: 'Hygiène Pro Tunisie', appro: { economat: 20 } },
    ],
    categoriesProduit: { 'Plats': 'vendable', 'Petit-déjeuner & room service': 'vendable', 'Cocktails & boissons': 'vendable', 'Minibar & boissons': 'valorise' },
    utilisables: [
      { nom: 'Sauce tomate', labo: 'cuisine', unite: 'kg', prodHebdo: 40, ingredients: [['Tomates', 0.9], ["Huile d'olive", 0.06]] },
      { nom: 'Pâte à crêpes', labo: 'cuisine', unite: 'L', prodHebdo: 45, ingredients: [['Farine', 0.3], ['Œufs', 2], ['Lait', 0.6], ['Sucre', 0.03]] },
    ],
    // Les plats sont produits par la cuisine centrale et livrés au restaurant et au room service (une activité n'a qu'un
    // site de rattachement) ; le bar prépare ses boissons avec ce que l'économat lui livre.
    vendables: [
      { nom: 'Daurade grillée', cat: 'Plats', prixVenteTTC: 38, origine: 'labo', labo: 'cuisine', sites: ['resto', 'room'], prodHebdo: 70, transferts: { resto: 50, room: 15 }, composition: [['Filet de daurade', 0.25, 'art'], ['Citrons', 0.05, 'art'], ["Huile d'olive", 0.02, 'art'], ['Salade', 0.5, 'art']] },
      { nom: 'Pâtes aux crevettes', cat: 'Plats', prixVenteTTC: 32, origine: 'labo', labo: 'cuisine', sites: ['resto', 'room'], prodHebdo: 60, transferts: { resto: 45, room: 12 }, composition: [['Pâtes', 0.12, 'art'], ['Crevettes', 0.12, 'art'], ['Sauce tomate', 0.08, 'sous']] },
      { nom: 'Poulet au riz', cat: 'Plats', prixVenteTTC: 24, origine: 'labo', labo: 'cuisine', sites: ['resto', 'room'], prodHebdo: 90, transferts: { resto: 65, room: 20 }, composition: [['Poulet', 0.3, 'art'], ['Riz long', 0.12, 'art'], ['Sauce tomate', 0.06, 'sous']] },
      { nom: 'Plateau petit-déjeuner', cat: 'Petit-déjeuner & room service', prixVenteTTC: 22, origine: 'labo', labo: 'cuisine', sites: ['room'], prodHebdo: 110, transferts: { room: 100 }, composition: [['Œufs', 2, 'art'], ['Lait', 0.2, 'art'], ['Oranges à jus', 0.3, 'art'], ['Sucre', 0.02, 'art']] },
      { nom: 'Crêpes au miel', cat: 'Petit-déjeuner & room service', prixVenteTTC: 14, origine: 'labo', labo: 'cuisine', sites: ['resto', 'room'], prodHebdo: 90, transferts: { resto: 50, room: 30 }, composition: [['Pâte à crêpes', 0.25, 'sous'], ['Sucre', 0.02, 'art']] },
      { nom: 'Cocktail du jour', cat: 'Cocktails & boissons', prixVenteTTC: 16, origine: 'activite', sites: ['bar'], composition: [['Oranges à jus', 0.2, 'art'], ['Citrons', 0.05, 'art'], ['Menthe fraîche', 0.1, 'art'], ['Sucre', 0.02, 'art']] },
      { nom: 'Café', cat: 'Cocktails & boissons', prixVenteTTC: 5, origine: 'activite', sites: ['bar'], composition: [['Café en grains', 0.014, 'art'], ['Lait', 0.1, 'art']] },
      { nom: "Jus d'orange pressé", cat: 'Cocktails & boissons', prixVenteTTC: 9, origine: 'activite', sites: ['bar'], composition: [['Oranges à jus', 0.4, 'art']] },
    ],
    // L'économat ne produit pas : il reçoit et livre (boissons et fournitures) au bar et au housekeeping, qui lui sont
    // rattachés ; le room service (rattaché à la cuisine) reçoit son eau par facture.
    livraisonsEconomat: { bar: [['art:Eau minérale 1 L', 140], ['art:Soda 33 cl', 120], ['art:Jus de fruits 1 L', 20], ['art:Oranges à jus', 45], ['art:Citrons', 5], ['art:Menthe fraîche', 15], ['art:Café en grains', 6], ['art:Sucre', 4], ['art:Lait', 20]], housekeeping: [['art:Gel douche chambre', 120], ['art:Papier toilette', 180], ['art:Détergent sols 5 L', 6]] },
    ventes: {
      resto: [['Daurade grillée', 6, 14], ['Pâtes aux crevettes', 5, 12], ['Poulet au riz', 8, 16], ['Crêpes au miel', 4, 10]],
      bar: [['Cocktail du jour', 10, 25], ["Jus d'orange pressé", 8, 20], ['Café', 25, 50], ['art:Eau minérale 1 L', 20, 40], ['art:Soda 33 cl', 15, 35]],
      room: [['Plateau petit-déjeuner', 10, 24], ['Daurade grillée', 2, 6], ['Crêpes au miel', 3, 8], ['art:Eau minérale 1 L', 10, 25]],
    },
    pertes: [['cuisine', 'art:Filet de daurade', 1.2, 'avarie'], ['bar', 'art:Oranges à jus', 2, 'avarie'], ['housekeeping', 'art:Gel douche chambre', 8, 'dechet']],
    chargesFixes: { resto: { loyer: 0, charges_personnel: 9800, electricite_gaz: 1400, eau: 420 }, bar: { loyer: 0, charges_personnel: 3600, electricite_gaz: 500, eau: 120 }, room: { loyer: 0, charges_personnel: 2900, electricite_gaz: 200, eau: 60 } },
    compta: {
      capital: 400000, immobilisations: [{ compte: '222', libelle: 'Bâtiment (aile restauration)', montant: 260000, financement: 'emprunt' }, { compte: '223', libelle: 'Équipement de cuisine et de bar', montant: 85000, financement: 'capital' }],
      salaires: { brut: 24500, charges: 4200 }, loyer: 0, energie: 6200, compteVentes: '705', ventesEstimees: { 1: 118000, 2: 112500, 3: 131000, 4: 149000, 5: 168000, 6: 196000 },
    },
  },
  {
    cle: 'usine', domaine: ['ceramique', 'usine', 'industrie'], domaineNom: 'industrie%', suffixe: 'test-usine', tvaVentes: 19,
    contact: { nom: 'Hichem Bouslama', telephone: '+216 72 285 640' },
    identite: { raisonSociale: 'Céramiques de Nabeul SA', nomCommercial: 'Céramiques de Nabeul', formeJuridique: 'SA', matriculeFiscal: '0556677V/A/M/000', adresse: 'Zone industrielle, route de Tunis', ville: '8000 Nabeul', representantNom: 'Hichem Bouslama', representantQualite: 'Directeur général' },
    composants: [{ code: 'usine', nb: 1 }, { code: 'showroom', nb: 1 }, { code: 'revendeur', nb: 10 }, { code: 'responsable', nb: 1 }],
    sites: [
      { cle: 'usine', type: 'labo', composant: 'usine', nom: 'Site de production de Nabeul', ref: 'USN-01', adresse: 'Zone industrielle, route de Tunis, 8000 Nabeul' },
      { cle: 'showroom', type: 'activite', composant: 'showroom', nom: 'Showroom de Nabeul', adresse: 'Avenue Habib Thameur, 8000 Nabeul', laboCle: 'usine', vend: true },
    ],
    gerant: { nom: 'Rania Ben Amor', telephone: '+216 55 318 207', siteCle: 'showroom', suffixe: 'test-usine-responsable' },
    unites: ['kg', 'L', 'pièce', 'm²', 'sac'],
    familles: [{ nom: 'Matières premières', consommable: true, vendable: false }, { nom: 'Emballages', consommable: false, vendable: false }],
    categories: { 'Terres & argiles': 'Matières premières', 'Émaux & pigments': 'Matières premières', 'Énergie & consommables': 'Matières premières', 'Emballages': 'Emballages' },
    fournisseurs: [
      { nom: 'Argiles du Cap Bon', matriculeFiscal: '1566778W/A/M/000', adresse: 'Carrière de Menzel Bouzelfa, 8010 Nabeul', telephone: '+216 72 321 405' },
      { nom: 'Céramik Chimie', matriculeFiscal: '1677889X/A/M/000', adresse: 'Zone industrielle Ben Arous, 2013 Ben Arous', telephone: '+216 71 388 620' },
      { nom: 'Gaz & Énergie du Nord', matriculeFiscal: '1788990Y/A/M/000', adresse: 'Route de Bizerte, 2080 Ariana', telephone: '+216 71 712 318' },
      { nom: 'Emballages Carthage', matriculeFiscal: '1899001Z/A/M/000', adresse: 'Zone industrielle Mégrine, 2033 Ben Arous', telephone: '+216 71 428 517' },
    ],
    articles: [
      { nom: 'Argile rouge', unite: 'kg', famille: 'Matières premières', categorie: 'Terres & argiles', prixHT: 0.35, tva: 19, fournisseur: 'Argiles du Cap Bon', appro: { usine: 6000 } },
      { nom: 'Kaolin', unite: 'kg', famille: 'Matières premières', categorie: 'Terres & argiles', prixHT: 1.2, tva: 19, fournisseur: 'Argiles du Cap Bon', appro: { usine: 1100 } },
      { nom: 'Feldspath', unite: 'kg', famille: 'Matières premières', categorie: 'Terres & argiles', prixHT: 0.9, tva: 19, fournisseur: 'Argiles du Cap Bon', appro: { usine: 700 } },
      { nom: 'Émail transparent', unite: 'kg', famille: 'Matières premières', categorie: 'Émaux & pigments', prixHT: 6.5, tva: 19, fournisseur: 'Céramik Chimie', appro: { usine: 480 } },
      { nom: 'Pigment bleu de cobalt', unite: 'kg', famille: 'Matières premières', categorie: 'Émaux & pigments', prixHT: 95, tva: 19, fournisseur: 'Céramik Chimie', appro: { usine: 20 } },
      { nom: 'Pigment jaune', unite: 'kg', famille: 'Matières premières', categorie: 'Émaux & pigments', prixHT: 62, tva: 19, fournisseur: 'Céramik Chimie', appro: { usine: 8 } },
      { nom: 'Gaz propane (four)', unite: 'kg', famille: 'Matières premières', categorie: 'Énergie & consommables', prixHT: 1.1, tva: 19, fournisseur: 'Gaz & Énergie du Nord', appro: { usine: 2200 } },
      { nom: 'Plâtre à moules', unite: 'sac', famille: 'Matières premières', categorie: 'Énergie & consommables', prixHT: 9, tva: 19, fournisseur: 'Céramik Chimie', appro: { usine: 20 } },
      { nom: 'Carton de 6 assiettes', unite: 'pièce', famille: 'Emballages', categorie: 'Emballages', prixHT: 1.4, tva: 19, fournisseur: 'Emballages Carthage', appro: { usine: 300, showroom: 60 } },
      { nom: 'Papier bulle', unite: 'm²', famille: 'Emballages', categorie: 'Emballages', prixHT: 0.6, tva: 19, fournisseur: 'Emballages Carthage', appro: { usine: 400, showroom: 50 } },
    ],
    categoriesProduit: { 'Art de la table': 'vendable', 'Carrelage': 'vendable', 'Décoration': 'vendable' },
    utilisables: [
      { nom: 'Pâte céramique préparée', labo: 'usine', unite: 'kg', prodHebdo: 5200, ingredients: [['Argile rouge', 0.8], ['Kaolin', 0.15], ['Feldspath', 0.08]] },
      { nom: 'Émail bleu de Nabeul', labo: 'usine', unite: 'kg', prodHebdo: 260, ingredients: [['Émail transparent', 0.95], ['Pigment bleu de cobalt', 0.05]] },
      { nom: 'Émail jaune safran', labo: 'usine', unite: 'kg', prodHebdo: 70, ingredients: [['Émail transparent', 0.95], ['Pigment jaune', 0.06]] },
    ],
    vendables: [
      { nom: 'Assiette plate 27 cm bleu de Nabeul', cat: 'Art de la table', prixVenteTTC: 24, origine: 'labo', labo: 'usine', sites: ['showroom'], prodHebdo: 900, transferts: { showroom: 180 }, composition: [['Pâte céramique préparée', 0.9, 'sous'], ['Émail bleu de Nabeul', 0.06, 'sous'], ['Gaz propane (four)', 0.4, 'art']] },
      { nom: 'Bol à soupe jaune safran', cat: 'Art de la table', prixVenteTTC: 14, origine: 'labo', labo: 'usine', sites: ['showroom'], prodHebdo: 700, transferts: { showroom: 120 }, composition: [['Pâte céramique préparée', 0.45, 'sous'], ['Émail jaune safran', 0.04, 'sous'], ['Gaz propane (four)', 0.25, 'art']] },
      { nom: 'Carreau mural 20×20 décor traditionnel', cat: 'Carrelage', prixVenteTTC: 9, origine: 'labo', labo: 'usine', sites: ['showroom'], prodHebdo: 3000, transferts: { showroom: 400 }, composition: [['Pâte céramique préparée', 0.7, 'sous'], ['Émail bleu de Nabeul', 0.03, 'sous'], ['Gaz propane (four)', 0.2, 'art']] },
      { nom: 'Vase décoratif 35 cm', cat: 'Décoration', prixVenteTTC: 85, origine: 'labo', labo: 'usine', sites: ['showroom'], prodHebdo: 80, transferts: { showroom: 25 }, composition: [['Pâte céramique préparée', 3.2, 'sous'], ['Émail bleu de Nabeul', 0.2, 'sous'], ['Gaz propane (four)', 1.5, 'art'], ['Papier bulle', 1, 'art']] },
      { nom: 'Coffret 6 assiettes à dessert', cat: 'Art de la table', prixVenteTTC: 96, origine: 'labo', labo: 'usine', sites: ['showroom'], prodHebdo: 60, transferts: { showroom: 20 }, composition: [['Pâte céramique préparée', 3, 'sous'], ['Émail jaune safran', 0.2, 'sous'], ['Gaz propane (four)', 1.4, 'art'], ['Carton de 6 assiettes', 1, 'art']] },
    ],
    ventes: { showroom: [['Assiette plate 27 cm bleu de Nabeul', 20, 60], ['Bol à soupe jaune safran', 15, 40], ['Carreau mural 20×20 décor traditionnel', 60, 200], ['Vase décoratif 35 cm', 3, 9], ['Coffret 6 assiettes à dessert', 2, 7]] },
    pertes: [['usine', 'prod:Assiette plate 27 cm bleu de Nabeul', 25, 'dechet'], ['usine', 'prod:Carreau mural 20×20 décor traditionnel', 90, 'dechet'], ['showroom', 'prod:Vase décoratif 35 cm', 1, 'dechet']],
    chargesFixes: { showroom: { loyer: 2400, charges_personnel: 3100, electricite_gaz: 380, eau: 70 } },
    acheteurs: [
      { nom: 'Mounir Gharbi', entreprise: 'Maison & Déco Lac 2', telephone: '+216 22 604 318', adresse: 'Rue du Lac Léman, 1053 Tunis', matriculeFiscal: '1700321A' },
      { nom: 'Selma Riahi', entreprise: 'Bazar de la Médina', telephone: '+216 98 117 452', adresse: 'Souk El Attarine, Médina de Tunis', matriculeFiscal: '1700654B' },
      { nom: 'Youssef Haddad', entreprise: 'Carrelages Haddad', telephone: '+216 55 290 731', adresse: 'Route de Sfax km 4, 3000 Sfax', matriculeFiscal: '1700987C' },
    ],
    offres: [['Assiette plate 27 cm bleu de Nabeul', 13.5, 19], ['Bol à soupe jaune safran', 8, 19], ['Carreau mural 20×20 décor traditionnel', 5.2, 19], ['Vase décoratif 35 cm', 48, 19], ['Coffret 6 assiettes à dessert', 58, 19]],
    ventesB2B: [
      { acheteur: 0, date: '2026-07-15', lignes: [['Assiette plate 27 cm bleu de Nabeul', 240], ['Bol à soupe jaune safran', 180], ['Vase décoratif 35 cm', 20]] },
      { acheteur: 2, date: '2026-08-12', lignes: [['Carreau mural 20×20 décor traditionnel', 2400]] },
      { acheteur: 1, date: '2026-09-09', lignes: [['Coffret 6 assiettes à dessert', 30], ['Assiette plate 27 cm bleu de Nabeul', 120]] },
      { acheteur: 2, date: '2026-10-07', lignes: [['Carreau mural 20×20 décor traditionnel', 1800], ['Bol à soupe jaune safran', 100]] },
    ],
    compta: {
      capital: 900000, immobilisations: [{ compte: '223', libelle: 'Fours et presses', montant: 620000, financement: 'emprunt' }, { compte: '222', libelle: 'Hall de production', montant: 350000, financement: 'capital' }],
      salaires: { brut: 46000, charges: 7900 }, loyer: 2400, energie: 9800, compteVentes: '701', ventesEstimees: { 1: 212000, 2: 198000, 3: 226000, 4: 241000, 5: 238000, 6: 255000 },
    },
  },
];

// ─── Nettoyage ──────────────────────────────────────────────────────────────────────────────────────────────────────
const emailsDe = (sc) => [alias(sc.suffixe), alias(sc.gerant.suffixe), ...(sc.acheteurs || []).map((_, i) => alias(`${sc.suffixe}-revendeur${i + 1}`))];
const CHOISIS = SCENARIOS.filter((sc) => COMPTES.includes(sc.cle));
const nettoyer = async () => {
  const emails = [ADMIN_EMAIL, ...CHOISIS.flatMap(emailsDe)].map((e) => e.toLowerCase());
  const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [emails])).rows.map((r) => r.id);
  if (!ids.length) { console.log('Rien à effacer.'); return; }
  const espaces = (await pool.query('SELECT id FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids])).rows.map((r) => r.id);
  await pool.query('DELETE FROM compta.dossiers WHERE espace_id = ANY($1)', [espaces]);
  await pool.query(`DELETE FROM compta.evenements WHERE auteur_id = ANY($1) OR (details->>'titulaire')::int = ANY($1) OR espace_id = ANY($2)`, [ids, espaces]);
  await pool.query('DELETE FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids]);
  await pool.query('UPDATE ventes SET created_by = NULL WHERE created_by = ANY($1)', [ids]);
  // Les commandes B2B référencent le labo sans cascade : effacées avant les comptes (lignes, statuts et factures suivent).
  await pool.query('DELETE FROM commandes_acheteur WHERE client_id = ANY($1)', [ids]);
  await pool.query(`DELETE FROM produit_sous_produits WHERE produit_id IN (SELECT id FROM produits WHERE client_id = ANY($1)) OR sous_produit_id IN (SELECT id FROM produits WHERE client_id = ANY($1))`, [ids]);
  await pool.query('DELETE FROM produits WHERE client_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM support_demandes WHERE client_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM profil_entreprise WHERE client_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM utilisateurs WHERE id = ANY($1)', [ids]);
  console.log(`Effacé : ${ids.length} compte(s) (${emails.filter((e) => e !== ADMIN_EMAIL).join(', ')}).`);
};

// ─── Un compte, de bout en bout ─────────────────────────────────────────────────────────────────────────────────────
const batir = async (sc, adminTok, resume) => {
  const email = alias(sc.suffixe);
  const motDePasse = mdp();
  console.log(`\n══ ${sc.identite.nomCommercial} (${sc.cle}) — ${email} ══`);

  // 1. Le compte par l'API d'administration (domaine, composants), son identité légale, activation. Le domaine est
  // retrouvé par son slug (local : ceramique ; prod : usine), sinon par son nom ; un composant renommé, par son type.
  const candidats = (await pool.query('SELECT id, slug, nom FROM domaines_activite WHERE slug = ANY($1) OR LOWER(nom) LIKE $2', [sc.domaine, sc.domaineNom])).rows;
  const domaine = sc.domaine.map((slug) => candidats.find((d) => d.slug === slug)).find(Boolean) || candidats[0];
  if (!domaine) {
    const tous = (await pool.query('SELECT slug, nom FROM domaines_activite ORDER BY nom')).rows.map((d) => `${d.nom} (${d.slug})`);
    throw new Error(`aucun domaine ${sc.domaine.join(' / ')} (ou nommé « ${sc.domaineNom} ») ; domaines présents : ${tous.join(', ')} — créez-le (page Domaines) ou réglez son slug`);
  }
  const domaineId = domaine.id;
  const composantsDomaine = (await pool.query('SELECT * FROM domaine_composants WHERE domaine_id = $1 ORDER BY ordre, id', [domaineId])).rows.filter((c) => c.actif !== false);
  const composantDe = (code) => composantsDomaine.find((c) => c.code === code) || composantsDomaine.find((c) => c.type_technique === TYPE_PAR_CODE[code]) || null;
  const composantsCompte = [];
  for (const c of sc.composants) {
    const d = composantDe(c.code);
    if (!d) throw new Error(`domaine ${domaine.nom} : aucun composant pour « ${c.code} » (type ${TYPE_PAR_CODE[c.code]}) — vérifiez la page Domaines`);
    const deja = composantsCompte.find((x) => x.code === d.code);
    if (deja) deja.nb += c.nb; else composantsCompte.push({ code: d.code, nb: c.nb });
  }
  console.log(`   domaine « ${domaine.nom} » (${domaine.slug}) ; composants : ${composantsCompte.map((c) => `${c.code} × ${c.nb}`).join(', ')}`);
  const cree = await api('POST', '/admin/clients', { nom: sc.contact.nom, email, telephone: sc.contact.telephone, domaineId, composants: composantsCompte, montantOnboarding: 0 }, adminTok);
  const clientId = cree.id;
  await api('PUT', `/admin/clients/${clientId}/identite`, sc.identite, adminTok);
  await activer(email, motDePasse);
  const tok = await login(email, motDePasse);
  // Le module Compta tout de suite (dossier « Mon entreprise » créé d'office) : le pont n'écrit que s'il est actif.
  await api('PUT', `/api/abonnements/client/${clientId}/module-compta`, { actif: true, nbGerantsCompta: 0 }, adminTok);
  console.log(`1. Compte ${clientId} créé et activé, identité posée, module Compta activé.`);
  console.log(`   → connexion : ${email}  /  ${motDePasse}   (notez-le : affiché ici et dans le récapitulatif final)`);

  // 2. Les sites (labos puis activités), avec le composant du domaine.
  const composantId = (code) => composantDe(code)?.id ?? null;
  const sites = {}; // cle → { id, type, ... }
  for (const s of sc.sites.filter((x) => x.type === 'labo')) {
    const r = await api('POST', '/api/labo', { nom: s.nom, refLabo: s.ref, referentTel: sc.contact.telephone, adresse: s.adresse, activityIds: [], composantId: composantId(s.composant) }, tok);
    sites[s.cle] = { ...s, id: r.id };
  }
  for (const s of sc.sites.filter((x) => x.type === 'activite')) {
    const r = await api('POST', '/api/entreprise/activites', { nom: s.nom, adresse: s.adresse || sc.identite.adresse, telephone: sc.contact.telephone, email: null, laboId: s.laboCle ? sites[s.laboCle].id : undefined, composantId: composantId(s.composant) }, tok);
    sites[s.cle] = { ...s, id: r.id };
  }
  const labos = Object.values(sites).filter((s) => s.type === 'labo');
  const activites = Object.values(sites).filter((s) => s.type === 'activite');
  console.log(`2. ${labos.length} labo(s) et ${activites.length} activité(s).`);

  // 3. Le référentiel : unités, familles, catégories, articles ; affectations aux sites ; fournisseurs.
  const unites = {};
  const unitesExistantes = await api('GET', '/api/unites', undefined, tok);
  for (const nom of sc.unites) {
    const deja = (Array.isArray(unitesExistantes) ? unitesExistantes : unitesExistantes?.unites || []).find((u) => String(u.name || u.nom).toLowerCase() === nom.toLowerCase());
    unites[nom] = deja ? deja.id : (await api('POST', '/api/unites', { nom }, tok)).id;
  }
  const familles = {};
  for (const f of sc.familles) familles[f.nom] = (await api('POST', '/api/familles', f, tok)).id;
  const categories = {};
  for (const [nom, fam] of Object.entries(sc.categories)) categories[nom] = (await api('POST', '/api/categories', { nom, familleId: familles[fam] }, tok)).id;
  const art = {};
  for (const a of sc.articles) art[a.nom] = { ...a, id: (await api('POST', '/api/articles', { nom: a.nom, unitId: unites[a.unite], categorieId: categories[a.categorie] }, tok)).id };
  // Chaque site reçoit les articles qu'il approvisionne ou reçoit ; une activité rattachée à un labo reçoit aussi ce que
  // le labo lui livre ; les valorisés (revendus en l'état) sont posés sur les activités qui vendent, avec leur prix.
  const besoins = {}; // cle du site → Set(nom d'article)
  const ajouterBesoin = (cle, nom) => { (besoins[cle] = besoins[cle] || new Set()).add(nom); };
  for (const a of sc.articles) for (const cle of Object.keys(a.appro)) ajouterBesoin(cle, a.nom);
  for (const [cle, lignes] of Object.entries(sc.livraisonsEconomat || {})) for (const [ref] of lignes) if (ref.startsWith('art:')) ajouterBesoin(cle, ref.slice(4));
  for (const p of sc.vendables) if (p.origine === 'activite') for (const cle of p.sites) for (const [nom, , t] of p.composition) if (t === 'art') ajouterBesoin(cle, nom);
  for (const p of sc.vendables) if (p.origine === 'labo') for (const [nom, , t] of p.composition) if (t === 'art') ajouterBesoin(p.labo, nom);
  for (const u of sc.utilisables) for (const [nom] of u.ingredients) ajouterBesoin(u.labo, nom);
  for (const [cle, lignes] of Object.entries(sc.ventes || {})) for (const [ref] of lignes) if (ref.startsWith('art:')) ajouterBesoin(cle, ref.slice(4));
  for (const [cle, ref] of sc.pertes) if (ref.startsWith('art:')) ajouterBesoin(cle, ref.slice(4));
  for (const [cle, noms] of Object.entries(besoins)) {
    const s = sites[cle];
    for (const nom of noms) {
      const a = art[nom];
      if (s.type === 'labo') await api('POST', `/api/labo/${s.id}/ingredients/${a.id}/select`, {}, tok);
      else await api('POST', `/api/entreprise/activites/${s.id}/ingredients/${a.id}/select`, { prixUnitaire: ttc(a.prixHT, a.tva) }, tok);
    }
  }
  const fourn = {};
  for (const f of sc.fournisseurs) fourn[f.nom] = (await api('POST', '/api/entreprise/fournisseurs', { ...f, activiteIds: activites.map((s) => s.id), laboIds: labos.map((s) => s.id) }, tok)).id;
  console.log(`3. Référentiel : ${sc.unites.length} unités, ${sc.familles.length} familles, ${Object.keys(sc.categories).length} catégories, ${sc.articles.length} articles, ${sc.fournisseurs.length} fournisseurs.`);

  // 4. Le gérant (responsable) : invité par l'API (email d'invitation), activé ici.
  const gerantEmail = alias(sc.gerant.suffixe);
  const gerantMdp = mdp();
  await api('POST', '/api/abonnements/gerants', { nom: sc.gerant.nom, telephone: sc.gerant.telephone, email: gerantEmail, activiteIds: [sites[sc.gerant.siteCle].id] }, tok);
  await activer(gerantEmail, gerantMdp);
  console.log(`4. Gérant ${sc.gerant.nom} (${sites[sc.gerant.siteCle].nom}) → connexion : ${gerantEmail}  /  ${gerantMdp}`);

  // 5. Les produits : catégories, préparations (utilisables), produits vendables (labo ou activité).
  const catProd = {};
  for (const [nom, typeProduit] of Object.entries(sc.categoriesProduit)) catProd[nom] = (await api('POST', '/api/categories-produit', { nom, typeProduit }, tok)).id;
  const prod = {};
  for (const u of sc.utilisables) {
    const labo = sites[u.labo];
    const destinataires = activites.filter((s) => s.laboCle === u.labo).map((s) => s.id);
    const r = await api('POST', '/api/produits', {
      nom: u.nom, type: 'utilisable', origine: 'labo', laboIds: [labo.id], activiteIds: destinataires, uniteId: unites[u.unite], quantiteProduite: 1,
      ingredients: u.ingredients.map(([n, q]) => ({ ingredientId: art[n].id, portion: q })), subProducts: [],
    }, tok);
    prod[u.nom] = r.id;
  }
  for (const p of sc.vendables) {
    const r = await api('POST', '/api/produits', {
      nom: p.nom, type: 'vendable', origine: p.origine, categorieProduitId: catProd[p.cat],
      laboIds: p.origine === 'labo' ? [sites[p.labo].id] : [], activiteIds: p.sites.map((cle) => sites[cle].id),
      ingredients: p.composition.filter(([, , t]) => t === 'art').map(([n, q]) => ({ ingredientId: art[n].id, portion: q })),
      subProducts: p.composition.filter(([, , t]) => t === 'sous').map(([n, q]) => ({ subProductId: prod[n], portion: q })),
    }, tok);
    prod[p.nom] = r.id;
  }
  console.log(`5. Produits : ${sc.utilisables.length} préparations, ${sc.vendables.length} produits vendables.`);

  // 6. Les réceptions par FACTURE FOURNISSEUR (un lundi sur deux ; une facture par fournisseur et par site — la limite de
  // débit des factures est de 120 par quart d'heure), envoyées à la comptabilité.
  const lundis = joursEntre(DEBUT, FIN, 1).filter((_, i) => i % 2 === 0);
  const factures = []; // { id, fournisseur, date }
  for (let w = 0; w < lundis.length; w++) {
    const date = lundis[w];
    const groupes = {}; // `${fournisseur}|${cle}` → lignes
    for (const a of sc.articles) for (const [cle, base] of Object.entries(a.appro)) {
      const k = `${a.fournisseur}|${cle}`;
      (groupes[k] = groupes[k] || []).push({ articleId: art[a.nom].id, quantite: jitter(base * 2), prixUnitaire: jitter(a.prixHT, 0.03), tauxTva: a.tva });
    }
    for (const [k, lignes] of Object.entries(groupes)) {
      const [fnom, cle] = k.split('|');
      const s = sites[cle];
      const r = await facture(tok, {
        cible: { type: s.type, id: s.id }, dateAppro: date, fournisseurId: fourn[fnom],
        refFacture: `F${ANNEE}-${String(fourn[fnom]).slice(-3)}-S${String(w + 1).padStart(2, '0')}-${cle.toUpperCase().slice(0, 4)}`,
        timbreFiscal: true, envoyerCompta: true, lignes,
      });
      factures.push({ id: r.factureId, fournisseur: fnom, date });
    }
  }
  console.log(`6. ${factures.length} factures fournisseur reçues et envoyées à la comptabilité (${lundis.length} quinzaines).`);

  // 7. Productions (mardis), livraisons internes (jeudis), ventes (jeu/ven/sam), pertes (vendredis).
  const mardis = joursEntre(DEBUT, FIN, 2);
  for (const d of mardis) {
    for (const u of sc.utilisables) await api('PUT', `/api/labo/${sites[u.labo].id}/stock/${-prod[u.nom]}`, { quantite: jitter(u.prodHebdo, 0.08), dateAppro: d }, tok);
    for (const p of sc.vendables.filter((x) => x.origine === 'labo')) await api('PUT', `/api/labo/${sites[p.labo].id}/stock/${-prod[p.nom]}`, { quantite: Math.round(jitter(p.prodHebdo, 0.08)), dateAppro: d }, tok);
  }
  const jeudis = joursEntre(DEBUT, FIN, 4);
  let nLivraisons = 0;
  for (let w = 0; w < jeudis.length; w++) {
    const parLabo = {}; // labo cle → transfers
    for (const p of sc.vendables.filter((x) => x.origine === 'labo')) for (const [cle, q] of Object.entries(p.transferts || {})) {
      (parLabo[p.labo] = parLabo[p.labo] || []).push({ activiteId: sites[cle].id, ingredientId: -prod[p.nom], quantite: Math.round(jitter(q, 0.1)), prixUnitaire: r3((p.prixVenteTTC / (1 + sc.tvaVentes / 100)) * 0.55) });
    }
    for (const [cle, lignes] of Object.entries(sc.livraisonsEconomat || {})) for (const [ref, q] of lignes) {
      const a = art[ref.slice(4)];
      (parLabo.economat = parLabo.economat || []).push({ activiteId: sites[cle].id, ingredientId: a.id, quantite: jitter(q, 0.1), prixUnitaire: jitter(a.prixHT, 0.03) });
    }
    for (const [laboCle, transfers] of Object.entries(parLabo)) {
      await api('POST', `/api/labo/${sites[laboCle].id}/transfer`, { dateTransfert: jeudis[w], refFacture: `LI-${ANNEE}-S${String(w + 1).padStart(2, '0')}-${laboCle.slice(0, 3).toUpperCase()}`, tauxTva: sc.tvaVentes, note: 'Livraison interne hebdomadaire', transfers }, tok);
      nLivraisons++;
    }
  }
  // Prix de vente des produits et des valorisés sur les activités qui vendent ; charges fixes.
  for (const p of sc.vendables) for (const cle of p.sites) if (sites[cle].vend) await api('POST', '/api/articles-vendables', { activite_id: sites[cle].id, article_type: 'produit', article_id: prod[p.nom], prix_vente: p.prixVenteTTC, portion: 1, actif: true }, tok);
  const catValorise = Object.entries(sc.categoriesProduit).find(([, t]) => t === 'valorise')?.[0];
  for (const a of sc.articles.filter((x) => x.valorise)) {
    if (catValorise) await api('PUT', `/api/articles-valorisables/${art[a.nom].id}/categorie`, { categorie_produit_id: catProd[catValorise] }, tok);
    for (const [cle, lignes] of Object.entries(sc.ventes || {})) if (lignes.some(([ref]) => ref === `art:${a.nom}`)) await api('POST', '/api/articles-vendables', { activite_id: sites[cle].id, article_type: 'ingredient', article_id: art[a.nom].id, prix_vente: a.prixVenteTTC, portion: 1, actif: true }, tok);
  }
  for (const [cle, charges] of Object.entries(sc.chargesFixes || {})) await api('POST', '/api/charges-fixes', { activite_id: sites[cle].id, mode: 'detail', ...charges }, tok);
  const joursVente = [...joursEntre(DEBUT, FIN, 4), ...joursEntre(DEBUT, FIN, 5), ...joursEntre(DEBUT, FIN, 6)].sort();
  const ventesMois = {}; // 'AAAA-MM' → TTC
  let nVentes = 0;
  for (const d of joursVente) {
    for (const [cle, lignes] of Object.entries(sc.ventes || {})) {
      const corps = lignes.map(([ref, lo, hi]) => {
        const estArt = ref.startsWith('art:');
        const nom = estArt ? ref.slice(4) : ref;
        const prix = estArt ? art[nom].prixVenteTTC : sc.vendables.find((p) => p.nom === nom).prixVenteTTC;
        return { article_type: estArt ? 'ingredient' : 'produit', article_id: estArt ? art[nom].id : prod[nom], quantite: qte(lo, hi), prix_unitaire: prix };
      });
      await api('POST', '/api/ventes', { activite_id: sites[cle].id, date_vente: d, type_vente: 'directe', prestataire_id: null, lignes: corps }, tok);
      const ym = d.slice(0, 7);
      ventesMois[ym] = r3((ventesMois[ym] || 0) + corps.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0));
      nVentes++;
    }
  }
  for (const d of joursEntre(DEBUT, FIN, 5)) {
    for (const [cle, ref, q, type] of sc.pertes) {
      const s = sites[cle];
      const ingredientId = ref.startsWith('art:') ? art[ref.slice(4)].id : -prod[ref.slice(5)];
      if (s.type === 'labo') await api('POST', `/api/labo/${s.id}/stock/${ref.startsWith('art:') ? ingredientId : ingredientId}/perte`, { quantite: jitter(q, 0.3), typePerte: type, datePerte: d }, tok).catch(() => null);
      else await api('POST', `/api/entreprise/activites/${s.id}/pertes`, { ingredientId, quantite: jitter(q, 0.3), typePerte: type, datePerte: d }, tok);
    }
  }
  console.log(`7. ${mardis.length} semaines de production, ${nLivraisons} livraisons internes, ${nVentes} journées de vente, pertes hebdomadaires.`);

  // 8. B2B (usine) : revendeurs, offres, ventes livrées (factures LabFlow).
  const b2bMois = {}; // 'AAAA-MM' → [{ acheteur, ttc }]
  if (sc.acheteurs) {
    const cree = await api('POST', '/api/acheteurs', { acheteurs: sc.acheteurs.map((a, i) => ({ ...a, email: alias(`${sc.suffixe}-revendeur${i + 1}`) })) }, tok);
    const achIds = cree.acheteurs.map((a) => a.id);
    for (const [nom, prixHT, tva] of sc.offres) await api('POST', '/api/acheteurs/offres', { articleType: 'produit', articleId: prod[nom], prixUnitaireHt: prixHT, tauxTva: tva, actif: true }, tok);
    const usine = labos[0];
    for (const v of sc.ventesB2B) {
      await api('POST', '/api/acheteurs/ventes', {
        acheteurId: achIds[v.acheteur], laboId: usine.id, dateCommande: v.date, statut: 'livree', dateExpedition: v.date, dateLivraison: v.date, remisePct: 0, timbreFiscal: true,
        lignes: v.lignes.map(([nom, q]) => ({ articleType: 'produit', articleId: prod[nom], quantite: q })),
      }, tok);
      const ht = v.lignes.reduce((s, [nom, q]) => s + q * sc.offres.find(([n]) => n === nom)[1], 0);
      const ym = v.date.slice(0, 7);
      (b2bMois[ym] = b2bMois[ym] || []).push({ acheteur: sc.acheteurs[v.acheteur].entreprise, ht: r3(ht), ttc: r3(ht * 1.19 + 1), date: v.date });
    }
    console.log(`8. ${sc.acheteurs.length} revendeurs, ${sc.offres.length} offres, ${sc.ventesB2B.length} ventes B2B livrées (factures).`);
  }

  // 9. Inventaires en dernier (repères du stock) à la fin de la période.
  for (const s of Object.values(sites)) {
    const noms = [...(besoins[s.cle] || [])].slice(0, 6);
    const entries = noms.map((n) => ({ ingredientId: art[n].id, quantiteReelle: jitter(art[n].appro[s.cle] ? art[n].appro[s.cle] * 0.6 : 10, 0.4), note: 'Inventaire de fin de période' }));
    for (const p of sc.vendables.filter((x) => x.origine === 'labo' && ((x.labo === s.cle) || (x.transferts || {})[s.cle]))) entries.push({ ingredientId: -prod[p.nom], quantiteReelle: qte(5, 40) });
    if (!entries.length) continue;
    if (s.type === 'labo') await api('POST', `/api/labo/${s.id}/inventaire`, { dateInventaire: FIN, entries }, tok);
    else await api('POST', `/api/stock/entreprise/${s.id}/inventaire`, { dateInventaire: FIN, entries }, tok);
  }
  console.log('9. Inventaires de fin de période.');

  // 10. LabFlow Compta : le dossier « Mon entreprise », les écritures de l'exercice, la validation.
  const espace = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'client_labflow' AND titulaire_id = $1`, [clientId])).rows[0];
  const dossier = (await pool.query(`SELECT id FROM compta.dossiers WHERE espace_id = $1 AND source = 'labflow' ORDER BY id LIMIT 1`, [espace.id])).rows[0];
  const D = dossier.id;
  const plan = await api('GET', `/api/compta/dossiers/${D}/plan`, undefined, tok);
  const comptes = (plan.comptes || []).filter((c) => c.actif !== false);
  const feuille = (numero) => {
    const estFeuille = (c) => !comptes.some((o) => o.numero !== c.numero && o.numero.startsWith(c.numero));
    const lui = comptes.find((c) => c.numero === numero);
    if (lui && estFeuille(lui)) return lui;
    const k = comptes.filter((c) => c.numero.startsWith(numero) && estFeuille(c)).sort((a, b) => (a.numero < b.numero ? -1 : 1))[0];
    if (!k) throw new Error(`compte ${numero} introuvable dans le plan`);
    return k;
  };
  const K = Object.fromEntries(['10131', '5321', '5411', '43671', '640', '647', '425', '453', '613', '606', '681', '282', '1621', '4111', sc.compta.compteVentes, ...sc.compta.immobilisations.map((i) => i.compte)].map((n) => [n, feuille(n).id]));
  const journaux = Object.fromEntries((await api('GET', `/api/compta/dossiers/${D}/journaux`, undefined, tok)).journaux.map((j) => [j.code, j.id]));
  const L = (numero, debit, credit, tiersId = null) => ({ compteId: K[numero], tiersId, debit: debit ? montant(debit) : '', credit: credit ? montant(credit) : '' });
  const ecrire = (journal, date, reference, libelle, lignes) => api('POST', `/api/compta/dossiers/${D}/ecritures`, { journalId: journaux[journal], date, reference, libelle, lignes }, tok);
  let nEcritures = 0;
  // Janvier : capital, immobilisations (financées par le capital ou par un emprunt).
  await ecrire('BQ', `${ANNEE}-01-05`, 'CAP-1', 'Apport en capital', [L('5321', sc.compta.capital), L('10131', 0, sc.compta.capital)]); nEcritures++;
  for (const im of sc.compta.immobilisations) {
    if (im.financement === 'emprunt') await ecrire('OD', `${ANNEE}-01-12`, `IMMO-${im.compte}`, `${im.libelle} — financement bancaire`, [L(im.compte, im.montant), L('1621', 0, im.montant)]);
    else await ecrire('BQ', `${ANNEE}-01-12`, `IMMO-${im.compte}`, im.libelle, [L(im.compte, im.montant), L('5321', 0, im.montant)]);
    nEcritures++;
  }
  // Chaque mois de janvier à septembre : ventes (caisse), remise en banque, loyer, énergie, salaires et leur règlement.
  const tauxTva = sc.tvaVentes;
  const moisTenus = ['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((m) => `${ANNEE}-${m}`);
  const tiersFournisseurs = (await pool.query('SELECT id, fournisseur_id FROM compta.tiers WHERE dossier_id = $1 AND fournisseur_id IS NOT NULL', [D])).rows;
  const tiersDe = (fnom) => tiersFournisseurs.find((t) => t.fournisseur_id === fourn[fnom])?.id || null;
  const ecrituresPont = (await pool.query(`SELECT e.facture_id, e.total_debit::text AS total, e.date::text AS date FROM compta.ecritures e WHERE e.dossier_id = $1 AND e.facture_id = ANY($2)`, [D, factures.map((f) => f.id)])).rows;
  for (const ym of moisTenus) {
    const fin = finDeMois(ym);
    const m = Number(ym.slice(5));
    const ttcVentes = ventesMois[ym] != null ? ventesMois[ym] : (sc.compta.ventesEstimees[m] != null ? sc.compta.ventesEstimees[m] : r3(Object.values(sc.compta.ventesEstimees).reduce((s, x) => s + x, 0) / 6));
    const htVentes = r3(ttcVentes / (1 + tauxTva / 100));
    await ecrire('CA', fin, `VTE-${ym}`, `Ventes du mois (caisse)`, [L('5411', ttcVentes), L(sc.compta.compteVentes, 0, htVentes), L('43671', 0, r3(ttcVentes - htVentes))]); nEcritures++;
    const remise = r3(ttcVentes * 0.8);
    await ecrire('BQ', fin, `REM-${ym}`, 'Remise en banque des recettes', [L('5321', remise), L('5411', 0, remise)]); nEcritures++;
    if (sc.compta.loyer) { await ecrire('BQ', mois(ym, 5), `LOY-${ym}`, 'Loyer du mois', [L('613', sc.compta.loyer), L('5321', 0, sc.compta.loyer)]); nEcritures++; }
    await ecrire('BQ', mois(ym, 20), `ENE-${ym}`, 'Électricité, gaz et eau', [L('606', sc.compta.energie), L('5321', 0, sc.compta.energie)]); nEcritures++;
    const { brut, charges } = sc.compta.salaires;
    await ecrire('OD', fin, `SAL-${ym}`, 'Salaires du mois', [L('640', brut), L('647', charges), L('425', 0, brut), L('453', 0, charges)]); nEcritures++;
    await ecrire('BQ', fin, `PAI-${ym}`, 'Paiement des salaires et des cotisations', [L('425', brut), L('453', charges), L('5321', 0, brut + charges)]); nEcritures++;
    // Règlement des factures fournisseur du mois (celles que le pont a passées), par fournisseur.
    const duMois = {};
    for (const e of ecrituresPont.filter((x) => x.date.startsWith(ym))) {
      const f = factures.find((x) => x.id === e.facture_id);
      duMois[f.fournisseur] = r3((duMois[f.fournisseur] || 0) + Number(e.total));
    }
    for (const [fnom, total] of Object.entries(duMois)) {
      const tiers = tiersDe(fnom);
      if (!tiers || !total) continue;
      await ecrire('BQ', fin, `RGL-${ym}-${String(fourn[fnom]).slice(-3)}`, `Règlement ${fnom}`, [{ compteId: feuille('4011').id, tiersId: tiers, debit: montant(total), credit: '' }, L('5321', 0, total)]); nEcritures++;
    }
    // Ventes aux revendeurs (usine) : facturées au client, encaissées le mois suivant.
    for (const v of b2bMois[ym] || []) {
      const tiersClient = (await api('POST', `/api/compta/dossiers/${D}/tiers`, { type: 'client', nom: v.acheteur, delaiPaiement: 30 }, tok).catch(() => null))?.tiers?.id
        || (await pool.query(`SELECT id FROM compta.tiers WHERE dossier_id = $1 AND type = 'client' AND nom = $2`, [D, v.acheteur])).rows[0]?.id;
      await ecrire('VT', v.date, `FB2B-${v.date}`, `Vente revendeur — ${v.acheteur}`, [{ compteId: K['4111'], tiersId: tiersClient, debit: montant(v.ttc), credit: '' }, L(sc.compta.compteVentes, 0, v.ht), L('43671', 0, r3(v.ttc - v.ht))]); nEcritures++;
      await ecrire('BQ', fin, `ENC-${v.date}`, `Encaissement ${v.acheteur}`, [L('5321', v.ttc), { compteId: K['4111'], tiersId: tiersClient, debit: '', credit: montant(v.ttc) }]); nEcritures++;
    }
  }
  // Dotation aux amortissements des neuf premiers mois.
  const dotation = r3(sc.compta.immobilisations.reduce((s, im) => s + im.montant, 0) * 0.1 * 9 / 12);
  await ecrire('OD', `${ANNEE}-09-30`, `DOT-${ANNEE}-09`, 'Dotation aux amortissements (janvier à septembre)', [L('681', dotation), L('282', 0, dotation)]); nEcritures++;
  // Validation de janvier à septembre (les écritures du pont comprises), clôture des mois de janvier à juin.
  const periodes = (await api('GET', `/api/compta/dossiers/${D}/periodes`, undefined, tok)).exercice.periodes;
  for (const p of periodes.filter((x) => x.debut.slice(0, 7) <= `${ANNEE}-09`)) await api('POST', `/api/compta/dossiers/${D}/periodes/${p.id}/valider`, {}, tok);
  for (const p of periodes.filter((x) => x.debut.slice(0, 7) <= `${ANNEE}-06`)) await api('POST', `/api/compta/dossiers/${D}/periodes/${p.id}/clore`, {}, tok);
  console.log(`10. Compta : dossier ${D}, ${nEcritures} écritures saisies + ${ecrituresPont.length} du pont ; janvier à septembre validés, janvier à juin clos.`);
  const etats = await api('GET', `/api/compta/dossiers/${D}/etats`, undefined, tok);
  console.log(`11. États financiers ${ANNEE} : ${etats.pret ? 'contrôles au vert' : 'À VÉRIFIER : ' + etats.controles.filter((c) => !c.ok).map((c) => c.detail).join(' ; ')} — total des actifs ${etats.bilan.actifs.total.n}, résultat ${etats.resultat.net.n}, trésorerie ${etats.flux ? etats.flux.tresorerie.fin.n : '—'}.`);

  resume.push({ compte: sc.identite.nomCommercial, domaine: domaine.nom, email, motDePasse, gerant: `${sc.gerant.nom} — ${gerantEmail}`, gerantMdp, dossierCompta: D, clientId });
};

// ─── Main ───────────────────────────────────────────────────────────────────────────────────────────────────────────
module.exports = { SCENARIOS, DEBUT, FIN };
if (require.main === module) (async () => {
  const args = process.argv.slice(2);
  let adminId = null;
  const resume = [];
  try {
    const sante = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);
    if (!sante) throw new Error(`le serveur ne répond pas sur ${BASE} (/health)`);
    if (!CHOISIS.length) throw new Error(`SEED_COMPTES ne désigne aucun compte (resto, hotel, usine) : ${COMPTES.join(', ')}`);
    if (args.includes('--nettoyer')) { await nettoyer(); return; }
    const existants = (await pool.query('SELECT email FROM utilisateurs WHERE LOWER(email) = ANY($1)', [CHOISIS.map((sc) => alias(sc.suffixe))])).rows;
    if (existants.length && !args.includes('--refaire')) throw new Error(`comptes déjà présents (${existants.map((x) => x.email).join(', ')}) : relancez avec --refaire pour les recréer, ou --nettoyer`);
    if (existants.length) await nettoyer();
    // Le module Compta s'active au tarif en vigueur : il doit être saisi (Tarifs → LabFlow Compta) avant de lancer.
    const tarif = (await pool.query("SELECT valeur_dt FROM tarifs_config WHERE cle = 'compta_module_mensuel'")).rows[0];
    if (!tarif || !(Number(tarif.valeur_dt) > 0)) throw new Error('le tarif « Module Comptabilité » vaut 0 DT : saisissez-le avant de lancer (Tarifs → LabFlow Compta), puis relancez');
    // Un super_admin temporaire (création des comptes, identité, module Compta), supprimé à la fin.
    const adminMdp = mdp();
    adminId = (await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at) VALUES ('Seed (temporaire)', $1, $2, 'super_admin', true, 0, NOW()) RETURNING id`,
      [ADMIN_EMAIL, await bcrypt.hash(adminMdp, 10)]
    )).rows[0].id;
    const adminTok = await login(ADMIN_EMAIL, adminMdp);
    const echecs = [];
    for (const sc of CHOISIS) {
      try {
        await batir(sc, adminTok, resume);
      } catch (err) {
        echecs.push(`${sc.identite.nomCommercial} : ${err.message}`);
        console.error(`❌ ${sc.identite.nomCommercial} — ${err.message}\n   (compte laissé en l'état ; relancez avec --refaire après correction)`);
      }
    }
    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log(`  ${echecs.length ? '⚠️' : '✅'} ${resume.length} compte(s) de test prêt(s) sur ${CHOISIS.length} (données fictives). Mots de passe :`);
    for (const r of resume) {
      console.log(`  • ${r.compte} (${r.domaine}) — client ${r.clientId}, dossier Compta ${r.dossierCompta}`);
      console.log(`      ${r.email}  /  ${r.motDePasse}`);
      console.log(`      gérant : ${r.gerant}  /  ${r.gerantMdp}`);
    }
    for (const e of echecs) console.log(`  ✗ ${e}`);
    console.log('══════════════════════════════════════════════════════════════════════');
    if (echecs.length) process.exitCode = 1;
  } catch (err) {
    console.error('❌', err.message);
    process.exitCode = 1;
  } finally {
    if (adminId) await pool.query('DELETE FROM utilisateurs WHERE id = $1', [adminId]).catch(() => null);
    await pool.end();
  }
})();
