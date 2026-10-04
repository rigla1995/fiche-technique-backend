/* Essai d'une migration de maintenance du manuel, en transaction ANNULÉE (base locale seulement).
 *
 *   node scripts/manuel/essai-maintenance.js <numéro>
 *
 * Dans une transaction : la migration est appliquée deux fois (2e passage : tout « déjà fait »), puis chaque texte de
 * scripts/manuel/revisions.json est relu en base et comparé au fichier balisé courant (contenu, contenu_defaut, titre,
 * base de connaissances, brouillons de variantes et leur base_md5) ; les fiches hors révision ne doivent pas bouger
 * (empreinte globale du reste). ROLLBACK dans tous les cas : la base n'est jamais modifiée.
 * Codes de sortie : 0 essai réussi ; 1 contrôle en échec ; 2 refus (usage, hôte non local). */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const C = require('./lib/commun');

async function principal() {
  const numero = Number(process.argv[2]);
  const revisions = C.lireJson(path.join(C.DOSSIER, 'revisions.json'));
  const rev = revisions.migrations.find((m) => m.numero === numero);
  if (!rev) { console.error(`[essai] migration ${process.argv[2]} absente de revisions.json`); return 2; }
  const hote = process.env.DB_HOST || 'localhost';
  if (!['localhost', '127.0.0.1', '::1'].includes(hote)) { console.error(`[essai] REFUS : hôte « ${hote} » non local`); return 2; }
  const sql = C.lireTexte(path.join(C.RACINE, 'migrations', rev.nom));
  const client = new Client({
    host: hote, port: Number(process.env.DB_PORT) || 5432, database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  });
  const notices = [];
  client.on('notice', (n) => notices.push(n.message));
  await client.connect();
  let echecs = 0;
  const verifier = (ok, quoi) => { if (!ok) echecs += 1; console.log(`[essai] ${ok ? '✔' : '✖'} ${quoi}`); };
  try {
    await client.query('BEGIN');
    const slugs = (rev.manuel || []).map((x) => x.slug);
    const reste = async () => (await client.query(
      `SELECT md5(string_agg(slug || '|' || titre || '|' || md5(contenu) || '|' || md5(COALESCE(contenu_defaut, '')) || '|' || COALESCE(mots_cles, '') || '|' || COALESCE(icone, '') || '|' || updated_at::text, E'\\n' ORDER BY slug)) AS e
         FROM manuel_sections WHERE slug <> ALL($1)`, [slugs])).rows[0].e;
    const meta = async () => (await client.query(
      `SELECT md5(string_agg(slug || '|' || COALESCE(mots_cles, '') || '|' || COALESCE(icone, '') || '|' || updated_at::text, E'\\n' ORDER BY slug)) AS e
         FROM manuel_sections WHERE slug = ANY($1)`, [slugs])).rows[0].e;
    const resteAvant = await reste();
    const metaAvant = await meta();
    const nbBase = (await client.query('SELECT count(*)::int AS n FROM ai_knowledge_base')).rows[0].n;

    await client.query(sql);
    const premier = notices.splice(0).join(' | ');
    console.log(`[essai] 1er passage : ${premier}`);
    const nb = { f: (rev.manuel || []).length, b: (rev.base || []).length, v: (rev.variantes || []).length };
    verifier(premier.includes(`${nb.f} fiche(s) réécrite(s), 0 déjà faite(s), 0 gardée(s)`), `1er passage : ${nb.f} fiche(s) réécrite(s), aucune gardée`);
    verifier(premier.includes('titres gardés : aucun'), '1er passage : aucun titre gardé');
    verifier(premier.includes(`base : ${nb.b} réécrite(s), 0 déjà faite(s), gardée(s) : aucune`), `1er passage : ${nb.b} entrée(s) de la base réécrite(s)`);
    console.log(`[essai] (variantes : la base locale peut ne pas porter tous les brouillons — lu dans la NOTICE ci-dessus)`);

    for (const x of rev.manuel || []) {
      const md = C.lireTexte(path.join(C.CHEMINS.baliseManuel, `${x.slug}.md`));
      const json = C.lireJson(path.join(C.CHEMINS.baliseManuel, `${x.slug}.json`));
      const r = (await client.query('SELECT titre, contenu, contenu_defaut FROM manuel_sections WHERE slug = $1', [x.slug])).rows[0];
      verifier(r && r.contenu === md && r.contenu_defaut === md && r.titre === json.titre, `fiche ${x.slug} : contenu, contenu_defaut et titre = fichier balisé`);
    }
    for (const x of rev.base || []) {
      const md = C.lireTexte(path.join(C.CHEMINS.baliseBase, `${x.fichier}.md`));
      const r = (await client.query('SELECT contenu FROM ai_knowledge_base WHERE lower(titre) = lower($1)', [x.titre])).rows;
      verifier(r.length === 1 && r[0].contenu === md, `entrée ${x.fichier} : contenu = fichier balisé`);
    }
    for (const x of rev.variantes || []) {
      const dom = revisions.slugsDomaine[x.domaine];
      const md = C.lireTexte(path.join(C.CHEMINS.variantes, x.domaine, `${x.slug}.md`));
      const r = (await client.query(
        `SELECT d.contenu, d.base_md5, d.statut, md5(replace(s.contenu, E'\\r', '')) IS DISTINCT FROM d.base_md5 AS a_revoir
           FROM manuel_sections_domaine d JOIN manuel_sections s ON s.id = d.section_id
          WHERE s.slug = $1 AND d.domaine_slug = $2`, [x.slug, dom])).rows[0];
      if (!r) { console.log(`[essai] – variante ${dom}/${x.slug} : absente de cette base (non contrôlée)`); continue; }
      verifier(r.contenu === md && r.base_md5 === x.baseMd5 && r.a_revoir === false && r.statut === 'brouillon', `variante ${dom}/${x.slug} : brouillon mis à jour, base_md5 à jour, pas « à revoir »`);
    }
    verifier((await reste()) === resteAvant, 'les autres fiches du manuel sont intactes (contenu, défaut, titre, mots-clés, icône, updated_at)');
    verifier((await meta()) === metaAvant, 'fiches réécrites : mots-clés, icône et updated_at inchangés');
    verifier((await client.query('SELECT count(*)::int AS n FROM ai_knowledge_base')).rows[0].n === nbBase, 'base de connaissances : même nombre d\'entrées');

    await client.query(sql);
    const second = notices.splice(0).join(' | ');
    console.log(`[essai] 2e passage : ${second}`);
    verifier(second.includes(`0 fiche(s) réécrite(s), ${nb.f} déjà faite(s), 0 gardée(s)`), '2e passage : tout est « déjà fait » (fiches)');
    verifier(second.includes(`base : 0 réécrite(s), ${nb.b} déjà faite(s)`), '2e passage : tout est « déjà fait » (base)');
    verifier(/variantes \(brouillons\) : 0 mise\(s\) à jour/.test(second), '2e passage : aucune variante réécrite');
  } catch (err) {
    echecs += 1;
    console.error(`[essai] ERREUR : ${err.message}`);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
  console.log(`[essai] ${echecs ? `ÉCHEC : ${echecs} contrôle(s)` : 'ESSAI RÉUSSI'} ; transaction annulée (ROLLBACK), base « ${process.env.DB_NAME} » inchangée`);
  return echecs ? 1 : 0;
}

principal().then((code) => { process.exitCode = code; }, (err) => { console.error(`[essai] ${err.message}`); process.exitCode = 1; });
