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
| `hors-restauration-avant.json` | Liste de travail de l'étape O : formes par défaut trouvées par domaine, chiffrées par famille. Complète depuis S1 (clés `*_abr` comprises) pour hotellerie, ceramique et miroir ; son `_lisezmoi` ne la dit « incomplète » que si un domaine a encore des clés absentes du moteur de son passage. **Réécrite à l'étape O du lot 2c** (`scan2c: true`) : famille `manuel` (manuel servi) et famille `assistant` étendue aux résultats de la recherche ; ses comptes `manuel` et `assistant` ne doivent jamais monter (R2.4.7). **Relancée pour la réserve R1** (R2.4.8, 03/10/2026) : la famille `assistant` compte aussi la clé `baseParTitre`. **Relancée à l'intégration de M0 ∥ S ∥ A** (03/10/2026) : les mots-clés enrichis (R5.4) changent le classement de la recherche hors restauration ; seule la famille `assistant` change (voir « Intégration de M0 ∥ S ∥ A » plus bas). |

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
- Refus aussi quand la date locale n'est pas la date UTC (`getDate() !== getUTCDate()`) : heure de Paris, de 00:00 à 02:00 en
  été et de 00:00 à 01:00 en hiver. Le serveur calcule le mois de la mensualité en UTC (`abonnementController.js:506-508` :
  `setDate(1)` puis `toISOString()`) alors que la promotion « 1er mois offert » porte sur le mois UTC
  (`clientsController.js:424`) : dans cette fenêtre, la mensualité du compte B passe de « 0.00 / gratuit » à « 760.00 /
  en_attente » (`auth/client.abonnement/paiements/0`), un faux écart sans aucune modification (relecture de l'étape O du 2c).
  Défaut réel de l'application sur un serveur qui ne tourne pas en UTC, hors lot (signalé à l'orchestrateur).
- La référence et chaque contrôle sont du même mois civil ; sinon, recapturer la référence sur la tête de `develop`.
- Déterminisme : la capture est lancée deux fois avant d'être commitée ; les deux doivent être identiques.
- Échec du contrôle : clé vide, compte d'éléments différent, écart non listé, entrée sans emploi, ordre seul non admis.
- Ordre des clés (I9, spec §2.4 v2.2) : deux objets comparés gardent la même suite de clés COMMUNES. Une permutation
  est un écart de type `ordre-cles` (`avant` / `apres` = les deux suites), admis seulement par une entrée qui porte ce
  type. Une clé ajoutée ou retirée reste un écart de valeur (« ⟨absent⟩ »).
- Aucun email ne part : `resend` est remplacé par un bouchon, Gemini est factice, tout autre hôte est refusé
  (`scripts/lib/bouchons-test.js`, mode « capture ») : `fetch`, `http`/`https` `.request` et `.get`, et toute connexion
  TCP/TLS directe (garde sur `net.Socket.prototype.connect`). Le journal du bouchon est imprimé à la fin de chaque capture.
  DocuSeal n'est PLUS simulé depuis le lot 3, étape 5 (plus de contrat, d'avenant ni de résiliation : plus aucun code
  ne l'appelle) ; un appel vers son hôte serait refusé comme tout hôte externe, et la capture n'écrirait rien.
