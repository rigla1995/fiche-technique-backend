/* Migration de MAINTENANCE du manuel et de la base de connaissances, après le lot 2c (scripts/VOCAB-GUIDE-SERVEUR.md §9,
 * docs/lot-2c-spec.md §12.5). Première du genre : la 198 (lot 3, étape 5 — plus de contrat ni d'avenant).
 *
 *   node scripts/manuel/generer-maintenance.mjs <numéro>             contrôle, puis écrit migrations/<nom>.sql
 *   node scripts/manuel/generer-maintenance.mjs <numéro> --verifier  contrôle seulement ; le fichier de migrations/, s'il
 *                                                                    existe, doit être celui que l'outil écrirait
 *   node scripts/manuel/generer-maintenance.mjs <numéro> --ecraser   réécrit un fichier existant (JAMAIS une migration
 *                                                                    déjà déployée : elle est immuable)
 *
 * Source : scripts/manuel/revisions.json (la migration <numéro>) et les textes balisés courants de balise/manuel/,
 * balise/base/ et variantes/. Le SQL suit le modèle de la 194 :
 *   • texte balisé entier en dollar-quoting, étiquette sans tiret ;
 *   • fiche : UPDATE gardé par le md5 (sans \r) de COALESCE(contenu_defaut, contenu) = « md5Avant » ; contenu remplacé
 *     seulement s'il égale encore contenu_defaut (une fiche retouchée dans l'admin garde sa retouche : le compte rendu
 *     la nomme, son texte servi est à corriger dans l'admin) ; titre gardé par égalité exacte, et changé seulement si
 *     le texte par défaut est bien celui de la migration ; updated_at, mots_cles, icone jamais écrits ;
 *   • base : clé lower(titre), garde = md5 du contenu ;
 *   • variante : seul un BROUILLON jamais retouché (md5 du contenu = « md5Avant ») est mis à jour, et seulement si le
 *     texte commun de la fiche est bien celui de cette migration ; base_md5 reprend alors ce texte commun. Une variante
 *     validée ou retouchée n'est jamais touchée : l'admin la montre « à revoir » ;
 *   • idempotente (2e passage : tout « déjà fait ») ; NOTICE de compte rendu.
 *
 * Refus (rien n'est écrit) : numéro absent de revisions.json ; texte courant ≠ « md5 » ; « md5Avant » qui n'est ni le
 * « md5 » de la révision précédente, ni le texte écrit par 194 / 195 / 196, ni (fiche sans terme, non écrite par la
 * 194) le md5Garde de l'origine ; titre courant ≠ « titre » ; fichier de migration déjà présent et différent.
 * Codes de sortie : 0 écrit ou vérifié ; 1 contrôle en échec ; 2 refus d'usage. */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { lit, etiquette, dollar } from './generer-migrations.mjs';

const require = createRequire(import.meta.url);
const C = require('./lib/commun.js');

const MIGRATIONS = path.join(C.RACINE, 'migrations');
const REVISIONS = path.join(C.DOSSIER, 'revisions.json');

export const lireRevisions = (fichier = REVISIONS) => (fs.existsSync(fichier) ? C.lireJson(fichier) : { slugsDomaine: {}, migrations: [] });

/** Texte entre les deux premières étiquettes de dollar-quoting qui suivent le commentaire « -- ── <titre> ── ». */
function texteDuBloc(sql, titre) {
  const i = sql.indexOf(`  -- ── ${titre} ──\n`);
  if (i < 0) return null;
  const m = /(\$[A-Za-z_][A-Za-z0-9_]*\$)/.exec(sql.slice(i));
  if (!m) return null;
  const debut = i + m.index + m[1].length;
  const fin = sql.indexOf(m[1], debut);
  return fin < 0 ? null : sql.slice(debut, fin);
}
const lireMigration = (prefixe) => {
  const nom = fs.readdirSync(MIGRATIONS).find((f) => f.startsWith(`${prefixe}_`));
  return nom ? C.lireTexte(path.join(MIGRATIONS, nom)) : '';
};

