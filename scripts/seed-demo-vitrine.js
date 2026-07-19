/**
 * Compte DÉMO « vitrine » — Dar Yasmine (captures d'écran site marketing + vidéo + démos commerciales)
 *
 * Structure : 1 cuisine centrale (labo) + 2 points de vente (restaurant indépendant à La Marsa,
 * salon de thé & pâtisserie rattaché au labo aux Berges du Lac) + 1 gérant + module Acheteurs (palier 10).
 * Montre la LARGEUR du produit (règle verrouillée : pas centré pâtisserie) : plats, pâtisseries,
 * boissons, B2B, production labo, transferts valorisés, prestataires de livraison.
 *
 * Le compte (client, gérant, comptes portail acheteurs) est créé en SQL DIRECT — AUCUN email ne part
 * (le .env local a une vraie clé Resend). Tout le métier passe par l'API locale (logique réelle :
 * PMP, déductions, factures, commandes) comme les scripts E2E.
 *
 * Prérequis : backend démarré sur http://localhost:3000.
 * Run  : node scripts/seed-demo-vitrine.js
 * Login client  : demo@dar-yasmine.tn / DemoVitrine2026!
 * Login gérant  : gerant@dar-yasmine.tn / DemoVitrine2026!
 * Login portail : m.khelil.prof+acheteur1@gmail.com / Portail2026!  (idem +acheteur2..4)
 */

require('dotenv').config();
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');

const BASE = 'http://localhost:3000';
const EMAIL = 'demo@dar-yasmine.tn';
const PASSWORD = 'DemoVitrine2026!';
const GERANT_EMAIL = 'gerant@dar-yasmine.tn';
const PORTAIL_PASSWORD = 'Portail2026!';
const START = '2026-06-01';
const END = '2026-07-18';

const r3 = (x) => Math.round(x * 1000) / 1000;
const ttc = (ht, tva) => r3(ht * (1 + tva / 100));
const jitter = (base, pct = 0.12) => r3(base * (1 - pct + Math.random() * pct * 2));

function datesBetween(from, to, dayOfWeek) {
  const out = [];
  const f = new Date(from), t = new Date(to);
  const cur = new Date(f);
  cur.setDate(cur.getDate() + ((dayOfWeek - f.getDay() + 7) % 7));
  while (cur <= t) { out.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 7); }
  return out;
}