- Environnement de capture : valeurs fixes posées AVANT dotenv. Les variables `PRESTATAIRE_*` et `FACTURE_*` sont LUES
  (`docuseal-templates/generate.js:35-47`, PDF des FACTURES — les contrats n'existent plus) : leurs valeurs fixes
  empêchent la référence de capturer l'identité légale réelle du poste ; ne jamais les retirer du bouchon
  (`PRESTATAIRE_VILLE` et `PRESTATAIRE_SIGNATAIRE`, lues seulement par le bloc des signatures des contrats, en sont
  sorties à l'étape 5). Les variables « retirées » (toutes les `DOCUSEAL_*` — URL, jeton, 3 modèles, secret de webhook,
  flux PDF —, `FACTURE_STRICT`, `GROQ_API_KEY`, `TELEGRAM_BOT_TOKEN`, `MESSENGER_*`) sont posées VIDES : une
  variable supprimée serait rechargée depuis le `.env` du poste par `dotenv` (que `src/app.js` rappelle). Leurs
  lecteurs testent une valeur : vide = absente (les `DOCUSEAL_*` et `FACTURE_STRICT` n'ont plus aucun lecteur ; elles
  restent posées vides pour qu'un `.env` de poste ne rallume rien si du code DocuSeal revenait). La capture s'arrête si
  l'une d'elles est non vide, avant ou après le chargement de l'application.
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
- Garde R2.8.3 (refus de `--reference` si `_migrations` contient 194, 195 ou 196) : RETIRÉE au lot 3, étape 3 (prévu par
  la spec 2c §12.2 après D2, déjà en production).
- `meta.empreintesBase.<titre rendu>` (relecture de l'étape O : 21 des 32 entrées de la base n'étaient captées par aucune
  recherche, et 4 n'apparaissaient nulle part, pas même dans `disponibles`) : chaque entrée active de `ai_knowledge_base`, dans
  l'ordre des `id`, est cherchée par son titre (titre en base rendu avec le vocabulaire du passage ; en restauration, le titre
  d'origine), compte B, sans voc ; md5 NON masqué du JSON `{ titre, contenu }` du résultat de même titre. La capture s'arrête
  si l'entrée n'est pas parmi les 4 résultats ou si deux entrées ont le même titre rendu ; `meta.entreesBase` = nombre d'entrées.
- `baseParTitre` (réserve R1 du contrôle de O et S0, spec R2.4.8), **hors restauration seulement** : pour chacune de ces
  recherches par titre, `baseParTitre.<titre rendu>` = `{ titre, contenu }` RENDUS du résultat (masqués comme toute capture).
  `meta` n'est pas scanné : sans cette clé, le contenu de 20 des 32 entrées n'apparaissait nulle part dans une capture
  Hôtellerie. La capture s'arrête si un contenu est vide ; le compte par clé vaut 32. Jamais capturée en restauration : la
  référence n'a pas été recapturée pour elle (les 32 entrées y sont tenues par `meta.empreintesBase`).

### Contrôles ajoutés (§2.4)

- Restauration : `meta.empreintesBase` égales à celles de la référence, entrée par entrée, ordre compris (même règle que le
  manuel : aucun écart admissible ; c'est ce qui prouve I10 en base, par le vrai outil, pour les 32 entrées après la 195).
- Restauration : `meta.empreintesManuel` égales à celles de la référence, lecteur par lecteur, slug par slug, ordre compris ; un
  écart est un échec qu'aucune entrée de `ecarts-restauration-attendus.json` ne peut admettre (I1, PDF compris, R2.6.1).
- Hors restauration : famille `manuel` (`manuel/sections/<slug>/titre|partie|contenu`, jamais `motsCles` ni l'admin) et
  famille `assistant` étendue (`recherches`, `recherchesDomaine` : titres et contenus des résultats de la BASE, titres de
  `disponibles` ; `baseParTitre` : titre et contenu des 32 entrées, R2.4.8). Passages exclus au balisage retirés avant la recherche (`extrait` des fichiers
  `scripts/manuel/balise/manuel/<slug>.json`, `scripts/manuel/variantes/<domaine>/<slug>.json`, et
  `scripts/manuel/balise/base/*.json` pour une entrée retrouvée par son titre rendu avec `meta.lexique`) ; aucune exception par
  forme dans `exceptions-hors-restauration.json` pour ces textes. `MOTS_HORS_LEXIQUE` ne s'y applique pas (R2.4.3).
  Limite : un extrait qui contient un passage masqué par la capture (date, référence « BL-… ») n'est pas retrouvé ; sa forme
  reste signalée.
- Échecs : « [[ », « ]] » ou « ‹clé› » dans les familles `manuel` et `assistant` ; résultat du manuel dont la citation n'est
  celle d'aucune fiche servie, ou dont le contenu n'est pas le début de la fiche (suivi de « … » s'il est coupé) ; empreintes du
  lecteur `admin` ≠ référence restauration (I4) ; clé de `recherchesDomaine` sans résultat ; mots-clés servis sans la forme
  `nom` du domaine d'une clé que le domaine change et que les mots-clés d'origine portent comme entrée (R2.4.4) ; comptes des
  familles `manuel` et `assistant` au-dessus de la liste avant (une fois celle-ci écrite par ce scan, `scan2c`) ;
  `baseParTitre` absent, vide, d'un autre nombre d'entrées que `meta.entreesBase`, ou avec un contenu vide (R2.4.8).
- Rapports (non bloquants, R2.4.6) : terme du domaine dans les 4 résultats, par clé ; première fiche du manuel de la référence
  parmi les 4 résultats d'une recherche fixe ; fiche `activites` parmi les 4 résultats d'une question de composant.
- `--hors-manuel` : les formes du manuel, des recherches et de `baseParTitre` (base pas encore balisée, R2.4.8) ne font pas échouer ; le contrôle des mots-clés (famille manuel) est
  un rapport ; tout le reste échoue comme sans l'option. Porte de S, de A et des vagues : 0 dans les trois domaines.

### Réserve R1 : contenu des 32 entrées hors restauration (R2.4.8, 03/10/2026)

- Avant / après le changement des deux scripts : `node scripts/check-invariant-vocab.js` (restauration) IDENTIQUE les deux
  fois, mêmes comptes par clé (20 clés, pas de `baseParTitre`) ; `restauration.json` inchangé (pas de recapture).
- Captures `--domaine hotellerie`, `ceramique`, `miroir` : `baseParTitre` = 32 entrées (mêmes titres, même ordre que
  `meta.empreintesBase`), 0 contenu vide, 9 574 caractères ; le contenu de 20 (H), 19 (C) et 20 (miroir) entrées n'apparaît
  dans aucune autre clé de la capture.
- Listes de travail relancées (`--liste-avant`, une capture par domaine) : famille `assistant` H 95 → 186 (`baseParTitre`
  91), C 157 → 272 (115), miroir 253 → 458 (205) ; famille `manuel` inchangée (552, 678, 1 070) ; hors `baseParTitre`
  (et la migration affichée, 192 → 193), chaque section est égale à celle de l'étape O. `--hors-manuel` : 0 dans les trois
  domaines.
- Mutation réelle (transaction validée, puis restaurée à l'identique : empreintes revenues à `67737956…` / `8779fd65…`,
  fiches et entrées égales une à une, `updated_at` compris) : contenu de « Timbre fiscal », « (1 DT en Tunisie) » devenu
  « (1 DT par labo en Tunisie) ». Scan Hôtellerie complet : ÉCHEC, famille `assistant` 187 au-dessus de la liste avant
  (186) ; seul élément ajouté : `baseParTitre/Timbre fiscal/contenu`, forme « Labo ». Aucune autre clé ne le voyait.

### Intégration de M0 ∥ S ∥ A : liste de travail relancée après S (03/10/2026)

- Premier passage `--domaine … --hors-manuel` sur le code de S (04:02 à 04:08) : 0 forme hors manuel et recherches dans les
  trois domaines, mais ÉCHEC « famille assistant au-dessus de la liste avant » : H 186 → 187, C 272 → 279, miroir 458 → 505.
  Famille `manuel` inchangée (552, 678, 1 070) ; `baseParTitre` et `recherches` inchangés ; seule `recherchesDomaine` monte
  (H 68 → 69, C 125 → 132, miroir 198 → 245).
- Cause, mesurée : les mots-clés enrichis (R5.4, décision 3 du client) changent le classement de la recherche hors
  restauration ; d'autres entrées de la base, encore non balisées, entrent dans les 4 résultats des questions posées dans les
  mots du domaine (et d'autres en sortent). Preuves : (a) chaque texte de la famille `assistant` est le titre ou le contenu
  d'origine d'une entrée (`scripts/manuel/origine/base/`) ou un texte déjà présent dans la liste avant (H 91 sur 91, C 121
  sur 121, miroir 145 sur 145) : aucun texte n'a gagné de forme, seule la sélection des résultats change ; (b) en lecture
  seule sur la base locale (textes non balisés), les rendus H et C des 32 entrées et des 60 fiches actives égalent les
  textes bruts, seuls les mots-clés diffèrent (H 54, C 61 lignes enrichies), et l'outil de `08c3edf` et celui de S donnent
  d'autres résultats pour les 11 questions essayées. En restauration, rien ne bouge (contrôle IDENTIQUE).
- Liste relancée (`--liste-avant`, une capture par domaine, 04:11 à 04:14). Changent seulement : la famille `assistant` (sous
  `recherchesDomaine`), `motsCles` (manques 89 / 104 / 152 → 0 : l'enrichissement est en place), les exceptions employées
  (32 exceptions `2c` retirées par S, R2.4.5), les exclusions lues (3 fiches témoins de M0), le rapport de cohérence, et les
  nombres de textes lus et de résultats du manuel contrôlés (autres résultats). Les éléments de la famille `manuel` sont
  égaux un à un. Contrôle `--hors-manuel` relancé ensuite (04:15 à 04:19) : code 0
  dans les trois domaines, comptes égaux à la liste.
- Rapport R2.4.6 (non bloquant) : fiche attendue parmi les 4 résultats, H 5 sur 12 (5 avant S), C 3 sur 9 (3), miroir 3 sur
  7 (1) ; perdus : « créer [[un:labo]] » (fiche `activites`) dans les trois domaines et « Comment créer ma cuisine ? » en H ;
  gagnés : « room service » et « housekeeping » en H, « showroom / boutique » en C, 3 recherches miroir. À relire à l'étape C,
  manuel et base balisés.

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

### Migration 193 et base principale

La 193 (table des variantes, étape S0) est dans `migrations/` depuis le commit de S0 : tout passage de l'oracle ou du backend de
test l'applique à `fiche_technique`. C'est admis par la spec : la règle des copies (R2.8.2) ne vise que 194, 195 et 196, « la
base fiche_technique ne reçoit 194 à 196 qu'après leur mise en production » ; la 193 part avec le code de S0 (§4) et est
inoffensive (§4.1, §4.5 : table ignorée par l'ancien serveur). `fiche_technique` est à la 193 depuis la recapture du 03/10
(02:26) ; la photo reste à la 192, et une copie neuve (`base-locale.js copie`) reçoit la 193 au premier passage, comme la base
principale. La 193 ne touche ni le manuel ni la base : les empreintes globales (requête (1) de `controle-avant-2c.sql`) restent
`67737956…` et `8779fd65…`. `meta.derniereMigration` n'est qu'affiché, jamais comparé.

### Recapture après les relectures des étapes O et S0 (03/10/2026, 02:26)

- Cause : la référence de l'étape O (`651a09a`) avait été capturée vers 01:30, dans la fenêtre « date locale ≠ date UTC » (voir
  Règles) : elle portait « 760.00 / en_attente » pour la mensualité du compte B, et tout contrôle lancé après 02:00 échouait sur
  ces 2 valeurs sans aucune modification. Garde ajoutée ; `meta.empreintesBase` ajouté en même temps.
- Deux passages, 02:26 et 02:27, identiques pour le contrôle (`--reference` passage 1 `--capture` passage 2 : IDENTIQUE, une
  permutation entre ex aequo admise, `get_stock`, `ordre-libre.json`) ; le passage 1, le plus proche de l'ancienne référence, est
  gardé. Base locale à la 193 (voir plus haut).
- Contre la référence `651a09a` : seules changent `meta` (`derniereMigration` 192 → 193, `empreintesBase` et `entreesBase`
  ajoutés) et les 2 valeurs de `auth/client.abonnement/paiements/0` (« 760.00 / en_attente » → « 0.00 / gratuit ») ; une
  permutation entre ex aequo admise (`rapportIA`). Empreintes du manuel égales pour les 6 lecteurs.
- Contre la capture de `develop` (`863f8f0`, 01:28, même fenêtre que l'ancienne référence) : les mêmes 94 écarts et 27 « ordre
  seul » sous `recherches/` et `recherchesDomaine/` qu'à l'étape O (égaux un par un), plus ces 2 mêmes valeurs de mensualité.
  La mesure de R2.2 et `recherches-avant-ordre.json` restent valables.
- Les 32 empreintes de la base sont égales au md5 de `{ titre, contenu }` recalculé en base (lecture seule, même ordre) : toute
  mutation du titre ou du contenu d'une entrée est vue (une empreinte changée ou une entrée retirée font échouer le contrôle).

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
  **Lot 3, étape 5** : les exceptions des documents de contrat ont disparu avec eux (noms de champs DocuSeal, « Activité
  Premium » et « Domaine d'activité » des contrats, « ARTICLE n », « PRESTATAIRE », et les 13 entrées de type `lot-3`) ;
  le type `lot-3` n'existe plus (`check-invariant-vocab.js`). Restent 40 exceptions : `fiscal` 3, `homonyme` 13,
  `non-repliable` 2, `code-api` 11, `locution` 5, `donnee` 6.

### Compteurs de jours relatifs masqués (03/10/2026)

Les champs `jours` et `jours_inventaire` des tableaux de bord valent `Math.round((Date.now() - date) / 86400000)`
(`dashboardV2Controller.js:334`) : ils changent avec l'heure et le jour du passage, pas avec le code (un contrôle à
15:21 donnait 33 écarts « 15 → 16 » contre une référence de la nuit). La capture les masque en `⟨jours⟩`
(`CLE_RELATIVE`), et les 33 valeurs de `restauration.json` ont été masquées par la même règle (le masquage est une
fonction pure de la capture : cela équivaut à une recapture). Contrôle ensuite : IDENTIQUE.

### Lot 3, étape 3 — plus de contrats (04/10/2026)

Décision du client : LabFlow est sans engagement, plus de contrat DocuSeal à la création ni d'acte de résiliation à la
suppression (l'avenant reste jusqu'à l'étape 4). Capture adaptée : les 4 comptes A, B, C, A2 sont créés en un seul
passage (clé `emails.site.creation` : l'email « Bienvenue sur LabFlow — Activez votre compte » envoyé tout de suite) ;
retirés : passes 1/2 et bascule du jeton DocuSeal, `soumission.creation.*`, `pricingFields.*`, contrats legacy de la
création, résiliations à la suppression, `webhookContrat` ; `fixe.sansTerme.bienvenue` remplace les deux variantes avec
et sans contrat. Contrôle avant recapture : 31 écarts, tous dus à l'étape 3 (étape « Contrat signé » du guide retirée,
email de bienvenue, résiliations, contrats legacy, champs DocuSeal, `inviteSent` vrai dès la création), aucun
inattendu ; comptes par clé emails 39 → 33, pdf 21 → 19, valeursContrat 11 → 3. Référence RECAPTURÉE le 04/10 vers
15 h 20 (passage 1 `--reference`, passage 2 contrôle : IDENTIQUE). Hors restauration (hotellerie, ceramique, miroir) :
code 0, aucune exception sans emploi. L'ancienne référence reste dans l'historique git.

### Lot 3, étape 4 — suppléments sans avenant (04/10/2026)

Décision du client : LabFlow est sans engagement, plus d'avenant à signer. Une demande de supplément attend la
validation de l'équipe LabFlow ; la validation admin applique la capacité et envoie un email de CONFIRMATION
(sendSupplementValideEmail, sans PDF ni le mot « avenant », option Acheteurs comprise). Capture adaptée : la demande du
client ne doit produire ni appel DocuSeal ni email (sinon la capture s'arrête) ; retirés : `emails.site.demandeAvenantClient`,
`valeursContrat.soumission.demandeAvenant`, `pdf.site.traitementDemande.avenantLegacy` (garde : aucun PDF), la bascule
du jeton DocuSeal ; `emails.site.traitementDemande` garde sa clé (nouvel email) ; nouvelle clé
`messages.demandeDejaTraitee` (2ᵉ validation : 409) ; les 6 `fixe.avenant.*` deviennent les 6
`fixe.supplementValide.*` (la variante « promo » devient « sansOption »). Domaine miroir : le webhook d'avenant est
remplacé par la validation admin de la 1ʳᵉ demande (`emails.site.validationSupplement`,
`persistes.validationSupplement.sse|composants` au lieu de `persistes.webhook.avenant.*` ; hors miroir,
`persistes.validationSupplement.sse` = null). Gardés jusqu'à l'étape 5 : `fixe.signature.*`, `pdf.avenant.flux`,
`pdf.legacy.avenant`, `valeursContrat.avenantExtraFields.*`, webhook « contrat ». Contrôle avant recapture (deux
passages, mêmes écarts) : 22 écarts, tous dus à l'étape 4 (6 emails fixes d'avenant retirés et 6 de confirmation
ajoutés, email de signature de la demande retiré, sujet / HTML / pièce jointe de l'email de traitement, PDF d'avenant
du traitement, soumission DocuSeal de la demande, `webhook.avenant.sse` renommé `validationSupplement.sse`, fin du
message de quota, message 409 nouveau), aucun inattendu ; comptes par clé
emails 33 → 32, pdf 19 → 18, valeursContrat 3 → 2, messages 19 → 20. Référence RECAPTURÉE le 04/10 vers 16 h 15
(passage 1 `--reference`, passage 2 contrôle : IDENTIQUE). Hors restauration : 3 exceptions devenues sans emploi
(`valeursContrat` `/name$` « Nb activités », « Nb labos », « Nb gérants » : noms de champs du modèle DocuSeal de
l'avenant) retirées de `exceptions-hors-restauration.json` ; ensuite hotellerie, ceramique, miroir : code 0, aucune forme
par défaut (email de confirmation et message de quota compris). L'ancienne référence reste dans l'historique git.

Correction de la relecture (même jour, vers 17 h) : la fin du message de quota devient « Demandez un ajout de capacité
pour en ajouter. », en texte fixe — la clé `supplement` du lexique désigne l'extra vendu avec un produit (« option » en
céramique), pas un ajout à l'abonnement. Contrôle : 1 écart (`messages/laboQuota/body/message`), attendu ; référence
RECAPTURÉE puis contrôle IDENTIQUE ; hotellerie, ceramique, miroir : code 0, aucune forme par défaut.

### Lot 3, étape 5 — contrats retirés (04/10/2026)

**Cause.** Décision du client : LabFlow est sans engagement, plus de contrat, d'avenant ni de résiliation. Le code
DocuSeal devenu mort est supprimé (`docusealService`, `contractPdfService`, `webhookController` et sa route
`POST /api/webhooks/docuseal`, `generateAvenantPdf` / `generateContratPdf`, `buildContrat` / `buildAvenant` /
`buildResiliation` de `generate.js`, `sendDocusealSigningEmail`, `verifyDocusealSignature`) ; le manuel et la base de
connaissances sont réécrits par la migration 198 (12 fiches, 1 entrée, 4 brouillons de variantes) ; l'outil IA
`get_abonnement` ne lit plus `contrat_accepte_le`. Les colonnes en base restent.

**Capture adaptée.** Retirés : les 4 emails fixes `emails.fixe.signature.*` ; les 8 PDF `pdf.contrat.identite|hotellerie.
palier|sansPalier`, `pdf.avenant.flux`, `pdf.resiliation`, `pdf.legacy.avenant`, `pdf.legacy.contrat` ; la clé
`valeursContrat` EN ENTIER (il n'y restait que `avenantExtraFields.*` ; une clé vide arrête la capture) ; domaine
miroir : le webhook « contrat » et `persistes.webhook.contrat.statut`. DocuSeal n'est plus simulé (voir « Règles ») :
plus de `journal.docuseal` ; les gardes de l'étape 4 restent sur ce qui se mesure encore (la demande de supplément
n'envoie aucun email, son traitement admin ne produit aucun PDF). Gardés : les 4 comptes (A, A2, B, C) et leurs 4
suppressions, les factures (`pdf.factureAbonnement`, `pdf.factureAppro.*`, `pdf.factureAcheteur` : ce sont elles qui
prouvent que la charte commune de `generate.js` n'a pas bougé), la demande de supplément validée par l'admin.
Contrôle : la clé `valeursContrat` est retirée de `check-invariant-vocab.js` ; le contrôle des libellés écrits par le
serveur (miroir) relit `persistes.validationSupplement.composants` à la place de `webhook.avenant.composants` (clé
renommée à l'étape 4, que le contrôle ne lisait plus).

**Contrôle avant recapture.** Capture SANS `--reference` (20 h 57, la 198 s'applique à ce passage : « 12 fiche(s)
réécrite(s) … base : 1 réécrite(s) … variantes : 4 mise(s) à jour »), comparée à la référence de l'étape 4 (celle de
`git HEAD`, `d779340`) : 32 écarts de valeur et 69 refus du contrôle (3 comptes par clé, 65 empreintes du manuel,
1 empreinte de la base), TOUS dus à l'étape 5, aucun inattendu :

| Différence contre l'ancienne référence | Nombre |
|---|---|
| `emails/fixe.signature.contrat`, `.avenant.1`, `.avenant.2`, `.resiliation` : absents | 4 |
| `pdf/contrat.identite.palier`, `.sansPalier`, `contrat.hotellerie.palier`, `.sansPalier`, `avenant.flux`, `resiliation`, `legacy.avenant`, `legacy.contrat` : absents | 8 |
| `valeursContrat` : clé absente | 1 |
| `outils/json/8/function/description` et `promptReel/corps/0/outils/8/description` : description de `get_abonnement` sans « , date d'acceptation du contrat » | 2 |
| `resultatsOutils/get_abonnement/contrat_accepte_le` : `null` → absent | 1 |
| `manuel/sections/<slug>/contenu` des 12 fiches réécrites (abonnement, assistant-ia, compte, faq, historique-paiements, lexique, onboarding-activation, onboarding-avenants, onboarding-configuration, onboarding-contrat, onboarding-suivi, support) | 12 |
| `manuel/sections/onboarding-contrat/titre` (« Création de votre compte ») et `onboarding-avenants/titre` (« Faire évoluer votre abonnement ») | 2 |
| `recherches/calcul du food cost/results/2/contenu` et `recherchesDomaine/fixe\|calcul [[du:food_cost]]/resultat/results/2/contenu` : le résultat cite le début de la fiche « lexique » réécrite (même texte que `manuel/sections/lexique/contenu`) ; mêmes résultats, même ordre | 2 |
| `meta.empreintesManuel` : les 12 fiches, pour chaque lecteur qui les reçoit (12 × 5 lecteurs + 5 pour `gerant.B`) | 65 |
| `meta.empreintesBase` : « Abonnement et capacité » | 1 |

Comptes par clé : emails 32 → 28, pdf 18 → 10, valeursContrat 2 → clé retirée ; les 17 autres clés gardent leur compte
(prompt 2, promptReel 2, outils 1, resultatsOutils 27, recherches 6, recherchesDomaine 56, contexte 3, guide 10,
accueilMessenger 1, exports 29, rapportIA 4, tableauxDeBord 68, donneesLibelles 17, persistes 9, messages 20, auth 11,
manuel 2). Aucun email, aucune facture, aucun message, aucun export, aucun tableau de bord ne change.
`docusealSubmissionId` n'était capté nulle part (0 occurrence avant comme après).

**Recapture.** Référence RECAPTURÉE le 04/10 vers 20 h 59 (`--reference`) ; la capture de 20 h 57 lui est IDENTIQUE,
puis un nouveau passage du contrôle (21 h 00) : IDENTIQUE (0 écart ; 2 permutations entre ex aequo admises,
`get_stock` et la feuille Stock du rapport, `ordre-libre.json`). Une première recapture de 17 h 50, faite sur une
version antérieure de la 198, a été écartée : les textes du manuel ont été corrigés après relecture et la 198
régénérée. L'ancienne référence reste dans l'historique git.

**Hors restauration.** `exceptions-hors-restauration.json` : 73 → 40 exceptions. 32 ne couvraient que des documents de
contrat (2 de `valeursContrat`, 16 `homonyme` et 1 `donnee` des PDF de contrat, les 13 `lot-3`) ; la 33ᵉ, « Activité
Premium » sur tout PDF (`/textes/\d+$`), a été donnée « sans emploi » par le contrôle hotellerie puis retirée. Ensuite
hotellerie, ceramique, miroir : code 0, aucune forme par défaut, aucune exception sans emploi (exceptions employées :
27, 25, 35 ; textes lus : 7 007, 6 753, 6 504). Les comptes des familles `manuel` et `assistant` ne montent pas
(0 forme ; liste avant inchangée, non relancée).

### Lot 3, étape 6 — « Mon entreprise » côté client (04/10/2026)

`GET /api/entreprise` renvoie en plus l'identité légale (`mapEntreprise`). Premier contrôle (22 h 28) : 2 écarts, tous
deux attendus, aucun autre :

| Écart | Nombre |
|---|---|
| `auth/client.entreprise/identite` : absent → objet à 9 clés (toutes `null` pour le compte de la capture) | 1 |
| `auth/client.entreprise/identiteComplete` : absent → `false` | 1 |

Les clés existantes de `client.entreprise` gardent leur ordre et leur valeur ; les comptes par clé ne changent pas
(auth 11). **Recapture.** Référence RECAPTURÉE le 04/10 à 22 h 30 (`--reference`) : 12 lignes ajoutées, rien d'autre ;
contrôle suivant IDENTIQUE (22 h 31), et de nouveau IDENTIQUE après les corrections des relectures (22 h 42).
**Hors restauration.** hotellerie, ceramique, miroir : code 0, aucune forme par défaut, aucune exception sans emploi
(textes lus : 7 014, 6 760, 6 511).

### Lot 3, étape 8 — factures : identité figée (05/10/2026)

`GET /api/entreprise` renvoie en plus `facturesNonFigees` (nombre de factures de vente du compte sans copie figée).
Premier contrôle (12 h 32) : 1 écart, attendu, aucun autre :

| Écart | Nombre |
|---|---|
| `auth/client.entreprise/facturesNonFigees` : absent → `0` | 1 |

Aucun PDF ne change : la facture de vente du compte de la capture est émise sans identité légale (copie figée sans
mention : mêmes octets que l'ancienne présentation), la facture d'abonnement est rendue sans copie, les 3 factures
d'approvisionnement ne sont pas touchées. Comptes par clé inchangés (pdf 10, emails 28, auth 11).
**Recapture.** Référence RECAPTURÉE le 05/10 à 12 h 33 (`--reference`) : `derniereMigration` 198 → 199 et
`"facturesNonFigees": 0` ajouté, rien d'autre ; contrôle suivant IDENTIQUE (12 h 34), et de nouveau IDENTIQUE après
les deux dernières corrections (ville en fin d'adresse, matricule d'acheteur borné) : 0 écart, 2 permutations entre
ex aequo admises (`get_stock`, feuille Stock du rapport).
**Hors restauration.** hotellerie, ceramique, miroir : code 0, aucune forme par défaut, aucune exception sans emploi
(textes lus : 7 015, 6 761, 6 512).

### Correctif hors lot — signe de la ligne « Remise » de la facture de vente (05/10/2026)

Demandé par le client avec son « étape 8 ok ». Le montant de la ligne « Remise » était précédé du signe mathématique
U+2212, absent de la police standard des PDF (il s'imprimait « " ») ; c'est maintenant le tiret « – » (U+2013).
Premier contrôle : 1 écart, attendu, aucun autre :

| Écart | Nombre |
|---|---|
| `pdf/factureAcheteur/documents/0/textes/34` : « − 1.965 DT » → « – 1.965 DT » | 1 |

**Recapture.** Référence RECAPTURÉE le 05/10 (`--reference`) : ce texte, et les permutations entre ex aequo déjà
admises (`get_stock`, feuille Stock du rapport) ; contrôle suivant IDENTIQUE (0 écart).
**Hors restauration.** hotellerie, ceramique, miroir : code 0, aucune forme par défaut hors exceptions.

### Lot 3, étape 9 — manuel « Mon entreprise » (05/10/2026)

Migration 200 (`200_manuel_mon_entreprise.sql`, maintenance du manuel) : fiches `compte` (section « Mon entreprise »)
et `faq` (« Comment retrouver une facture ? » cite les factures de vente) réécrites, entrée « Timbre fiscal » de la
base de connaissances réécrite (factures de vente). Premier contrôle avec le texte final (14 h 52) : 2 écarts de valeur,
13 empreintes et 3 différences d'ordre, toutes dues à ces trois textes, aucune autre :

| Différence contre l'ancienne référence | Nombre |
|---|---|
| `manuel/sections/compte/contenu` et `manuel/sections/faq/contenu` | 2 |
| `meta.empreintesManuel` : `compte` et `faq`, pour chacun des 6 lecteurs | 12 |
| `meta.empreintesBase` : « Timbre fiscal » | 1 |
| `recherchesDomaine/A\|B\|C\|Comment saisir mon premier approvisionnement ?/titres` : mêmes 4 résultats, « Mon compte » passe de la 3ᵉ à la 1ʳᵉ place (la fiche cite maintenant les factures d'approvisionnement) | 3 |

Une version antérieure de l'entrée « Timbre fiscal » (« … factures de vente aux acheteurs ») faisait passer cette
entrée en tête de la recherche fixe « inviter un acheteur » (ex aequo départagés par la base d'abord) : le mot
« acheteurs » en a été retiré avant la recapture. Comptes par clé inchangés.
**Recapture.** Référence RECAPTURÉE le 05/10 à 14 h 54 (`--reference`) : `derniereMigration` 199 → 200, ces textes,
empreintes et ordres, et les permutations entre ex aequo déjà admises (`get_stock`, feuille Stock du rapport).
Contrôle suivant IDENTIQUE (0 écart ; 2 permutations entre ex aequo admises).
**Hors restauration.** hotellerie, ceramique, miroir : code 0, aucune forme par défaut hors exceptions.

### LabFlow Compta, étape S3b — partie « Gérants Comptabilité » de la fiche Gérants (07/10/2026)

Migration 206 (`206_manuel_gerants_comptabilite.sql`, maintenance du manuel) : fiche `gerants` complétée (comptable
du client, gérants comptables supplémentaires, niveaux, demande d'ajout). Migration 205 : fiches de LabFlow Compta
seulement (jamais servies au lecteur de restauration). Premier contrôle avec le texte final : 1 écart de valeur
(`manuel/sections/gerants/contenu`) et l'empreinte `gerants` des lecteurs, aucune autre différence ; l'email
« ajout de capacité validé » est resté identique à l'octet près (les lignes du module Comptabilité ne s'ajoutent qu'à un
compte qui l'a).
**Recapture.** Référence RECAPTURÉE le 07/10 (`--reference`, deux captures identiques) : `derniereMigration` 200 → 206,
ce texte et ses empreintes, et les permutations entre ex aequo déjà admises (`get_stock`, feuille Stock du rapport).
Contrôle suivant IDENTIQUE (0 écart).
**Hors restauration.** hotellerie, ceramique, miroir : code 0, aucune forme par défaut hors exceptions.

### Factures fournisseur, étape F1 — la facture devient une vraie pièce (09/10/2026)

Migration 221 (pièces jointes, journal, index) et 222 (`222_manuel_factures_pieces.sql`, maintenance du manuel :
fiches `factures`, `stock-activites`, `stock-labo`). Premier contrôle : 16 écarts, tous dus à l'étape :

| Différence contre l'ancienne référence | Nombre |
|---|---|
| `manuel/sections/{factures,stock-activites,stock-labo}/contenu` | 3 |
| `recherches` et `recherchesDomaine` : contenus des fiches `stock-labo` et `stock-activites` en résultat | 4 |
| `recherchesDomaine/C\|Comment ajouter mes fournisseurs ?/titres/3` : « Factures d'appro » passe devant « Fournisseurs » (la fiche Factures cite maintenant la facture du fournisseur) | 1 |
| `donneesLibelles/B.factures/*/nbPieces` : champ ajouté à `GET /api/factures` (nombre de pièces jointes, 0) | 8 |

Hors restauration : seules les empreintes des trois fiches (3 problèmes par domaine, lecteur admin).
**Recapture.** Référence RECAPTURÉE le 09/10 (`--reference`) : `derniereMigration` → 222, ces textes, empreintes,
ordres et le champ `nbPieces`. Contrôle suivant IDENTIQUE (0 écart).
**Hors restauration.** hotellerie, ceramique, miroir : code 0, aucune forme par défaut hors exceptions.
