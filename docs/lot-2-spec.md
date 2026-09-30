# Lot 2 — Spécification v2 : le jargon du domaine partout

Référence : `docs/plan-identite-legale-tarifs-domaine-2026-09-28.md` (addendum v4), `docs/lot-1a-spec.md`, `docs/lot-1b-spec.md` (en prod). **Ce document (v2, après 5 relectures contradictoires contre le code, rapports dans `C:\Users\CHAHDONj\labflow-reprise\lot-2\`) est la source de vérité du lot 2.** La v1 a été corrigée sur 19 points bloquants.

**Mise à jour du 30/09/2026 (socle 2a corrigé après trois relectures contradictoires, avant la vague 1)** : les §1.3, §1.4, §1.5, §2.1, §2.2, §2.3, §2.4, §2.5, §3 et §8 décrivent le socle tel qu'il est livré (ajouts des étapes S1 à S4 et corrections des relectures). Les passages modifiés sont marqués « (socle corrigé) ».

Dépôts : backend `C:\Users\CHAHDONj\fiche-technique-backend` (Node/Express/PG, JS CommonJS, `npm test` = `node --test "test/**/*.test.js"`), frontend `C:\Users\CHAHDONj\fiche-technique-frontend` (React 19, Vite, TypeScript 6 strict, `npm run build` = `tsc -b && vite build`, TS6133 = build cassé ; Node 25 en local exécute le TypeScript ; CI et Docker en Node 20). Branche `feat/lot-2-jargon` dans les deux dépôts.

## 0. Découpage et invariants

Le lot est livré en **trois sous-lots déployables**, chacun sans aucun changement pour un compte restauration :
- **2a — Socle et écrans** : moteur, outil de preuve, lexique v2, vocabulaire du compte côté serveur (`req.voc`), tous les écrans client / gérant / portail.
- **2b — Productions du serveur** : messages, exports Excel, emails, IA, guide de mise en route, valeurs du contrat.
- **2c — Manuel** : balises, rendu serveur et recherche de l'assistant, variantes par domaine, base de connaissances.
Entre 2a et 2c, un compte hors restauration voit ses mots à l'écran mais reçoit encore des textes serveur en vocabulaire restauration. Seuls des comptes de test sont concernés.

Invariants :
- **I1 — Identité restauration.** Avec le lexique par défaut, tout texte produit est identique au caractère près à l'existant, hors écarts listés et justifiés (`scripts/vocab-allow/*.json`). Prouvé par outil.
- **I2 — Aucun renommage technique.** Routes, paramètres, clés d'API, discriminants, tables, colonnes, slugs, clés i18n, noms de fichiers téléchargés : inchangés.
- **I3 — Une seule grammaire.** Un moteur unique. Aucune concaténation maison d'article, de pluriel ou d'accord autour d'un terme.
- **I4 — Périmètre.** Espace client, gérant, portail acheteur, et ce que le serveur produit pour eux. L'espace admin/boss reste en vocabulaire LabFlow ; sur un écran admin, les compteurs d'un client restent libellés « Activités / Labos » avec le nom du domaine à côté. Un composant de `common/` utilisé par l'admin ne lit jamais le vocabulaire : il reçoit ses libellés en props.
- **I5 — Migrations** : nouveaux fichiers, idempotents, numéros 191+. Un fichier déployé est immuable.
- **I6 — Le vocabulaire est celui du compte DESTINATAIRE du texte**, jamais celui de l'utilisateur authentifié (un admin qui crée un compte Hôtellerie envoie un email en vocabulaire Hôtellerie).
- Conventions projet inchangées (`useConfirm`/`alerte`, `HistoryFilterBar`, `React.lazy`, `GuideButton`, charte Excel, HT/TTC, 4xx jamais 5xx, `boss` = `super_admin`, CRLF respectés, compteurs `nb_*` via `applyComposants`). Ne modifier ni `excelBrand.ts` ni `excelBrandService.js`.
- **Exception assumée à « partout »** : le fond du modèle DocuSeal et le texte fixe des builders de contrat restent inchangés jusqu'au lot 3 (un seul dépôt manuel du modèle, avec l'identité légale). Jusque-là un compte hors restauration signe un contrat dont les lignes fixes sont en vocabulaire restauration.

## 1. Lexique v2

### 1.1 Entrée
`{ sg, pl, g: 'm'|'f', el: boolean, icon?, court?: { sg, pl, el? }, appo?: boolean }`.
- `sg`/`pl` : formes stockées avec leur casse d'affichage (« Activité », « Food cost »).
- `court` : forme courte ou sigle (« PT », « Appro », « FT »). Absente → `sg`/`pl`.
- `appo` : le terme s'emploie en apposition dans une phrase (« stock labo »). Absent → faux.
- Entrée incomplète tolérée par le moteur : `pl = sg`, `g = 'm'`, `el = false`.

### 1.2 Source unique et génération
Source : frontend `src/vocab/` (`lexiqueDefaut.ts`, `vocab.ts`, `rendre.ts`). Le script `scripts/sync-vocab-back.mjs` GÉNÈRE dans le backend `src/config/lexiqueDefaut.js` et `src/utils/vocab.js` (en-tête « fichier généré, ne pas éditer »), mêmes exports qu'aujourd'hui (`LEXIQUE_DEFAUT`, `LEXIQUE_CLES`) plus le moteur. Le mode `lexique` de l'outil échoue si le backend n'est pas à jour.

### 1.3 Clés
Les 32 clés actuelles restent. S'ajoutent :
- simples : `produit` (Produit / Produits, m), `produit_compose` (Produit composé / Produits composés, m) ;
- `court` par défaut : `pt` → PT / PT ; `appro` → Appro / Appros ; `fiche_technique` → FT / FT ; `produit_utilisable` → PU / PU (ajout de l'étape S4 : sigle employé par 4 écrans) ;
- `appo: true` par défaut sur les termes employés en apposition : `labo`, `activite`, `acheteur`, `gerant` (liste fixée à l'inventaire S4) ;
- **clés dérivées** (leur DÉCLARATION — `derive_de`, `mode`, `gabarit` — n'existe que dans le lexique par défaut et n'est pas surchargeable ; leur ENTRÉE l'est, règle 1 ci-dessous) :

| Clé | Parent | Mode | Défaut |
|---|---|---|---|
| `espace_activites` | `activite` | gabarit `Espace [[Pl:activite]]` | Espace Activités |
| `espace_labo` | `labo` | gabarit `Espace [[Court:labo]]` | Espace Labo |
| `espace_vente` | `vente` | gabarit `Espace [[Nom:vente]]` | Espace Vente |
| `espace_acheteurs` | `acheteur` | gabarit `Espace [[Pl:acheteur]]` | Espace Acheteurs |
| `espace_produits` | `produit` | gabarit `Espace [[Nom:produit]]` | Espace Produit |
| `labo_long` | `labo` | copie | Laboratoire / Laboratoires |
| `labo_desc` | `labo` | copie | Laboratoire de production / Laboratoires de production |
| `activite_desc` | `activite` | copie | Point de vente / Points de vente |
| `cat_pt_utilisable` | `produit_utilisable` | pluriel_titre | Produits Transformés Utilisables |
| `cat_pt_valorise` | `produit_valorise` | pluriel_titre | Produits Composés Valorisés |
| `cat_pt_vendable` | `produit_vendable` | pluriel_titre | Produits Transformés Vendables |

Résolution (serveur, `resolveLexique`), pour une clé dérivée K de parent P dans le domaine D :
1. D surcharge K → entrée de K ;
2. sinon, si D surcharge P : `copie` → entrée ENTIÈRE de P ; `pluriel_titre` → `sg = pl = Titre(P.pl)`, genre et élision de P ; `gabarit` → gabarit rendu avec le lexique résolu de D, genre 'm' ;
3. sinon défaut de K.
« D surcharge P » (socle corrigé) = les formes RÉSOLUES de P diffèrent de celles du défaut : formes longues (`sg`, `pl`) pour `copie` et `pluriel_titre`, formes longues ou courtes pour `gabarit`. Une entrée redéclarée à l'identique du défaut ne détache donc pas ses clés dérivées ; un écart de genre, d'élision, d'icône ou de forme courte seul ne déclenche pas la copie.
`court` et `appo` ne sont hérités du défaut que si D ne surcharge pas `sg` de l'entrée. Le front reçoit un lexique entièrement résolu et le garde TEL QUEL (`completerLexique` ne complète avec le défaut local qu'un lexique incomplet, reçu d'un serveur d'avant le lot 2 pendant un déploiement) : l'écran rend exactement ce que rend `req.voc`.
La liste est complétée une seule fois, à l'étape S4 ; ensuite elle est gelée (empreinte `scripts/vocab-gel.json`, regelée après la correction du socle).

### 1.4 Validation à l'enregistrement (admin, `PUT /api/domaines/:id`)
Si `sg` est surchargé : `pl`, `g` et `el` obligatoires. `derive_de`, `mode`, `gabarit` non surchargeables. Onglet Lexique : colonnes « forme courte » ; les clés dérivées apparaissent sous leur parent avec la mention « suit “parent” si vide ».
Règles de `src/utils/lexiqueValidation.js` (socle corrigé), chacune en 400 avec un code `LEXIQUE_*` :
- caractères refusés dans `sg`, `pl`, `court` ET `icon` : `[ ] | * \` (balises, Markdown, onglets Excel), l'accent grave, `{ } $` (interpolation i18next `{{…}}` et `$t(…)`), le retour à la ligne, la tabulation et tout caractère de contrôle (U+0000 à U+001F, U+007F, U+0085, U+2028, U+2029) — `LEXIQUE_CARACTERE_INTERDIT` ;
- longueurs : 60 caractères pour `sg` / `pl`, 20 pour la forme courte, 8 pour l'icône — `LEXIQUE_TROP_LONG` ;
- clés réservées refusées : `constructor`, `__proto__`, `prototype` — `LEXIQUE_INVALIDE` ;
- clé dérivée sans `sg` : seule l'icône se change à part (un pluriel, un genre ou une forme courte seuls seraient perdus dès que le parent est surchargé) — `LEXIQUE_ENTREE_INCOMPLETE` ;
- une entrée redéclarée à l'identique du défaut n'est pas stockée (elle ferait perdre à la clé la forme courte et l'apposition du défaut) ;
- le domaine par défaut `restauration` est la référence de l'invariant I1 : son lexique ne reçoit aucun écart — `LEXIQUE_DOMAINE_DEFAUT` (un compte sans domaine lit ce profil par `/auth/me` alors que `req.voc` prend le défaut en code : les deux ne coïncident que si ce lexique reste vide). **Décision à confirmer par le client** ; l'autre voie serait de donner à `req.voc` le même repli que `/auth/me`.
L'échappement HTML des termes dans les emails relève du 2b (on n'interdit pas `<` et `>` dans un terme).

### 1.5 Brouillons (migration 191, seulement si la valeur est encore celle de la migration 187)
Hôtellerie : `food_cost` → « Ratio matière » (m) ; `labo.court` → « Cuisine » ; `pt.court` → « Prépa ». Céramique : surcharge `perte` retirée (les types de perte vivent dans les règles) ; `labo.court` → « Site » ; `pt.court` → « PF » ; `fiche_technique.court` → « FCR » ; `appro.court` → « Réception / Réceptions ». Ce sont des brouillons, à corriger par le client.
**Étape 0 de la 191 (socle corrigé), sur tous les domaines, avant ces corrections** : l'onglet Lexique du lot 1a (en production) n'envoyait `pl`, `g`, `el` que s'ils différaient du défaut, et le serveur complétait par le défaut. Le lexique v2 lit une entrée dont `sg` est surchargé telle quelle (`g = 'm'`, `el = false`). Toute entrée qui a un `sg` mais pas de `pl`, de `g` ou d'`el` reçoit donc les champs manquants du lexique par défaut d'AVANT le lot 2 (table des 32 clés dans la migration) : la résolution reste celle d'avant, aucun genre ne bascule, et les gardes d'égalité reconnaissent un brouillon ré-enregistré. Idempotente.
**Avant le déploiement**, lire la production : `SELECT d.slug, e.key, e.value FROM domaines_activite d, jsonb_each(d.lexique) e WHERE e.value ? 'sg' AND NOT (e.value ?& array['pl','g','el']);` (entrées que l'étape 0 complétera) et `SELECT slug, lexique FROM domaines_activite WHERE slug = 'restauration';` (doit être vide : §1.4).

## 2. Le moteur

### 2.1 API
Variable : **`voc`** partout (front : `const voc = useVocabulaire()` ; back : `req.voc`). Le nom `v` est interdit (déjà pris 83 fois).
Arguments : `k` = clé littérale (ou condition entre deux littéraux) ; `n` = nombre (pluriel si `n >= 2`) ou booléen (`true` = pluriel) ou absent (singulier) ; `c` = casse du nom, `'nom'` (défaut) | `'Nom'` | `'Titre'` | `'court'` | `'Court'` (forme courte, en minuscules — sigles conservés — ou telle que stockée ; le déterminant suit l'élision de la forme courte : « d'appro », « la FT »).

| Méthode | Par défaut | Rôle |
|---|---|---|
| `voc.nom(k, n?)` | labo · produit vendable | toutes les initiales en minuscule, sauf mots-sigles (2 majuscules ou majuscule + chiffre en tête) |
| `voc.Nom(k, n?)` | Labo · Produit vendable | forme stockée telle quelle |
| `voc.Titre(k, n?)` | Produits Vendables | majuscule à chaque mot, sauf de, du, des, la, le, les, et, à, au, aux, en, par, pour, sur, sans, avec, ou, un, une, d', l' |
| `voc.MAJ(k, n?)` | LABO | capitales |
| `voc.pl(k)` / `voc.Pl(k)` | labos / Labos | alias de `nom(k, true)` / `Nom(k, true)` |
| `voc.court(k, n?)` / `voc.Court(k, n?)` | pt→PT · labo→labo / Labo | forme courte |
| `voc.nomS(k)` / `voc.NomS(k)` | labo(s) · produit(s) vendable(s) | pluriel typographique mot à mot ; si pluriel irrégulier : « sg/pl » |
| `voc.n(k, n)` | 3 labos | `String(n) + ' ' + nom(k, n)` — pour un compteur ENTIER ; quantité fractionnaire ou nombre formaté : `${fmt(x)} ${voc.nom(k, x > 1)}` (le test de l'existant) |
| `voc.compl(k, n?)` | stock **labo** | `appo` → nom nu ; sinon `du(k, n)` (« de la cuisine centrale ») |
| `voc.avecCourt(k, n?)` | produits transformés (PT) | « nom (court) » ; sans parenthèse si les deux formes sont égales |
| `voc.le(k, n?, c?)` | le labo · l'activité · les labos | |
| `voc.un(k, n?, c?)` | un labo · une activité · des labos | |
| `voc.du(k, n?, c?)` | du labo · de l'activité · de la vente · des labos | |
| `voc.de(k, n?, c?)` | de labo · d'activité · d'activités | |
| `voc.au(k, n?, c?)` | au labo · à l'activité · aux labos | |
| `voc.ce(k, n?, c?)` | ce labo · cet article · cette activité · ces labos | |
| `voc.aucun(k, c?)` | aucun labo · aucune activité | |
| `voc.votre(k, n?, c?)` | votre labo · vos labos | |
| `voc.mon(k, n?, c?)` | mon labo · mon activité · ma vente · mes labos | |
| `voc.son(k, n?, c?)` | son labo · son activité · sa vente · ses labos | |
| `voc.nouveau(k, n?, c?)` | nouveau labo · nouvel article · nouvelle activité | |
| `voc.tous(k, det?, c?)` | tous les labos · toutes vos activités · tous prestataires | `det` : 'les' (défaut), 'vos', 'ces', 'mes', '' (nom nu) |
| `voc.det(k, d, n?, c?)` / `voc.Det` | `"du "` · `"l'"` · `"des "` | déterminant SEUL suivi de son séparateur, pour un terme séparé de son déterminant par une balise : `{voc.det('stock', 'du')}<strong>{voc.nom('stock')}</strong>` ; `d` : le, un, du, de, au, ce, aucun, votre, mon, son, nouveau (ajout S4) |
| `voc.acc(k, masc, fem, n?)` | — | forme accordée en genre ; avec `n` au pluriel ajoute « s » sauf finale s, x, z — donc seulement pour un mot à pluriel en « s » (sinon écrire les deux pluriels : `voc.acc(k, 'principaux', 'principales')`) |
| `voc.g(k)`, `voc.icon(k)` | 'm' · 🏭 | |
| `voc.avec(entree)` | — | mini-vocabulaire à une entrée (libellé d'un composant : `voc.avec({ sg, pl, g, el }).mon('_')`) |

Chaque méthode à déterminant a sa variante à majuscule initiale du déterminant : `voc.Le`, `voc.Un`, `voc.Du`, `voc.De`, `voc.Au`, `voc.Ce`, `voc.Aucun`, `voc.Votre`, `voc.Mon`, `voc.Son`, `voc.Nouveau`, `voc.Tous` (la casse du NOM reste pilotée par `c`). Exemple : `Carnet ${voc.de('acheteur', true, 'Nom')}` → « Carnet d'Acheteurs ».
Apostrophe droite `'`. Clé inconnue → `‹clé›` et `console.warn`, jamais d'exception. Idiomes sans méthode (un seul/une seule, le même/la même, premier/première, il/elle, lequel/laquelle) → `voc.acc`.

### 2.2 Balises
`rendre(voc, texte)` remplace `[[méthode:clé(:arg)*]]` en une seule passe. Grammaire stricte : `\[\[([A-Za-z]+):([a-z0-9_]+)((?::[^\[\]|:\n]*)*)\]\]`. Arguments : `pl` ou un entier non signé pour `n` ; `Nom`/`Titre`/`nom`/`court`/`Court` pour `c` (`[[de:appro:court]]`) ; `les`/`vos`/`ces`/`mes`/`nu` pour le déterminant de `tous` (`[[Tous:prestataire:nu]]` = « Tous prestataires ») ; pour `acc` : `[[acc:clé:masc:fem(:pl)?]]` ; pour `det` : `[[det:clé:du(:pl)?(:court)?]]`. Balise invalide → laissée telle quelle et signalée.
Usages : gabarits du lexique, `fr.json`, messages du serveur (2b), manuel (2c). **Jamais dans un fichier `.ts` / `.tsx` du front** (littéral, attribut, valeur par défaut d'un `t()`) : rien ne l'y rend, l'écran afficherait la balise ; l'outil de preuve le refuse (R8).

### 2.3 Front
- `src/vocab/vocab.ts` (`creerVocab(lexique)`), `lexiqueDefaut.ts`, `rendre.ts` : purs, sans import d'exécution hors `./`.
- Le vocabulaire est construit **dans `AuthProvider`** et exposé par le contexte. Il n'est recréé que si `JSON.stringify(lexique)` change. `useVocabulaire()` ne fait que lire le contexte (lecture tolérante hors provider → défaut). Une fonction unique `appliquerUser(data)` pose vocabulaire puis `setUser` (remplace les 5 sites `setUser`) ; déconnexion → défaut. Admin, boss, non connecté → défaut.
- `/auth/me` est rafraîchi au retour de visibilité de l'onglet (au plus une fois par 5 min). Délai de propagation d'un changement de lexique : 60 s côté serveur, prochain retour sur l'onglet côté écran. Quand la réponse est identique au user en place, rien n'est posé : l'objet `user` survit (comme `voc`), un formulaire alimenté par un effet `[user]` (« Mon profil ») garde la saisie en cours. Contrôle : `node scripts/controle-contexte.mjs` (front, navigateur sans tête, API bouchonnée).
- i18n : à chaque changement de vocabulaire, `i18n.addResourceBundle('fr', 'translation', rendreTout(fr, voc), true, true)`. Les composants gardent `t()` tel quel. En S1 : purge des 241 clés mortes, suppression de `en.json`, ajout des 5 clés appelées avec une valeur par défaut et absentes de `fr.json`, balisage des ~50 valeurs utilisées qui portent un terme. `fr.json` n'appartient à aucun lot de balayage.
- Pas de `vocabCourant()`. Le code hors React reçoit `voc` en paramètre. `contractPdf.ts` (avenant, généré par l'ADMIN) reçoit le lexique du client : `AvenantPdfParams.lexique`, fourni par `AdminSupportPage` à partir du domaine du client de la demande.
- Règles d'écriture (vérifiées par l'outil) : l'appel `voc.…` est écrit là où le texte est assemblé, sans variable intermédiaire ; une table de libellés au niveau module devient `const xxx = (voc: Vocab) => […]`, appelée sous `useMemo(…, [voc])`, les identifiants restant des littéraux ; chaque sous-composant qui affiche un terme appelle lui-même le hook ; jamais `voc` dans les dépendances d'un effet de chargement de données.
- Catégories PT : les valeurs de l'API restent les libellés par défaut ; `libelleCategoriePt(voc, valeur)` traduit à l'affichage les 5 libellés connus (les 3 de `stockUtils` + « Produits Utilisables » et « Produits Composés » de l'Espace Acheteurs). La valeur des filtres, regroupements et palettes reste la chaîne de l'API.

### 2.4 Back (partie livrée en 2a)
- `authenticate` : le SELECT existant reçoit la sous-requête `(SELECT ac.domaine_id FROM abonnements a2 JOIN abonnement_config ac ON ac.abonnement_id = a2.id WHERE a2.client_id = COALESCE(u.gerant_parent_id, <client de l'acheteur>, u.id) ORDER BY a2.id DESC LIMIT 1) AS domaine_id` ; `domaine_id` entre dans le cache (TTL 15 s). `req.voc` : `super_admin`/`boss` (d'après le RÔLE) et domaine nul → défaut, sans requête ; sinon `getProfil(domaine_id)` (cache 60 s) puis vocabulaire mémoïsé par objet lexique (`WeakMap`).
- `vocabForClient(clientId)`, `vocabDuDomaine(domaineId)` pour les textes produits hors requête du compte (admin, webhook, IA).
- `/auth/login`, `/auth/me` et `GET /api/domaines`, rôle acheteur : `domaine = { id, slug, nom, lexique }` du client vendeur, sans composants ni règles.
- `domaineProfilService.resolveLexique` : lexique v2 (§1.3), validation §1.4.

### 2.5 Outil de preuve — `scripts/vocab-check.mjs` (dépôt front ; `--root <dépôt>` pour le back)
API du compilateur TypeScript 6 (analyse TSX et JS sans programme de types). Référence : `git -C <root> show <BASE>:<fichier>`, BASE lue dans `<root>/scripts/vocab-check.base`.
Règles de canonisation (liste fermée) :
- R1 blancs JSX : règle exacte de JSX (testée contre `ts.transpileModule`), entités décodées.
- R2 trou dynamique = `⟦·⟧` ; `voc.n(k, x)` = `⟦·⟧` + nom au pluriel conditionnel.
- R3 suffixe de pluriel (`${c ? 's' : ''}`) rattaché au mot précédent ; erreur s'il n'y en a pas.
- R4 le jeton de pluriel porte la règle du test : `> 1`, `>= 2` → `@>1` ; `!== 1`, `!= 1`, `=== 1` inversé → `@≠1`. Deux jetons différents. `voc.nom(k, n)` avec `n` nombre = `@>1` ; avec un booléen, la règle est celle de l'expression booléenne.
- R5 pluriel multi-mots aligné mot à mot (« produit${s} vendable${s} » = `voc.nom('produit_vendable', n)`).
- R6 conditions `⟦?A|B⟧` imbricables ; `voc.m(c ? 'a' : 'b')` distribué ; factorisation du préfixe et du suffixe communs par mots entiers.
- R7 élément JSX enfant = marqueur `⟦<nom>⟧` + unité propre.
- R8 balises `[[…]]` rendues là où quelque chose les rend à l'exécution : valeurs de `fr.json` et littéraux des fichiers `.js` du serveur (rendu au bord, 2b). Dans un `.ts` / `.tsx` du front (littéral, attribut, texte JSX, 2ᵉ argument de `t`), une balise est une ERREUR, qu'aucun `allow` n'éteint (socle corrigé).
- R9 appels `voc.…` rendus par le VRAI moteur (`src/vocab/vocab.ts`) ; clé non littérale = erreur ; méthode ou propriété appliquée à un appel `voc` (`voc.Nom(k).toUpperCase()`) = erreur.
- R10 variable intermédiaire recevant un appel `voc.…` = erreur dès que le texte qui l'emploie a changé ; une variable qui existait déjà n'est pas une erreur d'identité, mais le mode `accords` la lit dans la phrase qui l'emploie.
- R11 comparaison des multi-ensembles par fichier ; option `--ensemble f1 f2 …` pour les chaînes déplacées.
- R12 exclus : imports, types littéraux, `console.*`, commentaires.
- Normalisation `’` → `'` : une apostrophe typographique devenue droite est jugée identique (écart d'un caractère ADMIS), mais l'outil la cite par fichier pour le compte rendu du lot (2 unités connues : ProductList.tsx:1200 et :1201).
Modes (socle corrigé) :
- `identite` : 0 écart hors `allow`. Une clé AJOUTÉE à `fr.json` est comparée au défaut de son point d'appel `t('clé', défaut)` dans la référence.
- `residuels` : tout littéral replié contenant une forme par défaut d'un terme est candidat, SAUF : type littéral, clé d'objet, index, import ; argument de `api.*`, `navigate`, `addEventListener`, `new Event`, 1ᵉʳ argument de `t`, `*.query`, `require`, `router.*`, `app.use` ; attributs `to`, `path`, `className`, `key`, `id`, `type`, `section`, `theme`, `href`, `src`, `htmlFor`, `role`, `style`, `dataKey`, `labelKey`, `data-*` ; propriétés `key`, `id`, `origine`, `type_vente`, `field`, `path` ; chemin ou URL (texte canonique commençant par `/x` ou `http`, sans mot après une espace) ; littéral fait seulement de `[a-z0-9_\-./:?=&]` avec au moins un `/ - _ .` ; littéral commençant par un mot-clé SQL. Dans les contextes AMBIGUS — opérande de `===`/`!==`, `case`, argument de `*.has` / `*.includes` / `*.add` / `*.delete`, attributs `name` / `value`, propriétés `value` / `type` / `mode` — le littéral n'est exclu que s'il a la FORME d'un identifiant (`[a-z0-9_\-./]*`) : « Article » comparé à un en-tête, `<Line name="Marge brute">`, `<input value="— Aucun fournisseur —">` sont des textes. Est aussi candidat, sous le pseudo-terme `exemple`, tout `placeholder` commençant par « Ex » qui garde un mot en dur (§3 règle 6). Attendu : 0 hors `allow`.
- `accords` : (1) signale, autour d'un appel `voc.…` (ou d'une variable qui en reçoit un) : DEVANT, un mot de la liste fermée `MOTS_ACCORD` (le, la, l', les, un, une, des, du, de, d', au, aux, ce, cet, cette, ces, aucun(e), votre, vos, mon, ma, mes, son, sa, ses, nouveau, nouvel, nouvelle, nouveaux, nouvelles, tous, toutes, tout, toute, quel(le)(s), seul(e)(s), premier, première(s), dernier, dernière(s), meilleur(e)(s), prochain(e)(s), certain(e)(s), chacun(e)), même suivi de « autre » / « même », porté par une condition, ou séparé de l'appel par un guillemet ou un emoji ; JUSTE APRÈS un appel nominal, un participe ou un adjectif de la liste fermée `ACCORDS_APRES` (relevée une fois dans l'inventaire : créé, lié, enregistré, trouvé, insuffisant, actif, manuel…), avec ou sans copule ou adverbe ; plus loin dans l'unité, un pronom de reprise (elle, ils, il non impersonnel, lequel…). Attendu 0 hors `allow` ; (2) écrit `scripts/vocab-accords.txt` : chaque unité contenant un appel `voc`, rendue avec un lexique miroir (genre et élision inversés ; chaque terme y reçoit une forme courte « Abr-… », pour distinguer `Nom` de `Court`). **La relecture des lignes « miroir » de ses fichiers est obligatoire pour chaque lot** : l'outil ne voit ni un accord hors de ses listes, ni un déterminant devant un libellé de table.
- `inventaire` : JSON par fichier (texte, ligne, termes, clés `voc` utilisées).
- `lexique` : backend généré à jour ; vecteurs identiques (copies dues une fois le moteur gelé) ; empreinte de TOUS les fichiers de `src/vocab` (sous-dossiers compris) et du lexique.
`allow` : un fichier par lot `scripts/vocab-allow/<lot>.json` (dans le dépôt analysé : le backend a le sien), entrées typées (`homonyme`, `formule`, `locution`, `verbe`, `exemple`, `discriminant`, `deplacement`, `non-repliable`, `apostrophe`, `faute-corrigee`, `provisoire`) avec justification. Une entrée `avant: null` ou `apres: null` n'absorbe qu'`occurrences` unités (1 par défaut), dans son fichier ; un extrait admis en `residuels` porte le terme avec un mot plein. Les `besoins` d'un lot vont dans `scripts/vocab-besoins/<lot>.json`.
Tests de l'outil : `scripts/vocab-check.test.mjs`, dont les 18 paires du prototype (`labflow-reprise/lot-2/proto/`) et des cas qui doivent échouer.
Ce que l'outil ne voit pas, à couvrir par la relecture du diff : deux libellés échangés dans un même fichier, un texte passé d'un attribut à un autre, un test modifié (`n > 1` remplacé par un autre booléen ; `> 1` et `>= 2` sont le même jeton), un accord loin du terme. `--ensemble` est réservé aux chaînes réellement déplacées.

### 2.6 Tests du moteur
`scripts/vocab-vecteurs.json` (≥ 200 cas sur les lexiques défaut, Hôtellerie, Céramique et miroir) ; front `scripts/vocab.test.mjs` (hors `src`, importe `../src/vocab/vocab.ts`, Node 25 local) ; back `test/vocab.test.js` sur le moteur généré, mêmes vecteurs (copie contrôlée par le mode `lexique`).

## 3. Sous-lot 2a — balayage des écrans

Mesure (AST, contextes texte, hors admin) : 63 fichiers, ~1 490 occurrences, ~960 unités visibles. Chiffres définitifs = sortie du mode `inventaire` en S3.

Règles de remplacement :
1. Tout texte visible portant un terme passe par `voc`, accords compris.
2. Noms composés : libellés, menus, colonnes, badges → forme courte en casse identique (`Stock ${voc.Court('labo')}`) ; dans une phrase → `voc.compl` (`stock ${voc.compl('labo')}`).
3. Pluriels : reproduire la règle de l'existant (`voc.nom('article', n !== 1)` là où le code teste `!== 1` ; `voc.nom(k, x > 1)` pour une quantité qui peut être fractionnaire). Les formes « (s) » → `voc.nomS`. « ce(s) », « la/les » → réécrits avec le nombre réel quand il est connu ; sinon le couple reste, accordé en genre par `voc.acc(k, 'le/les', 'la/les')` (pas d'écart), ou à défaut `allow` justifié.
4. Homonymes et noms figés ne passent PAS par `voc` : noms de formule (« Activité Basique / Premium »), « domaine d'activité », « Supplément Activité / Labo / Gérant » (supplément tarifaire), locutions « prix de vente », « type de vente », unités citées en exemple. Inscrits en `allow`.
5. Verbes et participes issus d'un terme (transférer, vendre, fabriquer) : restent en dur (`allow` type `verbe`) ; leur accord avec un terme passe par `voc.acc`.
6. Exemples de saisie : neutres et construits (`Ex: ${voc.Nom('labo')} 1`) → écart `allow` justifié. Aucun exemple propre à un domaine en dur dans un écran commun, qu'il porte ou non un terme du lexique (« Ex. Burger, Pizza Margherita… », « Ex: Poulet entier » : liste par lot dans `VOCAB-GUIDE.md` §5 bis ; le mode `residuels` les liste sous `[exemple]`).
7. Icônes : `voc.icon(k)` seulement là où l'emoji affiché est déjà l'icône par défaut de la clé.
8. Ne pas toucher : identifiants, routes, clés, commentaires, `console.*`, noms de fichiers téléchargés, pages publiques (`auth/*`).
9. Un agent ne modifie ni le moteur, ni le lexique, ni `fr.json`, ni `AuthContext`, ni `types/index.ts` : il écrit ses manques dans `scripts/vocab-besoins/<lot>.json` et laisse le texte en l'état avec un `allow` de type `provisoire`.
10. Un agent ne lance ni commande git d'écriture ni `npm run build`. Il contrôle ses fichiers par `node scripts/vocab-check.mjs identite|residuels|accords <fichiers>` et `npx tsc --noEmit -p tsconfig.app.json` (erreurs de SES fichiers seulement).

Lots (propriété exclusive ; charge = unités listées par le mode `residuels`, mesurée sur le socle corrigé). **La répartition qui fait foi est la table `LOTS` de `scripts/vocab-lots.mjs` (dépôt front), reprise ici** — `node scripts/vocab-lots.mjs` la recalcule, `node scripts/vocab-lots.mjs F3` donne les fichiers d'un lot. Elle corrige la liste d'origine sur 4 fichiers (pages jumelles réunies, F6 allégé) :
- F1 Sidebar, Header, AssistantChat, OnboardingChecklist (48)
- F2 ActivitesPage, GerantsPage (88)
- F3 StockPage, ApproPreviewPanel, InvoiceConfirmModal, HistoriqueApproPage (86)
- F4 StockLaboPage, LaboHistoriqueApproPage, PortionsModal (95)
- F5 TransferPage, TransferConfirmModal, TransferHistoriquePage, LaboVentesPage, TypeApproFilter, FacturesApproPage, LaboFacturesApproPage (80)
- F6 ProductList, ProductForm, ProductCard, RecipeTree (99)
- F7 ValorisesPage, ComposedValoriseModal, FicheTechniqueModal, ConfigurationVentePage (99)
- F8 ClientDashboard, dashboardV2Widgets (118)
- F9 Référentiel ×5 (Articles, Categories, Familles, Import, Unites), FournisseursPage, FournisseursImportPage, ProductCategoriesPage (102)
- F10 InventairePage, HistoriqueInventairePage, HistoriquepertesPage, LaboHistoriquepertesPage, VentesPage (98)
- F11 Acheteurs ×5 (AcheteursPage, AcheteursImportPage, TarifsAcheteursPage, CommandesAcheteursPage, VenteAcheteurPage), portail ×3 (105)
- F12 Guards ×3, MonAbonnementPage, AbonnementGerantPage, SupportPage, ConfigPrestatairesPage, ConfigChargesPage, contractPdf.ts + son point d'appel dans AdminSupportPage, manuelPdf.ts + son point d'appel dans GuidePage (77)
Total : 1 095 unités, 63 fichiers. `fr.json` n'appartient à aucun lot de balayage : il relève du socle (S1, corrigé : l'exemple « Restaurant A » de `client.entreprise.activity_nom` est devenu `[[Nom:activite]] A`, écart admis `exemple`) puis de S5.
Vagues de 4 lots ; entre deux vagues, un intégrateur unique lance le build et les contrôles et répare.

## 4. Sous-lot 2b — productions du serveur (spec détaillée à finaliser à son ouverture, à partir de `crit2-back-ia-docs.md`)

Décisions déjà prises :
- **Oracle d'abord** (`scripts/capture-vocab-baseline.js` puis `scripts/check-invariant-vocab.js`) : envoi d'email bouchonné avant tout `require` (le `.env` local a une vraie clé), horloge figée, 3 comptes éphémères ; capture du prompt système, des outils IA, du guide de mise en route, de la ligne de contexte, du HTML des 5 emails à termes, des chaînes écrites dans les PDF, des 8 premières lignes + noms d'onglets de chaque export, de 5 recherches fixes de l'assistant.
- **Messages : rendu au bord.** Les messages 4xx (257 dans 27 fichiers) et ceux des erreurs métier restent des littéraux, avec balises quand ils portent un terme. Un middleware global enrobe `res.json` : un champ `message` (chaîne) est rendu par `rendre(req.voc ?? vocabDefaut, message)`. Les services ne reçoivent pas `voc` pour leurs erreurs. Les messages qui nomment un paramètre technique ne sont pas touchés.
- **Jamais d'appel `voc` dans une chaîne SQL** : la requête renvoie un code stable traduit en JS, ou le libellé est un paramètre `$n`. Les 9 `CASE` de catégories PT copiés en dur sont d'abord remplacés par `ptCategorieSql(alias)`.
- **Excel** : 15 sites `brandHeader`/`brandTemplate`, 18 onglets. `nomOnglet(texte)` (retire `* ? : \ / [ ]`, coupe à 31). Modèles d'import : en-têtes du domaine, et le lecteur accepte les deux jeux d'en-têtes. Noms de fichiers inchangés.
- **Emails** : 5 fonctions (`sendInviteEmail`, `sendDocusealSigningEmail`, `sendAvenantEmail`, `sendRapportWithAttachment`, `sendMessengerInviteEmail`), `voc` en paramètre obligatoire.
- **Contrat** : seules changent les VALEURS remplies par le serveur (Formule, Option Acheteurs, Capacité ajoutée). Facture acheteur : inchangée (document fiscal). Corriger `CHAMPS.md` (« lot 3 »).
- **IA** : `buildSystemPrompt(contextLine, voc)` avec une section « Vocabulaire du compte » si le lexique diffère du défaut ; `toolsFor(voc)` mémoïsé ; `onboardingEtat` ; `buildLineFromSnapshot(snap, voc)` (`SNAPSHOT_VERSION` inchangé) ; accueil Messenger avec `vocabForClient` ; changement de domaine d'un compte → suppression de ses conversations IA.
- **Composants** : `domaine_composants.genre` ('m'|'f', défaut 'm') par migration ; les libellés de composants s'accordent par `voc.avec(…)`. Le terme du lexique désigne la catégorie, le libellé du composant désigne le type d'une unité précise.
- **Notifications** : charges utiles persistées rendues avec le vocabulaire du compte émetteur, figées à l'écriture.
- Découpage PAR FICHIER : B1 IA ; B2 documents et comptes (emailService, generate.js, pdfService, contractPdfService, clientsController, abonnementController, supportController) ; B3 labo et produits ; B4 stock, ventes, exports, tableaux de bord, stockUtils ; B5 comptes et tiers (entreprise, gérants, acheteurs, portail, fournisseurs, articles, référentiel, middleware/auth).

## 5. Sous-lot 2c — manuel (spec détaillée à finaliser à son ouverture, à partir de la relecture « manuel-rag » dans `critiques-synthese.md`)

Décisions déjà prises :
- Balises dans `contenu`, `contenu_defaut`, `titre`, `partie`. `mots_cles` reste en texte simple, enrichi au rendu des formes du domaine.
- Les textes balisés sont des fichiers versionnés (`scripts/manuel/origine/<slug>.md` figé, `scripts/manuel/balise/<slug>.md` + `<slug>.json` pour titre, partie, exclusions). Le générateur de migration ne lit jamais la base.
- Garde de la migration : `md5(replace(COALESCE(contenu_defaut, contenu), E'\r', ''))`. Fiche modifiée en production : conservée, signalée par un badge « sans balises » dans l'admin et un avertissement au démarrage.
- Rendu serveur dans `listPublic` et dans la recherche de l'assistant, dans l'ordre : résolution par domaine → filtre de visibilité → rendu → troncature à 6 000 → score.
- Variantes par domaine dans une TABLE SÉPARÉE `manuel_sections_domaine` (`UNIQUE(section_id, domaine_id)`) ; `manuel_sections` garde `UNIQUE(slug)`. Brouillons de variantes pour les 8 fiches qui racontent le métier, en Hôtellerie et en Céramique, marqués « brouillon ».
- Base de connaissances de l'assistant (32 entrées) balisée par migration.
- L'admin du manuel : aperçu rendu avant Markdown avec choix du domaine, légende des balises, refus (400) d'une balise invalide.
- `.gitattributes` : `migrations/*.sql text eol=lf`.
- Preuve : rendu par défaut = texte d'origine, octet pour octet, sur les 4 champs ; relecture des rendus Hôtellerie et Céramique par un autre agent que le baliseur.

## 6. Migrations
- **191** (2a) `191_lexique_v2_brouillons.sql` : corrections des brouillons (§1.5).
- 2b et 2c : numéros suivants, fixés à leur ouverture.

## 7. Ordre de travail du sous-lot 2a
- **S1** Front : moteur, lexique par défaut v2, `rendre`, contexte + hook, `fr.json`, vecteurs et tests.
- **S2** Outil `vocab-check` (5 modes) + tests ; script de génération vers le backend.
- **S3** Back : lexique v2 résolu et validé, moteur généré, tests, `req.voc`, domaine de l'acheteur, migration 191, onglet Lexique de l'admin.
- **S4** Inventaire sur le front → liste définitive des clés dérivées, des `appo`, des formes manquantes → moteur et lexique complétés une fois, puis GELÉS (empreinte).
- **F1…F12** en 3 vagues de 4, un intégrateur entre les vagues.
- **S5** Consolidation : fusion des `besoins`, extension unique du moteur et du lexique si nécessaire, reprise de tous les `allow` provisoires. Sortie : 0 entrée provisoire.
- **V** Vérification intégrée, trois revues contradictoires, corrections, nouveau passage. Merge `--no-ff` dans `develop` et `main`.

## 8. Preuves du sous-lot 2a
1. `vocab-check` : `identite` 0 écart hors `allow`, dans les DEUX dépôts (`--root ../fiche-technique-backend`, écarts admis dans `scripts/vocab-allow/` du backend) ; `residuels` 0 hors `allow` ; `accords` 0 hors `allow` et `vocab-accords.txt` relu ; `lexique` à jour. Contexte React : `node scripts/controle-contexte.mjs` (front).
2. Tests : moteur (front et back, mêmes vecteurs), outil, `npm test`, `npm run build`.
3. E2E `scripts/test-vocabulaire-domaine.js` (back) : comptes de test Hôtellerie et Céramique → `/auth/me` porte le lexique résolu (clés dérivées, `court`) ; acheteur d'un compte Hôtellerie → lexique du vendeur sans composants ni règles ; compte restauration créé dans le même test → lexique par défaut ; validation du lexique (400 sur entrée incomplète ou caractère interdit) ; migration 191 rejouée en transaction annulée (brouillons intacts, corrigés par l'admin, ré-enregistrés au format d'avant le lot 2). **Le backend de test se démarre par `node scripts/start-test-backend.js`** (clés externes vidées, `resend` bouchonné, réseau sortant bloqué) : les scripts E2E créent des comptes, un `npm start` avec le `.env` d'un poste enverrait de vrais emails.
4. Contrôle navigateur (complémentaire, pas une preuve d'identité) `scripts/parcours-vocabulaire.mjs` avec le puppeteer de `labflow-site` : build de référence (`git archive develop`) et nouveau build servis en même temps ; compte démo restauration : texte + attributs `title`/`placeholder`/`aria-label` identiques sur les routes client après masquage des dates ; compte Hôtellerie de test : aucune forme par défaut de `activite`, `labo`, `article`, `acheteur`, `gerant`, `transfert` hors données saisies ; aucune erreur console.
5. Non-régression : `check-invariant-config`, `check-invariant-stock`, `test-composants`, `test-transferts-chaine`, `test-onboarding-etapes`, `test-contrat-admin`.

## 9. Hors lot 2
Modèle DocuSeal et texte fixe des contrats (lot 3), identité légale et patente (lot 3), vocabulaire de l'espace admin, verbes du métier, noms de fichiers téléchargés, lignes d'exemple des modèles d'import, traduction en d'autres langues, prix par composant.
