# Outils du manuel (lot 2c)

Ce dossier porte les outils du lot 2c : le manuel (`manuel_sections`, 61 fiches) et la base de connaissances
(`ai_knowledge_base`, 32 entrées) dans les mots du domaine du compte.

Ce qui fait foi :
- la spécification `docs/lot-2c-spec.md` : §3 pour les outils, §2.8 pour la base locale, §4.5 pour le retour arrière,
  §9 pour les lots ;
- le guide des agents de balisage, `GUIDE-BALISAGE.md` (règles d'écriture, exemples rendus par le vrai moteur).

## Règles communes

- **Moteur unique.** Le rendu et le contrôle sont ceux du serveur : `src/utils/vocab.js` (généré depuis le front) et
  `src/utils/manuelRendu.js` (étape S0). Aucun outil n'en garde de copie.
- **Lexiques résolus (R3.1.1).** Un lexique lu est une liste d'ÉCARTS : `test/vocab-lexiques-test.json`,
  `domaines.json`, le fichier `--lexique` tiré de la lecture de production. Tout outil construit son vocabulaire par
  `lib/vocabulaires.js`, soit `vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, ecarts))`.
- **LF partout.**
  - `.gitattributes` (racine du dépôt) : `scripts/manuel/** text eol=lf` et `migrations/*.sql text eol=lf`.
  - `lib/commun.js` refuse de lire ou d'écrire un fichier de ce dossier qui contient « \r ».
  - Le test `origine.test.js` le vérifie sur tout le dossier, `rendus/` excepté.
- **La base n'est jamais modifiée**, sauf par trois outils :
  - l'essai de migration, toujours annulé (§3.7) ;
  - `base-locale.js` (§2.8) ;
  - `retour-2c.js` (§4.5).
- **L'intégrateur seul** lance `extraire-origine.js`, `base-locale.js` et le générateur quand il écrit dans
  `migrations/`. Il est aussi le seul à modifier `parties.json`, `lots.json` et `domaines.json`.
- **Un agent de balisage** n'emploie que `prebaliser.mjs` (sur ses fiches) et `controler.mjs --lot <lot>`
  (GUIDE-BALISAGE §1).
- **`rendus/`** n'est pas versionné (`.gitignore`).

## Contenu du dossier

| Fichier | Rôle | État |
|---|---|---|
| `README.md` | ce mode d'emploi | M0 |
| `GUIDE-BALISAGE.md` | guide des agents (spec §7), exemples rendus par le vrai moteur | M0 |
| `extraire-origine.js` | instantané d'origine, une fois, lecture seule (§3.2) | M0, **lancé le 03/10/2026** |
| `origine/manuel/<slug>.md`, `.json` ; `origine/base/<fichier>.md`, `.json` | instantané figé : 61 fiches, 32 entrées | écrit par `extraire-origine.js` |
| `domaines.json` | hotellerie et ceramique : écarts ET lexique résolu, composants actifs, description | écrit par `extraire-origine.js` |
| `parties.json` | les 12 parties, origine → balisée | M0 (intégrateur) |
| `lots.json` | répartition des fichiers par lot (§9.2) ; **fait foi** | M0 (intégrateur) |
| `prebaliser.mjs` | brouillon de balisage (§3.4) | M0 |
| `controler.mjs` | contrôle par fiche, variantes, `--tout` (§3.5) | M0 |
| `generer-migrations.mjs` | SQL de 194, 195, 196 et champs admis sans balise (§3.6) | M0 |
| `essai-migration.js` | migration appliquée puis annulée (§3.7) | M0 |
| `retour-2c.js` | retour arrière (§4.5), remise à zéro locale (R2.8.4) | M0 |
| `base-locale.js` | photo et copies de la base locale (§2.8) | étape O |
| `lib/commun.js` | chemins, LF, instantané, empreintes, exclusions, `lots.json`, `parties.json` | M0 |
| `lib/vocabulaires.js` | vocabulaires résolus (R3.1.1), cohérence des lexiques | M0 |
| `lib/exemples-guide.js`, `lib/exemples-guide.json` | exemples et tableaux du guide, rendus par le moteur | M0 |
| `test/*.test.js`, `test/*.test.mjs` | tests des outils (`node --test`) | M0 |
| `balise/manuel/` : 3 fiches témoins | `acheteurs-carnet`, `lexique`, `historique-paiements` (voir « Fiches témoins ») | M0, **reprises par L7, L1, L3** |
| `balise/…`, `variantes/…`, `relectures/…`, `besoins/…` | travail des lots (GUIDE-BALISAGE §1, §15) | vagues |
| `lecture-production.json` | lecture de production (§12.1), mise en forme par l'intégrateur ; exigée pour écrire dans `migrations/` | étape C |
| `rendus/<lot>/…` | rendus et rapports des outils, non versionnés | outils |

## `extraire-origine.js` : l'instantané d'origine (§3.2)

```
node scripts/manuel/extraire-origine.js              extraction (intégrateur, une fois) : base locale, lecture seule
node scripts/manuel/extraire-origine.js --verifier   sans base : empreintes globales recalculées sur les fichiers
```

**Comment il lit.**
- `BEGIN TRANSACTION READ ONLY … ROLLBACK`, variables `DB_*` du `.env`, hôte local seulement.
- Il écrit les fichiers du tableau ci-dessus, en LF, sans retouche du texte.
- `md5Garde` = md5 de `COALESCE(contenu_defaut, contenu)` sans « \r » : c'est la garde de la migration 194.
- `md5Contenu` = md5 du `contenu`.

**Quand il refuse** (rien n'est écrit) :
- `origine/` ou `domaines.json` existe déjà : l'instantané est figé (R3.2.3) ;
- un texte contient « [[ » (base déjà balisée) ou « \r » ;
- les empreintes globales de la base ne sont pas celles du 02/10 ;
- l'ordre `ORDER BY` de la base n'est pas l'ordre en points de code (les fichiers en dépendent pour recalculer
  l'empreinte) ;
- un md5 calculé en JavaScript diffère du md5 calculé en SQL.

**Après l'écriture**, il recalcule les empreintes sur les fichiers et les compare à celles de la base (R3.2.2). En cas
d'écart, il sort avec le code 1.

**Passage du 03/10/2026, vers 03 h 08, heure de Paris** (base `fiche_technique`, à la migration 193 qui ne touche pas
les textes) :
- 61 fiches, dont 5 à défaut NULL : `acheteurs-carnet`, `-module`, `-portail`, `-tarifs`, `-ventes` ;
- 0 fiche modifiée dans l'admin ;
- 32 entrées ;
- domaines : hotellerie (13 clés, 9 composants actifs) et ceramique (18 clés, 6 composants actifs) ;
- empreintes recalculées sur les fichiers : manuel `67737956d92ba0e1d836c17747d66f5c`, base
  `8779fd652a4a4dd50531e9e3323aaad6`, égales à la base et à `DECISIONS-2c.md`.

**Si la production diffère** (lecture (1), (3) ou (4) de `scripts/controle-avant-2c.sql`, §12.1) :
1. réextraire les fiches et les entrées concernées à partir du texte de production renvoyé par le client ;
2. faire rebaliser ces fichiers par la mini-vague R (§13) ;
3. noter ici ce qui a été réextrait.

`extraire-origine.js` ne lit que la base locale : cette réextraction se fait à la main, puis se contrôle avec
`--verifier` (les empreintes attendues changent alors).

## `domaines.json`

Pour chaque domaine (hotellerie, ceramique), le fichier garde :
- `ecarts` : `domaines_activite.lexique` tel qu'en base ;
- `lexique` : sa résolution par le moteur, pour la lecture et le contrôle ;
- `composants` : composants actifs, forme de `mapComposant` (libellé, pluriel, type technique, genre, élision, ordre) ;
- `description` ;
- `md5Lexique` : md5 de `lexique::text`, comparable à la lecture (7) de production.

`lib/vocabulaires.js` lit ce fichier :
- `vocabDuDomaine(slug)` construit le vocabulaire sur les écarts, résolus ;
- `composantsDuDomaine(slug)` rend les composants actifs ;
- `verifierLexiques()` contrôle deux choses : le lexique résolu gardé égale celui du moteur courant, et les lexiques H
  et C de `test/vocab-lexiques-test.json` égalent ceux de `domaines.json`. C'est le contrôle de démarrage de
  `controler.mjs` (§3.1) : liste vide au 03/10.

Test de M0 de R3.1.1 (`test/vocabulaires.test.js`) : l'exemple 8 du §7.7 se rend en H
« | Espace Cuisine | Stock de la cuisine centrale, … ». Sans résolution, il donnerait « Espace Labo ».

## `parties.json`

Les 12 parties, `{ ordre, origine, balisee }`, dans l'ordre du guide. 6 formes dans 5 parties : « Référentiel »,
« Espace Produit », « Stock & Appro » (`[[Nom:stock]] & [[Court:appro]]`), « Espace Vente », « Espace Acheteurs ».

`test/parties-lots.test.js` vérifie :
- I10 et I11 ;
- aucune forme hors balise ;
- 60 caractères au plus ;
- 12 rendus distincts par défaut, en H, en C et en miroir (`GuidePage.tsx` regroupe la navigation par texte de
  partie).

`lib/commun.js` donne la forme balisée d'une partie : `partieBalisee(origine)`.

## `lots.json`

La répartition qui fait foi (spec §9.2). Pour chaque lot :
- `vague` ;
- `relecteur` (paires du §9.4) ;
- `fiches` (L1 à L8), `base` (L9), ou `domaine` et `variantes` (V-*) ;
- `formes` et `taille`, recalculées sur `origine/` par le test, égales au tableau du §9.2 : 3 341 formes dans les
  fiches, 249 dans la base.

Chaque fiche est dans un lot et un seul, les 32 entrées sont dans L9, et les 8 fiches des variantes sont dans la
vague 1. Pour trouver le lot d'une fiche : `lotDe(slug)` (ou `lotDe(fichier, { base: true })`).

## `prebaliser.mjs` : le brouillon de balisage (§3.4)

```
node scripts/manuel/prebaliser.mjs <slug>…              fiches données (lot lu dans lots.json)
node scripts/manuel/prebaliser.mjs --lot <lot>          toutes les fiches du lot (L9 : les 32 entrées)
node scripts/manuel/prebaliser.mjs --base <fichier>…    entrées de la base
  --remplacer         réécrit un brouillon existant (sinon refus)
  --sortie <dossier>  racine de sortie à la place de scripts/manuel/ (essais, tests)
```

**Ce qu'il écrit.**
- `balise/manuel/<slug>.md` et `.json`, au format `{ slug, titre, exclusions, baliseur, relecteur }`.
- Pour la base : `balise/base/<fichier>.md` et `.json`, au format `{ cle, titre, exclusions, baliseur, relecteur }`.
- `rendus/<lot>/a-baliser.json`, avec `nonBalisees` et `aVerifier` par fiche. Une passe partielle remplace seulement
  les fiches passées.

**Ses règles et ses limites** sont dans GUIDE-BALISAGE §9.

**Sa garde.** Avant toute écriture, chaque champ est contrôlé :
- son rendu par défaut égale l'origine, en octets (I10) ;
- `verifierBalises` le trouve valide (I11).

Une fiche fausse arrête tout (code 1), sans aucune écriture.

**Essai sur les 3 fiches témoins**, dans un dossier jetable (`acheteurs-carnet` à défaut NULL, `lexique`,
`historique-paiements` sans terme) : rendu par défaut identique à l'octet (`test/prebaliser.test.mjs`).

**Sur tout le manuel (essai en mémoire, rien d'écrit dans `balise/`).**

| Mesure | Fiches (contenu et titre) | Base |
|---|---|---|
| Formes | 3 341 | 249 |
| Balisées | 3 083 | 236 |
| En locution | 52 | 11 |
| Dans une cible de lien | 200 | — |
| Laissées et listées | 6 | 2 |
| À vérifier | 150 | 12 |

I10 tient partout.

## Fiches témoins (`balise/manuel/`)

M0 a écrit 3 fiches balisées pour essayer les outils de bout en bout (contrôle, générateur, essai de migration, retour) :

| Fiche | Lot | Pourquoi |
|---|---|---|
| `acheteurs-carnet` | L7 | défaut NULL (`contenu_defaut` posé par la 194, remis à NULL par le retour) ; titre et partie balisés |
| `lexique` | L1 | la plus longue (10 358 caractères), exclusions `locution` et `homonyme`, cibles de liens porteuses de formes |
| `historique-paiements` | L3 | sans terme : fichier identique à l'origine, non écrite par la 194 (NOTICE « sans terme ») |

Ce sont des **brouillons du pré-baliseur**, contrôlés verts sur les points 1 à 6. Deux reprises à la main dans
`lexique`, toutes deux prévues par la spec : « Laboratoire central » balisé comme l'exemple 12 (§7.5), avec les accords
de la même phrase ; « Le labo produit et vend » (verbe) laissé en clair, exclusion `homonyme` (GUIDE §4).
Les signalements 7 à 12 ne sont **pas** traités (34 pour `lexique`, 1 pour `acheteurs-carnet`) : `relectures/` est au
baliseur du lot.

**Ces 3 fichiers sont repris par les lots L7, L1 et L3**, qui en deviennent propriétaires (§9.3). Comme ils existent,
`prebaliser.mjs --lot L1` (L3, L7) refuse d'écrire (« brouillon déjà présent ») : pré-baliser les autres fiches du lot
par leur slug (`prebaliser.mjs lexique-pt gerants`), ou repartir du pré-baliseur pour tout le lot avec `--remplacer`.

## `controler.mjs` : le contrôle par fiche (§3.5)

```
node scripts/manuel/controler.mjs <slug>…                     fiches données
node scripts/manuel/controler.mjs --lot <lot>                 fiches du lot (L9 : les 32 entrées ; V-* : ses variantes)
node scripts/manuel/controler.mjs --base <fichier>…           entrées de la base
node scripts/manuel/controler.mjs --variante <domaine> <slug>…   variantes (hotellerie, ceramique)
node scripts/manuel/controler.mjs --tout                      tout, contrôles d'ensemble, rapport « mots du métier » (intégrateur)
  --lexique <fichier>   lexique Hôtellerie de la lecture de production (écarts, résolus) à la place du lexique d'essai (§12.1)
  --lecture <fichier>   avec --lexique : lecture de production à comparer (défaut : scripts/manuel/lecture-production.json)
  --racine <dossier>    racine des fichiers de travail (balise/, variantes/, relectures/, rendus/) : essais, tests
```

**Une fiche passe si les points 1 à 6 passent** (code 0). Le détail des 12 points est dans l'en-tête du script. Ce qui
est propre à l'outil :
- **Cibles de liens.** Elles sont masquées avant la recherche des résiduels (point 3) : ni balise ni exclusion.
- **Trait d'union.** Une balise (hors `acc`, `accN`, `ex`) collée à un tiret est un échec du point 3 :
  « sous-[[nom:pt]] » rendrait « sous-préparation » en H alors que l'identité passe (R3.4.3).
- **Points 7 et 9 (intégrateur B1, besoins L2-2 et L2-1).** Le point 7 retire les marques d'emphase (`**`, `*`, `_`)
  avant de chercher les répétitions (« **sites de production** de production ») ; le point 9 signale aussi les
  contractions manquées « de le », « de les », « à le », « à les » (« Création de le premier service »).
- **`--lexique`.** Le fichier est une liste d'écarts (`{ cle: { sg, pl, g, el… } }`, ou `{ lexique: … }` /
  `{ ecarts: … }`). Refus (code 2) : une clé hors du lexique (fichier enveloppé, `{ "hotellerie": { … } }`), des écarts
  qui donnent le lexique par défaut (`{}`), un `md5Lexique` d'enveloppe qui ne correspond pas aux écarts, ou un md5
  différent du champ `hotellerie.md5Lexique` de la lecture de production (`--lecture`, sinon
  `lecture-production.json` s'il existe). Le md5 de `lexique::text` (texte JSONB de PostgreSQL, reproduit par
  `jsonbTexte` de `lib/vocabulaires.js`) est affiché ; un lexique que la validation du serveur refuserait est lu
  avec un avertissement.
- **Exclusions.** Appliquées dans l'ordre de la liste, sur le contenu et le titre balisés réunis (`retirerExtraits`).
  Chacune : type de la liste fermée, `justification`, `extrait` sans balise qui contient une forme par défaut (sinon
  « sans emploi »), `forme` présente dans l'extrait, `occurrences` exact, extrait retrouvé dans chaque rendu.
- **`contenu_defaut`** : md5 du rendu par défaut = `md5Garde` de l'origine (pour les 5 fiches acheteurs, le contenu).
- **Signalements 7 à 12** : une ligne par fiche, point, domaine et texte (`texte` = ce que l'outil affiche ; pour le
  point 12, le mot au singulier). Acceptation : `relectures/<lot>.auto.json`,
  `{ fiche, point, domaine, texte, decision: "accepté", raison }` ; `domaine` absent = tous les domaines.
  Les points 7 à 9 ne signalent que ce qui est absent du rendu par défaut ; le point 12 ne cherche que les formes du
  domaine qui diffèrent du défaut (pas les fragments « fabriqué », « livraison » du tableau du §10.3).
- **`--tout`** n'est vert que si toutes les fiches, entrées et variantes présentes passent, si les contrôles d'ensemble
  passent (parties, titres du manuel et titres de la base rendus distincts dans les 4 vocabulaires, titres balisés de la
  base uniques sans casse, longueurs, `baseMd5`), s'il ne reste aucun signalement « à traiter » et aucune acceptation
  sans objet. Rapport : `rendus/tout.json`.
- **Variantes** : points 2 à 6 dans leur domaine, plus : forme du lexique DU domaine en clair = échec (sauf exclusion),
  caractère que le PDF écrirait « ? » (`HORS_POLICE` et `EQUIVALENTS` lus dans `src/utils/pdfTexte.ts` du front),
  titre rendu égal à un autre titre, `baseMd5` périmé, variante hors des lots V-* ; liens et blocs = ceux de la fiche
  d'origine. Rapport « mots du métier » de la variante contre la fiche commune.
- **Mots du métier** : `MOTS_METIER_MANUEL` (R2.4.3) comptés sur le texte d'origine ; un mot qui fait partie d'une
  forme du lexique (« food » de « food cost ») ne compte pas. Jamais un échec.

Sorties (non versionnées) : `rendus/<lot>/<domaine>/<slug>.md` (en-tête : fiche, domaine, lexique, titre et partie
rendus ; puis le contenu rendu), `rendus/<lot>/controle.json`, `rendus/tout.json`.
Codes : 0 tout passe, 1 au moins un échec, 2 refus (usage, lexiques incohérents au démarrage, fichier `--lexique`
illisible, mal formé ou différent de la lecture de production).

## `generer-migrations.mjs` : les migrations 194, 195, 196 (§3.6, §4.2 à §4.4)

```
node scripts/manuel/generer-migrations.mjs --fiches <slug>…   essai partiel (M0, intégrateurs de vague)
node scripts/manuel/generer-migrations.mjs --lot <lot>        essai partiel d'un lot (L9 : 195 ; V-* : 196)
node scripts/manuel/generer-migrations.mjs --essai            essai complet (étape C, avant l'écriture)
node scripts/manuel/generer-migrations.mjs                    écriture dans migrations/ et src/config/ (consolidation)
  --dossier <d>              dossier d'essai (défaut : rendus/essai-migrations/), jamais migrations/
  --slug hotellerie=<slug>   slug de production du domaine (R3.6.4 ; idem ceramique=…), tirets admis
  --lecture <fichier>        lecture de production (défaut : scripts/manuel/lecture-production.json)
  --racine <d>               comme controler.mjs
```

- Il ne lit **jamais** la base. Un fichier n'est écrit que s'il porte au moins un élément ; une fiche ou une entrée dont
  le balisé égale l'origine n'est pas écrite (NOTICE « sans terme »).
- SQL : un bloc `DO` par fichier, chaque texte balisé écrit une fois (variable `t`), étiquettes sans tiret
  `$m194_<slug>$`, `$k195_<rang>$`, `$v196_<domaine>_<slug>$` (tirets du slug de domaine compris) ; chaînes courtes
  entre apostrophes doublées (« Carnet d''Acheteurs ») ; aucun `BEGIN`, `COMMIT`, `updated_at`, `mots_cles`.
- La ligne `-- inventaire : {…}` de chaque fichier dit ce qu'il écrit ; l'essai de migration en tire les NOTICE
  attendues.
- `manuelSansBaliseAdmis.json` (R3.6.5) : champs (titre, partie, contenu ; titre, contenu de la base) qui portent une
  forme par défaut et aucune « [[ » dans le texte écrit en base, même règle que `champsSansBalises` du serveur. En essai :
  dans le dossier d'essai ; à l'écriture : `src/config/manuelSansBaliseAdmis.json`.
- Refus (rien n'est écrit, code 1) : ceux du §3.6.2 (liste dans l'en-tête du script). En partiel, le contrôle exigé est
  « points 1 à 6 de chaque élément du périmètre » ; en essai complet et à l'écriture, `controler --tout` vert.
- **Écrire dans `migrations/`** exige en plus : `lecture-production.json` présent et conforme, les 16 variantes de
  `lots.json`, et aucun fichier 194 à 196 étranger dans `migrations/`. **Au 03/10/2026, la lecture de production manque :
  l'écriture est refusée** (vérifié, `test/generer-migrations.test.mjs`).

**`lecture-production.json`** (intégrateur, à partir de la sortie de `scripts/controle-avant-2c.sql` collée par le
client) :

```json
{
  "le": "2026-10-..", "source": "sortie de controle-avant-2c.sql collée par le client",
  "empreintes": { "manuel": "<lecture (1)>", "base": "<lecture (1)>" },
  "retoursChariot": { "fiches": 0, "entrees": 0 },
  "fichesModifiees": [],
  "hotellerie": { "slug": "hotellerie", "md5Lexique": "<lecture (7)>" }
}
```

Les empreintes doivent égaler celles des fichiers d'origine (`extraire-origine.js --verifier`) : si la production
diffère, réextraire et rebaliser d'abord (R3.2.2, mini-vague R). Si le slug Hôtellerie diffère : `--slug hotellerie=…`.

## `essai-migration.js` : migration appliquée puis annulée (§3.7)

```
node scripts/manuel/essai-migration.js                    SQL de rendus/essai-migrations/
node scripts/manuel/essai-migration.js --dossier <d>       SQL d'un autre dossier d'essai
node scripts/manuel/essai-migration.js --migrations        194 à 196 de migrations/ (après l'étape C : DB_NAME=fiche_technique_2c)
```

Une transaction, **toujours annulée** : 193 si la table manque ; les fichiers et leurs lignes `_migrations` ; NOTICE ;
61 fiches et 32 entrées relues et rendues par défaut avec les fonctions du serveur (`rendreFiche`,
`rendreEntreeBase`), égales à l'origine octet pour octet ; Hôtellerie (profil de `getProfil`, requête du §5.2) sans
balise, brouillons de la 196 validés dans un point de sauvegarde annulé ; 2e passage « déjà balisée » ; `retour(client)`
de `retour-2c.js`. Après le `ROLLBACK` : empreintes globales, table des variantes et `_migrations` comme avant.
Refus si la base n'est pas au texte d'origine (balises, empreintes ≠ fichiers d'origine, 194 à 196 déjà inscrites) ou si
l'hôte n'est pas local. Compte rendu : `rendus/essai-migration.json`.

## `retour-2c.js` : retour arrière (§4.5, §12.4) et remise à zéro locale (R2.8.4)

```
node scripts/manuel/retour-2c.js --essai                     tout, puis ROLLBACK (à lancer d'abord)
node scripts/manuel/retour-2c.js                             tout, puis COMMIT
node scripts/manuel/retour-2c.js --remise-locale [--essai]   base locale seulement (+ 16 brouillons, + ligne 196)
```

À lancer dans le conteneur du serveur en place (terminal Coolify du backend) **avant** de remettre un ancien serveur sur
une base balisée. Chaque champ balisé est remplacé par son rendu par défaut (I10 : le texte d'origine) ;
`contenu_defaut` revient à NULL pour les 5 fiches acheteurs ; 194 et 195 quittent `_migrations` ; ce qui n'a pas pu
être remis est listé (code 1). `updated_at` n'est jamais touché. `retour(client)` est exporté sans `BEGIN` ni
`COMMIT` : l'essai l'appelle dans sa propre transaction.

## Conventions partagées par les outils

- **Vocabulaires.** `lib/vocabulaires.js` donne `vocabulairesEssai()` (H, C et miroir résolus, pour le point 6) et
  `verifierLexiques()` (contrôle de démarrage du §3.1). Toute liste d'écarts lue (`--lexique`) est résolue (R3.1.1).
- **Origine.** `lib/commun.js` donne `lireOrigine()` (les md5 sont recalculés à la lecture), `empreintesOrigine()` et
  `partieBalisee()`.
- **Exclusions.** `retirerExtraits(textes, exclusions)` applique les exclusions **dans l'ordre de la liste**, par
  split/join, comme l'oracle (`check-invariant-vocab.js`, R2.4.2). `occurrences` = emplois sur le contenu et le titre
  balisés réunis. Le pré-baliseur, le contrôle et le guide (§4) suivent cette règle.
- **Cibles de liens `(#slug)`.** Elles portent 200 formes par défaut dans 185 cibles. Ni balisées ni exclues (GUIDE §4) :
  le point 3 de `controler.mjs` les masque, le pré-baliseur les compte à part (`ciblesDeLien`). **L'oracle
  (`check-invariant-vocab.js --domaine`) doit faire de même** sur le manuel servi, sinon ces formes y seront comptées.
- **Formats des relectures et des besoins** : GUIDE-BALISAGE §15.

## `lib/` : module partagé (CommonJS, syntaxe de Node 20)

Un `.mjs` l'importe par `createRequire(import.meta.url)`. La syntaxe de Node 20 permet à `retour-2c.js` de s'en servir
dans le conteneur.

**`commun.js`**
- `RACINE`, `DOSSIER`, `CHEMINS`, `chemins(racine)` ;
- `md5` ;
- `lireTexte` / `ecrireTexte` (LF, « \r » refusé), `lireJson` / `ecrireJson`, `lireJsonExterne` (fichier hors du
  dossier, CRLF toléré) ;
- `nomFichierBase(titre)` ;
- `empreinteManuel(fiches)` / `empreinteBase(entrees)` : requête (1) de `controle-avant-2c.sql` ;
- `lireOrigine()`, `empreintesOrigine()`, `EMPREINTES_ATTENDUES` ;
- `retirerExtraits(textes, exclusions)` ;
- `lireLots()`, `lotDe(nom)`, `lireParties()`, `partieBalisee(origine)`, `lireDomaines()`.

**`vocabulaires.js`**
- `resoudre(ecarts)`, `vocabDesEcarts(ecarts)` ;
- `vocabDuDomaine(slug)`, `composantsDuDomaine(slug)` ;
- `vocabulairesEssai()`, `lexiquesEssai()` ;
- `verifierLexiques()`, `vocabDuFichier(fichier)` ;
- `memeLexique(a, b)`, `vocabDefaut`, `LEXIQUE_DEFAUT`.

**`exemples-guide.js`**
- `exemples()`, `tableMarkdown()`, `tableAide()`, `tableCles()`, `guideAJour(texte)` ;
- en ligne de commande : `--guide` régénère les trois tableaux de GUIDE-BALISAGE.md (après une correction des
  lexiques) ; `--cles` imprime le tableau des clés ; sans option, imprime le tableau des exemples.

## Tests

```
node --test "scripts/manuel/test/*.test.*"
```

Il faut le motif entre guillemets : `node --test scripts/manuel/test/` échoue sous Node 25. Ces tests ne lisent aucune
base et n'écrivent que dans le dossier temporaire du système (`essai-migration.js` se lance à part : il ouvre une
transaction sur la base locale, toujours annulée). `npm test` ne les lance pas : il ne lit que
`test/**/*.test.js`.

| Fichier | Ce qu'il prouve |
|---|---|
| `origine.test.js` | R3.2.2 (empreintes sur les fichiers), R3.2.1 (champs, défauts NULL, noms de fichier), aucun « \r » dans le dossier |
| `vocabulaires.test.js` | R3.1.1 (exemple 8 = « Espace Cuisine »), cohérence de `domaines.json` |
| `parties-lots.test.js` | `parties.json` (I10, I11, rendus distincts), `lots.json` (couverture, chiffres du §9.2, relecteurs) |
| `prebaliser.test.mjs` | 3 fiches témoins à l'octet, I10 et I11 sur 61 fiches et 32 entrées, règles R3.4.1 à R3.4.4 |
| `guide.test.js` | tableaux du guide à jour ; exemples « justes » identiques par défaut ; origines exactes |
| `controler.test.mjs` | les 3 témoins verts et leurs rendus ; R3.1.1 par `controler.mjs` (« Espace Cuisine ») ; points 1 à 6 en échec un par un ; cibles de liens masquées ; signalements 7 à 12 sur les exemples de la spec, contractions et répétitions coupées par une marque d'emphase (B1) ; acceptations ; `--tout` ; variantes ; `--lexique` |
| `generer-migrations.test.mjs` | chaînes SQL et étiquettes sans tiret ; 194 des témoins (LF, en-tête, inventaire, gardes, déterminisme) ; 196 avec `--slug` à tiret ; 195 et apostrophes ; champs admis ; refus du §3.6.2 ; écriture dans `migrations/` refusée sans lecture de production |
| `retour-essai.test.js` | `retour(client)` sur un faux client : origine, défauts NULL, `_migrations`, non remis, sans `BEGIN` ni `COMMIT` ; `--remise-locale` (16 brouillons) et son refus hors local ; lecture des fichiers d'essai |

## `.gitattributes` et fins de ligne (§3.8)

Mesure du 03/10, `git ls-files --eol` après l'ajout du fichier :
- `migrations/` : 186 fichiers, tous `i/lf` (184 `w/crlf`, 2 `w/lf`), attribut `text eol=lf` ;
- `scripts/manuel/` : `base-locale.js` `i/lf w/lf`.

`git status` ne montre que `.gitattributes` comme nouveau fichier : aucun fichier suivi ne passe à « modifié ».

**Aucune renormalisation à faire** : les blobs de l'index sont déjà tous en LF. Les copies de travail en CRLF le
restent jusqu'à leur prochaine sortie de git, puis passent en LF. Les nouveaux fichiers de ce dossier et les
migrations générées (194 à 196) sont écrits en LF et le resteront.
