/* Lot 2c — générateur des migrations 194, 195, 196 (docs/lot-2c-spec.md §3.6, §4.2 à §4.4).
 *
 *   node scripts/manuel/generer-migrations.mjs --fiches <slug>…     ESSAI partiel : ces fiches (et leurs variantes présentes)
 *   node scripts/manuel/generer-migrations.mjs --lot <lot>          ESSAI partiel : les fichiers du lot (L9 : la base ; V-* : ses variantes)
 *   node scripts/manuel/generer-migrations.mjs --essai              ESSAI complet : 61 fiches, 32 entrées, variantes (étape C, avant l'écriture)
 *   node scripts/manuel/generer-migrations.mjs                      ÉCRITURE dans migrations/ et src/config/manuelSansBaliseAdmis.json
 *                                                                   (consolidation seulement, intégrateur, §13)
 * Options :
 *   --dossier <d>              dossier d'essai (défaut : <racine>/rendus/essai-migrations/) ; jamais migrations/ ;
 *   --slug hotellerie=<slug>   slug de production du domaine (lecture (7), R3.6.4) ; idem ceramique=<slug> ;
 *   --lecture <fichier>        lecture de production (défaut : scripts/manuel/lecture-production.json, voir README) ;
 *   --racine <d>               racine des fichiers de travail (balise/, variantes/, relectures/, rendus/), comme controler.mjs.
 *
 * Entrées (R3.6.1) : origine/, balise/, parties.json, variantes/. Il ne lit JAMAIS la base.
 * Sorties : 194_manuel_balise.sql, 195_base_connaissances_balisee.sql, 196_manuel_variantes_brouillons.sql (un fichier
 * n'est écrit que s'il porte au moins un élément), manuelSansBaliseAdmis.json (R3.6.5), en LF, et le résumé
 * <racine>/rendus/generation.json. En essai, tout va dans le dossier d'essai ; seule l'écriture sans option touche
 * migrations/ et src/config/.
 *
 * Refus (R3.6.2) — rien n'est écrit, code 1 :
 *   - un fichier lu contient « \r » ;
 *   - une fiche (une entrée) du périmètre n'a pas son fichier balisé ;
 *   - le contrôle échoue : sans option et avec --essai, controler --tout (P1) ; en partiel, les points 1 à 6 de chaque
 *     fiche, entrée ou variante du périmètre (« refus limités à ces fiches ») ;
 *   - une étiquette de dollar-quoting (« $m194 », « $k195 », « $v196 ») apparaît dans un texte ;
 *   - le baseMd5 d'une variante diffère du md5 du balise/manuel/<slug>.md courant ;
 *   - titres balisés de la base en double sans casse (R4.3.2), titre > 200 ou partie > 60 caractères ;
 *   - pour écrire dans migrations/ SEULEMENT : la lecture de production manque, ou ses empreintes (1) ne sont pas celles
 *     des fichiers d'origine (réextraction non faite, R3.2.2), ou elle compte des « \r » (6), ou le slug Hôtellerie lu
 *     (7) n'est pas celui de --slug ; une des 16 variantes de lots.json manque ; un fichier 194/195/196 de migrations/
 *     n'a pas été écrit par cet outil.
 *
 * SQL (§4.2 à §4.4) : un bloc DO par fichier ; chaque texte balisé écrit UNE fois (variable t) en dollar-quoting, étiquettes
 * sans tiret (R3.6.3) : $m194_<slug>$, $k195_<rang>$, $v196_<domaine>_<slug>$ (tirets → soulignés, domaine compris) ;
 * les chaînes courtes (slugs, titres, parties, clés lower(titre), md5) entre apostrophes doublées. Aucun BEGIN ni COMMIT
 * (migrate.js enveloppe chaque fichier). Une ligne « -- inventaire : {…} » donne ce que le fichier écrit : l'essai de
 * migration en tire les NOTICE attendues. updated_at et mots_cles ne sont jamais écrits (R4.2.4, R4.2.6). */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { creerContexte, controlerFiche, controlerEntree, controlerVariante, controlerTout } from './controler.mjs';

const require = createRequire(import.meta.url);
const C = require('./lib/commun.js');
const { formesParDefaut } = require('../../src/utils/manuelRendu.js');
const { MIGRATIONS_2C, pairesVariantes } = require('./retour-2c.js');

export const NOMS = MIGRATIONS_2C;
const DOSSIER_MIGRATIONS = path.join(C.RACINE, 'migrations');
const FICHIER_ADMIS = path.join(C.RACINE, 'src', 'config', 'manuelSansBaliseAdmis.json');
const LECTURE_DEFAUT = path.join(C.DOSSIER, 'lecture-production.json');
export const ENTETE = '-- Généré par scripts/manuel/generer-migrations.mjs — ne pas éditer à la main.';
const SLUG_DOMAINE = /^[a-z0-9-]{1,50}$/;
const ETIQUETTE_INTERDITE = /\$(?:m194|k195|v196)/;
const TITRE_MAX = 200;
const PARTIE_MAX = 60;
const longueur = (s) => [...String(s ?? '')].length;

