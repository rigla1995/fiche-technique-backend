#!/usr/bin/env node
// Lots du balayage 2b du serveur (spec docs/lot-2b-spec.md §3.1, §10.1) — `node scripts/vocab-lots.mjs [--json] [<lot>]`
//
// SOURCE UNIQUE de la répartition : la table LOTS ci-dessous (propriété exclusive PAR FICHIER : un fichier = un lot,
// écart assumé à la décision 11 de REPRISE §4). Le socle (étapes O, S0, S1, S2) passe avant les vagues et peut
// toucher tous les fichiers ; pendant une vague, ses fichiers ne sont écrits que par l'intégrateur.
// La charge d'un lot = unités que le mode `residuels` de l'outil de preuve (fiche-technique-frontend/scripts/
// vocab-check.mjs, lancé sur ce dépôt) signale dans ses fichiers, écarts admis de scripts/vocab-allow/ déjà
// appliqués — RECALCULÉE à chaque passage, jamais recopiée — plus les unités hors outil déclarées (HORS_OUTIL).
//   sans argument : table des lots (vague, charge, fichiers) ;
//   <lot>         : les fichiers du lot, un par ligne (chemins relatifs au dépôt, prêts pour vocab-check) ;
//   --json        : [{ lot, vague, charge, horsOutil, fichiers: [{ fichier, charge }] }].
// Code de sortie 1 si un fichier à résidus n'appartient à aucun lot ou à deux lots, ou si un fichier listé
// n'existe pas (hors fichiers à créer par le socle, A_CREER) ; 2 si l'outil de preuve est introuvable.
// L'outil vit dans le dépôt frontend : variable LABFLOW_FRONT, sinon ../fiche-technique-frontend. Node ≥ 23.6.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const DEPOT_BACK = path.resolve(ICI, '..');
const C = 'src/controllers/';
const S = 'src/services/';

// Spec §10.1. `socle` : fichiers que seuls le socle puis l'intégrateur écrivent (§10.1, « Socle seulement »).
export const LOTS = {
  socle: ['src/app.js', 'src/middleware/rendreMessages.js', 'src/middleware/auth.js', 'src/utils/vocab.js',
    'src/config/lexiqueDefaut.js', 'src/utils/vocabCompte.js', 'src/utils/excelNoms.js', 'src/utils/lexiqueValidation.js',
    `${S}domaineProfilService.js`, `${C}domainesController.js`],
  B3a: [`${C}laboController.js`],
  B3b: [`${C}produitsController.js`, `${C}produitTransformeController.js`, `${C}exportController.js`,
    `${C}categoriesProduitController.js`, `${C}unitesOperationnellesController.js`,
    `${S}transfertService.js`, `${S}unitesOperationnellesService.js`, 'src/routes/produits.js'],
  B4: [`${C}stockController.js`, `${C}inventaireController.js`, `${C}pertesController.js`, `${C}ventesController.js`,
    `${C}dashboardV2Controller.js`, `${C}dashboardController.js`, `${C}rapportsController.js`, `${C}gerantDashboardController.js`,
    'src/utils/stockUtils.js', `${S}stockService.js`],
  B5: [`${C}entrepriseController.js`, `${C}gerantController.js`, `${C}acheteursController.js`, `${C}acheteurVentesController.js`,
    `${C}portailController.js`, `${C}fournisseurController.js`, `${C}articlesController.js`, `${C}referentielController.js`,
    `${C}categoriesController.js`, `${C}unitesController.js`, `${C}famillesController.js`,
    `${S}quotaService.js`, `${S}configComposantsService.js`],
  B1: [`${S}aiService.js`, `${S}aiToolHandlers.js`, `${S}aiFormatter.js`, `${S}onboardingEtat.js`, `${S}clientConfigService.js`,
    `${S}messengerService.js`, `${S}reportService.js`, `${C}aiAssistantController.js`, `${C}aiKnowledgeController.js`],
  B2: [`${S}emailService.js`, `${S}pdfService.js`, `${S}contractPdfService.js`, `${S}factureApproPdf.js`, `${S}factureAcheteurPdf.js`,
    `${S}docusealService.js`, 'docuseal-templates/generate.js', 'docuseal-templates/CHAMPS.md',
    `${C}clientsController.js`, `${C}abonnementController.js`, `${C}supportController.js`, `${C}webhookController.js`,
    `${C}authController.js`, `${C}facturesController.js`],
};
// Vague de chaque lot (§1, §10.1) ; B6 (écrans) est au frontend.
export const VAGUES = { socle: 0, B3a: 1, B3b: 1, B4: 1, B5: 1, B1: 2, B2: 2 };
// Fichiers que le socle CRÉE (étape S2) : absents avant, ce n'est pas une erreur.
export const A_CREER = new Set(['src/middleware/rendreMessages.js', 'src/utils/excelNoms.js']);
// Unités hors outil déclarées (§10.1, colonne « Charge ») : ce que le mode residuels ne compte pas.
export const HORS_OUTIL = {
  B4: [{ quoi: 'refonte du tableau de bord v2 : codes site_type, préfixes, lCanal(n) (§9)' }],
  B5: [{ quoi: 'lecteur du référentiel : en-têtes du domaine, par défaut, ou repérés (§6.3)' }],
  B1: [{ quoi: 'glossaire « Vocabulaire du compte » du prompt (§7.3)' }, { quoi: 'chaînes du guide de mise en route rendues en JS (§7.4)', unites: 57 }],
  B2: [{ quoi: 'pdfTexte au serveur, en option (§8.3)' }],
};

