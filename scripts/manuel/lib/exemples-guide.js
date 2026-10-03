/* Lot 2c — exemples AVANT → APRÈS du guide de balisage, rendus par le vrai moteur (spec §7.7).
 *
 *   node scripts/manuel/lib/exemples-guide.js     imprime le tableau Markdown à recopier dans GUIDE-BALISAGE.md
 *
 * Données : lib/exemples-guide.json. Rendus : src/utils/vocab.js (serveur) ; Hôtellerie et Céramique = lexiques de
 * domaines.json, ÉCARTS résolus (R3.1.1) ; miroir = test/vocab-lexiques-test.json, résolu. Contrôlé par
 * scripts/manuel/test/guide.test.js. */
'use strict';
const path = require('path');
const { lireJson, lireOrigine, partieBalisee } = require('./commun');
const V = require('./vocabulaires');
const { rendre } = require(path.join(__dirname, '..', '..', '..', 'src', 'utils', 'vocab'));

const muet = () => {};

/** Texte d'origine d'une source (`manuel/<slug>`, `base/<fichier>`, `titre/<slug>`, `base-titre/<fichier>`) ;
 * null pour `partie` et `construit`. */
function texteSource(source, origine = lireOrigine()) {
  const [type, nom] = String(source).split('/');
  if (type === 'manuel') return (origine.fiches.find((f) => f.slug === nom) || {}).contenu ?? undefined;
  if (type === 'titre') return (origine.fiches.find((f) => f.slug === nom) || {}).titre ?? undefined;
  if (type === 'base') return (origine.entrees.find((e) => e.fichier === nom) || {}).contenu ?? undefined;
  if (type === 'base-titre') return (origine.entrees.find((e) => e.fichier === nom) || {}).titre ?? undefined;
  return null;
}

/** Exemples avec leurs rendus : défaut, hotellerie, ceramique, miroir, et `identique` (rendu par défaut = origine). */
function exemples() {
  const { exemples: liste } = lireJson(path.join(__dirname, 'exemples-guide.json'));
  const vocs = {
    hotellerie: V.vocabDuDomaine('hotellerie'),
    ceramique: V.vocabDuDomaine('ceramique'),
    miroir: V.vocabulairesEssai().miroir,
  };
  return liste.map((x) => {
    const defaut = rendre(V.vocabDefaut, x.balise, muet);
    return {
      ...x,
      defaut,
      identique: defaut === x.origine,
      hotellerie: rendre(vocs.hotellerie, x.balise, muet),
      ceramique: rendre(vocs.ceramique, x.balise, muet),
      miroir: rendre(vocs.miroir, x.balise, muet),
    };
  });
}

// Cellule de tableau Markdown : « | » échappé, balisé entre accents graves.
const cellule = (s) => String(s).replace(/\|/g, '\\|');
const code = (s) => `\`${cellule(s)}\``;

/** Tableau Markdown du guide (une ligne par exemple). */
function tableMarkdown(liste = exemples()) {
  const lignes = [
    '| # | Origine (source) | Balisé | Hôtellerie | Céramique | Miroir | Verdict |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const x of liste) {
    const verdict = x.verdict === 'faux'
      ? `**faux**${x.identique ? '' : ' (rendu par défaut ≠ origine)'} : ${x.note}`
      : `juste${x.identique ? '' : ' — ÉCART PAR DÉFAUT'} : ${x.note}`;
    lignes.push(`| ${x.id} | « ${cellule(x.origine)} » (${x.source}) | ${code(x.balise)} | ${cellule(x.hotellerie)} | ${cellule(x.ceramique)} | ${cellule(x.miroir)} | ${cellule(verdict)} |`);
  }
  return lignes.join('\n');
}

/** Tableau des 47 clés : formes par défaut (celles que cherche formesParDefaut), genre, élision, apposition, et
 * rendus Hôtellerie / Céramique (Nom, Pl, Court si différente). Une forme portée par deux clés est cherchée sous la
 * PREMIÈRE (ordre du lexique, spec §9.1) : la colonne « cherchée sous » le dit. */
function tableCles() {
  const H = V.vocabDuDomaine('hotellerie');
  const Ce = V.vocabDuDomaine('ceramique');
  const premiere = new Map();
  const lignes = [
    '| Clé | Défaut : Nom / Pl | Forme courte | Genre, élision | Apposition | Hôtellerie | Céramique |',
    '|---|---|---|---|---|---|---|',
  ];
  const formes = (v, k) => {
    const nom = `${v.Nom(k)} / ${v.Pl(k)}`;
    const court = v.Court(k) !== v.Nom(k) ? ` (court : ${v.Court(k)} / ${v.Court(k, true)})` : '';
    return nom + court;
  };
  for (const [k, e] of Object.entries(V.LEXIQUE_DEFAUT)) {
    const dejaPortees = [e.sg, e.pl, e.court && e.court.sg, e.court && e.court.pl].filter(Boolean)
      .filter((f) => premiere.has(f)).map((f) => `« ${f} » cherchée sous ${premiere.get(f)}`);
    for (const f of [e.sg, e.pl, e.court && e.court.sg, e.court && e.court.pl].filter(Boolean)) if (!premiere.has(f)) premiere.set(f, k);
    const court = e.court && e.court.sg ? `${e.court.sg} / ${e.court.pl || e.court.sg}` : '—';
    const derive = e.derive_de ? ` ; dérivée de ${e.derive_de} (${e.mode})` : '';
    lignes.push(`| \`${k}\` | ${cellule(`${e.sg} / ${e.pl}`)}${dejaPortees.length ? ` (${cellule(dejaPortees.join(', '))})` : ''} | ${cellule(court)} | ${e.g}${e.el ? ', élision' : ''}${derive} | ${e.appo ? 'oui' : ''} | ${cellule(formes(H, k))} | ${cellule(formes(Ce, k))} |`);
  }
  return lignes.join('\n');
}