// ── Chaînes SQL ───────────────────────────────────────────────────────────────────────────────────────────────
/** Littéral SQL entre apostrophes (apostrophes doublées). Refuse « \ » et le caractère nul : leur sens dépend de
 * standard_conforming_strings (aucun aujourd'hui dans les titres, parties, clés et slugs). */
export function lit(s) {
  const t = String(s);
  if (/[\\\0]/.test(t)) throw new Error(`chaîne SQL refusée (« \\ » ou caractère nul) : ${JSON.stringify(t.slice(0, 60))}`);
  return `'${t.replace(/'/g, "''")}'`;
}
/** Étiquette de dollar-quoting sans tiret (R3.6.3) : $<préfixe>_<morceaux, tirets → soulignés>$. */
export function etiquette(prefixe, ...morceaux) {
  const id = [prefixe, ...morceaux.map((m) => String(m).replace(/-/g, '_'))].join('_');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) throw new Error(`étiquette de dollar-quoting invalide : ${id}`);
  return `$${id}$`;
}
/** Texte en dollar-quoting ; refuse un texte qui contient l'étiquette (ou toute étiquette du 2c). */
export function dollar(texte, tag) {
  if (texte.includes(tag) || ETIQUETTE_INTERDITE.test(texte)) throw new Error(`étiquette de dollar-quoting dans le texte (${tag})`);
  return `${tag}${texte}${tag}`;
}
const ident = (slug) => `n_${String(slug).replace(/-/g, '_')}`;

// ── Lecture de production (§12.1) ─────────────────────────────────────────────────────────────────────────────
/**
 * Refus liés à la lecture de production, pour écrire dans migrations/ (R3.6.2, R3.2.2, R3.6.4). Format du fichier
 * (écrit par l'intégrateur à partir de la sortie collée par le client, README) :
 *   { le, source, empreintes: { manuel, base }, retoursChariot: { fiches, entrees }, fichesModifiees: [],
 *     hotellerie: { slug, md5Lexique } | null }
 * → liste de refus (vide si l'écriture est permise).
 */
export function verifierLectureProduction(fichier, { slugs = {}, racine = C.DOSSIER } = {}) {
  if (!fichier || !fs.existsSync(fichier)) {
    return [`lecture de production absente (${path.relative(C.RACINE, fichier || LECTURE_DEFAUT)}) : écrire dans migrations/ exige la sortie de scripts/controle-avant-2c.sql (§12.1, R3.6.2)`];
  }
  let j;
  try { j = C.lireJsonExterne(fichier); } catch (err) { return [`lecture de production illisible : ${err.message}`]; }
  const refus = [];
  const e = j && j.empreintes;
  if (!e || !/^[0-9a-f]{32}$/.test(String(e.manuel)) || !/^[0-9a-f]{32}$/.test(String(e.base))) refus.push('lecture de production : empreintes (1) manuel et base absentes ou mal formées');
  else {
    const o = C.empreintesOrigine(racine);
    if (e.manuel !== o.manuel) refus.push(`lecture de production : empreinte du manuel ${e.manuel} ≠ fichiers d'origine ${o.manuel} — réextraire les fiches qui diffèrent et les rebaliser (R3.2.2, mini-vague R)`);
    if (e.base !== o.base) refus.push(`lecture de production : empreinte de la base ${e.base} ≠ fichiers d'origine ${o.base} — réextraire les entrées qui diffèrent (R3.2.2)`);
  }
  const cr = j && j.retoursChariot;
  if (!cr || cr.fiches !== 0 || cr.entrees !== 0) refus.push(`lecture de production : retours chariot (6) attendus 0 et 0, lu ${JSON.stringify(cr ?? null)}`);
  const h = j && j.hotellerie;
  const slugH = slugs.hotellerie || 'hotellerie';
  if (h && h.slug && h.slug !== slugH) refus.push(`lecture de production : le domaine Hôtellerie a le slug « ${h.slug} » ; relancer avec --slug hotellerie=${h.slug} (R3.6.4)`);
  return refus;
}