/** md5 attendus en base avant la migration `rev` : révision précédente, sinon texte de 194 / 195 / 196, sinon origine. */
function md5Attendus(revisions, rev) {
  const avant = revisions.migrations.filter((m) => m.numero < rev.numero).sort((a, b) => a.numero - b.numero);
  const dernier = (liste, egal) => { let r = null; for (const m of avant) for (const x of m[liste] || []) if (egal(x)) r = x.md5; return r; };
  const sql194 = lireMigration('194');
  const sql195 = lireMigration('195');
  const sql196 = lireMigration('196');
  const { fiches } = C.lireOrigine();
  return {
    manuel(x) {
      const p = dernier('manuel', (y) => y.slug === x.slug);
      if (p) return p;
      const t = texteDuBloc(sql194, x.slug);
      if (t !== null) return C.md5(t);
      const o = fiches.find((f) => f.slug === x.slug);
      return o ? o.md5Garde : null; // fiche sans terme : la 194 ne l'a pas écrite
    },
    base(x) {
      const p = dernier('base', (y) => y.fichier === x.fichier);
      if (p) return p;
      const t = texteDuBloc(sql195, x.cle);
      return t === null ? null : C.md5(t);
    },
    variante(x, slugDomaine) {
      const p = dernier('variantes', (y) => y.domaine === x.domaine && y.slug === x.slug);
      if (p) return p;
      const t = texteDuBloc(sql196, `${slugDomaine} / ${x.slug}`);
      return t === null ? null : C.md5(t);
    },
  };
}

/** Contrôle la révision contre les fichiers courants. Rend { refus: [], textes } (textes balisés à écrire). */
export function controler(revisions, numero) {
  const refus = [];
  const rev = revisions.migrations.find((m) => m.numero === numero);
  if (!rev) return { refus: [`migration ${numero} absente de revisions.json`], rev: null, textes: null };
  if (!/^\d+_[a-z0-9_]+\.sql$/.test(rev.nom || '') || !rev.nom.startsWith(`${numero}_`)) refus.push(`« nom » invalide : ${rev.nom}`);
  const attendus = md5Attendus(revisions, rev);
  const textes = { manuel: new Map(), base: new Map(), variantes: new Map() };
  const verifier = (quoi, x, md, attendu) => {
    if (C.md5(md) !== x.md5) refus.push(`${quoi} : md5 du texte courant ${C.md5(md)} ≠ « md5 » ${x.md5} de revisions.json`);
    if (x.md5Avant === x.md5) refus.push(`${quoi} : « md5Avant » = « md5 » (rien à écrire)`);
    if (attendu === null) refus.push(`${quoi} : texte précédent introuvable (ni révision, ni migration du lot 2c)`);
    else if (attendu !== x.md5Avant) refus.push(`${quoi} : « md5Avant » ${x.md5Avant} ≠ md5 du texte précédent ${attendu}`);
  };
  for (const x of rev.manuel || []) {
    const md = C.lireTexte(path.join(C.CHEMINS.baliseManuel, `${x.slug}.md`));
    const json = C.lireJson(path.join(C.CHEMINS.baliseManuel, `${x.slug}.json`));
    verifier(`fiche ${x.slug}`, x, md, attendus.manuel(x));
    if ((x.titre === undefined) !== (x.titreAvant === undefined)) refus.push(`fiche ${x.slug} : « titre » et « titreAvant » vont ensemble`);
    if (x.titre !== undefined && json.titre !== x.titre) refus.push(`fiche ${x.slug} : titre courant « ${json.titre} » ≠ « titre » « ${x.titre} »`);
    textes.manuel.set(x.slug, md);
  }
  for (const x of rev.base || []) {
    const md = C.lireTexte(path.join(C.CHEMINS.baliseBase, `${x.fichier}.md`));
    const json = C.lireJson(path.join(C.CHEMINS.baliseBase, `${x.fichier}.json`));
    verifier(`entrée ${x.fichier}`, x, md, attendus.base(x));
    if (json.cle !== x.cle || json.titre !== x.titre) refus.push(`entrée ${x.fichier} : « cle » ou « titre » ≠ balise/base/${x.fichier}.json`);
    textes.base.set(x.fichier, md);
  }
  for (const x of rev.variantes || []) {
    const slugDomaine = revisions.slugsDomaine[x.domaine];
    const nom = `${x.domaine}/${x.slug}`;
    if (!slugDomaine) { refus.push(`variante ${nom} : domaine absent de « slugsDomaine »`); continue; }
    const md = C.lireTexte(path.join(C.CHEMINS.variantes, x.domaine, `${x.slug}.md`));
    const json = C.lireJson(path.join(C.CHEMINS.variantes, x.domaine, `${x.slug}.json`));
    verifier(`variante ${nom}`, x, md, attendus.variante(x, slugDomaine));
    const commun = C.md5(C.lireTexte(path.join(C.CHEMINS.baliseManuel, `${x.slug}.md`)));
    if (x.baseMd5 !== commun) refus.push(`variante ${nom} : « baseMd5 » ≠ md5 du texte commun courant ${commun}`);
    if (json.baseMd5 !== commun) refus.push(`variante ${nom} : baseMd5 de variantes/${nom}.json ≠ md5 du texte commun courant`);
    if (!(rev.manuel || []).some((f) => f.slug === x.slug)) refus.push(`variante ${nom} : sa fiche commune n'est pas dans la même migration`);
    textes.variantes.set(nom, md);
  }
  return { refus, rev, textes };
}

