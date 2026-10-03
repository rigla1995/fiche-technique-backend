# Guide de balisage du manuel (lot 2c)

Pour qui : les agents de balisage (lots L1 à L9), les rédacteurs de variantes (V-H1, V-H2, V-C1, V-C2) et leurs
relecteurs.

Ce qui fait foi : `docs/lot-2c-spec.md`. Ce guide en reprend :
- les règles d'écriture (§7) ;
- les fichiers (§3.3), le pré-baliseur (§3.4) et le contrôle (§3.5) ;
- les variantes (§8) et le travail en lots (§9).

En cas de doute, la spec gagne, et le doute va dans `besoins/<lot>.json`.

Les tableaux des §2, §11 et §13 sont produits par le vrai moteur (`src/utils/vocab.js`), avec :
- Hôtellerie et Céramique : les lexiques de `domaines.json`, résolus ;
- miroir : le lexique d'essai de `test/vocab-lexiques-test.json`.

Le test `scripts/manuel/test/guide.test.js` vérifie que ces tableaux sont à jour. Pour les refaire après une correction
des lexiques : `node scripts/manuel/lib/exemples-guide.js --guide` (intégrateur).

Vocabulaire :
- **H** = Hôtellerie, **C** = Céramique ;
- **miroir** = lexique d'essai où chaque terme change, genre et élision inversés ;
- **balise** = `[[méthode:clé:arguments]]` (grammaire : `docs/lot-2-spec.md` §2.2) ;
- **forme par défaut** = une forme d'un terme du lexique de la restauration (« labo », « Activités », « PT »…), telle
  que la cherche `formesParDefaut` (`src/utils/manuelRendu.js`).

---

## 0. La règle qui prime : rien ne change pour la restauration

Pour chaque champ balisé, le rendu avec le vocabulaire par défaut doit égaler le texte d'origine, octet pour octet. Les
champs balisés sont le contenu, le titre et la partie d'une fiche, le titre et le contenu d'une entrée de la base
(I10, spec §0.2). Donc :

- hors des balises, on ne change aucun caractère : ni espace, ni ponctuation, ni majuscule, ni retour à la ligne ;
- une balise remplace exactement les caractères qu'elle rend par défaut, ni plus ni moins ;
- on ne reformule jamais le texte commun, même une phrase maladroite hors restauration. Seule une variante le peut
  (§14 de ce guide, spec §8) ;
- le contrôle compare les octets (point 1 du §10) : une seule différence fait échouer la fiche.

Un compte restauration, café ou boulangerie lit ainsi exactement le manuel d'aujourd'hui. Un compte H ou C le lit dans
ses mots, aux limites près (spec §10.3).

---

## 1. Le travail d'un lot, pas à pas

**Vos fichiers.** `scripts/manuel/lots.json` donne pour votre lot :
- vos `fiches` (L9 : vos entrées `base` ; V-* : vos `variantes` et votre `domaine`) ;
- votre `relecteur`.

Vous n'écrivez que ces fichiers :
- `balise/manuel/<slug>.md` et `.json` de vos fiches (L9 : `balise/base/<fichier>.md` et `.json` ; V-* :
  `variantes/<domaine>/<slug>.md` et `.json`) ;
- `relectures/<lot>.auto.json` ;
- `besoins/<lot>.json`.

Vous ne modifiez jamais : `origine/`, `parties.json`, `lots.json`, `domaines.json`, un outil de `scripts/manuel/`, ni
un fichier de code.

**Les étapes.**

1. **Brouillon** : `node scripts/manuel/prebaliser.mjs --lot <lot>`. Il écrit vos brouillons et
   `rendus/<lot>/a-baliser.json` (voir §9). Il refuse de réécrire un brouillon qui existe déjà. `--remplacer` le force,
   et vous perdez alors votre travail.
2. **Reprise à la main**, fiche par fiche :
   - chaque ligne `nonBalisees` du rapport : à baliser, à exclure (§4) ou à justifier ;
   - chaque ligne `aVerifier` : choix ambigu, accord à poser, apposition ;
   - puis toute la fiche : homonymes balisés à tort, noms d'écran (R7.1.3), accords (§5), gloses (§7).
3. **Contrôle** : `node scripts/manuel/controler.mjs --lot <lot>`.
   - Les points 1 à 6 doivent passer.
   - Les signalements 7 à 12 sont corrigés, ou acceptés avec leur raison dans `relectures/<lot>.auto.json` (§10).
4. **Lecture des rendus** en entier : `rendus/<lot>/hotellerie/`, `…/ceramique/` et `…/miroir/`. Le miroir montre les
   accords oubliés.
5. **Compte rendu**, qui donne :
   - les formes balisées et les exclusions par type ;
   - les accords posés ;
   - les libellés d'écran cherchés, avec leur `fichier:ligne` ;
   - vos doutes.

**Interdits (spec §9.3).**
- Aucune commande git d'écriture, aucune base, aucun serveur, aucun `npm`.
- Vos seuls outils : `controler.mjs --lot <lot>`, et `prebaliser.mjs` sur vos fiches.
- Un manque va dans `besoins/<lot>.json` (§15) : balise impossible, partie à changer, besoin du moteur, défaut d'un
  outil. Seul l'intégrateur corrige un outil, `parties.json` ou `lots.json`.

**La relecture croisée en 4 tours (§9.4)** :
1. le baliseur balise ;
2. le relecteur lit EN ENTIER les rendus H, C et miroir des fiches relues, relit les signalements acceptés de
   `<lot>.auto.json` et vérifie 1 libellé d'écran sur 5 ; il remplit seul `relectures/<lot>.json` ;
