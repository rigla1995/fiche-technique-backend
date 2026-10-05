// Matricule fiscal tunisien : normalisation et contrôle de forme (lot 3, spec docs/lot-3-spec.md §1.3).
// Copie écran : fiche-technique-frontend/src/components/admin/matriculeFiscal.ts — mêmes vecteurs de test
// (test/matricule-fiscal-vecteurs.json, recopié dans scripts/ du frontend).
//
// Structure : identifiant (7 chiffres) + clé de contrôle (lettre) / code TVA / code catégorie / n° d'établissement
// (3 chiffres) — « 1234567A/A/M/000 ». Un auto-entrepreneur n'a souvent que « 1234567A ».
// La formule de la clé n'est pas publique : on contrôle la FORME, jamais la clé elle-même.
// Vide autorisé (aucun document n'imprime « à compléter » : la ligne est omise).

const MODELE = /^\d{7}[A-Z]?(\/[A-Z]\/[A-Z]\/\d{3})?$/;
// Libellé parfois collé devant la valeur (« MF : », « M.F. », « Matricule fiscal : ») : retiré (cf. stripMfLabel de generate.js).
const LIBELLE = /^\s*(matricule\s+fiscal|m\.?\s?f\.?)\s*:?\s*/i;
// Six chiffres seulement : zéro de tête perdu (copie depuis un tableur) — message dédié.
const SIX_CHIFFRES = /^\d{6}[A-Z]?(\/[A-Z]\/[A-Z]\/\d{3})?$/;

// Majuscules, espaces / points / tirets / soulignés retirés ; barres reconstruites si les blocs sont collés
// ou séparés autrement (« 1234567AAM000 », « 1234567/A/A/M/000 », « 1234567 A/A/M/000 » → « 1234567A/A/M/000 »).
// Une saisie qui ne ressemble à aucune forme connue est rendue telle quelle (compactée) : le contrôle la refusera.
const normaliserMatriculeFiscal = (brut) => {
  if (brut == null) return '';
  const s = String(brut).replace(LIBELLE, '').toUpperCase().replace(/[\s.\-_]/g, '');
  if (!s) return '';
  const compact = s.replace(/\//g, '');
  let m = compact.match(/^(\d{7})([A-Z])([A-Z])([A-Z])(\d{3})$/);
  if (m) return `${m[1]}${m[2]}/${m[3]}/${m[4]}/${m[5]}`;
  m = compact.match(/^(\d{7})([A-Z])([A-Z])(\d{3})$/);
  if (m) return `${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
  m = compact.match(/^(\d{7})([A-Z]?)$/);
  if (m) return `${m[1]}${m[2]}`;
  return s;
};

// { ok, valeur (normalisée, '' si vide), erreur?, avertissement? }
const controlerMatriculeFiscal = (brut) => {
  const valeur = normaliserMatriculeFiscal(brut);
  if (!valeur) return { ok: true, valeur: '' };
  if (SIX_CHIFFRES.test(valeur)) {
    return { ok: false, valeur, erreur: 'Matricule fiscal invalide : 7 chiffres attendus avant la lettre de clé (un zéro de tête manque-t-il ?)' };
  }
  if (!MODELE.test(valeur)) {
    return { ok: false, valeur, erreur: 'Matricule fiscal invalide (exemples : 1234567A/A/M/000 ou 1234567A)' };
  }
  if (!/^\d{7}[A-Z]/.test(valeur)) {
    return { ok: true, valeur, avertissement: 'Matricule fiscal sans lettre de clé (1234567A…) : à vérifier sur la patente' };
  }
  return { ok: true, valeur };
};

// Matricule d'un ACHETEUR (carnet d'un compte — lot 3, étape 8, spec §1.3) : remis au même format quand il en a
// la forme, pour que ses factures n'en impriment pas deux ; JAMAIS refusé — une saisie qui ne ressemble à aucune
// forme connue est gardée telle qu'elle a été tapée (rognée, et bornée à la taille de la colonne : au-delà de
// 50 caractères la base refusait la fiche, le lot ou le fichier d'import entier par une erreur 500). Vide → null.
const MAX_MATRICULE_ACHETEUR = 50; // acheteurs.matricule_fiscal VARCHAR(50)
const matriculeAcheteur = (brut) => {
  const saisi = String(brut || '').trim();
  if (!saisi) return null;
  const normalise = normaliserMatriculeFiscal(saisi);
  return MODELE.test(normalise) ? normalise : saisi.slice(0, MAX_MATRICULE_ACHETEUR).trim();
};

module.exports = { normaliserMatriculeFiscal, controlerMatriculeFiscal, matriculeAcheteur, MODELE_MATRICULE_FISCAL: MODELE };