// Aide-mémoire de la grammaire (lot-2-spec §2.2) : balise, usage ; rendus calculés.
const AIDE = [
  ['[[nom:labo]]', 'nom seul, en minuscules'],
  ['[[nom:labo:pl]]', 'pluriel : argument `pl`'],
  ['[[Nom:labo]]', 'forme stockée (majuscule initiale) : début de phrase, titre, nom d\'écran'],
  ['[[Pl:activite]]', 'pluriel, forme stockée'],
  ['[[Titre:pt]]', 'chaque mot à majuscule, seulement si l\'origine l\'écrit ainsi'],
  ['[[MAJ:labo]]', 'capitales'],
  ['[[court:pt]]', 'forme courte ou sigle, seulement là où l\'origine l\'écrit (R7.1.5)'],
  ['[[Court:appro]]', 'forme courte, forme stockée ; second nom d\'un nom d\'écran (« Stock Labo »)'],
  ['[[le:labo]]', 'déterminant + nom (aussi `un`, `du`, `de`, `au`, `ce`, `votre`, `mon`, `son`, `nouveau`)'],
  ['[[Le:activite]]', 'déterminant à majuscule : `Le`, `Un`, `Du`, `De`, `Au`, `Ce`, `Votre`, `Mon`, `Son`, `Nouveau`'],
  ['[[le:labo:pl:Nom]]', 'nombre et casse, dans n\'importe quel ordre'],
  ['[[du:activite]]', 'du, de la, de l\', des'],
  ['[[de:appro]]', 'de, d\' : l\'élision est faite par le moteur (R7.1.2)'],
  ['[[au:labo]]', 'au, à la, à l\', aux'],
  ['[[ce:article]]', 'ce, cet, cette, ces'],
  ['[[votre:activite:pl]]', 'votre, vos'],
  ['[[son:recette]]', 'son, sa, ses (mon, ma, mes)'],
  ['[[nouveau:article]]', 'nouveau, nouvel, nouvelle'],
  ['[[aucun:labo]]', 'singulier seulement (casse possible : `[[aucun:labo:Nom]]`)'],
  ['[[tous:labo:les]]', 'tous / toutes + `les`, `vos`, `ces`, `mes` (ou `nu`)'],
  ['[[det:labo:du]]**[[nom:labo]]**', 'déterminant SEUL, collé au gras, à un libellé de lien ou à `MAJ` qui suit (§7.4)'],
  ['[[acc:labo:créé:créée]]', 'accord masc:fem (un argument peut être vide)'],
  ['[[acc:labo:créé:créée:pl]]', 'accord au pluriel'],
  ['[[compl:labo]]', 'apposition dans une phrase (« le stock labo », R7.1.4) : clés à apposition seulement'],
  ['[[compl:stock]]', 'sans apposition, `compl` écrit « du X » : jamais pour reproduire « stock » seul'],
  ['[[avecCourt:pt:pl]]', '« X (SIGLE) » (§7.5)'],
  ['[[n:labo:3]]', 'nombre + nom'],
];

/** Aide-mémoire : balise, rendu par défaut, Hôtellerie, miroir, usage. */
function tableAide() {
  const H = V.vocabDuDomaine('hotellerie');
  const M = V.vocabulairesEssai().miroir;
  const lignes = ['| Balise | Défaut | Hôtellerie | Miroir | Usage |', '|---|---|---|---|---|'];
  for (const [b, usage] of AIDE) {
    const r = (v) => `« ${cellule(rendre(v, b, muet))} »`;
    lignes.push(`| ${code(b)} | ${r(V.vocabDefaut)} | ${r(H)} | ${r(M)} | ${usage} |`);
  }
  return lignes.join('\n');
}

// Tableaux du guide entre deux marques (régénérés par --guide, par exemple après une correction des lexiques).
const MARQUES = {
  aide: ['<!-- debut:table-aide (node scripts/manuel/lib/exemples-guide.js --guide) -->', '<!-- fin:table-aide -->', tableAide],
  exemples: ['<!-- debut:table-exemples (node scripts/manuel/lib/exemples-guide.js --guide) -->', '<!-- fin:table-exemples -->', tableMarkdown],
  cles: ['<!-- debut:table-cles (node scripts/manuel/lib/exemples-guide.js --guide) -->', '<!-- fin:table-cles -->', tableCles],
};

/** Texte du guide avec ses deux tableaux régénérés (marques absentes : erreur). */
function guideAJour(texte) {
  let t = texte;
  for (const [nom, [debut, fin, table]] of Object.entries(MARQUES)) {
    const i = t.indexOf(debut);
    const j = t.indexOf(fin);
    if (i < 0 || j < i) throw new Error(`GUIDE-BALISAGE.md : marques du tableau « ${nom} » absentes`);
    t = `${t.slice(0, i + debut.length)}\n${table()}\n${t.slice(j)}`;
  }
  return t;
}

module.exports = { exemples, tableMarkdown, tableCles, tableAide, guideAJour, texteSource, cellule, partieBalisee };

if (require.main === module) {
  if (process.argv.includes('--guide')) {
    const { DOSSIER, lireTexte, ecrireTexte } = require('./commun');
    const fichier = path.join(DOSSIER, 'GUIDE-BALISAGE.md');
    ecrireTexte(fichier, guideAJour(lireTexte(fichier)));
    process.stdout.write('GUIDE-BALISAGE.md : tableaux régénérés\n');
  } else {
    process.stdout.write(process.argv.includes('--cles') ? `${tableCles()}\n` : `${tableMarkdown()}\n`);
  }
}
