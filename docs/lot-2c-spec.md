# Lot 2c — Spécification v2.3 : le manuel et la base de connaissances dans les mots du domaine

Références :
- `docs/lot-2-spec.md` (moteur, balises, outil de preuve, invariants I1 à I6, cadrage du 2c au §5) ;
- `docs/lot-2b-spec.md` (invariants I7 à I9, oracle, outil étendu, méthode des vagues) ;
- `C:\Users\CHAHDONj\labflow-reprise\REPRISE.md` (§3, §4, §5, §7) ;
- `C:\Users\CHAHDONj\labflow-reprise\lot-2c\DEPART-2c.md` (mesures du 02/10, questions ouvertes) ;
- `C:\Users\CHAHDONj\labflow-reprise\lot-2c\DECISIONS-2c.md` (décisions du client : elles priment) ;
- `C:\Users\CHAHDONj\labflow-reprise\lot-2\critiques-synthese.md`, section `# manuel-rag` (relecture du 30/09) ;
- les 4 relectures de la v1 : `labflow-reprise/lot-2c/crit-oracle-preuve.md`, `crit-serveur-donnees.md`,
  `crit-langue-variantes.md`, `crit-completude-organisation.md` ; leur traitement constat par constat :
  `labflow-reprise/lot-2c/tracabilite-spec-v2.md`.

Historique :
- **v1 (02/10/2026)**, écrite après les décisions du client du 02/10. Chaque numéro de ligne relu à la tête
  indiquée ci-dessous ; chaque chiffre mesuré le 02/10 (annexe A).
- **v2 (02/10/2026)**, après 4 relectures contradictoires contre le code (65 constats : 3 bloquants distincts, les
  autres importants ou mineurs). Chaque constat a été revérifié contre le code ou par une mesure (annexe A, partie
  « v2 »). Changements principaux :
  - **base locale protégée** : photo de la base avant balisage, copies jetables pour tout passage après la
    consolidation, remise à zéro (§2.8) ;
  - **déploiement en trois poussées** : serveur sans les données balisées (D1), écrans, puis données (D2) : l'ancien
    conteneur ne sert jamais de balise brute (§12.2) ;
  - **retour arrière par un script Node** lancé dans le conteneur, sans texte à coller (§4.5) ;
  - écarts du 2b archivés avant la recapture (§2.7) ; captures du manuel non masquées (empreintes) ; scan sans le
    lecteur admin ; contrôle du PDF refait (non à vide) ;
  - variantes jamais lues pour un domaine sans écart de lexique (café, boulangerie, Céramique recréée vide) (I12) ;
  - « à revoir » calculé sur le texte commun servi ; « sans balises » champ par champ, avec liste des champs admis ;
  - pré-baliseur et contrôle par fiche renforcés (déterminants à majuscule, traits d'union, locutions, déterminant
    en clair, appositions, collisions de sens) ; règles de balisage corrigées (accord avec « et », `det` suivi d'un
    adjectif, « labo central », capitales partielles, noms d'écran cherchés dans le front) ;
  - organisation : étape S0 avant l'outillage, générateur partiel, porte hors restauration de S à C, vagues en
    4 tours, L8 en vague 1, variantes en parallèle de la vague 2 ;
  - 4 nouvelles questions au client (§14) et une liste « À transmettre au client » (§15).
- **v2.1 (03/10/2026)**, après le contrôle indépendant de la v2 (`labflow-reprise/lot-2c/controle-spec-v2.md` :
  « prête avec réserves », 1 important, 7 mineurs, tous appliqués) : lexiques lus = écarts, toujours résolus
  (R3.1.1, §3.7, §12.1) ; « spa » dans 36 fiches (§0.4) ; R2.4.6 = garde-fou, plus un rapport par clé ; étiquettes
  `$v196_` sans tiret de domaine (R3.6.3) ; pas de badge « sans balises » ni de règle 3 trompeuse dans la fenêtre
  D1 → D2 (R5.7.2, §6.4) ; caractères d'un terme et Markdown (§7.6, question 13) ; contrôle du PDF lancé à la sortie
  de M0 (§2.7) ; `base-locale.js` connecté à la base `postgres` (R2.8.1).
- **v2.2 (03/10/2026)**, après les étapes O et S0 (backend `d6c2b11` à `d634b3a`, frontend `3c90c50` ; contrôle
  final `labflow-reprise/lot-2c/controle-o-s0.md` : « prêt pour M0 ∥ S ∥ A : OUI, avec réserves ») : empreintes
  des 32 entrées de la base dans la capture (R2.3.4) et leur scan hors restauration (R2.4.8) ; garde « date locale =
  date UTC » (§2.5) ; `verifierBalises` signale aussi une balise non fermée (§5.1) ; l'essai de migration vérifie
  aussi les 32 entrées (§3.7) ; la base principale peut porter la 193 (§2.8).
- **v2.3 (03/10/2026)**, après l'étape M0 ∥ S ∥ A (backend `c8fff0c` à `6ed9873`, frontend `42e32d3` ; contrôle
  `labflow-reprise/lot-2c/controle-m0-s-a.md`) : amendements regroupés au **§16**, qui prime sur le texte des
  sections qu'il cite.

**Têtes.** Backend : `develop` = `863f8f0`, branche `feat/lot-2c-manuel` = `fbca8ce` (develop + `b157b28`
réépinglage de `scripts/vocab-check.base` + `fbca8ce` lecture de production `scripts/controle-avant-2c.sql`).
Frontend : `develop` = `1683d7b`, branche = `53b91f8` (develop + réépinglage). `git diff develop feat/lot-2c-manuel`
ne touche aucun fichier de `src/` (vérifié) : **les numéros de ligne sont ceux de `develop`** (revérifiés pour la v2).
Base locale à la migration `192_composants_genre_elision.sql`, sans table `manuel_sections_domaine` (mesuré).
**Prochaine migration libre : 193.**

Vocabulaire de ce document : « le manuel » = table `manuel_sections` (61 fiches) ; « la base » = table
`ai_knowledge_base` (32 entrées) ; « H » = Hôtellerie, « C » = Céramique ; « miroir » = lexique d'essai où chaque
terme change (genre et élision inversés). « Balisé » = texte où les termes du lexique sont écrits en balises
`[[méthode:clé:args]]` (grammaire : lot-2-spec §2.2). « Domaine sans écart » = domaine dont le lexique résolu donne
les rendus par défaut (`voc.estDefaut` vrai : restauration, café, boulangerie, ou un domaine créé sans lexique).

---

## 0. But, invariants, ce qui est servi

### 0.1 But

Un compte hors restauration lit le manuel (page `/client/guide`, son PDF), et l'assistant cherche et cite le manuel
et la base, **avec les mots de son domaine**. Un compte restauration ne voit rien changer.

Mesure du point de départ (02/10, base locale, lecture seule) :

| Mesure | Manuel | Base |
|---|---|---|
| Lignes | 61 fiches, 60 actives (inactive : `dashboard-gerant`), 12 parties | 32 entrées, toutes actives |
| Taille | 201 248 caractères en longueur JavaScript (201 016 pour PostgreSQL), 208 523 octets ; `lexique` = 10 358, seule fiche au-delà de 6 000 | 9 574 caractères |
| Formes des termes (motif de `termesDans`, §9.1) | 3 303 dans le contenu (59 fiches), 38 dans les titres (32 titres porteurs), 6 dans les parties (5 parties porteuses) : **3 347** | **249** (24 titres porteurs) |
| Formes qui changent vraiment | H : 1 914 ; C : 2 151 ; miroir : 3 303 (contenu) | — |
| `contenu_defaut` NULL | 5 : `acheteurs-module`, `-carnet`, `-tarifs`, `-ventes`, `-portail` | pas de colonne |
| « [[ », « ]] », « {{ », « }} », « $ », « \r », espace insécable, « ’ », « ‹ » | 0 dans les 5 champs texte | 0 |
| Empreinte globale (requête (1) de `scripts/controle-avant-2c.sql`) | `67737956d92ba0e1d836c17747d66f5c` | `8779fd652a4a4dd50531e9e3323aaad6` |

Les deux empreintes sont celles de `DECISIONS-2c.md` : la base locale n'a pas bougé depuis.

### 0.2 Invariants

