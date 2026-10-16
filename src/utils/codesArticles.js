// D3 (16/10/2026) : code des articles par catégorie — labflow-reprise/PLAN-DOMAINES-ACHETEURS-CODES.md §2 ligne D3,
// réponses du client du 15/10 (« plutôt par catégorie, attention à la confusion »).
//   • chaque catégorie (d'articles ou de produits) porte un PRÉFIXE de 2 à 4 lettres ou chiffres, unique dans le compte
//     entre toutes les catégories des deux sortes (FAR pour « Farines », GAT pour « Gâteaux ») ; ART et PRD sont
//     réservés aux articles et produits sans catégorie ;
//   • chaque article porte un CODE unique dans le compte (articles et références de produits confondus), proposé
//     « PRÉFIXE-0001 », « PRÉFIXE-0002 »… et modifiable ; un article qui change de catégorie garde son code.
// Module PUR : la base est consultée par src/services/codesArticlesService.js.
const PREFIXE_RE = /^[A-Z0-9]{2,4}$/;
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,19}$/;
const RESERVES = Object.freeze(['ART', 'PRD']);
const PREFIXE_SANS_CATEGORIE = Object.freeze({ article: 'ART', produit: 'PRD' });

// Lettres et chiffres d'un nom, sans accent, en majuscules (« Pâtes & riz » → « PATESRIZ »).
const lettresDe = (nom) => String(nom ?? '').replace(/[Œœ]/g, 'OE').replace(/[Ææ]/g, 'AE').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Préfixe de départ d'un nom : ses 3 premières lettres (complétées par X s'il en a moins de 2).
const prefixeDe = (nom) => lettresDe(nom).padEnd(2, 'X').slice(0, 3);

// Candidats dans l'ordre : 3 lettres, 4 lettres, 3 lettres + un chiffre (2 à 9), 2 lettres + deux chiffres (10 à 99).
function* candidatsPrefixe(nom) {
  const l = lettresDe(nom).padEnd(2, 'X');
  yield l.slice(0, 3);
  if (l.length >= 4) yield l.slice(0, 4);
  for (let k = 2; k <= 9; k++) yield `${l.slice(0, 3)}${k}`;
  for (let k = 10; k <= 99; k++) yield `${l.slice(0, 2)}${k}`;
}

// Premier candidat qui n'est ni pris ni réservé ; null si tout est pris (plus de cent catégories au même nom).
const prefixeLibre = (nom, pris = []) => {
  const occupe = new Set([...pris, ...RESERVES].map((p) => String(p ?? '').toUpperCase()));
  for (const c of candidatsPrefixe(nom)) if (!occupe.has(c)) return c;
  return null;
};

const normaliserPrefixe = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
const normaliserCode = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '-');

// Prochain code « PRÉFIXE-NNNN » : un de plus que le plus grand numéro déjà porté par ce préfixe (4 chiffres au moins).
const prochainCode = (prefixe, codesPris = []) => {
  const re = new RegExp(`^${prefixe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d{1,6})$`);
  let max = 0;
  for (const c of codesPris) {
    const m = re.exec(String(c ?? '').trim().toUpperCase());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefixe}-${String(max + 1).padStart(4, '0')}`;
};

// « FAR-0012 Farine » ; le nom seul sans code.
const libelleAvecCode = (code, nom) => (code ? `${code} ${nom}` : String(nom ?? ''));

module.exports = {
  PREFIXE_RE, CODE_RE, RESERVES, PREFIXE_SANS_CATEGORIE,
  lettresDe, prefixeDe, candidatsPrefixe, prefixeLibre, normaliserPrefixe, normaliserCode, prochainCode, libelleAvecCode,
};
