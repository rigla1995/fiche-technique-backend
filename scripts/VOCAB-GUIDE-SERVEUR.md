# VOCAB-GUIDE-SERVEUR — balayer un lot du serveur (lot 2b)

Guide des agents B1 à B5 (B6, les écrans, suit `fiche-technique-frontend/scripts/VOCAB-GUIDE.md`).
La spécification fait foi : `docs/lot-2b-spec.md`. Ce guide en est le résumé pratique.

**But.** Un compte hors restauration ne lit plus aucun mot de la restauration dans ce que le serveur produit.
Un compte restauration ne voit **rien** changer, au caractère près (hors spec §11).

Tous les rendus ci-dessous sont ceux du VRAI moteur (`src/utils/vocab.js`), avec les 4 lexiques d'essai de
`test/vocab-lexiques-test.json` : défaut, Hôtellerie, Céramique et miroir. Le texte montre surtout le défaut et
l'Hôtellerie ; le §5.14 donne la Céramique et le miroir de chaque exemple. Le rendu par défaut est toujours égal au
texte AVANT. Chaque APRÈS a été appliqué à une copie du dépôt et passé à `identite`, `residuels` et `accords` :
un exemple qui laisse un résidu, ou qui ne se rend juste qu'en Hôtellerie, est faux.

## 0. En bref

1. `node scripts/vocab-lots.mjs <lot>` : tes fichiers. Tu ne touches QUE ceux-là.
2. Depuis le front : `node scripts/vocab-check.mjs residuels --root ../fiche-technique-backend <tes fichiers>` : ce qui reste à faire.
3. Tu réécris (§2 à §5), puis les contrôles du §8. Tous à 0. Rends chaque texte modifié dans les 4 lexiques d'essai
   (défaut, Hôtellerie, Céramique, miroir) : l'Hôtellerie seule ne voit ni « approvisionnement » ni « produit ».