Les invariants des lots 2 et 2b restent en vigueur (I2 aucun renommage technique, I3 une seule grammaire, I4 admin
en vocabulaire LabFlow, I5 migrations neuves et idempotentes, I8 jamais de vocabulaire dans le SQL, I9 forme de
l'API inchangée). Pour le 2c, ils se lisent ainsi :

- **I1 — Identité restauration.** Un compte d'un domaine sans écart (restauration, café, boulangerie), et l'admin,
  reçoivent **au caractère près** :
  - le même manuel par `GET /api/manuel`, pour chaque rôle (client, gérant, acheteur, super_admin) ;
  - le même PDF du manuel ;
  - la même description de l'outil `search_knowledge_base` et de son paramètre `query` ;
  - les mêmes résultats de recherche de l'assistant **que la référence de l'étape O**.

  Deux différences avec la production d'aujourd'hui, mesurées et inévitables, non affichées : l'**ordre des
  résultats ex aequo** de la recherche, et la liste `disponibles` (titres proposés quand rien ne répond), sont
  fixés (R2.2, §10.2, point 1). Aujourd'hui ils dépendent de la place physique des lignes en base, et les migrations
  du 2c la changent de toute façon.
  Le café et la boulangerie sont tenus par construction : aucune variante n'est lue pour un domaine sans écart
  (I12), et l'enrichissement des mots-clés ne fait rien quand `voc.estDefaut` est vrai (R5.4).
- **I2 — Mots du domaine.** Un compte H ou C lit le manuel, son PDF, la description de l'outil et les résultats de
  recherche avec les mots de son lexique. Seules restent les limites listées au §10.3.
- **Slugs inchangés.** Aucun slug ne change, aucune fiche n'est dupliquée dans `manuel_sections`. Les 42 fichiers
  d'écran à bouton « ? » (`GuideButton section=` ou `<HelpButton `, compté le 02/10) et les règles de visibilité
  par slug (`src/utils/manuelVisibilite.js:70-113`) en dépendent.
- **I7 révisée — Balises en base, liste fermée.** Le 2b interdisait toute balise en base (lot-2b-spec §0, I7). Le 2c
  l'autorise **seulement** dans ces colonnes :

  | Table | Colonnes balisées | Colonnes jamais balisées (refus 400 à l'écriture) |
  |---|---|---|
  | `manuel_sections` | `contenu`, `contenu_defaut`, `titre`, `partie` | `slug`, `icone`, `ecran`, `mots_cles` |
  | `manuel_sections_domaine` (nouvelle, §4.1) | `contenu`, `titre` | `domaine_slug`, `mots_cles` |
  | `ai_knowledge_base` | `titre`, `contenu` | `mots_cles`, `categorie` |

  Et ces textes ne sont **rendus** qu'à ces points, liste fermée :
  1. `manuelController.listPublic` (titre, partie, contenu) ;
  2. `aiToolHandlers.toolSearchKnowledge` (manuel : titre, partie, contenu ; base : titre, contenu) ;
  3. l'aperçu et les libellés de liste des écrans `AdminManuelPage` et `AdminKnowledgeBasePage` (moteur du front) ;
  4. le contrôle des titres en double de la base (R5.7.1) et le retour arrière (`scripts/manuel/retour-2c.js`,
     §4.5), avec le vocabulaire par défaut, pour comparer ou remettre le texte d'origine.

  Tout autre lecteur lit le texte brut, pour l'éditer ou le contrôler, jamais pour l'afficher à un client :
  `adminList`, `create`, `update`, `restore` du manuel, les 4 routes de la base, les routes des variantes, le
  contrôle au démarrage (§5.8), les outils de `scripts/manuel/`. Vérifié : à la tête, les seuls lecteurs de ces
  tables dans `src/` sont `manuelController.js` (`:35`, `:53`, `:77`, `:116`, `:134`, `:151`),
  `aiKnowledgeController.js` (`:17`, `:34`, `:51`, `:73`) et `aiToolHandlers.js:296-297` ; aucun script ni test ne
  les lit, hors `scripts/controle-avant-2c.sql`.
  Le reste de I7 ne change pas : jamais de balise dans un email, un PDF du serveur, un classeur, le prompt, ni dans
  un résultat d'outil envoyé au modèle (il est rendu avant).
- **I10 (nouveau) — Identité des textes balisés.** Pour chaque champ balisé, `rendre(vocabDefaut, balisé)` est égal
  au texte d'origine, octet pour octet. Prouvé fiche par fiche sur les fichiers (§3.5), puis en base (§3.7, §11).
- **I11 (nouveau) — Balises valides en base.** Toute balise écrite en base respecte la grammaire
  (`balisesInvalides`, `src/utils/vocab.js:164`) **et** porte une clé du lexique (`LEXIQUE_CLES`, 47 clés).
  Attention, mesuré : `balisesInvalides('[[nom:labbo]]')` rend `[]` (la fonction rend avec un vocabulaire muet et
  ne voit pas une clé inconnue), alors que `rendre` affiche « ‹labbo› ». Le contrôle de clé est donc à écrire
  (`verifierBalises`, §5.1 et R5.7.1 ; point 2 du contrôle par fiche, §3.5).
- **I12 (nouveau) — Variantes.** Une variante n'est servie que si son statut est `valide` **et** si le domaine du
  lecteur a un lexique qui s'écarte du défaut (`voc.estDefaut` faux). Aucune variante n'existe ni ne peut être créée
  pour `restauration` (contrainte), ni créée par l'admin pour un domaine sans écart (400, R5.7.3). Ainsi un domaine
  « Céramique » recréé en production sans son lexique ne sert pas ses variantes (§8.6).

### 0.3 Vocabulaire du destinataire (I6) appliqué au manuel

Le manuel et les résultats de recherche sont lus par un destinataire. Ils sont rendus avec SON vocabulaire, et les
variantes sont celles de SON domaine. La source du domaine est toujours la même que celle du vocabulaire.

| Lecteur | Vocabulaire | Domaine des variantes (si `voc.estDefaut` est faux, sinon aucun) | Filtre de visibilité |
|---|---|---|---|
| client | `req.voc` (domaine du compte) | `req.user.domaine_id` (même requête que `req.voc`, `src/middleware/auth.js:67-70`, `:135`) | config du compte |
| gérant | `req.voc` (domaine du compte parent) | `req.user.domaine_id` (compte parent) | config du parent, `visible_gerant` |
| acheteur | `req.voc` (domaine du vendeur) | `req.user.domaine_id` (vendeur) | aucun : `buildManuelContexte` rend `null` (`manuelVisibilite.js:14`) ; aucun écran acheteur n'appelle `/api/manuel` |
| super_admin, boss | défaut, par le rôle (`vocabCompte.js:75-78`) | aucun : texte commun | aucun (`manuelVisibilite.js:116`) |
| assistant (chat web, Messenger lié) | `voc` de `chatWithAI` = `vocabForClient(clientId)` (`aiService.js:258`), passé à l'outil | profil de `chatWithAI` (`getProfilForClient`, `aiService.js:260-265`), passé à l'outil (R5.3.3) | config du compte (`aiToolHandlers.js:298`) |
| scripts qui appellent `executeToolCall` sans `voc` (oracle `capture-vocab-baseline.js:710`, `test-manuel-filtre.js:67`) | repli `vocDuCompte()` = `vocabForClient(clientId)` (`aiToolHandlers.js:535`) | `getProfilForClient(clientId)` dans l'outil | idem |
| prospect Messenger sans compte (`clientId` nul) | défaut (`vocabForClient(null)`, `vocabCompte.js:63`) | aucun | manuel complet (`aiToolHandlers.js:293-294`) |
| aperçu admin | lexique du domaine choisi dans l'écran | variante du domaine choisi | — |

Le prospect sans compte est un cas théorique : `messengerService.js:153-154` sort sans répondre quand le PSID n'est
lié à aucun compte, et le chat web exige le rôle client (`aiAssistantController.js:303`). Le repli reste écrit.

Pourquoi pas `buildManuelContexte` pour trouver le domaine (piste de DEPART-2c §3.4) : il rend `null` pour
l'admin et l'acheteur (`manuelVisibilite.js:14`), et il sort avant de lire le domaine quand le compte n'a pas encore
de `profil_entreprise` (`:20-23`). `req.user.domaine_id` et `getProfilForClient` (qui passe par
`getDomaineIdForClient`, `domaineProfilService.js:193`) sont les sources exactes de `req.voc` et de
`vocabForClient` : vocabulaire et variantes viennent toujours du même domaine.

### 0.4 Hors lot 2c

- Le texte fixe des contrats et le modèle DocuSeal (lot 3).
- Les écrans hors manuel. En particulier la phrase d'aide « … sont vos matières premières et ingrédients »
  (`ReferentielArticlesPage.tsx:413`), renvoyée « aux textes par domaine (sous-lot 2c) » par
  `scripts/vocab-besoins/S5-decisions.json:303` du front : c'est un écran, pas le manuel. Question au client (§14).
- Le moteur et le lexique : **aucun changement**, empreinte gelée intacte (décision 2 du client : pas de clé
  « sous-produit »). En particulier, pas de balise `accN` (accord de plusieurs termes) : §7.3 dit comment s'en passer.
- La traduction des mots hors lexique (menu, carte, restaurant…) dans le texte commun : seule une variante le peut.
- La **reformulation** du texte commun (proposée par la relecture du 30/09 pour les phrases à verbe, « Impossible de
  transférer… » à côté de « livraison interne ») : refusée, elle casserait I10 et donc I1. Les verbes restent
  (§10.3) ; une variante peut reformuler.
- La qualité du classement de la recherche (score par mots, `aiToolHandlers.js:310-320`) : inchangée. Le score
  compte des morceaux de mots (`hay.includes(t)`, `:316`) : « spa » est dans « espace » (36 fiches actives sur 60,
  partie comprise comme dans la recherche, qui note la citation `Manuel — partie › titre`, `:304`, `:313`),
  « bar » dans « barre » ou « barème » (24 fiches) (mesuré). Ce défaut ancien n'est pas corrigé ici.
- Un **contrôle permanent** séparé du manuel (`check-invariant-manuel.js`, proposé le 30/09) : pas d'outil de plus.
  En local, l'oracle `--domaine` (§2.4) et `controler.mjs --tout` (§3.5) le font ; en production, une fiche éditée
  dans l'admin est vue par le badge et l'avertissement « sans balises » (§5.7.2, §5.8).

---

## 1. Décisions du client et ce qu'elles impliquent

Source : `labflow-reprise/lot-2c/DECISIONS-2c.md`.

| # | Décision | Conséquence dans cette spec |
|---|---|---|
| 1 | **Variantes OUI, Hôtellerie ET Céramique**, dans ce lot, pour les 8 fiches métier (`decouvrir-labflow`, `compte-activites-labos`, `demarrage`, `roles`, `lexique`, `lexique-pt`, `onboarding-configuration`, `calc-cout-recette`) | Table `manuel_sections_domaine` (migration 193, §4.1), 16 brouillons (migration 196, §4.4), 4 lots de rédaction (§9), écran admin (§6.1). Variante ciblée par le **slug** du domaine, sans clé étrangère : les brouillons Céramique sont écrits en production et s'appliquent quand un domaine de slug `ceramique` existe **et** a son lexique (I12, §8.6). Les fiches de calcul et de catégories gardent leurs exemples de la restauration (§10.3) : question 9 au client (§14). |
| 2 | **« sous-produit » : exclusion assumée**, type `locution` ; pas de nouvelle clé | Moteur et empreinte inchangés. 28 occurrences dans le manuel (19 « sous-produit », 9 « sous-produits » ; lots L4 : 6, L7 : 1, L8 : 21) et 2 dans la base : chacune est une exclusion typée `locution` dans le fichier de sa fiche (§3.3). Même traitement pour « sous-PT » (1 occurrence, même notion, §7.2). Hors restauration, le mot reste (§10.3). **Cette décision clôt aussi le point laissé ouvert par le 2b** pour les écrans et le serveur (lot-2b-spec, ligne 979) : les entrées `locution` de `scripts/vocab-allow/_global.json:16-28` restent ; `labflow-reprise/lot-2b/ecarts-visibles-2b.md` est mis à jour à l'étape C. |
| 3 | **Mots-clés enrichis au rendu** avec les formes du domaine des clés surchargées ET les libellés des composants du domaine ; rien d'ajouté en restauration | `enrichirMotsCles` (R5.4). Garde : rien n'est ajouté quand `voc.estDefaut` est vrai (restauration, café, boulangerie). `mots_cles` n'est jamais balisé. Effet mesuré par la relecture : nul sur les questions du guide (R5.4) ; deux précisions (sigles sans casse, libellés de composants resserrés) : question 10 au client (§14). |
| 4 | **Méthode** : workflow multi-agents comme au 2a et au 2b | Spec → 4 relectures contradictoires → contrôle indépendant → étapes O, S0, M0 / S / A, vagues de balisage, variantes, consolidation, vérification, déploiement (§13). |

Fait au démarrage (DECISIONS-2c) : branches créées, `vocab-check.base` réépinglé, lecture de production écrite
(`scripts/controle-avant-2c.sql`, à faire coller par le client ; complétée à l'étape O, §12.1).

---

## 2. Oracle (étape O, AVANT toute modification du manuel)

### 2.1 Ce que la référence voit aujourd'hui, et ce qu'elle ne voit pas

Mesuré dans `scripts/capture-vocab-baseline.js` et `scripts/check-invariant-vocab.js` :

- La clé `recherches` capte 5 recherches fixes (`capture-vocab-baseline.js:730-732`), toutes faites avec le compte B
  (`outil` lié à `cB.id`, `:710`). Elle est comparée à l'identique en restauration, mais **pas lue hors
  restauration** (`check-invariant-vocab.js:417-418`).
- **Le manuel servi (`GET /api/manuel`) n'est capté nulle part.**
- Les captures sont **masquées** avant écriture (`capture-vocab-baseline.js:240-301`, appliqué `:1134`) ; seul
  `meta` ne l'est pas. Dans le manuel, les masques changent 9 passages de 6 fiches : `stock-activites`
  (« 1er janvier »), `acheteurs-ventes` (« FA-ANN »), `historique-paiements` (« janvier 2026 »),
  `calc-production-pt` (« 15/07/2026 »), `calc-transferts` (« BL-0642 »), `calc-tracabilite` (« BL-0187 »,
  « 15 mars 2026 », « janvier 2027 ») (mesuré). Une empreinte md5 écrite dans les captures serait elle aussi masquée
  (motif `[a-f0-9]{32,}`, `:246`).
- Les 32 exceptions de type `2c` de `scripts/vocab-baseline/exceptions-hors-restauration.json` couvrent la
  description de l'outil de recherche : 13 formes sur la description et 3 sur `query`, pour chacune des clés
  `outils` et `promptReel`.
- La référence actuelle a été capturée sur `589cfb1`, avant le code du 2b (README de l'oracle, l. 88-90) ; les
  109 entrées de `ecarts-restauration-attendus.json` décrivent les changements du 2b.

La référence ne verra jamais, même étendue :
1. le PDF du manuel, construit à l'écran par `src/utils/manuelPdf.ts` (preuve au §2.6) ;
2. les écrans admin (aperçu, légende, variantes) : tests et parcours navigateur (§11) ;
3. la recherche locale de `GuidePage.tsx:59` : elle lit les champs servis, déjà captés ;
4. la réponse du modèle : Gemini est factice dans l'oracle ; seul ce que l'outil lui envoie est capté ;
5. l'ordre physique des lignes en production (§2.2) ;
6. une variante `valide` : à la livraison, toutes sont `brouillon` (preuve par test, §5.11, P11) ;
7. le journal au démarrage (§5.8) et l'application des migrations sur une base de type production (§3.7) ;
8. les fiches qu'aucun compte de la capture ne voit (règles de visibilité) : elles sont prouvées sur les fichiers
   (`controler.mjs --tout`, §3.5).

### 2.2 L'ordre des ex aequo de la recherche (mesure, et règle R2.2)

`toolSearchKnowledge` lit la base et le manuel **sans `ORDER BY`** (`aiToolHandlers.js:296-297`), puis trie par
score décroissant (`:320`). Le tri de JavaScript est stable : entre deux scores égaux, l'ordre est celui des lignes
renvoyées par PostgreSQL, c'est-à-dire leur place physique. Sans résultat, l'outil renvoie les 25 premiers titres
lus (`disponibles`, `:322`) : les 25 premières entrées de la base (elle en a 32).

Mesures (02/10, base locale, lecture seule ; annexe A) :
- l'ordre physique (`ctid`) n'est l'ordre des `id` ni pour la base (`2,3,6,13,14,20,23,24,25,26,29,30,31,32,1,4,…`)
  ni pour le manuel ;
- une simulation fidèle de la fonction, avec l'ordre physique mesuré, **reproduit exactement** les 5 recherches de
  la référence (compte B : module acheteurs absent) ;
- sur 19 questions et 2 contextes, **les 38 cas ont des ex aequo dans les 4 premiers résultats**, et 34 ont un ex
  aequo à la coupure entre le 4e et le 5e ;
- avec l'ordre `id` pour la base et `ordre, id` pour le manuel, **les 5 recherches de la référence changent** :
  2 d'ordre seulement (« créer un labo », « transfert vers une activité »), 3 d'ensemble (« calcul du food cost »,
  « inventaire de fin de mois », « inviter un acheteur ») ;
- la liste `disponibles` change aussi : 5 titres sortent (« Unité de mesure », « Timbre fiscal », « Rapport (Excel /
  PDF) », « Référentiel articles », « Charges fixes »), 5 entrent (« Gérant », « Fournisseur », « Abonnement et
  capacité », « Article vendable », « Prestataire de livraison »).

Conséquence : les migrations 194 et 195 réécrivent toutes les lignes ; une mise à jour PostgreSQL écrit une
nouvelle version de chaque ligne, à une autre place physique ; les résultats ex aequo changeraient de toute façon,
sans règle. Et rien ne dit que l'ordre physique de la production soit celui de la base locale (il n'est pas mesuré).

**R2.2 — Ordre déterministe.** Premier changement du lot, seul dans son commit (étape O, §2.7) :
`aiToolHandlers.js:296` lit `… FROM ai_knowledge_base WHERE actif = true ORDER BY id` et `:297` lit
`… FROM manuel_sections WHERE actif = true ORDER BY ordre, id` (l'ordre de lecture du manuel). Rien d'autre ne
change. Effet : ex aequo départagés par la base d'abord (par `id`), puis par l'ordre du manuel ; `disponibles` =
25 premiers titres de la base par `id`. La différence avec `develop` est mesurée une fois et archivée (§2.7,
points 3 et 4) ; elle est listée au §10.2, point 1.

### 2.3 Nouvelles captures (`capture-vocab-baseline.js`)

**R2.3.1 — Clé `manuel`.** `GET /api/manuel` pour 6 lecteurs : client A, client B, gérant de B, client C, acheteur
de C (jetons déjà créés : `capture-vocab-baseline.js:539-542`, `:628`, `:685` ; lecture de l'acheteur avant sa
suppression, `:976`) et le super_admin temporaire (`:436-440`). Contenu :
- `manuel.lecteurs.<lecteur>` (`client.A`, `client.B`, `gerant.B`, `client.C`, `acheteur.C`, `admin`) = la liste
  ordonnée des slugs reçus (l'ordre fait partie de I1) ;
- `manuel.sections.<slug>` = la section **telle que l'API la renvoie** (tous les champs, dans leur ordre, pour I9),
  écrite une fois par slug. En restauration : union des 6 lecteurs. Hors restauration : union des 5 lecteurs hors
  admin. Dans un même passage, deux lecteurs qui reçoivent le même slug reçoivent la même section (même domaine,
  même rendu) : la capture s'arrête sinon (champ `id` ignoré) ;
- `meta.empreintesManuel.<lecteur>.<slug>` = md5 du JSON **brut** (non masqué) de la section, champ `id` retiré,
  `updatedAt` gardé (il prouve R4.2.4). `meta` n'est pas masqué (`:1134-1146`). En restauration,
  `check-invariant-vocab.js` exige ces empreintes **égales** à celles de la référence, lecteur par lecteur et slug par
  slug : un écart est un échec, qu'aucune entrée de `ecarts-restauration-attendus.json` ne peut admettre ;
- `meta.sectionsParLecteur.<lecteur>` = nombre de sections reçues. **La capture s'arrête (aucune sortie) si un
  lecteur reçoit 0 section** : le compte par clé (`compter`, `:1088-1089`) ne verrait pas un lecteur vide.

Taille : environ 200 000 caractères pour `sections` (une copie par slug, et non une par lecteur).

Option `--brut <dossier>` : la capture écrit aussi, hors dépôt, la réponse brute de `GET /api/manuel` du client B
(`manuel-client-B.json`). Elle nourrit le contrôle du PDF (§2.6). Le dossier n'est jamais versionné.

**R2.3.2 — Clé `recherchesDomaine`.** Les questions que l'assistant poserait dans les mots du compte, placées
**après** la capture du guide (`:733-741`) :
- les 5 recherches fixes, écrites comme gabarits balisés et rendues avec le `voc` du domaine du passage :
  `créer [[un:labo]]`, `[[nom:transfert]] vers [[un:activite]]`, `calcul [[du:food_cost]]`,
  `[[nom:inventaire]] de fin de mois`, `inviter [[un:acheteur]]`. Clé = `fixe|<gabarit>` ; valeur =
  `{ query: <texte rendu>, resultat: <réponse complète de l'outil> }`. En restauration, le texte rendu est celui des
  5 recherches fixes (vérifié par le moteur). Faites avec le compte B, comme `recherches` ;
- les questions suggérées du guide de mise en route des comptes A, B et C, prises dans
  `C.guide['<compte>.etat'].etapes[].questions` (`onboardingEtat.js:96-97`) : ce sont les textes que l'écran envoie
  à l'assistant, déjà rendus dans les mots du compte. **Chaque question est cherchée avec SON compte**
  (`executeToolCall(c.id, 'search_knowledge_base', { query })`, sans `voc`) : une question acheteurs du compte C
  doit voir les fiches acheteurs, que le compte B ne voit pas. Sans doublon par compte. Clé = `<compte>|<question>` ;
  valeur = `{ titres: [titres des résultats], base: [{ titre, contenu } des résultats qui viennent de la base] }`
  (le contenu d'un résultat du manuel est la fiche servie, déjà captée par `manuel`) ;
- une question par composant actif du domaine du passage, de type `activite` ou `labo` : « Comment créer
  <mon composant> ? », écrite comme `onboardingEtat.js:128-129` (`voc.avec(entreeComposantVoc(voc, c)).mon('_')`),
  cherchée avec le compte A. Clé = `composant|<question>`, même valeur ; fiche attendue : `activites`.

La clé `recherches` (5 questions en mots de la restauration) reste, dans tous les domaines : elle prouve qu'une
question posée avec les anciens mots trouve encore la fiche. Elle reçoit une **6e question sans résultat**
(« zzz qwerty ») pour capter la liste `disponibles` (R2.2).

**R2.3.3 — Signatures.** Les appels restent sans `voc` (`:710` et ceux de R2.3.2) : ils prouvent le repli de
`executeToolCall` (R5.3.3).

**R2.3.4 — Empreintes de la base (ajout de l'étape O, `d634b3a`).** Les recherches ne lisent le contenu que de
11 entrées sur 32 (mesuré par la relecture de O : une mutation du contenu de « Timbre fiscal » passait inaperçue).
La capture fait donc une recherche par entrée active (titre rendu, compte B, sans `voc`) et écrit
`meta.empreintesBase` (md5 non masqué de `{ titre, contenu }`, ordre des titres) ; elle s'arrête si une entrée ne
sort pas. En restauration, le contrôle exige ces empreintes égales à la référence, ordre compris, sans écart
admissible.

### 2.4 Scan hors restauration étendu (`check-invariant-vocab.js --domaine …`)

**R2.4.1 — Ce qui est lu.** Le commentaire et l'exclusion de `:417-418` sont retirés. Famille `assistant`
(`FAMILLE`, `:280-285`, qui reçoit aussi `recherchesDomaine`) : `recherches/<q>/results/<i>/titre`, `…/contenu`,
`…/disponibles/<i>`, et sous `recherchesDomaine/<clé>/…` les titres, les contenus des résultats de la base et les
résultats complets des 5 recherches fixes. Nouvelle famille `manuel` : `manuel/sections/<slug>/titre`, `…/partie`,
`…/contenu`. Ne sont **pas** lus :
- `motsCles` : il n'est affiché à aucun client (`GuidePage.tsx` ne l'affiche pas) et il garde par construction ses
  mots d'origine (décision 3) ; il a son propre contrôle (R2.4.4) ;
- le lecteur `admin` : il lit le manuel en mots de LabFlow (I4, `vocabCompte.js:75-78`), il porterait toutes les
  formes par défaut. À la place, dans chaque passage hors restauration, `meta.empreintesManuel.admin` doit être
  **égal** à celui de la référence restauration (preuve de I4).

Dans les familles `manuel` et `assistant`, tout « [[ », « ]] » ou motif `/‹[a-z0-9_]+›/` (marque d'une clé
inconnue, « ‹labbo› ») est un **échec** : `balisesInvalides` ne voit pas une clé inconnue (I11).

**R2.4.2 — Exclusions et résultats tronqués.**
- Texte d'une fiche (`manuel/sections`) : avant `formesDans`, le scan retire les passages exclus au balisage
  (champ `extrait` de `scripts/manuel/balise/manuel/<slug>.json`, §3.3).
- Résultat de recherche qui vient du manuel : **il n'est pas rescanné** (une coupe à 6 000 peut tomber au milieu
  d'un extrait exclu : `lexique`, 10 358 caractères, est coupé dans tous les domaines). On vérifie à la place que
  son `contenu` est le début du `contenu` servi de la même fiche (`manuel.sections`), suivi de « … » s'il est
  coupé. La fiche est retrouvée par sa citation rendue `Manuel — <partie> › <titre>`.
- Résultat qui vient de la base : scanné, avec les exclusions de `scripts/manuel/balise/base/<fichier>.json` ;
  l'entrée est retrouvée par son titre, rendu par le scan avec `meta.lexique` (`capture-vocab-baseline.js:472`).
- Une exclusion « sans emploi » ne compte que dans `controler.mjs` (§3.5), jamais dans l'oracle (une recherche ne
  rend que 4 résultats).

On n'écrit donc **aucune** exception par forme dans `exceptions-hors-restauration.json` pour le texte du manuel et
de la base : la justification vit dans le fichier de la fiche, relu avec elle.

**R2.4.3 — Mots hors lexique.** `MOTS_HORS_LEXIQUE` (`:275`) n'est pas appliqué à la famille `manuel` ni aux
chemins `recherches*`. Raison : I10 garantit que le texte commun garde exactement ses mots hors balises ; ces mots
(menu, carte, restaurant…) y restent par construction, seule une variante les retire. La liste de travail des
variantes est un **rapport** de `controler.mjs --tout` (§3.5, rapport « mots du métier »), compté sur le texte
d'origine de chaque fiche avec une liste propre au manuel, `MOTS_METIER_MANUEL` = la liste actuelle + cuisine(s),
pâtisserie(s), pâtissier / pâtissière(s), boulangerie(s), traiteur(s), boutique(s), kiosque(s), farine, beurre, sucre,
crème(s), œuf(s), lait, sauce(s), pâte(s), tarte(s), dessert(s), boisson(s), viande(s), volaille(s), entremets,
viennoiserie(s), pizza(s), économat(s). Les autres familles gardent `MOTS_HORS_LEXIQUE` et son échec.

**R2.4.4 — Mots-clés enrichis.** Contrôle séparé : pour chaque fiche servie dont `motsCles` d'origine porte, comme
entrée, une forme par défaut (sans tenir compte de la casse) d'une clé que le domaine change, `motsCles` servi
contient la forme `nom` (singulier) du domaine. En restauration, `motsCles` est comparé à l'identique par la
référence (aucun ajout).

**R2.4.5 — Fin des exceptions `2c`.** Les 32 exceptions de type `2c` sont retirées en même temps que la description
de l'outil passe par `voc` (R5.5) ; sinon elles seraient « sans emploi » et le contrôle échouerait. À la fin du lot :
0 exception de type `2c` (le type reste dans `TYPES_EXCEPTION`, `:273`).

**R2.4.6 — Cohérence des recherches.**
- **Bloquant (garde-fou seulement)** : chaque clé de `recherchesDomaine` rend au moins un résultat (`results` ou
  `titres` non vide). La liste `disponibles` ne compte pas : elle est toujours remplie quand rien ne répond
  (`aiToolHandlers.js:321-322`), une règle « résultat ou `disponibles` » ne pourrait jamais échouer. Cette règle-ci
  est presque toujours vraie elle aussi (le score compte tout mot de plus de 2 lettres, `:310-316`, et les questions
  commencent presque toutes par « Comment ») : elle n'attrape qu'une recherche cassée, pas une recherche médiocre.
- **Rapport, par clé** : le terme du domaine (forme du lexique résolu) figure-t-il dans au moins un des 4 résultats ?
- **Rapport**, relu par l'intégrateur puis par la vérification, qui explique chaque manque par écrit : pour les 5
  recherches fixes, la première fiche du manuel de la référence restauration figure-t-elle parmi les 4 résultats du
  domaine ; pour les questions de composants, la fiche `activites` figure-t-elle parmi les 4. Ce n'est pas bloquant :
  le score n'est pas changé par le 2c (§0.4).

**R2.4.7 — Porte de S à C (`--hors-manuel`).** Tant que le manuel n'est pas balisé (de l'étape S à l'étape C), la
famille `manuel` et les chemins `recherches*` portent encore toutes leurs formes par défaut. Nouvelle option
`--hors-manuel` : le scan ignore ces textes et échoue sur toute autre forme. Porte de S, de A et des vagues : 0 forme
avec `--hors-manuel` dans les trois domaines, en particulier sur la description de `search_knowledge_base` (clés
`outils` et `promptReel`) dès l'étape S. Le rapport complet (sans l'option) est gardé et comparé à
`hors-restauration-avant.json` : les comptes des familles `manuel` et `assistant` ne montent jamais.

**R2.4.8 — Contenu des 32 entrées hors restauration (réserve R1 du contrôle de O et S0, à faire AVANT l'étape C).**
`meta.empreintesBase` ne garde qu'un md5, et `meta` n'est pas scanné : en Hôtellerie, le contenu de 20 entrées sur
32 n'apparaît nulle part dans la capture (mesuré). Une entrée mal balisée ou restée brute après la 195 serait donc
vue en restauration (empreinte) mais pas hors restauration. Correction : hors restauration, la capture garde
`{ titre, contenu }` RENDUS des 32 recherches par titre sous une clé `baseParTitre` (comptes non nuls, non-vacuité
comme les autres clés) ; le scan la lit dans la famille `assistant`, avec les exclusions de
`scripts/manuel/balise/base/*.json`. La clé n'est capturée que hors restauration : la référence restauration n'est
pas recapturée pour elle. Elle est ignorée par `--hors-manuel` (comme `recherches*`) tant que la base n'est pas
balisée.

### 2.5 Règle du même mois civil

Inchangée (`scripts/vocab-baseline/README.md:30`) : la référence (`meta.moisCapture` = `2026-10` aujourd'hui) et
chaque contrôle sont du même mois civil ; refus entre 00 h 45 et 01 h 15 et en janvier. **Garde ajoutée à l'étape O
(`d634b3a`)** : la capture refuse aussi de tourner quand la date locale n'est pas la date UTC (sur ce poste, réglé à
l'heure de Paris, UTC+2 en été : de 00 h 00 à 02 h 00). Raison : `abonnementController.js:506-508` calcule le mois de la mensualité en UTC sur une date locale ;
une référence capturée dans cette fenêtre échouait sans aucune mutation dès 02 h 00 (faux rouge mesuré par la
relecture de O). Ce défaut de l'application est hors lot (REPRISE §10) ; en production, il
ne joue que si le conteneur n'est pas à l'heure UTC. Le lot durera plus d'un mois
s'il dépasse fin octobre : la référence est alors recapturée sur la tête de `develop` dans un arbre à part
(`git worktree` ou `git archive`), avec les scripts de la branche **et le commit R2.2**, **sur une copie neuve de la
photo de la base** (§2.8) : jamais sur une base qui a reçu 194 à 196.

### 2.6 Le PDF du manuel

Il est construit dans le navigateur : `GuidePage.tsx:93` appelle `buildManuelPdf(sections, voc)`
(`manuelPdf.ts:53`). Il ne dépend que de `sections` (la réponse de `/api/manuel`), de `voc`, employé une seule
fois (`manuelPdf.ts:85`, `voc.de('stock')` dans la couverture), et de ses imports (`pdfTexte.ts`, `parseBlocks` de
`MarkdownView.tsx`, `manuelPdf.ts:3-4`).

**R2.6.1 — Déduction.** Le 2c ne modifie ni `manuelPdf.ts`, ni `pdfTexte.ts`, ni `MarkdownView.tsx`, ni les versions
de `jspdf` et `jspdf-autotable` (P13). Si les sections sont identiques octet pour octet (empreintes non masquées,
R2.3.1) et le vocabulaire est le défaut, le PDF est identique.

**R2.6.2 — Contrôle direct.** Nouveau script du front `scripts/controle-manuel-pdf.mjs`, sur le modèle de
`scripts/controle-avenant.mjs` (paquet `rolldown`, jsPDF sous Node, date figée, `/ID` et `/CreationDate` masqués ;
`save` remplacé par une capture de `output()`) :
- **restauration, non à vide** : PDF A = `manuelPdf.ts` de `develop` (`git show 1683d7b:…`, avec ses imports, comme
  `controle-avenant.mjs:27-33`) nourri des fiches de `scripts/manuel/origine/` dans l'ordre
  `manuel.lecteurs['client.B']` de la référence ; PDF B = `manuelPdf.ts` courant nourri de la réponse **non
  masquée** du client B (option `--brut`, R2.3.1). A et B identiques à l'octet après masquage. Les deux entrées
  viennent de deux sources (les fichiers d'origine, le serveur du 2c) et de deux versions du code : le contrôle n'est
  pas à vide (règle de `controle-avenant.mjs:10-12`) ;
- **H et C** (réponse brute du client B du passage) : chaînes écrites recollées par bloc, cherchées avec
  `formesDans` (formes par défaut que le domaine change, extraits exclus retirés) : aucune ; aucun « [[ » ; aucune
  marque `/‹[a-z0-9_]+›/` ; aucune chaîne codée sur deux octets (fonction `deuxOctets` de `controle-avenant.mjs`).
  Le « ‹ » seul est permis : `pdfTexte` écrit « ‹ » pour « ← » et « ‹› » pour « ↔ » (`pdfTexte.ts:16`), et le
  manuel contient 3 « ← » et 1 « ↔ » (mesuré).

Notes du prototype de la relecture (à reprendre) : `manuelPdf.ts` regroupé par rolldown avec `jspdf`,
`jspdf-autotable`, `react`, `react/jsx-runtime` en externes ; `jspdf-autotable` doit être rendu comme la fonction
`autoTable` elle-même ; `text` se capte dans une sous-classe de jsPDF (méthode d'instance). Deux passages donnent le
même PDF.

Limite connue, mesurée : `pdfTexte` remplace un caractère hors Windows-1252 par « ? » (`pdfTexte.ts:12`, `:30`).
Les lexiques H, C et miroir et les libellés des composants H et C n'en contiennent aucun. Les variantes sont du texte
libre : leur contrôle est au §3.5.

### 2.7 Déroulé de l'étape O (intégrateur seul)

0. **Photo de la base locale** (§2.8) : `node scripts/manuel/base-locale.js photo`, avant toute capture.
1. **Archiver ce que le 2b laisse sans objet.**
   - Écarts admis : depuis le réépinglage (`b157b28`, `53b91f8`), le mode `identite` compare au code du 2b : il
     signale **120** entrées « allow sans objet » au serveur et **65** à l'écran (mesuré le 02/10, code de sortie 0).
     Comme au 2b pour le 2a (lot-2b-spec §3.1), elles partent dans `scripts/vocab-allow/archives-2b/` des deux dépôts,
     que l'outil ne lit pas : une entrée `avant: null` sans objet absorberait en silence un nouveau littéral
     identique. Les entrées de mode `residuels` et `accords` restent.
   - Écarts attendus de l'oracle : `scripts/vocab-baseline/ecarts-restauration-attendus.json` (109 entrées, raisons
     §11.x du 2b) part dans `scripts/vocab-baseline/archives-2b/` et est remplacé par `[]`. Sans cela, la référence
     recapturée sur le code du 2b rend ces 109 entrées « sans emploi » et le contrôle échoue
     (`check-invariant-vocab.js:240`, `:265`). `ordre-libre.json` reste. Le 2c n'attend aucun écart en restauration :
     le fichier reste `[]` (son format de raison, `:230`, n'accepte d'ailleurs que les sections §11 du 2b).
   - Contrôle : `identite`, `residuels`, `accords` à 0 dans les deux dépôts, sans ligne « sans objet » de mode
     `identite`.
2. **Étendre les scripts** : captures (§2.3), scan (§2.4, dont `--hors-manuel`), `controle-manuel-pdf.mjs` (§2.6),
   garde de la référence (§2.8), lectures (6) et (7) de `scripts/controle-avant-2c.sql` (§12.1).
   `controle-manuel-pdf.mjs` est **écrit** à O mais **lancé pour la première fois à la sortie de M0** : son PDF A est
   nourri des fiches de `scripts/manuel/origine/`, que M0 écrit (§3.1) ; lancé à O, il tournerait à vide.
3. **Mesurer l'effet de R2.2, une fois.** Capture restauration COMPLÈTE sur `develop` (arbre à part, scripts de la
   branche), gardée dans le dossier temporaire. Puis commit R2.2 seul.
4. **Référence.** Capture restauration sur la branche (R2.2 compris), **deux fois** : identiques. Puis
   `node scripts/check-invariant-vocab.js --reference <capture du point 3> --capture <capture du point 4>`
   (fichier d'écarts vide) : les écarts sont tous sous `recherches/` et `recherchesDomaine/`, aucun ailleurs. Le
   rapport est archivé ; seules ces deux clés sont versionnées dans `scripts/vocab-baseline/recherches-avant-ordre.json`.
   Commit de `restauration.json`, des archives et d'un paragraphe « Recapture du 2c » du README de l'oracle (liste
   des recherches changées, reprise au §10.2, point 1).
5. **Liste de travail.** `--domaine hotellerie`, puis `ceramique`, puis `miroir`, l'un après l'autre
   (`--liste-avant`) : `hors-restauration-avant.json` reçoit les familles `manuel` et `assistant` étendues (chiffrées).
   Elle est attendue très longue : c'est le travail des vagues.
6. **Lecture de production** (§12.1) : la sortie, collée par le client, est comparée aux valeurs locales. Tant
   qu'elle manque, le générateur de migrations (§3.6) refuse d'écrire dans `migrations/`.

### 2.8 Base locale protégée

Une capture, le backend de test et tout script qui charge `src/app.js` **appliquent pour de bon** les migrations en
attente (`src/app.js:180`, `src/config/migrate.js:81-104` : une transaction validée par fichier, inscrite par son
NOM ; un fichier modifié qui garde son nom n'est jamais rejoué). Dès que 194 à 196 sont dans `migrations/` (étape C),
le premier passage les écrirait dans la base locale : une référence « avant » ne pourrait plus être recapturée, une
correction de fiche ne serait jamais rejouée, et l'essai de migration (§3.7) ne trouverait plus de texte d'origine.

**R2.8.1 — Photo et copies.** Nouveau script `scripts/manuel/base-locale.js`, lancé par l'intégrateur seul :
- `photo` : `CREATE DATABASE fiche_technique_avant2c TEMPLATE fiche_technique` (base à la migration 192, avant toute
  balise ; refusé si elle existe) ;
- `copie` : `DROP DATABASE IF EXISTS fiche_technique_2c` puis `CREATE DATABASE fiche_technique_2c TEMPLATE
  fiche_technique_avant2c` ;
- `etat` : les trois bases et leur dernière migration ;
- `supprimer` : retire la photo et la copie (après D2, §12.2).

Il refuse un hôte non local. Il se **connecte à la base `postgres`** (PostgreSQL refuse `CREATE DATABASE …
TEMPLATE x` tant qu'une session, y compris la sienne, est ouverte sur `x`). Seules `fiche_technique_avant2c` et
`fiche_technique_2c` peuvent être créées ou supprimées ; la source d'une copie est `fiche_technique` (photo) ou la
photo (copie), jamais autre chose. Arrêter le backend de test et tout client SQL avant `photo` et `copie`. Mesuré (lecture
seule) : le rôle local peut créer une base (`rolcreatedb` vrai), base de 23 Mo, PostgreSQL 14.22, collation
`French_France.1252` ; `src/config/database.js:9` lit `DB_NAME` de l'environnement, et `dotenv` n'écrase pas une
variable déjà posée (aucun script de l'oracle ne fixe `DB_NAME` : `scripts/lib/bouchons-test.js` ne contrôle que
`DB_HOST`, `:136-138`).

**R2.8.1 bis — La 193 dans la base principale.** Depuis l'étape O, la base principale `fiche_technique` est à la
migration 193 (appliquée par le premier passage de l'oracle après le commit de S0) : c'est admis, la 193 est sans
effet sur les textes (§4.1) et R2.8.2 ne vise que 194 à 196. La photo `fiche_technique_avant2c` reste à la 192.

**R2.8.2 — Règle.** La photo n'est jamais ouverte directement. Dès que 194, 195 ou 196 sont dans `migrations/` (étape C,
vérification, toute correction), **tout** processus du 2c qui charge l'application ou lit la base (capture, contrôle,
backend de test, scripts E2E, essai, parcours navigateur) tourne sur une copie neuve, avec `DB_NAME=fiche_technique_2c`
(Git Bash : `DB_NAME=fiche_technique_2c node …` ; PowerShell : `$env:DB_NAME='fiche_technique_2c'; node …`). Les
scripts E2E qui ouvrent leur propre connexion (`test-manuel-filtre.js` charge `aiToolHandlers`) reçoivent la même
variable. La base `fiche_technique` ne reçoit 194 à 196 qu'après leur mise en production.

**R2.8.3 — Garde.** `capture-vocab-baseline.js --reference` refuse d'écrire si `_migrations` contient 194, 195 ou 196 :
une référence se capture toujours sur un manuel non balisé. La garde est retirée dans `develop` après D2 (§12.2).

**R2.8.4 — Remise à zéro.** Si `fiche_technique` a reçu 194 à 196 par erreur :
`node scripts/manuel/retour-2c.js --remise-locale` (base locale seulement, refusé sur un autre hôte) : retour des
textes (§4.5), suppression des 16 brouillons de la 196 (par slug de fiche et de domaine), retrait de 194, 195 et
196 de `_migrations`.

---

## 3. Outillage du manuel (étape M0)

Dossier `fiche-technique-backend/scripts/manuel/`. Le moteur est celui du serveur (`src/utils/vocab.js`, généré) ;
les formes cherchées sont celles de `LEXIQUE_DEFAUT` (`src/config/lexiqueDefaut.js`). Les fonctions de contrôle et de
rendu sont celles de `src/utils/manuelRendu.js` (écrit à l'étape S0, §5.1) : **aucune copie** dans les outils. Aucun
outil de ce dossier ne modifie la base, sauf l'essai de migration (toujours annulé, §3.7), `base-locale.js` (§2.8)
et `retour-2c.js` (§4.5).

### 3.1 Contenu du dossier

| Fichier | Rôle | Écrit par |
|---|---|---|
| `README.md` | mode d'emploi des outils | M0 |
| `GUIDE-BALISAGE.md` | guide d'écriture des agents (contenu du §7) | M0 |
| `extraire-origine.js` | instantané d'origine, UNE fois, base locale, lecture seule (§3.2) | M0 |
| `domaines.json` | lexique, composants actifs (libellé, pluriel, type technique, genre) et description de `hotellerie` et `ceramique`, lus une fois en lecture seule : les agents n'ont pas accès à la base | M0 |
| `prebaliser.mjs` | brouillon de balisage (§3.4) | M0 |
| `controler.mjs` | contrôle par fiche (§3.5) ; option `--lexique <fichier>` pour rejouer le contrôle avec un lexique de production (§12.1) | M0 |
| `generer-migrations.mjs` | SQL des migrations 194, 195, 196 et liste des champs admis sans balise (§3.6) | M0 |
| `essai-migration.js` | application en transaction annulée (§3.7) | M0 |
| `base-locale.js` | photo et copies de la base locale (§2.8) | O |
| `retour-2c.js` | retour arrière (§4.5) et remise à zéro locale (R2.8.4) | M0 |
| `parties.json` | les 12 parties, origine → balisée | M0 (intégrateur) |
| `lots.json` | répartition des fichiers par lot (§9) | M0 |
| `origine/manuel/<slug>.md`, `.json` ; `origine/base/<fichier>.md`, `.json` | instantané figé | `extraire-origine.js` |
| `balise/manuel/<slug>.md`, `.json` ; `balise/base/<fichier>.md`, `.json` | textes balisés | agents des lots L1 à L9 |
| `variantes/<domaine>/<slug>.md`, `.json` | variantes rédigées | agents V-H1, V-H2, V-C1, V-C2 |
| `relectures/<lot>.auto.json` | signalements 7 à 12 du contrôle traités par le baliseur (accepté, avec raison) | baliseur du lot |
| `relectures/<lot>.json` | relecture croisée : phrase, domaine, problème, correction, état | relecteur du lot, seul |
| `besoins/<lot>.json` | manques (balise impossible, partie à changer, défaut d'un outil), clos par `etat` | baliseur ; clos par l'intégrateur |
| `rendus/<lot>/…` | rendus et rapports de `controler.mjs --lot` et `prebaliser.mjs` (`a-baliser.json`) ; `rendus/tout.json` par `--tout` (intégrateur) ; **non versionnés** (`.gitignore`) | outils |

`controler.mjs` lit les lexiques H, C et miroir de `test/vocab-lexiques-test.json` (copie du front) et vérifie au
démarrage que H et C égalent ceux de `domaines.json` (mesuré le 02/10 : identiques à la base locale).

**R3.1.1 — Un lexique lu est une liste d'ÉCARTS, toujours résolu avant usage.** Le fichier d'essai
(`vocab-lexiques-test.json`, champ `_lisezmoi`), `domaines_activite.lexique` en base (`domaineProfilService.js:108-119`),
`domaines.json` et le fichier `--lexique` tiré de la lecture de production ne portent que les écarts au défaut. Or
`creerVocab` attend un lexique RÉSOLU (`src/vocab/vocab.ts:440`). Tout outil de `scripts/manuel/` construit donc son
vocabulaire par `vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, ecarts))`, comme `test/B2-controleurs.test.js:60-62`
(le serveur et l'oracle le font déjà : `getProfil`, `domainesController.js:77`). `domaines.json` garde pour chaque
domaine les écarts ET le lexique résolu. Sans cette résolution, les clés dérivées sortent fausses sans aucune erreur
(mesuré par le contrôle de la v2 : « Espace Labo » au lieu de « Espace Cuisine », « SERVICE (point de vente) » au lieu
de « SERVICE (service) », « votre laboratoire central » au lieu de « votre cuisine centrale »), ce qui fausserait les
signalements 7, 8, 11, 12 et le contrôle des variantes. **Test de M0** : l'exemple 8 du §7.7 rendu en H par
`controler.mjs` doit donner « Espace Cuisine ».

### 3.2 Instantané d'origine

**R3.2.1** — `extraire-origine.js` lit la base locale dans une transaction `READ ONLY` (variables `DB_*` du `.env`),
et refuse de tourner si une fiche ou une entrée contient déjà « [[ » (base déjà balisée).
Il écrit, pour chaque fiche (61) :
- `origine/manuel/<slug>.md` = `contenu` servi aujourd'hui, en LF, sans retouche ;
- `origine/manuel/<slug>.json` = `{ slug, titre, icone, partie, ordre, mots_cles, ecran, actif, visible_gerant,
  updated_at, defautNull, md5Garde, md5Contenu }`, avec `md5Garde` = md5 de `COALESCE(contenu_defaut, contenu)` sans
  `\r` (la garde du §4.2) et `md5Contenu` = md5 de `contenu`. Tous les champs de l'API y sont : le contrôle du PDF
  (§2.6) reconstruit les sections à partir de ces fichiers.

Pour chaque entrée de la base (32) : `origine/base/<fichier>.md` (contenu) et `.json` =
`{ cle: lower(titre), titre, mots_cles, categorie, actif, md5Contenu }`. `<fichier>` = le titre translittéré en
minuscules et tirets (« labo-central ») ; la vraie clé est `cle`, celle de l'index unique `idx_ai_kb_titre`.

**R3.2.2** — Contrôle : l'empreinte globale recalculée sur les fichiers (même formule que la requête (1) de
`controle-avant-2c.sql`) vaut `67737956…` pour le manuel et `8779fd65…` pour la base. Si la production diffère
(§12.1), les fiches concernées sont réextraites à partir du texte de production et rebalisées (mini-vague R, §13),
et le README le note.

**R3.2.3** — `origine/` est figé : aucun agent ne le modifie. Les fichiers de `scripts/manuel/` sont en LF (§3.8).

### 3.3 Fichiers balisés : format

`balise/manuel/<slug>.md` : le contenu balisé (LF). `balise/manuel/<slug>.json` :

```json
{
  "slug": "stock-labo",
  "titre": "[[Nom:stock]] [[Court:labo]]",
  "exclusions": [
    { "extrait": "prix de vente", "forme": "vente", "type": "locution", "occurrences": 1,
      "justification": "locution figée du métier (lot-2-spec §3 règle 4)" }
  ],
  "baliseur": "L6", "relecteur": "L7"
}
```

- La **partie** n'est pas dans ce fichier : elle est partagée par plusieurs fiches. Sa forme balisée est celle de
  `parties.json`, écrit une fois à M0 par l'intégrateur. Exemple mesuré : « Stock & Appro » →
  `[[Nom:stock]] & [[Court:appro]]`.
- **Types d'exclusion, liste fermée** : `homonyme`, `locution`, `nom-fige`, `capitales`, `exemple`, `glose` (sens
  au §7.2).
  Chaque exclusion porte son `extrait` : un passage exact du texte **balisé**, sans balise, qui contient une forme
  par défaut restée hors balise, et qui se retrouve tel quel dans tous les rendus. Une exclusion sans emploi fait
  échouer le contrôle : on n'exclut donc jamais un passage qui ne contient plus de forme par défaut hors balise
  (ex. 11 du §7.7).
- Base : `balise/base/<fichier>.md` (contenu) et `.json` (`cle`, `titre` balisé, `exclusions`).
- Variante : `variantes/<domaine>/<slug>.md` (contenu) et `.json` (`titre` balisé ou `null` = titre commun,
  `baseMd5` = md5 du contenu commun balisé (`balise/manuel/<slug>.md`, LF) contre lequel elle est écrite,
  `exclusions`).

### 3.4 Pré-baliseur (`prebaliser.mjs`)

**R3.4.1** — Il écrit un brouillon `balise/manuel/<slug>.md` à partir de l'origine. Pour chaque forme d'un terme
(motif de `termesDans`, `vocab-check.mjs:260-274` : mot entier, formes les plus longues d'abord, sans casse pour un
mot, avec casse pour un sigle de 2 à 4 capitales), il essaie le déterminant qui précède, **en minuscules et à
majuscule** : le, la, l', les, un, une, des, du, de la, de l', de, d', au, à la, à l', aux, ce, cet, cette, ces,
aucun, aucune, votre, vos, mon, ma, mes, son, sa, ses, nouveau, nouvel, nouvelle, tous les, toutes les, et Le, La,
L', Les, Un, Une, Des, Du, De la, De l', De, D', Au, À la, À l', Aux, Ce, Cet, Cette, Ces, Aucun, Aucune, Votre, Vos,
Mon, Ma, Mes, Son, Sa, Ses, Nouveau, Nouvel, Nouvelle, Tous les, Toutes les (rendus par les méthodes à majuscule :
`Le`, `Un`, `Du`…), puis le nom seul. Mesuré par la relecture : sans les formes à majuscule, 127 déterminants restent
écrits en clair devant une balise de nom (« L'client professionnel compose son panier », « Le cuisine centrale
produit »), alors que I10 passe à 100 %.

**R3.4.2** — Il ne propose une balise **que si son rendu par défaut reproduit exactement le passage** (même casse,
même déterminant, même élision). Sinon il laisse le passage et le liste dans `rendus/<lot>/a-baliser.json`.

**R3.4.3** — Il ne touche jamais :
- la cible d'un lien `(#slug)`, le mot-clé d'un bloc (`:::astuce`, `:::formule`…), un passage entre accents graves
  (1 seul dans le manuel : `/portail`) ;
- **une forme collée à un trait d'union** (« - » juste avant ou juste après) : le motif de `termesDans` prend « - »
  pour une limite de mot, et balisait « sous-[[nom:produit]] » (le manuel a 29 « sous- » suivis d'une forme du
  lexique, mesuré ; dont « sous-produit transformé », que la forme la plus longue « produit transformé » baliserait
  en « sous-[[nom:pt]] », rendu « sous-préparation » en H) ;
- les **locutions** de la liste fermée du §7.2 (« prix de vente », « type de vente », « canal de vente »,
  « sous-produit(s) », « sous-produit(s) transformé(s) », « sous-PT ») : il les écrit lui-même comme exclusions
  `locution` dans le brouillon `.json`, avec leur nombre d'occurrences (au premier passage, le fichier d'exclusions
  n'existe pas encore).

**R3.4.4** — Il ne pose jamais d'accord (`acc`) : les accords sont posés à la main (§7.3). Estimation de la relecture
du 30/09 : 56 % des occurrences sont précédées d'un déterminant. Après les formes à majuscule, il reste des cas à
poser à la main (premier, première, quel(le)s, seul(e), tout…) : 22 mesurés par la relecture.

### 3.5 Contrôle par fiche (`controler.mjs <slug>…`, ou `--lot L3`, ou `--tout`)

Pour chaque fiche, dans cet ordre. **Une fiche passe si les points 1 à 6 passent.** Les points 7 à 12 sont des
signalements : chacun est corrigé, ou accepté avec sa raison dans `relectures/<lot>.auto.json` par le baliseur ; le
relecteur les relit.

1. **Identité (I10)** : `rendre(vocabDefaut, x) === origine`, comparés comme octets (`Buffer.equals`), pour
   `contenu`, `contenu_defaut` (= le balisé ; pour les 5 fiches à défaut NULL, l'origine est le contenu), `titre` et
   `partie`.
2. **Balises valides (I11)** : `verifierBalises(x)` vide (`balisesInvalides` ET chaque clé dans `LEXIQUE_CLES`).
3. **Résiduels** : aucune forme par défaut d'un terme HORS balises, sauf dans les extraits exclus. Chaque exclusion
   est employée exactement `occurrences` fois.
4. **Liens** : même suite de cibles `#slug` que l'origine, dans chaque rendu ; chaque cible est un slug existant ;
   aucun libellé de lien rendu vide.
5. **Blocs et tableaux** : même suite de lignes `:::…` (mot-clé compris) que l'origine ; dans chaque rendu, chaque
   ligne de tableau garde son nombre de « | ».
6. **Rendus écrits** dans `rendus/<lot>/hotellerie/`, `…/ceramique/`, `…/miroir/` (lexiques du §3.1). Aucun rendu ne
   contient « [[ », « ]] » ni « ‹ » suivi d'une clé (`/‹[a-z0-9_]+›/`).
7. **Mots répétés** : dans un rendu, absent du rendu par défaut : un mot ou un groupe de deux mots répété à la suite
   (« centrale centrale », « de production de production ») ; ou le rendu d'une balise de deux mots ou plus qui
   revient dans la même phrase, à moins de 12 mots (« Les sites de production (0 à N) : vos sites de production »).
8. **Gloses identiques et définitions circulaires** : un motif « X (X) », sans tenir compte de la casse (« un
   SERVICE (service) ») ; une ligne de tableau `| **X** | X …` dont la définition commence par le terme défini
   (« | **Service** | Service ou cuisine exploité… ») ; absents du rendu par défaut.
9. **Élisions** : sans tenir compte de la casse, absents du rendu par défaut : « d' », « l' », « qu' » suivis d'une
   consonne ; « de », « le », « la », « que », « du », « au », « ce », « ma », « ta », « sa » suivis d'une voyelle ou
   d'un h muet (mesuré au §7.7, exemple 3 : « d'réception » ; en miroir : « du usine », « ma armoire »).
10. **Déterminant en clair devant une balise de nom** (sur le texte BALISÉ, pas sur un rendu) : un mot qui s'accorde
    (le, la, l', un, une, du, de, de la, de l', d', au, à la, à l', ce, cet, cette, mon, ma, son, sa, aucun, aucune,
    quel, quelle, quels, quelles, nouveau, nouvel, nouvelle, premier, première, seul, seule, tout, toute, tous,
    toutes), sans tenir compte de la casse, écrit juste avant une balise `nom`, `Nom`, `court`, `Court`, `Titre` ou
    `MAJ`. Les fautes de genre devant une consonne (« Le cuisine centrale ») ne se voient qu'ici.
11. **Appositions** : deux balises de nom collées dont la seconde porte une clé à apposition (`activite`, `labo`,
    `acheteur`, `gerant` : `appo: true`, `lexiqueDefaut.ts:56-75`) en `nom` ou `Nom` (prototype de la relecture :
    33 paires ; rendu vérifié : `[[Nom:stock]] [[Nom:labo]]` donne H « Stock Cuisine centrale », contre « Stock
    Cuisine » avec `Court`). R7.1.3 et R7.1.4 demandent `Court` ou `compl`.
12. **Collisions de sens** : pour H et C, chaque forme de leur lexique (sg, pl, formes courtes) présente **en clair**
    dans le texte d'origine de la fiche, hors balises, est listée avec sa phrase (« option » en C, où `supplement` =
    « Option » ; « préparation » en H, où `pt` = « Préparation » ; tableau du §10.3). Le relecteur traite chaque mot,
    une ligne par mot et par fiche : accepté (le sens reste clair), ou envoyé aux variantes.

Rapport « mots du métier » (`--tout`) : par fiche, le compte des mots de `MOTS_METIER_MANUEL` (R2.4.3) dans le
texte d'origine. C'est la liste de travail des variantes ; jamais un échec.

Une fiche qui porte au moins une forme **non exclue** porte au moins une balise. Un champ (titre, partie, contenu,
ou titre et contenu d'une entrée) dont toutes les formes sont exclues reste sans balise : le générateur l'inscrit
dans la liste des champs admis sans balise (R3.6.5, §5.1), sinon le démarrage le signalerait à chaque fois (§5.8).

Contrôles d'ensemble (`--tout`) : les 12 parties rendues restent distinctes dans chaque domaine (`GuidePage.tsx:70-77`
regroupe par texte de partie) ; les 61 titres du manuel rendus restent distincts (61 sur 61 aujourd'hui ; le scan
du §2.4 retrouve une fiche par sa citation) ; les 32 titres de la base rendus restent distincts, sans tenir compte de
la casse, dans chaque domaine ; longueurs brutes : `titre` ≤ 200, `partie` ≤ 60 (colonnes `varchar(200)` et
`varchar(60)`) ; le `baseMd5` de chaque variante égale le md5 du `balise/manuel/<slug>.md` courant.

Variantes (`controler.mjs --variante <domaine> <slug>`) : points 2 à 12, rendu dans SON domaine seulement, et pas de
point 1 (une variante n'a pas d'origine). En plus :
- aucune forme du lexique **du domaine de la variante** (sg, pl, formes courtes) écrite en clair hors balises, sauf
  exclusion justifiée : sinon une correction du lexique par le client ne passerait pas dans la variante (R8.2.3) ;
- aucun caractère que `pdfTexte` changerait en « ? » (motif `HORS_POLICE` et table `EQUIVALENTS` de
  `src/utils/pdfTexte.ts:12-30` du front, lus par l'outil), émojis retirés comme `stripEmoji` (`manuelPdf.ts:33-34`) ;
- un titre de variante rendu n'égale aucun autre titre rendu du manuel dans ce domaine ;
- le rapport « mots du métier » de la variante (attendu : nettement plus bas que la fiche commune).

### 3.6 Générateur de migrations (`generer-migrations.mjs`)

**R3.6.1** — Il ne lit **jamais** la base. Ses entrées : `origine/`, `balise/`, `parties.json`, `variantes/`.

**R3.6.2** — Sans option, il refuse d'écrire si : un fichier contient `\r` ; une fiche de `origine/manuel/` n'a pas
son fichier balisé ; le contrôle `--tout` échoue ; une étiquette de dollar-quoting apparaît dans un texte ; le
`baseMd5` d'une variante diffère du md5 du `balise/manuel/<slug>.md` courant (la variante est alors relue, et son
`baseMd5` mis à jour par son rédacteur) ; et, pour écrire dans `migrations/` seulement, si la lecture de production
manque ou diffère sans réextraction (R3.2.2).
Avec `--fiches <slugs>` ou `--lot <lot>`, il écrit **dans le dossier d'essai seulement**, pour ces fiches, avec les
refus limités à ces fiches : c'est ce qui permet à M0 (3 fiches témoins) et aux intégrateurs de vague d'essayer la
migration. Seule l'écriture dans `migrations/` exige le contrôle `--tout` vert.

**R3.6.3** — Étiquettes sans tiret : `$m194_<slug avec soulignés>$` (manuel), `$k195_<rang>$` (base),
`$v196_<domaine avec soulignés>_<slug avec soulignés>$` (variantes). Les tirets du slug de DOMAINE sont aussi
remplacés : l'option `--slug` peut donner un slug de production à tiret (`slugify`, `domainesController.js:37-40`,
produit « industrie-ceramique », et la contrainte de la 193 admet « - »), or une étiquette de dollar-quoting ne
peut pas en contenir. Le test du générateur couvre ce cas. Aucun « $ » dans le manuel ni la base aujourd'hui (mesuré).
L'imbrication `DO $m194$ … t := $m194_stock_labo$…$m194_stock_labo$; … $m194$` a été exécutée par la relecture
(SELECT seulement) : syntaxe valide.

**R3.6.4** — Il écrit en LF : `migrations/194_manuel_balise.sql`, `migrations/195_base_connaissances_balisee.sql`,
`migrations/196_manuel_variantes_brouillons.sql`. Il écrit chaque texte balisé **une seule fois** par fiche
(variable PL/pgSQL, modèle de la migration 169 qui l'écrivait une fois par CTE,
`migrations/169_manuel_acheteurs_formules_lexique.sql:13-79`). Taille attendue : environ 230 000 caractères pour la
194 (la 143 faisait 447 Ko). Option `--slug hotellerie=<slug>` (et `ceramique=…`) : si la lecture de production
donne un autre slug au domaine Hôtellerie, les brouillons de la 196 sont écrits sous ce slug (le README le note).

**R3.6.5** — Les 2 fiches sans terme (`onboarding-activation`, `historique-paiements`) ont un fichier balisé
identique à l'origine ; le générateur n'écrit pas une fiche ou une entrée dont le balisé égale l'origine (NOTICE
« sans terme »). Il écrit aussi `src/config/manuelSansBaliseAdmis.json` : pour chaque champ (titre, partie, contenu
d'une fiche ; titre, contenu d'une entrée) qui porte une forme par défaut mais aucune balise parce que toutes ses
formes sont exclues, `{ table, champ, md5, cle }` (md5 du texte tel qu'écrit en base ; `cle` = slug ou titre
d'origine, pour la lecture humaine : le serveur cherche par `table`, `champ` et `md5`, car le titre d'une entrée de
la base change à la 195). Attendu : peu
d'entrées, peut-être aucune (des entrées de la base ne portent qu'une ou deux formes : « Panier moyen »,
« Timbre fiscal », « Charges fixes », mesuré par la relecture). Toute chaîne SQL qu'il écrit (titres, parties, clés
`lower(titre)` de la base, qui contiennent des apostrophes : « Famille et catégorie d'article », « Mode de prix
d'une fiche technique », mesuré) passe par le dollar-quoting ou par le doublement des apostrophes ; un test du
générateur le vérifie.

**R3.6.6** — En-tête de chaque fichier généré : « Généré par scripts/manuel/generer-migrations.mjs — ne pas éditer à
la main ». Pendant les vagues, il écrit dans un dossier d'essai ; il n'écrit dans `migrations/` qu'à la
consolidation (§13), et dès lors la règle R2.8.2 s'applique.

### 3.7 Essai de migration (`essai-migration.js`)

**R3.7** — Sur la base locale ou sur une copie (R2.8.2 après l'étape C) : `BEGIN`, applique dans l'ordre les fichiers
donnés (193 si absente, puis 194, 195, 196, ou les SQL d'essai d'un `--fiches`), puis vérifie **dans la même
transaction**, et `ROLLBACK` toujours :
- les NOTICE attendues (59 fiches balisées, 0 déjà balisée, 0 gardée ; 32 entrées ; 16 brouillons ; avec
  `--fiches`, celles des fiches données) ;
- pour chaque fiche : le rendu par défaut de `contenu`, `titre` et `partie` relus en base, par `rendreFiche` de
  `manuelRendu.js` (la fonction du serveur, pas une copie), égal à l'origine octet pour octet ; aucun `\r` ;
- pour les 5 fiches acheteurs : `contenu_defaut` n'est plus NULL ;
- pour chacune des 32 entrées de la base : `rendreEntreeBase(vocabDefaut, ligne)` relue en base égale l'origine
  (`titre`, `contenu`), octet pour octet (constat 2 de la relecture de O) ;
- la requête du §5.2 (exportée par `manuelRendu.js`) et `rendreFiche` pour le domaine `hotellerie` de la base
  locale (son profil RÉSOLU par `getProfil`, lexique et composants, R3.1.1) : aucune « [[ », aucun « ‹ » suivi
  d'une clé ;
- un 2e passage de 194, 195 et 196 ne change rien (NOTICE « déjà balisée » : 59 et 32 ; 196 : 0 inséré) ;
- `retour(client)` de `retour-2c.js` (sans `BEGIN` ni `COMMIT`, §4.5) ramène les textes de l'origine, octet pour
  octet, `contenu_defaut` NULL pour les 5 fiches acheteurs, et retire les lignes `_migrations` de 194 et 195.

Après le `ROLLBACK`, il relit l'empreinte globale (inchangée), `to_regclass('manuel_sections_domaine')` et les
lignes de `_migrations` (comme avant l'essai) : un `COMMIT` caché dans un fichier se verrait.

La preuve de I1 sur le **vrai contrôleur** n'est pas l'essai : c'est l'oracle, lancé sur une copie migrée (R2.8.2).

### 3.8 Fins de ligne et `.gitattributes` (mesure)

Mesures du 02/10 : `core.autocrlf = true` ; pas de `.gitattributes` ; `git ls-files --eol migrations` : 185
fichiers, 184 « i/lf w/crlf » et 1 « i/lf w/lf » (`181_gerant_acces_acheteurs.sql`) ; `scripts/` : 67 « i/lf w/crlf ».
`migrate.js:96` lit le fichier tel quel.

**R3.8** — L'étape M0 ajoute `.gitattributes` à la racine du backend :
```
migrations/*.sql text eol=lf
scripts/manuel/** text eol=lf
```

Effet mesuré dans un clone jetable (`git clone` dans le dossier temporaire, rien écrit dans le dépôt) :
`git status` ne montre que le nouveau fichier ; `git add --renormalize .` ne met **rien** en attente (tous les
blobs sont déjà en LF) ; les copies de travail restent en CRLF jusqu'à leur prochaine sortie de git (un fichier
ressorti passe en LF : mesuré sur la 190). **Pas de renormalisation à faire.** Les migrations déjà appliquées ne sont
pas relues. Ce qui change : un poste reconstruit, ou le conteneur, lira les migrations en LF, donc les textes du
manuel sans `\r`. Sans ce fichier, la 194 générée en LF ressortirait en CRLF sur un poste Windows : les textes
balisés entreraient en base avec des `\r` et le rendu par défaut ne serait plus l'origine (`stock-labo` seule a 58
fins de ligne, donc 58 `\r` en CRLF, mesuré).

---

## 4. Données et migrations

Ordre : **193** à l'étape S0 (le code du serveur lit la table) ; **194, 195, 196** générées à la consolidation, à
partir des fichiers. 194 avant 196 : chaque variante garde l'empreinte du texte commun balisé (§4.4). 195 est
indépendante. Toutes sont appliquées au démarrage, avant que le serveur écoute (`src/app.js:180-184`), en une
transaction par fichier (`migrate.js:100-104`). En production, 193 part avec le code (D1) et 194 à 196 partent seules
ensuite (D2, §12.2). Les NOTICE sortent dans les journaux préfixées « [migration] » (`migrate.js:67`).

### 4.1 Migration 193 : table des variantes

`migrations/193_manuel_sections_domaine.sql` :

```sql
CREATE TABLE IF NOT EXISTS manuel_sections_domaine (
  id           SERIAL PRIMARY KEY,
  section_id   INTEGER NOT NULL REFERENCES manuel_sections(id) ON DELETE CASCADE,
  domaine_slug VARCHAR(50) NOT NULL,
  titre        VARCHAR(200),               -- NULL : titre commun
  contenu      TEXT NOT NULL,              -- balisé, rendu avec le vocabulaire du domaine
  mots_cles    TEXT,                       -- NULL : mots-clés communs (jamais balisés)
  statut       VARCHAR(10) NOT NULL DEFAULT 'brouillon',
  base_md5     CHAR(32),                   -- md5 du contenu commun SERVI (manuel_sections.contenu, sans \r) relu
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT manuel_sections_domaine_statut_chk CHECK (statut IN ('brouillon', 'valide')),
  CONSTRAINT manuel_sections_domaine_slug_chk CHECK (domaine_slug ~ '^[a-z0-9-]{1,50}$' AND domaine_slug <> 'restauration'),
  CONSTRAINT manuel_sections_domaine_uq UNIQUE (section_id, domaine_slug)
);
```

Raisons :
- `manuel_sections` garde `UNIQUE(slug)` (contrainte `manuel_sections_slug_key`, mesurée) et une seule ligne par
  fiche : rien d'existant ne change (16 des 19 migrations du manuel visent une fiche par son slug).
- **Ciblage par slug de domaine, sans clé étrangère** (décision 1). Les ids diffèrent entre la base locale
  (restauration 1585 … hotellerie 1589, ceramique 1590) et la production ; le slug est unique
  (`domaines_activite_slug_key`, mesuré). Céramique n'existe pas en production : ses brouillons y sont écrits quand
  même et s'appliquent quand un domaine de slug `ceramique` existe et a son lexique (I12, §8.6).
- Le motif du slug accepte 1 à 50 caractères, comme ce que produit `slugify` (`domainesController.js:37-40` : 1 à
  45 caractères) : un renommage en slug d'une lettre ne doit pas finir en erreur 500 (R5.9).
- `base_md5` porte sur le texte commun **servi** (`contenu`) et non sur `contenu_defaut` : l'admin modifie
  `contenu`, jamais `contenu_defaut` (`manuelController.js:92-95`, `:116`).
- Pas de colonne `partie` : la partie reste commune, `GuidePage.tsx:70-77` regroupe la navigation par partie.
- `restauration` refusé par contrainte (I12).

Effets d'autres écrans sur cette table (§5.9) : un slug de domaine renommé dans l'admin entraîne ses variantes ; un
domaine supprimé laisse ses variantes (elles reviennent si un domaine de même slug est recréé, avec son lexique) ;
une fiche supprimée emporte ses variantes (`ON DELETE CASCADE` ; l'écran le dit, R6.1.5).

Retour arrière : table inutilisée par l'ancien serveur, inoffensive. On la laisse.

### 4.2 Migration 194 : manuel balisé

Un bloc `DO $m194$ … $m194$`. Pour chaque fiche qui porte au moins un terme (59 ; les 2 fiches sans terme,
`onboarding-activation` et `historique-paiements`, ne sont pas écrites et sont citées dans la NOTICE) :

```sql
t := $m194_stock_labo$…texte balisé…$m194_stock_labo$;
UPDATE manuel_sections m SET
  contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                 THEN t ELSE m.contenu END,
  contenu_defaut = t
WHERE m.slug = 'stock-labo'
  AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '<md5Garde de l''origine>';
GET DIAGNOSTICS n = ROW_COUNT;
IF n = 1 THEN balisees := balisees + 1;
ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'stock-labo'
                AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
ELSE gardees := gardees || 'stock-labo';
END IF;
UPDATE manuel_sections SET
  titre  = CASE WHEN titre  = 'Stock Labo'    THEN '[[Nom:stock]] [[Court:labo]]'    ELSE titre  END,
  partie = CASE WHEN partie = 'Stock & Appro' THEN '[[Nom:stock]] & [[Court:appro]]' ELSE partie END
WHERE slug = 'stock-labo';
```

Règles :
- **R4.2.1 — Garde** `md5(replace(COALESCE(contenu_defaut, contenu), E'\r', ''))` : elle couvre les 5 fiches à défaut
  NULL et les fins de ligne. Le `CASE` compare lui aussi sans `\r` et avec `COALESCE` : la condition de la 169
  (`contenu IS NOT DISTINCT FROM contenu_defaut`) serait FAUSSE pour ces 5 fiches et laisserait leur contenu sans
  balise. Mesuré par la relecture : la garde reconnaît les 61 fiches ; le `CASE` remplace 61 contenus, celui de la
  169 n'en remplacerait que 56.
- **R4.2.2 — Fiche modifiée en production** (contenu ≠ défaut) : le défaut reçoit le texte balisé, le contenu de
  l'admin est gardé ; la fiche est signalée « sans balises » (§5.7) ; « Restaurer » la rendrait balisée.
  Fiche dont le défaut ne correspond pas : rien n'est écrit, NOTICE « gardée ».
- **R4.2.3 — Titre et partie** : il n'existe ni `titre_defaut` ni `partie_defaut`, et l'admin peut les modifier
  (`manuelController.js:92-95` : `titre`, `partie` font partie des colonnes modifiables ; `restore`, `:129-144`, ne
  touche que `contenu`). Leur garde est donc l'égalité exacte avec l'origine, champ par champ, indépendante de celle
  du contenu. Un titre modifié en production reste tel quel (NOTICE) et est signalé « sans balises » s'il porte une
  forme par défaut (§5.1, champ par champ).
- **R4.2.4 — `updated_at` n'est pas touché** : le texte rendu ne change pas (I1). L'oracle le prouve (empreintes non
  masquées, `updatedAt` compris, R2.3.1).
- **R4.2.5 — NOTICE finale** : « 194 : N fiche(s) balisée(s), M déjà balisée(s), K gardée(s) : slugs ; titres gardés :
  … ; parties gardées : … ; sans terme : onboarding-activation, historique-paiements ». Attendu en production :
  59 / 0 / 0 ; au 2e passage : 0 / 59 / 0.
- **R4.2.6 — `mots_cles`** n'est pas écrit (la 169 l'écrivait ; ici il reste en texte simple).
- Idempotente : après un passage, la garde ne correspond plus (le défaut est balisé) et le test « déjà balisée »
  répond.

Retour arrière : voir §4.5. L'ancien serveur ne rend pas les balises : **ne jamais remettre l'ancien serveur sur une
base balisée** sans `retour-2c.js`.

### 4.3 Migration 195 : base de connaissances balisée

Même forme, un bloc `DO $k195$`. Pour chaque entrée qui porte un terme :

```sql
t := $k195_12$…contenu balisé…$k195_12$;
UPDATE ai_knowledge_base SET
  contenu = t,
  titre = CASE WHEN titre = 'Labo central' THEN '<titre balisé>' ELSE titre END
WHERE lower(titre) = 'labo central'
  AND md5(replace(contenu, E'\r', '')) = '<md5Contenu de l''origine>';
GET DIAGNOSTICS n = ROW_COUNT;
IF n = 1 THEN balisees := balisees + 1;
ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base
               WHERE lower(titre) IN ('labo central', lower('<titre balisé>'))
                 AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
ELSE gardees := gardees || 'labo central';
END IF;
```

- **R4.3.1 — Clé** : `lower(titre)` d'origine (index unique `idx_ai_kb_titre`, mesuré) ; les ids ne sont pas fiables
  d'une base à l'autre. Garde : md5 du contenu sans `\r` ; le titre a sa propre garde d'égalité. Au 2e passage, la clé
  d'origine ne trouve plus une entrée dont le titre est balisé (24 titres porteurs sur 32) : le test « déjà
  balisée » cherche donc sous les deux titres.
- **R4.3.2 — Unicité** : le générateur vérifie que les titres balisés restent uniques sans tenir compte de la casse
  (contrainte de l'index), et le contrôle `--tout` que les titres **rendus** restent distincts dans chaque domaine.
  Après la 195, l'index ne protège plus contre deux titres de même rendu (« Transferts » contre
  `[[Nom:transfert:pl]]`) : R5.7.1 le refuse à l'écriture.
- **R4.3.3** — La base n'a pas de défaut ni de « restaurer ». NOTICE : « 195 : N entrée(s) balisée(s), M déjà
  balisée(s), K gardée(s) ». Attendu : 32 / 0 / 0 (ou moins si des entrées sont sans terme) ; au 2e passage : 0 / 32 / 0.

### 4.4 Migration 196 : brouillons des variantes

Pour chacune des 8 fiches et chacun des 2 domaines :

```sql
INSERT INTO manuel_sections_domaine (section_id, domaine_slug, titre, contenu, mots_cles, statut, base_md5)
SELECT s.id, 'hotellerie', NULL, $v196_hotellerie_lexique$…$v196_hotellerie_lexique$, NULL, 'brouillon',
       '<md5 du contenu commun balisé>'
  FROM manuel_sections s WHERE s.slug = 'lexique'
ON CONFLICT (section_id, domaine_slug) DO NOTHING;
```

- `DO NOTHING` : un brouillon déjà corrigé par le client n'est jamais écrasé ; idempotente.
- `base_md5` = md5 du contenu commun balisé (LF), égal au `contenu` servi après la 194 pour une fiche non modifiée.
  Pour une fiche modifiée en production (R4.2.2), « à revoir » s'allume tout de suite : c'est le bon signal.
- Insérée que le domaine existe ou non (décision 1). NOTICE : « 196 : N brouillon(s) inséré(s) (hotellerie a,
  ceramique b) ; domaines absents : ceramique ». Slug d'Hôtellerie : celui de la lecture de production (R3.6.4).

### 4.5 Retour arrière

| Migration | Effet sur l'ancien serveur (`e3bf29a`) | Retour |
|---|---|---|
| 193 | aucun (table ignorée) | rien |
| 194 | **l'ancien `listPublic` servirait les balises brutes** à tous les comptes, restauration comprise | `retour-2c.js` AVANT de remettre l'ancien serveur |
| 195 | l'ancien outil enverrait les balises brutes au modèle | idem |
| 196 | aucun | rien |

Le code D1 rend les balises : tant qu'il est en place, une base balisée ou non est servie juste (§12.2).

**`scripts/manuel/retour-2c.js`** (écrit à M0, testé par l'essai) remplace le fichier SQL de la v1 : un fichier de
plus de 210 Ko (les textes d'origine) à coller dans le terminal web de Coolify est fragile, et un `BEGIN … COMMIT`
dans ce fichier validerait la transaction de l'essai (§3.7). Le script :
- est lancé dans le conteneur du serveur en place (terminal Coolify du service backend ; `Dockerfile:5` copie
  `scripts/` dans l'image, `.dockerignore` n'exclut que `node_modules`, `.env`, `*.log`, `.git` ; les variables `DB_*`
  y sont posées) : `node scripts/manuel/retour-2c.js --essai` (tout, puis `ROLLBACK`, avec le compte rendu), puis sans
  `--essai` ;
- remplace chaque champ balisé (`contenu`, `contenu_defaut`, `titre`, `partie` du manuel ; `titre`, `contenu` de la
  base) par `rendre(vocabDefaut, champ)` : I10 garantit que c'est le texte d'origine, et une fiche éditée depuis dans
  l'admin redevient elle aussi du texte en mots de la restauration ;
- remet `contenu_defaut` à NULL pour les 5 fiches acheteurs (`defautNull` vrai dans `origine/manuel/<slug>.json`)
  quand son rendu par défaut a encore le md5 d'origine (`md5Garde` du même fichier) ;
- retire de `_migrations` les lignes de 194 et 195, pour qu'un nouveau déploiement du 2c les rejoue (la 196 reste
  appliquée : ses brouillons sont inoffensifs) ;
- liste ce qu'il n'a pas remis (balise invalide restée, par exemple) ;
- ouvre et ferme lui-même sa transaction ; exporte `retour(client)`, sans `BEGIN` ni `COMMIT`, que l'essai appelle
  dans SA transaction ;
- `--remise-locale` : base locale seulement (R2.8.4).

---

## 5. Serveur (étapes S0 et S)

Fichiers : `src/controllers/manuelController.js`, `src/controllers/aiKnowledgeController.js`,
`src/controllers/domainesController.js` (une requête, §5.9), `src/services/aiToolHandlers.js`,
`src/services/aiService.js`, `src/routes/admin.js`, `src/app.js` (une ligne, §5.8), nouveaux `src/utils/manuelRendu.js`
et `src/config/manuelSansBaliseAdmis.json` (généré, `[]` jusqu'à l'étape C), `migrations/193_*`,
`scripts/vocab-lots.mjs` (§5.11), tests (`.gitattributes` est écrit à M0, §3.8). **S0** écrit `manuelRendu.js` (fonctions pures et requête du §5.2), la 193 et
leurs tests ; **S** fait le reste.

### 5.1 Module `src/utils/manuelRendu.js`

Fonctions pures, sauf `refuserBalises` (elle répond) et `controlerBalisesAuDemarrage` (elle lit la base) :
- `formesParDefaut(texte)` : formes de `LEXIQUE_DEFAUT` présentes, motif de `termesDans` (mot entier, sigle avec
  casse). Sert à `champsSansBalises` et aux outils.
- `verifierBalises(texte)` → `[{ balise, raison }]` : `balisesInvalides(texte)` (`vocab.js:164`), plus « clé
  inconnue » pour toute balise de grammaire valide dont la clé n'est pas dans `LEXIQUE_CLES` (I11), plus « balise
  non fermée » et « fin de balise sans début » (ajout de `d634b3a` : `balisesInvalides` ne voit ni un « [[ » sans
  « ]] », ni une balise coupée par un retour à la ligne ; aucun faux positif sur les 94 exemples balisés des specs).
- `refuserBalises(res, erreurs)` : pose `res.locals.vocabBrut = true` et répond 400 (R5.7.1).
- `slugVariantes(voc, profil)` = `voc.estDefaut ? null : (profil?.slug ?? null)` (I12).
- `enrichirMotsCles(voc, motsCles, composants)` (R5.4).
- `rendreFiche(voc, ligne, composants)` → copie de la ligne avec `titre`, `partie`, `contenu` rendus par
  `rendre(voc, …)` et `mots_cles` enrichis. `rendreEntreeBase(voc, ligne, composants)` : `titre`, `contenu`,
  `mots_cles`.
- `champsSansBalises(ligne, table)` → liste des champs (manuel : `titre`, `partie`, `contenu` ; base : `titre`,
  `contenu`) qui ne contiennent aucune « [[ », portent au moins une forme par défaut, et dont le md5 n'est pas dans
  `src/config/manuelSansBaliseAdmis.json` pour cette table et ce champ. **Champ par champ** : un titre resté brut à côté
  d'un contenu balisé (titre modifié en production, R4.2.3), ou une partie tapée « Stock & Appro » en clair sur une
  nouvelle fiche, est signalé. Un test sur le texte concaténé ne le verrait pas.
- `requeteManuel` : la requête du §5.2 et ses paramètres, employée par `listPublic`, par la recherche et par l'essai.
- `controlerBalisesAuDemarrage(pool)` (§5.8).

Coût mesuré : rendre les 61 fiches avec 1 408 balises prend 1,1 ms (H) ; la relecture a mesuré 1,6 à 2,4 ms pour 2 515
balises sur 221 000 caractères : environ 3 ms attendus pour 3 350. Pas de cache.

### 5.2 Résolution des variantes (requête commune)

```sql
SELECT s.id, s.slug, COALESCE(d.titre, s.titre) AS titre, s.icone, s.partie, s.ordre,
       COALESCE(d.contenu, s.contenu) AS contenu, COALESCE(d.mots_cles, s.mots_cles) AS mots_cles,
       s.ecran, s.visible_gerant, s.actif, s.updated_at
  FROM manuel_sections s
  LEFT JOIN manuel_sections_domaine d
         ON d.section_id = s.id AND d.domaine_slug = $1 AND d.statut = 'valide'
 WHERE s.actif = true
 ORDER BY s.ordre, s.id
```

`$1` = `slugVariantes(voc, profil)` : NULL pour l'admin, un compte sans domaine et tout domaine sans écart. Aucune
jointure ne répond alors, le texte commun est lu. Les colonnes et leur ordre sont ceux de `manuelController.js:34`
(I9). Le slug est un paramètre, pas un terme (I8).
`updated_at` reste celui de la fiche commune (pas de `GREATEST` avec celui de la variante, proposé le 30/09) : aucun
écran ne lit `updatedAt` du manuel (mesuré : ni `GuidePage.tsx`, ni `manuelPdf.ts`, ni `GuideButton.tsx` ; seul
`GuidePage.tsx:36` appelle `/api/manuel`).

### 5.3 `listPublic` et la recherche

**R5.3.1 — `listPublic`** (`manuelController.js:29-46`), dans cet ordre :
1. `const voc = req.voc ?? vocabDefaut;` ; si `voc.estDefaut` est faux : profil du domaine du lecteur =
   `getProfil(req.user.domaine_id)` (cache de 60 s, `domaineProfilService.js:149`, `:159`), qui donne `slug` et
   `composants` ; une erreur de lecture du profil donne `null` (texte commun, aucun enrichissement par composant),
   jamais un 500. Si `voc.estDefaut` est vrai : aucun profil lu (admin, boss, restauration, café, boulangerie) ;
2. requête du §5.2 (gérant : `AND s.visible_gerant = true`, comme `:36`) et `buildManuelContexte(req.user)` en
   parallèle, comme aujourd'hui (`:32-40`) ;
3. filtre `manuelSectionVisible(r.slug, ctx)` (`:41`) ;
4. `rendreFiche(voc, r, profil?.composants)` ;
5. `mapSection` (`:9-23`), inchangée.

La forme de la réponse ne change pas. Le PDF suit (`GuidePage.tsx:93` lui passe les sections reçues).

**R5.3.2 — `toolSearchKnowledge(clientId, toolInput, voc, profil)`** (`aiToolHandlers.js:288-325`), dans cet ordre :
1. domaine : si `voc.estDefaut`, aucun profil ; sinon le `profil` reçu, ou `getProfilForClient(clientId)` quand il
   manque et que `clientId` existe ; **toute erreur de lecture donne `null`** (texte commun, aucun enrichissement par
   composant), jamais une erreur d'outil (sinon `executeToolCall` rendrait `{ error }`, `:555-558`) ;
2. lecture : base `… WHERE actif = true ORDER BY id` (R2.2) ; manuel par la requête du §5.2 (sans `icone`, `ordre`…
   inutiles ici : `slug, titre, partie, contenu, mots_cles`), contexte de visibilité comme `:298` ;
3. filtre `manuelSectionVisible` ;
4. **rendu** : `rendreEntreeBase` sur la base, `rendreFiche` sur le manuel ;
5. **citation** `Manuel — ${partie} › ${titre}` sur le titre et la partie rendus (`:304`) ;
6. **troncature** à 6 000 du contenu **rendu** (`:300`, `:305`) : jamais au milieu d'une balise ;
7. **score** sur les textes rendus et les mots-clés enrichis (`:310-320`), puis `disponibles` (`:322`) avec les
   titres rendus.

**R5.3.3 — `executeToolCall(clientId, toolName, toolInput, voc, profil)`** : `case 'search_knowledge_base': return
await toolSearchKnowledge(clientId, toolInput, await vocDuCompte(), profil);` (`:551`). `chatWithAI` passe son
`profil` (`aiService.js:314`, profil lu `:260-265`) : pas de requête de plus. Le repli `vocDuCompte()` (`:535`) reste :
l'oracle et `test-manuel-filtre.js` appellent sans `voc` ni `profil` (R2.3.3).

### 5.4 Mots-clés enrichis (décision 3)

**R5.4** — `enrichirMotsCles(voc, motsCles, composants)` :
1. si `motsCles` est vide ou si `voc.estDefaut` est vrai : renvoie `motsCles` **tel quel** (restauration, café,
   boulangerie : identité, même avec des composants hors identité) ;
2. pour chaque clé de `LEXIQUE_CLES` hors `*_abr` dont une forme par défaut (sg, pl, court sg, court pl) figure dans
   `motsCles` (mot entier, **sans tenir compte de la casse, sigles compris** : les mots-clés sont écrits en
   minuscules, « pt » dans 5 fiches et aucun « PT », mesuré), et dont le rendu diffère dans `voc` : ajoute
   `voc.nom(k)`, `voc.nom(k, true)`, `voc.court(k)`, `voc.court(k, true)` ;
3. pour chaque composant actif du domaine (profil résolu, `domaineProfilService.js:124-132` ; champs `libelle`,
   `libellePluriel`, `typeTechnique`, `actif` de `mapComposant`, `:84-100`) dont le type technique correspond à une
   telle clé (`activite` → `activite`, `labo` → `labo`, `gerant` → `gerant`, `acheteurs` → `acheteur`), **si une forme
   par défaut de cette clé est une entrée entière de `motsCles`** (entre deux virgules : « activité », « labos ») :
   ajoute son libellé et son pluriel, en minuscules, **sauf un libellé de moins de 4 lettres** (« bar », « spa ») ;
4. sans doublon, sans reprendre un mot déjà présent (sans casse) ; résultat `${motsCles}, ${ajouts.join(', ')}`.

Exemples mesurés avec un prototype (lexique et composants H de la base locale, règle de la v1) :
- `stock-labo` (« stock labo, laboratoire, labo central, production, produit transformé, pt, approvisionnement… ») :
  ajout de « cuisine centrale, cuisines centrales, cuisine, cuisines, préparation, préparations, prépa, prépas… » ;
- `transferts` : ajout de « service, services, cuisine centrale, …, livraison interne, livraisons internes,
  restaurant, restaurants, room service… » ;
- avec le vocabulaire par défaut, rien n'est ajouté, même avec les composants H (vérifié).
Avec l'étape 3 resserrée, les libellés de composants vont à 16 fiches au lieu de 22 (fiches dont les mots-clés portent
« activité(s) » ou « labo(s) » comme entrée, contre « quelque part », mesuré).

**Effet sur la recherche, mesuré par la relecture** (prototype à la lettre de la v1, 41 questions du guide de mise en
route, H 22 et C 19) : la fiche attendue est dans les 4 premiers résultats pour H 20 sur 22 et C 18 sur 19, **avec
ou sans enrichissement**. L'enrichissement ne fait entrer aucune fiche attendue. (Simulation de la relecture, sur
un manuel rendu approché, non refaite par la v2 ; le mécanisme est vérifié : score par morceaux de mots,
`aiToolHandlers.js:316`. Le rapport R2.4.6 le mesurera sur le vrai serveur.) « Comment créer mon bar ? » et « mon
spa ? » ne trouvent pas `activites`, avec ou sans : le score compte les morceaux de mots (§0.4). L'enrichissement
reste utile pour une question posée avec un mot de LabFlow (« transfert ») ou un libellé long (« room service »,
« showroom »). La v1 affirmait que les questions qui nomment un composant trouvent la fiche grâce à lui : c'est
retiré. Le rapport R2.4.6 le mesurera sur le vrai serveur. Question 10 au client (§14).

### 5.5 Description de l'outil de recherche (`aiToolHandlers.js:727-736`)

**R5.5** — La description (`:728`) et celle de `query` (`:732`) passent par `voc` dans `outilsAnthropic(voc)` :

```js
description: `Recherche dans la base de connaissances métier LabFlow pour comprendre/expliquer un concept (${voc.nom('fiche_technique')}, ${voc.nom('food_cost')}, ${voc.nom('cout_matiere')}, ${voc.nom('stock')}, ${voc.nom('appro', true)}, ${voc.nom('perte', true)}, ${voc.nom('inventaire')}, ${voc.nom('transfert', true)}, ${voc.nom('article', true)} ${voc.acc('article', 'valorisés', 'valorisées')}, ${voc.ex('produits vendables/utilisables', `${voc.nom('produit_vendable', true)}, ${voc.nom('produit_utilisable', true)}`)}, seuil minimum, TVA, ${voc.nom('marge')}, panier moyen…). À utiliser DÈS QUE le client pose une question conceptuelle, demande une définition, un conseil ou une interprétation — AVANT de répondre.`,
…
query: { type: 'string', description: `Mots-clés ou question du concept à rechercher (ex: "${voc.nom('fiche_technique')}", "comment est ${voc.acc('food_cost', 'calculé', 'calculée')} ${voc.le('food_cost')}")` },
```

Rendus mesurés avec le vrai moteur (et refaits par la relecture) :
- défaut : **identique** aux deux textes d'aujourd'hui (comparaison exacte) ;
- H : « (fiche technique, ratio matière, coût matière, stock, approvisionnements, pertes, inventaire, livraisons
  internes, fournitures valorisées, prestations vendues, consommables, seuil minimum, TVA, marge, panier moyen…) » ;
  `query` : « (ex: "fiche technique", "comment est calculé le ratio matière") » ;
- C : « (fiche de coût de revient, taux de coût matière, coût matière, stock, réceptions, pertes, inventaire,
  livraisons internes, matières premières valorisées, produits finis, semi-finis, …) ».

Le fragment « produits vendables/utilisables » n'a pas d'écriture `voc` identique par défaut (une seule forme pour
deux termes). Il passe par `voc.ex` : la liste entre parenthèses est une liste d'exemples de concepts. C'est un
écart assumé à la règle du 2a « `voc.ex` seulement pour les exemples de saisie » (lot-2-spec §2.1), limité à ce seul
fragment ; aucune relecture ne l'a contesté. Sans lui, la description d'un compte restauration changerait (I1).

Suites : les entrées `reporte` / `lot: 2c` de `scripts/vocab-allow/B1.json:293-310` sont retirées ; les 32
exceptions `2c` aussi (R2.4.5) ; `test/B1-assistant.test.js:95-96` (« recherche reportée au 2c ») et `:106-107`
(boucle qui saute l'outil) sont réécrits : en H, la description contient « ratio matière » et « livraisons
internes », aucune forme par défaut d'activité, labo, article ou ingrédient. Le JSON par défaut reste identique à la
référence (`:69-70`).

### 5.6 Glossaire de l'assistant : règle 3 remplacée

**R5.6** — Dans `glossaireVocabulaire` (`aiService.js:51-121`), la règle 3 (`:120`, « La base de connaissances et le
manuel sont rédigés avec les mots de LabFlow : cherche avec ces mots… ») devient :

> 3. Le manuel et la base de connaissances sont écrits avec les mots du compte. Quelques noms de LabFlow y restent
> tels quels (noms d'offres comme « Activité Basique », « sous-produit ») : cite-les sans les traduire.

Raison (relecture langue) : après le 2c, le manuel rendu garde des mots de LabFlow exclus (« sous-produit » 28 + 2,
noms d'offres en `nom-fige`) ; la règle 1 interdit au modèle « ceux de LabFlow », et la flèche « Activité → Service »
le pousserait à écrire « Service Basique ». La règle « articles vendables » reste « 4. » (`regleVendables`,
`:102-103`, inchangé). Les commentaires `:21-24` et `:68-71` sont mis à jour (le manuel et la base parlent désormais
les mots du compte ; les lignes des clés copiées restent utiles pour les données des outils). Aucune autre ligne du
glossaire ne change.

En restauration le glossaire est absent (`:53`, `:94`) : rien ne change pour elle. Suites :
`test/B1-assistant.test.js:139` (« 4. » : inchangé) et `:142` (le nouveau texte de la règle 3) ; l'écart admis du
glossaire, aujourd'hui dans `B1.json` (texte cité `:196`, archivé au point 1 du §2.7 car sans objet), est réécrit dans
`scripts/vocab-allow/2c.json` sur le nouveau texte (type `non-repliable`, justification : R5.6).

### 5.7 Admin : validation, badge, variantes

**R5.7.1 — Refus 400 des balises invalides.** `create` et `update` du manuel (`manuelController.js:64-88`,
`:91-126`) et de la base (`aiKnowledgeController.js:27-44`, `:47-68`) appellent `verifierBalises` sur `titre`,
`partie`, `contenu` (manuel) ou `titre`, `contenu` (base), **seulement pour les champs présents** dans le corps : les
deux écrans envoient `{ actif }` seul pour activer ou désactiver (`AdminManuelPage.tsx:96`,
`AdminKnowledgeBasePage.tsx:60`). Toute balise invalide ou à clé inconnue →
`400 { code: 'BALISE_INVALIDE', message, balises: [{ champ, balise, raison }] }`. Une balise (« [[ ») dans
`mots_cles`, `slug`, `icone`, `ecran` ou `categorie` → `400 { code: 'BALISE_INTERDITE', message }`.
Le message cite la balise fautive : c'est une donnée saisie. La réponse pose donc `res.locals.vocabBrut = true`
(mécanisme du 2b, `rendreMessages.js:84`) : sinon le middleware rendrait la balise citée (« ‹labbo› ») et écrirait
« [vocab] balise invalide » au journal à chaque refus. `refuserBalises(res, erreurs)` de `manuelRendu.js` pose ce
drapeau et répond ; elle sert aux 5 routes d'écriture (manuel : création, mise à jour ; base : création, mise à
jour ; variante : `PUT`). Les sites qui posent `vocabBrut` passent de 1 (`adminSiteController.js:154`) à 2 ;
`VOCAB-GUIDE-SERVEUR.md` (`:108`) est mis à jour.
Longueurs : `titre` > 200 ou `partie` > 60 → 400 (aujourd'hui une erreur de base, donc 500).
Base, titres en double : `create` et `update` refusent (409, même message qu'aujourd'hui, `aiKnowledgeController.js:40`)
un titre dont `lower(rendre(vocabDefaut, titre))` égale celui d'une autre entrée : après la 195, l'index sur
`lower(titre)` brut ne le voit plus (R4.3.2).
Base, effacement des mots-clés : si le client répond oui à la question 6 (§14, recommandé), `update`
(`aiKnowledgeController.js:52-59`) ne touche `mots_cles` et `categorie` que s'ils sont présents dans le corps
(aujourd'hui `mots_cles = $3`, `categorie = $4` les effacent quand l'écran n'envoie que `actif`).

**R5.7.2 — Badge « sans balises ».** `adminList` (`:49-61`) et la liste de la base (`aiKnowledgeController.js:14-24`)
ajoutent un champ `sansBalises` (booléen : `champsSansBalises(ligne)` non vide). Même règle que R5.8 : **quand
aucune fiche (resp. aucune entrée) n'a de balise en base** (production entre D1 et D2, base locale avant la
consolidation), `sansBalises` vaut faux partout ; sinon les 59 fiches et les entrées porteuses seraient marquées
pendant la fenêtre, alors que §6.4 promet un admin inchangé. Champ ajouté à deux réponses **admin** seulement
(I9 : listé au §10.2). `modifie` (`:52`) ne change pas ; pour les 5 fiches acheteurs, il devient
calculable (défaut posé par la 194).

**R5.7.3 — Routes des variantes** (`src/routes/admin.js`, à côté de `:186-191`, `requireSuperAdmin` ; aucune route
`GET /admin/manuel/:id` n'avalerait `/admin/manuel/variantes`, `admin.js:186-191` vérifié) :
- `GET /admin/manuel/variantes` → toutes les variantes : `{ id, sectionId, slug, domaineSlug, domaineExiste,
  domaineAvecEcart, titre, contenu, motsCles, statut, aRevoir, updatedAt }`, avec `aRevoir` =
  `md5(replace(s.contenu, E'\r', '')) <> base_md5` (texte commun **servi** : une retouche dans l'admin le change) ;
- `PUT /admin/manuel/:id/variantes/:domaineSlug` `{ titre?, contenu, motsCles?, statut }` : création ou mise à jour.
  404 si la fiche `:id` n'existe pas ; 400 si le slug est mal formé ou vaut `restauration` ; 400
  `VARIANTE_DOMAINE_SANS_ECART` si le domaine existe et que son lexique résolu ne s'écarte pas du défaut (I12) ;
  400 `DOMAINE_INCONNU` pour **créer** une variante d'un domaine qui n'existe pas (une variante existante d'un
  domaine absent, comme les brouillons Céramique en production, reste modifiable) ; `titre` > 200 → 400 ; balises
  vérifiées comme au R5.7.1 ; `base_md5` reprend `md5(replace(contenu commun servi, E'\r', ''))` du moment
  (enregistrer vaut relecture) ;
- `DELETE /admin/manuel/:id/variantes/:domaineSlug`.

**R5.7.4** — `restore` (`:129-144`) ne change pas : il remet `contenu_defaut`, désormais balisé.

### 5.8 Avertissement au démarrage

**R5.8** — Après `app.listen` (`src/app.js:182-184`), sans attendre et sans jamais lever :
`controlerBalisesAuDemarrage(pool)` lit les fiches et entrées actives et écrit :
- `[manuel] N fiche(s) sans balises : slug (champs), …` et `[manuel] base de connaissances : N entrée(s) sans
  balises : …` quand N > 0 (champ par champ, `champsSansBalises`, liste des champs admis comprise) ;
- une seule ligne `[manuel] manuel non balisé (aucune balise en base)` quand aucune fiche n'a de balise (base locale
  avant la consolidation, et production entre D1 et D2 : évite 59 lignes à chaque démarrage) ;
- rien quand tout est balisé.

Attendu en production : la ligne « manuel non balisé » après D1 ; **aucune ligne `[manuel]`** après D2.

### 5.9 Slug de domaine renommé

**R5.9** — `domainesController.update` (`:243`), dans sa transaction, juste avant l'`UPDATE domaines_activite`
(`:297-313`) : si le slug change et que des variantes existent déjà pour le nouveau slug (domaine supprimé puis
recréé), 409 `{ code: 'VARIANTES_EXISTANTES', message: 'Des variantes du manuel existent déjà pour ce slug' }`
(sinon l'unicité donnerait le faux 409 « Ce domaine (nom ou slug) existe déjà », `:408`). Juste après l'`UPDATE` :
`UPDATE manuel_sections_domaine SET domaine_slug = $nouveau, updated_at = NOW() WHERE domaine_slug = $ancien`. Le slug
`restauration` ne change jamais (`:277-280`). La suppression d'un domaine (`:417-454`) ne touche pas les variantes.
Le cache du profil (60 s) suit le renommage par `invalidate` (`:399`).

### 5.10 Ce qui ne change pas, vérifié

- `rendreMessages` ne rend que `message` et `erreurs[].message` : il ne touche pas le manuel (`:58-70`).
- Les conversations enregistrées ne gardent que les messages de l'utilisateur et de l'assistant, jamais les résultats
  d'outils (`aiService.js:321-339`) : aucune balise n'y entre.
- `onboardingEtat.js` (questions du guide) ne change pas : ses questions sont déjà dans les mots du compte ; c'est la
  recherche qui devient cohérente avec elles (R2.3.2, R5.4).
- Aucun cache HTTP ni service worker sur `/api/manuel` côté écran (vérifié par la relecture).

### 5.11 Tests (backend)

- Nouveau `test/2c-manuel.test.js` (faux pool, sans base) :
  - `listPublic` par défaut : une fiche balisée rend exactement l'origine ; une fiche sans balise passe intacte ;
  - H : titres, parties, contenus rendus ; une variante `valide` est servie, une `brouillon` non ; un compte
    restauration ne lit jamais de variante ; un admin lit le texte commun ; **un compte café ne lit pas une variante
    `cafe` validée** (I12) ;
  - `enrichirMotsCles` : rien par défaut, même avec des composants ; H : formes et libellés ajoutés, sans doublon ;
    « pt » en minuscules reconnu ; libellé de moins de 4 lettres non ajouté ; composants seulement si le terme est une
    entrée entière ;
  - `toolSearchKnowledge` : rendu avant troncature (fiche de plus de 6 000 caractères dont une balise chevauche la
    coupe), citation rendue, `ORDER BY` présent dans les deux requêtes, `voc` et `profil` transmis par
    `executeToolCall` ; erreur de lecture du profil → texte commun, pas d'erreur d'outil ;
  - `verifierBalises` : `[[nom:labbo]]` refusé (clé inconnue), `[[nom:labo:xx]]` refusé, `[[Nom:labo]]` admis ;
  - validation admin : 400 `BALISE_INVALIDE` avec `vocabBrut` posé, 400 `BALISE_INTERDITE` sur `mots_cles` ; une
    mise à jour `{ actif }` seule passe sans toucher les autres champs ; 409 sur deux titres de la base de même rendu ;
    si Q6 = oui, basculer `actif` garde `mots_cles` et `categorie` ;
  - variantes : 404 fiche inconnue, 400 `VARIANTE_DOMAINE_SANS_ECART`, 400 `DOMAINE_INCONNU`, `aRevoir` après une
    retouche du contenu commun ;
  - `champsSansBalises` (titre brut à côté d'un contenu balisé ; champ admis), `controlerBalisesAuDemarrage` (3 cas du
    R5.8) ; renommage de slug (R5.9, dont 409 `VARIANTES_EXISTANTES`).
- `test/B1-assistant.test.js` : R5.5 et R5.6.
- `scripts/vocab-lots.mjs` : `src/utils/manuelRendu.js` est ajouté au `socle` (`:27-29`) ; sinon un résidu de vocabulaire
  dans ce fichier ferait sortir l'outil en erreur (`:13-14`).
- E2E : `scripts/test-vocabulaire-domaine.js` étendu (compte H de test : `/api/manuel` sans forme par défaut hors
  exclusions dans titres et parties ; aucune variante n'existe avant l'étape C : le test **crée** sa variante par
  `PUT`, la valide, la lit, la supprime dans un `finally`). Avant et après la validation : empreinte de
  `GET /api/manuel` d'un compte restauration et de l'admin identiques, et même recherche d'un compte restauration
  identique (une variante validée ne change rien ailleurs). `scripts/test-manuel-filtre.js` inchangé et vert (avec
  R2.2, « Le portail acheteur » reste 2e, score 7, simulé par la relecture).

---

## 6. Écrans (étape A)

Fichiers : `src/components/admin/AdminManuelPage.tsx`, `src/components/admin/AdminKnowledgeBasePage.tsx`. Ils sont
dans `src/components/admin/`, hors du périmètre de l'outil de preuve (`HORS_VOCABULAIRE`, `vocab-check.mjs:198`) :
la légende peut y écrire des balises en clair, c'est son but. I4 : l'espace admin reste en vocabulaire LabFlow.
Moteur du front disponible : `vocabDuLexique` (`vocab.ts:625`), `balisesInvalides` (`rendre.ts:158`), `LEXIQUE_CLES`
(`lexiqueDefaut.ts:124`). Les deux pages sont déjà en `lazy` et emploient `useConfirm`.

### 6.1 `AdminManuelPage`

**R6.1.1 — Liste.** Titres et parties affichés rendus par `vocabDefaut` (aujourd'hui bruts : `:180`, `:188`) ; la
recherche (`:124-126`) et le filtre de partie portent sur ces textes rendus ; les titres des confirmations (`:102`,
`:115`) aussi. Badge « sans balises » (champ `sansBalises`), à côté de « modifié » (`:191`).
La liste de propositions des parties (`datalist`, `:55-59`, `:241-244`) propose les parties **brutes** (balisées),
chacune avec son rendu par défaut affiché : une nouvelle fiche tapée « Stock & Appro » en clair formerait un groupe à
part en Céramique (« Stock & Réception » pour les autres), car `GuidePage.tsx:70-77` regroupe par texte rendu.

**R6.1.2 — Aperçu.** Un sélecteur « Aperçu dans le domaine : » (Restauration par défaut, puis les domaines de
`GET /api/domaines`, qui rend à l'admin chaque domaine avec son lexique résolu, `domainesController.js:61-82`).
L'aperçu rend titre, partie et contenu avec `vocabDuLexique(domaine.lexique)` (Restauration : `vocabDefaut`)
**avant** `MarkdownView` (aujourd'hui : texte brut, `:259`). `MarkdownView` ne reçoit jamais de balise : sinon un
libellé de lien qui contient une balise ne serait plus reconnu (`MarkdownView.tsx:116`).

**R6.1.3 — Légende des balises**, sous l'aide Markdown (`MD_HELP`, `:30`), repliable : une douzaine de balises
(`[[nom:labo]]`, `[[Nom:labo]]`, `[[nom:labo:pl]]`, `[[le:labo]]`, `[[du:labo]]`, `[[de:appro]]`, `[[au:labo]]`,
`[[votre:activite:pl]]`, `[[Court:labo]]`, `[[avecCourt:pt:pl]]`, `[[acc:labo:créé:créée]]`, `[[MAJ:labo]]`,
`[[det:labo:du]]`), chacune avec son rendu par défaut et dans le domaine choisi, calculés à l'affichage.

**R6.1.4 — Balise fautive.** Avant l'enregistrement, l'écran signale les balises invalides et les clés inconnues
(même contrôle que `verifierBalises`, balise non fermée comprise, avec le moteur du front et `LEXIQUE_CLES`). Le serveur reste juge (R5.7.1) ;
son message s'affiche comme aujourd'hui (`:91`).

**R6.1.5 — Variantes.** Dans la fenêtre d'édition, une rangée d'onglets « Commun » puis un onglet par variante de la
fiche, plus « + Variante pour… » (seulement les domaines qui existent et dont le lexique s'écarte du défaut :
`vocabDuLexique(domaine.lexique).estDefaut` faux). Un onglet de variante édite son contenu (et son titre,
facultatif), montre son statut (case « Validée : servie aux comptes du domaine »), le badge « à revoir » (`aRevoir`),
« domaine absent » (`domaineExiste` faux) ou « domaine sans lexique » (`domaineAvecEcart` faux : non servie, I12), et
un bouton « Supprimer la variante » avec confirmation (`useConfirm`). L'aperçu prend alors le domaine de la variante.
La confirmation de suppression d'une fiche (`:114-118`) ajoute : « Ses variantes par domaine seront aussi
supprimées. » quand elle en a.

### 6.2 `AdminKnowledgeBasePage`

**R6.2** — Liste : titre **et contenu** rendus par `vocabDefaut` (le contenu est affiché, `:122`) ; la liste est triée
à l'écran par catégorie puis par titre rendu (le serveur trie sur le titre brut, `aiKnowledgeController.js:17` : après
la 195, l'ordre change ; mesuré en collation `French_France.1252` : « [[Nom:labo]] central » se range avant
« Marge ») ; badge « sans balises ». Sous le
formulaire, un aperçu simple (titre et contenu rendus, texte brut à la ligne) avec le même sélecteur de domaine ;
signalement des balises fautives avant l'enregistrement ; message du serveur affiché comme aujourd'hui.

### 6.3 Ce qui ne change pas, vérifié

- `GuidePage.tsx` affiche ce que le serveur envoie : chargement (`:36`), fiche par slug (`:48`, `:65`), recherche
  locale sur `titre partie motsCles contenu` (`:59`, qui profite des mots-clés enrichis), navigation par partie
  (`:70-77`, `:124-127`), clés `key={partie}` et `key={s.slug}` (`:125`, `:133`), PDF (`:93`). **Rien à changer**,
  à condition que les parties rendues restent distinctes (contrôle `--tout`, §3.5).
- `MarkdownView.tsx` : blocs (`:42`), liens (`:116`) : reçoit du texte rendu.
- `manuelPdf.ts` : reçoit des sections rendues ; `pdfTexte` (`:34`), liens retirés (`:40`), partie et titre dans le
  bandeau et le sommaire (`:219-228`). Rien à changer (R2.6.1).
- `GuideButton.tsx:12`, `HelpButton.tsx:23` : slugs inchangés.

### 6.4 Bascule (D1, écrans, D2 : §12.2)

- **Serveur D1 + ancien écran** : la base est en texte brut ; le client lit le manuel d'aujourd'hui ; l'admin marche
  comme aujourd'hui (aucun badge « sans balises » : R5.7.2). Seul effet en avance : la nouvelle règle 3 du glossaire
  (R5.6, « le manuel et la base sont écrits avec les mots du compte ») part avec D1 alors que le manuel et la base
  restent bruts jusqu'à D2. Elle ne touche que les comptes de test H (glossaire absent en restauration,
  `aiService.js:53`, `:94`) : la fenêtre D1 → D2 doit rester courte (§12.2).
- **Serveur D1 + nouvel écran** : l'aperçu et la légende marchent sur un texte brut ; les routes de variantes
  répondent.
- **Serveur D2 + nouvel écran** : état final. L'écran part avant D2 : l'admin ne montre jamais de balise brute dans sa
  liste. Un enregistrement depuis un ancien onglet resté ouvert renvoie le texte balisé tel quel : il passe la
  validation, rien n'est perdu. Consigne : ne pas éditer le manuel pendant la bascule.
- **Ancien serveur + nouvel écran** (ordre interdit) : l'aperçu marche, les routes de variantes répondent 404.

---

## 7. Règles de balisage d'un texte Markdown

Ce chapitre est la base de `scripts/manuel/GUIDE-BALISAGE.md`. API et grammaire : lot-2-spec §2.1 et §2.2.

### 7.1 Quand baliser

- **R7.1.1** — Toute forme d'un terme du lexique qui désigne la notion de LabFlow : nom, déterminant compris quand il
  dépend du terme (`[[du:labo]]`, jamais « du [[nom:labo]] » : « du » deviendrait faux pour un terme féminin). Le
  contrôle le signale (§3.5, point 10).
- **R7.1.2** — L'élision se fait par le moteur, jamais à la main : `[[de:appro]]`, pas `d'[[nom:appro]]` (mesuré : C
  donne « d'réception », exemple 3).
- **R7.1.3** — Nom d'écran, de bouton ou de menu cité tel qu'à l'écran (en gras ou entre « ») : le baliseur
  **cherche le libellé dans le front** (`src/i18n/locales/fr.json`, `src/components/`) et reprend l'appel `voc` de
  l'écran ; il note le `fichier:ligne` dans son compte rendu. Si l'écran ne porte pas le terme, le manuel reste tel
  quel (exclusion `nom-fige`). Deux cas vérifiés : « **↗ Transfert** » (`transferts`) : l'écran écrit « ↗ » +
  `t('client.labo.btn_transfer')` = « Transférer » (`StockLaboPage.tsx:706`, `fr.json:125`) : `[[Nom:transfert]]`
  donnerait « ↗ Livraison interne » en H, ce n'est pas le bouton ; « **Avec labo** » (`compte-activites-labos`) :
  l'écran écrit `Avec {voc.nom('labo')}` (`ActivitesPage.tsx:954`) : `Avec [[nom:labo]]` (H « Avec cuisine
  centrale »), pas la forme courte. Le manuel a 406 passages en gras qui portent un terme, dont 40 boutons ou chemins
  (relecture) ; le relecteur vérifie 1 libellé sur 5.
- **R7.1.4** — Apposition « stock labo » dans une phrase : `[[nom:stock]] [[compl:labo]]` ; dans un nom d'écran :
  forme courte. Le contrôle signale deux balises de nom collées (§3.5, point 11).
- **R7.1.5** — Ancien nom ou sigle : « PT », « FT », « appro » par la forme courte (`[[court:pt]]`, `[[Court:appro]]`),
  **seulement là où l'origine emploie le sigle**. En pleine phrase, la forme courte rend un mot familier en H (« une
  prépa ») et un sigle en C (« un PF ») : la relecture C vérifie que la fiche explique le sigle une fois (souvent par
  un « X (SIGLE) » d'origine, `avecCourt`).
- **R7.1.6** — « compte dépôt » : `compte [[nom:depot]]` (la clé `depot` désigne ce type de compte,
  `lot-1a-spec.md:79` ; aucun domaine ne la change aujourd'hui).

### 7.2 Quand exclure (types de `exclusions`)

| Type | Quand | Exemples du manuel |
|---|---|---|
| `homonyme` | même mot, autre sens | « supplément » tarifaire de l'abonnement (« le prix de chaque supplément en DT »), « Domaine d'activité », « article » de la base de connaissances |
| `locution` | groupe figé | « prix de vente », « type de vente », « canal de vente », **« sous-produit(s) »**, « sous-produit(s) transformé(s) », **« sous-PT »** (décision 2 : même notion) |
| `nom-fige` | nom commercial, ancien nom, ou nom de bouton que l'écran écrit sans le terme | « Activité Basique / Premium », « Formule d'activités », « anciennement « article valorisé » », « ↗ Transfert » (R7.1.3) |
| `capitales` | capitales partielles qu'aucune balise ne reproduit, **seulement** quand une forme par défaut reste hors balise (§7.4) | rare : « produit VENDABLE » n'en a pas besoin (exemple 11) |
| `exemple` | exemple métier dans un bloc `:::exemple` qu'aucune balise ne rend juste | « Tarte aux fraises » (le terme autour reste balisé) |
| `glose` | explication entre parenthèses qui redirait le terme | « (point de vente) » après « activité » (exemple 9) |

« sous-préparation(s) » (10) et « sous-composant(s) » (2) ne contiennent aucune forme du lexique par défaut
(« préparation », « composant » n'en sont pas, mesuré) : ils ne sont ni balisés ni exclus ; une exclusion serait
« sans emploi ».
Les verbes (transférer, approvisionner, vendre) ne sont pas des formes du lexique : ils ne sont ni balisés ni exclus,
mais la relecture vérifie la phrase (« transférer » à côté de « livraison interne »).

### 7.3 Accords

- **R7.3.1** — Un accord se balise **seulement s'il dépend du terme**. « seule » dans « la seule voie d'entrée en
  stock » s'accorde avec « voie » : rien à baliser (exemple 3 quater). Le piège de DEPART-2c §4 (« le transfert est
  le seul moyen » balisé `[[acc:transfert:seul:seule]]`) donne « la livraison interne est le seule moyen ».
- **R7.3.2** — L'accord suit le mot qui le commande, qui n'est pas toujours le terme visible : dans « Point de vente
  ou cuisine exploité », « exploité » suit « point de vente » (`activite_desc`, masculin), pas « activité » (féminin).
  `[[acc:activite:…]]` casse l'identité ; `[[acc:activite_desc:exploité:exploitée]]` la garde (exemple 14).
- **R7.3.3** — Participes, adjectifs, pronoms de reprise : `[[acc:clé:masc:fem]]` ou `[[acc:clé:masc:fem:pl]]`. Liste
  à vérifier autour de chaque terme balisé (les rendus miroir montrent les oublis) : il / elle (et l'inversion
  « peut-il »), le / la pronom, celui / celle, chacun / chacune, l'un / l'une, un / une ou plusieurs, aucun / aucune,
  tous / toutes (`[[tous:clé:mes]]`), premier / première, dernier / dernière, seul / seule (si le terme le commande).
  Idiome « votre premier / votre première » : `[[acc:clé:votre premier:votre première]]` (exemple 4).
- **R7.3.4** — Deux termes coordonnés :
  - par « **ou** » : accord de proximité avec le plus proche (lot-2b-spec §6.4, ligne 586 : « correct pour une
    alternative en « ou » ») ;
  - par « **et** » : le français veut le masculin pluriel dès qu'un des termes est masculin. Si, dans les lexiques
    réels (défaut, H, C), l'un des deux termes est toujours masculin, on laisse l'accord **sans balise**, au masculin
    pluriel ; sinon on pose `acc` sur le terme qui peut être féminin et on note le cas dans `relectures/<lot>.json`.
    Mesuré : `[[le:ingredient:pl]] et [[le:pt:pl]] [[acc:pt:déduits:déduites:pl]]` donne en H « les composants et les
    préparations déduites » (faux) ; sans balise, « déduits » est juste en défaut, H et C (le miroir, où les deux
    termes sont féminins, reste faux : accepté, le miroir n'est pas un vrai domaine). La balise `accN` n'existe pas
    (§0.4) ; un vrai besoin va dans `besoins/<lot>.json`, hors 2c.
- **R7.3.5** — La relecture des rendus **miroir** (genre et élision inversés) est obligatoire : c'est elle qui montre
  les accords oubliés. L'outil `accords` de `vocab-check` ne lit pas le Markdown.

### 7.4 Majuscules, capitales, déterminant suivi d'un adjectif

- Début de phrase ou titre : la variante à majuscule du déterminant (`[[Le:labo]]`) ou la casse `Nom` / `Titre`.
- Mot entièrement en capitales : `[[MAJ:labo]]` ; son déterminant par `[[det:labo:du]]` collé devant (exemple 9) :
  jamais « du [[MAJ:labo]] ».
- `det` / `Det` seulement **collé au nom ou à `MAJ`** : l'élision est calculée sur le nom, pas sur le mot qui suit.
  Avec un adjectif entre les deux (seul, propre, premier, dernier, nouveau, même) : `[[acc:clé:le seul:la seule]]
  [[nom:clé]]`. Mesuré : `[[det:labo:le]]seul [[nom:labo]]` donne H « la seul cuisine centrale », miroir « l'seul
  usine » ; `[[acc:labo:le seul:la seule]] [[nom:labo]]` donne H « la seule cuisine centrale », miroir « la seule
  usine », défaut identique (exemple 17).
- Capitales partielles (« produit VENDABLE ») : on balise le mot en minuscules s'il est un terme (`[[Un:produit]]`) et
  on laisse le mot en capitales tel quel. Pas d'exclusion quand plus aucune forme par défaut ne reste hors balise
  (sinon elle serait sans emploi) ; l'accord qui suit se balise (exemple 11).

### 7.5 « X (SIGLE) », gloses, adjectif déjà contenu dans le terme

- « produits transformés (PT) » : `[[avecCourt:pt:pl]]` ou `[[le:pt:pl]] ([[court:pt:pl]])`, au choix, mêmes rendus
  (exemples 1 et 1 bis). `avecCourt` n'écrit pas de parenthèse si les deux formes sont égales.
- Glose qui explique un terme par une clé copiée (`activite_desc`, `labo_long`, `labo_desc`) : elle redit le terme
  dès que le domaine le change (« un SERVICE (service) »). Le contrôle le signale (§3.5, point 8) ; le relecteur
  choisit : exclusion `glose` (le texte reste celui d'origine) ou acceptation écrite dans `relectures/`.
- **« labo central », « laboratoire central »** (5 fiches : `decouvrir-labflow`, `compte-activites-labos`,
  `lexique`, `stock-labo`, `activites`, et l'entrée 16 de la base, titre et contenu, mesuré) : le terme H « cuisine
  centrale » contient déjà l'adjectif ; `[[acc:labo_long:central:centrale]]` donne « cuisine centrale centrale ».
  On écrit l'adjectif DANS l'accord, avec son espace, et une forme féminine vide, collés au terme :
  `[[votre:labo_long]][[acc:labo_long: central:]]` → défaut « votre laboratoire central » (identique), H « votre
  cuisine centrale », C « votre site de production central », miroir « votre usine centrale » ; titre
  `[[Nom:labo]][[acc:labo: central:]]` → H « Cuisine centrale », C « Site de production central » (exemple 12).
  **Limite** : l'astuce repose sur le genre (le féminin efface l'adjectif). Elle est juste pour les 4 lexiques d'essai ;
  un futur terme masculin qui contiendrait déjà « central » redoublerait l'adjectif (le point 7 du contrôle le
  signalerait). « labos de production » donne en C « sites de production de production » : la grammaire ne peut pas
  l'éviter (C et défaut sont masculins) ; signalé par le point 7, accepté par le relecteur (§10.3).

### 7.6 Liens, tableaux, blocs, titres

- **Liens** `[texte](#slug)` : le libellé se balise ; la cible jamais. Un libellé qui commence par une balise
  s'écrit `[[[Pl:activite]] & [[pl:labo]]](#activites)` : la grammaire ne lit pas le 1er crochet comme une balise
  (rendu mesuré correct, exemple 7 ; 137 balises collées à « [ » dans le prototype de la relecture, toutes lues).
  Libellé = nom d'écran → forme de l'écran (R7.1.3).
- **Tableaux** : une cellule se balise comme une phrase ; le lexique refuse « | » (`lexiqueValidation.js:32`), donc
  un terme ne casse pas une colonne ; le contrôle vérifie le nombre de « | » par ligne. Une ligne de lexique
  `| **X** | X …` devient circulaire hors restauration : signalée (§3.5, point 8), corrigée par la variante.
- **Blocs** `:::astuce`, `:::attention`, `:::regle`, `:::exemple`, `:::formule <libellé>` (304 lignes « ::: », 21
  libellés de formule) : le mot-clé jamais ; le libellé d'une formule, oui.
- **Titres** `##`, `###` (61 et 254) : comme une phrase ; l'emoji reste.
- **Mots-clés** : jamais (décision 3, R5.4).
- **Caractères d'un terme et Markdown** (point « à juger » de REPRISE §4.2). Les parenthèses admises par le lexique
  sont sans effet : le libellé d'un lien est lu par `[^\]]+` (`MarkdownView.tsx:116`, `manuelPdf.ts:40`), la cible
  par `(#slug)` qu'aucune balise ne produit. En revanche « # », « - », « > » ou « 1. » au DÉBUT d'un terme ne sont
  pas refusés (`lexiqueValidation.js:32`) et changeraient une ligne qui commence par une balise (titre, liste,
  citation). Risque accepté : aucun terme réel ne commence ainsi (mesuré le 03/10 : 159 chaînes des lexiques et des
  libellés de composants de la base locale, 0 cas), et l'aperçu admin le montrerait.
  Le refuser dans le lexique serait une règle de plus : question 13 au client (§14).

### 7.7 Exemples AVANT → APRÈS, rendus par le vrai moteur

Rendus par `src/utils/vocab.js` (backend), lexiques H et C de la base locale (scripts `rendus.cjs` de la v1 et de la
v2). Pour chaque exemple, le rendu par défaut a été comparé au texte d'origine : **identique**, sauf mention.

| # | Origine (fiche) | Balisé | Hôtellerie | Céramique |
|---|---|---|---|---|
| 1 | « Cet écran envoie les articles et les produits transformés (PT) du labo vers vos activités » (`transferts`) | `Cet écran envoie [[le:article:pl]] et [[le:pt:pl]] ([[court:pt:pl]]) [[du:labo]] vers [[votre:activite:pl]]` | Cet écran envoie les fournitures et les préparations (prépas) de la cuisine centrale vers vos services | Cet écran envoie les matières premières et les produits fabriqués (PF) du site de production vers vos points de vente |
| 1 bis | même phrase | `… et les [[avecCourt:pt:pl]] [[du:labo]] …` | mêmes rendus | mêmes rendus |
| 2 | « **et vers les labos qu'il alimente** » (`transferts`) | `**et vers [[le:labo:pl]] qu'[[acc:labo:il:elle]] alimente**` | …les cuisines centrales qu'elle alimente | …les sites de production qu'il alimente |
| 3 | « C'est la seule voie d'approvisionnement des activités » (base, entrée 8) | `… voie d'[[nom:appro]] [[du:activite:pl]]` (**faux**) | …d'approvisionnement des services | …voie **d'réception** des points de vente |
| 3 ter | même phrase | `… voie [[de:appro]] [[du:activite:pl]]` | …d'approvisionnement des services | …voie de réception des points de vente |
| 3 quater | « C'est la seule voie d'entrée en stock, côté activité, des produits fabriqués au labo. » (`lexique`) | `… en [[nom:stock]], côté [[nom:activite]], des produits fabriqués [[au:labo]].` | …côté service, des produits fabriqués à la cuisine centrale. | …côté point de vente, des produits fabriqués au site de production. |
| 3 bis | « le transfert est le seul moyen » (phrase construite, DEPART-2c §4) | `[[le:transfert]] est le [[acc:transfert:seul:seule]] moyen` (**faux**) | la livraison interne est le **seule** moyen | idem |
| 4 | « Dès votre première activité ou votre labo créé » (`onboarding-configuration`) | `Dès [[acc:activite:votre premier:votre première]] [[nom:activite]] ou [[votre:labo]] [[acc:labo:créé:créée]]` | Dès votre premier service ou votre cuisine centrale créée | Dès votre premier point de vente ou votre site de production créé |
| 5 | titre « Stock Labo » | `[[Nom:stock]] [[Court:labo]]` | Stock Cuisine | Stock Site |
| 6 | partie « Stock & Appro » | `[[Nom:stock]] & [[Court:appro]]` | Stock & Appro | Stock & Réception |
| 7 | « - [Activités & labos](#activites) · [Mon abonnement](#abonnement) » (`gerants`) | `- [[[Pl:activite]] & [[pl:labo]]](#activites) · …` | - [Services & cuisines centrales](#activites) · … | - [Points de vente & sites de production](#activites) · … |
| 8 | « \| Espace Labo \| Stock du labo, production, transferts vers les activités \| » (`decouvrir-labflow`) | `\| [[Nom:espace_labo]] \| [[Nom:stock]] [[du:labo]], production, [[nom:transfert:pl]] vers [[le:activite:pl]] \|` | \| Espace Cuisine \| Stock de la cuisine centrale, production, livraisons internes vers les services \| | \| Espace Site \| Stock du site de production, production, livraisons internes vers les points de vente \| |
| 9 | « Un transfert déplace du stock du LABO (production centrale) vers une ACTIVITÉ (point de vente). » (base, entrée 8) | `[[Un:transfert]] déplace [[du:stock]] [[det:labo:du]][[MAJ:labo]] (production centrale) vers [[det:activite:un]][[MAJ:activite]] ([[nom:activite_desc]]).` | Une livraison interne déplace du stock de la CUISINE CENTRALE (production centrale) vers un **SERVICE (service)**. | …du SITE DE PRODUCTION (production centrale) vers un **POINT DE VENTE (point de vente)**. |
| 10 | « affiche le prix de chaque supplément en DT, par unité et par mois (activité, labo, gérant) » (`onboarding-avenants`) | `… chaque supplément en DT, … ([[nom:activite]], [[nom:labo]], [[nom:gerant]])` (« supplément » exclu, `homonyme`) | …(service, cuisine centrale, responsable de service) | …(point de vente, site de production, responsable de site) |
| 11 | « Un produit VENDABLE est vendu au client final » (base, entrée 10) | `[[Un:produit]] VENDABLE est [[acc:produit:vendu:vendue]] au client final` (sans exclusion, §7.4) | Un produit VENDABLE est vendu au client final | idem ; miroir : « Une invention VENDABLE est vendue » (sans l'accord : « vendu », faux) |
| 12 | titre de la base « Labo central » (entrée 16) | `[[Nom:labo]][[acc:labo: central:]]` (§7.5) | Cuisine centrale | Site de production central |
| 12 bis | même titre, balisé comme en v1 | `[[Nom:labo]] [[acc:labo:central:centrale]]` (**faux**) | **Cuisine centrale centrale** | Site de production central |
| 13 | « Recette « Tarte aux fraises » (pour 1 tarte), valorisée au PMP TTC de l'activité : » (`calc-cout-recette`) | `[[Nom:recette]] « Tarte aux fraises » (pour 1 tarte), [[acc:recette:valorisé:valorisée]] au PMP TTC [[du:activite]] :` | Fiche de préparation « Tarte aux fraises » …, valorisée au PMP TTC du service : | Nomenclature « Tarte aux fraises » …, valorisée au PMP TTC du point de vente : |
| 14 | « \| **Activité** \| Point de vente ou cuisine exploité par votre compte : restaurant, pâtisserie, kiosque… » (`lexique`) | `\| **[[Nom:activite]]** \| [[Nom:activite_desc]] ou cuisine [[acc:activite_desc:exploité:exploitée]] par votre compte : …` (avec `acc:activite` : **non identique**, « exploitée ») | \| **Service** \| Service ou cuisine exploité… : restaurant, pâtisserie, kiosque… (circulaire, point 8) | \| **Point de vente** \| Point de vente ou cuisine exploité… |
| 15 | « le stock labo » | `[[le:stock]] [[compl:labo]]` (déterminant dans la balise ; « le [[nom:stock]] » donne en miroir « le armoire ») | le stock de la cuisine centrale | le stock du site de production ; miroir : « l'armoire de l'usine » |
| 16 | « les ingrédients et les produits transformés déduits » (construit sur `stock-labo`) | `[[le:ingredient:pl]] et [[le:pt:pl]] déduits` (accord avec « et » sans balise, R7.3.4) ; `… [[acc:pt:déduits:déduites:pl]]` est **faux** | les composants et les préparations déduits (avec la balise : « déduites », faux) | les composants et les produits fabriqués déduits |
| 17 | « le seul labo » | `[[acc:labo:le seul:la seule]] [[nom:labo]]` ; `[[det:labo:le]]seul [[nom:labo]]` est **faux** (§7.4) | la seule cuisine centrale (avec `det` : « la seul ») | le seul site de production ; miroir : « la seule usine » (avec `det` : « l'seul usine ») |

Ce que montrent ces rendus :
- 3, 3 bis, 16, 17 : une balise juste par défaut peut être fausse ailleurs (élision, accord) ; d'où les contrôles 7 à
  12 et la relecture croisée ;
- 9 : glose redite ; 12 bis : pléonasme évité par 12. La base n'est lue que par le modèle : ses gloses redites y sont
  tolérées et listées (§10.3). Dans le manuel, lu par le client, elles sont corrigées ou exclues ;
- 13, 14 : la grammaire est juste, mais l'exemple (tarte) ou la définition (circulaire, tri alphabétique perdu)
  restent ceux de la restauration : c'est le rôle des variantes (§8).

---

## 8. Variantes rédigées

### 8.1 Périmètre

8 fiches × 2 domaines = 16 brouillons. Tailles d'origine : `decouvrir-labflow` 3 946, `compte-activites-labos`
4 937, `demarrage` 3 744, `roles` 3 872, `lexique` 10 358, `lexique-pt` 5 845, `onboarding-configuration` 3 411,
`calc-cout-recette` 3 619 : 39 732 caractères par domaine. Les 8 fiches existent et sont actives (mesuré).
Elles portent 94 des 172 mots du métier hors lexique du manuel ; les 78 autres sont dans des fiches sans variante
(liste au §10.3, question 9 au client).

### 8.2 Écriture

- **R8.2.1** — Rédigées par 4 agents (§9) à partir du texte **commun balisé** de la fiche (donc après la vague 1),
  du lexique, des composants et de la description du domaine, lus dans `scripts/manuel/domaines.json` (les agents
  n'ont pas accès à la base).
- **R8.2.2** — Même structure que la fiche commune : mêmes titres de section, mêmes liens `#slug`, mêmes blocs, une
  longueur comparable. On remplace ce qui raconte la restauration : métiers, exemples, définitions du lexique (le
  lexique de A à Z de la variante est écrit et trié dans les mots du domaine, sans définition circulaire).
- **R8.2.3** — Les termes du lexique restent **balisés** dans la variante : une correction du lexique par le client
  (les lexiques H et C sont encore des brouillons, `lot-2/brouillons-lexique-a-corriger.md`) passe dans la variante
  sans la réécrire. Le contrôle refuse une forme du lexique du domaine écrite en clair (§3.5). Les mots du métier hors
  lexique s'écrivent en clair.
- **R8.2.4** — `titre` à `null` (titre commun balisé) sauf besoin réel ; `mots_cles` à `null`.
- **R8.2.5** — Contrôle `controler.mjs --variante` (§3.5) ; aucune affirmation sur le fonctionnement de LabFlow qui ne
  soit déjà dans la fiche commune : une variante change les mots et les exemples, pas les règles. Une variante peut
  reformuler (y compris les phrases à verbe, §0.4).

### 8.3 Relecture et validation

- Relecture croisée par un autre agent (langue, exactitude par rapport à la fiche commune), dans
  `relectures/V-*.json`.
- Livrées au statut `brouillon` (migration 196).
- **Validation par le client** dans l'admin : il ouvre la fiche, choisit l'onglet du domaine, lit l'aperçu, corrige
  s'il le veut, coche « Validée ». À partir de là, la variante est servie aux comptes du domaine (si son lexique
  s'écarte du défaut, I12). Pas à pas remis au client : §15.

### 8.4 Ce que voit un compte tant que la variante n'est pas validée

**Le texte commun balisé**, rendu dans ses mots (recommandation, à confirmer par le client, §14). Les 8 fiches restent
alors en partie fausses hors restauration : « métiers de bouche », exemples de recettes, lexique circulaire et mal
trié (exemple 14). C'est une limite connue, écrite au §10.3.

### 8.5 Quand le texte commun change (maintenance)

- `base_md5` garde l'empreinte du texte commun **servi** relu. Si le texte commun change, **par une migration ou dans
  l'admin**, l'admin montre « à revoir » sur ses variantes (R5.7.3). La variante reste servie telle quelle ; le client
  la relit et l'enregistre (l'enregistrement remet `base_md5` à jour).
- Règle pour les migrations futures : une migration qui modifie une fiche à variantes ne modifie jamais ses variantes
  et le signale par une NOTICE (§12.5).
- Pendant le lot : après le point de restauration de la vague 1, les textes communs des 8 fiches ne changent plus que
  par un besoin clos par l'intégrateur, qui rouvre la relecture de la variante et fait mettre à jour son `baseMd5`
  (le générateur refuse sinon, R3.6.2).

### 8.6 Céramique en production

La 196 écrit les 8 brouillons `ceramique` même si le domaine n'existe pas (lecture (5) de `controle-avant-2c.sql`).
La 187 avait créé le domaine (`187_domaines_profil_composants_tarifs.sql:110-115`) et la 191 lui posait son lexique :
il a donc été supprimé en production, et ni la 187 ni la 191 ne repasseront. Recréé dans l'admin, il n'a **aucun
lexique** et seulement les 4 composants d'identité par défaut (« Activité », « Labo », « Gérant », « Base acheteurs »,
`domainesController.js:221-229`), contre 18 clés de lexique et 6 composants en base locale (mesuré).

Pour que les variantes s'appliquent, le client doit :
1. créer le domaine avec le slug **`ceramique`** : le formulaire propose un slug calculé à partir du nom
   (`AdminDomainesPage.tsx:14`, `:50`) ; le nom « Industrie — Céramique » donne `industrie-ceramique` : taper
   `ceramique` dans le champ slug ;
2. saisir son lexique (18 clés) et ses 6 composants, à partir de la fiche remise avec la livraison (§15 : valeurs de
   la base locale, extraites en lecture seule).

Tant que le lexique n'est pas saisi, le domaine est sans écart : ses variantes ne sont pas servies, même validées
(I12), et l'admin montre « domaine sans lexique ». Tant que le domaine manque, l'admin montre « domaine absent » et ne
peut pas prévisualiser ces variantes.

---

## 9. Lots de balisage et vagues (étape B)

### 9.1 Mesure

Refaite le 02/10 (annexe A) : extraction en SELECT, comptage des formes des 47 clés (sg, pl, formes courtes ; une
forme portée par une clé précédente n'est pas recomptée ; formes les plus longues d'abord ; passage compté masqué).
Résultat identique à DEPART-2c §4 : contenu 3 303, titres 38, parties 6, base 249 ; refait à l'identique par une
relecture. C'est un plafond (il compte les homonymes).

### 9.2 Lots et vagues

Les 8 fiches sources des variantes sont dans L1 (`lexique`, `lexique-pt`), L2 (`decouvrir-labflow`,
`compte-activites-labos`, `demarrage`, `roles`), L3 (`onboarding-configuration`) et L8 (`calc-cout-recette`) : ces
4 lots forment la vague 1, pour que les variantes puissent commencer dès son point de restauration.

| Vague | Lot | Fiches (ou entrées) | Formes | Taille | Formes qui changent H / C |
|---|---|---|---|---|---|
| 1 | **L1** | `lexique`, `lexique-pt`, `gerants` | 398 | 19 018 | 242 / 263 |
| 1 | **L2** | `decouvrir-labflow`, `compte-activites-labos`, `demarrage`, `roles`, `abonnement` | 413 | 20 402 | 271 / 287 |
| 1 | **L3** | Onboarding ×5, `compte`, `assistant-ia`, `support`, `faq`, `faq-chiffres`, `referentiel-unites`, `referentiel-familles`, `referentiel-categories`, `rapports`, `historique-paiements`, `dashboard-gerant` | 421 | 45 600 | 277 / 299 |
| 1 | **L8** | `calc-cout-recette`, `calc-valeur-stock`, `calc-pmp`, `calc-ht-ttc`, `calc-production-pt`, `calc-prix`, `calc-tracabilite` | 406 | 23 110 | 209 / 240 |
| 2 | **L4** | `referentiel-articles`, `referentiel-import`, Espace Produit ×5 (`categories-produits`, `produits-vendables`, `produits-utilisables`, `articles-valorises`, `fiches-techniques`) | 448 | 25 068 | 246 / 307 |
| 2 | **L5** | `stock-activites`, `inventaire`, `pertes`, `historique`, `factures`, `calc-seuils` | 418 | 21 930 | 187 / 208 |
| 2 | **L6** | `stock-labo`, `transferts`, `rapports-labo`, `calc-transferts`, `activites`, `fournisseurs` | 413 | 19 065 | 299 / 324 |
| 2 | **L7** | Espace Vente ×5, Espace Acheteurs ×5, `dashboard` | 424 | 27 055 | 183 / 223 |
| 2 | **L9** | base de connaissances, 32 entrées | 249 | 9 574 | — |
| V | **V-H1**, **V-C1** | variantes `lexique`, `lexique-pt`, `calc-cout-recette` (H, C) | — | 19 822 chacun | — |
| V | **V-H2**, **V-C2** | variantes `decouvrir-labflow`, `compte-activites-labos`, `demarrage`, `roles`, `onboarding-configuration` (H, C) | — | 19 910 chacun | — |

Total des 8 lots de fiches : 3 341 formes (+ 6 dans les parties, tenues par `parties.json`) = 3 347. Vague 1 : 1 638
formes ; vague 2 : 1 952 formes (dont la base). La vague V tourne **en parallèle de la vague 2**, dès le point de
restauration de la vague 1 : ses fichiers (`variantes/`) sont disjoints de ceux de la vague 2. Un seul intégrateur
termine les deux. Si l'orchestrateur préfère, V suit la vague 2. L3 est le plus long à lire (16 fiches, environ
137 000 caractères de rendus à relire contre 57 000 pour L1) mais pas le plus chargé en termes. La répartition qui
fait foi est `scripts/manuel/lots.json`.

### 9.3 Propriété et règles d'un agent de balisage

- Un fichier = un propriétaire : `balise/manuel/<slug>.{md,json}` de ses fiches (ou `balise/base/*`,
  `variantes/<domaine>/<slug>.*`), `relectures/<lot>.auto.json`, `besoins/<lot>.json`. Jamais `origine/`,
  `parties.json`, `lots.json`, `domaines.json`, un outil de `scripts/manuel/`, ni un fichier de code.
- Aucune commande git d'écriture, aucune base, aucun serveur, aucun `npm`. Seuls outils :
  `node scripts/manuel/controler.mjs --lot <lot>` (et `prebaliser.mjs` sur ses fiches), qui écrivent dans
  `rendus/<lot>/`.
- Il livre : ses fichiers balisés, le contrôle vert (points 1 à 6), les signalements 7 à 12 traités (corrigés, ou
  acceptés dans `relectures/<lot>.auto.json`), un compte rendu (formes balisées, exclusions par type, accords posés,
  libellés d'écran cherchés avec leur `fichier:ligne`, doutes).
- Un manque (balise impossible, partie à changer, besoin du moteur, **défaut d'un outil**) va dans
  `scripts/manuel/besoins/<lot>.json`, clos par son champ `etat` (règle du 2b). Seul l'intégrateur corrige un outil.

### 9.4 Une vague en 4 tours, relecture croisée

1. **Baliser** (ou rédiger) : chaque agent, sur ses fichiers.
2. **Relire en croix** : le relecteur lit **en entier** les rendus H, C et miroir des fiches relues, et remplit seul
   `relectures/<lot>.json` (phrase, domaine, problème, correction proposée, état). Il relit aussi les signalements
   acceptés de `<lot>.auto.json` et vérifie 1 libellé d'écran sur 5 (R7.1.3).
3. **Corriger** : le baliseur corrige ses fichiers.
4. **Clore** : le relecteur clôt chaque ligne (ou la laisse ouverte, avec raison, pour l'intégrateur).

Paires : vague 1, L1↔L2 et L3↔L8 ; vague 2, en anneau : L4 relit L5, L5 relit L6, L6 relit L7, L7 relit L9, L9 relit
L4 ; vague V : V-H1↔V-C1, V-H2↔V-C2.

### 9.5 Contrôleur et intégrateur de vague

- **Contrôleur** (un par vague) : lance `controler.mjs --tout` sur les fiches faites, le générateur partiel
  (`--lot`, R3.6.2) et `essai-migration.js` sur ces SQL d'essai ; il écrit son rapport.
- **Intégrateur** (un par vague, qui fait aussi le correcteur) : seul à écrire ensuite. Il relit les relectures
  ouvertes, corrige ce qui reste (et les outils, par les besoins), lance `npm test`, tient `parties.json`, `lots.json`,
  les besoins, et committe un point de restauration (seule commande git d'écriture permise). L'oracle ne tourne pas
  pendant les vagues : les migrations 194 à 196 ne sont dans `migrations/` qu'à la consolidation (§13).

---

## 10. Ce qui change

### 10.1 Changements visibles pour un compte restauration

**Aucun.** Manuel, PDF, recherche affichée et description de l'outil : identiques (I1). Même chose pour un compte café
ou boulangerie.

### 10.2 Changements de forme, non affichés

1. **Ordre des ex aequo de la recherche** (R2.2) : le modèle reçoit, à score égal, la base par `id` puis le manuel
   dans l'ordre de lecture. Mesuré sur la base locale : les 5 recherches de la référence changent, 2 d'ordre, 3 de
   contenu (1 ou 2 des 4 résultats remplacés). Quand aucune ligne ne répond, la liste `disponibles` (25 titres de la
   base, par `id`) change aussi : 5 titres sur 25 (§2.2). La liste exacte est celle des points 3 et 4 du §2.7. En
   production, l'ordre actuel est inconnu ; il est désormais fixe.
2. `GET /admin/manuel` et `GET /admin/knowledge-base` portent un champ de plus : `sansBalises` (admin seulement).
3. Les écrans admin montrent des balises dans le formulaire d'édition ; la liste les montre rendues par défaut (la
   liste de la base est triée à l'écran sur le titre rendu ; l'ordre renvoyé par le serveur, sur le titre brut,
   change après la 195).
4. Le texte stocké change (balises) ; `updated_at` ne change pas (R4.2.4).
5. Journal du serveur : après D1, la ligne `[manuel] manuel non balisé` ; au déploiement D2, les NOTICE des migrations
   194 à 196 ; ensuite, aucune ligne `[manuel]`.

### 10.3 Effets hors restauration, acceptés

- **Mots du métier hors lexique, sans variante** (mesuré dans le manuel, contenu, mot entier, sans casse) :
  « menu(s) » 39 (presque toujours le menu de l'application : homonyme), « carte(s) » 27 (surtout des cartes
  d'écran), « restaurant(s) » 13, « cuisine(s) » 12, « boutique(s) » 11, « farine » 10, « beurre » 8,
  « pâtisserie(s) » 8, « plat(s) » 8, « crème(s) » 16, « pâtissier / pâtissière(s) » 13, « boisson(s) » 8,
  « sauce(s) » 7, « sucre » 6, « dessert(s) » 5, « viande(s) » 5, « tarte(s) » 5, « lait » 4, « pâte(s) » 4,
  « économat(s) » 4, « œuf(s) » 3, « entremets » 3, « traiteur(s) » 3, « pizza(s) » 2, « restauration » 2,
  « métiers de bouche » 1. Seule une variante validée les corrige. « composé(s) valorisé(s) » (28, dont 5 dans
  « produit(s) composé(s) valorisé(s) », qui est une forme du lexique ; ailleurs, notion de LabFlow sans clé, que
  l'écran écrit aussi en dur, `StockLaboPage.tsx:928`) : gardé.
- **Fiches sans variante qui restent marquées par la restauration** (mots du métier, mesuré) : `calc-production-pt`
  12 (`:::exemple` « Crème pâtissière »), `calc-tracabilite` 8, `categories-produits` 6 (« Entrées », « Boissons »,
  « Desserts »), `activites` 6 (restaurant, cuisine, économat), `produits-utilisables` 4, `calc-transferts` 4,
  `referentiel-categories` 3, `produits-vendables` 3, `dashboard` 3, `calc-seuils` 3, `assistant-ia` 3,
  `faq-chiffres` 3. Les 8 variantes couvrent 94 des 172 mots ; 78 restent ailleurs. 10 des 11 blocs `:::exemple`
  restent ceux de la pâtisserie (seul celui de `calc-cout-recette` a une variante). Question 9 au client.
- **Mots qui changent de sens hors restauration (collisions)** : un mot écrit en clair dans le texte commun est le mot
  même d'un autre terme du domaine. Mesuré dans le contenu :

  | Mot en clair | Terme du domaine | Occurrences | Exemple rendu |
  |---|---|---|---|
  | option(s) | C `supplement` = Option | 37 | « l'option Revendeurs » (module) et « options » (suppléments) dans les mêmes fiches |
  | fabriqué(e)(s) | C `pt` = Produit fabriqué | 27 | C « Un site de production fabrique les produits fabriqués » |
  | site(s) | C `labo`, forme courte Site | 19 | C « partagé par tous les sites » = activités ET labos dans l'origine |
  | réception(s) | C `appro` = Réception | 13 | C « ↑ réception (achats et réceptions d'un site de production source) » |
  | préparation(s) | H `pt` = Préparation | 13 | H « Un consommable est une préparation intermédiaire » |
  | livraison(s) | H, C `transfert` | 13 | « bon de livraison », « plateforme de livraison » |
  | produit(s) fini(s) | C `produit_vendable` | 12 | « une entrée en stock du produit fini » (`calc-production-pt`) |
  | consommable(s) | H `produit_utilisable` | 10 | famille « *consommable* (utilisé en cuisine) » |
  | composant(s) | H, C `ingredient` | 10 | |
  | client(s) professionnel(s) | H `acheteur` | 5 | H « Client professionnel (B2B) enregistré dans votre carnet de clients professionnels » |
  | intermédiaire(s) | C `prestataire` | 4 | « préparation intermédiaire » |
  | revendeur(s) | C `acheteur` | 3 | C « Canal de vente tiers (plateforme de livraison, revendeur…) » |

  Signalés fiche par fiche (§3.5, point 12) ; seule une variante peut lever l'ambiguïté. La recherche en souffre aussi
  (en C, « vente » est dans « point de vente » : « Comment saisir une vente ? » met plusieurs fiches ex aequo).
- « sous-produit(s) » : 28 + 2, gardé (décision 2), et « sous-PT » (1). En Céramique, « sous-produit » se lit « déchet
  valorisable ». « sous-préparation(s) » (10) et « sous-composant(s) » (2) restent aussi tels quels (hors lexique).
- **Verbes du métier** (formes verbales, mesuré) : « transférer » 12, « approvisionner » 15 (dont
  « approvisionnable »), « vendre » 42. Gardés : I10 interdit de reformuler le texte commun (§0.4). H lit
  « transférer » à côté de « livraison interne ».
- **Formes courtes en pleine phrase** : H lit « prépa » (mot familier) et C « PF » là où l'origine écrit « PT »
  (R7.1.5).
- Les 8 fiches métier tant que leur variante n'est pas validée (§8.4).
- Gloses redites dans la base, lue seulement par le modèle (« un SERVICE (service) », entrée 8) ; capitales partielles
  gardées (« produit VENDABLE »). Le pléonasme « cuisine centrale centrale » est évité (§7.5), sauf « sites de
  production de production » en C (`stock-labo`), que la grammaire ne peut pas éviter.
- `motsCles` garde ses mots d'origine (il n'est pas affiché ; c'est voulu pour la recherche).
- PDF : un mot de lexique hors Windows-1252 sortirait en « ? » (aucun aujourd'hui).
- Les variantes Céramique ne s'appliquent en production qu'une fois le domaine créé avec le slug `ceramique` ET son
  lexique saisi (§8.6).
- Les rendus héritent des brouillons de lexique (« Livraison interne », « Prestation vendue »…) : ils changeront avec
  les corrections du client, sans retouche du manuel. Les rendus de contrôle sont à refaire après ces corrections.

---

## 11. Preuves

| # | Contrôle | Ce qu'il prouve |
|---|---|---|
| P1 | `controler.mjs --tout` (§3.5), 61 fiches et 32 entrées | I10 sur les fichiers (4 champs, octet pour octet) ; I11 ; aucun résiduel hors exclusions ; liens, blocs, tableaux intacts ; parties et titres distincts dans chaque domaine ; signalements 7 à 12 tous traités ; `baseMd5` à jour |
| P2 | `controler.mjs --variante` sur les 16 variantes | variantes valides, sans résiduel, sans forme du domaine en clair, liens intacts, lisibles dans le PDF |
| P3 | relectures croisées closes (`relectures/*.json`), rendus H, C, miroir lus en entier | accords, élisions, sens, collisions (ce que l'outil ne voit pas) |
| P4 | `essai-migration.js` (§3.7), sur une copie après l'étape C | les migrations appliquées à une vraie base rendent l'origine par défaut ; 59 / 32 / 16 ; idempotence (« déjà balisée ») ; retour exact ; base intacte après `ROLLBACK` (empreinte, table, `_migrations`) |
| P5 | `generer-migrations.mjs` : aucune fiche écartée sans mention, aucun `\r`, LF, `baseMd5` vérifiés, liste des champs admis écrite | migrations complètes et sûres |
| P6 | `node scripts/check-invariant-vocab.js` (restauration), sur une copie migrée | I1 côté serveur, sur le vrai contrôleur : manuel de 6 lecteurs (sections et empreintes NON masquées, `updatedAt` compris), recherches, recherches dans les mots du compte, outils, prompt : identiques à la référence (R2.2 compris) ; aucune entrée sans emploi |
| P7 | `--domaine hotellerie`, `ceramique`, `miroir`, l'un après l'autre, sur une copie migrée | I2 : aucune forme par défaut hors exclusions dans le manuel servi, les résultats de la base et la description ; aucun « [[ » ni « ‹clé› » ; résultats du manuel = début des fiches servies ; manuel de l'admin égal à la référence (I4) ; mots-clés enrichis ; 0 exception `2c` ; chaque recherche a un résultat ; rapport de cohérence relu |
| P8 | `controle-manuel-pdf.mjs` (front) | PDF restauration (`develop` + origine) identique à l'octet au PDF courant + réponse brute du serveur ; PDF H et C sans forme par défaut, sans balise, sans chaîne sur deux octets |
| P9 | `npm test` (dont `test/2c-manuel.test.js`, `test/B1-assistant.test.js`) | rendu, variantes (café compris), enrichissement, ordre de la recherche, validation 400 / 409 / 404, `vocabBrut`, avertissement au démarrage champ par champ, description et glossaire |
| P10 | `vocab-check` : `identite`, `residuels`, `accords` à 0 dans les deux dépôts, `lexique` conforme ; `vocab-lots.mjs` sans erreur | code du serveur sans écart non admis ; moteur et empreinte inchangés |
| P11 | E2E sur une copie migrée : `test-vocabulaire-domaine.js` étendu, `test-manuel-filtre.js` (15 contrôles), `check-invariant-config.js`, `check-invariant-stock.js`, `test-composants.js`, `test-transferts-chaine.js`, `test-onboarding-etapes.js`, `test-contrat-admin.js`, `test-bot-onboarding.js` (14/17, liste des contrôles verts comparée) | non-régression ; variante validée servie ; restauration et admin inchangés avant et après la validation |
| P12 | parcours navigateur (scripts de `labflow-reprise/lot-2/parcours-2a/`), backend de test sur une copie migrée | compte restauration : guide et PDF inchangés ; compte H : guide, PDF, recherche locale avec un mot du domaine, assistant ; admin : aperçu par domaine, légende, balise refusée, variante validée puis supprimée |
| P13 | `npm run build` (front), `git diff develop -- src/utils/manuelPdf.ts src/utils/pdfTexte.ts src/components/client/GuidePage.tsx src/components/common/MarkdownView.tsx` vide, entrées `jspdf` et `jspdf-autotable` de `package-lock.json` inchangées | écrans clients et PDF inchangés |
| P14 | lecture de production avant (§12.1) et journaux après D1 et D2 (§12.2, §12.3) | le texte balisé part du texte réel de production ; aucune balise brute servie pendant la bascule ; 0 fiche sans balises |
| P15 | `base-locale.js etat` à la fin de la vérification | la base `fiche_technique` n'a pas reçu 194 à 196 ; la photo est intacte |

---

## 12. Déploiement et maintenance

### 12.1 Lecture de production, avant

Le client colle `scripts/controle-avant-2c.sql` dans le terminal psql du service Postgres (Coolify) et renvoie toute
la sortie. Lecture seule (`BEGIN TRANSACTION READ ONLY` … `ROLLBACK`). L'étape O y ajoute deux lectures :
- **(6)** le nombre de fiches et d'entrées qui contiennent un `\r` (`position(E'\r' in contenu || COALESCE(contenu_defaut,
  '') || titre || partie) > 0`, et l'équivalent pour la base). Attendu : 0. Les empreintes (1), (3), (4) sont
  calculées sans `\r` : une production à `\r` aurait les mêmes empreintes que le local, la garde passerait, et le
  contenu servi perdrait ses `\r` sans que rien ne le montre ;
- **(7)** pour le domaine Hôtellerie : `slug`, `md5(lexique::text)` et le lexique en clair ; la liste des composants
  (libellé, pluriel, type, genre). La lecture (5) ne donne aujourd'hui que le NOMBRE de clés.

Si le client a déjà collé la version du commit `fbca8ce`, une lecture complémentaire courte ((6) et (7) seules)
suffit.

Lecture des résultats :
- (1) Empreintes globales égales aux valeurs locales (`67737956…`, `8779fd65…`) et (6) à 0 : on génère à partir des
  fichiers.
- Sinon : (3) et (4) donnent les fiches et entrées qui diffèrent ; le client renvoie leur texte (requête à fournir
  alors, `SELECT slug, titre, partie, contenu, contenu_defaut FROM manuel_sections WHERE slug IN (…)`, en lecture
  seule) ; elles sont réextraites dans `origine/` et rebalisées par la mini-vague R (§13), avant la consolidation.
- (2) doit être vide (fiches modifiées dans l'admin). Sinon : R4.2.2.
- (4) montre aussi des `mots_cles` effacés dans la base : défaut ancien, cocher « actif » dans l'admin de la base
  efface `mots_cles` et `categorie` (`aiKnowledgeController.js:54-55` écrit `$3` et `$4` sans `COALESCE`, et
  `AdminKnowledgeBasePage.tsx:60` n'envoie que `actif`). Question au client (§14).
- (5) liste les domaines : `hotellerie` présent ? `ceramique` absent ?
- (7) : si le lexique H de production diffère de la base locale, `domaines.json` et `test/vocab-lexiques-test.json`
  ne sont pas changés (ce sont les lexiques d'essai), mais `controler.mjs --tout` est relancé avec le lexique de
  production (option `--lexique <fichier>`, une liste d'écarts résolue par R3.1.1) avant la consolidation, et ses
  signalements sont relus. Si le slug n'est pas `hotellerie` : option `--slug` du générateur (R3.6.4).

### 12.2 Ordre : trois poussées

**Pourquoi.** Coolify garde l'ancien conteneur en service tant que le nouveau n'est pas déclaré sain
(`Dockerfile:7-8`, `HEALTHCHECK … --start-period=45s` ; chevauchement déjà constaté : `docs/lot-1b-spec.md:103`,
`docs/lot-2b-spec.md:949`). Les migrations tournent au démarrage du NOUVEAU conteneur, avant `listen`, et chaque
fichier est validé dès qu'il passe (`src/app.js:180`, `migrate.js:100-104`). Si code et données partaient ensemble,
l'ancien serveur, qui ne rend pas les balises, servirait « [[Nom:stock]] [[Court:labo]] » à tous les comptes
restauration dès la validation de la 194, dans le guide, le PDF et l'assistant (Messenger compris, où un message
envoyé ne se reprend pas) ; et si la 195 ou la 196 échouait ensuite, le nouveau conteneur s'arrêterait
(`app.js:219-221`) et l'ancien resterait seul sur une base balisée. Au 2a et au 2b, aucune balise n'était en base :
le 2c est le premier lot où les DONNÉES dépendent du nouveau code.

**Préparation des commits.** À la fin de la vérification, l'intégrateur ajoute sur la branche un commit X qui retire
les trois fichiers `migrations/194_*`, `195_*`, `196_*` (rien d'autre), puis un commit Y = `git revert X` (qui les
remet). D1 fusionne X ; D2 fusionne Y. Aucune réécriture d'historique.

0. **Avant tout** : télécharger le PDF du manuel du compte 328 (démo) et noter trois titres de fiches ; ne pas relancer
   le seed du compte 328 entre ce PDF et le contrôle du §12.3. Lecture de production faite (§12.1).
1. **D1 — serveur, code** : `npm test` vert ; fusion `--no-ff` du commit X dans `develop` et `main` du **backend** ;
   poussée de `main`. Part : tout le code du §5, la 193, R2.2, `.gitattributes`, `manuelSansBaliseAdmis.json`.
   La base reste en texte brut : le rendu par défaut est l'identité (prouvé par l'oracle à l'étape S).
   Attendre `/health` et, dans les journaux Coolify : « Migration appliquee: 193_manuel_sections_domaine.sql », puis
   « Serveur démarré » et la ligne unique « [manuel] manuel non balisé (aucune balise en base) ». Contrôles du §12.3,
   partie restauration.
2. **Écrans** : `npm run build` vert ; fusion de l'écran dans `develop` et `main` du **frontend** ; poussée. Attendre
   le nouveau bundle en ligne. Admin : aperçu, légende, onglets de variantes sur un texte encore brut.
3. **D2 — serveur, données** : fusion du commit Y dans `develop` et `main` du backend ; poussée. Le conteneur qui reste
   en service pendant le chevauchement est déjà le code D1, qui rend les balises : aucune balise brute n'est servie,
   même si la 195 ou la 196 échoue. Lignes attendues dans les journaux :
   « Migration appliquee: 194_manuel_balise.sql » avec « [migration] 194 : 59 fiche(s) balisée(s), 0 déjà balisée(s),
   0 gardée(s) … » ; « … 195_base_connaissances_balisee.sql » avec « [migration] 195 : 32 entrée(s) balisée(s) … »
   (ou le nombre d'entrées porteuses) ; « … 196_manuel_variantes_brouillons.sql » avec « [migration] 196 : 16
   brouillon(s) inséré(s) … » (`ceramique` peut être « domaine absent ») ; puis « Serveur démarré », **sans** ligne
   `[manuel]`. Contrôles du §12.3 complets.

Jamais deux builds en même temps. Après D2 : `base-locale.js supprimer`, garde R2.8.3 retirée dans `develop`, mise à
jour de `REPRISE.md`.

### 12.3 Contrôles après bascule

- Après D1 : `/health` ; compte restauration (ou démo 328) : trois fiches et le PDF du manuel, comparés au PDF
  téléchargé au point 0 (seule la date d'édition change) ; un gérant ; l'assistant d'un compte restauration.
- Après D2 : les mêmes contrôles restauration ; compte de test H : `/client/guide` dans ses mots (« cuisine centrale »,
  « services », « fournitures », « préparations »), le PDF, l'assistant (« comment créer une cuisine centrale ? » cite
  « Manuel — … » dans ses mots) ; admin : aperçu par domaine ; une balise fausse refusée ; badge « sans balises »
  absent partout.
- Une heure après D2 : aucune ligne « [vocab] », « [email] voc manquant » ni « [manuel] » dans les journaux.

### 12.4 Retour arrière

- **Annuler D2 seul** (les textes) : lancer `node scripts/manuel/retour-2c.js --essai` puis sans `--essai` dans le
  conteneur du serveur en place (§4.5) ; lire son compte rendu ; puis `git revert -m 1` de la fusion D2 sur `main`,
  poussé normalement. Le code D1 reste et sert le texte brut.
- **Annuler tout** : d'abord le retour des textes ci-dessus (le code D1 en place sert alors un texte sans balise :
  rendu identique) ; ensuite l'écran, par `git revert -m 1` sur `main` (cible : contenu de `fd044b2`) ; ensuite le
  serveur, par `git revert -m 1` des fusions D2 puis D1 (cible : contenu de `e3bf29a`). Jamais de `push --force`.
  Sans le retour des textes, l'ancien serveur servirait « [[…]] » à tous les comptes.
- La table de la 193 et ses brouillons restent, inoffensifs.

### 12.5 Maintenance après le 2c

- **Toute migration du manuel écrit du texte balisé.** On modifie `scripts/manuel/balise/…` (la source après le 2c),
  on lance `controler.mjs` (sans le point 1 : un changement de texte n'a pas d'origine), puis le générateur, qui
  écrit un `UPDATE` gardé par le md5 du texte balisé précédent. Les `REPLACE(contenu, '<texte exact>', …)` des
  anciennes migrations (209 `REPLACE(` dans 10 des 19 migrations du manuel, dont 93 sur `contenu` et 92 sur
  `contenu_defaut`) **ne sont plus un modèle** : leurs textes n'existent plus sous cette forme.
- Une migration qui touche une fiche à variantes le signale par NOTICE et ne touche pas les variantes (§8.5).
- `scripts/VOCAB-GUIDE-SERVEUR.md` reçoit une section « Manuel et base de connaissances » : colonnes balisées et
  points de rendu (I7 révisée), validation admin et `vocabBrut`, outils de `scripts/manuel/`, règle des migrations
  ci-dessus. Son tableau des types (`:390`) perd la ligne « description de `search_knowledge_base` (`2c`) ».
- Une nouvelle fiche créée dans l'admin sans balise est signalée au démarrage (§5.8) jusqu'à ce qu'on la balise.

---

## 13. Ordre de travail et charge

| Étape | Contenu | Sortie | Charge |
|---|---|---|---|
| **O** | §2.7 : photo de la base ; archives du 2b (écarts admis et 109 écarts attendus) ; oracle étendu ; contrôle PDF ; lectures (6) et (7) ; mesure puis commit R2.2 ; référence (2 passages) ; listes de travail ; lecture de production | référence commitée | 1 j |
| **S0** | §5.1 et §5.2 : `manuelRendu.js` (fonctions pures, requête exportée), migration 193, leurs tests | `npm test` vert | 0,25 j |
| **M0 ∥ S ∥ A** | en parallèle, fichiers disjoints. M0 (§3) : instantané, `domaines.json`, `parties.json`, pré-baliseur, contrôle, générateur (partiel compris), essai, `retour-2c.js`, `.gitattributes`, guide de balisage, `lots.json`. S (§5) : listPublic, recherche, description, glossaire, validation, badge, variantes, démarrage, slug, tests. A (§6) : deux écrans admin. Puis un intégrateur par dépôt et deux relecteurs (identité restauration ; écrans et admin) | outils testés sur 3 fiches témoins (une acheteurs à défaut NULL, `lexique`, une sans terme) ; `npm test` vert ; oracle restauration identique ; `--domaine … --hors-manuel` à 0 (R2.4.7) ; `npm run build` vert | 3,25 j (M0 1,75 ; S 1 ; A 0,5), en parallèle |
| **B1** | vague 1 : L1, L2, L3, L8, en 4 tours, contrôleur, intégrateur | point de restauration ; textes communs des 8 fiches figés | 1,25 j |
| **B2 ∥ V** | vague 2 : L4, L5, L6, L7, L9 ; vague V : 4 lots de variantes ; 4 tours chacune ; un intégrateur pour les deux | point de restauration | 2,75 j (vague 2 : 1,25 ; V : 1,5), en parallèle |
| **R** (si besoin) | mini-vague : fiches de production qui diffèrent (§12.1) ; 1 baliseur, 1 relecteur | point de restauration | 0,25 j |
| **C** | consolidation : `--tout` ; génération en essai ; **essai de migration AVANT le premier oracle** ; écriture dans `migrations/` ; dès lors copies de la base (R2.8.2) ; oracle restauration puis H, C, miroir ; besoins clos ; documents (`VOCAB-GUIDE-SERVEUR.md`, `ecarts-visibles-2b.md`, nouveau `ecarts-visibles-2c.md`, fiche Céramique, §15) ; spec mise à jour (« état final ») | commit | 0,75 j |
| **Vérif** | l'oracle seul d'abord (sur une copie) ; puis parcours navigateur et 3 revues en parallèle, sur la même copie (ports réservés du 2b) ; corrections (copie neuve, régénération, oracle) ; contrôle final indépendant | rapport | 1 j |
| **D** | lecture de production, commits X et Y, D1, écrans, D2 (§12) | en production | — |

Total : **environ 10 jours-équivalent de travail** (9,5 à 11 ; R compris s'il le faut). La v1 estimait 9 ; s'ajoutent
la protection de la base, le retour arrière en script, les contrôles renforcés et les 4 tours des vagues. Les étapes
en parallèle (M0, S et A ; vague 2 et V) raccourcissent la durée, pas la charge. C'est une estimation, pas une mesure.

Règles reprises du 2b : un seul passage de l'oracle à la fois ; l'intégrateur seul lance l'oracle, `base-locale.js` et
committe ; aucun agent n'a de commande git d'écriture ; jamais `npm start` (le `.env` du poste a de vraies clés) ;
backend de test par `node scripts/start-test-backend.js` (avec `DB_NAME` après l'étape C) ;
`git checkout -- scripts/vocab-accords.txt` avant de changer de branche.

---

## 14. Questions au client

| # | Question | Recommandation |
|---|---|---|
| 1 | Accepter que l'ordre des résultats ex aequo de la recherche de l'assistant, et la liste des titres proposés quand rien ne répond, soient fixés (§2.2, §10.2, point 1) ? Non visible à l'écran ; le modèle peut citer une autre fiche de même score | **Oui** : sans cela, l'ordre changerait de toute façon au déploiement, au hasard |
| 2 | Une variante encore « brouillon » : le compte lit le texte commun balisé (§8.4) ? | **Oui**, texte commun ; on ne montre jamais un brouillon |
| 3 | Qui valide les 16 variantes, et quand ? | Le client, dans l'admin, après le déploiement, **après** avoir corrigé les lexiques H et C (sinon il validera des mots encore provisoires) |
| 4 | Céramique : la recréer en production avec le slug **`ceramique`**, puis saisir son lexique (18 clés) et ses 6 composants à partir de la fiche remise (§8.6, §15) ? | Oui, au moment voulu ; sans le slug exact les variantes ne s'appliquent pas, et sans le lexique elles ne sont pas servies (I12) |
| 5 | Base de connaissances : accepter les gloses redites vues seulement par le modèle (« un SERVICE (service) ») ? | **Oui** : pas de variantes pour la base (le client veut moins). Le pléonasme « cuisine centrale centrale » est, lui, évité (§7.5) |
| 6 | Corriger dans ce lot le défaut de l'admin de la base : cocher « actif » efface les mots-clés et la catégorie (§12.1, R5.7.1) ? | **Oui**, correction côté serveur, invisible pour les clients ; sinon les mots-clés enrichis perdent leur source |
| 7 | La phrase d'aide de l'écran Articles (« … matières premières et ingrédients », `ReferentielArticlesPage.tsx:413`), renvoyée au 2c par le 2a | **La laisser hors du 2c** (c'est un écran, pas le manuel) ; à reprendre avec le lot 3 ou plus tard |
| 8 | « compte dépôt » balisé par la clé `depot` (§7.1, R7.1.6) | Oui (aucun effet visible aujourd'hui : aucun domaine ne change ce mot) |
| 9 | Les variantes ne couvrent que 8 fiches (décision 1). 78 mots du métier restent dans d'autres fiches (§10.3), surtout `categories-produits`, `calc-production-pt`, `calc-tracabilite`, `activites`. Étendre les variantes à ces 4 fiches (8 brouillons de plus, environ 0,5 j) ? | **Non dans ce lot** (le client veut moins) ; la liste est écrite pour le jour où un client Céramique signe |
| 10 | Mots-clés enrichis (décision 3) : la relecture mesure un effet nul sur les questions du guide (§5.4). On le garde comme décidé, avec deux précisions : sigles cherchés sans tenir compte de la casse (les mots-clés sont en minuscules), et libellés de composants ajoutés seulement aux fiches qui nomment le terme comme mot-clé entier, sans les libellés de moins de 4 lettres (« bar », « spa ») ? | **Oui** : coût faible, rien ne change en restauration, utile pour une question posée avec un ancien mot ou un libellé long ; les précisions évitent du bruit |
| 11 | Déployer en **trois poussées** au lieu de deux : serveur sans les données balisées (D1), écrans, puis données (D2) (§12.2) ? Le client autorise chaque poussée | **Oui** : sinon, pendant le démarrage du nouveau serveur, l'ancien servirait des balises brutes aux comptes restauration |
| 12 | Le retour arrière se fait par une commande à lancer dans le terminal du conteneur du serveur (Coolify), et non plus par un long texte SQL à coller (§4.5, §12.4) : d'accord ? | **Oui** : rien à coller, essai à blanc possible (`--essai`) |
| 13 | Refuser dans le lexique un terme qui commence par « # », « - », « > » ou « 1. » (il changerait une ligne du manuel qui commence par une balise, §7.6) ? | **Non** : aucun lexique réel ne le fait, l'aperçu admin le montrerait (le client veut moins) |

**Réponses du client (03/10/2026)** : les 13 recommandations sont acceptées telles quelles (Q1 ordre fixé ; Q6
défaut de l'admin de la base corrigé dans ce lot ; Q11 trois poussées ; Q12 retour arrière par commande dans le
conteneur ; Q2 à Q5, Q7 à Q10 et Q13 selon la colonne « Recommandation »).

Rappels déjà posés ailleurs, sans effet sur le code du 2c : lexiques H et C à corriger
(`lot-2/brouillons-lexique-a-corriger.md`, `lot-2b/ecarts-visibles-2b.md` §4) ; décision 6 du 2b (faire le lot 3
avant de signer un client hors restauration).

---

## 15. À transmettre au client avec la livraison

- **Ce qui change** : rien pour un compte restauration, café ou boulangerie (manuel, PDF, assistant). Hors
  restauration : le manuel, son PDF et l'assistant parlent les mots du domaine, avec les limites du §10.3 (mots du
  métier, collisions, « sous-produit », verbes).
- **Pas à pas de validation des 16 variantes** : Admin → Manuel → ouvrir la fiche → onglet du domaine → lire
  l'aperçu (sélecteur de domaine) → corriger si besoin → cocher « Validée » → enregistrer. Le faire après avoir
  corrigé les lexiques H et C. « À revoir » = le texte commun a changé depuis la dernière relecture.
- **Fiche Céramique** (question 4) : slug `ceramique`, les 18 clés du lexique et les 6 composants (libellé, pluriel,
  type, genre) de la base locale, extraits en lecture seule à l'étape C.
- **Lecture de production** (§12.1) : le script à coller, et ce qu'il faut renvoyer.
- **Déploiement** (§12.2) : trois poussées à autoriser, les lignes de journal attendues après chacune.
- **Contrôles après bascule** (§12.3) et **retour arrière** (§12.4) : la commande à lancer dans le conteneur.
- **Admin du manuel** : les balises dans le formulaire (légende, aperçu), le badge « sans balises » (une fiche à
  rebaliser), le refus d'une balise fausse ; toute migration future du manuel écrit du texte balisé.
- Les questions du §14.

---

## 16. Amendements de l'étape M0 ∥ S ∥ A (v2.3, 03/10/2026)

Ces règles priment sur le texte des sections citées. Elles viennent de l'intégration, des 2 relectures et du
contrôle final de l'étape (11 constats, 0 bloquant ; tous corrigés ou acceptés ci-dessous).

**A16.1 — Cibles de liens (§3.5, point 3 ; R2.4.2).** Les cibles `(#slug)` portent 200 formes par défaut (185
cibles). Elles ne se balisent jamais (§7.6) : `controler.mjs`, le pré-baliseur et l'oracle les masquent avant de
chercher les formes.

**A16.2 — Balise collée à un trait d'union (§3.5, point 3 ; R3.4.3).** Toute balise collée à un trait d'union
(« lettre- » avant ou « -lettre » après) est un ÉCHEC du point 3, sans exclusion possible, sauf `acc`, `accN` et
`ex` (« peut-[[acc:labo:il:elle]] »). Raison : « sous-[[nom:pt]] » rend « sous-préparation » en H, contre la
décision 2 du client (« sous-produit » reste tel quel). La forme reste en clair : locution, exclusion justifiée, ou
phrase réécrite dans une variante.

**A16.3 — Accords à distance (§3.5, points 7 et 10).** Le point 7 signale aussi le rendu d'une balise suivi d'un mot
de même racine que son dernier mot, absent du rendu par défaut (« cuisine centrale central »). Le point 10 signale
aussi un déterminant à genre séparé de la balise de nom par un adjectif (autre, même, seul, propre, premier, dernier,
nouveau… : « un autre [[nom:labo]] », « son propre [[nom:stock]] »). Fiches concernées, listées dans
`GUIDE-BALISAGE.md` : `stock-labo`, `activites`, `calc-transferts`, `compte-activites-labos`,
`decouvrir-labflow` et l'entrée « labo central » de la base.

**A16.4 — `controler.mjs --lexique` (§3.1, R3.1.1, §12.1).** Refus (code 2) d'un fichier dont une clé n'est pas dans
`LEXIQUE_CLES` ou dont les écarts donnent le lexique par défaut. Le md5 de `lexique::text` est affiché et comparé à
`hotellerie.md5Lexique` de la lecture de production (option `--lecture`, défaut
`scripts/manuel/lecture-production.json`) : refus s'il diffère. Sans lecture de production, la comparaison n'a pas
lieu : à l'étape C, le fichier de lecture doit exister avant `controler --tout --lexique`.

**A16.5 — Variantes : refus à la création seulement (R5.7.3).** `DOMAINE_INCONNU` et `VARIANTE_DOMAINE_SANS_ECART` ne
sont opposés qu'à la CRÉATION d'une variante. Une variante existante reste modifiable (les brouillons d'une
Céramique recréée sans lexique, par exemple) ; elle n'est jamais servie tant que son domaine n'a pas d'écart (I12).
R5.9 tient en une requête placée après l'`UPDATE domaines_activite` (même 409 `VARIANTES_EXISTANTES`).

**A16.6 — Effet mesuré des mots-clés enrichis (§5.4, §14 Q10, §15).** L'effet n'est pas nul : c'est un échange de
fiches trouvées. Questions du guide, fiche attendue dans les 4 résultats : H 5/12 avant et après (2 perdues, dont
« créer un labo » → `activites` ; 2 gagnées : room service, housekeeping), C 3/9 → 3/9 (showroom / boutique
gagné), miroir 1/7 → 3/7. Aucun effet en restauration. **Décision du client (03/10) : on garde l'enrichissement.**
L'effet est remesuré à l'étape C (rapport R2.4.6), manuel balisé. À dire au client avec la livraison (§15).

**A16.7 — Liste de travail relancée après S (R2.4.7).** L'enrichissement change le classement des résultats de la
base hors restauration : la famille `assistant` montait (H 186 → 187, C 272 → 279, miroir 458 → 505), sans
qu'aucun texte gagne de forme (chaque texte est celui d'une entrée d'origine ou figurait déjà dans la liste ; seule
`recherchesDomaine` change, `manuel`, `baseParTitre` et `recherches` égales). La liste
`hors-restauration-avant.json` a été relancée sur le code de S (commit `e28187e`) ; **elle est validée** et fait foi
pour la porte `--hors-manuel` jusqu'à l'étape C. La référence restauration n'a pas bougé.

**A16.8 — Tests qui gardent I1 avant l'étape C (§11).** Tant que le manuel n'est pas balisé, l'oracle et l'E2E ne
voient pas trois fautes du serveur : titre non rendu par `listPublic`, troncature avant le rendu, variante servie à
un compte restauration. Seul `npm test` (`test/2c-manuel.test.js`) les attrape, et pour la dernière il restera le
seul : ces tests ne doivent jamais être affaiblis par les vagues ni par l'étape C.

**A16.9 — E2E sur un port au choix (§5.11, P11).** `test-vocabulaire-domaine.js` et `test-manuel-filtre.js` lisent
`E2E_BASE`, sinon `http://localhost:${PORT||3000}` ; leurs contrôles ne changent pas. Avant l'étape C,
`test-vocabulaire-domaine.js` a 1 échec attendu (titres et parties du manuel H) : 235/236.

**A16.10 — Oracle robuste à une mise en veille (§2.8).** Un passage interrompu par la veille du poste (jeton de 3 h
expiré) laissait ses comptes en base, et une demande de support traitée par l'admin temporaire (clé
`support_demandes_traite_par_fkey` sans ON DELETE) bloquait la purge suivante. Depuis `6ed9873`, le jeton est
re-signé au nettoyage et les demandes sont détachées de l'admin temporaire avant sa suppression. Consigne : empêcher
la mise en veille du poste pendant un passage.

**A16.11 — Tests des outils.** `npm test` ne lance pas `scripts/manuel/test/` (58 tests) : chaque porte les lance à
part (`node --test scripts/manuel/test/*.test.*`).

**A16.12 — Correctif hors lot fusionné, et compteurs de jours masqués (03/10/2026).** Le correctif « mois des
mensualités en UTC » (backend `4897e09`, `develop` `a7c8424`, `main` `ee9a28e`, déployé) a été fusionné dans la
branche (`27f5340`) ; `scripts/vocab-check.base` est réépinglé sur `a7c8424`. Il ne change aucune sortie de
l'oracle. Le contrôle a révélé que les compteurs `jours` et `jours_inventaire` des tableaux de bord dépendent de
l'heure et du jour du passage (`dashboardV2Controller.js:334`) : la capture les masque en `⟨jours⟩`, et la référence
restauration a été masquée par la même règle (33 valeurs), sans recapture. Restauration IDENTIQUE, `--domaine
hotellerie --hors-manuel` à 0, `npm test` 340/340.

---

## Annexe A — Mesures

### A.1 Mesures de la v1 (02/10/2026)

Scripts jetables (lecture seule), dans
`C:\Users\CHAHDONj\AppData\Local\Temp\claude\C--Users-CHAHDONj\02d5ce49-882e-4180-b39a-cc481ebda132\scratchpad\wf-spec\redacteur\`
(dossier temporaire : les outils durables seront ceux de `scripts/manuel/`) :

| Script | Mesure |
|---|---|
| `extraire.cjs` | extraction en `BEGIN TRANSACTION READ ONLY` … `ROLLBACK` : fiches, base, domaines, composants, schémas, contraintes, index, ordre physique (`ctid`), empreintes globales |
| `apercu.cjs` | colonnes, contraintes (`manuel_sections_slug_key`, `idx_ai_kb_titre` sur `lower(titre)`, `domaines_activite_slug_key`), 5 défauts NULL, 0 fiche modifiée, motifs absents, tailles, ordre physique ≠ ordre des `id` |
| `compter.mjs` | 3 303 / 38 / 6 / 249 formes ; par clé ; formes qui changent H 1 914, C 2 151 ; mots hors lexique ; « sous-produit(s) » 28 + 2 ; blocs ; apostrophes 1 262 |
| `lots.mjs` | répartition du §9.2 et formes qui changent par lot |
| `ex-aequo.cjs`, `ex-aequo2.cjs` | simulation de `toolSearchKnowledge` : la référence reproduite avec l'ordre physique ; 38 cas sur 38 avec ex aequo ; effet de R2.2 sur les 5 recherches |
| `rendus.cjs` | 19 rendus du §7.7 ; `balisesInvalides('[[nom:labbo]]')` = `[]` |
| `description.cjs` | description de l'outil (R5.5) : identique par défaut, rendus H, C, miroir |
| `perf.cjs` | rendu du manuel : 1,1 ms pour 1 408 balises |
| `enrichir.cjs` | prototype de `enrichirMotsCles` (R5.4) : ajouts en H, rien par défaut |

Mesures de code : `node scripts/vocab-check.mjs identite --root ../fiche-technique-backend` (0 écart, 120 entrées
« sans objet ») et `identite` au front (0 écart, 65 « sans objet ») ; `residuels` à 0 dans les deux dépôts ;
`git ls-files --eol migrations` ; essai de `.gitattributes` dans un clone jetable (supprimé ensuite).

### A.2 Mesures de la v2 (02/10/2026, rédacteur de la v2)

Scripts jetables (lecture seule), dans `…\scratchpad\wf-spec\redacteur-v2\` :

| Script | Mesure |
|---|---|
| `extraire.cjs` | extraction en `BEGIN TRANSACTION READ ONLY` … `ROLLBACK` : 61 fiches, 32 entrées, 5 domaines, 27 composants ; dernière migration 192 ; table `manuel_sections_domaine` absente ; comptes locaux par rôle (1 client, 1 gérant, 4 acheteurs, 1 boss, 4 super_admin) |
| `rendus.cjs`, `rendus2.cjs` | lexiques H et C de la base = ceux de `vocab-lexiques-test.json` ; `estDefaut` vrai pour café et boulangerie ; rendus des exemples 11, 12, 15, 16, 17 du §7.7, de « labo central », de `det` suivi d'un adjectif, de l'accord avec « et » |
| `mesures.cjs` | masques de l'oracle sur le manuel (9 passages, 6 fiches ; aucun « dans N jours ») ; « ← » 3, « ↔ » 1 ; collisions et mots du métier (tableaux du §10.3) ; mots du métier : 94 dans les 8 fiches à variantes, 78 ailleurs ; 11 fiches à bloc `:::exemple` ; « pt » en minuscules dans 5 listes de mots-clés, aucun « PT » ; ordre physique de la base ; `disponibles` : 5 titres sortent, 5 entrent ; `restauration.json` = 672 267 octets ; 0 `\r` |
| `verbes.cjs`, `verbes2.cjs` | formes verbales : transférer 12, approvisionner 15, vendre 42 |
| (requêtes directes) | lexique Céramique 18 clés, 6 composants ; Hôtellerie 13 clés, 9 composants ; « spa » dans 31 fiches actives, « bar » dans 24 ; « labo / laboratoire central » dans 5 fiches et l'entrée 16 ; 16 fiches portent « activité(s) » ou « labo(s) » comme mot-clé entier, 22 quelque part ; « préparation » et « composant » ne sont pas des formes du lexique par défaut |

Lectures de code de la v2 (numéros de ligne revérifiés) : `src/app.js:180`, `:221` ; `src/config/migrate.js:67`, `:96`,
`:100-104` ; `Dockerfile:5-8` ; `.dockerignore` ; `src/config/database.js:9` ; `scripts/capture-vocab-baseline.js:15-20`,
`:47`, `:240-301`, `:421`, `:472`, `:710`, `:730-741` (guide `:733-741`), `:976`, `:1088-1089`, `:1134-1146` ; `scripts/check-invariant-vocab.js:225-266`,
`:273-285`, `:304-326`, `:417-418`, `:500-513`, `:602` ; `scripts/vocab-baseline/README.md:11`, `:88-90` ;
`ecarts-restauration-attendus.json` (109 entrées) ; `src/services/aiToolHandlers.js:288-325`, `:534-558`, `:727-736` ;
`src/services/aiService.js:21-24`, `:51-121`, `:258-265`, `:314` ; `src/services/domaineProfilService.js:84-100`,
`:149-159`, `:193-203`, `:225` ; `src/utils/vocabCompte.js:61-79` ; `src/middleware/auth.js:61-75`, `:135` ;
`src/controllers/manuelController.js` (entier) ; `src/controllers/aiKnowledgeController.js` (entier) ;
`src/controllers/domainesController.js:37-40`, `:206-240`, `:297-313`, `:395-411` ; `migrations/187_*.sql:98-116`,
`191_*.sql` ; `scripts/vocab-lots.mjs:1-45` ; `test/B1-assistant.test.js:69-70`, `:95-107`, `:134-142` ;
`scripts/vocab-allow/B1.json:196`, `:298-308` ; frontend `src/utils/pdfTexte.ts:12-30`, `src/utils/manuelPdf.ts:1-7`,
`:33-34`, `scripts/controle-avenant.mjs:1-60`, `src/components/admin/AdminManuelPage.tsx:30`, `:55-59`, `:78-128`,
`:176-194`, `:238-262`, `src/components/admin/AdminKnowledgeBasePage.tsx:55-65`, `:118-125`,
`src/components/client/StockLaboPage.tsx:704-708`, `:926-928`, `src/i18n/locales/fr.json:125`,
`src/components/client/ActivitesPage.tsx:954`, `src/vocab/lexiqueDefaut.ts:56-75`, `:124`.