async function outil() {
  const front = path.resolve(process.env.LABFLOW_FRONT || path.join(DEPOT_BACK, '..', 'fiche-technique-frontend'));
  const f = path.join(front, 'scripts', 'vocab-check.mjs');
  if (!fs.existsSync(f)) throw Object.assign(new Error(`outil de preuve introuvable : ${f} (LABFLOW_FRONT ?)`), { code: 2 });
  return import(pathToFileURL(f).href);
}

/** Charge par lot, mesurée maintenant : { lots: [{ lot, vague, charge, horsOutil, fichiers }], problemes, infos }. */
export async function mesurer(root = DEPOT_BACK) {
  const { modeResiduels, chargerAllow, chargerRendu } = await outil();
  const allow = chargerAllow(path.join(root, 'scripts', 'vocab-allow'));
  const rendu = chargerRendu(root);
  const problemes = [...allow.problemes, ...rendu.problemes];
  const infos = [];
  const { parFichier } = modeResiduels({ root, fichiers: [], entrees: allow.entrees, rendu: rendu.points });
  const proprietaire = new Map();
  for (const [lot, fichiers] of Object.entries(LOTS)) {
    for (const f of fichiers) {
      if (!fs.existsSync(path.join(root, f))) (A_CREER.has(f) ? infos : problemes).push(`${lot} : ${f} n'existe pas${A_CREER.has(f) ? ' (à créer par le socle)' : ''}`);
      if (proprietaire.has(f)) problemes.push(`${f} : dans ${proprietaire.get(f)} et dans ${lot}`);
      proprietaire.set(f, lot);
    }
  }
  for (const [f, n] of Object.entries(parFichier)) if (!proprietaire.has(f)) problemes.push(`${f} : ${n} unité(s), aucun lot`);
  const lots = Object.entries(LOTS).map(([lot, fichiers]) => {
    const detail = fichiers.map((fichier) => ({ fichier, charge: parFichier[fichier] ?? 0 }));
    return { lot, vague: VAGUES[lot], charge: detail.reduce((n, x) => n + x.charge, 0), horsOutil: HORS_OUTIL[lot] ?? [], fichiers: detail };
  });
  return { lots, problemes, infos };
}

const horsOutilTexte = (h) => h.map((x) => (x.unites ? `${x.unites} ${x.quoi}` : x.quoi)).join(' + ');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const demande = args.find((a) => !a.startsWith('--'));
  if (demande) {
    if (!LOTS[demande]) { console.error(`lot inconnu : ${demande} (${Object.keys(LOTS).join(', ')})`); process.exit(2); }
    console.log(LOTS[demande].join('\n'));
  } else {
    let r;
    try { r = await mesurer(); } catch (e) { console.error(`vocab-lots : ${e.message}`); process.exit(e.code === 2 ? 2 : 1); }
    const { lots, problemes, infos } = r;
    if (args.includes('--json')) console.log(JSON.stringify(lots, null, 2));
    else {
      for (const l of lots) {
        const nom = (f) => path.basename(f).replace(/\.(?:js|md)$/, '');
        console.log(`${l.lot.padEnd(5)} v${l.vague} ${String(l.charge).padStart(4)}${l.horsOutil.length ? ` + ${horsOutilTexte(l.horsOutil)}` : ''}`);
        console.log(`        ${l.fichiers.map((x) => `${nom(x.fichier)} ${x.charge}`).join(', ')}`);
      }
      console.log(`total ${lots.reduce((n, l) => n + l.charge, 0)} unité(s) de l'outil, ${lots.reduce((n, l) => n + l.fichiers.length, 0)} fichier(s), ${lots.length} lots`);
    }
    infos.forEach((i) => console.error(`info ${i}`));
    problemes.forEach((p) => console.error(`PROBLÈME ${p}`));
    process.exit(problemes.length ? 1 : 0);
  }
}