// ── Périmètre ─────────────────────────────────────────────────────────────────────────────────────────────────
function lireArguments(argv) {
  const o = { fiches: [], lot: null, essai: false, dossier: null, slugs: {}, lecture: null, racine: null };
  let mode = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--fiches') mode = 'fiches';
    else if (a === '--lot') { o.lot = argv[++i]; mode = null; }
    else if (a === '--essai') { o.essai = true; mode = null; }
    else if (a === '--dossier') { o.dossier = argv[++i]; mode = null; }
    else if (a === '--lecture') { o.lecture = argv[++i]; mode = null; }
    else if (a === '--racine') { o.racine = argv[++i]; mode = null; }
    else if (a === '--slug') {
      const v = argv[++i];
      const m = /^(hotellerie|ceramique)=(.+)$/.exec(v || '');
      if (!m) throw new Error('--slug attend hotellerie=<slug> ou ceramique=<slug>');
      if (!SLUG_DOMAINE.test(m[2]) || m[2] === 'restauration') throw new Error(`--slug ${v} : slug [a-z0-9-]{1,50}, jamais « restauration » (contrainte de la 193)`);
      o.slugs[m[1]] = m[2];
      mode = null;
    } else if (a.startsWith('--')) throw new Error(`option inconnue « ${a} »`);
    else if (mode === 'fiches') o.fiches.push(a);
    else throw new Error(`argument inattendu « ${a} »`);
  }
  for (const k of ['lot', 'dossier', 'lecture', 'racine']) if (o[k] === undefined) throw new Error(`--${k} attend une valeur`);
  const modes = [o.fiches.length > 0, Boolean(o.lot), o.essai].filter(Boolean).length;
  if (modes > 1) throw new Error('--fiches, --lot et --essai s\'excluent');
  if (argv.includes('--fiches') && !o.fiches.length) throw new Error('--fiches attend au moins un slug');
  o.partiel = o.fiches.length > 0 || Boolean(o.lot);
  o.versMigrations = !o.partiel && !o.essai;
  if (o.versMigrations && o.dossier) throw new Error('--dossier n\'a de sens qu\'en essai (--fiches, --lot, --essai)');
  return o;
}

function perimetre(ctx, o) {
  if (!o.partiel) {
    return {
      fiches: [...ctx.fiches.keys()],
      entrees: [...ctx.entrees.keys()],
      variantes: variantesPresentes(ctx),
    };
  }
  if (o.lot) {
    const l = ctx.lots.lots[o.lot];
    if (!l) throw new Error(`lot « ${o.lot} » absent de lots.json`);
    return {
      fiches: [...(l.fiches || [])],
      entrees: [...(l.base || [])],
      variantes: (l.variantes || []).map((slug) => ({ domaine: l.domaine, slug })).filter((v) => existeVariante(ctx, v)),
    };
  }
  for (const s of o.fiches) if (!ctx.fiches.has(s)) throw new Error(`fiche « ${s} » absente de origine/manuel/`);
  const fiches = [...new Set(o.fiches)];
  return { fiches, entrees: [], variantes: variantesPresentes(ctx).filter((v) => fiches.includes(v.slug)) };
}
const existeVariante = (ctx, v) => fs.existsSync(path.join(ctx.ch.variantes, v.domaine, `${v.slug}.json`));
function variantesPresentes(ctx) {
  const out = [];
  for (const d of ['hotellerie', 'ceramique']) {
    const dir = path.join(ctx.ch.variantes, d);
    if (!fs.existsSync(dir)) continue;
    for (const n of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) out.push({ domaine: d, slug: n.slice(0, -5) });
  }
  return out;
}

// ── Lecture des fichiers du périmètre ─────────────────────────────────────────────────────────────────────────
function lireFichiers(ctx, per, refus) {
  const lire = (f, json) => {
    try { return json ? C.lireJson(f) : C.lireTexte(f); } catch (err) { refus.push(err.message); return null; }
  };
  const fiches = [];
  for (const slug of per.fiches) {
    const o = ctx.fiches.get(slug);
    const md = path.join(ctx.ch.baliseManuel, `${slug}.md`);
    const js = path.join(ctx.ch.baliseManuel, `${slug}.json`);
    if (!fs.existsSync(md) || !fs.existsSync(js)) { refus.push(`fiche « ${slug} » : balise/manuel/${slug}.md ou .json absent`); continue; }
    const contenu = lire(md, false);
    const json = lire(js, true);
    if (contenu === null || json === null) continue;
    let partie = null;
    try { partie = C.partieBalisee(o.partie, ctx.parties); } catch (err) { refus.push(err.message); continue; }
    fiches.push({ slug, o, contenu, titre: json.titre, partie });
  }
  const entrees = [];
  for (const fichier of per.entrees) {
    const o = ctx.entrees.get(fichier);
    if (!o) { refus.push(`entrée « ${fichier} » absente de origine/base/`); continue; }
    const md = path.join(ctx.ch.baliseBase, `${fichier}.md`);
    const js = path.join(ctx.ch.baliseBase, `${fichier}.json`);
    if (!fs.existsSync(md) || !fs.existsSync(js)) { refus.push(`entrée « ${fichier} » : balise/base/${fichier}.md ou .json absent`); continue; }
    const contenu = lire(md, false);
    const json = lire(js, true);
    if (contenu === null || json === null) continue;
    entrees.push({ fichier, o, contenu, titre: json.titre });
  }
  const variantes = [];
  for (const v of per.variantes) {
    const dir = path.join(ctx.ch.variantes, v.domaine);
    const contenu = lire(path.join(dir, `${v.slug}.md`), false);
    const json = lire(path.join(dir, `${v.slug}.json`), true);
    if (contenu === null || json === null) continue;
    const communMd = path.join(ctx.ch.baliseManuel, `${v.slug}.md`);
    const commun = fs.existsSync(communMd) ? lire(communMd, false) : null;
    if (commun === null) { refus.push(`variante ${v.domaine}/${v.slug} : balise/manuel/${v.slug}.md absent (baseMd5)`); continue; }
    if (json.baseMd5 !== C.md5(commun)) refus.push(`variante ${v.domaine}/${v.slug} : baseMd5 ${json.baseMd5} ≠ md5 du balise/manuel/${v.slug}.md courant ${C.md5(commun)} (relire la variante, mettre baseMd5 à jour)`);
    variantes.push({ ...v, contenu, titre: json.titre ?? null, baseMd5: C.md5(commun) });
  }
  // parties.json (texte des parties balisées)
  lire(path.join(C.DOSSIER, 'parties.json'), true);
  return { fiches, entrees, variantes };
}

