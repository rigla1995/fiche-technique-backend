# Oracle du vocabulaire (lot 2b, étape O ; étendu à l'étape O du lot 2c)

Spécification : `docs/lot-2b-spec.md` §2 ; extension du lot 2c (manuel, recherches, base protégée) : `docs/lot-2c-spec.md`
§2 (section « Lot 2c » plus bas). Seul l'intégrateur lance ces commandes : une capture charge
l'application dans son processus, ce qui APPLIQUE les migrations en attente à la base locale.

## Fichiers

| Fichier | Rôle |
|---|---|
| `restauration.json` | Référence commitée : captures du domaine restauration (`meta`, `comptes` par clé, `captures` masquées). `meta.rangsTri` : rangs de la clé de tri des listes d'`ordre-libre.json` à `cleTri`, calculés avant masquage. |
| `ecarts-restauration-attendus.json` | Écarts admis, un par entrée `{ cle, chemin, avant, apres, raison: '§11.1.n' \| '§11.2.n' }`, plus `type: 'ordre-cles'` pour une permutation de clés. Vide à l'étape O. Tenu par l'intégrateur. **Lot 2c : `[]`** depuis l'étape O (les 109 entrées du 2b sont dans `archives-2b/`) ; le 2c n'attend aucun écart en restauration (spec lot 2c §2.7). |
| `archives-2b/` | Lot 2c, étape O : `ecarts-restauration-attendus.json` du 2b (109 entrées, raisons §11.x du 2b), sans objet après la recapture sur le code du 2b. Non lu par l'oracle. |
| `recherches-avant-ordre.json` | Lot 2c, étape O : clés `recherches` et `recherchesDomaine` de la capture restauration de `develop` (`863f8f0`, AVANT R2.2), et la liste des recherches changées (`resume`). Les valeurs après R2.2 sont celles de `restauration.json` (voir « Recapture du 2c »). |
| `ordre-libre.json` | Listes dont l'ordre peut changer `{ cle, chemin, raison, cleTri? }` (voir « Ordre » ci-dessous). |
| `exceptions-hors-restauration.json` | Exceptions typées du scan hors restauration `{ cle, chemin (motif), texte, type, justification, domaines?, extrait? }`. `texte` vaut la forme trouvée ou le texte entier ; avec `extrait: true`, c'est un PASSAGE exact retiré du texte avant la recherche (un prompt est UN texte : une exception par forme l'éteindrait en entier). Le glossaire « ## Vocabulaire du compte » du prompt (spec §7.3) est retiré du texte lu ; seule sa colonne de droite (mots du compte) est cherchée, sous `…/glossaire/droite`. |
| `hors-restauration-avant.json` | Liste de travail de l'étape O : formes par défaut trouvées par domaine, chiffrées par famille. Complète depuis S1 (clés `*_abr` comprises) pour hotellerie, ceramique et miroir ; son `_lisezmoi` ne la dit « incomplète » que si un domaine a encore des clés absentes du moteur de son passage. **Réécrite à l'étape O du lot 2c** (`scan2c: true`) : famille `manuel` (manuel servi) et famille `assistant` étendue aux résultats de la recherche ; ses comptes `manuel` et `assistant` ne doivent jamais monter (R2.4.7). |

## Commandes (depuis la racine du dépôt backend)

```
node scripts/capture-vocab-baseline.js --reference            # recapture la référence (restauration)
node scripts/check-invariant-vocab.js                          # nouvelle capture, comparée à la référence
node scripts/check-invariant-vocab.js --domaine hotellerie     # idem ceramique, miroir : scan des formes par défaut
node scripts/check-invariant-vocab.js --domaine miroir --liste-avant   # réécrit la section du domaine dans la liste de travail
```

Options : `--capture <fichier>` (analyser une capture déjà faite), `--reference <fichier>`, `--rapport <fichier>`, `--port <n>`.
Lot 2c : `--hors-manuel` (porte de S à C : formes du manuel et des recherches comptées à part, R2.4.7) ; `--brut <dossier>`
(dossier HORS des dépôts : la capture y écrit la réponse brute de `GET /api/manuel` du client B, `manuel-client-B.json`,
pour `scripts/controle-manuel-pdf.mjs` du frontend). Après l'étape C du lot 2c, toute commande ci-dessus tourne sur une copie
neuve de la base : `node scripts/manuel/base-locale.js copie` puis `DB_NAME=fiche_technique_2c node scripts/…` (R2.8.2).