4. Ce qui te manque (clé, forme, fichier d'un autre lot, fichier partagé) : `scripts/vocab-besoins/<lot>.json`,
   et le texte reste en l'état avec une entrée `provisoire` dans `scripts/vocab-allow/<lot>.json`.

## 1. Les règles (spec §0, §6, §10.3)

- **I6 — vocabulaire du DESTINATAIRE.** Dans un contrôleur client, gérant ou acheteur : `req.voc`. Hors requête
  du compte (admin, webhook, assistant, rapport) : `vocabForClient(clientId)`, `vocabDuDomaine(domaineId)` ou
  `vocabPourUtilisateur(userId)` (`src/utils/vocabCompte.js`). Admin et boss : défaut (I4).
- **I7 — une balise `[[…]]` seulement à un point de rendu** (§3). Partout ailleurs : des appels `voc`. Jamais de
  balise en base, dans un email, un PDF, un classeur, le prompt, `src/routes/*.js`, ni dans un champ JSON autre
  que `message`.
- **I8 — jamais de vocabulaire dans le SQL.** Ni appel `voc`, ni balise, ni terme interpolé. Le libellé passe en
  paramètre `$n` (propre à la requête) ou devient un code traduit en JS (§5.12, §5.13).
- **I9 — la forme de l'API ne change pas.** Mêmes champs, mêmes types, un libellé reste une chaîne au même endroit.
- **Un texte balisé n'est jamais comparé** (`err.message === …`, `.includes`) : on compare un `code` (spec §5.2).
- **Composant identité créé à la volée** (spec §5.4) : `applyComposants` renvoie `identitesCreees` ; l'appelant
  appelle `invaliderProfilApresCommit(resultat)` juste APRÈS son COMMIT (jamais avant). Les 6 sites le font ; un
  nouvel appel d'`applyComposants` aussi (contrôle : `test/socle-composants.test.js`).
- **Pluriels** : la règle de l'existant. `> 1` reste `> 1`, `!== 1` reste `!== 1`. Jamais `voc.n` à la place.
- **Accords** : `voc.acc` / `[[acc:…]]`. Plusieurs termes coordonnés : `voc.accN` en code ; en balise, accord avec
  le terme le plus proche. Pronoms de reprise (« lui-même », « il ») : `acc` aussi.
- **Ne se traduisent pas** (entrée typée) : verbes (« se transférer », entrée `verbe`) ; locutions (« prix de
  vente », « type de vente », « canal de vente », « sous-produit ») ; noms de formule (« Activité Basique /
  Premium ») ; noms de fichiers ; noms de champs DocuSeal ; codes et enums ; messages techniques (identifiant
  camelCase ou snake_case, nom en `Id`, `[]`, valeur entre apostrophes, liste brute) ; textes admin ; « article »
  au sens d'élément quelconque (liste fermée de la spec §6.5) ; `errors[].msg` d'express-validator.
- **Une vague** : pas de commande git d'écriture, ni `npm start`, ni migration, ni `npm test`, ni oracle, ni E2E.
  Tu ne modifies ni le moteur, ni le lexique, ni `rendreMessages.js`, ni `vocabCompte.js`, ni `excelNoms.js`, ni
  `middleware/auth.js`, ni un fichier partagé (spec §10.4).

## 2. L'API (rappel) et les idiomes

Lis `const voc = req.voc ?? vocabDefaut;` (import `const { vocabDefaut } = require('../utils/vocab');`).
**Interdits** (l'outil ne les suit pas) : `(req.voc ?? vocabDefaut).Nom(…)`, `req['voc']`, une clé non littérale
(`voc.Nom(type)`), une méthode de chaîne sur un appel (`voc.le(k).startsWith(…)`), une balise à trou
(`[[n:article:${n}]]`). À la place d'une méthode de chaîne, un test par expression régulière : l'élision d'un terme
s'écrit `/^l'/.test(voc.le('activite'))` (comme `configComposantsService.js`).

| Appel | Défaut | Hôtellerie |
|---|---|---|
| `voc.Nom('labo')` · `voc.nom('labo', true)` | Labo · labos | Cuisine centrale · cuisines centrales |
| `voc.Court('labo')` · `voc.court('labo')` | Labo · labo | Cuisine · cuisine |
| `voc.Court('pt')` · `voc.Nom('pt_abr')` | PT · Prod. Transformé | Prépa · Préparation |
| `voc.Nom('article_ingredient')` | Ingrédient | Fourniture |
| `voc.un('activite')` · `voc.de('activite', true)` | une activité · d'activités | un service · de services |
| `voc.du('inventaire', true)` | des inventaires | des inventaires |
| `voc.mon('labo', true)` | mes labos | mes cuisines centrales |
| `voc.acc('acheteur', 'supprimé', 'supprimée')` | supprimé | supprimé |
| `voc.icon('labo')` | 🏭 | 🏭 |
| `voc.ex('🧂', '📏')` | 🧂 | 📏 |
| `libelleCategoriePt(voc, 'Produits Transformés Utilisables')` | Produits Transformés Utilisables | Consommables |
| `nomOnglet('Inventaire Bloc chaud')` | Inventaire Bloc chaud | — |
| `libelleComposant(voc, composantLabo, 2, 'Nom')` | Labos | Cuisines centrales |
| `voc.avec(entreeComposantVoc(voc, composantLabo)).mon('_', true)` | mes labos | mes cuisines centrales |
| `` `Base ${voc.court('acheteur', true)}` `` | Base acheteurs | Base clients professionnels |

Balises : `[[méthode:clé(:arg)*]]`, mêmes méthodes (`[[Nom:labo]]`, `[[nom:article:pl]]`, `[[ce:activite]]`,
`[[acc:article:supprimé:supprimée]]`, `[[Le:espace_produits:Nom]]`, `[[un:appro:pl]]` = « des approvisionnements »).
Une balise de SYNTAXE invalide reste telle quelle et est signalée une fois dans le journal. Une balise bien formée
dont la CLÉ est inconnue (`[[nom:xyz]]`) n'est pas laissée telle quelle : le moteur la rend « ‹xyz› » (et la signale).

`voc.icon(k)` seulement pour une clé dont l'emoji affiché est DÉJÀ l'icône par défaut (📦 stock, 🏭 labo,
🏪 activité). 📊, 🛒, 🧂 employés pour un autre sens, et 📉, 🔄, 🧾, restent littéraux.

## 3. Points de rendu (E2) — où une balise est permise

Le middleware `src/middleware/rendreMessages.js` rend, à la sortie, `body.message` et `body.erreurs[].message`
d'un objet littéral, avec `req.voc` (défaut sans compte). Rien d'autre : ni `errors`, ni `details`, ni `warnings`,
ni `detail`, ni `reply`. Une balise n'est donc écrite que :

- dans la propriété `message` d'un objet littéral passé DIRECTEMENT à `res.json(…)` / `res.status(…).json(…)`,
  ou poussé dans un tableau nommé `erreurs` ;
- dans le message d'une erreur construite : `new Error(m)`, `new TransfertError(status, code, m)` (3ᵉ),
  `new UniteError(code, m)` (2ᵉ) — **jamais** dans `src/routes/*.js` ni dans un `body().custom(…)` ;
- dans le 2ᵉ argument de `rendre(voc, m)` ;
- aux points déclarés dans `scripts/vocab-rendu.json` (liste fermée, tenue par le socle) : `push(code, message)`
  de `configComposantsService.js`, valeurs de `CODES` (`unitesOperationnellesService.js`), `sg` / `pl` de
  `LIBELLES` (`quotaService.js`), retours de `messageSupplement` (`produitsController.js`), relais `rendre` de
  `aiToolHandlers.js`.

Chemin permis entre le littéral et le point : parenthèses, ternaire, `||` / `??`, `+`, gabarit (morceaux et
trous). Une `const` locale compte aussi si son seul initialiseur est un tel littéral et si TOUS ses emplois sont
des trous d'un point de rendu (§5.4).

Un limiteur (express-rate-limit) n'est rendu que si son option `message` est un OBJET `{ message: … }`.

**Sortie explicite.** Une route qui renvoie dans `message` une DONNÉE saisie pose `res.locals.vocabBrut = true;` juste
avant `res.json(…)` : le corps part tel quel. Sans cela, une donnée de la forme d'une balise serait rendue (« ‹clé› »).
Deux sites le posent (lot 2c, R5.7.1) : `PUT /admin/site/demandes-acces/:id` (le message d'un visiteur du site,
`adminSiteController.js`) et `refuserBalises` de `src/utils/manuelRendu.js`, qui répond aux refus 400
`BALISE_INVALIDE` / `BALISE_INTERDITE` des écritures admin du manuel, de la base de connaissances et des variantes (le
message cite la balise fautive saisie). Une donnée INTERPOLÉE dans un
message balisé (nom de produit) est, elle, rendue avec le message : risque accepté (spec §5.1).

## 4. Table des formes (spec §6.5) et choix de la clé

| Emploi | Forme | Défaut | Hôtellerie |
|---|---|---|---|
| Dans une phrase (message, consigne, prompt) | `nom` / `Nom` ; `court` SEULEMENT là où l'existant écrit un sigle ou une abréviation | Labo introuvable · Stock PT insuffisant | Cuisine centrale introuvable · Stock prépa insuffisant |
| Apposition dans une phrase | `compl` (`labo`, `activite`, `acheteur`, `gerant`) | Stock labo insuffisant | Stock de la cuisine centrale insuffisant |
| Étiquette : en-tête, onglet, préfixe « X : nom », « X · nom » | `Court` | Labo : Bloc chaud | Cuisine : Bloc chaud |
| Marqueur entre parenthèses | `court` | Bloc chaud (labo) | Bloc chaud (cuisine) |
| Nom d'écran, module, option | `Court` (`court` si l'existant l'écrit en minuscules) | Module Acheteurs non activé | Module Clients professionnels non activé |
| « Base acheteurs » en tête ou en étiquette (composant, nom de module) | `` `Base ${voc.court('acheteur', true)}` `` | Base acheteurs | Base clients professionnels |
| « base acheteurs » dans une phrase | `` `base ${voc.court('acheteur', true)}` `` ; en balise `base [[court:acheteur:pl]]` | la base acheteurs | la base clients professionnels |

« base acheteurs » en balise — `gerantController.js:110`, `:113` (et `:228`, `:235`, mêmes textes) :
```js
// AVANT
return res.status(400).json({ message: 'L\'accès à la base acheteurs exige au moins un labo affecté' });
return res.status(400).json({ message: 'La base acheteurs n\'est pas activée sur votre compte' });
// APRÈS (minuscule dans la phrase : jamais « à la Base acheteurs »)
return res.status(400).json({ message: "L'accès à la base [[court:acheteur:pl]] exige au moins [[un:labo]] [[acc:labo:affecté:affectée]]" });
return res.status(400).json({ message: "La base [[court:acheteur:pl]] n'est pas activée sur votre compte" });
```
Défaut : identique · Hôtellerie : « L'accès à la base clients professionnels exige au moins une cuisine centrale
affectée », « La base clients professionnels n'est pas activée sur votre compte » · Céramique : « … la base
revendeurs … un site de production affecté » · miroir : « … la base clientes … une usine affectée ».
Contrôles sur une copie : `identite` 0 écart, plus de résidu aux 4 lignes. `accords` signale « activée » après
`court('acheteur')` (`:113`, `:235`) : à tort, l'accord porte sur « base », féminin fixe. Entrée `non-repliable`
(« signalement d'accord à tort ») dans le fichier du lot.

Clés :
- « Ingrédient » d'une ligne de stock, d'un historique, d'un rapport, d'un message de stock → `article_ingredient` ;
  composant d'une recette (fiche technique) → `ingredient`.
- « référentiel des articles/ingrédients » → `` `${voc.pl('article')}/${voc.pl('ingredient')}` `` (jamais
  `article_ingredient`, qui copie `article`).
- Abréviations : `pt_abr`, `produit_utilisable_abr`, `produit_vendable_abr`, `produit_valorise_abr`,
  `transfert_abr`, `supplement_abr`.
- Composant d'abonnement (type d'une unité, ligne par composant) : `libelleComposant(voc, c, n, casse)` ; accord
  avec un déterminant : `voc.avec(entreeComposantVoc(voc, c))` (seulement `nom`, `Nom`, `mon`, `mes`). Elle suit la
  table identité de `libelleComposant` : un composant identité au libellé du brouillon (« Activité », « Labo »…, que
  porte tout domaine créé par l'admin) prend le terme du lexique. `voc.avec(entreeComposant(c))` garderait « mon
  activité » hors restauration : seulement pour un composant qui ne peut pas être un composant identité.

## 5. Exemples AVANT → APRÈS (code réel)

### 5.1 Message 404 — `laboController.js:231`
```js
// AVANT
if (!ok) return res.status(404).json({ message: 'Labo introuvable' });
// APRÈS
if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });
```
Défaut : « Labo introuvable » · Hôtellerie : « Cuisine centrale introuvable ».

### 5.2 Message 409 avec accord — `articlesController.js:198`
```js
// AVANT
return res.status(409).json({ message: "Cet article a des approvisionnements et ne peut pas être supprimé" });
// APRÈS
return res.status(409).json({ message: '[[Ce:article]] a [[un:appro:pl]] et ne peut pas être [[acc:article:supprimé:supprimée]]' });
```
Défaut : « Cet article a des approvisionnements et ne peut pas être supprimé » ·
Hôtellerie : « Cette fourniture a des approvisionnements et ne peut pas être supprimée » ·
Céramique : « Cette matière première a des réceptions et ne peut pas être supprimée » ·
miroir : « Cette denrée a des rentrées et ne peut pas être supprimée ».
« approvisionnements » est un terme (`appro`) : l'Hôtellerie le garde, la Céramique non. `[[un:appro:pl]]` rend
« des … » (et non « des » écrit devant `[[nom:appro:pl]]`, que `accords` signale).

### 5.3 Erreur levée `TransfertError` (3ᵉ argument) — `transfertService.js:109`
```js
// AVANT
throw new TransfertError(400, 'DESTINATION_INVALIDE', 'Un labo ne peut pas se transférer à lui-même');
// APRÈS (le verbe « se transférer » reste : entrée `verbe` ; le pronom s'accorde)
throw new TransfertError(400, 'DESTINATION_INVALIDE', '[[Un:labo]] ne peut pas se transférer à [[acc:labo:lui-même:elle-même]]');
```
Défaut : « Un labo ne peut pas se transférer à lui-même » ·
Hôtellerie : « Une cuisine centrale ne peut pas se transférer à elle-même ».
`replyTransfertError` (`laboController.js:17`) renvoie `{ code: err.code, message: err.message }` : rendu au bord.
Un code (`DESTINATION_INVALIDE`) ne bouge pas.

### 5.4 Variable `const` de message — `transfertService.js:174-175`
```js
// AVANT
const cible = missing.activiteId != null ? 'cette activité' : 'ce labo';
throw new TransfertError(400, 'PT_NON_AFFECTE', `Le produit "${nomRes.rows[0]?.nom ?? `PT #${missing.produitId}`}" n'est pas affecté à ${cible} — transfert refusé.`);
// APRÈS (cible : un seul initialiseur, littéraux balisés, employée seulement dans le trou d'un point de rendu ;
//        « Le produit » et le repli « PT # » sont des termes : balisés aussi, le repli dans son gabarit imbriqué)
const cible = missing.activiteId != null ? '[[ce:activite]]' : '[[ce:labo]]';
throw new TransfertError(400, 'PT_NON_AFFECTE', `[[Le:produit]] "${nomRes.rows[0]?.nom ?? `[[court:pt]] #${missing.produitId}`}" n'est pas [[acc:produit:affecté:affectée]] à ${cible} — [[nom:transfert]] [[acc:transfert:refusé:refusée]].`);
```
| | Défaut | Hôtellerie | miroir |
|---|---|---|---|
| activité | Le produit "Sauce" n'est pas affecté à cette activité — transfert refusé. | Le produit "Sauce" n'est pas affecté à ce service — livraison interne refusée. | L'invention "Sauce" n'est pas affectée à ce local — expédition refusée. |
| labo, repli | Le produit "PT #12" n'est pas affecté à ce labo — transfert refusé. | Le produit "prépa #12" n'est pas affecté à cette cuisine centrale — livraison interne refusée. | L'invention "EI #12" n'est pas affectée à cette usine — expédition refusée. |

Sans `[[acc:transfert:…]]`, l'Hôtellerie lirait « livraison interne refusé » ; sans `[[Le:produit]]`, le miroir
lirait « Le produit "Sauce" n'est pas affectée » (accord sur un mot resté écrit). Le nom du produit est une donnée
interpolée dans un message balisé : rendu avec lui (spec §5.1).

### 5.5 Table de libellés `LIBELLES` — `quotaService.js`
```js
// AVANT
activite: { col: 'nb_activites', sg: 'activité', pl: 'activités' },
labo: { col: 'nb_labos', sg: 'labo', pl: 'labos' },
// APRÈS (une balise littérale par entrée, jamais de clé dynamique ; message inchangé :
//        `… comprend ${max} ${max > 1 ? def.pl : def.sg} — …`)
activite: { col: 'nb_activites', sg: '[[nom:activite]]', pl: '[[nom:activite:pl]]' },
labo: { col: 'nb_labos', sg: '[[nom:labo]]', pl: '[[nom:labo:pl]]' },
```
Défaut : « Limite atteinte : votre formule comprend 3 labos — … » · Hôtellerie : « … comprend 3 cuisines centrales — … ».

### 5.6 Pluriel dynamique en balise — `categoriesController.js:137`
```js
// AVANT
message: `Cette catégorie est assignée à ${n} article${n > 1 ? 's' : ''} — supprimez-les ou changez leur catégorie avant`,
// APRÈS (deux balises complètes, le test d'origine gardé)
message: `Cette catégorie est assignée à ${n} ${n > 1 ? '[[nom:article:pl]]' : '[[nom:article]]'} — supprimez-les ou changez leur catégorie avant`,
```
Défaut : « … assignée à 4 articles — … » · Hôtellerie : « … assignée à 4 fournitures — … ».

### 5.7 Excel : onglet, titre, en-têtes, catégorie PT — `inventaireController.js:896-912`
```js
// AVANT
const sheet = workbook.addWorksheet(`Inventaire ${laboNom}`, { … });
titre: 'Historique des inventaires — Labo',
headerRow(sheet, headerIdx, ['Date', 'Ingrédient', 'Catégorie', 'Qté réelle', 'Unité', 'Labo', 'Note'], …);
dataRow.values = [dateStr, r.ingredient_nom, r.categorie_nom, …];
// APRÈS (voc = req.voc ?? vocabDefaut ; ongletSur de src/utils/excelNoms.js)
const sheet = workbook.addWorksheet(ongletSur(workbook, `${voc.Court('inventaire')} ${laboNom}`), { … });
titre: `Historique ${voc.du('inventaire', true)} — ${voc.Court('labo')}`,
headerRow(sheet, headerIdx, ['Date', voc.Nom('article_ingredient'), 'Catégorie', 'Qté réelle', 'Unité', voc.Court('labo'), 'Note'], …);
dataRow.values = [dateStr, r.ingredient_nom, libelleCategoriePt(voc, r.categorie_nom), …];
```
| | Défaut | Hôtellerie |
|---|---|---|
| onglet (labo « Bloc chaud ») | Inventaire Bloc chaud | Inventaire Bloc chaud |
| titre | Historique des inventaires — Labo | Historique des inventaires — Cuisine |
| en-têtes | Date, Ingrédient, …, Labo, Note | Date, Fourniture, …, Cuisine, Note |
| catégorie PT | Produits Transformés Utilisables | Consommables |

Règles Excel : `libelleCategoriePt` au moment d'ÉCRIRE la cellule (jamais avant un filtre, un tri, un
regroupement) ; `ongletSur` sur tout onglet qui porte un terme ou un nom saisi ; « N produit(s) » `!== 1` →
`` `${n} ${voc.nom('produit', n !== 1)}` `` ; noms de fichiers inchangés, `nomFichierSur(nom)` seulement là où un
nom saisi entre dans `Content-Disposition` ; type d'appro : `'PT'` → `voc.Court('pt')` (PT / Prépa),
`'produit_transforme'` → `voc.Nom('pt_abr')` (Prod. Transformé / Préparation), `'transfert'` →
`` `${voc.Nom('transfert')} ${voc.acc('transfert', 'reçu', 'reçue')}` `` (Transfert reçu / Livraison interne reçue).

### 5.8 Email — `emailService.js:225`, `:228` (`sendDocusealSigningEmail`)
```js
// AVANT
supParts.push(`${n(avenant.addActivites)} activité${n(avenant.addActivites) > 1 ? 's' : ''}`);
supParts.push(`l'option Acheteurs (palier jusqu'à ${n(avenant.setAcheteurs)} acheteurs)`);
// APRÈS (voc vient de la clé `voc` de l'objet d'arguments ; jamais de balise dans un email)
supParts.push(`${n(avenant.addActivites)} ${voc.nom('activite', n(avenant.addActivites) > 1)}`);
supParts.push(`l'option ${voc.Court('acheteur', true)} (palier jusqu'à ${n(avenant.setAcheteurs)} ${voc.nom('acheteur', true)})`);
```
Défaut : « 2 activités », « l'option Acheteurs (palier jusqu'à 20 acheteurs) » ·
Hôtellerie : « 2 services », « l'option Clients professionnels (palier jusqu'à 20 clients professionnels) ».
Chaque appel des 5 fonctions à terme porte la clé `voc` (contrôle : `test/emailVoc.test.js`). Un terme ne va
jamais dans un attribut HTML ; il n'est pas échappé (« < » et « > » sont refusés dans le lexique).

### 5.9 PDF facture d'appro — `factureApproPdf.js:17`
```js
// AVANT
const buildFactureApproPdf = (f, lignes) => buildFactureAppro(null, {
  contexte: f.activite_nom ? `Activité : ${f.activite_nom}` : (f.labo_nom ? `Labo : ${f.labo_nom}` : ''),
// APRÈS (un seul appelant : facturesController.js, avec req.voc ; libellés passés à generate.js dans data.libelles)
const buildFactureApproPdf = (f, lignes, voc) => buildFactureAppro(null, {
  contexte: f.activite_nom ? `${voc.Court('activite')} : ${f.activite_nom}` : (f.labo_nom ? `${voc.Court('labo')} : ${f.labo_nom}` : ''),
```
Défaut : « Activité : Terrasse », « Labo : Bloc chaud » · Hôtellerie : « Service : Terrasse », « Cuisine : Bloc chaud ».
`generate.js` garde ses littéraux comme valeurs par défaut. Facture acheteur et facture d'abonnement : inchangées
(entrées `fiscal`).

### 5.10 Prompt et guide de mise en route — appels `voc`, JAMAIS de balise
```js
// AVANT — aiService.js:19
`Utilise directement ces IDs d'activités/labos dès que le client nomme une activité ou un labo.`
// APRÈS
`Utilise directement ces IDs ${voc.de('activite', true)}/${voc.pl('labo')} dès que le client nomme ${voc.un('activite')} ou ${voc.un('labo')}.`

// AVANT — onboardingEtat.js:119-120
(c.code === 'activite' ? (c.attendu > 1 ? 'Comment créer mes activités ?' : 'Comment créer mon activité ?') : (c.attendu > 1 ? 'Comment créer mes labos ?' : 'Comment créer mon labo ?'))
: `Comment créer ${c.attendu > 1 ? 'mes' : 'mon'} ${(c.attendu > 1 ? (c.libellePluriel || c.libelle) : c.libelle).toLowerCase()} ?`
// APRÈS (liste toute en identité → lexique ; liste mixte → composant, par la table identité d'entreeComposantVoc)
(c.code === 'activite' ? `Comment créer ${voc.mon('activite', c.attendu > 1)} ?` : `Comment créer ${voc.mon('labo', c.attendu > 1)} ?`)
: `Comment créer ${voc.avec(entreeComposantVoc(voc, c)).mon('_', c.attendu > 1)} ?`
```
`entreeComposantVoc(voc, c)` (moteur, `src/vocab/composants.ts`) applique la table fermée de `libelleComposant` : un
composant identité au libellé du brouillon (« Activité », « Labo » : tout domaine créé par l'admin en reçoit)
prend le TERME du lexique, genre et élision compris ; tout autre composant garde son libellé. Avec
`voc.avec(entreeComposant(c))`, ce domaine lirait « Comment créer mon activité ? » quel que soit son lexique.

| | Défaut | Hôtellerie | Céramique | miroir |
|---|---|---|---|---|
| prompt | … ces IDs d'activités/labos dès que le client nomme une activité ou un labo. | … ces IDs de services/cuisines centrales … un service ou une cuisine centrale. | … de points de vente/sites de production … | … de locaux/usines … un local ou une usine. |
| guide, identité | Comment créer mes labos ? | Comment créer mes cuisines centrales ? | Comment créer mes sites de production ? | Comment créer mes usines ? |
| liste mixte, composant identité « Activité » | Comment créer mon activité ? | Comment créer mon service ? | Comment créer mon point de vente ? | Comment créer mon local ? |
| liste mixte, composant « Cuisine » (f) | — (aucun composant féminin hors identité en restauration) | Comment créer ma cuisine ? (avant : « mon cuisine ») | idem | idem |
| liste mixte, composant « Restaurant », `attendu > 1` | Comment créer mes restaurants ? | Comment créer mes restaurants ? | idem | idem |

**Écart d'identité attendu** (spec §7.4) : `vocab-check identite` rend 1 écart à `onboardingEtat.js:119`, le
déterminant passé dans `voc.avec(…).mon(…)` (« Comment créer ⟦mon|mes@>1⟧ … ? » devient « Comment créer
⟦?⟦mon|mes@>1⟧ …|⟦·⟧⟧ ? »). Entrée `deplacement` dans `scripts/vocab-allow/B1.json`, justification : « déterminant
déplacé dans voc.avec(entreeComposantVoc(voc, c)).mon ; rendu par défaut identique, prouvé par l'oracle (guide) ».

La ligne de contexte et le guide interpolent des noms saisis : `rendre()` ne s'applique jamais à des données.

### 5.11 Texte écrit en base — `inventaireController.js:339`
```js
// AVANT
const payload = { eventType: 'new_inventaire', type: 'labo', notesAdmin: `Labo : ${labo_nom} — ${dateInventaire}` };
// APRÈS (rendu au moment de l'écriture, req.voc = vocabulaire du compte destinataire ; même charge en base et en SSE)
const payload = { eventType: 'new_inventaire', type: 'labo', notesAdmin: `${voc.Court('labo')} : ${labo_nom} — ${dateInventaire}` };
```
Défaut : « Labo : Bloc chaud — 2026-09-30 » · Hôtellerie : « Cuisine : Bloc chaud — 2026-09-30 ».
Motif `acheteursController.js:242` : `` `${voc.Nom('acheteur')} ${voc.acc('acheteur', 'supprimé', 'supprimée')} du carnet` `` →
« Acheteur supprimé du carnet » / « Client professionnel supprimé du carnet ».

### 5.12 SQL : paramètre `$n` propre à la requête — `dashboardV2Controller.js:100`, `:356`
```js
// AVANT
const L_CANAL = `CASE WHEN v.type_vente = 'directe' THEN 'Direct' ELSE COALESCE(pl.nom, 'Prestataire') END`;
pool.query(`SELECT ${L_CANAL} AS canal, ${sums} ${VENTE_FROM} WHERE ${where} GROUP BY 1 ORDER BY 2 DESC`, params),
// APRÈS (la constante devient une fonction du numéro ; le paramètre n'entre JAMAIS dans le tableau partagé)
const lCanal = (n) => `CASE WHEN v.type_vente = 'directe' THEN 'Direct' ELSE COALESCE(pl.nom, $${n}) END`;
const pCanal = [...params, voc.Nom('prestataire')];
pool.query(`SELECT ${lCanal(pCanal.length)} AS canal, ${sums} ${VENTE_FROM} WHERE ${where} GROUP BY 1 ORDER BY 2 DESC`, pCanal),
```
Défaut : « Prestataire » · Hôtellerie : « Prestataire ». Même regroupement, mêmes lignes. Un paramètre en trop dans
un tableau partagé fait échouer les AUTRES requêtes (500, ou outil vide sans bruit). Marqueur « (labo) » en SQL
(`ld.nom || ' (labo)'`) : `ld.nom || $n` avec `` ` (${voc.court('labo')})` `` → « Bloc chaud (labo) » / « Bloc chaud (cuisine) ».

### 5.13 SQL : code stable + traduction en JS — `dashboardV2Controller.js:525`, `:546`, `:571`
```js
// AVANT
`SELECT a.nom AS site, 'Activité' AS site_type, …`   `SELECT l.nom AS site, 'Labo' AS site_type, …`
parSite[`${r.site_type} · ${r.site}`] = (parSite[`${r.site_type} · ${r.site}`] || 0) + v;
// APRÈS (codes en minuscules ; regroupement sur code|nom ; libellé APRÈS le regroupement, table à clés littérales)
`SELECT a.nom AS site, 'activite' AS site_type, …`   `SELECT l.nom AS site, 'labo' AS site_type, …`
parSite[`${r.site_type}|${r.site}`] = …;
const TYPE_SITE = { activite: voc.Court('activite'), labo: voc.Court('labo') };
// libellé : `${TYPE_SITE[code]} · ${nom}`
```
Défaut : « Activité · Terrasse », « Labo · Bloc chaud » · Hôtellerie : « Service · Terrasse », « Cuisine · Bloc chaud ».
Un tri qui portait sur une position garde son critère : `ORDER BY <expression>`, jamais un numéro décalé. Un code
ajouté au SQL (`'activite'`) est un écart d'identité admis seulement par une entrée `discriminant`. Préfixes du même
fichier : `` `${voc.Nom('produit_vendable_abr')} / ` `` → « P. Vendable / Burgers » / « Prestation vendue / Burgers ».

### 5.14 Céramique et miroir de chaque exemple
| § | Céramique | miroir |
|---|---|---|
| 5.1 | Site de production introuvable | Usine introuvable |
| 5.2 | Cette matière première a des réceptions et ne peut pas être supprimée | Cette denrée a des rentrées et ne peut pas être supprimée |
| 5.3 | Un site de production ne peut pas se transférer à lui-même | Une usine ne peut pas se transférer à elle-même |
| 5.4 | Le produit "Sauce" n'est pas affecté à ce point de vente — livraison interne refusée. | L'invention "Sauce" n'est pas affectée à ce local — expédition refusée. |
| 5.5 | … comprend 3 sites de production | … comprend 3 usines |
| 5.6 | … assignée à 4 matières premières | … assignée à 4 denrées |
| 5.7 | onglet « Inventaire Bloc chaud » ; « Historique des inventaires — Site » ; en-têtes « Matière première », « Site » ; catégorie « Semi-finis » | onglet « Pesée Bloc chaud » ; « Historique des pesées — Usine » ; « Provision », « Usine » ; « Inventions Internes Utiles » |
| 5.8 | 2 points de vente · l'option Revendeurs (palier jusqu'à 20 revendeurs) | 2 locaux · l'option Clientes (palier jusqu'à 20 clientes) |
| 5.9 | Point de vente : Terrasse · Site : Bloc chaud | Local : Terrasse · Usine : Bloc chaud |
| 5.11 | Site : Bloc chaud — … · Revendeur supprimé du carnet | Usine : Bloc chaud — … · Cliente supprimée du carnet |
| 5.12 | Intermédiaire · Bloc chaud (site) | Agence · Bloc chaud (usine) |
| 5.13 | Point de vente · Terrasse · Site · Bloc chaud · Produit fini / Burgers | Local · Terrasse · Usine · Bloc chaud · Inv. vendue / Burgers |

## 6. Écarts admis attendus, par type

Fichier de ton lot : `scripts/vocab-allow/<lot>.json` (format : `fiche-technique-frontend/scripts/vocab-allow/README.md`).
`--proposer-allow` imprime les entrées brutes ; tu choisis le type et tu écris la justification.

| Type | Quand |
|---|---|
| `discriminant` | code, valeur d'état, nom d'en-tête, code SQL ajouté ou retiré (`⟦sql⟧'activite'`), nom de fichier |
| `locution` | prix de vente, type de vente, canal de vente, sous-produit, prestataires de livraison |
| `formule` | Activité Basique / Premium, « Fiche Technique App » (`creator`) |
| `homonyme` | « article » générique (liste fermée §6.5), « ARTICLE n » du contrat, « PRESTATAIRE », « PU HT », « Domaine d'activité » |
| `verbe` | « se transférer », « s'approvisionne » |
| `admin` | texte lu seulement par un super_admin ou le boss : justification = route + garde (`requireSuperAdmin`) |
| `non-repliable` | signalement d'accord à tort (mode `accords`), `errors[].msg` d'express-validator (« champ non rendu »), glossaire à clé non littérale |
| `deplacement` | texte déplacé d'un fichier à un autre (une entrée dans chacun), du SQL vers le JS sans unité JS identique, ou déterminant déplacé dans le moteur (`voc.avec(entreeComposantVoc(voc, c)).mon(…)`, §5.10) |
| `reporte` (+ `lot`) | texte fixe du contrat (`3`) ; la description de `search_knowledge_base` (`2c`) passe par `voc` depuis le lot 2c (R5.5) |
| `fiscal` | facture acheteur, facture d'abonnement |
| `faute-corrigee` | faute de l'existant corrigée (sous-titre « Transfert labo → activité » d'un transfert labo→labo) |
| `provisoire` | en attente d'un besoin (`vocab-besoins/<lot>.json`) : doit finir à 0 |

Ne vont PAS dans allow : une erreur de l'outil (« balise sans rendu », clé non littérale, méthode sur un appel
voc…), un écart qu'une meilleure écriture supprime, un doute (→ `provisoire` + besoin).

## 7. Ce qui change pour un compte restauration (spec §11) — rien d'autre

Exports en erreur qui se téléchargent (noms hors Latin-1, caractères `* ? : \ / [ ]`) ; guillemet droit « " » d'un
nom saisi remplacé par « - » dans le nom de fichier (§11.1.4) ; onglets à nom saisi qui
perdent une espace finale ou double ; facture d'appro (sous-titre labo→labo, « › », « ? ») ; export du tableau
de bord (B6) ; lecteur du référentiel ; `lexique: null` et clés `genre` / `elision` (déjà faits au socle).
Tout autre changement visible en restauration est une erreur : corrige le code.

## 8. Contrôles

**Agent** (depuis `fiche-technique-frontend`, sur TES fichiers) :
```
node scripts/vocab-check.mjs identite  --root ../fiche-technique-backend <fichiers>   # 0 écart hors allow
node scripts/vocab-check.mjs residuels --root ../fiche-technique-backend <fichiers>   # 0 hors allow
node scripts/vocab-check.mjs accords   --root ../fiche-technique-backend <fichiers>   # 0, et relire CHAQUE ligne « miroir »
```
Puis `node --check <fichier>` (backend) ; pour un SQL modifié, un test à faux pool sur le modèle de
`placeholdersCoherents` (`test/gerantDashboardSql.test.js`) dans `test/<lot>-*.test.js` ; rends chaque texte
modifié en Hôtellerie, en Céramique et dans le miroir (lexiques d'essai), et relis CHAQUE ligne
« miroir » de `accords` : c'est elle qui montre un mot resté écrit (« Le produit … affectée »). Une ligne « requête
modifiée, à relire » : dis-la dans ta sortie.

**Intégrateur** (seul à écrire après la vague) : `npm test` ; l'outil complet (`identite`, `residuels`,
`accords`, `lexique`) au front et au serveur, chaque squelette SQL « à relire » relu ; `node scripts/vocab-lots.mjs` ;
l'oracle `node scripts/check-invariant-vocab.js` (restauration IDENTIQUE hors `ecarts-restauration-attendus.json`,
0 entrée sans emploi) puis `--domaine hotellerie|ceramique|miroir` ; les E2E sur `node scripts/start-test-backend.js`
(`test-vocabulaire-domaine`, `test-composants`, `test-onboarding-etapes`, `test-transferts-chaine`,
`test-contrat-admin`, `test-manuel-filtre`, `check-invariant-config`, `check-invariant-stock`, `test-bot-onboarding`) ; au front
`vocab.test.mjs`, `vocab-check.test.mjs`, `controle-contexte.mjs`, `controle-avenant.mjs`, `npm run build`. Il
conteste chaque écart admis, tient les fichiers partagés (spec §10.4) et commite un point de restauration.

Référence connue de `test-bot-onboarding` (spec §12.4) : 14/17, avant comme après le socle. Les 3 échecs sont
anciens : « chat 200 pendant la mise en route » et « le bot cite l'étape manquante » demandent un vrai appel Gemini
(bouchonné) ; « questions capacités : création d'activités proposée » monte `nb_activites`, alors que les questions
se calculent par composant. Compare la LISTE des contrôles verts : toute autre baisse est une régression.