// ── SQL ───────────────────────────────────────────────────────────────────────────────────────────────────────
const enTete = (numero, titre, lignes, inventaire) => [
  `-- ${numero} — Lot 2c : ${titre} (docs/lot-2c-spec.md ${numero === 194 ? '§4.2' : numero === 195 ? '§4.3' : '§4.4'}).`,
  ENTETE,
  '--',
  ...lignes.map((l) => `-- ${l}`),
  '--',
  `-- inventaire : ${JSON.stringify(inventaire)}`,
  '',
].join('\n');

/** SQL de la 194 (fiches du manuel). → { sql, inventaire } ou null si rien à écrire. */
export function sql194(fiches) {
  const contenus = [];
  const titres = [];
  const parties = [];
  const sansTerme = [];
  const blocs = [];
  for (const f of fiches) {
    const s = lit(f.slug);
    const b = [];
    if (f.contenu !== f.o.contenu) {
      const tag = etiquette('m194', f.slug);
      contenus.push(f.slug);
      b.push(
        `  t := ${dollar(f.contenu, tag)};`,
        '  UPDATE manuel_sections m SET',
        "    contenu = CASE WHEN replace(m.contenu, E'\\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\\r', '')",
        '                   THEN t ELSE m.contenu END,',
        '    contenu_defaut = t',
        `  WHERE m.slug = ${s}`,
        `    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\\r', '')) = ${lit(f.o.md5Garde)};`,
        '  GET DIAGNOSTICS n = ROW_COUNT;',
        '  IF n = 1 THEN balisees := balisees + 1;',
        `  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = ${s}`,
        "                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\\r', '')) = md5(t)) THEN deja := deja + 1;",
        `  ELSE gardees := gardees || ${s}::TEXT;`,
        '  END IF;',
      );
    }
    if (f.titre !== f.o.titre) {
      titres.push(f.slug);
      b.push(
        `  UPDATE manuel_sections SET titre = ${lit(f.titre)} WHERE slug = ${s} AND titre = ${lit(f.o.titre)};`,
        `  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = ${s} AND titre = ${lit(f.titre)}) THEN titres_gardes := titres_gardes || ${s}::TEXT; END IF;`,
      );
    }
    if (f.partie !== f.o.partie) {
      parties.push(f.slug);
      b.push(
        `  UPDATE manuel_sections SET partie = ${lit(f.partie)} WHERE slug = ${s} AND partie = ${lit(f.o.partie)};`,
        `  IF NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = ${s} AND partie = ${lit(f.partie)}) THEN parties_gardees := parties_gardees || ${s}::TEXT; END IF;`,
      );
    }
    if (!b.length) { sansTerme.push(f.slug); continue; }
    blocs.push(`  -- ── ${f.slug} ──`, ...b);
  }
  if (!blocs.length) return null;
  const inventaire = { contenus, titres, parties, sansTerme };
  const sql = `${enTete(194, 'le manuel balisé', [
    'Pour chaque fiche qui porte un terme : contenu_defaut reçoit le texte balisé ; contenu aussi, s\'il n\'a pas été',
    'modifié dans l\'admin (comparaison sans \\r, COALESCE pour les 5 fiches à défaut NULL : R4.2.1, R4.2.2). Garde : md5 du',
    'texte d\'origine (md5Garde de scripts/manuel/origine/manuel/<slug>.json). Titre et partie : gardés par égalité exacte',
    'avec l\'origine, champ par champ (R4.2.3). updated_at et mots_cles ne sont pas écrits (R4.2.4, R4.2.6).',
    'Idempotente : au 2e passage, la garde ne répond plus et le test « déjà balisée » répond (R4.2.5 : 0 / N / 0).',
    'Rendu par défaut de chaque champ = texte d\'origine, octet pour octet (I10, controler.mjs point 1, essai-migration.js).',
  ], inventaire)}
DO $m194$
DECLARE
  t TEXT;
  n INTEGER;
  balisees INTEGER := 0;
  deja INTEGER := 0;
  gardees TEXT[] := ARRAY[]::TEXT[];
  titres_gardes TEXT[] := ARRAY[]::TEXT[];
  parties_gardees TEXT[] := ARRAY[]::TEXT[];
BEGIN
${blocs.join('\n')}
  RAISE NOTICE '194 : % fiche(s) balisée(s), % déjà balisée(s), % gardée(s) : % ; titres gardés : % ; parties gardées : % ; sans terme : %',
    balisees, deja, cardinality(gardees),
    COALESCE(NULLIF(array_to_string(gardees, ', '), ''), 'aucune'),
    COALESCE(NULLIF(array_to_string(titres_gardes, ', '), ''), 'aucun'),
    COALESCE(NULLIF(array_to_string(parties_gardees, ', '), ''), 'aucune'),
    ${lit(sansTerme.join(', ') || 'aucune')};
END
$m194$;
`;
  return { sql, inventaire };
}