## Règles

- Un processus par domaine (le limiteur de connexion est en mémoire). Refus entre 00:45 et 01:15 et en janvier.
- La référence et chaque contrôle sont du même mois civil ; sinon, recapturer la référence sur la tête de `develop`.
- Déterminisme : la capture est lancée deux fois avant d'être commitée ; les deux doivent être identiques.
- Échec du contrôle : clé vide, compte d'éléments différent, écart non listé, entrée sans emploi, ordre seul non admis.
- Ordre des clés (I9, spec §2.4 v2.2) : deux objets comparés gardent la même suite de clés COMMUNES. Une permutation
  est un écart de type `ordre-cles` (`avant` / `apres` = les deux suites), admis seulement par une entrée qui porte ce
  type. Une clé ajoutée ou retirée reste un écart de valeur (« ⟨absent⟩ »).
- Aucun email ne part : `resend` est remplacé par un bouchon, DocuSeal et Gemini sont factices, tout autre hôte est refusé
  (`scripts/lib/bouchons-test.js`, mode « capture ») : `fetch`, `http`/`https` `.request` et `.get`, et toute connexion
  TCP/TLS directe (garde sur `net.Socket.prototype.connect`). Le journal du bouchon est imprimé à la fin de chaque capture.
- Environnement de capture : valeurs fixes posées AVANT dotenv. Les variables `PRESTATAIRE_*` et `FACTURE_*` sont LUES
  (`docuseal-templates/generate.js:41-54`, PDF des contrats et factures) : leurs valeurs fixes empêchent la référence de
  capturer l'identité légale réelle du poste ; ne jamais les retirer du bouchon. Les variables « retirées »
  (`DOCUSEAL_PDF_FLOW`, `FACTURE_STRICT`, `GROQ_API_KEY`, `TELEGRAM_BOT_TOKEN`, `MESSENGER_*`) sont posées VIDES : une
  variable supprimée serait rechargée depuis le `.env` du poste par `dotenv` (que `src/app.js` rappelle). Tous leurs
  lecteurs testent une valeur : vide = absente. La capture s'arrête si l'une d'elles est non vide, avant ou après le
  chargement de l'application.
- Comptes éphémères `oracle-vocab-<domaine>-*@example.com`, supprimés par l'API admin ; domaine `oracle-miroir` créé
  puis supprimé ; base contrôlée avant / après. Puis `node scripts/check-invariant-config.js` doit rester à 0 écart.

## Ordre (`ordre-libre.json`, spec §2.4)