3. le baliseur corrige ;
4. le relecteur clôt chaque ligne (ou la laisse ouverte, avec sa raison, pour l'intégrateur).

---

## 2. La grammaire utile

Clés : les 47 du lexique (tableau du §13). Une clé inconnue est refusée par le contrôle (I11), et l'écran l'afficherait
« ‹clé› ».

Il n'y a pas de `[[les:k]]` : on écrit `[[le:k:pl]]`. Les arguments (`pl`, casse, déterminant de `tous`) se mettent
dans n'importe quel ordre.

<!-- debut:table-aide (node scripts/manuel/lib/exemples-guide.js --guide) -->
| Balise | Défaut | Hôtellerie | Miroir | Usage |
|---|---|---|---|---|
| `[[nom:labo]]` | « labo » | « cuisine centrale » | « usine » | nom seul, en minuscules |
| `[[nom:labo:pl]]` | « labos » | « cuisines centrales » | « usines » | pluriel : argument `pl` |
| `[[Nom:labo]]` | « Labo » | « Cuisine centrale » | « Usine » | forme stockée (majuscule initiale) : début de phrase, titre, nom d'écran |
| `[[Pl:activite]]` | « Activités » | « Services » | « Locaux » | pluriel, forme stockée |
| `[[Titre:pt]]` | « Produit Transformé » | « Préparation » | « Élaboration Interne » | chaque mot à majuscule, seulement si l'origine l'écrit ainsi |
| `[[MAJ:labo]]` | « LABO » | « CUISINE CENTRALE » | « USINE » | capitales |
| `[[court:pt]]` | « PT » | « prépa » | « EI » | forme courte ou sigle, seulement là où l'origine l'écrit (R7.1.5) |
| `[[Court:appro]]` | « Appro » | « Appro » | « Rentrée » | forme courte, forme stockée ; second nom d'un nom d'écran (« Stock Labo ») |
| `[[le:labo]]` | « le labo » | « la cuisine centrale » | « l'usine » | déterminant + nom (aussi `un`, `du`, `de`, `au`, `ce`, `votre`, `mon`, `son`, `nouveau`) |
| `[[Le:activite]]` | « L'activité » | « Le service » | « Le local » | déterminant à majuscule : `Le`, `Un`, `Du`, `De`, `Au`, `Ce`, `Votre`, `Mon`, `Son`, `Nouveau` |
| `[[le:labo:pl:Nom]]` | « les Labos » | « les Cuisines centrales » | « les Usines » | nombre et casse, dans n'importe quel ordre |
| `[[du:activite]]` | « de l'activité » | « du service » | « du local » | du, de la, de l', des |
| `[[de:appro]]` | « d'approvisionnement » | « d'approvisionnement » | « de rentrée » | de, d' : l'élision est faite par le moteur (R7.1.2) |
| `[[au:labo]]` | « au labo » | « à la cuisine centrale » | « à l'usine » | au, à la, à l', aux |
| `[[ce:article]]` | « cet article » | « cette fourniture » | « cette denrée » | ce, cet, cette, ces |
| `[[votre:activite:pl]]` | « vos activités » | « vos services » | « vos locaux » | votre, vos |
| `[[son:recette]]` | « sa recette » | « sa fiche de préparation » | « son assemblage » | son, sa, ses (mon, ma, mes) |
| `[[nouveau:article]]` | « nouvel article » | « nouvelle fourniture » | « nouvelle denrée » | nouveau, nouvel, nouvelle |
| `[[aucun:labo]]` | « aucun labo » | « aucune cuisine centrale » | « aucune usine » | singulier seulement (casse possible : `[[aucun:labo:Nom]]`) |
| `[[tous:labo:les]]` | « tous les labos » | « toutes les cuisines centrales » | « toutes les usines » | tous / toutes + `les`, `vos`, `ces`, `mes` (ou `nu`) |
| `[[det:labo:du]]**[[nom:labo]]**` | « du **labo** » | « de la **cuisine centrale** » | « de l'**usine** » | déterminant SEUL, collé au gras, à un libellé de lien ou à `MAJ` qui suit (§7.4) |
| `[[acc:labo:créé:créée]]` | « créé » | « créée » | « créée » | accord masc:fem (un argument peut être vide) |
| `[[acc:labo:créé:créée:pl]]` | « créés » | « créées » | « créées » | accord au pluriel |
| `[[compl:labo]]` | « labo » | « de la cuisine centrale » | « de l'usine » | apposition dans une phrase (« le stock labo », R7.1.4) : clés à apposition seulement |
| `[[compl:stock]]` | « du stock » | « du stock » | « de l'armoire » | sans apposition, `compl` écrit « du X » : jamais pour reproduire « stock » seul |
| `[[avecCourt:pt:pl]]` | « produits transformés (PT) » | « préparations (prépas) » | « élaborations internes (EI) » | « X (SIGLE) » (§7.5) |
| `[[n:labo:3]]` | « 3 labos » | « 3 cuisines centrales » | « 3 usines » | nombre + nom |
<!-- fin:table-aide -->

---

## 3. Quand baliser (spec §7.1)

- **R7.1.1** — Toute forme d'un terme qui désigne la notion de LabFlow se balise.
  - Le déterminant va DANS la balise quand il dépend du terme : `[[du:labo]]`, jamais `du [[nom:labo]]`. « du »
    deviendrait faux pour un terme féminin : « du cuisine centrale ».
  - Même chose à majuscule : `[[Le:acheteur]]`, jamais `L'[[nom:acheteur]]` (exemple 20 faux : « L'client
    professionnel »).
- **R7.1.2** — L'élision se fait par le moteur, jamais à la main : `[[de:appro]]`, pas `d'[[nom:appro]]` (exemple 3 :
  « d'réception » en C).
- **R7.1.3** — Nom d'écran, de bouton ou de menu cité tel qu'à l'écran (en gras ou entre « ») : **cherchez le libellé
  dans le front** et reprenez l'appel `voc` de l'écran. Où chercher : `../fiche-technique-frontend/src/i18n/locales/fr.json`
  et `src/components/`. Notez le `fichier:ligne` dans votre compte rendu.
  - Si l'écran n'écrit pas le terme, le manuel reste tel quel : exclusion `nom-fige`.
  - « **↗ Transfert** » (`transferts`) : l'écran écrit « ↗ Transférer » (`StockLaboPage.tsx:706`, `fr.json:125`).
    `[[Nom:transfert]]` donnerait « ↗ Livraison interne » en H, ce n'est pas le bouton : exclusion `nom-fige`.
  - « **Avec labo** » (`compte-activites-labos`) : l'écran écrit `Avec {voc.nom('labo')}` (`ActivitesPage.tsx:954`).
    On écrit donc `Avec [[nom:labo]]`, pas la forme courte.
- **R7.1.4** — Apposition « stock labo » :
  - dans une phrase : `[[nom:stock]] [[compl:labo]]` ou `[[le:stock]] [[compl:labo]]` (exemple 15) ;
  - dans un nom d'écran : forme courte, `[[Nom:stock]] [[Court:labo]]` (exemple 5).

  Deux balises de nom collées dont la seconde a l'apposition (activite, labo, acheteur, gerant) sont signalées
  (point 11). `[[Nom:stock]] [[Nom:labo]]` donne « Stock Cuisine centrale » en H.
- **R7.1.5** — Sigle ou forme courte (« PT », « FT », « PU », « Appro ») : `[[court:pt]]`, `[[Court:appro]]`,
  **seulement là où l'origine écrit le sigle**.
  - En pleine phrase, la forme courte rend un mot familier en H (« une prépa ») et un sigle en C (« un PF »).
  - La relecture C vérifie que la fiche explique le sigle une fois, souvent par un « X (SIGLE) » d'origine (§7).
- **R7.1.6** — « compte dépôt » : `compte [[nom:depot]]` (exemple 21 ; aucun domaine ne change ce mot aujourd'hui).
- **R7.1.7 — « Ingrédient » : deux clés** (intégrateur B1, besoin L3-5 ; `docs/lot-2-spec.md` §1.3). Les deux rendent
  « Ingrédient » par défaut et le pré-baliseur propose toujours `ingredient` : vérifiez chaque « ingrédient ».
  - `article_ingredient` (copie de `article` : H « Fourniture », C « Matière première ») quand « ingrédient » est un
    autre nom de l'article du référentiel, pris pour lui-même : ligne de stock, article qu'on crée, qu'on cherche,
    qu'on demande au catalogue, qu'on saisit à l'inventaire ou qu'on transfère (écrans `InventairePage.tsx:295`,
    `TransferHistoriquePage.tsx:316` ; fiches `faq`, `support`).
  - `ingredient` (H et C « Composant ») quand il est le composant d'une recette (ce que la recette contient, ce que la
    production déduit, sa part dans un coût), ou quand il s'oppose à une autre sorte d'article (« ingrédient ou produit
    acheté », `lexique` ; « Ingrédient » contre « Article valorisé », `referentiel-familles`). `article_ingredient`,
    copie de l'article, effacerait l'opposition : H lirait « Fourniture » contre « Fourniture valorisée ».

---

## 4. Quand exclure (spec §7.2)

Une forme par défaut qui ne désigne pas la notion de LabFlow, ou qu'aucune balise ne peut rendre juste, reste telle
quelle. Elle est déclarée dans le `.json` de la fiche comme une **exclusion typée**. Liste fermée de 6 types :

| Type | Quand | Exemples du manuel |
|---|---|---|
| `homonyme` | même mot, autre sens | « supplément » tarifaire de l'abonnement (« le prix de chaque supplément en DT », exemple 10) ; « Domaine d'activité » ; « article » de la base de connaissances ou d'un contrat ; le verbe « produit » (« le labo produit ») |
| `locution` | groupe figé, liste fermée | « prix de vente », « type de vente », « canal de vente » ; **« sous-produit(s) »**, « sous-produit(s) transformé(s) », **« sous-PT »** |
| `nom-fige` | nom commercial, ancien nom, ou bouton que l'écran écrit sans le terme | « Activité Basique / Premium » (exemple 22), « Formule d'activités », « anciennement « article valorisé » », « ↗ Transfert » (R7.1.3) |
| `capitales` | capitales partielles qu'aucune balise ne reproduit, **seulement** si une forme par défaut reste hors balise (§6) | rare : « produit VENDABLE » n'en a pas besoin (exemple 11) |
| `exemple` | exemple métier dans un bloc `:::exemple`, qu'aucune balise ne rend juste | « Tarte aux fraises » (le terme autour reste balisé, exemple 13) |
| `glose` | explication entre parenthèses qui redirait le terme | « (point de vente) » après « activité » (exemple 9) |

**« sous-produit » : décision 2 du client.** C'est une exclusion assumée, de type `locution`, et il n'y a pas de
nouvelle clé :
- 28 occurrences dans le manuel et 2 dans la base ;
- même traitement pour « sous-PT », qui est la même notion ;
- hors restauration le mot reste : en Céramique, « sous-produit » se lit « déchet valorisable » (spec §10.3) ;
- le pré-baliseur écrit lui-même ces exclusions (§9).

**Ni balisés ni exclus.** Ces mots ne contiennent aucune forme du lexique par défaut ; une exclusion serait « sans
emploi » :
- « sous-préparation(s) » et « sous-composant(s) » ;
- les verbes : transférer, approvisionner, vendre. La relecture vérifie quand même la phrase (« transférer » à côté de
  « livraison interne »).

**Écrire une exclusion.**

```json
{ "extrait": "prix de vente", "forme": "vente", "type": "locution", "occurrences": 2,
  "justification": "locution figée du métier (lot-2-spec §3 règle 4, spec 2c §7.2)" }
```

- `extrait` est un passage EXACT du texte balisé, sans balise, qui contient une forme par défaut restée hors balise. Il
  doit se retrouver tel quel dans tous les rendus. Choisissez le passage le plus court qui ne couvre QUE ce que vous
  excluez : « prix de vente », pas « le prix de vente est ».
- **Ordre d'application** : les exclusions sont appliquées dans l'ordre de la liste, chaque extrait retiré du texte
  partout où il apparaît (règle de l'oracle, `check-invariant-vocab.js`). Mettez donc un extrait AVANT tout extrait plus
  court qu'il contient : « sous-produit transformé » avant « sous-produit ».
- `occurrences` = nombre de retraits de l'extrait, contenu et titre de la fiche réunis, dans cet ordre (fonction
  `retirerExtraits` de `lib/commun.js`).
- Une exclusion sans emploi fait échouer le contrôle. On n'exclut donc jamais un passage qui ne contient plus de forme
  par défaut hors balise (exemple 11).
- `justification` est obligatoire et courte : la règle, la décision ou l'écran (`fichier:ligne`).
- Une fiche qui porte au moins une forme non exclue porte au moins une balise. Un champ dont toutes les formes sont
  exclues reste sans balise : le générateur l'inscrit dans la liste des champs admis sans balise.

**Cible d'un lien `(#slug)`.** Elle n'est ni balisée ni exclue : elle n'est jamais affichée (lien à l'écran, retirée du
PDF).
- Elle contient souvent une forme : 200 formes dans 185 cibles, par exemple `#stock-labo` ou `#transferts`.
- Le pré-baliseur les compte à part (`ciblesDeLien`).
- Si `controler.mjs` vous les signale, ne posez pas d'exclusion : écrivez un besoin (§15).

---

## 5. Accords (spec §7.3)

- **R7.3.1 — Seulement s'il dépend du terme.** Dans « la seule voie d'entrée en stock », « seule » s'accorde avec
  « voie » : rien à baliser (exemple 3 quater). Le piège : « le transfert est le seul moyen » balisé
  `[[acc:transfert:seul:seule]]` donne « la livraison interne est le seule moyen » (exemple 3 bis).
- **R7.3.2 — L'accord suit le mot qui le commande**, qui n'est pas toujours le terme visible. Dans « Point de vente ou
  cuisine exploité », « exploité » suit « point de vente » (`activite_desc`, masculin), pas « activité » (exemples 14
  et 14 faux).
- **R7.3.3 — À vérifier autour de chaque terme balisé** : participes, adjectifs, pronoms de reprise. Forme :
  `[[acc:clé:masc:fem]]` ou `[[acc:clé:masc:fem:pl]]`. La liste :
  - il / elle, et l'inversion « peut-il » ;
  - le / la pronom, celui / celle ;
  - chacun / chacune, l'un / l'une ;
  - un / une ou plusieurs, aucun / aucune ;
  - tous / toutes (`[[tous:clé:les]]`) ;
  - premier / première, dernier / dernière ;
  - seul / seule (si le terme le commande).

  L'idiome « votre premier / votre première » s'écrit `[[acc:clé:votre premier:votre première]] [[nom:clé]]`
  (exemple 4).
- **R7.3.4 — Deux termes coordonnés.**
  - Par « **ou** » : accord avec le plus proche.
  - Par « **et** » : le français veut le masculin pluriel dès qu'un des termes est masculin. Si, dans les lexiques
    réels (défaut, H, C), l'un des deux est toujours masculin, l'accord reste **sans balise**, au masculin pluriel
    (exemple 16). Sinon : `acc` sur le terme qui peut être féminin, et une ligne dans `relectures/<lot>.json`.
  - Le miroir, où les deux termes sont féminins, reste alors faux : c'est accepté.
  - Il n'existe pas de balise `accN` dans le manuel : un vrai besoin va dans `besoins/<lot>.json`.
- **R7.3.5 — La lecture des rendus miroir est obligatoire.** C'est elle qui montre les accords oubliés (« le armoire »,
  « l'seul usine »).

Le pré-baliseur ne pose jamais d'accord. Il liste les mots accordables restés en clair juste devant une balise de nom
(« dernier », « propre », « même », « premier », « seul »…).

**Déterminant à distance.** Un déterminant séparé du nom par un adjectif s'accorde quand même avec le nom :
« un autre [[nom:labo]] » donne en H « un autre cuisine centrale », « son propre [[nom:stock]] » donne en miroir « son
propre armoire ». Écrivez déterminant et adjectif dans l'accord, collés au nom :
`[[acc:labo:un autre:une autre]] [[nom:labo]]` (comme l'exemple 17). Le point 10 signale « le, la, un, une, du, au,
ce, cet, cette, mon, ma, son, sa, aucun, aucune, quel, quelle, tout, toute » suivis de « autre, même, seul(e), propre,
premier / première, dernier / dernière, nouveau / nouvel / nouvelle, second(e), deuxième, troisième, unique,
principal(e) » puis d'une balise de nom. Fiches concernées (brouillons du pré-baliseur) : « un autre [[nom:labo]] »
dans `activites` (2 fois) et `calc-transferts` ; « son propre [[nom:stock]] » dans `compte-activites-labos` et
`decouvrir-labflow`.

---

## 6. Majuscules, capitales, déterminant suivi d'un adjectif (spec §7.4)

- **Début de phrase ou titre** : la variante à majuscule du déterminant (`[[Le:labo]]`), ou la casse `Nom` / `Titre`.
- **Mot entièrement en capitales** : `[[MAJ:labo]]`, et son déterminant par `[[det:labo:du]]` collé devant. Jamais
  « du [[MAJ:labo]] » (exemple 9).
- **`det` / `Det`** s'emploie seulement collé au nom, à `MAJ`, au gras `**` ou au crochet d'un libellé de lien
  (exemple 19). L'élision est calculée sur le nom, pas sur le mot qui suit.
- **Adjectif entre le déterminant et le nom** (seul, propre, premier, dernier, nouveau, même) :
  `[[acc:clé:le seul:la seule]] [[nom:clé]]`. `[[det:labo:le]]seul [[nom:labo]]` donne « la seul cuisine centrale »
  (exemples 17 et 17 faux).
- **Capitales partielles** (« produit VENDABLE ») : on balise le mot en minuscules s'il est un terme
  (`[[Un:produit]]`), on laisse le mot en capitales tel quel, et on balise l'accord qui suit. Pas d'exclusion quand plus
  aucune forme par défaut ne reste hors balise (exemple 11).

---

## 7. « X (SIGLE) », gloses, « labo central » (spec §7.5)

- **« produits transformés (PT) »** : `[[le:pt:pl]] ([[court:pt:pl]])` ou `les [[avecCourt:pt:pl]]`, au choix : mêmes
  rendus (exemples 1 et 1 bis). `avecCourt` n'écrit pas de parenthèse si les deux formes sont égales.
- **Glose qui explique un terme par une clé copiée** (`activite_desc`, `labo_long`, `labo_desc`) : elle redit le terme
  dès que le domaine le change (« un SERVICE (service) », exemple 9). Le point 8 la signale. Le relecteur choisit :
  - une exclusion `glose` (le texte reste celui d'origine) ;
  - ou une acceptation écrite dans `relectures/`.

  Dans la base, lue seulement par le modèle, la glose redite est tolérée (question 5 du client).
- **« labo central », « laboratoire central »** :
  - Le terme H « cuisine centrale » contient déjà l'adjectif : `[[acc:labo:central:centrale]]` donne « cuisine
    centrale centrale » (exemple 12 bis).
  - On écrit l'adjectif DANS l'accord, avec son espace, avec une forme féminine vide, collé au terme :
    `[[Nom:labo]][[acc:labo: central:]]` (exemple 12), `[[votre:labo_long]][[acc:labo_long: central:]]` (exemple
    12 ter).
  - **Limite** : l'astuce repose sur le genre, le féminin efface l'adjectif. Un terme féminin qui ne dit pas
    « central » le perd (miroir : « Usine »). Un futur terme masculin qui contiendrait déjà « central » le redoublerait
    (le point 7 le signale).
  - Même piège sans accord : « [[votre:labo_long]] central » donne en H « votre cuisine centrale central ». Le point 7
    signale aussi ce mot de même racine collé au terme (« centrale central ») ; écrivez l'adjectif dans l'accord, comme
    ci-dessus. Fiches concernées (mesuré sur les brouillons du pré-baliseur) : `stock-labo`, `activites`,
    `compte-activites-labos`, `decouvrir-labflow`, et l'entrée `labo-central` de la base.
  - « labos de production » donne en C « sites de production de production ». La grammaire ne peut pas l'éviter :
    signalé par le point 7, accepté par le relecteur.

---

## 8. Liens, tableaux, blocs, titres, mots-clés, caractères (spec §7.6)

- **Liens** `[texte](#slug)` : le libellé se balise, la cible jamais.
  - Un libellé qui commence par une balise s'écrit `[[[Pl:activite]] & [[pl:labo]]](#activites)` (exemple 7) : la
    grammaire ne lit pas le premier crochet comme une balise.
  - Un libellé qui est un nom d'écran prend la forme de l'écran (R7.1.3).
- **Tableaux** : une cellule se balise comme une phrase. Un terme ne contient jamais « | » (le lexique le refuse).
  - Le contrôle vérifie le nombre de « | » de chaque ligne.
  - Une ligne de lexique `| **X** | X …` devient circulaire hors restauration : signalée (point 8), corrigée par la
    variante.
- **Blocs** `:::astuce`, `:::attention`, `:::regle`, `:::exemple`, `:::formule <libellé>` : le mot-clé jamais, le
  libellé d'une formule oui.
- **Titres** `##`, `###` : comme une phrase, l'émoji reste.
- **Mots-clés** (`mots_cles`) : jamais balisés (ils sont enrichis au rendu, décision 3).
- **Passage entre accents graves** (`/portail`) : jamais touché.
- **Caractères d'un terme** : « # », « - », « > » ou « 1. » au début d'un terme changeraient une ligne qui commence par
  une balise. Aucun lexique réel ne le fait : c'est un risque accepté (question 13).

---

## 9. Le pré-baliseur (spec §3.4)

`node scripts/manuel/prebaliser.mjs --lot <lot>`, ou `<slug>…`, ou `--base <fichier>…` (L9).

**Ce qu'il fait.**
- Pour chaque forme par défaut, il essaie le déterminant qui précède, en minuscules et à majuscule, puis le nom seul.
- Il ne propose une balise **que si son rendu par défaut reproduit exactement le passage** : même casse, même
  déterminant, même élision. Avant d'écrire, il vérifie I10 et I11 sur chaque champ, et s'arrête en cas d'écart.
- Il écrit les locutions de la liste fermée en exclusions `locution`, dans l'ordre d'application et avec leurs
  occurrences.

**Ce qu'il ne fait pas, et que vous faites.**
- Il ne pose aucun accord.
- Il ne voit pas les homonymes : il balise le verbe « produit » et le « supplément » tarifaire. Excluez-les.
- Il ne cherche pas les noms d'écran (R7.1.3).
- Il ne pose pas la forme courte d'une apposition (`[[Court:labo]]`) ni `compl` : il les signale.
- Il ne balise pas une forme collée à un trait d'union (« fournisseur-labo »), et vous non plus : **jamais de balise
  contre un tiret**. « sous-[[nom:pt]] » rend « sous-préparation » en H et « sous-[[nom:produit]] » « sous-invention »
  en miroir, alors que l'identité passe. Le point 3 refuse toute balise (hors `acc`, `accN`, `ex` : « peut-[[acc:labo:il:elle]] »)
  précédée de « lettre- » ou suivie de « -lettre ». La forme reste en clair : locution de la liste fermée
  (« sous-produit »), exclusion justifiée (nom d'écran : `nom-fige`), ou phrase réécrite autour.
- Il ne balise pas un passage qu'aucune balise ne reproduit : « une appro » (le lexique dit « un approvisionnement »),
  « produit VENDABLE », « espaces Activités ».

**Le rapport `rendus/<lot>/a-baliser.json`**, par fiche :
- `nonBalisees` : formes laissées telles quelles, avec leur raison ;
- `aVerifier` : balises posées à relire ;
  - « nombre ambigu » : un sigle sans déterminant, « PT » peut être singulier ou pluriel ;
  - « casse ambiguë » : `court` ou `Court` ;
  - mot accordable en clair devant la balise ;
  - deux noms collés ;
- les comptes : formes, balisées, en locution, en cible de lien.

---

## 10. Le contrôle (spec §3.5)

`node scripts/manuel/controler.mjs --lot <lot>` (ou `<slug>…`). **Une fiche passe si les points 1 à 6 passent.**

1. **Identité (I10)** : rendu par défaut = origine, en octets. On compare le contenu, `contenu_defaut` (pour les 5
   fiches Espace Acheteurs, l'origine est le contenu), le titre et la partie.
2. **Balises valides (I11)** : grammaire, clé connue, balise fermée.
3. **Résiduels** : aucune forme par défaut hors balises, sauf dans les extraits exclus. Chaque exclusion est employée
   exactement `occurrences` fois. Aucune balise collée à un trait d'union (« sous-[[nom:pt]] »), hors `acc`, `accN`, `ex`.
4. **Liens** : même suite de cibles `#slug` que l'origine, dans chaque rendu ; aucun libellé rendu vide.
5. **Blocs et tableaux** : mêmes lignes `:::…` ; même nombre de « | » par ligne de tableau, dans chaque rendu.
6. **Rendus écrits** (H, C, miroir), sans « [[ », « ]] » ni « ‹clé› ».

Signalements, chacun corrigé ou accepté avec sa raison dans `relectures/<lot>.auto.json` :

7. **mots répétés** (« centrale centrale », « de production de production »), marques d'emphase `**`, `*`, `_`
   retirées (« **sites de production** de production »), et mot de même racine collé au rendu d'une balise
   (« cuisine centrale central ») ;
8. **gloses identiques et définitions circulaires** (« un SERVICE (service) », « | **Service** | Service ou… ») ;
9. **élisions** fautives dans un rendu (« d'réception », « du usine », « ma armoire ») et **contractions** manquées
   (« de le », « de les », « à le », « à les » : « Création de le premier service ») ;
10. **déterminant en clair devant une balise de nom**, sur le texte balisé (« Le [[nom:labo]] »), collé ou séparé du nom
    par un adjectif (« un autre [[nom:labo]] ») ;
11. **appositions** : deux balises de nom collées, la seconde à apposition ;
12. **collisions de sens** : un mot du lexique H ou C écrit en clair dans l'origine (« option » en C, « préparation »
    en H). Une ligne par mot et par fiche : accepté (le sens reste clair) ou envoyé aux variantes.

---

## 11. Exemples AVANT → APRÈS, rendus par le vrai moteur

« juste » = le rendu par défaut est l'origine, octet pour octet, et les rendus des domaines sont corrects. « faux » =
à ne pas faire.

<!-- debut:table-exemples (node scripts/manuel/lib/exemples-guide.js --guide) -->
| # | Origine (source) | Balisé | Hôtellerie | Céramique | Miroir | Verdict |
|---|---|---|---|---|---|---|
| 1 | « Cet écran envoie les articles et les produits transformés (PT) du labo vers vos activités » (manuel/transferts) | `Cet écran envoie [[le:article:pl]] et [[le:pt:pl]] ([[court:pt:pl]]) [[du:labo]] vers [[votre:activite:pl]]` | Cet écran envoie les fournitures et les préparations (prépas) de la cuisine centrale vers vos services | Cet écran envoie les matières premières et les produits fabriqués (PF) du site de production vers vos points de vente | Cet écran envoie les denrées et les élaborations internes (EI) de l'usine vers vos locaux | juste : déterminants dans la balise ; sigle par la forme courte, au même nombre que le terme |
| 1 bis | « Cet écran envoie les articles et les produits transformés (PT) du labo vers vos activités » (manuel/transferts) | `Cet écran envoie [[le:article:pl]] et les [[avecCourt:pt:pl]] [[du:labo]] vers [[votre:activite:pl]]` | Cet écran envoie les fournitures et les préparations (prépas) de la cuisine centrale vers vos services | Cet écran envoie les matières premières et les produits fabriqués (PF) du site de production vers vos points de vente | Cet écran envoie les denrées et les élaborations internes (EI) de l'usine vers vos locaux | juste : même rendu que 1 : « X (SIGLE) » par avecCourt |
| 2 | « **et vers les labos qu'il alimente** » (manuel/transferts) | `**et vers [[le:labo:pl]] qu'[[acc:labo:il:elle]] alimente**` | **et vers les cuisines centrales qu'elle alimente** | **et vers les sites de production qu'il alimente** | **et vers les usines qu'elle alimente** | juste : pronom de reprise accordé au terme |
| 3 | « C'est la seule voie d'approvisionnement des activités » (base/transferts) | `C'est la seule voie d'[[nom:appro]] [[du:activite:pl]]` | C'est la seule voie d'approvisionnement des services | C'est la seule voie d'réception des points de vente | C'est la seule voie d'rentrée des locaux | **faux** : élision écrite à la main : « d'réception » en Céramique |
| 3 ter | « C'est la seule voie d'approvisionnement des activités » (base/transferts) | `C'est la seule voie [[de:appro]] [[du:activite:pl]]` | C'est la seule voie d'approvisionnement des services | C'est la seule voie de réception des points de vente | C'est la seule voie de rentrée des locaux | juste : l'élision est faite par le moteur |
| 3 quater | « C'est la seule voie d'entrée en stock, côté activité, des produits fabriqués au labo. » (manuel/lexique) | `C'est la seule voie d'entrée en [[nom:stock]], côté [[nom:activite]], des produits fabriqués [[au:labo]].` | C'est la seule voie d'entrée en stock, côté service, des produits fabriqués à la cuisine centrale. | C'est la seule voie d'entrée en stock, côté point de vente, des produits fabriqués au site de production. | C'est la seule voie d'entrée en armoire, côté local, des produits fabriqués à l'usine. | juste : « seule » s'accorde avec « voie » : rien à baliser |
| 3 bis | « le transfert est le seul moyen » (construit) | `[[le:transfert]] est le [[acc:transfert:seul:seule]] moyen` | la livraison interne est le seule moyen | la livraison interne est le seule moyen | l'expédition est le seule moyen | **faux** : « seul » s'accorde avec « moyen », pas avec le terme |
| 4 | « Dès votre première activité ou votre labo créé » (manuel/onboarding-configuration) | `Dès [[acc:activite:votre premier:votre première]] [[nom:activite]] ou [[votre:labo]] [[acc:labo:créé:créée]]` | Dès votre premier service ou votre cuisine centrale créée | Dès votre premier point de vente ou votre site de production créé | Dès votre premier local ou votre usine créée | juste : adjectif entre le déterminant et le nom : acc, puis le nom |
| 5 | « Stock Labo » (titre/stock-labo) | `[[Nom:stock]] [[Court:labo]]` | Stock Cuisine | Stock Site | Armoire Usine | juste : nom d'écran : forme courte du second nom (apposition) |
| 6 | « Stock & Appro » (partie) | `[[Nom:stock]] & [[Court:appro]]` | Stock & Appro | Stock & Réception | Armoire & Rentrée | juste : partie : écrite une fois dans parties.json |
| 7 | « - [Activités & labos](#activites) · [Mon abonnement](#abonnement) » (manuel/gerants) | `- [[[Pl:activite]] & [[pl:labo]]](#activites) · [Mon abonnement](#abonnement)` | - [Services & cuisines centrales](#activites) · [Mon abonnement](#abonnement) | - [Points de vente & sites de production](#activites) · [Mon abonnement](#abonnement) | - [Locaux & usines](#activites) · [Mon abonnement](#abonnement) | juste : libellé de lien balisé, cible jamais |
| 8 | « \| Espace Labo \| Stock du labo, production, transferts vers les activités \| » (manuel/decouvrir-labflow) | `\| [[Nom:espace_labo]] \| [[Nom:stock]] [[du:labo]], production, [[nom:transfert:pl]] vers [[le:activite:pl]] \|` | \| Espace Cuisine \| Stock de la cuisine centrale, production, livraisons internes vers les services \| | \| Espace Site \| Stock du site de production, production, livraisons internes vers les points de vente \| | \| Zone Usine \| Armoire de l'usine, production, expéditions vers les locaux \| | juste : test de R3.1.1 : « Espace Cuisine » en Hôtellerie (lexique résolu) |
| 9 | « Un transfert déplace du stock du LABO (production centrale) vers une ACTIVITÉ (point de vente). » (base/transferts) | `[[Un:transfert]] déplace [[du:stock]] [[det:labo:du]][[MAJ:labo]] (production centrale) vers [[det:activite:un]][[MAJ:activite]] ([[nom:activite_desc]]).` | Une livraison interne déplace du stock de la CUISINE CENTRALE (production centrale) vers un SERVICE (service). | Une livraison interne déplace du stock du SITE DE PRODUCTION (production centrale) vers un POINT DE VENTE (point de vente). | Une expédition déplace de l'armoire de l'USINE (production centrale) vers un LOCAL (échoppe de quartier). | juste : capitales : det collé à MAJ ; glose redite hors restauration (base : tolérée, question 5) |
| 10 | « affiche le prix de chaque supplément en DT, par unité et par mois (activité, labo, gérant) » (manuel/onboarding-avenants) | `affiche le prix de chaque supplément en DT, par unité et par mois ([[nom:activite]], [[nom:labo]], [[nom:gerant]])` | affiche le prix de chaque supplément en DT, par unité et par mois (service, cuisine centrale, responsable de service) | affiche le prix de chaque supplément en DT, par unité et par mois (point de vente, site de production, responsable de site) | affiche le prix de chaque supplément en DT, par unité et par mois (local, usine, animatrice) | juste : « supplément » tarifaire de l'abonnement : exclusion homonyme |
| 11 | « Un produit VENDABLE est vendu au client final » (base/produits-vendables-et-utilisables) | `[[Un:produit]] VENDABLE est [[acc:produit:vendu:vendue]] au client final` | Un produit VENDABLE est vendu au client final | Un produit VENDABLE est vendu au client final | Une invention VENDABLE est vendue au client final | juste : capitales partielles : le mot en capitales reste, sans exclusion ; l'accord se balise |
| 12 | « Labo central » (base-titre/labo-central) | `[[Nom:labo]][[acc:labo: central:]]` | Cuisine centrale | Site de production central | Usine | juste : adjectif DANS l'accord, féminin vide : pas de « cuisine centrale centrale » |
| 12 bis | « Labo central » (base-titre/labo-central) | `[[Nom:labo]] [[acc:labo:central:centrale]]` | Cuisine centrale centrale | Site de production central | Usine centrale | **faux** : pléonasme en Hôtellerie |
| 12 ter | « Cet écran gère le stock de votre laboratoire central » (manuel/stock-labo) | `Cet écran gère [[le:stock]] de [[votre:labo_long]][[acc:labo_long: central:]]` | Cet écran gère le stock de votre cuisine centrale | Cet écran gère le stock de votre site de production central | Cet écran gère l'armoire de votre usine centrale | juste : même astuce avec la forme longue |
| 13 | « Recette « Tarte aux fraises » (pour 1 tarte), valorisée au PMP TTC de l'activité : » (manuel/calc-cout-recette) | `[[Nom:recette]] « Tarte aux fraises » (pour 1 tarte), [[acc:recette:valorisé:valorisée]] au PMP TTC [[du:activite]] :` | Fiche de préparation « Tarte aux fraises » (pour 1 tarte), valorisée au PMP TTC du service : | Nomenclature « Tarte aux fraises » (pour 1 tarte), valorisée au PMP TTC du point de vente : | Assemblage « Tarte aux fraises » (pour 1 tarte), valorisé au PMP TTC du local : | juste : l'exemple métier reste celui de la restauration : rôle des variantes |
| 14 | « \| **Activité** \| Point de vente ou cuisine exploité par votre compte » (manuel/lexique) | `\| **[[Nom:activite]]** \| [[Nom:activite_desc]] ou cuisine [[acc:activite_desc:exploité:exploitée]] par votre compte` | \| **Service** \| Service ou cuisine exploité par votre compte | \| **Point de vente** \| Point de vente ou cuisine exploité par votre compte | \| **Local** \| Échoppe de quartier ou cuisine exploitée par votre compte | juste : l'accord suit « point de vente » (activite_desc) ; définition circulaire hors restauration (point 8, variante) |
| 14 faux | « \| **Activité** \| Point de vente ou cuisine exploité par votre compte » (manuel/lexique) | `\| **[[Nom:activite]]** \| [[Nom:activite_desc]] ou cuisine [[acc:activite:exploité:exploitée]] par votre compte` | \| **Service** \| Service ou cuisine exploité par votre compte | \| **Point de vente** \| Point de vente ou cuisine exploité par votre compte | \| **Local** \| Échoppe de quartier ou cuisine exploité par votre compte | **faux** (rendu par défaut ≠ origine) : accord sur le mauvais terme : le rendu par défaut n'est plus l'origine (« exploitée ») |
| 15 | « le stock labo » (manuel/acheteurs-ventes) | `[[le:stock]] [[compl:labo]]` | le stock de la cuisine centrale | le stock du site de production | l'armoire de l'usine | juste : apposition dans une phrase : compl |
| 15 faux | « le stock labo » (manuel/acheteurs-ventes) | `le [[nom:stock]] [[compl:labo]]` | le stock de la cuisine centrale | le stock du site de production | le armoire de l'usine | **faux** : déterminant en clair : « le armoire » en miroir |
| 16 | « les ingrédients et les produits transformés déduits » (construit) | `[[le:ingredient:pl]] et [[le:pt:pl]] déduits` | les composants et les préparations déduits | les composants et les produits fabriqués déduits | les matières et les élaborations internes déduits | juste : accord avec « et » : masculin pluriel, sans balise (un des termes est toujours masculin) |
| 16 faux | « les ingrédients et les produits transformés déduits » (construit) | `[[le:ingredient:pl]] et [[le:pt:pl]] [[acc:pt:déduits:déduites:pl]]` | les composants et les préparations déduites | les composants et les produits fabriqués déduits | les matières et les élaborations internes déduites | **faux** : « les composants et les préparations déduites » en Hôtellerie |
| 17 | « le seul labo » (construit) | `[[acc:labo:le seul:la seule]] [[nom:labo]]` | la seule cuisine centrale | le seul site de production | la seule usine | juste : adjectif entre le déterminant et le nom : acc avec le déterminant |
| 17 faux | « le seul labo » (construit) | `[[det:labo:le]]seul [[nom:labo]]` | la seul cuisine centrale | le seul site de production | l'seul usine | **faux** : det seulement collé au nom : « la seul » en Hôtellerie |
| 18 | « chaque sous-produit transformé compte pour sa portion » (manuel/calc-cout-recette) | `chaque sous-produit transformé compte pour [[son:portion]]` | chaque sous-produit transformé compte pour sa portion | chaque sous-produit transformé compte pour sa quantité par unité | chaque sous-produit transformé compte pour son échantillon | juste : « sous-produit transformé » : exclusion locution (décision 2 du client), le terme voisin reste balisé |
| 19 | « de **labos** et de **gérants** inclus » (manuel/abonnement) | `[[det:labo:de:pl]]**[[nom:labo:pl]]** et [[det:gerant:de:pl]]**[[nom:gerant:pl]]** inclus` | de **cuisines centrales** et de **responsables de service** inclus | de **sites de production** et de **responsables de site** inclus | d'**usines** et d'**animatrices** inclus | juste : déterminant devant du gras : det collé, puis le gras ; « inclus » sans balise (accord avec « et ») |
| 20 | « L'acheteur compose son panier » (manuel/acheteurs-portail) | `[[Le:acheteur]] compose son panier` | Le client professionnel compose son panier | Le revendeur compose son panier | La cliente compose son panier | juste : déterminant à majuscule en début de phrase |
| 20 faux | « L'acheteur compose son panier » (manuel/acheteurs-portail) | `L'[[nom:acheteur]] compose son panier` | L'client professionnel compose son panier | L'revendeur compose son panier | L'cliente compose son panier | **faux** : « L'client professionnel » en Hôtellerie |
| 21 | « Il permet aussi le **compte dépôt** » (manuel/acheteurs-module) | `Il permet aussi le **compte [[nom:depot]]**` | Il permet aussi le **compte dépôt** | Il permet aussi le **compte dépôt** | Il permet aussi le **compte annexe** | juste : « compte dépôt » : clé depot (R7.1.6, question 8) |
| 22 | « votre compte est en formule *Activité Basique* » (manuel/abonnement) | `votre compte est en formule *Activité Basique*` | votre compte est en formule *Activité Basique* | votre compte est en formule *Activité Basique* | votre compte est en formule *Activité Basique* | juste : nom d'offre : exclusion nom-fige « Activité Basique », pas de balise |
<!-- fin:table-exemples -->

Ce que montrent ces rendus :
- 3, 3 bis, 16 et 17 : une balise juste par défaut peut être fausse ailleurs (élision, accord). D'où les signalements 7
  à 12 et la relecture croisée.
- 9 : la glose redite est tolérée dans la base, lue seulement par le modèle. Dans le manuel, lu par le client, elle est
  corrigée ou exclue.
- 12 : le pléonasme « cuisine centrale centrale » est évité.
- 13 et 14 : la grammaire est juste, mais l'exemple (tarte) ou la définition (circulaire) restent ceux de la
  restauration. C'est le rôle des variantes.
- 20 faux : sans le déterminant à majuscule, on lit « L'client professionnel ».

---

## 12. Base de connaissances (lot L9)

- Fichiers : `balise/base/<fichier>.md` (contenu) et `.json`, au format
  `{ cle, titre balisé, exclusions, baliseur, relecteur }`. `cle` = `lower(titre)` d'origine : ne la changez pas.
- Mêmes règles que le manuel. La base n'est lue que par l'assistant (le modèle) :
  - les gloses redites y sont tolérées (question 5) : acceptées dans `relectures/L9.auto.json` ;
  - le pléonasme est évité (« Labo central », exemple 12).
- Les 32 titres rendus doivent rester distincts sans tenir compte de la casse, dans chaque domaine (contrôle `--tout`).

---

## 13. Les 47 clés du lexique

Formes par défaut, et rendus `Nom / Pl` (forme courte si différente) en H et C, lus dans `domaines.json`. Les lexiques
H et C sont des brouillons que le client corrigera : relisez vos rendus avec `controler.mjs`, ne les recopiez jamais en
clair.

<!-- debut:table-cles (node scripts/manuel/lib/exemples-guide.js --guide) -->
| Clé | Défaut : Nom / Pl | Forme courte | Genre, élision | Apposition | Hôtellerie | Céramique |
|---|---|---|---|---|---|---|
| `activite` | Activité / Activités | — | f, élision | oui | Service / Services | Point de vente / Points de vente |
| `labo` | Labo / Labos | — | m | oui | Cuisine centrale / Cuisines centrales (court : Cuisine / Cuisines) | Site de production / Sites de production (court : Site / Sites) |
| `produit_vendable` | Produit vendable / Produits vendables | — | m |  | Prestation vendue / Prestations vendues | Produit fini / Produits finis |
| `produit_utilisable` | Produit utilisable / Produits utilisables | PU / PU | m |  | Consommable / Consommables | Semi-fini / Semi-finis |
| `produit_valorise` | Produit valorisé / Produits valorisés | — | m |  | Prestation catalogue / Prestations catalogue | Produit fini catalogue / Produits finis catalogue |
| `article` | Article / Articles | — | m, élision |  | Fourniture / Fournitures | Matière première / Matières premières |
| `ingredient` | Ingrédient / Ingrédients | — | m, élision |  | Composant / Composants | Composant / Composants |
| `recette` | Recette / Recettes | — | f |  | Fiche de préparation / Fiches de préparation | Nomenclature / Nomenclatures |
| `fiche_technique` | Fiche technique / Fiches techniques | FT / FT | f |  | Fiche technique / Fiches techniques (court : FT / FT) | Fiche de coût de revient / Fiches de coût de revient (court : FCR / FCR) |
| `portion` | Portion / Portions | — | f |  | Portion / Portions | Quantité par unité / Quantités par unité |
| `food_cost` | Food cost / Food costs | — | m |  | Ratio matière / Ratios matière | Taux de coût matière / Taux de coût matière |
| `cout_matiere` | Coût matière / Coûts matière | — | m |  | Coût matière / Coûts matière | Coût matière / Coûts matière |
| `marge` | Marge / Marges | — | f |  | Marge / Marges | Marge / Marges |
| `transfert` | Transfert / Transferts | — | m |  | Livraison interne / Livraisons internes | Livraison interne / Livraisons internes |
| `appro` | Approvisionnement / Approvisionnements | Appro / Appros | m, élision |  | Approvisionnement / Approvisionnements (court : Appro / Appros) | Réception / Réceptions |
| `perte` | Perte / Pertes | — | f |  | Perte / Pertes | Perte / Pertes |
| `inventaire` | Inventaire / Inventaires | — | m, élision |  | Inventaire / Inventaires | Inventaire / Inventaires |
| `vente` | Vente / Ventes | — | f |  | Vente / Ventes | Vente / Ventes |
| `acheteur` | Acheteur / Acheteurs | — | m, élision | oui | Client professionnel / Clients professionnels | Revendeur / Revendeurs |
| `gerant` | Gérant / Gérants | — | m | oui | Responsable de service / Responsables de service | Responsable de site / Responsables de site |
| `fournisseur` | Fournisseur / Fournisseurs | — | m |  | Fournisseur / Fournisseurs | Fournisseur / Fournisseurs |
| `depot` | Dépôt / Dépôts | — | m |  | Dépôt / Dépôts | Dépôt / Dépôts |
| `pt` | Produit transformé / Produits transformés | PT / PT | m |  | Préparation / Préparations (court : Prépa / Prépas) | Produit fabriqué / Produits fabriqués (court : PF / PF) |
| `stock` | Stock / Stocks | — | m |  | Stock / Stocks | Stock / Stocks |
| `prestataire` | Prestataire / Prestataires | — | m |  | Prestataire / Prestataires | Intermédiaire / Intermédiaires |
| `supplement` | Supplément / Suppléments | — | m |  | Supplément / Suppléments | Option / Options |
| `espace_activites` | Espace Activités / Espaces Activités | — | m, élision ; dérivée de activite (gabarit) |  | Espace Services / Espaces Services | Espace Points de vente / Espaces Points de vente |
| `espace_labo` | Espace Labo / Espaces Labo | — | m, élision ; dérivée de labo (gabarit) |  | Espace Cuisine / Espaces Cuisine | Espace Site / Espaces Site |
| `espace_vente` | Espace Vente / Espaces Vente | — | m, élision ; dérivée de vente (gabarit) |  | Espace Vente / Espaces Vente | Espace Vente / Espaces Vente |
| `espace_acheteurs` | Espace Acheteurs / Espaces Acheteurs | — | m, élision ; dérivée de acheteur (gabarit) |  | Espace Clients professionnels / Espaces Clients professionnels | Espace Revendeurs / Espaces Revendeurs |
| `espace_produits` | Espace Produit / Espaces Produit | — | m, élision ; dérivée de produit (gabarit) |  | Espace Produit / Espaces Produit | Espace Produit / Espaces Produit |
| `referentiel` | Référentiel / Référentiels | — | m |  | Référentiel / Référentiels | Référentiel / Référentiels |
| `produit` | Produit / Produits | — | m |  | Produit / Produits | Produit / Produits |
| `produit_compose` | Produit composé / Produits composés | — | m |  | Produit composé / Produits composés | Produit composé / Produits composés |
| `labo_long` | Laboratoire / Laboratoires | — | m ; dérivée de labo (copie) |  | Cuisine centrale / Cuisines centrales (court : Cuisine / Cuisines) | Site de production / Sites de production (court : Site / Sites) |
| `labo_desc` | Laboratoire de production / Laboratoires de production | — | m ; dérivée de labo (copie) |  | Cuisine centrale / Cuisines centrales (court : Cuisine / Cuisines) | Site de production / Sites de production (court : Site / Sites) |
| `activite_desc` | Point de vente / Points de vente | — | m ; dérivée de activite (copie) |  | Service / Services | Point de vente / Points de vente |
| `article_ingredient` | Ingrédient / Ingrédients (« Ingrédient » cherchée sous ingredient, « Ingrédients » cherchée sous ingredient) | — | m, élision ; dérivée de article (copie) |  | Fourniture / Fournitures | Matière première / Matières premières |
| `cat_pt_utilisable` | Produits Transformés Utilisables / Produits Transformés Utilisables | — | m ; dérivée de produit_utilisable (pluriel_titre) |  | Consommables / Consommables | Semi-finis / Semi-finis |
| `cat_pt_valorise` | Produits Composés Valorisés / Produits Composés Valorisés | — | m ; dérivée de produit_valorise (pluriel_titre) |  | Prestations Catalogue / Prestations Catalogue | Produits Finis Catalogue / Produits Finis Catalogue |
| `cat_pt_vendable` | Produits Transformés Vendables / Produits Transformés Vendables | — | m ; dérivée de produit_vendable (pluriel_titre) |  | Prestations Vendues / Prestations Vendues | Produits Finis / Produits Finis |
| `transfert_abr` | Transf. / Transf. | Trf / Trf | m ; dérivée de transfert (copie) |  | Livraison interne / Livraisons internes | Livraison interne / Livraisons internes |
| `supplement_abr` | Suppl. / Suppl. | — | m ; dérivée de supplement (copie) |  | Suppl. / Suppl. | Option / Options |
| `pt_abr` | Prod. Transformé / Prod. Transformés | — | m ; dérivée de pt (copie) |  | Préparation / Préparations (court : Prépa / Prépas) | Produit fabriqué / Produits fabriqués (court : PF / PF) |
| `produit_utilisable_abr` | Produit util. / Produits util. | — | m ; dérivée de produit_utilisable (copie) |  | Consommable / Consommables | Semi-fini / Semi-finis |
| `produit_vendable_abr` | P. Vendable / P. Vendables | — | m ; dérivée de produit_vendable (copie) |  | Prestation vendue / Prestations vendues | Produit fini / Produits finis |
| `produit_valorise_abr` | P. Valorisé / P. Valorisés | — | m ; dérivée de produit_valorise (copie) |  | Prestation catalogue / Prestations catalogue | Produit fini catalogue / Produits finis catalogue |
<!-- fin:table-cles -->

---

## 14. Variantes (lots V-H1, V-H2, V-C1, V-C2 ; spec §8)

- **Base de travail** : le texte commun BALISÉ de la fiche (`balise/manuel/<slug>.md`, après la vague 1). S'y ajoutent
  le lexique, les composants et la description du domaine, lus dans `domaines.json`.
- **Structure** : la même que la fiche commune. Mêmes titres de section, mêmes liens `#slug`, mêmes blocs, longueur
  comparable. On remplace ce qui raconte la restauration : métiers, exemples, définitions du lexique. Le lexique de A à
  Z de la variante est écrit et trié dans les mots du domaine, sans définition circulaire.
- **Les termes du lexique restent balisés** dans la variante : une correction du lexique par le client y passera sans
  réécriture. Le contrôle refuse une forme du lexique DU DOMAINE écrite en clair. Les mots du métier hors lexique
  s'écrivent en clair.
- **Fichiers** :
  - `variantes/<domaine>/<slug>.md` (contenu) ;
  - `.json` : `{ titre: null (titre commun) ou titre balisé, baseMd5, exclusions }`. `baseMd5` = md5 du
    `balise/manuel/<slug>.md` contre lequel la variante est écrite ; si ce fichier change, la variante est relue et son
    `baseMd5` mis à jour.
  - `mots_cles` reste `null`.
- **Pas de règle nouvelle** : une variante change les mots et les exemples, jamais le fonctionnement de LabFlow. Elle
  peut reformuler, y compris les phrases à verbe.
- **Contrôle** : `controler.mjs --variante <domaine> <slug>`. Il fait les points 2 à 12, dans le domaine seulement,
  sans point 1. Il refuse en plus :
  - un caractère que le PDF changerait en « ? » ;
  - un titre égal à un autre titre rendu du manuel.

  Il donne aussi le rapport « mots du métier ».
- **Livraison** : statut `brouillon`. Le client valide dans l'admin.

---

## 15. Relectures et besoins : formats

`relectures/<lot>.auto.json` (le baliseur) : signalements 7 à 12 acceptés.

```json
[
  { "fiche": "stock-labo", "point": 7, "domaine": "ceramique",
    "texte": "sites de production de production",
    "decision": "accepté", "raison": "la grammaire ne peut pas l'éviter (spec §7.5, §10.3)" }
]
```

`relectures/<lot>.json` (le relecteur, seul) :

```json
[
  { "fiche": "transferts", "phrase": "…", "domaine": "hotellerie", "probleme": "…",
    "correction": "…", "etat": "ouvert" }
]
```

`etat` vaut `ouvert`, `corrigé`, `accepté` ou `refusé`. Une ligne qui reste ouverte porte sa raison, pour
l'intégrateur.

`besoins/<lot>.json` (le baliseur ; clos par l'intégrateur) :

```json
[
  { "id": "L6-1", "fiche": "stock-labo", "besoin": "…", "proposition": "…", "etat": "OUVERT" }
]
```

`etat` final : `APPLIQUÉ`, `REFUSÉ`, `REPORTÉ`, `SANS OBJET` ou `DÉCISION CLIENT`. Il ne reste aucun besoin `OUVERT` à
la fin de la vague.