/** SQL de la 195 (base de connaissances). `entrees` dans l'ordre des clés ; rang = position (1, 2, …). */
export function sql195(entrees) {
  const ecrites = [];
  const sansTerme = [];
  const blocs = [];
  entrees.forEach((e, i) => {
    const titreChange = e.titre !== e.o.titre;
    if (e.contenu === e.o.contenu && !titreChange) { sansTerme.push(e.o.cle); return; }
    const tag = etiquette('k195', i + 1);
    const cle = lit(e.o.cle);
    ecrites.push(e.o.cle);
    blocs.push(
      `  -- ── ${e.o.cle} ──`,
      `  t := ${dollar(e.contenu, tag)};`,
      '  UPDATE ai_knowledge_base SET',
      `    contenu = t${titreChange ? ',' : ''}`,
      ...(titreChange ? [`    titre = CASE WHEN titre = ${lit(e.o.titre)} THEN ${lit(e.titre)} ELSE titre END`] : []),
      `  WHERE lower(titre) = ${cle}`,
      `    AND md5(replace(contenu, E'\\r', '')) = ${lit(e.o.md5Contenu)};`,
      '  GET DIAGNOSTICS n = ROW_COUNT;',
      '  IF n = 1 THEN balisees := balisees + 1;',
      `  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN (${cle}${titreChange ? `, lower(${lit(e.titre)})` : ''})`,
      "                  AND md5(replace(contenu, E'\\r', '')) = md5(t)) THEN deja := deja + 1;",
      `  ELSE gardees := gardees || ${cle}::TEXT;`,
      '  END IF;',
      ...(titreChange ? [`  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = ${lit(e.titre)}) THEN titres_gardes := titres_gardes || ${cle}::TEXT; END IF;`] : []),
    );
  });
  if (!blocs.length) return null;
  const inventaire = { entrees: ecrites, sansTerme };
  const sql = `${enTete(195, 'la base de connaissances balisée', [
    'Pour chaque entrée qui porte un terme : contenu (et titre, s\'il est encore celui d\'origine) reçoivent le texte',
    'balisé. Clé : lower(titre) d\'origine (index idx_ai_kb_titre) ; garde : md5 du contenu d\'origine, sans \\r (R4.3.1).',
    'Au 2e passage, le titre balisé n\'est plus la clé : « déjà balisée » cherche sous les deux titres. updated_at,',
    'mots_cles et categorie ne sont pas écrits. NOTICE attendue : N / 0 / 0, puis 0 / N / 0 (R4.3.3).',
  ], inventaire)}
DO $k195$
DECLARE
  t TEXT;
  n INTEGER;
  balisees INTEGER := 0;
  deja INTEGER := 0;
  gardees TEXT[] := ARRAY[]::TEXT[];
  titres_gardes TEXT[] := ARRAY[]::TEXT[];
BEGIN
${blocs.join('\n')}
  RAISE NOTICE '195 : % entrée(s) balisée(s), % déjà balisée(s), % gardée(s) : % ; titres gardés : % ; sans terme : %',
    balisees, deja, cardinality(gardees),
    COALESCE(NULLIF(array_to_string(gardees, ', '), ''), 'aucune'),
    COALESCE(NULLIF(array_to_string(titres_gardes, ', '), ''), 'aucun'),
    ${lit(sansTerme.join(', ') || 'aucune')};
END
$k195$;
`;
  return { sql, inventaire };
}