- Entrée SANS `cleTri` : requête sans `ORDER BY` ; toute permutation de la liste est admise (« ordre seul »).
- Entrée AVEC `cleTri` (pointeur dans l'élément : `/date_appro`, ou `/2` pour la 3ᵉ cellule d'une ligne d'onglet) :
  requête triée sur une clé NON UNIQUE. La capture écrit dans `meta.rangsTri` la suite des rangs de cette clé avant
  masquage. Si la suite est la même qu'à la référence, chaque groupe contigu d'ex aequo est trié dans les deux listes
  avant la comparaison : seules les permutations ENTRE EX AEQUO disparaissent ; toute autre permutation, et tout
  changement de la suite des rangs, restent des écarts. Cas actuels : `get_stock` et la feuille Stock du rapport
  (`ORDER BY s.date_appro DESC` : la sortie et l'entrée d'un transfert ont la même date). Écart déclaré à la lettre
  du §2.4 (« requête sans ORDER BY »), à acter par l'intégrateur.

## Ce que la référence contient d'attendu « en erreur »

- **8 exports en 500, voulus** (preuves des §11.1.4 et §11.1.7, données du §2.3) :
  - `05.inventaireLabo.L1`, `07.historiqueAproLabo.L1`, `08.transfertsLabo.L1` : « / » dans le nom d'onglet (labo
    « Réserve Nord / Est », §11.1.7) ;
  - `06.inventaireActivite.A1` : « — » dans `Content-Disposition` (activité « Terrasse du Lac — Salon », §11.1.4) ;
  - `05.inventaireLabo.LC`, `07.historiqueAproLabo.LC`, `08.transfertsLabo.LC` : apostrophe finale du nom d'onglet
    (§11.1.7), le nom portant aussi « ’ » hors Latin-1 pour `Content-Disposition` (§11.1.4, `inventaireController.js:932`,
    `laboController.js:1974`, `:2395`) ;
  - `10.pertesLabo.LC` : en-tête mort `pertesController.js:748` (« ’ », §11.1.4).

  La référence n'a donc AUCUN contenu de classeur pour ces 8 points d'entrée. Quand l'un passe à 200, l'intégrateur
  écrit ses écarts attendus (raisons `§11.1.4` / `§11.1.7`) et relit son contenu, qui n'a pas de comparaison possible.
  État après le socle (S1 + S2) : `06.inventaireActivite.A1` et `10.pertesLabo.LC` passent à 200 (`nomFichierSur`,
  en-tête mort supprimé) et leurs 9 écarts `§11.1.4` sont inscrits. Les 6 autres (`05`, `07`, `08` × `L1` / `LC`)
  restent à 500 tant que `ongletSur` n'est pas employé sur leur onglet à nom saisi (spec §6.3, lots B3a et B4).
  Un point qui resterait à 500 après la vague 1 trahit un assainisseur oublié.
- Les 3 résultats d'outils en erreur SQL (`get_referentiel`, `get_config_vente` ×2) de la première capture ont été
  corrigés avant le lot (fusion `afb298c`) ; la référence a été recapturée ensuite (`d03cc68`).