let TOKEN = null;
async function api(method, path, body, token = TOKEN) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${typeof data === 'object' ? JSON.stringify(data) : data}`);
  }
  return data;
}

// ─── Jeu de données (conçu pour des captures crédibles, prix DT 2026) ─────────
const FOURNISSEURS = [
  { nom: 'Comptoir Ben Miled & Cie', adresse: '14 rue de la Verrerie, Mégrine Riadh 2033, Ben Arous', telephone: '+216 71 296 430' },
  { nom: 'Ferme Belhadj & Fils', adresse: 'Route de Mateur km 12, 2020 Sidi Thabet, Ariana', telephone: '+216 70 528 316' },
  { nom: 'Primeurs du Cap Bon', adresse: 'Marché de gros de Bir El Kassâa, pavillon C, carreau 27, 2013 Ben Arous', telephone: '+216 79 412 508' },
  { nom: 'Laiterie El Fejja', adresse: 'Zone industrielle El Fejja, 1110 Mornaguia, Manouba', telephone: '+216 71 654 218' },
];

const FAMILLES = [
  { nom: 'Matières premières', consommable: true, vendable: false },
  { nom: 'Boissons revendables', consommable: false, vendable: true },
  { nom: 'Emballages', consommable: true, vendable: false },
];

const CATEGORIES = ['Épicerie', 'Viandes & volailles', 'Fruits & légumes', 'Crèmerie', 'Boissons', 'Emballages'];

// cible: labo | resto | les_deux (les_deux = labo + restaurant) ; salonDirect: appro directe salon
// approLabo / approResto / approSalon = quantité de base par appro hebdomadaire
const ARTICLES = [
  { nom: 'Farine pâtissière', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 1.9, tva: 7, fournisseur: 'Comptoir Ben Miled & Cie', approLabo: 75 },
  { nom: 'Semoule moyenne', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 1.7, tva: 7, fournisseur: 'Comptoir Ben Miled & Cie', approResto: 25 },
  { nom: 'Sucre blanc', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 1.6, tva: 7, fournisseur: 'Comptoir Ben Miled & Cie', approLabo: 25, approResto: 10, approSalon: 8 },
  { nom: 'Sucre glace', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 2.8, tva: 7, fournisseur: 'Comptoir Ben Miled & Cie', approLabo: 10 },
  { nom: 'Sel fin', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 0.7, tva: 7, fournisseur: 'Comptoir Ben Miled & Cie', approLabo: 4, approResto: 3 },
  { nom: 'Levure boulangère', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 11, tva: 7, fournisseur: 'Comptoir Ben Miled & Cie', approLabo: 3 },
  { nom: "Huile d'olive extra vierge", unite: 'L', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 27, tva: 7, fournisseur: 'Comptoir Ben Miled & Cie', approLabo: 10, approResto: 12 },
  { nom: 'Concentré de tomate', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 5.5, tva: 7, fournisseur: 'Comptoir Ben Miled & Cie', approLabo: 8, approResto: 6 },
  { nom: 'Pois chiches', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 4.5, tva: 7, fournisseur: 'Comptoir Ben Miled & Cie', approResto: 6 },
  { nom: "Thon à l'huile d'olive", unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 29, tva: 7, fournisseur: 'Comptoir Ben Miled & Cie', approResto: 5 },
  { nom: 'Olives noires', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 7.5, tva: 7, fournisseur: 'Comptoir Ben Miled & Cie', approResto: 4 },
  { nom: 'Amandes émondées', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 38, tva: 7, fournisseur: 'Comptoir Ben Miled & Cie', approLabo: 14 },
  { nom: 'Chocolat noir de couverture 64 %', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 31, tva: 19, fournisseur: 'Comptoir Ben Miled & Cie', approLabo: 6 },
  { nom: 'Café en grains arabica', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 36, tva: 19, fournisseur: 'Comptoir Ben Miled & Cie', approResto: 5, approSalon: 8 },
  { nom: 'Thé vert de Chine', unite: 'kg', famille: 'Matières premières', categorie: 'Épicerie', prixHT: 21, tva: 19, fournisseur: 'Comptoir Ben Miled & Cie', approResto: 1.5, approSalon: 2 },
  { nom: 'Lait demi-écrémé', unite: 'L', famille: 'Matières premières', categorie: 'Crèmerie', prixHT: 1.45, tva: 7, fournisseur: 'Laiterie El Fejja', approLabo: 60, approResto: 25, approSalon: 40 },
  { nom: 'Crème liquide 35 %', unite: 'L', famille: 'Matières premières', categorie: 'Crèmerie', prixHT: 11.5, tva: 7, fournisseur: 'Laiterie El Fejja', approLabo: 15 },
  { nom: 'Beurre pâtissier', unite: 'kg', famille: 'Matières premières', categorie: 'Crèmerie', prixHT: 26.5, tva: 7, fournisseur: 'Laiterie El Fejja', approLabo: 50 },
  { nom: 'Œufs frais', unite: 'pièce', famille: 'Matières premières', categorie: 'Crèmerie', prixHT: 0.42, tva: 7, fournisseur: 'Ferme Belhadj & Fils', approLabo: 300, approResto: 180 },
  { nom: 'Poulet fermier entier', unite: 'kg', famille: 'Matières premières', categorie: 'Viandes & volailles', prixHT: 9.8, tva: 7, fournisseur: 'Ferme Belhadj & Fils', approResto: 35 },
  { nom: 'Épaule de bœuf', unite: 'kg', famille: 'Matières premières', categorie: 'Viandes & volailles', prixHT: 39, tva: 7, fournisseur: 'Ferme Belhadj & Fils', approResto: 12 },
  { nom: 'Merguez artisanales', unite: 'kg', famille: 'Matières premières', categorie: 'Viandes & volailles', prixHT: 27, tva: 7, fournisseur: 'Ferme Belhadj & Fils', approResto: 10 },
  { nom: 'Tomates', unite: 'kg', famille: 'Matières premières', categorie: 'Fruits & légumes', prixHT: 1.8, tva: 7, fournisseur: 'Primeurs du Cap Bon', approLabo: 90, approResto: 30 },
  { nom: 'Oignons', unite: 'kg', famille: 'Matières premières', categorie: 'Fruits & légumes', prixHT: 1.3, tva: 7, fournisseur: 'Primeurs du Cap Bon', approLabo: 18, approResto: 15 },
  { nom: 'Ail', unite: 'kg', famille: 'Matières premières', categorie: 'Fruits & légumes', prixHT: 9, tva: 7, fournisseur: 'Primeurs du Cap Bon', approLabo: 3, approResto: 2 },
  { nom: 'Poivrons', unite: 'kg', famille: 'Matières premières', categorie: 'Fruits & légumes', prixHT: 2.4, tva: 7, fournisseur: 'Primeurs du Cap Bon', approResto: 20 },
  { nom: 'Pommes de terre', unite: 'kg', famille: 'Matières premières', categorie: 'Fruits & légumes', prixHT: 1.7, tva: 7, fournisseur: 'Primeurs du Cap Bon', approResto: 30 },
  { nom: 'Carottes', unite: 'kg', famille: 'Matières premières', categorie: 'Fruits & légumes', prixHT: 1.5, tva: 7, fournisseur: 'Primeurs du Cap Bon', approResto: 12 },
  { nom: 'Courgettes', unite: 'kg', famille: 'Matières premières', categorie: 'Fruits & légumes', prixHT: 2.1, tva: 7, fournisseur: 'Primeurs du Cap Bon', approResto: 12 },
  { nom: 'Citrons', unite: 'kg', famille: 'Matières premières', categorie: 'Fruits & légumes', prixHT: 3.2, tva: 7, fournisseur: 'Primeurs du Cap Bon', approResto: 8, approSalon: 6 },
  { nom: 'Oranges à jus', unite: 'kg', famille: 'Matières premières', categorie: 'Fruits & légumes', prixHT: 1.9, tva: 7, fournisseur: 'Primeurs du Cap Bon', approResto: 40, approSalon: 30 },
  { nom: 'Menthe fraîche', unite: 'botte', famille: 'Matières premières', categorie: 'Fruits & légumes', prixHT: 0.8, tva: 7, fournisseur: 'Primeurs du Cap Bon', approResto: 25, approSalon: 20 },
  { nom: 'Eau minérale 0,5 L', unite: 'pièce', famille: 'Boissons revendables', categorie: 'Boissons', prixHT: 0.55, tva: 19, fournisseur: 'Comptoir Ben Miled & Cie', approResto: 150, approSalon: 120, valorise: true, prixVenteTTC: 1.5 },
  { nom: 'Boisson gazeuse 33 cl', unite: 'pièce', famille: 'Boissons revendables', categorie: 'Boissons', prixHT: 1.45, tva: 19, fournisseur: 'Comptoir Ben Miled & Cie', approResto: 100, approSalon: 80, valorise: true, prixVenteTTC: 3 },
  { nom: 'Boîte pâtisserie carton', unite: 'pièce', famille: 'Emballages', categorie: 'Emballages', prixHT: 0.85, tva: 19, fournisseur: 'Comptoir Ben Miled & Cie', approLabo: 80, approSalon: 60 },
  { nom: 'Barquette alimentaire avec couvercle', unite: 'pièce', famille: 'Emballages', categorie: 'Emballages', prixHT: 0.4, tva: 19, fournisseur: 'Comptoir Ben Miled & Cie', approResto: 100 },
  { nom: 'Sac kraft', unite: 'pièce', famille: 'Emballages', categorie: 'Emballages', prixHT: 0.22, tva: 19, fournisseur: 'Comptoir Ben Miled & Cie', approResto: 120, approSalon: 100 },
];

// Sous-recettes (produits utilisables, origine labo) — quantités pour 1 kg fini
const SOUS_RECETTES = [
  { nom: 'Crème pâtissière', prodHebdo: 28, ingredients: [
    ['Lait demi-écrémé', 0.75], ['Sucre blanc', 0.15], ['Œufs frais', 3], ['Farine pâtissière', 0.07], ['Beurre pâtissier', 0.03]] },
  { nom: 'Sauce tomate maison', prodHebdo: 70, ingredients: [
    ['Tomates', 0.9], ['Oignons', 0.15], ['Ail', 0.02], ["Huile d'olive extra vierge", 0.06], ['Concentré de tomate', 0.08], ['Sel fin', 0.01]] },
  { nom: 'Pâte feuilletée', prodHebdo: 55, ingredients: [
    ['Farine pâtissière', 0.55], ['Beurre pâtissier', 0.42], ['Sel fin', 0.012]] },
];

// Pâtisseries VENDABLES produites au labo (origine labo → transferts salon + éligibles B2B)
const PATISSERIES_LABO = [
  { nom: 'Mille-feuille', prixVenteTTC: 4.8, prodHebdo: 120, transfertHebdo: 95, composition: [
    ['Pâte feuilletée', 0.09, 'sous'], ['Crème pâtissière', 0.08, 'sous'], ['Sucre glace', 0.005, 'art']] },
  { nom: 'Tarte aux amandes', prixVenteTTC: 5.8, prodHebdo: 60, transfertHebdo: 45, composition: [
    ['Pâte feuilletée', 0.08, 'sous'], ['Amandes émondées', 0.05, 'art'], ['Sucre blanc', 0.03, 'art'], ['Œufs frais', 1, 'art'], ['Beurre pâtissier', 0.02, 'art']] },
  { nom: 'Croissant au beurre', prixVenteTTC: 2.5, prodHebdo: 200, transfertHebdo: 160, composition: [
    ['Farine pâtissière', 0.08, 'art'], ['Beurre pâtissier', 0.04, 'art'], ['Sucre blanc', 0.01, 'art'], ['Levure boulangère', 0.004, 'art'], ['Lait demi-écrémé', 0.03, 'art'], ['Œufs frais', 0.2, 'art']] },
];

// Produits composés labo « B2B » (vendus tels quels, catégorie valorisée)
const COMPOSES_LABO = [
  { nom: 'Plateau pâtisseries assorties (12 pièces)', prixVenteTTC: 58, prodHebdo: 22, transfertHebdo: 6, composition: [
    ['Pâte feuilletée', 0.6, 'sous'], ['Crème pâtissière', 0.5, 'sous'], ['Amandes émondées', 0.12, 'art'], ['Chocolat noir de couverture 64 %', 0.1, 'art'], ['Sucre glace', 0.05, 'art'], ['Boîte pâtisserie carton', 1, 'art']] },
  { nom: 'Sauce tomate maison — seau 5 kg', prixVenteTTC: 34, prodHebdo: 12, transfertHebdo: 0, composition: [['Sauce tomate maison', 5, 'sous']] },
  { nom: 'Pâte feuilletée — pâton 2 kg', prixVenteTTC: 39, prodHebdo: 10, transfertHebdo: 0, composition: [['Pâte feuilletée', 2, 'sous']] },
];

// Produits vendables côté activités (origine activite, recette explosée à la vente)
const PRODUITS_ACTIVITE = [
  { nom: 'Couscous au poulet fermier', cat: 'Plats cuisinés', prixVenteTTC: 18, acts: ['resto'], composition: [
    ['Semoule moyenne', 0.12], ['Poulet fermier entier', 0.35], ['Pois chiches', 0.04], ['Carottes', 0.08], ['Courgettes', 0.08], ['Pommes de terre', 0.1], ['Oignons', 0.05], ['Concentré de tomate', 0.03], ["Huile d'olive extra vierge", 0.03]] },
  { nom: 'Ojja merguez', cat: 'Plats cuisinés', prixVenteTTC: 15.5, acts: ['resto'], composition: [
    ['Merguez artisanales', 0.15], ['Œufs frais', 2], ['Tomates', 0.25], ['Oignons', 0.04], ['Ail', 0.005], ['Concentré de tomate', 0.02], ['Poivrons', 0.08], ["Huile d'olive extra vierge", 0.03]] },
  { nom: 'Salade méchouia', cat: 'Plats cuisinés', prixVenteTTC: 8.5, acts: ['resto'], composition: [
    ['Poivrons', 0.25], ['Tomates', 0.15], ['Ail', 0.01], ["Huile d'olive extra vierge", 0.03], ["Thon à l'huile d'olive", 0.04], ['Œufs frais', 1], ['Olives noires', 0.02]] },
  { nom: "Jus d'orange frais", cat: 'Boissons fraîches', prixVenteTTC: 6, acts: ['resto', 'salon'], composition: [['Oranges à jus', 0.4]] },
  { nom: 'Citronnade maison', cat: 'Boissons fraîches', prixVenteTTC: 4.5, acts: ['resto', 'salon'], composition: [
    ['Citrons', 0.15], ['Sucre blanc', 0.04], ['Menthe fraîche', 0.05]] },
  { nom: 'Café direct', cat: 'Boissons chaudes', prixVenteTTC: 3.8, acts: ['resto', 'salon'], composition: [
    ['Café en grains arabica', 0.014], ['Lait demi-écrémé', 0.1], ['Sucre blanc', 0.008]] },
  { nom: 'Thé à la menthe et amandes', cat: 'Boissons chaudes', prixVenteTTC: 4, acts: ['resto', 'salon'], composition: [
    ['Thé vert de Chine', 0.008], ['Menthe fraîche', 0.1], ['Sucre blanc', 0.02], ['Amandes émondées', 0.01]] },
];

const ACHETEURS = [
  { nom: 'Sami Trabelsi', entreprise: 'Café El Medina', email: 'm.khelil.prof+acheteur1@gmail.com', telephone: '+216 22 415 887', adresse: 'Rue Jamaa Ezzitouna, Médina de Tunis', matriculeFiscal: '1458723A' },
  { nom: 'Rym Ben Salah', entreprise: 'Hôtel Dar El Bhar', email: 'm.khelil.prof+acheteur2@gmail.com', telephone: '+216 98 336 214', adresse: 'Zone touristique, Gammarth', matriculeFiscal: '0873416B' },
  { nom: 'Nadia Karoui', entreprise: 'Le Comptoir de Carthage — Épicerie fine', email: 'm.khelil.prof+acheteur3@gmail.com', telephone: '+216 55 720 943', adresse: 'Avenue de Carthage, Tunis', matriculeFiscal: '1290485C' },
  { nom: 'Karim Jelassi', entreprise: 'Restaurant Le Grand Bleu', email: 'm.khelil.prof+acheteur4@gmail.com', telephone: '+216 29 184 662', adresse: 'Port de plaisance, Sidi Bou Saïd', matriculeFiscal: '0964127D' },
];

// [nomProduitOuArticle, type ('produit'|'ingredient'), prixHT, tva]
const OFFRES = [
  ['Plateau pâtisseries assorties (12 pièces)', 'produit', 38, 7],
  ['Sauce tomate maison — seau 5 kg', 'produit', 27, 7],
  ['Pâte feuilletée — pâton 2 kg', 'produit', 32, 7],
  ['Mille-feuille', 'produit', 2.9, 7],
  ['Tarte aux amandes', 'produit', 3.6, 7],
  ['Croissant au beurre', 'produit', 1.5, 7],
  ['Amandes émondées', 'ingredient', 41, 7],
];

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('══ Seed compte démo « Dar Yasmine » ══');

  // 0. Wipe (cascades) — ventes.created_by n'a pas de ON DELETE SET NULL (antérieure à migr 171) :
  // neutraliser la référence avant de supprimer les utilisateurs, le reste cascade.
  const allEmails = [EMAIL, GERANT_EMAIL, ...ACHETEURS.map((a) => a.email)].map((e) => e.toLowerCase());
  await pool.query(
    `UPDATE ventes SET created_by = NULL WHERE created_by IN (SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1))`,
    [allEmails]
  );
  // Produits du client AVANT les utilisateurs : produit_ingredients.unite_id référence unites
  // sans cascade — l'ordre de cascade unites/produits n'est pas garanti sinon.
  await pool.query(
    `DELETE FROM produit_sous_produits WHERE produit_id IN (SELECT p.id FROM produits p JOIN utilisateurs u ON p.client_id = u.id WHERE LOWER(u.email) = ANY($1))
       OR sous_produit_id IN (SELECT p.id FROM produits p JOIN utilisateurs u ON p.client_id = u.id WHERE LOWER(u.email) = ANY($1))`,
    [allEmails]
  );
  await pool.query(
    `DELETE FROM produits WHERE client_id IN (SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1))`,
    [allEmails]
  );
  await pool.query(`DELETE FROM utilisateurs WHERE LOWER(email) = ANY($1)`, [allEmails]);
  console.log('0. Ancien compte démo nettoyé.');

  // 1. SQL — client + profil + abonnement + config + paiements + domaine
  const hash = await bcrypt.hash(PASSWORD, 10);
  const { rows: [u] } = await pool.query(
    `INSERT INTO utilisateurs (nom, email, mot_de_passe, telephone, role, actif, onboarding_step, activated_at, password_changed_at)
     VALUES ('Yasmine Bouaziz', $1, $2, '+216 71 942 118', 'client', true, 0, NOW(), NOW()) RETURNING id`,
    [EMAIL, hash]
  );
  const clientId = u.id;

  let domaineId;
  const dRes = await pool.query(`SELECT id FROM domaines_activite WHERE slug = 'restauration' LIMIT 1`);
  if (dRes.rows.length) domaineId = dRes.rows[0].id;
  else {
    const ins = await pool.query(`INSERT INTO domaines_activite (nom, slug) VALUES ('Restauration', 'restauration') RETURNING id`);
    domaineId = ins.rows[0].id;
  }

  await pool.query(
    `INSERT INTO profil_entreprise (client_id, nom, email, telephone, adresse, meme_activite, domaine_id, module_acheteurs_actif, module_acheteurs_activated_at)
     VALUES ($1, 'Dar Yasmine', $2, NULL, 'Rue des Orangers, Zone d''activités La Soukra, 2036 Ariana', false, $3, true, NOW())`,
    [clientId, EMAIL, domaineId]
  );
  await pool.query(`INSERT INTO client_domaines (client_id, domaine_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [clientId, domaineId]);

  const MENSUEL = 570; // 2 act premium avec labo (2×140) + labo 160 + gérant 80 + acheteurs palier 10 (50)
  const { rows: [abo] } = await pool.query(
    `INSERT INTO abonnements (client_id, statut_onboarding, montant_onboarding, date_debut, date_onboarding, mode_compte, invite_sent, contrat_accepte_le, notes)
     VALUES ($1, 'payé', 700, '2026-05-01', '2026-05-03', 'actif', true, NOW(), 'Compte démo vitrine — données fictives') RETURNING id`,
    [clientId]
  );
  const aboId = abo.id;
  await pool.query(
    `INSERT INTO abonnement_config (abonnement_id, nb_activites, nb_labos, nb_gerants, nb_acheteurs, formule_activites, montant_onboarding)
     VALUES ($1, 2, 1, 1, 10, 'premium', 700)`,
    [aboId]
  );
  for (const [mois, statut, datePaie] of [
    ['2026-05-01', 'payé', '2026-05-05'],
    ['2026-06-01', 'payé', '2026-06-04'],
    ['2026-07-01', 'en_attente', null],
  ]) {
    await pool.query(
      `INSERT INTO paiements (abonnement_id, mois, montant_dt, statut, date_paiement, date_saisie) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [aboId, mois, MENSUEL, statut, datePaie]
    );
  }
  console.log(`1. Client Dar Yasmine créé (id=${clientId}), abonnement premium + acheteurs palier 10.`);

  // 2. Login client
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD }, null);
  TOKEN = login.token;
  console.log('2. Login client OK.');

  // 3. Labo + activités (salon rattachée au labo, restaurant indépendant)
  const labo = await api('POST', '/api/labo', {
    nom: 'Cuisine centrale Dar Yasmine', refLabo: 'LAB-01', referentTel: '+216 71 942 119',
    adresse: "Rue des Orangers, Zone d'activités La Soukra, 2036 Ariana", activityIds: [],
  });
  const laboId = labo.id;
  const resto = await api('POST', '/api/entreprise/activites', {
    nom: 'Dar Yasmine — Le Restaurant', adresse: '12 avenue Habib Bourguiba, 2078 La Marsa', telephone: '+216 71 942 120', email: null,
  });
  const salon = await api('POST', '/api/entreprise/activites', {
    nom: 'Dar Yasmine — Salon de thé & Pâtisserie', adresse: 'Rue du Lac Turkana, Les Berges du Lac 1, 1053 Tunis', telephone: '+216 71 942 121', email: null, laboId,
  });
  const restoId = resto.id, salonId = salon.id;
  console.log(`3. Labo (${laboId}) + Restaurant (${restoId}, indépendant) + Salon (${salonId}, rattaché labo).`);

  // 4. SQL — gérant (restaurant) sans email d'invitation
  const gHash = await bcrypt.hash(PASSWORD, 10);
  const { rows: [g] } = await pool.query(
    `INSERT INTO utilisateurs (nom, email, mot_de_passe, telephone, role, actif, gerant_parent_id, gerant_activite_id, gerant_activite_type, gerant_est_gratuit, gerant_montant_mensuel, activated_at, password_changed_at)
     VALUES ('Mehdi Gharbi', $1, $2, '+216 71 942 122', 'gerant', true, $3, $4, 'activite', true, 0, NOW(), NOW()) RETURNING id`,
    [GERANT_EMAIL, gHash, clientId, restoId]
  );
  await pool.query(`INSERT INTO gerant_affectations (gerant_id, activite_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [g.id, restoId]);
  console.log('4. Gérant Mehdi Gharbi (restaurant) créé en SQL — aucun email.');

  // 5. Référentiel : unités, familles, catégories, articles
  const uniteIds = {};
  for (const nom of ['kg', 'L', 'pièce', 'botte']) {
    const r = await api('POST', '/api/unites', { nom });
    uniteIds[nom] = r.id;
  }
  const familleIds = {};
  for (const f of FAMILLES) {
    const r = await api('POST', '/api/familles', f);
    familleIds[f.nom] = r.id;
  }
  const catIds = {};
  for (const nom of CATEGORIES) {
    const fam = nom === 'Boissons' ? 'Boissons revendables' : nom === 'Emballages' ? 'Emballages' : 'Matières premières';
    const r = await api('POST', '/api/categories', { nom, familleId: familleIds[fam] });
    catIds[nom] = r.id;
  }
  const art = {}; // nom → { id, ...def }
  for (const a of ARTICLES) {
    const r = await api('POST', '/api/articles', { nom: a.nom, unitId: uniteIds[a.unite], categorieId: catIds[a.categorie] });
    art[a.nom] = { id: r.id, ...a };
  }
  console.log(`5. Référentiel : ${Object.keys(uniteIds).length} unités, ${FAMILLES.length} familles, ${CATEGORIES.length} catégories, ${ARTICLES.length} articles.`);

  // 6. Affectations : TOUT au labo (référentiel du salon) ; resto = ses articles avec prix TTC ;
  //    boissons valorisées aussi sélectionnées au salon (prérequis articles-valorisés)
  for (const a of Object.values(art)) {
    await api('POST', `/api/labo/${laboId}/ingredients/${a.id}/select`, {});
  }
  for (const a of Object.values(art)) {
    if (a.approResto || a.valorise) {
      await api('POST', `/api/entreprise/activites/${restoId}/ingredients/${a.id}/select`, { prixUnitaire: ttc(a.prixHT, a.tva) });
    }
    if (a.valorise) {
      await api('POST', `/api/entreprise/activites/${salonId}/ingredients/${a.id}/select`, { prixUnitaire: ttc(a.prixHT, a.tva) });
    }
  }
  console.log('6. Affectations labo + restaurant + valorisés salon.');

  // 7. Fournisseurs
  const fourIds = {};
  for (const f of FOURNISSEURS) {
    const r = await api('POST', '/api/entreprise/fournisseurs', { ...f, activiteIds: [restoId, salonId], laboIds: [laboId] });
    fourIds[f.nom] = r.id;
  }
  console.log('7. Fournisseurs créés.');

  // 8. Catégories produits typées + produits
  const catProd = {};
  for (const [nom, type] of [
    ['Pâtisseries', 'vendable'], ['Plats cuisinés', 'vendable'], ['Boissons chaudes', 'vendable'],
    ['Boissons fraîches', 'vendable'], ['Produits du labo', 'valorise'], ['Boissons & épicerie', 'valorise'],
  ]) {
    const r = await api('POST', '/api/categories-produit', { nom, typeProduit: type });
    catProd[nom] = r.id;
  }

  const prod = {}; // nom → id
  for (const s of SOUS_RECETTES) {
    const r = await api('POST', '/api/produits', {
      nom: s.nom, type: 'utilisable', origine: 'labo', laboIds: [laboId], activiteIds: [salonId],
      ingredients: s.ingredients.map(([n, q]) => ({ ingredientId: art[n].id, portion: q })), subProducts: [],
    });
    prod[s.nom] = r.id;
  }
  for (const p of PATISSERIES_LABO) {
    const r = await api('POST', '/api/produits', {
      nom: p.nom, type: 'vendable', origine: 'labo', categorieProduitId: catProd['Pâtisseries'],
      laboIds: [laboId], activiteIds: [salonId],
      ingredients: p.composition.filter(([, , t]) => t === 'art').map(([n, q]) => ({ ingredientId: art[n].id, portion: q })),
      subProducts: p.composition.filter(([, , t]) => t === 'sous').map(([n, q]) => ({ subProductId: prod[n], portion: q })),
    });
    prod[p.nom] = r.id;
  }
  for (const p of COMPOSES_LABO) {
    const r = await api('POST', '/api/produits', {
      nom: p.nom, type: 'vendable', origine: 'labo', categorieProduitId: catProd['Produits du labo'],
      laboIds: [laboId], activiteIds: [salonId],
      ingredients: p.composition.filter(([, , t]) => t === 'art').map(([n, q]) => ({ ingredientId: art[n].id, portion: q })),
      subProducts: p.composition.filter(([, , t]) => t === 'sous').map(([n, q]) => ({ subProductId: prod[n], portion: q })),
    });
    prod[p.nom] = r.id;
  }
  for (const p of PRODUITS_ACTIVITE) {
    const acts = p.acts.map((k) => (k === 'resto' ? restoId : salonId));
    const r = await api('POST', '/api/produits', {
      nom: p.nom, type: 'vendable', origine: 'activite', categorieProduitId: catProd[p.cat],
      activiteIds: acts, laboIds: [],
      ingredients: p.composition.map(([n, q]) => ({ ingredientId: art[n].id, portion: q })), subProducts: [],
    });
    prod[p.nom] = r.id;
  }
  console.log(`8. Produits : ${SOUS_RECETTES.length} sous-recettes, ${PATISSERIES_LABO.length} pâtisseries labo, ${COMPOSES_LABO.length} composés B2B, ${PRODUITS_ACTIVITE.length} produits d'activité.`);

  // 9. Appros hebdo (lundis) — labo, restaurant, salon (réfs facture par semaine/fournisseur)
  const lundis = datesBetween(START, END, 1);
  let nAppro = 0;
  for (let w = 0; w < lundis.length; w++) {
    const d = lundis[w];
    for (const a of Object.values(art)) {
      const ref = (four) => `FA-${four.slice(0, 2).toUpperCase()}-S${String(w + 1).padStart(2, '0')}`;
      if (a.approLabo) {
        await api('PUT', `/api/labo/${laboId}/stock/${a.id}`, {
          quantite: jitter(a.approLabo * 1.4), prixUnitaire: jitter(a.prixHT, 0.04), tauxTva: a.tva,
          dateAppro: d, fournisseurId: fourIds[a.fournisseur], refFacture: ref(a.fournisseur) + '-L',
        });
        nAppro++;
      }
      if (a.approResto) {
        await api('PUT', `/api/stock/entreprise/${restoId}/${a.id}`, {
          quantite: jitter(a.approResto * 1.3), prixUnitaire: jitter(a.prixHT, 0.04), tauxTva: a.tva,
          dateAppro: d, fournisseurId: fourIds[a.fournisseur], refFacture: ref(a.fournisseur) + '-R',
        });
        nAppro++;
      }
      if (a.approSalon) {
        await api('PUT', `/api/stock/entreprise/${salonId}/${a.id}`, {
          quantite: jitter(a.approSalon * 1.3), prixUnitaire: jitter(a.prixHT, 0.04), tauxTva: a.tva,
          dateAppro: d, fournisseurId: fourIds[a.fournisseur], refFacture: ref(a.fournisseur) + '-S',
        });
        nAppro++;
      }
    }
  }
  console.log(`9. ${nAppro} appros hebdo (labo + restaurant + salon).`);

  // 10. Production au labo (mardis) : sous-recettes puis pâtisseries/composés
  const mardis = datesBetween(START, END, 2);
  let nProd = 0;
  for (const d of mardis) {
    for (const s of SOUS_RECETTES) {
      await api('PUT', `/api/labo/${laboId}/stock/${-prod[s.nom]}`, { quantite: jitter(s.prodHebdo, 0.08), dateAppro: d });
      nProd++;
    }
    for (const p of [...PATISSERIES_LABO, ...COMPOSES_LABO]) {
      await api('PUT', `/api/labo/${laboId}/stock/${-prod[p.nom]}`, { quantite: Math.round(jitter(p.prodHebdo, 0.08)), dateAppro: d });
      nProd++;
    }
  }
  console.log(`10. ${nProd} productions labo (sous-recettes + pâtisseries + composés).`);

  // 11. Transferts labo → salon (jeudis) : pâtisseries + quelques plateaux, valorisés coût+10 %
  const jeudis = datesBetween(START, END, 4);
  for (let w = 0; w < jeudis.length; w++) {
    const transfers = [];
    for (const p of [...PATISSERIES_LABO, ...COMPOSES_LABO]) {
      if (!p.transfertHebdo) continue;
      transfers.push({
        activiteId: salonId, ingredientId: -prod[p.nom],
        quantite: Math.round(jitter(p.transfertHebdo, 0.1)),
        prixUnitaire: r3((p.prixVenteTTC / 1.07) * 0.55), // prix de cession HT ≈ 55 % du prix de vente
      });
    }
    await api('POST', `/api/labo/${laboId}/transfer`, {
      dateTransfert: jeudis[w], refFacture: `TR-2026-S${String(w + 1).padStart(2, '0')}`, tauxTva: 7,
      note: 'Livraison hebdomadaire salon', transfers,
    });
  }
  console.log(`11. ${jeudis.length} transferts hebdo labo → salon (facture de transfert).`);

  // 12. Config vente : prix TTC, valorisés, prestataires, charges
  const vendableIds = {}; // `${actId}:${type}:${id}` → UUID article_vendable
  const setVendable = async (actId, type, id, prix) => {
    const r = await api('POST', '/api/articles-vendables', { activite_id: actId, article_type: type, article_id: id, prix_vente: prix, portion: 1, actif: true });
    vendableIds[`${actId}:${type}:${id}`] = r.id;
    return r.id;
  };
  for (const p of PRODUITS_ACTIVITE) {
    for (const k of p.acts) await setVendable(k === 'resto' ? restoId : salonId, 'produit', prod[p.nom], p.prixVenteTTC);
  }
  for (const p of [...PATISSERIES_LABO, ...COMPOSES_LABO]) {
    if (p.transfertHebdo) await setVendable(salonId, 'produit', prod[p.nom], p.prixVenteTTC);
  }
  for (const a of Object.values(art).filter((x) => x.valorise)) {
    await api('PUT', `/api/articles-valorisables/${a.id}/categorie`, { categorie_produit_id: catProd['Boissons & épicerie'] });
    await setVendable(restoId, 'ingredient', a.id, a.prixVenteTTC);
    await setVendable(salonId, 'ingredient', a.id, a.prixVenteTTC);
  }

  // Prestataires (globaux, SQL — pas d'unique sur nom : chercher avant de créer)
  const prestIds = {};
  for (const [nom, commission, actId] of [['Jibli Express', 22, restoId], ['Wassalni Food', 18, salonId]]) {
    let pr = await pool.query(`SELECT id FROM prestataires_livraison WHERE nom = $1 LIMIT 1`, [nom]);
    const pid = pr.rows.length ? pr.rows[0].id : (await pool.query(`INSERT INTO prestataires_livraison (nom, actif) VALUES ($1, true) RETURNING id`, [nom])).rows[0].id;
    prestIds[nom] = pid;
    const link = await api('POST', '/api/activite-prestataires', { activite_id: actId, prestataire_id: pid, taux_commission: commission });
    // prix prestataire ≈ prix direct +15 % sur 3 produits phares de l'activité
    const phares = actId === restoId
      ? [['Couscous au poulet fermier', 21], ['Ojja merguez', 18], ['Salade méchouia', 10]]
      : [['Mille-feuille', 5.5], ['Tarte aux amandes', 6.7], ['Croissant au beurre', 3]];
    for (const [pn, prix] of phares) {
      const avId = vendableIds[`${actId}:produit:${prod[pn]}`];
      if (avId) await api('POST', '/api/article-prix-prestataire', { article_vendable_id: avId, activite_prestataire_id: link.id, prix_vente: prix });
    }
  }

  await api('POST', '/api/charges-fixes', { activite_id: restoId, mode: 'detail', loyer: 1600, charges_personnel: 4200, electricite_gaz: 550, eau: 130 });
  await api('POST', '/api/charges-fixes', { activite_id: salonId, mode: 'detail', loyer: 1200, charges_personnel: 2600, electricite_gaz: 400, eau: 90 });
  console.log('12. Config vente : prix, valorisés, 2 prestataires (+prix), charges fixes.');

  // 13. Ventes (ven/sam/dim + 1 vente prestataire hebdo par activité)
  const ventesJours = [...datesBetween(START, END, 5), ...datesBetween(START, END, 6), ...datesBetween(START, END, 0)].sort();
  const qte = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  let nVentes = 0;
  for (const d of ventesJours) {
    // Restaurant — plats + boissons + valorisés
    await api('POST', '/api/ventes', {
      activite_id: restoId, date_vente: d, type_vente: 'directe', prestataire_id: null,
      lignes: [
        { article_type: 'produit', article_id: prod['Couscous au poulet fermier'], quantite: qte(6, 14), prix_unitaire: 18 },
        { article_type: 'produit', article_id: prod['Ojja merguez'], quantite: qte(4, 10), prix_unitaire: 15.5 },
        { article_type: 'produit', article_id: prod['Salade méchouia'], quantite: qte(5, 12), prix_unitaire: 8.5 },
        { article_type: 'produit', article_id: prod["Jus d'orange frais"], quantite: qte(8, 18), prix_unitaire: 6 },
        { article_type: 'produit', article_id: prod['Café direct'], quantite: qte(15, 35), prix_unitaire: 3.8 },
        { article_type: 'ingredient', article_id: art['Eau minérale 0,5 L'].id, quantite: qte(10, 25), prix_unitaire: 1.5 },
      ],
    });
    // Salon — pâtisseries + boissons
    await api('POST', '/api/ventes', {
      activite_id: salonId, date_vente: d, type_vente: 'directe', prestataire_id: null,
      lignes: [
        { article_type: 'produit', article_id: prod['Mille-feuille'], quantite: qte(8, 18), prix_unitaire: 4.8 },
        { article_type: 'produit', article_id: prod['Tarte aux amandes'], quantite: qte(4, 9), prix_unitaire: 5.8 },
        { article_type: 'produit', article_id: prod['Croissant au beurre'], quantite: qte(15, 30), prix_unitaire: 2.5 },
        { article_type: 'produit', article_id: prod['Café direct'], quantite: qte(20, 40), prix_unitaire: 3.8 },
        { article_type: 'produit', article_id: prod['Thé à la menthe et amandes'], quantite: qte(10, 22), prix_unitaire: 4 },
        { article_type: 'produit', article_id: prod['Citronnade maison'], quantite: qte(6, 14), prix_unitaire: 4.5 },
        { article_type: 'ingredient', article_id: art['Boisson gazeuse 33 cl'].id, quantite: qte(6, 15), prix_unitaire: 3 },
      ],
    });
    nVentes += 2;
  }
  for (const d of datesBetween(START, END, 6)) {
    await api('POST', '/api/ventes', {
      activite_id: restoId, date_vente: d, type_vente: 'prestataire', prestataire_id: prestIds['Jibli Express'],
      lignes: [
        { article_type: 'produit', article_id: prod['Couscous au poulet fermier'], quantite: qte(3, 7), prix_unitaire: 21 },
        { article_type: 'produit', article_id: prod['Ojja merguez'], quantite: qte(2, 5), prix_unitaire: 18 },
      ],
    });
    await api('POST', '/api/ventes', {
      activite_id: salonId, date_vente: d, type_vente: 'prestataire', prestataire_id: prestIds['Wassalni Food'],
      lignes: [
        { article_type: 'produit', article_id: prod['Mille-feuille'], quantite: qte(4, 10), prix_unitaire: 5.5 },
        { article_type: 'produit', article_id: prod['Croissant au beurre'], quantite: qte(6, 15), prix_unitaire: 3 },
      ],
    });
    nVentes += 2;
  }
  console.log(`13. ${nVentes} ventes (directes + prestataires) sur ${ventesJours.length} jours.`);

  // 14. Pertes (vendredis, 2-3 lignes par site) + pertes labo
  let nPertes = 0;
  for (const d of datesBetween(START, END, 5)) {
    await api('POST', `/api/entreprise/activites/${restoId}/pertes`, { ingredientId: art['Tomates'].id, quantite: jitter(1.8), typePerte: 'avarie', datePerte: d });
    await api('POST', `/api/entreprise/activites/${restoId}/pertes`, { ingredientId: art['Poulet fermier entier'].id, quantite: jitter(1.2), typePerte: 'avarie', datePerte: d });
    await api('POST', `/api/entreprise/activites/${salonId}/pertes`, { ingredientId: -prod['Croissant au beurre'], quantite: qte(2, 6), typePerte: 'dechet', datePerte: d });
    await api('POST', `/api/labo/${laboId}/stock/${art['Lait demi-écrémé'].id}/perte`, { quantite: jitter(2.5), typePerte: 'avarie', datePerte: d });
    nPertes += 4;
  }
  console.log(`14. ${nPertes} pertes (restaurant, salon, labo).`);

  // 15. B2B : commandable, acheteurs (sans email), comptes portail SQL, offres
  await api('PUT', `/api/articles/${art['Amandes émondées'].id}`, { commandable: true });
  const created = await api('POST', '/api/acheteurs', { acheteurs: ACHETEURS });
  const achIds = created.acheteurs.map((a) => a.id);
  const pHash = await bcrypt.hash(PORTAIL_PASSWORD, 10);
  const achUserIds = [];
  for (let i = 0; i < ACHETEURS.length; i++) {
    const { rows: [au] } = await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, telephone, role, activated_at, actif)
       VALUES ($1, $2, $3, $4, 'acheteur', NOW(), true) RETURNING id`,
      [ACHETEURS[i].nom, ACHETEURS[i].email, pHash, ACHETEURS[i].telephone]
    );
    await pool.query(`UPDATE acheteurs SET user_id = $1, updated_at = NOW() WHERE id = $2`, [au.id, achIds[i]]);
    achUserIds.push(au.id);
  }
  for (const [nom, type, prixHT, tva] of OFFRES) {
    const articleId = type === 'produit' ? prod[nom] : art[nom].id;
    await api('POST', '/api/acheteurs/offres', { articleType: type, articleId, prixUnitaireHt: prixHT, tauxTva: tva, actif: true });
  }
  console.log(`15. ${ACHETEURS.length} acheteurs (+comptes portail SQL) et ${OFFRES.length} offres B2B.`);

  // 16. Ventes manuelles B2B (livrées) — factures fiscales
  await api('POST', '/api/acheteurs/ventes', {
    acheteurId: achIds[1], laboId, dateCommande: '2026-07-02', statut: 'livree',
    dateExpedition: '2026-07-03', dateLivraison: '2026-07-04', remisePct: 5, timbreFiscal: true,
    notes: 'Commande événement — livraison Gammarth',
    lignes: [
      { articleType: 'produit', articleId: prod['Plateau pâtisseries assorties (12 pièces)'], quantite: 6 },
      { articleType: 'produit', articleId: prod['Mille-feuille'], quantite: 40 },
    ],
  });
  await api('POST', '/api/acheteurs/ventes', {
    acheteurId: achIds[2], laboId, dateCommande: '2026-07-09', statut: 'livree',
    dateExpedition: '2026-07-10', dateLivraison: '2026-07-10', remisePct: 0, timbreFiscal: true,
    lignes: [
      { articleType: 'produit', articleId: prod['Sauce tomate maison — seau 5 kg'], quantite: 8 },
      { articleType: 'ingredient', articleId: art['Amandes émondées'].id, quantite: 5 },
    ],
  });
  console.log('16. 2 ventes manuelles B2B livrées (factures FA-2026-…).');

  // 17. Commandes PORTAIL aux 4 états (antidatées en SQL avant traitement)
  const portailLogin = async (i) => (await api('POST', '/auth/login', { email: ACHETEURS[i].email, password: PORTAIL_PASSWORD }, null)).token;
  const antidate = async (cmdId, d) => {
    await pool.query(`UPDATE commandes_acheteur SET date_commande = $1::date, created_at = $1::timestamptz WHERE id = $2`, [d, cmdId]);
    await pool.query(`UPDATE commande_acheteur_statuts SET date_effet = $1::date, created_at = $1::timestamptz WHERE commande_id = $2`, [d, cmdId]);
  };
  const tCafe = await portailLogin(0);
  const tHotel = await portailLogin(1);
  const tResto = await portailLogin(3);

  // livrée : Café El Medina
  const c1 = await api('POST', '/api/portail/commandes', {
    notes: 'Livraison avant 8h SVP', lignes: [
      { articleType: 'produit', articleId: prod['Croissant au beurre'], quantite: 60 },
      { articleType: 'produit', articleId: prod['Mille-feuille'], quantite: 20 },
    ],
  }, tCafe);
  await antidate(c1.id, '2026-07-08');
  await api('POST', `/api/acheteurs/commandes/${c1.id}/expedier`, { laboId, dateExpedition: '2026-07-09', timbreFiscal: true });
  await api('POST', `/api/acheteurs/commandes/${c1.id}/livrer`, { dateLivraison: '2026-07-09' });

  // expédiée : Hôtel Dar El Bhar (avec ajustement de ligne)
  const c2 = await api('POST', '/api/portail/commandes', {
    notes: 'Brunch du dimanche', lignes: [
      { articleType: 'produit', articleId: prod['Plateau pâtisseries assorties (12 pièces)'], quantite: 4 },
      { articleType: 'produit', articleId: prod['Tarte aux amandes'], quantite: 30 },
    ],
  }, tHotel);
  await antidate(c2.id, '2026-07-15');
  const c2d = await api('GET', `/api/acheteurs/commandes/${c2.id}`);
  await api('POST', `/api/acheteurs/commandes/${c2.id}/expedier`, {
    laboId, dateExpedition: '2026-07-16', timbreFiscal: true,
    quantites: [{ ligneId: c2d.lignes[1].id, quantite: 24 }],
  });

  // annulée : Restaurant Le Grand Bleu (motif visible portail)
  const c3 = await api('POST', '/api/portail/commandes', {
    lignes: [{ articleType: 'produit', articleId: prod['Pâte feuilletée — pâton 2 kg'], quantite: 25 }],
  }, tResto);
  await antidate(c3.id, '2026-07-12');
  await api('POST', `/api/acheteurs/commandes/${c3.id}/annuler`, { motif: 'Quantité indisponible cette semaine — reproposée la semaine prochaine' });

  // en attente : Café El Medina (récente, non traitée)
  const c4 = await api('POST', '/api/portail/commandes', {
    notes: 'Comme d\'habitude', lignes: [
      { articleType: 'produit', articleId: prod['Croissant au beurre'], quantite: 50 },
      { articleType: 'produit', articleId: prod['Sauce tomate maison — seau 5 kg'], quantite: 2 },
    ],
  }, tCafe);
  await antidate(c4.id, '2026-07-18');
  console.log('17. 4 commandes portail : livrée, expédiée (ligne ajustée), annulée (motif), en attente.');

  // 18. Inventaires EN DERNIER (baseline computeStockCourant) au 2026-07-18
  const invLabo = ['Farine pâtissière', 'Beurre pâtissier', 'Sucre blanc', 'Tomates', 'Amandes émondées', 'Lait demi-écrémé', "Huile d'olive extra vierge"]
    .map((n) => ({ ingredientId: art[n].id, quantiteReelle: jitter(30, 0.4), note: 'Inventaire cuisine centrale' }));
  invLabo.push({ ingredientId: -prod['Mille-feuille'], quantiteReelle: qte(10, 30) });
  invLabo.push({ ingredientId: -prod['Plateau pâtisseries assorties (12 pièces)'], quantiteReelle: qte(4, 10) });
  await api('POST', `/api/labo/${laboId}/inventaire`, { dateInventaire: END, entries: invLabo });

  const invResto = ['Tomates', 'Oignons', 'Pommes de terre', 'Poulet fermier entier', 'Semoule moyenne', 'Eau minérale 0,5 L']
    .map((n) => ({ ingredientId: art[n].id, quantiteReelle: jitter(15, 0.5), note: 'Inventaire restaurant' }));
  await api('POST', `/api/stock/entreprise/${restoId}/inventaire`, { dateInventaire: END, entries: invResto });

  const invSalon = ['Café en grains arabica', 'Lait demi-écrémé', 'Oranges à jus', 'Boisson gazeuse 33 cl']
    .map((n) => ({ ingredientId: art[n].id, quantiteReelle: jitter(12, 0.5), note: 'Inventaire salon' }));
  invSalon.push({ ingredientId: -prod['Mille-feuille'], quantiteReelle: qte(5, 15) });
  invSalon.push({ ingredientId: -prod['Croissant au beurre'], quantiteReelle: qte(8, 25) });
  await api('POST', `/api/stock/entreprise/${salonId}/inventaire`, { dateInventaire: END, entries: invSalon });
  console.log('18. Inventaires labo + restaurant + salon (18/07).');

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ✅ Compte démo « Dar Yasmine » prêt pour les captures !');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Client  : ${EMAIL} / ${PASSWORD}`);
  console.log(`  Gérant  : ${GERANT_EMAIL} / ${PASSWORD}`);
  console.log(`  Portail : ${ACHETEURS[0].email} / ${PORTAIL_PASSWORD} (idem +acheteur2..4)`);
  console.log(`  Labo ${laboId} · Restaurant ${restoId} · Salon ${salonId} · Abonnement ${aboId}`);
  console.log('══════════════════════════════════════════════════════════\n');
}

main()
  .then(() => pool.end())
  .catch(async (e) => { console.error('❌', e.message); await pool.end(); process.exit(1); });