/** SQL de la 196 (brouillons des variantes). `slugs` : { hotellerie, ceramique } → slug SQL du domaine (--slug). */
export function sql196(variantes, slugs = {}) {
  if (!variantes.length) return null;
  const domainesSql = [...new Set(variantes.map((v) => slugs[v.domaine] || v.domaine))];
  for (const d of domainesSql) if (!SLUG_DOMAINE.test(d) || d === 'restauration') throw new Error(`slug de domaine « ${d} » refusé par la contrainte de la 193`);
  const blocs = [];
  const inventaire = { variantes: [] };
  for (const v of variantes) {
    const d = slugs[v.domaine] || v.domaine;
    const tag = etiquette('v196', d, v.slug);
    inventaire.variantes.push(`${d}/${v.slug}`);
    blocs.push(
      `  -- ── ${d} / ${v.slug} ──`,
      '  INSERT INTO manuel_sections_domaine (section_id, domaine_slug, titre, contenu, mots_cles, statut, base_md5)',
      `  SELECT s.id, ${lit(d)}, ${v.titre === null ? 'NULL' : lit(v.titre)}, ${dollar(v.contenu, tag)}, NULL, 'brouillon', ${lit(v.baseMd5)}`,
      `    FROM manuel_sections s WHERE s.slug = ${lit(v.slug)}`,
      '  ON CONFLICT (section_id, domaine_slug) DO NOTHING;',
      '  GET DIAGNOSTICS n = ROW_COUNT;',
      `  ${ident(d)} := ${ident(d)} + n;`,
      `  IF n = 0 AND NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = ${lit(v.slug)}) THEN fiches_absentes := fiches_absentes || ${lit(v.slug)}::TEXT; END IF;`,
    );
  }
  const absents = domainesSql.map((d) => `  IF NOT EXISTS (SELECT 1 FROM domaines_activite WHERE slug = ${lit(d)}) THEN absents := absents || ${lit(d)}::TEXT; END IF;`);
  const detail = domainesSql.map((d) => `${d} ' || ${ident(d)} || '`).join(', ');
  const sql = `${enTete(196, 'brouillons des variantes du manuel', [
    'Un brouillon par fiche et par domaine (décision 1 du client), statut « brouillon » : jamais servi avant d\'être validé',
    'dans l\'admin (I12). Inséré que le domaine existe ou non (§8.6). ON CONFLICT DO NOTHING : un brouillon déjà corrigé',
    'n\'est jamais écrasé ; idempotente (2e passage : 0 inséré). base_md5 = md5 du texte commun balisé (scripts/manuel/',
    'balise/manuel/<slug>.md), égal au contenu servi après la 194 pour une fiche non modifiée (§4.4).',
  ], inventaire)}
DO $v196$
DECLARE
  n INTEGER;
${domainesSql.map((d) => `  ${ident(d)} INTEGER := 0;`).join('\n')}
  absents TEXT[] := ARRAY[]::TEXT[];
  fiches_absentes TEXT[] := ARRAY[]::TEXT[];
BEGIN
${blocs.join('\n')}
${absents.join('\n')}
  RAISE NOTICE '%', '196 : ' || (${domainesSql.map(ident).join(' + ')}) || ' brouillon(s) inséré(s) (${detail}) ; domaines absents : '
    || COALESCE(NULLIF(array_to_string(absents, ', '), ''), 'aucun')
    || ' ; fiches absentes : ' || COALESCE(NULLIF(array_to_string(fiches_absentes, ', '), ''), 'aucune');
END
$v196$;
`;
  return { sql, inventaire };
}

/** Champs admis sans balise (R3.6.5) : champ qui porte une forme par défaut (formesParDefaut, comme champsSansBalises
 * du serveur) mais aucune « [[ », dans le texte tel qu'écrit en base après les migrations. */
export function champsAdmis(fiches, entrees) {
  const m = new Map();
  const noter = (table, champ, texte, cle) => {
    if (typeof texte !== 'string' || texte.includes('[[') || !formesParDefaut(texte).length) return;
    const h = C.md5(texte);
    const k = `${table}\u0000${champ}\u0000${h}`;
    if (!m.has(k)) m.set(k, { table, champ, md5: h, cles: [] });
    m.get(k).cles.push(cle);
  };
  for (const f of fiches) {
    noter('manuel_sections', 'titre', f.titre, f.slug);
    noter('manuel_sections', 'partie', f.partie, f.slug);
    noter('manuel_sections', 'contenu', f.contenu, f.slug);
  }
  for (const e of entrees) {
    noter('ai_knowledge_base', 'titre', e.titre, e.o.titre);
    noter('ai_knowledge_base', 'contenu', e.contenu, e.o.titre);
  }
  return [...m.values()]
    .map((x) => ({ table: x.table, champ: x.champ, md5: x.md5, cle: x.cles.join(', ') }))
    .sort((a, b) => C.parPointsDeCode(`${a.table}|${a.champ}|${a.cle}`, `${b.table}|${b.champ}|${b.cle}`));
}