- Référence recapturée une 2ᵉ fois sur le code de `d03cc68` (corrections des relectures du socle, spec v2.2), avec le
  script de capture de la branche : clé `auth` + `client.abonnement` (`GET /api/abonnements/mon-abonnement` du client B,
  `config.composants`, §11.2.2), et 2ᵉ activité du compte B nommée « Étages "Nord" » (guillemet droit, §11.1.4).
  Arbre `git archive d03cc68`, base locale à la migration 192 (colonnes `genre` / `elision` présentes mais non lues
  par ce code : `meta.derniereMigration` le dit). Deux passages identiques. Preuves : contre l'ancienne référence, la
  seule différence est l'élément ajouté ; puis toutes les différences dues au nouveau nom s'expliquent par la seule
  substitution du nom (24 éléments), et les 2 autres sont des permutations entre ex aequo admises (`ordre-libre.json`).
  Écarts inscrits ensuite : `06.inventaireActivite.A2/disposition` (`§11.1.4`, « " » → « - ») et `genre` / `elision`
  des 3 composants de `config.composants` (`§11.2.2`).
- Référence recapturée une 3ᵉ fois après la fusion de `develop` = `589cfb1` (correctif de sécurité : `GET
  /api/rapports/filters` ne renvoie plus que les catégories du compte). Arbre `git archive 589cfb1` + les 2 exports
  neutres de l'oracle (§2.7, fichiers de `d03cc68`) + scripts de l'oracle de la branche ; base locale à la migration 192.
  Deux passages : identiques pour le contrôle (une permutation entre ex aequo admise, feuille Stock de `rapportIA`).
  Contre l'ancienne référence, seul `tableauxDeBord/rapports.filters` change (catégories du compte B seulement). Les 2
  exceptions hors restauration qui couvraient les catégories des autres comptes sont retirées (sans emploi).

## Lot 2c (étape O, spec `docs/lot-2c-spec.md` §2)

### Captures ajoutées (§2.3)

- `manuel` : `GET /api/manuel` pour 6 lecteurs (`client.A`, `client.B`, `gerant.B`, `client.C`, `acheteur.C` lu avant sa
  suppression, `admin`). `manuel.lecteurs.<lecteur>` = slugs reçus dans l'ordre ; `manuel.sections.<slug>` = la section telle
  que l'API la renvoie, une fois par slug (restauration : union des 6 lecteurs ; ailleurs : des 5 lecteurs hors admin ; deux
  lecteurs d'une union qui reçoivent le même slug différemment arrêtent la capture). `meta.empreintesManuel.<lecteur>.<slug>` =
  md5 du JSON BRUT (non masqué, `id` retiré, `updatedAt` gardé) ; `meta.sectionsParLecteur` ; un lecteur à 0 section arrête
  la capture. Le compte par clé de `manuel` vaut 2 (lecteurs, sections) : la non-vacuité par lecteur est tenue par la capture.
- `recherchesDomaine` : les 5 recherches fixes en gabarits balisés (`fixe|<gabarit>`, rendues avec le vocabulaire du domaine,
  compte B ; en restauration, rendu = recherche fixe, vérifié) ; les questions du guide de mise en route des comptes A, B, C
  (`<compte>|<question>`, chacune avec SON compte) ; « Comment créer <mon composant> ? » par composant actif `activite` /
  `labo` du domaine (`composant|<question>`, compte A). Appels sans `voc` (repli de `executeToolCall`).
- `recherches` : 6ᵉ question sans résultat, « zzz qwerty » (liste `disponibles`).
- Garde R2.8.3 : `--reference` refuse d'écrire si `_migrations` contient 194, 195 ou 196 (retirée dans `develop` après D2).

### Contrôles ajoutés (§2.4)

- Restauration : `meta.empreintesManuel` égales à celles de la référence, lecteur par lecteur, slug par slug, ordre compris ; un
  écart est un échec qu'aucune entrée de `ecarts-restauration-attendus.json` ne peut admettre (I1, PDF compris, R2.6.1).
- Hors restauration : famille `manuel` (`manuel/sections/<slug>/titre|partie|contenu`, jamais `motsCles` ni l'admin) et
  famille `assistant` étendue (`recherches`, `recherchesDomaine` : titres et contenus des résultats de la BASE, titres de
  `disponibles`). Passages exclus au balisage retirés avant la recherche (`extrait` des fichiers
  `scripts/manuel/balise/manuel/<slug>.json`, `scripts/manuel/variantes/<domaine>/<slug>.json`, et
  `scripts/manuel/balise/base/*.json` pour une entrée retrouvée par son titre rendu avec `meta.lexique`) ; aucune exception par
  forme dans `exceptions-hors-restauration.json` pour ces textes. `MOTS_HORS_LEXIQUE` ne s'y applique pas (R2.4.3).
  Limite : un extrait qui contient un passage masqué par la capture (date, référence « BL-… ») n'est pas retrouvé ; sa forme
  reste signalée.
- Échecs : « [[ », « ]] » ou « ‹clé› » dans les familles `manuel` et `assistant` ; résultat du manuel dont la citation n'est
  celle d'aucune fiche servie, ou dont le contenu n'est pas le début de la fiche (suivi de « … » s'il est coupé) ; empreintes du
  lecteur `admin` ≠ référence restauration (I4) ; clé de `recherchesDomaine` sans résultat ; mots-clés servis sans la forme
  `nom` du domaine d'une clé que le domaine change et que les mots-clés d'origine portent comme entrée (R2.4.4) ; comptes des
  familles `manuel` et `assistant` au-dessus de la liste avant (une fois celle-ci écrite par ce scan, `scan2c`).
- Rapports (non bloquants, R2.4.6) : terme du domaine dans les 4 résultats, par clé ; première fiche du manuel de la référence
  parmi les 4 résultats d'une recherche fixe ; fiche `activites` parmi les 4 résultats d'une question de composant.
- `--hors-manuel` : les formes du manuel et des recherches ne font pas échouer ; le contrôle des mots-clés (famille manuel) est
  un rapport ; tout le reste échoue comme sans l'option. Porte de S, de A et des vagues : 0 dans les trois domaines.

### Base locale protégée (§2.8)

`node scripts/manuel/base-locale.js photo | copie | etat | supprimer` (intégrateur seul, connecté à la base `postgres`, hôte local
seulement). Photo `fiche_technique_avant2c` prise le 03/10/2026 vers 01:10, base à la migration 192, empreintes du manuel
`67737956d92ba0e1d836c17747d66f5c` et de la base `8779fd652a4a4dd50531e9e3323aaad6` (celles de `DECISIONS-2c.md`).

### Recapture du 2c (étape O, 03/10/2026)

- Archives d'abord : `ecarts-restauration-attendus.json` (109 entrées du 2b) → `archives-2b/`, remplacé par `[]`.
- Mesure de R2.2, une fois : capture restauration COMPLÈTE de `develop` (`863f8f0`) dans un arbre à part (`git archive`, scripts
  de l'oracle de la branche, `.env` copié puis supprimé, jonction `node_modules` retirée par `cmd /c rmdir`), base locale à la
  migration 192. Puis commit R2.2 seul (`aiToolHandlers.js` : base `ORDER BY id`, manuel `ORDER BY ordre, id`).
- Référence : capture restauration sur la branche (R2.2 compris), deux passages identiques à l'octet (même md5 du fichier).
  Comparée à la capture de `develop` (fichier d'écarts vide) : 94 écarts et 27 « ordre seul », TOUS sous `recherches/` et
  `recherchesDomaine/` ; empreintes du manuel égales pour les 6 lecteurs ; aucune autre clé ne bouge.
- Recherches fixes (`recherches`) changées par R2.2, comme mesuré par la spec (§2.2) :
  - ordre seulement : « créer un labo » (« Stock Labo » et « Le modèle : compte, activités, labos » permutés), « transfert vers
    une activité » (« Stock Activités » passe 2ᵉ) ;
  - ensemble : « calcul du food cost » (« Coût de revient d'une recette » et « Valeur du stock » remplacés par « Lexique de A à
    Z » et « Charges »), « inventaire de fin de mois » (« Comptes gérants » remplacé par « Tableau de bord »), « inviter un
    acheteur » (« Assistant IA » remplacé par « Parcours de démarrage ») ;
  - « zzz qwerty » (`disponibles`, 25 titres de la base par `id`) : sortent « Unité de mesure », « Timbre fiscal », « Rapport
    (Excel / PDF) », « Référentiel articles », « Charges fixes » ; entrent « Gérant », « Fournisseur », « Abonnement et
    capacité », « Article vendable », « Prestataire de livraison ».
- `recherchesDomaine` : 51 clés sur 56 changées (28 d'ensemble, 23 d'ordre seul) ; liste dans
  `recherches-avant-ordre.json` (`resume`). Différence listée au §10.2, point 1 de la spec ; jamais affichée à un client.
- Listes de travail (`--liste-avant`, captures du 03/10 sur la branche) : hotellerie 647 formes (manuel 552, assistant 95),
  ceramique 835 (manuel 678, assistant 157), miroir 1 323 (manuel 1 070, assistant 253) ; 0 hors manuel et recherches dans les
  trois domaines (`--hors-manuel`). Une « forme » = une forme par défaut distincte dans un texte lu (même compte qu'au 2b).

## Scan hors restauration (§2.5)

- Textes lus : ceux du §2.5 point 3, ligne de contexte comprise (`contexte/<compte>/line`). Les étiquettes de capture
  de l'oracle (clés de premier niveau des captures) ne sont jamais lues comme du texte.
- Les NOMS DE FICHIERS (`Content-Disposition`, pièces jointes, `rapportIA.nomFichier`) ne sont PAS lus : hors lot 2b
  (spec §0 « Noms de fichiers téléchargés (I2) », §6.3). En restauration, ils restent comparés à l'identique. Le type
  `nom-de-fichier` sert à un nom de fichier cité DANS un texte lu.
- Exceptions typées posées à l'étape O : `2c` (outil de recherche), `fiscal` (facture acheteur), `code-api` (noms de
  champs DocuSeal), `formule` (« Activité Premium »), `homonyme` (« Domaine d'activité », « ARTICLE n » des contrats,
  « article » générique du §6.5 : en-tête de l'export « Ventes du labo », description de `get_config_vente`).
  Restent à typer après leur vague : l'« article » générique de `aiService.js:34`, `:49` (le prompt est UN texte : une
  exception par forme l'éteindrait en entier), et les libellés de contrat qui relèvent du lot 3.