/** SQL de la migration de maintenance. */
export function sqlMaintenance(revisions, rev, textes) {
  const n = rev.numero;
  const bloc = `$m${n}$`;
  // Un texte qui porterait une étiquette de la migration (« $m198 », « $k198 », « $v198 ») fermerait un bloc avant
  // l'heure : erreur SQL au démarrage du serveur. dollar() ne refuse que l'étiquette du bloc lui-même et celles du 2c.
  const interdite = new RegExp(`\\$[mkv]${n}(?![0-9])`);
  for (const [quoi, carte] of Object.entries(textes)) {
    for (const [nom, texte] of carte) {
      if (interdite.test(texte)) throw new Error(`${quoi} ${nom} : le texte contient une étiquette de dollar-quoting de la migration ${n}`);
    }
  }
  const l = [];
  l.push(`-- ${n} — ${rev.objet}`);
  l.push('-- Généré par scripts/manuel/generer-maintenance.mjs depuis scripts/manuel/revisions.json — ne pas éditer à la main.');
  l.push('--');
  l.push('-- Migration de maintenance du manuel balisé (modèle de la 194, scripts/VOCAB-GUIDE-SERVEUR.md §9). Fiche : texte balisé');
  l.push('-- entier, gardé par le md5 (sans \\r) du texte précédent ; contenu remplacé seulement s\'il égale encore contenu_defaut');
  l.push('-- (une fiche retouchée dans l\'admin garde sa retouche) ; titre gardé par égalité exacte ; updated_at, mots_cles et icone');
  l.push('-- ne sont pas écrits. Base de connaissances : clé lower(titre), garde = md5 du contenu. Variantes : seuls les brouillons');
  l.push('-- jamais retouchés sont mis à jour (et base_md5 avec eux) ; une variante validée ou retouchée passe « à revoir ».');
  l.push('-- Idempotente : au 2e passage, tout est « déjà fait ».');
  l.push('--');
  l.push(`-- inventaire : ${JSON.stringify({ fiches: (rev.manuel || []).map((x) => x.slug), titres: (rev.manuel || []).filter((x) => x.titre !== undefined).map((x) => x.slug), entrees: (rev.base || []).map((x) => x.cle), variantes: (rev.variantes || []).map((x) => `${revisions.slugsDomaine[x.domaine]}/${x.slug}`) })}`);
  l.push('');
  l.push(`DO ${bloc}`);
  l.push('DECLARE');
  l.push('  t TEXT;');
  l.push('  n INTEGER;');
  l.push('  faites INTEGER := 0;');
  l.push('  deja INTEGER := 0;');
  l.push('  gardees TEXT[] := ARRAY[]::TEXT[];');
  l.push('  titres_gardes TEXT[] := ARRAY[]::TEXT[];');
  l.push('  retouchees TEXT[] := ARRAY[]::TEXT[];');
  l.push('  b_faites INTEGER := 0;');
  l.push('  b_deja INTEGER := 0;');
  l.push('  b_gardees TEXT[] := ARRAY[]::TEXT[];');
  l.push('  v_faites INTEGER := 0;');
  l.push('  v_deja INTEGER := 0;');
  l.push('  v_gardees TEXT[] := ARRAY[]::TEXT[];');
  l.push('BEGIN');
  for (const x of rev.manuel || []) {
    const slug = lit(x.slug);
    l.push(`  -- ── ${x.slug} ──`);
    l.push(`  t := ${dollar(textes.manuel.get(x.slug), etiquette(`m${n}`, x.slug))};`);
    l.push('  UPDATE manuel_sections m SET');
    l.push("    contenu = CASE WHEN replace(m.contenu, E'\\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\\r', '')");
    l.push('                   THEN t ELSE m.contenu END,');
    l.push('    contenu_defaut = t');
    l.push(`  WHERE m.slug = ${slug}`);
    l.push(`    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\\r', '')) = ${lit(x.md5Avant)};`);
    l.push('  GET DIAGNOSTICS n = ROW_COUNT;');
    l.push('  IF n = 1 THEN faites := faites + 1;');
    l.push(`  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = ${slug}`);
    l.push("                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\\r', '')) = md5(t)) THEN deja := deja + 1;");
    l.push(`  ELSE gardees := gardees || ${slug}::TEXT;`);
    l.push('  END IF;');
    l.push(`  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = ${slug} AND contenu_defaut = t AND replace(contenu, E'\\r', '') <> t) THEN retouchees := retouchees || ${slug}::TEXT; END IF;`);
    if (x.titre !== undefined) {
      // Le titre ne change que si le texte par défaut est celui de cette migration (fiche faite ou déjà faite) : une
      // fiche « gardée » ne reçoit pas un nouveau titre au-dessus de son ancien texte.
      l.push(`  UPDATE manuel_sections SET titre = ${lit(x.titre)} WHERE slug = ${slug} AND titre = ${lit(x.titreAvant)}`);
      l.push("    AND md5(replace(COALESCE(contenu_defaut, contenu), E'\\r', '')) = md5(t);");
      l.push(`  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = ${slug} AND titre = ${lit(x.titre)}) THEN titres_gardes := titres_gardes || ${slug}::TEXT; END IF;`);
    }
  }
  for (const x of rev.base || []) {
    const cle = lit(x.cle);
    l.push(`  -- ── base : ${x.cle} ──`);
    l.push(`  t := ${dollar(textes.base.get(x.fichier), etiquette(`k${n}`, x.fichier))};`);
    l.push('  UPDATE ai_knowledge_base SET');
    l.push('    contenu = t');
    l.push(`  WHERE lower(titre) = lower(${lit(x.titre)})`);
    l.push(`    AND md5(replace(contenu, E'\\r', '')) = ${lit(x.md5Avant)};`);
    l.push('  GET DIAGNOSTICS n = ROW_COUNT;');
    l.push('  IF n = 1 THEN b_faites := b_faites + 1;');
    l.push(`  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) = lower(${lit(x.titre)})`);
    l.push("                  AND md5(replace(contenu, E'\\r', '')) = md5(t)) THEN b_deja := b_deja + 1;");
    l.push(`  ELSE b_gardees := b_gardees || ${cle}::TEXT;`);
    l.push('  END IF;');
  }
  for (const x of rev.variantes || []) {
    const dom = revisions.slugsDomaine[x.domaine];
    const nom = lit(`${dom}/${x.slug}`);
    l.push(`  -- ── variante : ${dom} / ${x.slug} ──`);
    l.push(`  t := ${dollar(textes.variantes.get(`${x.domaine}/${x.slug}`), etiquette(`v${n}`, dom, x.slug))};`);
    l.push('  UPDATE manuel_sections_domaine d SET');
    l.push('    contenu = t,');
    l.push(`    base_md5 = ${lit(x.baseMd5)}`);
    l.push('  FROM manuel_sections s');
    l.push(`  WHERE s.id = d.section_id AND s.slug = ${lit(x.slug)} AND d.domaine_slug = ${lit(dom)}`);
    l.push("    AND d.statut = 'brouillon'");
    l.push(`    AND md5(replace(d.contenu, E'\\r', '')) = ${lit(x.md5Avant)}`);
    l.push(`    AND md5(replace(s.contenu, E'\\r', '')) = ${lit(x.baseMd5)};`);
    l.push('  GET DIAGNOSTICS n = ROW_COUNT;');
    l.push('  IF n = 1 THEN v_faites := v_faites + 1;');
    l.push('  ELSIF EXISTS (SELECT 1 FROM manuel_sections_domaine d JOIN manuel_sections s ON s.id = d.section_id');
    l.push(`                 WHERE s.slug = ${lit(x.slug)} AND d.domaine_slug = ${lit(dom)}`);
    l.push("                   AND md5(replace(d.contenu, E'\\r', '')) = md5(t)) THEN v_deja := v_deja + 1;");
    l.push(`  ELSE v_gardees := v_gardees || ${nom}::TEXT;`);
    l.push('  END IF;');
  }
  l.push(`  RAISE NOTICE '${n} : % fiche(s) réécrite(s), % déjà faite(s), % gardée(s) : % ; titres gardés : % ; retouchées dans l''admin (texte servi inchangé, à corriger dans l''admin) : % ; base : % réécrite(s), % déjà faite(s), gardée(s) : % ; variantes (brouillons) : % mise(s) à jour, % déjà faite(s), non touchée(s) (validée, retouchée ou absente : à revoir dans l''admin) : %',`);
  l.push('    faites, deja, cardinality(gardees),');
  l.push("    COALESCE(NULLIF(array_to_string(gardees, ', '), ''), 'aucune'),");
  l.push("    COALESCE(NULLIF(array_to_string(titres_gardes, ', '), ''), 'aucun'),");
  l.push("    COALESCE(NULLIF(array_to_string(retouchees, ', '), ''), 'aucune'),");
  l.push('    b_faites, b_deja,');
  l.push("    COALESCE(NULLIF(array_to_string(b_gardees, ', '), ''), 'aucune'),");
  l.push('    v_faites, v_deja,');
  l.push("    COALESCE(NULLIF(array_to_string(v_gardees, ', '), ''), 'aucune');");
  l.push('END');
  l.push(`${bloc};`);
  return `${l.join('\n')}\n`;
}