// ── Génération ────────────────────────────────────────────────────────────────────────────────────────────────
/** Génère (ou refuse). → { ecrits: [chemins], dossier, inventaires, admis, refus: [] } ; lève une erreur listant les refus. */
export function generer(argv = []) {
  const o = lireArguments(argv);
  const ctx = creerContexte({ racine: o.racine || C.DOSSIER });
  const refus = [];
  const per = perimetre(ctx, o);
  if (!per.fiches.length && !per.entrees.length && !per.variantes.length) throw new Error('périmètre vide');
  const lus = lireFichiers(ctx, per, refus);

  // Contrôle (R3.6.2) : --tout sans option et en essai complet ; points 1 à 6 du périmètre en partiel.
  if (o.partiel) {
    const res = [
      ...lus.fiches.map((f) => controlerFiche(ctx, f.slug, { ecrire: false })),
      ...lus.entrees.map((e) => controlerEntree(ctx, e.fichier, { ecrire: false })),
      ...lus.variantes.map((v) => controlerVariante(ctx, v.domaine, v.slug, { ecrire: false })),
    ];
    for (const r of res.filter((x) => !x.passe)) {
      refus.push(`contrôle : ${r.type} ${r.domaine ? `${r.domaine}/` : ''}${r.nom} échoue (${r.echecs.slice(0, 3).map((x) => `point ${x.point} : ${x.message}`).join(' ; ')}${r.echecs.length > 3 ? ' ; …' : ''})`);
    }
  } else {
    const t = controlerTout(ctx, { ecrire: false });
    if (!t.vert) {
      const ko = [...t.fiches, ...t.base, ...t.variantes].filter((r) => !r.passe).length;
      refus.push(`contrôle --tout ROUGE : ${ko} élément(s) en échec, ${t.ensemble.length} échec(s) d'ensemble, ${t.aTraiter} signalement(s) à traiter, ${t.sansObjet.length} acceptation(s) sans objet (node scripts/manuel/controler.mjs --tout)`);
    }
  }
  // Longueurs et unicité (R4.3.2).
  for (const f of lus.fiches) {
    if (longueur(f.titre) > TITRE_MAX) refus.push(`fiche ${f.slug} : titre balisé de ${longueur(f.titre)} caractères (> ${TITRE_MAX})`);
    if (longueur(f.partie) > PARTIE_MAX) refus.push(`fiche ${f.slug} : partie balisée de ${longueur(f.partie)} caractères (> ${PARTIE_MAX})`);
  }
  for (const v of lus.variantes) if (v.titre !== null && longueur(v.titre) > TITRE_MAX) refus.push(`variante ${v.domaine}/${v.slug} : titre > ${TITRE_MAX}`);
  const titresBase = new Map();
  for (const e of lus.entrees) {
    if (longueur(e.titre) > TITRE_MAX) refus.push(`entrée ${e.fichier} : titre balisé > ${TITRE_MAX}`);
    const k = String(e.titre).toLowerCase();
    if (titresBase.has(k)) refus.push(`base : titres balisés « ${titresBase.get(k)} » et « ${e.titre} » égaux sans casse (index idx_ai_kb_titre, R4.3.2)`);
    titresBase.set(k, e.titre);
  }

  // Écriture dans migrations/ : lecture de production, 16 variantes, fichiers existants.
  if (o.versMigrations) {
    refus.push(...verifierLectureProduction(o.lecture ? path.resolve(o.lecture) : LECTURE_DEFAUT, { slugs: o.slugs }));
    const presentes = new Set(lus.variantes.map((v) => `${v.domaine}/${v.slug}`));
    for (const p of pairesVariantes(ctx.lots)) if (!presentes.has(`${p.domaine}/${p.slug}`)) refus.push(`variante ${p.domaine}/${p.slug} absente (16 brouillons attendus, §4.4)`);
    for (const n of fs.readdirSync(DOSSIER_MIGRATIONS).filter((x) => /^19[456]_/.test(x))) {
      if (!Object.values(NOMS).includes(n)) refus.push(`migrations/${n} : numéro réservé au lot 2c (194 à 196)`);
      else if (!fs.readFileSync(path.join(DOSSIER_MIGRATIONS, n), 'utf8').replace(/\r/g, '').split('\n').slice(0, 3).includes(ENTETE)) refus.push(`migrations/${n} existe et n'a pas été écrit par ce générateur`);
    }
  }

  // SQL (les erreurs d'étiquette ou de chaîne sont des refus).
  const entreesTriees = [...lus.entrees].sort((a, b) => C.parPointsDeCode(a.o.cle, b.o.cle));
  const sorties = {};
  for (const [nom, fn] of [[NOMS.manuel, () => sql194(lus.fiches)], [NOMS.base, () => sql195(entreesTriees)], [NOMS.variantes, () => sql196(lus.variantes, o.slugs)]]) {
    try { sorties[nom] = fn(); } catch (err) { refus.push(err.message); }
  }
  for (const [nom, s] of Object.entries(sorties)) if (s && s.sql.includes('\r')) refus.push(`${nom} : « \\r » dans le SQL généré`);

  if (refus.length) {
    const e = new Error(`REFUS, rien n'est écrit (${refus.length}) :\n${refus.map((r) => `  - ${r}`).join('\n')}`);
    e.refus = refus;
    throw e;
  }

  // Écriture.
  const dossier = o.versMigrations ? DOSSIER_MIGRATIONS : path.resolve(o.dossier || path.join(ctx.ch.rendus, 'essai-migrations'));
  if (!o.versMigrations && path.resolve(dossier).toLowerCase().startsWith(DOSSIER_MIGRATIONS.toLowerCase())) {
    throw new Error(`REFUS : un essai n'écrit jamais dans migrations/ (${dossier})`);
  }
  if (!o.versMigrations && fs.existsSync(dossier)) {
    for (const n of Object.values(NOMS)) fs.rmSync(path.join(dossier, n), { force: true }); // un essai remplace le précédent
  }
  const ecrits = [];
  const inventaires = {};
  for (const [nom, s] of Object.entries(sorties)) {
    if (!s) continue;
    C.ecrireTexte(path.join(dossier, nom), s.sql);
    ecrits.push(path.join(dossier, nom));
    inventaires[nom] = s.inventaire;
  }
  const admis = champsAdmis(lus.fiches, lus.entrees);
  const fichierAdmis = o.versMigrations ? FICHIER_ADMIS : path.join(dossier, 'manuelSansBaliseAdmis.json');
  C.ecrireTexte(fichierAdmis, `${JSON.stringify(admis, null, 2)}\n`);
  ecrits.push(fichierAdmis);
  const resume = {
    _lisezmoi: 'generer-migrations.mjs (spec §3.6) : résumé du dernier passage (non versionné).',
    le: new Date().toISOString(),
    mode: o.versMigrations ? 'migrations' : o.partiel ? (o.lot ? `lot ${o.lot}` : 'fiches') : 'essai complet',
    dossier: path.relative(C.RACINE, dossier),
    slugs: { hotellerie: o.slugs.hotellerie || 'hotellerie', ceramique: o.slugs.ceramique || 'ceramique' },
    perimetre: { fiches: per.fiches, entrees: per.entrees, variantes: per.variantes.map((v) => `${v.domaine}/${v.slug}`) },
    inventaires,
    admis,
    fichiers: Object.fromEntries(ecrits.map((f) => [path.relative(C.RACINE, f), { md5: C.md5(fs.readFileSync(f, 'utf8')), octets: fs.statSync(f).size }])),
  };
  C.ecrireJson(path.join(ctx.ch.rendus, 'generation.json'), resume);
  return { ecrits, dossier, inventaires, admis, resume };
}

const lanceDirectement = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (lanceDirectement) {
  try {
    const r = generer(process.argv.slice(2));
    const inv = r.inventaires;
    const m = inv[NOMS.manuel];
    const k = inv[NOMS.base];
    const v = inv[NOMS.variantes];
    console.log(`[generer] ${r.resume.mode} → ${r.resume.dossier}`);
    if (m) console.log(`[generer] ${NOMS.manuel} : ${m.contenus.length} contenu(s), ${m.titres.length} titre(s), ${m.parties.length} partie(s) ; sans terme : ${m.sansTerme.join(', ') || 'aucune'}`);
    if (k) console.log(`[generer] ${NOMS.base} : ${k.entrees.length} entrée(s) ; sans terme : ${k.sansTerme.join(', ') || 'aucune'}`);
    if (v) console.log(`[generer] ${NOMS.variantes} : ${v.variantes.length} brouillon(s)`);
    if (!m && r.resume.perimetre.fiches.length) console.log(`[generer] ${NOMS.manuel} non écrite : aucune fiche du périmètre ne porte de terme`);
    console.log(`[generer] champs admis sans balise : ${r.admis.length}`);
    for (const [f, x] of Object.entries(r.resume.fichiers)) console.log(`[generer]   ${f} (${x.octets} octets, md5 ${x.md5})`);
  } catch (err) {
    console.error(`[generer] ${err.message}`);
    process.exitCode = err.refus ? 1 : 2;
  }
}