function principal(argv = process.argv.slice(2)) {
  const numero = Number(argv.find((a) => /^\d+$/.test(a)));
  const options = argv.filter((a) => a.startsWith('--'));
  const inconnue = options.find((a) => !['--verifier', '--ecraser'].includes(a));
  if (!Number.isInteger(numero) || inconnue) {
    console.error(`[maintenance] usage : node scripts/manuel/generer-maintenance.mjs <numéro> [--verifier | --ecraser]${inconnue ? ` (option inconnue « ${inconnue} »)` : ''}`);
    return 2;
  }
  const revisions = lireRevisions();
  const { refus, rev, textes } = controler(revisions, numero);
  if (refus.length) {
    for (const r of refus) console.error(`[maintenance] REFUS : ${r}`);
    return 1;
  }
  const sql = sqlMaintenance(revisions, rev, textes);
  const fichier = path.join(MIGRATIONS, rev.nom);
  const existe = fs.existsSync(fichier);
  const meme = existe && C.lireTexte(fichier) === sql;
  if (options.includes('--verifier')) {
    if (existe && !meme) { console.error(`[maintenance] migrations/${rev.nom} diffère de ce que l'outil écrirait`); return 1; }
    console.log(`[maintenance] ${numero} : contrôles verts${existe ? ' ; fichier identique' : ' ; fichier absent (non écrit)'}`);
    return 0;
  }
  if (existe && !meme && !options.includes('--ecraser')) {
    console.error(`[maintenance] REFUS : migrations/${rev.nom} existe et diffère (une migration déployée est immuable ; avant déploiement : --ecraser)`);
    return 1;
  }
  C.ecrireTexte(fichier, sql);
  console.log(`[maintenance] migrations/${rev.nom} ${meme ? 'inchangé' : 'écrit'} : ${(rev.manuel || []).length} fiche(s), ${(rev.base || []).length} entrée(s), ${(rev.variantes || []).length} variante(s)`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = principal();
}
