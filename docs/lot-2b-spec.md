# Lot 2b — Spécification v2 : le vocabulaire du domaine dans ce que produit le serveur

Références : `docs/lot-2-spec.md` (v2, source de vérité du lot 2 : moteur, balises, outil, invariants I1 à I6), `C:\Users\CHAHDONj\labflow-reprise\REPRISE.md` §3, §4 et §8.

Historique :
- **v1 (02/10/2026)**, écrite à partir de la cartographie du même jour : 7 lecteurs et 1 critique de complétude, `C:\Users\CHAHDONj\labflow-reprise\lot-2b\carto-*.md`.
- **v2 (02/10/2026)**, après 4 relectures contradictoires contre le code (`labflow-reprise/lot-2b/crit-*.md`) : 3 bloquants et 62 importants ou mineurs, tous intégrés. Puis un contrôle indépendant de la v2 : 20 corrections appliquées (v2.1). Les changements de fond par rapport à la v1 :
  - `pdfTexte` devient une option, jamais appliquée à la facture acheteur ni à la facture d'abonnement ;
  - « Base acheteurs » est rendu par une table fermée ;
  - colonne `elision` ajoutée à la migration 192 ;
  - la description de recherche de l'assistant est reportée au 2c, et le type `reformulation` est abandonné ;
  - règle des formes `Nom` / `Court` / `court` ;
  - « article » au sens générique ;
  - oracle : non-vacuité, sites d'appel réels, écarts attendus explicites ;
  - E3 et E4 réécrites ;
  - vagues définies et fichiers partagés confiés à l'intégrateur ;
  - liste de déploiement complétée.
- **v2.2 (02/10/2026)**, après les relectures du socle (S1 + S2) : 3 importants et 10 mineurs corrigés. Les amendements, marqués « (v2.2) » dans le texte :
  - §5.4 : l'invalidation du profil après une création à la volée passe par `invaliderProfilApresCommit(resultat)`, appelée par les 6 sites après leur COMMIT ;
  - §4.2 : `entreeComposant` lit `elision: 'auto'` comme « déduite » ; nouvelle aide `entreeComposantVoc(voc, c)` (table identité) pour les déterminants ;
  - §5.1 : sortie explicite `res.locals.vocabBrut` ; une clé inconnue est rendue « ‹clé› » ;
  - §5.5 et §11.1.4 : le guillemet droit « " » d'un nom saisi devient « - » dans le nom de fichier ; l'oracle le prouve (§2.3) ;
  - §2.4, §2.6 et §11.2.2 : l'oracle capte `config.composants` de l'abonnement et compare l'ordre des clés (I9) ;
  - §6.5 : forme en phrase de « base acheteurs » ;
  - §3.2 E3 (46 constantes depuis S1), §5.4 (`/^l'/.test(voc.le(k))`), §7.4 (écart `deplacement`), §12.4 (`test-bot-onboarding`), §13.4 et §13.6 (contrôle du genre après bascule).
- **v2.3 (02/10) : état final après balayage.** Écrite à la consolidation (étape C), d'après le code de `feat/lot-2b-serveur` (backend `ca4a01b`, frontend `9d37e07`), les besoins des lots (`scripts/vocab-besoins/`) et les écarts admis. Elle décrit ce qui a été fait là où le travail s'est écarté de la lettre de la v2.2, avec sa raison ; aucune décision n'est changée. Les amendements sont marqués « (v2.3) » :
  - §2.4, §2.7, §7.1, §7.3 : glossaire rendu par `voc.avec(entrée résolue)` (aucune clé non littérale), 3ᵉ argument `profil` de `buildSystemPrompt`, mesure en Hôtellerie et en Céramique ;
  - §2.5, §2.6 : exceptions « extrait », glossaire retiré du scan, comptes finaux des exceptions et des écarts ;
  - §3.1 : `_global.json` à 8 entrées ; §3.2 : `CHAMPS.md` lu en résiduels (E1), mesure E3 figée à 46, `TYPES_ALLOW` à 14 types (E8) ;
  - §1 et §12 : besoins clos par leur champ `etat` (0 besoin ouvert) ;
  - §5.1, §5.4, §5.5 : sites finals de `res.locals.vocabBrut`, `invaliderProfilApresCommit`, `ongletSur` ; §4.2 : `entreeComposantVoc` ;
  - §8.1, §10.2 : décisions laissées au client (`perteLabel`, deux libellés sans accent, une élision, l'email d'avenant), code inchangé.

**Les numéros de ligne sont ceux de `bfb590a`** (sauf ceux des amendements (v2.3), qui sont ceux de la branche après la vague 2). Les rapports de cartographie citent `339e5c4` : seul `ventesController.js` diffère, d'une à quinze lignes.

Têtes de départ : backend `develop` = `bfb590a`, frontend `develop` = `71d3430`. Branche `feat/lot-2b-serveur` dans les deux dépôts. Prochaine migration libre : **192**. Pré-requis de l'étape D : les deux correctifs de sécurité du 02/10 (`develop` = `bfb590a`, `main` = `6f6b15b`) sont poussés. À vérifier par `git rev-parse origin/main`.

## 0. But, invariants, ce que le serveur produit

**But.** Un compte hors restauration ne lit plus aucun mot de la restauration dans ce que le serveur produit. Un compte restauration ne voit rien changer, au caractère près, hors écarts listés au §11.

**Invariants.** Ceux du lot 2 restent en vigueur : I1 identité restauration, I2 aucun renommage technique, I3 une seule grammaire, I4 admin en vocabulaire LabFlow, I5 migrations neuves et idempotentes, I6 **vocabulaire du compte DESTINATAIRE**. S'y ajoutent :
- **I7 — Jamais de balise hors d'un point de rendu.** Une balise `[[…]]` n'est écrite que dans un littéral qui atteint un point de rendu de la liste fermée du §3.2 (E2). Partout ailleurs, on écrit des appels `voc`. On n'écrit jamais de balise :
  - en base, dans un email, un PDF, un classeur, le prompt de l'assistant ;
  - dans `src/routes/*.js` ;
  - dans un champ JSON autre que `message`.
- **I8 — Jamais de vocabulaire dans le SQL.** Pas d'appel `voc`, pas de balise, pas de terme interpolé. Le libellé passe en paramètre `$n` ou devient un code stable traduit en JS (§6.1).
- **I9 — La forme de l'API ne change pas.** Mêmes champs, mêmes types. Un libellé rendu reste une chaîne au même endroit. Seule exception : un champ AJOUTÉ, s'il est listé au §11.2. Un ancien écran fonctionne donc pendant la bascule, serveur d'abord.

**Liste fermée des sorties texte du serveur.** Elle sert à l'oracle et à la preuve « aucun mot de la restauration ».

| # | Sortie | Où | Lot |
|---|---|---|---|
| 1 | champ `message` des réponses JSON, et `erreurs[].message` | 212 `message:` à terme, 94 textes, 24 fichiers ; 26 erreurs levées à terme (6 fichiers) ; tables `CODES`, `LIBELLES`, `push(code, message)`, `messageSupplement` | socle (middleware et `auth.js`), puis B3 à B5 |
| 2 | JSON de données porteurs de libellés | tableau de bord v2 (6 libellés), marqueur « (labo) » (7 sites), « Produits composés (labo) », « Sous-produit » (2, locution), catégories PT (valeur par défaut, traduite à l'écran) | B3, B4 |
| 3 | classeurs Excel | 15 sites, 16 points d'entrée, 18 `addWorksheet` | B1, B3, B4, B5 |
| 4 | PDF | facture d'appro, avenant « legacy », contrat en aperçu ou régénéré (valeurs seulement) | B2 |
| 5 | emails | 5 fonctions à terme, 12 appels | socle (plomberie), puis B2 |
| 6 | assistant | prompt, 15 outils, résultats d'outils, ligne de contexte, guide de mise en route, accueil Messenger, rapport Excel | B1 |
| 7 | textes écrits en base puis relus, et leur copie SSE | 3 notifications, 1 motif d'annulation, composants « identité » | B4, B5, socle |

Ce qui n'existe pas, vérifié : aucune page HTML servie en production, aucune redirection, aucune tâche planifiée qui écrit un texte (3 minuteries, aucun texte), aucune réponse publique à terme.

**Hors lot 2b.**
- Manuel et base de connaissances (2c), y compris `manuelController.listPublic`, la recherche de l'assistant et la description de son outil de recherche (§7.2).
- Texte fixe des contrats et modèle DocuSeal (lot 3).
- Facture acheteur et facture d'abonnement : inchangées à l'octet près.
- Espace admin et boss (I4).
- Documentation Swagger.
- Noms de fichiers téléchargés (I2).
- Clés JSON, codes et routes (I2).
- Données saisies, et seed du compte de démonstration.

## 1. Ordre de travail

| Étape | Contenu | Sortie |
|---|---|---|
| **O** | Oracle, capturé AVANT toute modification (§2) | référence commitée + liste de travail hors restauration |
| **S0** | Outil de preuve et références (§3) | outil étendu, tests découplés, écarts du 2a archivés, `scripts/vocab-lots.mjs` du serveur |
| **S1** | Moteur et lexique, extension unique puis regel (§4) | modules générés, 4 clés dérivées, `entreeComposant`, `libelleComposant`, validation |
| **S2** | Socle serveur (§5) | rendu au bord et messages de `auth.js`, plomberie `voc`, migration 192, assainisseurs, factorisation SQL, codes d'erreur, `/auth/me` allégé, guide des agents |
| **Vague 1** | B3a, B3b, B4, B5 en parallèle (§10), puis intégrateur | messages, Excel, tableaux de bord, textes persistés |
| **Vague 2** | B1, B2, B6 en parallèle, puis intégrateur | assistant, documents et emails, écrans |
| **C** | Consolidation : besoins, écarts provisoires ramenés à 0 | (v2.3) chaque besoin porte son état final dans son champ `etat` (`APPLIQUÉ`, `REFUSÉ`, `REPORTÉ`, `SANS OBJET`, `DÉCISION CLIENT`) ; l'outil ne compte que les besoins sans état final (`compterBesoins`, `ETAT_BESOIN_CLOS`) : 0 ouvert ; 0 `provisoire` ; spec à jour |
| **V** | Vérification, trois revues contradictoires, corrections, contrôle final (§12) | |
| **D** | Fusion `--no-ff` dans `develop` puis `main`, serveur d'abord (§13) | |

**Livraison.** Une seule mise en production, à la fin. Mais chaque étape et chaque vague laissent la branche **déployable** : oracle restauration identique hors §11, `npm test` vert, `npm run build` vert. Si un arrêt est décidé, la branche peut partir en production au dernier point de restauration de l'intégrateur.

**Tête mouvante.** Toute fusion dans `develop` pendant le lot entraîne, avant la vague suivante :
- la fusion dans `feat/lot-2b-serveur` ;
- le réépinglage de `scripts/vocab-check.base` ;
- un nouveau compte des résiduels ;
- si la fusion touche une sortie de la liste fermée : une nouvelle capture de la référence de l'oracle sur la tête de `develop`, avant toute capture « après ». Elle se fait dans un `git worktree` de `develop`, avec les scripts de l'oracle copiés depuis la branche.

## 2. Oracle (étape O)

### 2.1 Principe
On capture les sorties du serveur sur des comptes éphémères, AVANT toute modification. La même capture rejouée après chaque étape doit être identique pour les domaines par défaut, hors écarts attendus listés EXPLICITEMENT (§2.6). Un second mode cherche les formes par défaut dans les sorties d'un compte hors restauration (§2.5).

**Règle de non-vacuité.** Chaque clé de capture porte un compte d'éléments, écrit dans la référence. `check-invariant-vocab.js` échoue si une clé est vide ou si son compte diffère de la référence. Une capture vide avant et vide après n'est jamais une preuve.

**Qui le lance.** L'intégrateur seulement, jamais un agent de balayage. Il sait qu'un passage applique les migrations en attente à la base locale (`app.js` les lance au chargement).

### 2.2 Fichiers et environnement
- `scripts/lib/bouchons-test.js` est extrait de `scripts/start-test-backend.js`, qui l'appelle ensuite **à comportement identique**. Option « capture », posée AVANT dotenv et avant tout `require` de l'application :
  - fausse `RESEND_API_KEY` NON vide (sinon 9 fonctions sortent avant l'appel d'envoi, sans rien transmettre au bouchon) ;
  - `APP_URL`, `APP_NAME`, `FROM_EMAIL`, `TZ` fixés ; toutes les variables `PRESTATAIRE_*` et `FACTURE_*` fixées ;
  - `resend` remplacé par `Module._load` : `emails.send` POUSSE `{ to, subject, html, attachments }` dans un tableau ;
  - DocuSeal factice : `DOCUSEAL_URL=http://docuseal.oracle.invalid`, `DOCUSEAL_API_TOKEN=oracle`, `DOCUSEAL_TEMPLATE_ID=1`, `DOCUSEAL_TEMPLATE_AVENANT_ID=2`, `DOCUSEAL_TEMPLATE_RESILIATION_ID=3`, `DOCUSEAL_PDF_FLOW` absent (flux template), secret de webhook de test ;
  - Gemini factice : `GEMINI_API_KEY=oracle` ;
  - `fetch` bouchonné. Hôte DocuSeal : réponses fixes (`[{ submission_id: 1, slug: 'oracle' }]`), corps CAPTÉ. Hôte Gemini : réponse fixe sans appel d'outil, corps CAPTÉ (instruction système et outils). Tout autre hôte refusé ; réseau sortant bloqué ;
  - `sseService.pushTo` et `pushToAdmins` remplacés par des fonctions qui captent puis appellent l'original. Les contrôleurs les lisent par décomposition au chargement : le remplacement précède `require('src/app')` ;
  - `abonnementController.enforcerStatuts` remplacé par une fonction vide ;
  - base locale exigée ;
  - contrôle final : aucun `node_modules/resend` dans `require.cache`, sinon arrêt.
  - (v2.3) état final du bouchon : `http` / `https` (`.request`, `.get`) et toute connexion TCP/TLS directe (`net.Socket.prototype.connect`) sont refusés comme `fetch` ; les variables « retirées » (`DOCUSEAL_PDF_FLOW`, `FACTURE_STRICT`, `GROQ_API_KEY`, `TELEGRAM_BOT_TOKEN`, `MESSENGER_*`) sont posées VIDES, car une variable supprimée serait rechargée du `.env` par `dotenv` ; la capture s'arrête si l'une d'elles est non vide.
- `scripts/capture-vocab-baseline.js` charge l'application DANS son processus (port dédié, attente de `/health`). Il refuse de démarrer entre 00:45 et 01:15 (job quotidien de 01:00) et, (v2.3), en janvier : les données de l'oracle s'écrivent sur le mois précédent, qui serait d'un autre exercice. Il se termine par `process.exit` dans un `finally`, après nettoyage, car les minuteries de `app.js` et le pool garderaient le processus ouvert. Il écrit dans son compte rendu la dernière migration appliquée.
  - HTTP pour les exports, les tableaux de bord, le guide, les messages, les emails des sites d'appel et le webhook DocuSeal : ce sont les mêmes middlewares que la production, rendu au bord compris.
  - Appel direct pour les fonctions pures : prompt, outils, ligne de contexte, emails à jeux fixes, PDF, valeurs du contrat, rapport de l'assistant.
- `scripts/check-invariant-vocab.js` compare la capture courante à la référence (`--domaine restauration` par défaut). Avec `--domaine hotellerie|ceramique|miroir`, il cherche les formes par défaut (§2.5).
- Sorties, dans `scripts/vocab-baseline/` :
  - `restauration.json` : la référence, commitée ;
  - `ecarts-restauration-attendus.json` (§2.6) ;
  - `exceptions-hors-restauration.json` (§2.5) ;
  - `ordre-libre.json` (§2.4) ;
  - `hors-restauration-avant.json` : la liste de travail.
- **Un processus par domaine** : le limiteur de connexion (20 par 15 minutes, magasin en mémoire) repart de zéro à chaque processus. Sinon, jetons signés en interne pour tout, sauf les connexions de la capture `auth` et de `messages`.

### 2.3 Comptes et données
- Comptes créés par l'API admin (`POST /admin/clients`, avec `domaineId`, `formuleActivites` et `composants`), par un super_admin temporaire à mot de passe aléatoire. Les compteurs `nb_*` ne s'écrivent que par `applyComposants` : jamais en SQL. Nettoyage par `DELETE /admin/clients/:id` dans un `finally`, et purge par motif d'email au démarrage.
- **Deux passes de création** par domaine, car les deux branches de `clientsController.create` s'excluent pour un même compte. La configuration DocuSeal est relue à chaque appel : la passe 2 retire `DOCUSEAL_API_TOKEN` de `process.env`, puis le remet.
  - passe 1, DocuSeal configuré : corps de soumission et email de signature (`:475`) ;
  - passe 2, DocuSeal non configuré : email de bienvenue (`:484`) et PDF « legacy ».

  Les envois faits en tâche de fond sont attendus : on lit quand le tableau de captures est stable depuis 500 ms, puis on trie par destinataire et sujet.
- Par domaine, 3 comptes :
  - **A** : une activité seule, avec `crees < attendu` pour chaque type souscrit, pour que les questions « Comment créer … ? » existent ;
  - **B** : 2 activités, 1 labo, 1 labo enfant, 1 gérant. Jeu de données de `labflow-reprise/lot-2/parcours-2a/setup-compte.cjs`, transposé dans le dépôt :
    - référentiel, appros ;
    - transfert labo→labo et labo→activité ;
    - PT utilisable et vendable, produit composé ;
    - prix, vente directe et vente prestataire sans prestataire ;
    - perte en activité et en labo ;
    - inventaire en activité et en labo, saisi par le gérant : notification ;
    - charges ;
    - une catégorie de produit de chacun des 3 types ;
  - **C** : dépôt + acheteurs : 0 activité, 1 labo, palier 10.
    - 1 PT vendable du labo, avec prix acheteur ;
    - 1 acheteur avec email, nommé avec un caractère hors Windows-1252 (« Épicerie نور ») ;
    - 1 commande de 2 lignes avec remise, puis sa facture acheteur ;
    - puis suppression de l'acheteur avec une commande en attente : motif persisté.
- **Branche « repli » du guide** (`onboardingEtat.js:125-131`) : compte A' créé par l'API, puis `DELETE FROM abonnement_config_composants WHERE abonnement_id = …` (validé), capture, puis `DELETE /admin/clients/:id`. `check-invariant-config.js` reste à 0 écart après le passage.
- **Données sans égalité.** Quantités, prix et dates sont tous distincts, d'après une table de valeurs fixes du script : aucune égalité entre deux lignes triées ou regroupées.
- Noms saisis sans mot du lexique par défaut, sans double espace, sans espace en 31ᵉ position. S'y ajoutent un labo nommé avec « / » et une activité nommée avec « — », pour prouver les assainisseurs (§5.5). (v2.2) La 2ᵉ activité du compte B porte un guillemet droit (« Étages "Nord" ») : Latin-1, admis par Node dans un en-tête, mais il fermerait `filename="…"` ; `nomFichierSur` le remplace (§11.1.4).
- **Domaines** :
  - `restauration` : identité ;
  - `hotellerie` ;
  - `ceramique` : base locale seulement ;
  - `miroir` : domaine de test créé par l'oracle, supprimé à la fin. Il porte le lexique miroir de `scripts/vocab-lexiques-test.json` (front). `article_ingredient` y a déjà une forme propre (« Provision », contre « Denrée » pour `article`) ; les 4 clés `*_abr` en reçoivent une après S1 (§4.5). Sans forme propre, un mauvais choix de clé reste invisible. Ses composants ont des libellés neutres.
- **Composants identité créés à la volée** : dans `miroir` SEULEMENT, on supprime ses composants de type `gerant` avant de créer un compte avec `{ code: 'gerant', nb: 1 }`.
- **Webhook DocuSeal** : `POST` signé avec le secret de test, dans `miroir`. Il couvre `applyComposants` en mode `add`, la notification et l'email de bienvenue.

### 2.4 Captures (clés du JSON)
- `prompt` : `buildSystemPrompt` sur une ligne fixe, horloge figée autour de l'appel. (v2.3) Appelé sans profil (`buildSystemPrompt(ligne, voc)`) : jamais de glossaire dans cette clé, qui reste celle de la référence. Le glossaire est capté par `promptReel` seulement (besoin B1[1] refusé : une clé `C.prompt.avecGlossaire` ajouterait une clé à la référence sans rien prouver de plus).
- `promptReel` : `chatWithAI(clientId de B, …)`, corps capté par le bouchon Gemini. Il prouve que `chatWithAI` passe `vocabForClient`, glossaire compris.
- `outils` : JSON des 15 outils.
- `resultatsOutils` : les 12 outils de données sur B, appelés par `executeToolCall` SANS `voc`, pour prouver son repli. Dont `get_transferts` vers un labo et `get_ventes` avec un prestataire nul, avec chacun des filtres `canaux`, `prestataires`, `catProduits`, `typesProduit`.
- `recherches` : 5 questions fixes de `search_knowledge_base` (créer un labo, transfert vers une activité, calcul du food cost, inventaire de fin de mois, inviter un acheteur).
- `contexte` : ligne de contexte des 3 comptes, cache vidé.
- `guide` : `computeOnboardingEtat`, `onboardingPromptBlock`, et `GET /api/ai-assistant/onboarding` pour A, B, C et A'.
- `accueilMessenger` : `texteAccueilMessenger(nom)` (§2.7).
- `emails` :
  - **jeux fixes** : les 5 fonctions à terme appelées directement, avec `voc` passé en CLÉ de l'objet d'arguments (ignorée avant le lot) ;
    - invitation × 3 rôles ;
    - signature contrat, avenant (1 et 2 de chaque, palier), résiliation ;
    - avenant (tous postes, labos 0, gérants 0, promo, note admin, acheteurs seuls) ;
    - rapport ; Messenger ;
    - les 7 emails sans terme, comme preuve qu'ils ne bougent pas ;
  - **sites d'appel réels**, par leur route HTTP, chacun des 12 appels du §5.6, avec un super_admin pour les routes admin : invitation de gérant, création, import et renvoi d'invitation d'acheteur, renvoi d'invitation admin, confirmation d'invitation, demande d'avenant du client, traitement de la demande, invitation Messenger. Le rapport n'a pas de route : il passe par `executeToolCall(clientId de B, 'send_report', {})`, sans `voc`. En mode hors restauration (`miroir`), cela prouve I6 sur la plomberie et pas seulement sur le texte.
- `pdf` : chaînes passées à `PDFDocument.prototype.text` et métadonnées (`doc.info`), par document.
  - Contrat et avenant du flux PDF (`buildContratDocument` avec composants identité et composants Hôtellerie, avec et sans palier ; `buildAvenantDocument`) ; résiliation.
  - PDF « legacy » `generateAvenantPdf` et `generateContratPdf`.
  - Facture d'appro : manuel avec et sans fournisseur, transfert vers activité, transfert labo→labo.
  - Facture acheteur avec remise et acheteur hors Windows-1252 (compte C), et facture d'abonnement : elles doivent rester IDENTIQUES.
- `valeursContrat` : `avenantExtraFields`, `buildContractPricingFields`, et corps `POST /api/submissions` capté.
- `exports` : pour chacun des 16 points d'entrée, noms d'onglets, **toutes** les lignes (`cell.text`, cellules fusionnées dédoublonnées) et `Content-Disposition`. Paramètres d'appel : `carto-excel.md` §2.8.
- `rapportIA` : les 4 feuilles de la pièce jointe et l'email (`generateAndSendReport` avec le bouchon).
- `tableauxDeBord` : JSON de `GET /api/dashboard/v2` pour chaque onglet, sans filtre, puis avec un seul type de perte, une catégorie et un article. Plus les routes v1 encore servies.
- `donneesLibelles` :
  - `GET /api/labo/:laboId/pt/:produitId/recipe` et `GET /api/stock/pt/:produitId/recipe` ;
  - `GET /api/articles-valorises` ;
  - historiques qui renvoient `categorie_nom` ;
  - catalogue du portail.
- `persistes` :
  - `notifications` du client et charges SSE captées, après l'inventaire du gérant et la commande de l'acheteur ;
  - motif d'annulation et historique de statut après la suppression de l'acheteur ;
  - composants identité créés à la volée (`miroir`).
- `messages` : statut + corps, au moins 16 appels.
  - `GET /api/labo/999999` (404) ; `PUT /api/entreprise/activites/999999` (404) ; `DELETE /api/acheteurs/999999` (404) ; `GET /api/articles/999999` (404) ;
  - `POST /api/labo` avec un nom pris (409) ; création de labo au-delà du quota (409 `LIMITE_ATTEINTE`) ;
  - gérant sans affectation (400) ; écriture par un gérant (403) ; module acheteurs absent sur A (403) ;
  - suppression d'une catégorie qui a des articles (409, pluriel dynamique) ; transfert d'un labo vers lui-même (400) ; annulation d'une commande acheteur (200) ;
  - `POST /api/produits/:id/ingredients` avec portion 0, puis sans `ingredientId` (`errors[].msg`) ; import de fournisseurs en double (`details[].error`) ; connexion erronée.
- `auth` : corps de `/auth/login` et `/auth/me` pour client, gérant et acheteur ; `GET /api/domaines` et `GET /api/entreprise` ; (v2.2) `GET /api/abonnements/mon-abonnement` du client B, qui porte `config.composants` (§11.2.2).

**Comparaison et ordre.** Pour un tableau issu d'une requête sans `ORDER BY`, et pour les lignes d'un export, on compare la liste ordonnée. Un écart d'ordre SEUL (même multi-ensemble) est signalé à part, « ordre seul ». Il n'est admis que si la requête figure dans `ordre-libre.json` ET :
- soit elle n'a pas d'`ORDER BY` à la référence ;
- soit l'entrée porte une `cleTri` : le contrôle ne réordonne alors que les groupes contigus d'ex aequo sur cette clé, et seulement si la suite des rangs de tri (`meta.rangsTri`, relevée avant masquage) est identique à la référence. Toute autre permutation reste « ordre seul, non admis ».

**Masquage** :
- dates, heures et durées (motifs de `parcours-2a/lib.cjs:47-59`), mois en lettres (`\b(?:janvier|…|décembre)\s+\d{4}\b`), `\b\d{4}-\d{2}\b` ;
- ids (ligne de contexte, URL, champs `id`, `#\d+\b`) ;
- jetons d'invitation ;
- références `\b(?:CTR|AVN?|RES|FA|BL|BC)-[\w-]+` ;
- contenus base64 retirés, empreinte gardée.

**Ordre des clés (v2.2).** Deux objets comparés doivent garder la même suite de clés COMMUNES (I9 : « mêmes champs »). Une permutation est un écart de type `ordre-cles` (`avant` et `apres` = les deux suites), admis seulement par une entrée explicite qui porte ce type (§2.6). Une clé ajoutée ou retirée reste un écart de valeur (« ⟨absent⟩ »).

Ne jamais comparer d'octets de PDF ou de classeur. La référence et chaque passage de contrôle sont lancés le même mois civil ; sinon, la référence est recapturée sur la tête de `develop`.

**Déterminisme.** La capture est lancée DEUX FOIS avant d'être commitée ; les deux résultats doivent être identiques. L'horloge n'est figée qu'autour des appels purs, jamais dans le serveur : `CURRENT_DATE` de PostgreSQL, limiteur, jetons.

### 2.5 Mode « hors restauration »
`check-invariant-vocab.js --domaine X` refait les captures, puis :
1. **Formes cherchées F(X).** Pour chaque clé de `LEXIQUE_CLES` du moteur courant et chaque forme `Nom`, `Pl`, `Court(sg)`, `Court(pl)` : si le rendu dans X diffère du défaut, la forme par défaut entre dans F(X). On retire de F(X) toute forme que X rend aussi, pour une clé quelconque (comparaison sans casse). Un sigle (2 à 4 capitales ou chiffres) se cherche en respectant la casse ; un mot, sans casse, avec les accents.
2. **Données.** Avant toute recherche, chaque nom saisi par l'oracle et chaque libellé de composant POSÉ PAR L'ORACLE (liste écrite dans le script, jamais relue en base) est remplacé par `⟦d⟧`, du plus long au plus court. Les libellés écrits par le serveur (création à la volée, webhook) ne sont jamais masqués : `persistes` les compare à l'attendu exact `voc.Nom('gerant')` / `voc.Pl('gerant')` du miroir.
3. **Par sortie** :
   - JSON de données (`tableauxDeBord`, `donneesLibelles`, `resultatsOutils`, `auth`, `persistes`) : on ignore les clés. On ignore une valeur de forme code : `^[a-z0-9_\-./:#?=&]+$`, ou entière en capitales `^[A-Z0-9_]{2,}$`. Une clé d'objet qui contient une espace ou une capitale est traitée comme une valeur ;
   - `messages` : `message`, `erreurs[].message`, `errors[].msg`, `details[].error`, sans exclusion de forme ;
   - classeurs : chaque cellule et chaque nom d'onglet, sans exclusion de forme (« PT » affiché compte) ;
   - emails : sujet, et texte visible du HTML (balises, attributs et URL retirés, entités décodées) ;
   - PDF : chaînes de `text` et `doc.info` ;
   - outils : `description` des outils et des paramètres ; prompt et glossaire ;
   - captures `emails` des sites d'appel et `promptReel`.
4. **Recherche** : motif `(?<![\p{L}\p{N}_])forme(?![\p{L}\p{N}_])`, par la fonction `formesDans(texte, formes)` de l'outil (E11).
5. **Exceptions** : une entrée de `exceptions-hors-restauration.json` vise `{ cle, chemin (motif), texte exact, type, justification }`. Types : `lot-3`, `2c`, `fiscal`, `formule`, `non-repliable`, `nom-de-fichier`, `code-api`, `donnee`, `locution`, `homonyme`, `admin`. Une entrée sans emploi est signalée.
   - (v2.3) **Extrait.** Un prompt est UN texte : une exception par forme l'éteindrait en entier. Une entrée `extrait: true` retire seulement son `texte`, un passage exact, avant la recherche. Emploi : l'« article » générique du prompt (§6.5, `aiService.js`), type `homonyme`.
   - (v2.3) **Glossaire.** Le bloc « ## Vocabulaire du compte » (§7.3) est retiré du texte lu de `prompt` et `promptReel` : sa colonne de gauche est la forme de LabFlow par définition. Seule sa colonne de droite (à droite de « → », ou entre « = » et la parenthèse finale d'une ligne d'unités) est cherchée, sous le chemin `…/glossaire/droite`.
   - (v2.3) Le texte fixe des contrats prend le type `lot-3` (le type `reporte` n'existe qu'aux écarts admis de l'outil). La mention du signataire prestataire « Pour LabFlow Oracle — Le Gérant Oracle » est une `donnee` de l'environnement de l'oracle (`PRESTATAIRE_SIGNATAIRE`), pas le gérant du lexique.
   - (v2.3) État final : 108 exceptions (`2c` 32, `homonyme` 29, `code-api` 15, `lot-3` 13, `donnee` 7, `locution` 5, `fiscal` 3, `formule` 2, `non-repliable` 2). Les messages à « article » générique de `acheteurVentesController.js` et `portailController.js` (§6.5) n'en reçoivent pas : l'oracle ne les capte pas (une exception sans emploi ferait échouer le contrôle).
6. **Recherche des mots hors lexique** : `restaurant|restauration|plat|menu|chef|couverts|carte|métiers de bouche|food`, sans casse, dans les mêmes textes. Les résultats sont relus et classés en exception typée ou corrigés.

Attendu à la fin du lot : 0 hors exceptions.

**Le scan est lancé AUSSI à l'étape O.** Son résultat est la liste de travail des vagues, chiffrée par famille : `hors-restauration-avant.json`. À l'étape O, le lexique n'a pas encore les 4 clés `*_abr` ; cette liste est donc déclarée incomplète pour les abréviations. Le scan est relancé après S1 pour la compléter.

### 2.6 Écarts restauration attendus
`scripts/vocab-baseline/ecarts-restauration-attendus.json` : une entrée par écart admis, `{ cle, chemin, avant, apres, raison: '§11.1.n' | '§11.2.n' }`, plus `type: 'ordre-cles'` pour une permutation de clés (§2.4, v2.2). `check-invariant-vocab.js` échoue sur un écart non listé, ET sur une entrée sans emploi. On n'y met jamais de masquage en bloc. Il est tenu par l'intégrateur (§10.4). (v2.3) État final : 109 entrées. `§11.2.2` 62 (`auth`, `genre` / `elision` des composants), `§11.2.1` 10 (`auth`, `lexique: null`), `§11.1.7` 21 et `§11.1.4` 13 (`exports`), `§11.1.2` 2 et `§11.1.1` 1 (`pdf` : avenant legacy, factures d'appro de transfert). Aucune donnée de l'oracle restauration n'est hors Windows-1252 dans un document où `pdfTexte` s'applique : le cas « ? » du §11.1.2 n'y a pas d'écart.

### 2.7 Deux exports neutres, et signatures cibles
Dans le commit de l'oracle :
- `buildContractPricingFields` (`clientsController.js:28`) est ajouté aux exports ;
- le texte d'accueil de `messengerService.js:128-139` est extrait en fonction pure exportée `texteAccueilMessenger(nom)`, appelée au même endroit.

Preuve de neutralité : `vocab-check identite` donne 0 écart sur ces deux fichiers.

**Signatures cibles.** Le script de capture est écrit dès l'étape O pour les signatures FINALES. Il les détecte et retombe sur l'ancienne forme tant qu'elles n'existent pas :

| Fonction | Forme finale | Repli avant le lot |
|---|---|---|
| outils | `toolsFor(voc)` | `TOOLS_OPENAI` |
| prompt | `buildSystemPrompt(ligne, voc)` ; (v2.3) forme finale `buildSystemPrompt(ligne, voc, profil = null)`, 3ᵉ argument facultatif réservé au glossaire (§7.3), que la capture `prompt` n'emploie pas | `buildSystemPrompt(ligne)` (2ᵉ argument ignoré) |
| guide | `onboardingPromptBlock(etat, voc)` | idem |
| contexte | `getClientContextLine(id, voc)` | idem |
| Messenger | `texteAccueilMessenger(nom, voc)` | idem |
| emails | `voc` en clé de l'objet d'arguments | ignorée |
| facture d'appro | `buildFactureApproPdf(f, lignes, voc)` | idem |
| avenant legacy | `generateAvenantPdf(données, voc)` | idem |
| contrat | `buildContratDocument({ …, voc })`, `buildAvenantDocument({ …, voc })`, `avenantExtraFields({ …, voc })` | clé ignorée |
| valeurs du contrat | `buildContractPricingFields(pricing, domaineNom, voc)` | 3ᵉ argument ignoré |
| contrat legacy | `generateContratPdf(données, voc)` | idem |

Un lot qui change une autre signature appelée par l'oracle l'écrit dans ses `besoins`. L'intégrateur met le script à jour.

(v2.3) Autres signatures finales : `executeToolCall(clientId, nom, input, voc?)`, qui retombe sur `vocabForClient(clientId)` sans `voc` (la capture l'appelle sans) ; nouvel export `aiService.glossaireVocabulaire(voc, profil)` ; `TOOLS_OPENAI` et `TOOLS_ANTHROPIC` ne sont plus exportés (la capture détecte `toolsFor`).

## 3. Outil de preuve et références (étape S0)

### 3.1 Références et écarts du 2a
- **Découpler la base de l'outil des preuves « avant lot 2 ».**
  - Cinq lecteurs de `scripts/vocab-check.base` y cherchent le code d'avant le lot 2 : backend `test/vocab.test.js:36-43`, `test/authVoc.test.js:262-267`, `scripts/test-vocabulaire-domaine.js:67-73` ; frontend `scripts/vocab.test.mjs:28-33`, `scripts/controle-avenant.mjs:23`.
  - Ils lisent désormais un fichier dédié `scripts/vocab-reference-lot2` : backend `13d99d0` ; frontend `af60301`. `af60301` est imposé par `controle-avenant.mjs` : avec `0cce3bf`, 3 jeux sur 5 échouent (mesuré).
  - `vocab-check.base` ne sert plus qu'à l'outil.
  - Sans ce découplage, la base réépinglée donne 2 échecs à `npm test`, 1 échec à `vocab.test.mjs`, un échec à `test-vocabulaire-domaine.js:151`, et un `controle-avenant.mjs` qui réussit à vide.
- **Commit de la base réépinglée** : backend `bfb590a`, frontend `71d3430`, ou leur successeur (§1).
- **Archiver les écarts admis du 2a** dans `scripts/vocab-allow/archives-2a/`, que l'outil ne lit pas.
  - Backend : `S3.json` (88 entrées, toutes « sans objet »).
  - Frontend : `S1.json`, `S5.json`, et les entrées des `F*.json` dont le mode, explicite ou déduit (`vocab-check.mjs:1440`), est `identite`.
  - Les entrées de mode `residuels` ET `accords` des `F*.json` restent.
  - Contrôle : `identite`, `residuels` et `accords` à 0 au front après l'archivage.
  - Raison : une entrée `avant: null` sans objet absorbe en silence un nouveau littéral identique (mesuré, code de sortie 0).
- **Nouveaux fichiers d'écarts admis** : backend `scripts/vocab-allow/{socle,B1,B2,B3a,B3b,B4,B5}.json` et `_global.json` ; frontend `B6.json`.
  - Le `_global.json` du backend reprend celles des entrées globales du front qui valent pour le serveur : prix de vente, type de vente, canal de vente, sous-produit, Activité Basique / Premium (`formule`), domaine d'activité, « Indiquez au moins un supplément » (supplément tarifaire, `formule`).
  - (v2.3) État final : **8 entrées**, celles qui servent au serveur : « prix de vente », « canal de vente », « sous-produit », « Sous-produit » (`locution`) ; « Activité Premium », « Indiquez au moins un supplément » (`formule`) ; « Domaine d'activité », « domaine d'activité » (`homonyme`). « type de vente » et « Activité Basique » n'ont aucune unité au serveur : une entrée sans objet n'est pas gardée.
  - Un agent qui a besoin d'une entrée globale l'écrit dans ses `besoins` : seul l'intégrateur écrit `_global.json`.
- **Répartition** : `fiche-technique-backend/scripts/vocab-lots.mjs`, sur le modèle du front, est la source de la répartition du §10. Il donne les fichiers d'un lot et leur charge, mesurée par le mode `residuels` plus les unités hors outil déclarées. Il sort en erreur si un fichier à résidus est dans 0 ou 2 lots.

### 3.2 Extensions de `scripts/vocab-check.mjs` (frontend)
- **E1 — Périmètre serveur.** Avec `--root` sur le backend, `docuseal-templates/generate.js` est lu en plus de `src/` : parcours, `git ls-tree`, `git diff`, `ls-files`. Ses unités attendues : texte fixe du contrat (entrées `reporte` lot 3), données d'exemple de la ligne de commande (`generate.js:1246-1289`, entrées `homonyme`), facture d'appro (à traduire), facture acheteur (entrées `fiscal`).

  (v2.3) `docuseal-templates/CHAMPS.md` (lot B2) n'est pas du code : le mode `identite` ignore un fichier nommé qui n'est pas du code et le signale (« pas du code, ignoré par identite ») ; le mode `residuels` le lit, avec ou sans liste de fichiers (`RESIDUELS_EN_PLUS`). Ses unités sont admises par des entrées `reporte` (lot 3) et `discriminant` de `B2.json`. Le seul changement de B2 dans ce fichier (« lot 2 » → « lot 3 », §8.2) se lit au `git diff`.
- **E2 — R8 restreint au serveur (I7).** Dans un `.js` du backend, une balise n'est rendue que si elle se trouve à un **point de rendu** ; partout ailleurs, c'est l'erreur « balise sans rendu », qu'aucun écart admis n'éteint. Points de rendu :
  - la propriété `message` d'un objet littéral passé DIRECTEMENT à `res.json(…)` ou `res.status(…).json(…)`, ou poussé dans un tableau nommé `erreurs` ;
  - l'argument de message d'une construction d'erreur : `new Error(m)` (argument 1), `new TransfertError(status, code, m)` (argument 3), `new UniteError(code, m)` (argument 2). Ce n'est **jamais** un point de rendu dans `src/routes/*.js`, ni dans un `body().custom(…)` d'express-validator : leur texte part dans `errors[].msg`, qui n'est pas rendu ;
  - le 2ᵉ argument d'un appel `rendre(voc, m)` ;
  - les points déclarés dans `<root>/scripts/vocab-rendu.json`, liste fermée tenue par le socle. Schéma : `{ fichier, genre: 'argument' | 'valeurs-objet' | 'retours-fonction', nom, argument?, cles? }`. Au départ :
    - `push(code, message)` de `configComposantsService.js` (argument 2) ;
    - valeurs de la table `CODES` de `unitesOperationnellesService.js` ;
    - valeurs `sg` et `pl` de `LIBELLES` de `quotaService.js` ;
    - littéraux de retour de `messageSupplement` (`produitsController.js`).

  **Chemin.** Un littéral est à un point de rendu s'il en est la valeur, ou fait partie de la valeur, à travers ces seuls nœuds : parenthèses, branches d'un ternaire, `||` / `??`, concaténation `+`, gabarit (morceaux et trous). Une variable locale `const` compte aussi comme point de rendu si son unique initialiseur est un tel littéral (ou un ternaire de littéraux) et si TOUS ses emplois sont des trous d'un point de rendu (cas `cible`, `transfertService.js:174`).

  **Relais vers l'assistant.** `executeToolCall` rend `err.message` avec son `voc` avant de le renvoyer au modèle : `{ error: rendre(voc, err.message) }`. Ce relais est déclaré dans `vocab-rendu.json`.

  Tests qui doivent ÉCHOUER : balise dans un nom d'onglet, dans un en-tête Excel, dans le HTML d'un email, dans `src/routes/produits.js`, dans `details: [{ message }]`.
- **E3 — Résiduels et SQL.** Les constantes d'une unité SQL sont lues par un lexeur. Il saute les commentaires `--` (jusqu'à la fin de ligne) et `/* … */`, et lit `''` comme une apostrophe ; il accepte une constante qui contient un trou. Est un CODE :
  - une constante de la forme `[a-z0-9_]+` ;
  - OU une constante de la liste fermée des codes en capitales : `'PT'` au départ. Tout ajout passe par la spec.

  Les autres constantes sont jugées comme des textes. Mesure attendue à `bfb590a` : 44 constantes-libellés PORTANT UN TERME du lexique (lexique à 43 clés), dans 22 requêtes (et 18 `'PT'` codes dans 15 requêtes) ; un test fige ce compte sur la copie de référence. (v2.2) 46 depuis S1 : les clés `produit_vendable_abr` et `produit_valorise_abr` reconnaissent « P. Vendable / » et « P. Valorisé / » de `dashboardV2Controller.js` ; requêtes et `'PT'` inchangés. (v2.3) État final : le test « E3 — mesure figée sur la copie de référence du serveur » de `vocab-check.test.mjs` vaut 22 requêtes, 46 constantes-libellés et 18 `'PT'`. Les 13 fragments SQL qui ne commencent pas par un mot-clé (`facturesController.js:43-56`, `stockUtils.js:75-76`…) sont des résidus admis (`discriminant`).
- **E4 — Identité et SQL.** Une unité SQL est comparée par TROIS multi-ensembles, chacun avec la référence du même fichier :
  1. ses constantes-libellés (rendues), versées dans le multi-ensemble du fichier avec les autres textes ;
  2. ses constantes-codes, comparées à part : un code ajouté, retiré ou changé est un écart, admis seulement par une entrée `discriminant` ;
  3. son squelette : le texte SQL où chaque constante devient `'⟦c⟧'` et chaque `$n` devient `$⟦n⟧`, blancs normalisés, `${ptCategorieSql(x)}` développé avec le texte de `stockUtils.js` lu AU MÊME commit. Un squelette changé n'est pas une erreur : c'est une ligne « requête modifiée, à relire » du rapport, avec le diff. L'intégrateur relit chacune.

  Les arguments littéraux de `ptCategorieSql`, de `ptTypeSql` et les alias (`'p'`, `'pp'`) font partie de l'unité SQL, pas d'unités à part. Un libellé déplacé du SQL vers le JS ne s'annule que s'il reste une unité JS entière de même texte ; sinon, entrée `deplacement`. Les 9 factorisations du §5.3 doivent sortir sans aucune ligne « à relire » : c'est leur preuve.
- **E5 — Exclusions du profil serveur.** En mode résiduels :
  - `src/config/swagger.js` et le titre Swagger de `src/app.js` ;
  - les fichiers entièrement admin, exclus par chemin : `bossController.js`, `adminRapportsController.js`, `adminSiteController.js` ;
  - les noms de champs d'express-validator (`body('portion')`) ;
  - correction de l'ambiguïté `router.delete` / `Set.delete`.
- **E6 — Modules générés.** `categoriesPt.ts`, `excel.ts` et `composants.ts` entrent dans `src/utils/vocab.js`, déjà exclu et déjà contrôlé par le mode `lexique`.
- **E7 — `vocab-accords.txt` du serveur** : écrit dans `fiche-technique-backend/scripts/` et commité. Seul l'intégrateur le régénère : un agent passe toujours ses fichiers, et le fichier n'est réécrit que sans liste. La règle « `git checkout -- scripts/vocab-accords.txt` avant de changer de branche » vaut aussi au serveur.
- **E8 — Types d'écarts admis**, trois de plus (`fiscal` s'ajoute pour la facture acheteur de `generate.js`, E1) :
  - `reporte` : texte laissé pour un lot ultérieur, avec le champ `lot` obligatoire (`3` ou `2c`). Il remplace `provisoire`, qui doit finir à 0, pour le texte fixe du contrat et l'outil de recherche ;
  - `admin` : texte lu seulement par un super_admin ou le boss (I4), dans un fichier mixte. Justification obligatoire : la route et son garde (`requireSuperAdmin`, `requireBoss`) ;
  - `fiscal` : texte d'un document fiscal promis identique à l'octet près (facture acheteur, facture d'abonnement).

  (v2.3) État final de `TYPES_ALLOW` : **14 types**, les 11 du lot 2 (`homonyme`, `formule`, `locution`, `verbe`, `exemple`, `discriminant`, `deplacement`, `non-repliable`, `apostrophe`, `faute-corrigee`, `provisoire`) et les 3 ci-dessus. `provisoire` reste accepté, à 0 entrée.
- **E9 — Accords.** `ACCORDS_APRES` reçoit 8 formes : élevé, détecté, bon, récent, confirmé, autorisé, référencé, réintégré. Les 6 autres formes relevées y sont déjà.
- **E11 — `formesDans(texte, formes)`**, exportée, sur le motif de `motEntier` (`vocab-check.mjs:196-197`) : elle cherche une liste de formes donnée, là où `termesDans` cherche toujours toutes les formes du lexique par défaut. Elle sert au mode hors restauration de l'oracle (§2.5).
- **E10 — Tests de l'outil** (`scripts/vocab-check.test.mjs`) : cas serveur positifs et négatifs pour E1 à E9 et E11. Les idiomes non reconnus sont interdits au guide : `(req.voc ?? vocabDefaut).Nom(…)` et `req['voc']`. On écrit `const voc = req.voc ?? vocabDefaut;`.
- Points ouverts du 2a laissés ouverts, faute de besoin mesuré au serveur : jetons `> 1` / `>= 2` ; balise `accN` ; casse `court` en balise. Un agent qui en a besoin l'écrit dans ses `besoins`, et la consolidation tranche.

## 4. Moteur et lexique : extension unique, puis regel (étape S1)

Tout se fait dans la source frontend `src/vocab/`. Le backend est régénéré par `node scripts/sync-vocab-back.mjs`. La procédure du 2a s'applique : vecteurs écrits à la main, génération, copie des vecteurs et du fichier des lexiques de test vers le backend, tests des deux dépôts, puis `node scripts/vocab-check.mjs lexique --geler`.

1. **Modules générés au serveur** : `categoriesPt.ts` (`libelleCategoriePt`) et `excel.ts` (`nomOnglet`) rejoignent `MODULES` de `sync-vocab-back.mjs` et l'objet exporté de `src/utils/vocab.js`. Contrôles du générateur : `nomOnglet('History') === 'Feuille'`, et les 5 libellés PT par défaut rendus à l'identique.
2. **`src/vocab/composants.ts`**, généré aussi.
   - `entreeComposant(c)` renvoie :

     ```js
     {
       sg: c.libelle,
       pl: c.libellePluriel || c.libelle,
       g: c.genre === 'f' ? 'f' : 'm',
       el: typeof c.elision === 'boolean' ? c.elision : /^[aeiouàâäæéèêëîïôöœùûü]/i.test(c.libelle),
     }
     ```

     Elle accepte aussi les noms de colonnes `libelle_pluriel`. Un `elision` qui n'est pas un booléen (nul, absent, ou `'auto'`, le synonyme admis par l'admin et qu'un aperçu d'écran peut porter avant l'enregistrement, v2.2) vaut « déduite » : `y` et `h` donnent non. L'admin la force pour un h muet (« Huilerie » : `elision` = vrai donne « mon huilerie ») ou pour un cas que la règle rate.
   - (v2.2) `entreeComposantVoc(voc, c)` : l'entrée d'un composant DANS LE VOCABULAIRE DU COMPTE, pour un déterminant (`voc.avec(entreeComposantVoc(voc, c)).mon('_', n)`). Même table fermée que `libelleComposant` : un composant identité au libellé du brouillon prend le TERME (`Nom`, `Pl`, genre `voc.acc(k, 'm', 'f')`, élision `/^l'/.test(voc.le(k))` ; « Base acheteurs » : `Base ${voc.court('acheteur', true)}`, féminin) ; tout autre composant, `entreeComposant(c)`. Par défaut, même rendu que `entreeComposant(c)` pour les 4 composants identité tels que la 192 les laisse. Sans elle, « mon activité » resterait écrit hors restauration pour un domaine créé par l'admin (composants identité « Activité / Labo »). (v2.3) Écrite telle quelle dans `src/vocab/composants.ts` et générée au serveur ; employée par le guide de mise en route (`onboardingEtat.js`, §7.4).
   - `libelleComposant(voc, c, n, casse)` : si `c.code === c.typeTechnique` ET si le libellé stocké est celui du brouillon identité, on prend le rendu identité, table fermée :

     | Type | Rendu |
     |---|---|
     | `activite` | `voc[casse]('activite', n)` (si libellé « Activité » / « Activités ») |
     | `labo` | `voc[casse]('labo', n)` (si « Labo » / « Labos ») |
     | `gerant` | `voc[casse]('gerant', n)` (si « Gérant » / « Gérants ») |
     | `acheteurs` | `` `Base ${voc.court('acheteur', true)}` ``, invariable, même texte que `MonAbonnementPage.tsx:18` (si « Base acheteurs ») |

     Tout autre cas, composant identité renommé par l'admin compris → libellé du composant. Même règle au serveur et à l'écran.
   - Vecteurs : les 4 composants identité rendent EXACTEMENT `libelle` et `libelle_pluriel` avec le vocabulaire par défaut.
3. **Quatre clés dérivées, mode `copie`**, sur le modèle de `transfert_abr`. Elles remplacent des abréviations écrites en dur au serveur et à l'écran.

| Clé | Parent | Défaut sg / pl | Hôtellerie | Céramique | Emplois |
|---|---|---|---|---|---|
| `pt_abr` | `pt` | Prod. Transformé / Prod. Transformés | Préparation | Produit fabriqué | type d'appro `'produit_transforme'` (`laboController.js:1941`, `stockController.js:915`) |
| `produit_utilisable_abr` | `produit_utilisable` | Produit util. / Produits util. | Consommable(s) | Semi-fini(s) | en-tête « Produits util. » (`produitsController.js:1595`) |
| `produit_vendable_abr` | `produit_vendable` | P. Vendable / P. Vendables | Prestation vendue | Produit fini | préfixe « P. Vendable / » (`dashboardV2Controller.js:362`, `ClientDashboard.tsx:249`) |
| `produit_valorise_abr` | `produit_valorise` | P. Valorisé / P. Valorisés | Prestation catalogue | Produit fini catalogue | préfixe « P. Valorisé / » (mêmes sites) |

   - On ne pose PAS de forme courte sur une clé existante : elle ferait basculer `estDefaut` sur un ancien écran pendant la bascule, alors qu'une clé EN PLUS ne compte pas (règle du 2a).
   - Le lexique passe de 43 à **47 clés**.
   - L'onglet Lexique de l'admin reçoit leurs 4 libellés dans `LEXIQUE_LABELS` (`AdminDomaineEditPage.tsx:29-73`) : c'est B6 qui les écrit (§10.2). Le placement sous le parent est générique.
4. **Validation du lexique** (`src/utils/lexiqueValidation.js` ; le refus à la saisie dans l'onglet Lexique de l'admin est fait par B6) : `<` et `>` sont refusés dans `sg`, `pl`, `court` et `icon` (`LEXIQUE_CARACTERE_INTERDIT`).
   - Les termes sont ainsi sûrs dans le HTML des emails, sans fonction d'échappement autour des appels `voc` : un appel enveloppé fait un écart d'identité (mesuré). `&` et `"` restent admis. Règle : un terme ne va jamais dans un attribut HTML.
   - Écart assumé à la décision 6 de REPRISE §4 (« échapper les termes en HTML ») et à la spec lot 2 §1.4 : refuser deux caractères à la saisie est plus sûr qu'un échappement que l'outil de preuve ne sait pas suivre.
   - Une valeur existante qui en contient est corrigée avant le déploiement (§13).
5. **Vecteurs et tests** :
   - vecteurs des 4 clés (défaut, Hôtellerie, Céramique, miroir) ;
   - vecteurs de `entreeComposant` : Cuisine f ; Atelier m avec élision ; Housekeeping m sans élision ; Huilerie f avec `elision` vrai ; Hôtel m ; Yaourterie f ; pluriel absent ;
   - vecteurs de `libelleComposant` (les 4 composants identité, et un identité renommé) ;
   - vecteurs de `nomOnglet` et de `libelleCategoriePt` ;
   - le lexique miroir (`scripts/vocab-lexiques-test.json` et sa copie backend) reçoit les 4 clés `*_abr`, chacune avec une forme propre, différente de son parent (`article_ingredient` en a déjà une) ;
   - tests à mettre à jour : backend `test/vocab.test.js:191` (43 → 47) ; front `scripts/vocab.test.mjs:163-168` (liste des clés), `:195-213` (table `DERIVEES`), `:360` (le miroir porte toutes les clés).

   Puis regel. Le scan hors restauration est relancé (§2.5).

## 5. Socle serveur (étape S2)

### 5.1 Rendu au bord des messages
- Nouveau module `src/middleware/rendreMessages.js`, monté **en premier** dans `app.js`, juste après `app.set('trust proxy', 1)`. Il enveloppe ainsi `cors`, les analyseurs, `/api/public`, le garde d'écriture, `/auth`, les webhooks, la 404, le gestionnaire d'erreurs, et les limiteurs (`res.send(objet)` passe par `res.json`).
- Il remplace `res.json` pour chaque requête et lit `req.voc` **au moment de l'appel**. Il rend avec `req.voc || vocabDefaut` :
  - `body.message` (chaîne) ;
  - `body.erreurs[].message` (chaînes).

  Rien d'autre : ni `errors` (deux sens : tableau express-validator et compteur d'import), ni `details`, `warnings`, `detail`, `reply`, ni les tableaux.
- **Copie, jamais modification.** `{ ...body, message }`. Des corps sont partagés entre requêtes (`REPONSE_INVALIDE`, `publicSiteController.js:9`). Sans balise, le MÊME objet est renvoyé : mêmes octets.
- Tous les statuts, 2xx compris (« Commande annulée — le stock a été réintégré » est un 200 affiché).
- Une balise de syntaxe invalide reste telle quelle et n'est signalée qu'une fois par processus (ensemble borné à 500 entrées). (v2.4) Au-delà de 500 balises distinctes, l'ensemble est vidé et les signalements reprennent : la mémoire est bornée, pas le volume du journal. Accepté : un message n'interpole qu'une vingtaine de noms saisis au plus, et les seuls messages qui portent un code venu de la requête (`configComposantsService.js`, erreurs de composition) sont sur des routes admin. (v2.2) Une balise bien formée dont la CLÉ est inconnue (`[[nom:xyz]]`) n'est pas laissée telle quelle : le moteur la rend « ‹xyz› » et la signale par son propre ensemble, borné lui aussi à 500.
- **Sortie explicite (v2.2).** Une route dont le `message` est une DONNÉE saisie pose `res.locals.vocabBrut = true` avant de répondre : le corps part tel quel. Seul cas : `PUT /admin/site/demandes-acces/:id` (`adminSiteController.updateDemandeAcces`), qui renvoie le message d'un visiteur du site public (seule colonne `message` en base, migration 173). (v2.3) État final : ce seul site pose `res.locals.vocabBrut = true` (`adminSiteController.js:154`), lu par `rendreMessages.js`.
- **Données interpolées** (nom de produit, libellé) : le message est rendu après l'interpolation. Une donnée de la forme exacte d'une balise valide serait donc rendue (« ‹clé› » si la clé est inconnue). Accepté par écrit : 0 cas en base, conséquence cosmétique. (v2.4) Ce « 0 cas » n'est mesuré qu'en local : la lecture (6) de `controle-avant-192` (§13.2) le confirme en production avant la bascule. Un `message` qui EST une donnée prend la sortie explicite.
- **Vocabulaire.** Le lecteur d'une réponse HTTP est celui qui a fait la requête : `req.voc` respecte I6 sans requête de plus.
  - Admin et boss : défaut, par le rôle.
  - Gérant : domaine du compte parent. Acheteur : domaine du vendeur.
  - Route publique et 401 d'`authenticate` : défaut. Le seul 401 à terme, « Compte acheteur désactivé » (`auth.js:109`), est toujours masqué par l'intercepteur de l'écran : on ne déplace pas `req.voc`.
- **`middleware/auth.js` est balisé au socle** (9 messages). Il est importé par l'application et par les tests ; un agent ne doit pas l'avoir à moitié écrit pendant une vague.
- Test unitaire `test/rendreMessages.test.js` :
  - objet partagé intact après deux rendus avec deux vocabulaires ;
  - même objet sans balise ;
  - tableau, `Buffer`, `null` ou `message` non chaîne inchangés ;
  - `erreurs[].message` rendu ;
  - défaut sans `req.voc` ;
  - signalement dédoublonné.

### 5.2 Erreurs comparées par leur texte
Le serveur relit 5 fois `err.message` : `produitsController.js:1086`, `:1089`, `:1222` ; `exportController.js:301`, `:304`. Baliser `'Produit introuvable'` ferait passer un 404 à 500. Avant tout balisage :
- les 4 `throw` concernés (`produitsController.js:824`, `:833`, `:1099`, `:1103`) reçoivent un `code` : `PRODUIT_INTROUVABLE` ou `REFERENCE_CIRCULAIRE` ;
- les 5 comparaisons lisent ce code. Statuts et corps restent identiques (vérifié par lecture).

Règle générale : **un texte balisé n'est jamais comparé.** Contrôle : `\.message\s*(===|!==|\.includes|\.startsWith|\.match)` sur `src/` ne rend plus que des comparaisons sans balise possible.

### 5.3 Factorisation des catégories PT
Les 9 `CASE` recopiés (`dashboardController.js:514` ; `inventaireController.js:705`, `:775`, `:882`, `:972` ; `laboController.js:1304`, `:2315` ; `ventesController.js:1120`, `:1423`) deviennent `(SELECT ${ptCategorieSql('pp')} FROM produits pp WHERE pp.id = …)`.
- La chaîne SQL est identique au caractère près. Preuve : E4, aucun squelette « à relire ».
- La valeur de l'API reste le libellé par défaut (décision du 2a). La traduction se fait à l'écran, ou à l'écriture Excel (§6.3).

### 5.4 Migration 192 et composants
`migrations/192_composants_genre_elision.sql`, idempotente :
- `ALTER TABLE domaine_composants ADD COLUMN IF NOT EXISTS genre VARCHAR(1) NOT NULL DEFAULT 'm'`, avec `CHECK (genre IN ('m','f'))` posé dans un bloc `DO` ;
- `ADD COLUMN IF NOT EXISTS elision BOOLEAN NULL` (NULL = déduite) ;
- `genre = 'f'` pour :
  - `code = 'activite'` et `libelle = 'Activité'`, tous domaines ;
  - `code = 'acheteurs'` et `libelle = 'Base acheteurs'`, tous domaines ;
  - `code = 'cuisine'` et `libelle = 'Cuisine'`, domaine `hotellerie`.

  Garde : seulement si `code`, `type_technique` et `libelle` sont ceux du brouillon. Un composant renommé par l'admin n'est pas touché : son genre se pose ensuite dans l'admin (§13). Céramique est absent de la production : ses 6 composants sont masculins.

Code :
- `domaineProfilService.js` :
  - `COMPOSANTS_IDENTITE` porte le genre (activite f, labo m, gerant m, acheteurs f) ;
  - `mapComposant` lit `genre` et `elision` ;
  - ses 12 unités résiduelles (constantes de type, libellés par défaut de l'admin) reçoivent des entrées `admin` ou `discriminant` dans `socle.json`.
- `domainesController.js` :
  - `validateComposant` refuse, en 400 : un genre hors `m`/`f`, une élision hors `true` / `false` / `null` / `'auto'` (`'auto'` = `null` = déduite), les caractères `[ ] |` dans libellé et pluriel ;
  - l'upsert écrit `genre = COALESCE($g, domaine_composants.genre)` à la mise à jour et `COALESCE($g, 'm')` à l'insertion. Pour l'élision, il reçoit `$e` (`true`, `false` ou `null`) et `$p` = `'elision' in c` : mise à jour `elision = CASE WHEN $p::boolean THEN $e::boolean ELSE domaine_composants.elision END`, insertion `$e::boolean`. Un ancien onglet admin, ou un payload de test, n'envoie pas ces champs et ne remet rien à zéro. B6 envoie toujours le champ. Test : un PUT sans `elision` garde la valeur ; un PUT avec `null` revient à « déduite » ;
  - la création d'un domaine pose le genre des 4 composants identité.
- `configComposantsService.js` :
  - `creerComposantIdentite` lit le profil du domaine par `getProfil(domaineId)`, dans la fonction, et LÈVE si le domaine est illisible : la transaction est annulée, et on n'écrit jamais en base un libellé de repli. Elle est atteinte par le webhook DocuSeal et par des requêtes admin, donc pas de `voc` de l'appelant ;
  - libellés : `voc.Nom(k)` / `voc.Pl(k)` ; « Base » + `voc.court('acheteur', true)` pour les acheteurs ;
  - genre et élision viennent du TERME du domaine : `genre = voc.acc(k, 'm', 'f')`, `elision = /^l'/.test(voc.le(k))` pour `activite`, `labo` et `gerant` (v2.2 : jamais une méthode de chaîne sur un appel `voc`, idiome que l'outil ne suit pas) ; `'f'` et `null` pour `acheteurs`. `COMPOSANTS_IDENTITE` ne sert qu'aux libellés par défaut (création d'un domaine, migration 192). Vecteur : en Hôtellerie, « mon service », « ma cuisine centrale » ;
  - après le COMMIT, l'appelant oublie le profil du domaine en cache (v2.2) : `applyComposants` renvoie `identitesCreees` (un composant identité a été créé) et `domaineId` ; chacun des 6 sites appelle `invaliderProfilApresCommit(resultat)` juste après SON COMMIT, jamais avant (un chargement concurrent remettrait en cache le profil sans la ligne) : `abonnementController` (`createAbonnement`, mise à jour de la configuration, module acheteurs), `clientsController.update`, `supportController.traiter`, webhook DocuSeal. Au mieux, jamais d'exception. Sans cela, pendant 60 s, `/auth/me`, `GET /api/domaines`, `GET /api/entreprise` et le guide omettent le composant créé (domaines sans composant identité seulement). Tests : faux pool (`test/socle-composants.test.js`) et lecture des sources (chaque appelant invalide après un COMMIT). (v2.3) Sites finals : `abonnementController.js:526`, `:1696`, `:2013`, `clientsController.js:613`, `supportController.js:391`, `webhookController.js:91` ;
  - le chemin virtuel `creer: false` (`:174-176`) calcule le MÊME libellé, genre et élision, pour que l'aperçu dise ce que la création écrira ;
  - `listComposantsConfig` lit `genre` et `elision`.
- `onboardingEtat.js:230` et `:257` : `genre` et `elision` dans le SELECT explicite et le mapping.
- Test : « ma cuisine » en Hôtellerie (§12). Sans lui, un oubli de colonne ramènerait « mon cuisine » sans bruit.

### 5.5 Assainisseurs de noms
Nouveau module `src/utils/excelNoms.js` :
- `ongletSur(wb, texte)` = `nomOnglet(texte)`, puis un suffixe « 2 », « 3 »… tenu dans 31 caractères si le nom existe déjà dans le classeur, sans tenir compte de la casse (ExcelJS lève sinon).
  - Employé par les 17 `addWorksheet` qui portent un terme ou un nom saisi (§6.3). (v2.3) État final : 17 appels `addWorksheet(ongletSur(wb, …))` dans 11 fichiers (dont la fonction des 4 feuilles du rapport de l'assistant, `reportService.js`) ; `nomOnglet` n'est plus appelé que par `ongletSur`. Le 18ᵉ `addWorksheet`, « Historique Config Prix » (`ventesController.js`), sans terme ni nom saisi, reste direct.
  - `nomOnglet` REMPLACE les caractères interdits par une espace (la spec lot 2 §4 disait « retire »).
  - Écart accepté : un onglet qui contient un nom saisi peut perdre une espace finale ou un double blanc (donnée, pas texte, §11.1).
- `nomFichierSur(nom)` remplace par `-` les SEULS caractères que Node refuse dans un en-tête (hors `\t\x20-\x7E\x80-\xFF`), et le `"`, que Node admet mais qui fermerait `filename="…"` (changement visible en restauration, listé au §11.1.4, v2.2). Tout autre caractère reste tel quel. Ce n'est PAS la règle de `facturesController.js:286`, qui reste inchangée (I2).
  - Test : « Labo Central », « Café & Co », « Resto N°1 » ressortent à l'identique ; « Dar Yasmine — Salon » donne « Dar Yasmine - Salon » ; « Le "Gourmet" » donne « Le -Gourmet- ».
  - Employé par les 4 `Content-Disposition` à nom saisi : `inventaireController.js:932`, `:1022` ; `laboController.js:1974`, `:2395`. Le 5ᵉ, `pertesController.js:748`, est un en-tête mort, écrasé par `:446`, et c'est lui qui lève l'erreur : il est supprimé.

### 5.6 Plomberie `voc` entre lots
Seuls les appels qui traversent deux lots sont faits au socle. Le texte, lui, est traduit par le lot propriétaire.
- **Emails.** Les 5 fonctions à terme reçoivent `voc` comme **clé de leur objet d'arguments**. Sans elle, la fonction écrit `console.error('[email] voc manquant', <fonction>)` et rend avec `vocabDefaut` : un email n'est jamais perdu. Plusieurs appels avalent le rejet (`.catch`). Contrôle statique au socle : chaque appel des 5 fonctions dans `src/` porte une clé `voc` (test `test/emailVoc.test.js`, par lecture des sources). Un appel à objet tout fait s'écrit avec la clé visible : `sendInviteEmail({ ...inv, voc })` (`acheteursController.js:172`, `:347`, `:509`). Les 12 appels passent le vocabulaire du DESTINATAIRE :

| Appel | Vocabulaire |
|---|---|
| `gerantController.js:159`, `acheteursController.js:172`, `:347`, `:509`, `supportController.js:249` | `req.voc` |
| `authController.js:487` (`resendInvite`, admin) | `vocabPourUtilisateur(userId)` (nouveau, `vocabCompte.js`) : client ou gérant → `vocabForClient(id)` ; acheteur → `vocabForClient(acheteurs.client_id)` ; sinon défaut |
| `abonnementController.js:1426` (`confirmInvite`, admin) | `vocabForClient(clientId)` |
| `clientsController.js:475` (création, admin) | `vocabDuDomaine(domaineId)` du compte créé. `profil` n'existe plus hors du `try` ; le profil est en cache, donc aucune requête de plus |
| `clientsController.js:747` (résiliation) | défaut, à écrire en commentaire : le compte est supprimé AVANT l'envoi, et cette variante n'a aucun terme |
| `supportController.js:475` (`traiter`, admin) | `sendAvenantEmail({ to, ...pdfData, pdfBase64, voc })`, avec `voc = await vocabForClient(demande.client_id)` |
| `reportService.js:166` | `voc` calculé par `generateAndSendReport` : `vocabForClient(clientId)` |
| `aiAssistantController.js:118` (admin) | `vocabForClient(clientId)` |

- **Purge de l'assistant.** `oublierConversationsIA(clientId)` est ajoutée à `clientConfigService.js` : `DELETE FROM ai_conversations` du compte, web et Messenger, puis `invalidate(clientId)`. B2 l'appelle après le COMMIT, au mieux, jamais en 500, et **seulement quand le domaine change** :
  - `abonnementController.js` : si `domaineChange` est vrai (`:1630`), après le COMMIT `:1688` ;
  - `clientsController.js` : après le COMMIT `:601`, dans le `if (aboIdDomaine)` de `:602` ; cette variable n'est posée que par le `if` de `:581`.

  Test : enregistrer une configuration sans changer de domaine garde `ai_conversations`. Rien n'est purgé sur une modification du LEXIQUE : le glossaire, recalculé à chaque message, domine.

### 5.7 `/auth/me` allégé (point reporté du 2a)
- `authController.loadDomaineForUser` reste la fonction unique de `/auth/login` et `/auth/me`. Login et me restent égaux, sinon `memeUserEnPlace` repose le user à chaque retour d'onglet. Une aide `lexiquePourCompte(profil)` rend le lexique envoyé :
  - `null` quand `vocabDuProfil(profil) === vocabDefaut`, c'est-à-dire mêmes rendus ET aucune clé en plus. Ni `voc.estDefaut`, ni le slug ;
  - sinon une COPIE du lexique sans `derive_de`, `mode` ni `gabarit`. Jamais de `delete` sur l'objet du cache : il sert de clé à la `WeakMap`.
- La même aide sert `GET /api/domaines` (branches client, gérant et acheteur) et `GET /api/entreprise`. Chaque route garde SA forme : `mapDomaine`, avec `description`, pour `/api/domaines`. Seul `lexique` change.
- L'admin garde le profil complet (`AdminDomaineEditPage`, `AdminSupportPage`, `test-composants.js`).
- Front :
  - type `DomaineDuCompte` (`lexique: Lexique | null`) pour `User.domaine`, sans toucher `DomaineProfil` des écrans admin ;
  - typage de `MonAbonnementPage.tsx:104-115` ;
  - `scripts/controle-contexte.mjs` : cas « restauration → `null` » au login et à `/auth/me`, acheteur, transition « lexique complet → `null` » au retour d'onglet.
- Backend : réécrire les 17 contrôles de `scripts/test-vocabulaire-domaine.js` (`controlerDomaine` `:313-322`, restauration `:446-451`, `:363`, `:431`).
- Compatibilité : nouveau serveur + ancien écran → `vocabDuLexique(null) === vocabDefaut`, et 0 écart mesuré sans les champs retirés. Un compte restauration reçoit `null` : les 4 clés ajoutées ne touchent pas son `estDefaut` sur un ancien écran.

### 5.8 Guide d'écriture des agents
`fiche-technique-backend/scripts/VOCAB-GUIDE-SERVEUR.md`, sur le modèle du guide du 2a :
- règles de la présente spec ;
- API (rappel), points de rendu (E2), idiomes reconnus et interdits ;
- exemples AVANT → APRÈS pour chaque famille : message, erreur levée, variable `const` de message, table de libellés, pluriel dynamique, accord, Excel, email, PDF, prompt, texte persisté, SQL, paramètre de libellé ;
- table des formes (§6.5) et des clés « Ingrédient » / « article » ;
- écarts admis attendus par type ;
- contrôles à lancer ;
- règle « `voc.icon` seulement pour les clés dont l'emoji affiché est déjà l'icône par défaut ».

## 6. Règles de réécriture communes

### 6.1 SQL (I8)
- Un libellé qui sert de clé à un `GROUP BY`, `ORDER BY` ou `DISTINCT` passe en **paramètre `$n`**, valeur calculée en JS avec `voc`. Le regroupement reste exactement celui d'aujourd'hui. Mesuré : `COALESCE(pl.nom, $n)` et `ld.nom || $n` s'exécutent, avec le même type de colonne et les mêmes lignes que les littéraux.
- **Un paramètre de libellé ne s'ajoute JAMAIS à un tableau partagé par plusieurs requêtes.** On écrit `const p = [...params, voc.Nom('prestataire')]` et `$${p.length}` pour la SEULE requête qui l'emploie. Une constante de module qui porterait le numéro devient une fonction du numéro. Exemple : `L_CANAL` (`dashboardV2Controller.js:100`) devient `lCanal(n)`.
  - Sites : `dashboardV2Controller.js:356` (paramètres de `:345`) ; `aiToolHandlers.js:402-411` (paramètres de `:381-397`).
  - Un paramètre en trop fait échouer la requête (mesuré) : 500 pour l'onglet Ventes de tous les comptes, outil vide sans bruit.
  - Test : onglet Ventes et `get_ventes` avec chaque filtre, sur un compte restauration.
- Tout autre libellé devient un **code** (colonne existante, `NULL` ou code en minuscules), traduit en JS avec `voc` à la sortie. La forme de l'API ne change pas (I9).
- Un tri qui portait sur la position d'une colonne de libellé garde le même critère. On écrit `ORDER BY <expression>`, jamais un numéro de colonne décalé par la réécriture.
- Un assemblage JS teste `!= null`, jamais la vérité d'un nom.
- Les codes (`type_appro = 'PT'`, `'transfert'`, `origine = 'labo'`… : 167 littéraux) ne bougent pas.

### 6.2 Marqueur « (labo) » : une seule règle, 7 sites
`` ` (${voc.court('labo')})` `` : forme courte en minuscules, comme une marque entre parenthèses. Par défaut « (labo) » ; Hôtellerie « (cuisine) ».

| Site | Forme |
|---|---|
| `dashboardV2Controller.js:666` (`GROUP BY 1`), `dashboardController.js:319` | `ld.nom || $n`, paramètre propre à la requête (§6.1) |
| `laboController.js:2317`, `aiToolHandlers.js:260`, `reportService.js:68` | le SQL renvoie le nom et un drapeau « destination labo » (`lt.labo_dest_id IS NOT NULL`) ; assemblage en JS. Pour `get_transferts` : `{ ...r, destination }`, à partir de `labo_destinataire` déjà renvoyé ; l'ordre des clés est gardé |
| `ventesController.js:1487` | JS : `` `${nom} (${voc.court('labo')})` `` |
| `ventesController.js:1584` | `` `${voc.Nom('produit_compose', true)} (${voc.court('labo')})` `` (aujourd'hui non affiché) |

Limite connue, à ne pas « corriger » : un labo dont le nom contient déjà le mot donne « Cuisine (cuisine) ». C'est déjà le cas par défaut avec « Labo (labo) ».

`scripts/test-transferts-chaine.js:502`, `:506`, `:516` et `:520` (compte Hôtellerie) calculent leur attente avec le vocabulaire du compte : « Cuisine (cuisine) », et `:520` « Livraison interne reçue ». Ce fichier est tenu par l'intégrateur (§10.4). (v2.3) Appliqué : `:502` attend « Cuisine (cuisine) » (besoin B1[0]).

### 6.3 Excel
- **Vocabulaire** : `const voc = req.voc ?? vocabDefaut` dans les 10 contrôleurs d'export (15 sites, avec `reportService`) ; paramètre `voc` obligatoire de `fillFtWorksheet` (`exportController.js`) et de `buildExcelPertes` (`pertesController.js`) ; `vocabForClient` dans `reportService`.
- **Onglets** : `wb.addWorksheet(ongletSur(wb, …))` sur les 17 noms qui portent un terme ou un nom saisi. Forme `Court` pour un nom composé, comme une colonne (`` `${voc.Pl('vente')} ${voc.Court('labo')}` ``). Les 4 onglets à nom saisi (`inventaireController.js:896`, `:986` ; `laboController.js:1908`, `:2336`) prennent la forme `Court` de leur terme : identique par défaut. Hors restauration, un terme long peut réduire la part du nom saisi après la coupe à 31 : accepté (§11.3).
- **Titres, sous-titres, en-têtes, sections** : appels `voc`, accords compris. Exemples : « Transferts valorisés », « Stock actuel », « Pertes récentes », « Inventaires récents ».
- **Libellés de type d'appro** (`laboController.js:1939-1944`, `stockController.js:915`) :
  - `'PT'` → `voc.Court('pt')` (« PT » par défaut) ;
  - `'produit_transforme'` → `voc.Nom('pt_abr')` ;
  - `'transfert'` → `voc.Nom('transfert')` à `stockController.js:915`, et `` `${voc.Nom('transfert')} ${voc.acc('transfert', 'reçu', 'reçue')}` `` à `laboController.js:1942` ;
  - « Manuel » inchangé.
- « Directe » / « Confirmée » (`ventesController.js:1271-1272`) s'accordent avec `vente`.
- **Catégories PT** : `libelleCategoriePt(voc, valeur)` au moment d'ÉCRIRE la cellule, jamais avant un filtre, un tri ou un regroupement. 7 sites, 8 exports :
  - `inventaireController.js:914`, `:1004` ;
  - `laboController.js:1946`, `:2366` ;
  - `pertesController.js:415` ;
  - `stockController.js:919` ;
  - `ventesController.js:1486`, après le filtre `:1456`.

  Homonymie acceptée par écrit : une catégorie du client nommée exactement comme un libellé PT est traduite (0 cas). Inverse, à signaler au client : en Hôtellerie la catégorie PT « Consommables » se confond avec une éventuelle catégorie d'articles « Consommables ».
- **Pluriels** : la règle de l'existant. « N produit(s) » `!== 1` (`produitsController.js:1602`, `:1659`, `:1675`) → `voc.nom('produit', n !== 1)` ; jamais `voc.n`.
- **Abréviations** : clés `*_abr` (§4.3).
- **Noms de fichiers** : inchangés (I2, entrée `discriminant`). `nomFichierSur` seulement là où un nom saisi y entre (§5.5).
- **Propriété `creator` « Fiche Technique App »** : inchangée (entrée `formule`).
- **Replis morts** `|| 'Labo'` (×4) : `voc.Nom('labo')`.
- **Modèles d'import** :
  - acheteurs et fournisseurs : titre, sous-titre et onglet par `voc` ; en-têtes et lecteurs inchangés (aucun terme).
  - **référentiel** :
    - en-têtes écrits `[voc.Nom('article'), 'Unité', 'Catégorie', 'Famille']` ;
    - lecteur (`referentielController.js`, sans toucher `excelBrandService.js`) : `findHeaderRow(ws, en-têtes du domaine) ?? findHeaderRow(ws, en-têtes par défaut) ??` la première ligne, dans les 15 premières et sans tenir compte de la casse (comme `findHeaderRow`), dont les colonnes 2 à 4 valent « Unité / Catégorie / Famille » et dont la colonne 1 n'est pas vide `?? 1`. Le 3ᵉ cas couvre un modèle fait avec un ancien terme du domaine, ou une colonne renommée à la main. Aujourd'hui, un fichier sans en-tête reconnu importe son bandeau comme des articles (§11.1) ;
    - ligne d'exemple : `'Exemple : ' + voc.ex('Poulet rôti', `${voc.Nom('article')} A`)`, le préfixe restant hors de `voc.ex` (sinon `isExampleRow` ne la reconnaît plus) ; `voc.ex('Viandes', 'Catégorie A')` ; `voc.ex('Food', 'Famille A')` ;
    - jetons `'article'` de `details[].created/existing` : codes (I2), traduits par l'écran ;
    - test : ancien modèle « Article », modèle du domaine, colonne renommée, aucune ligne parasite.

### 6.4 Accords, pronoms, verbes
- Accords par `voc.acc`. Plusieurs termes coordonnés : `voc.accN` en code. En balise (messages), accord de proximité avec le terme le plus proche, correct pour une alternative en « ou ». Exemple : `Au moins [[un:activite]] ou [[un:labo]] doit être [[acc:labo:affecté:affectée]]`.
- Pronoms de reprise (« Désactivez-le », « ajoutez-en un », « il s'approvisionne ») : `[[acc:…]]` ou `voc.acc`.
- « au premier appro », « mon premier approvisionnement » : `voc.acc(k, 'mon premier', 'ma première')`, jamais `det` + adjectif fixe.
- Verbes issus d'un terme (« se transférer », « s'approvisionne ») : texte inchangé, entrée `verbe`.
- Avec un libellé de composant : seuls `nom`, `Nom`, `mon` et `mes`, par `voc.avec(entreeComposantVoc(voc, c))` (v2.2 : la table identité du §4.2 ; `voc.avec(entreeComposant(c))` seulement pour un composant qui ne peut pas être un composant identité).
- La relecture des lignes « miroir » de `scripts/vocab-accords.txt` est obligatoire pour chaque lot.

### 6.5 Choix de la forme et de la clé
**Forme du nom**, pour tous les lots :

| Emploi | Forme | Défaut | Hôtellerie |
|---|---|---|---|
| Dans une phrase : message, question, consigne, texte du prompt | `nom` / `Nom` (en tête de phrase). `court` (minuscule, sigles gardés) SEULEMENT là où l'existant écrit un sigle ou une abréviation (PT, FT, appro) | Labo introuvable · Stock PT insuffisant | Cuisine centrale introuvable · Stock prépa insuffisant |
| Étiquette : en-tête de colonne, onglet, préfixe « X : nom », « X · nom » | `Court` | Labo : Bloc chaud | Cuisine : Bloc chaud |
| Marqueur entre parenthèses | `court` | (labo) | (cuisine) |
| Nom d'un écran, module ou option, cité tel qu'à l'écran | la forme de l'écran du 2a (`Court`) ; `court` si l'existant l'écrit en minuscules dans une phrase | Tarifs Acheteurs · mes tarifs acheteurs | Tarifs Clients professionnels · mes tarifs clients professionnels |
| « Base acheteurs » (module), en tête ou en étiquette : composant identité, nom de module à l'écran | `` `Base ${voc.court('acheteur', true)}` `` | Base acheteurs | Base clients professionnels |
| (v2.2) « base acheteurs » dans une phrase (message, guide) | `` `base ${voc.court('acheteur', true)}` `` ; en balise `base [[court:acheteur:pl]]`. Exemples : `gerantController.js:110`, `:113`, `:228`, `:235` | la base acheteurs | la base clients professionnels |

Exemples de balises :
- « Stock PT insuffisant » : `Stock [[court:pt]] insuffisant`.
- « Stock labo insuffisant » : `Stock [[compl:labo]] insuffisant` (apposition ; « Stock de la cuisine centrale insuffisant » en Hôtellerie).
- `Module [[Court:vente]]`, `Module [[Court:acheteur:pl]]`, `Tarifs [[Court:acheteur:pl]]`, `L'option [[Court:acheteur:pl]]`.
- « L'Espace Produit » : `[[Le:espace_produits:Nom]]`.

**Clé** :
- « Ingrédient » :
  - ligne de stock, historique, rapport, message de stock → `article_ingredient` ;
  - composant de recette (fiche technique `exportController.js:102`, `:173` ; `produitsController.js:709`, `:744`) → `ingredient`.
  - `routes/produits.js:414` reste un littéral (I7, `errors[].msg`).
- « référentiel des articles/ingrédients » (description d'outil, `aiToolHandlers.js:630`) → `` `${voc.pl('article')}/${voc.pl('ingredient')}` `` : identique par défaut ; Hôtellerie « fournitures/composants ». Jamais `article_ingredient` ici : il copie `article` et donnerait « fournitures/fournitures ».
- **« article » au sens d'élément quelconque**, c'est-à-dire là où l'élément peut être un produit ou un article (`article_type` / `articleType` ∈ {produit, ingredient}) : ce mot n'est PAS traduit. Entrée `homonyme`, motif « élément générique ». Liste fermée :
  - `ventesController.js:300`, `:346`, `:1474` (en-tête de l'export « Ventes du labo ») ;
  - `acheteurVentesController.js:131`, `:166` (1er mot), `:396` ;
  - `portailController.js:148` ;
  - `aiService.js:34` (« article… » dans les filtres, et « articles vendables (`get_config_vente`) »), `:49` (« groupée par article ») ;
  - `aiToolHandlers.js:685` (« articles vendables »).

  Le scan du §2.5 les reçoit en exception `homonyme`.
- Formes longues dans les textes lus par le modèle ; formes courtes là seulement où l'existant abrège déjà.

### 6.6 Pluriels dynamiques en balise
Jamais de trou dans une balise (`[[n:article:${n}]]` n'est pas une balise). On écrit deux balises complètes dans une condition qui garde le test d'origine : `${n > 1 ? '[[nom:article:pl]]' : '[[nom:article]]'}`. Les tables de libellés portent des balises littérales par entrée (`LIBELLES` de `quotaService`). Jamais de balise à clé dynamique.

### 6.7 Textes écrits en base (5 sites)
Un texte fabriqué par le serveur et écrit en base est rendu AU MOMENT DE L'ÉCRITURE, avec le vocabulaire du compte destinataire, par des appels `voc`. Jamais de balise en base. Les lignes existantes ne sont pas reprises. Écart assumé à la décision 10 de REPRISE §4, qui parlait du compte « émetteur » : c'est le principe I6 du lot. En pratique, le gérant ou l'acheteur émetteur lit le même lexique que le compte destinataire.

| Site | Texte | Vocabulaire |
|---|---|---|
| `inventaireController.js:338` | `notesAdmin` « Labo : X — date » → `` `${voc.Court('labo')} : …` `` | `req.voc` (le gérant lit le domaine du compte parent, qui est le destinataire) |
| `inventaireController.js:662` | « Activité : X — date » → `voc.Court('activite')` | `req.voc` |
| `portailController.js:207` | repli `clientNom` « Acheteur » → `voc.Nom('acheteur')` | `req.voc` de l'acheteur = lexique du vendeur |
| `acheteursController.js:242` | motif « Acheteur supprimé du carnet » (`motif_annulation`, `commande_acheteur_statuts.motif`), avec `voc.acc` | `req.voc` |
| `configComposantsService.js` (`creerComposantIdentite`) | libellés des composants identité | profil du domaine (§5.4) |

La même charge part en base et en SSE : on la rend une fois, avant `saveNotification` et `pushTo`.

### 6.8 Écarts admis : quand
On ne touche pas, avec une entrée typée :
- homonymes : « article » de la base de connaissances, « article » générique (§6.5), « ARTICLE n » du contrat, « PRESTATAIRE » (LabFlow), « PU HT », « Domaine d'activité » ;
- noms de formule (« Activité Basique / Premium ») ;
- locutions : « prix de vente », « type de vente », « canal de vente », « sous-produit », « Sous-produit » des recettes (`laboController.js:2127`, `produitTransformeController.js:519`), « prestataires de livraison » (« de livraison » reste, comme au 2a) ;
- verbes ;
- noms de fichiers, noms de champs DocuSeal (`Nb activités`, `Nb labos`, `Nb gérants`, `Option Acheteurs` : un nom traduit serait retiré EN SILENCE par le retry 422), codes et enums cités dans un texte ;
- textes admin (`admin`, E8) ;
- messages techniques. Est technique un message qui contient, hors trou : un identifiant camelCase ou snake_case, un nom suffixé `Id`, un `[]`, une valeur entre apostrophes, une liste `(a|b)` ou de valeurs brutes, ou qui est tout entier un code (`invite_pending`). Exemple de cas mixte : « Type [[de:produit]] invalide (vendable, supplement ou valorise) ».

`errors[].msg` d'express-validator (4 textes de `routes/produits.js`, atteints seulement par l'écran orphelin `ProductForm`) : littéraux, entrée `non-repliable` (« champ non rendu »).

## 7. Assistant et guide de mise en route (lot B1)

### 7.1 Origine du vocabulaire
Jamais `req.voc` dans la chaîne de l'assistant : Messenger n'a pas de `req`, et un appelant admin passerait le défaut.
- `chatWithAI(clientId, …)` : `const voc = await vocabForClient(clientId)` en tête. Une requête par message, négligeable devant le modèle.
- `generateAndSendReport` et l'accueil Messenger : `vocabForClient`.
- `computeOnboardingEtat(clientId)` : `vocabDuProfil(profil)`, profil déjà chargé (`:79`). Signature inchangée : ni les 5 appelants ni le test ne bougent.
- Fonctions pures, `voc` obligatoire :
  - `buildSystemPrompt(contextLine, voc)` ; (v2.3) forme finale `buildSystemPrompt(contextLine, voc, profil = null)` : `profil` (lexique résolu et composants du domaine) ne sert qu'au glossaire du §7.3 ; sans lui, pas de glossaire. `chatWithAI` ne charge ce profil (`getProfilForClient`) que si `voc.estDefaut` est faux ; en cas d'erreur, le prompt part sans glossaire ;
  - `onboardingPromptBlock(etat, voc)` ;
  - `getClientContextLine(clientId, voc)` ;
  - `getContextLine(clientId, voc)` → `buildLineFromSnapshot(snap, voc)` (`SNAPSHOT_VERSION` reste 3) ;
  - `geminiChat(messages, tools)` ;
  - `executeToolCall(clientId, nom, input, voc)`, qui calcule `vocabForClient` si `voc` manque, et rend `err.message` avant de le renvoyer au modèle (E2).

### 7.2 Outils
`toolsFor(voc)` est mémoïsé par objet `voc` (`WeakMap`). `JSON.stringify(toolsFor(vocabDefaut))` est **identique** à l'ancien `TOOLS_OPENAI` (preuve par l'oracle). `TOOLS_ANTHROPIC` et `TOOLS_OPENAI` sortent des exports.
- Les descriptions d'outils et de paramètres passent par `voc`, SAUF la description de `search_knowledge_base` et celle de son paramètre `query` (`aiToolHandlers.js:705`, `:709`). Elles restent en mots de LabFlow jusqu'au 2c : entrée `reporte`, `lot: 2c`. Raison : la base et le manuel ne connaissent que ces mots, et l'exemple de requête doit les employer.
- Les noms d'outils, de paramètres, les clés de résultats et les codes cités restent littéraux : « (direct / prestataire) » du canal, « avarie / dechet ». Sinon le modèle passerait « intermédiaire » au filtre, et le total serait faux sans bruit.

### 7.3 Prompt et glossaire
- Les 12 lignes à terme s'écrivent avec des appels `voc` dans le code, **jamais en balises** : la ligne de contexte et le bloc du guide interpolent des noms saisis, et `rendre()` ne s'applique jamais à des données.
- Emojis : 📦, 🏭 et 🏪 sont l'icône de LEUR clé, donc `voc.icon`. 📊, 🛒 et 🧂 sont des icônes du lexique employées ici pour un autre sens, et 📉, 🔄, 🧾 n'en sont pas : tous restent littéraux. L'emoji d'exemple de format (`onboardingEtat.js:271`) s'écrit `voc.ex('🧂', '📏')` : identique par défaut ; hors restauration, le modèle ne recopie plus un emoji de cuisine.
- **Glossaire « Vocabulaire du compte »**, placé après le bloc de contexte. Il n'est émis que si au moins une forme diffère : ce n'est pas `!voc.estDefaut`, qui serait vrai pour une simple icône.
  - Une ligne par **forme par défaut distincte**, pas par clé, d'après `LEXIQUE_CLES`, hors `*_abr` :
    - les clés de même forme par défaut sont fusionnées : `labo`, `labo_long` et `labo_desc` donnent une ligne ;
    - les `cat_pt_*` sont écrites une seule fois quand `sg === pl` ;
    - `activite_desc` est retirée ;
    - les `espace_*` sont gardés : ce sont les noms de menus que le modèle cite dans « 📍 Menu → Page ».
  - « ingrédient » a une seule ligne, avec ses deux sens. Exemple : « « ingrédient » (ligne de stock, champ `ingredient` des données) → « fourniture » ; « ingrédient » d'une recette → « composant » ».
  - Chaque ligne cite les champs de données de la clé, d'après une table fixe de `aiService.js`. Exemple : « « labo » / « labos » → « cuisine centrale » / « cuisines centrales » (forme courte « cuisine ») — dans les données : `labo_id`, `labos`, `labo`, `labo_destinataire` ».
  - Ensuite, une ligne par type technique pour les **composants** actifs du domaine dont le libellé n'est pas celui du lexique, tirés du profil (`profil.composants`, `type_technique`). Exemple : « Restaurant, Bar, Room service, Housekeeping, Spa = des « services » (activités dans LabFlow) ; Cuisine, Économat / Logistique = des « cuisines centrales » (labos dans LabFlow) ».
  - Trois règles finales :
    1. réponds avec les mots du compte ;
    2. outils, champs et codes (`type_appro`, `canal`, types de perte, `PT`) restent ceux de LabFlow et ne se montrent pas au client ;
    3. la base de connaissances et le manuel sont rédigés avec les mots de LabFlow : cherche avec ces mots, puis rends la réponse avec les mots du compte. Cette règle est à retirer au 2c.
  - La fonction parcourt une clé non littérale : écart `non-repliable` sur cette seule fonction.
  - (v2.3) **Écriture finale** (`aiService.glossaireVocabulaire(voc, profil)`). L'outil de preuve refuse une clé non littérale dans un appel `voc` : la fonction parcourt bien `LEXIQUE_CLES`, mais n'appelle jamais `voc.nom(k)`. Chaque forme est rendue par le moteur sur une ENTRÉE : `voc.avec(e).nom('_')`, `.nom('_', true)`, `.court('_')`, `.court('_', true)`, avec `e` = l'entrée résolue du domaine (`profil.lexique[k]`, à défaut `LEXIQUE_DEFAUT[k]`) à droite, et `LEXIQUE_DEFAUT[k]` rendue par `vocabDefaut` à gauche. Les lignes des unités font de même avec `voc.avec(entrée).det('_', 'un', true)` et `libelleComposant(voc, c)`. Le lexique résolu vient donc du 3ᵉ argument `profil` (§7.1), jamais d'une relecture du `voc`. Une clé dérivée par copie, seule de sa forme, qui rend la même chose que sa clé parente (`labo_long`, `labo_desc`) n'a pas de ligne. Les unités nouvelles de cette seule fonction sont admises en `non-repliable` (`scripts/vocab-allow/B1.json`). Absent par défaut : prouvé par `test/B1-assistant.test.js` (prompt identique à la référence) et par l'oracle.
  - (v2.4, vérification du lot) **Clés copiées et règle 4.** Le manuel et la base de connaissances emploient « laboratoire », « laboratoire de production » et « point de vente » : chaque clé dérivée par copie (`labo_long`, `labo_desc`, `activite_desc`) a désormais sa ligne dès que sa forme diffère dans le compte, et `activite_desc` n'est plus retirée. Les copies d'une même clé qui rendent la même chose partagent une ligne : « « laboratoire » / « laboratoires » (« laboratoire de production ») → « cuisine centrale » / « cuisines centrales » » ; en Hôtellerie, « « point de vente » / « points de vente » → « service » / « services » » ; en Céramique, `activite_desc` rend « point de vente » comme par défaut : pas de ligne. Quand « article » diffère, une règle 4 suit les trois autres : « « articles vendables » (configuration de vente, `get_config_vente`) = tout ce que le compte vend (produits et articles revendus) : ne le traduis pas par « fournitures vendables » ». Restauration : glossaire toujours absent. Mesure (lexiques d'essai de `test/vocab-lexiques-test.json`, sans composants) : Hôtellerie 28 lignes, 2 843 caractères ; Céramique 32 lignes, 3 293 caractères.
  - Mesure à refaire et à écrire au rapport : nombre de lignes et de caractères en Hôtellerie et en Céramique. (v2.3) Mesure sur la base locale (02/10, lexiques des brouillons) : Hôtellerie 2 698 caractères, 28 lignes ; Céramique 3 174 caractères, 33 lignes (titre et 3 règles compris) ; restauration, café, boulangerie : 0. Pour comparaison, le prompt par défaut sur une ligne fixe fait 5 374 caractères.
- Ligne de contexte (`clientConfigService.js:121-138`, repli `aiToolHandlers.js:70-74`) : « aucune » / « aucun » → `voc.acc` ; « activité(s) » → `voc.nomS`. « Domaine d'activité » est un homonyme.

### 7.4 Guide de mise en route : lexique contre composants
Trois règles :
1. **Le texte parle d'une catégorie** (type technique, quota, compteur par type, comparaison entre types, consigne) → terme du lexique. Exemples : titres d'étape, « différence entre une activité et un labo », « affectée(s) », règle du bloc du prompt.
2. **Le texte désigne le type d'une unité, ou une ligne par composant souscrit** → `libelleComposant(voc, c, n, casse)` (§4.2), accordé par `voc.avec(entreeComposantVoc(voc, c))` quand il faut un déterminant (v2.2 : la même table identité). Exemples : détail « 1/2 Restaurants », question « Comment créer ma cuisine ? ».
   - (v2.2) Écart d'identité attendu : la question par composant (`onboardingEtat.js:119`, « Comment créer mon / mes … ? ») passe le déterminant dans `voc.avec(…).mon(…)`. L'outil `identite` rend 1 écart (« ⟦mon|mes@>1⟧ … » devient « ⟦?⟦mon|mes@>1⟧ …|⟦·⟧⟧ »), admis par une entrée `deplacement` : « déterminant déplacé dans voc.avec(entreeComposantVoc(voc, c)).mon ; rendu par défaut identique, prouvé par l'oracle (`guide`) ».
3. **Un composant identité au libellé du brouillon** → terme du lexique, par la même fonction.
   - Liste toute en identité : voie actuelle, en minuscules (`voc.mon('activite', n > 1)`).
   - Liste mixte : forme `Nom`, alignée sur les libellés stockés.
   - La charge `composants[].libelle` suit la même règle, pour que pastilles et détail disent le même mot.

   Rendu identique par défaut, vérifié.

Les 57 chaînes du guide sont rendues en JS. Simulation : une seule question change, « mon cuisine » → « ma cuisine ». Les tests `test-onboarding-etapes.js:46`, `:47`, `:69`, `:75`, `:79`, `test-transferts-chaine.js:492` et `test-bot-onboarding.js:68-70` restent verts.

### 7.5 Messenger, rapport, recherche
- Accueil : `texteAccueilMessenger(nom, voc)` ; icônes 🏪 🏭 📦 📚 par `voc.icon` (activite, labo, stock, referentiel).
- Rapport Excel (`reportService.js`) : règles du §6.3. « Ingrédient » → `article_ingredient`. « Date appro » → forme courte. Accords « actuel / récentes / récents ».
- Recherche dans le manuel et la base : inchangée au 2b. Points d'insertion du 2c : `rendre` sur titre, partie et contenu avant la troncature (`aiToolHandlers.js:296`) et avant le score.
- `get_ventes` : repli `'Prestataire'` (`:403`, `GROUP BY 1`) → paramètre propre à `canalRes` (§6.1), valeur `voc.Nom('prestataire')`.

## 8. Documents et emails (lot B2)

### 8.1 Emails
Les 5 fonctions écrivent leurs termes par appels `voc`. Le sujet est en texte brut ; le HTML ne contient que des termes sûrs (§4.4). Les variables existantes sont gardées : `roleLabel`, `addedParts`, `supText`, et l'aide `plur(n, voc.nom(k), voc.nom(k, true))`. Les supprimer ferait des écarts d'identité (mesuré). Pas de correction en passant :
- `sendAvenantEmail` ignore l'option Acheteurs ;
- noms saisis non échappés.

Ce sont des défauts anciens, hors lot. (v2.3) Laissés tels quels ; « `sendAvenantEmail` ignore l'option Acheteurs » est posé au client comme décision (`labflow-reprise/lot-2b/ecarts-visibles-2b.md`), recommandation : garder tel quel au 2b. Même chose pour « en tant que acheteur » de l'email d'invitation (`sendInviteEmail`, `roleLabel` gardé, §8.1) : l'élision « en tant qu'acheteur » changerait le texte d'un compte restauration, hors §11.

### 8.2 Contrat
Seules changent les VALEURS que le serveur remplit, et leurs jumeaux du flux PDF :
- « Option Acheteurs » : `` `Palier jusqu'à ${N} ${voc.nom('acheteur', true)}` `` (`clientsController.js:63-65`, `contractPdfService.js:127`, `:156`, `:194`) ;
- « Capacité ajoutée » : `ajoutTextOf(…, voc)` (`contractPdfService.js:96-104`, `:186`) → `+${n} ${voc.nom('activite', n > 1)}`, `labo_long`, `compte(s) ${voc.nom('gerant', …)}`, `` `Option ${voc.Court('acheteur', true)} → palier jusqu'à N` ``.

Inchangés :
- « Formule » : nom commercial, entrée `formule`. Écart assumé à la décision 7 de REPRISE §4, pour que l'écran (allow `formule` du 2a) et le contrat restent d'accord ;
- « Domaine » : donnée ;
- les noms de champs ;
- le texte fixe et le modèle DocuSeal (lot 3, entrées `reporte` lot 3).

Corriger `docuseal-templates/CHAMPS.md:109-111` : « lot 2 » devient « lot 3 ».

Vocabulaire :
- création : `vocabDuDomaine(domaineId)` ;
- aperçu du wizard : `vocabDuDomaine(domaineId du corps)` ;
- régénéré : `vocabForClient(clientId)` ;
- avenant créé par le client : `req.voc` ;
- `traiter` et `previewAvenant` : `vocabForClient(demande.client_id)`.

**Règle « régénéré / signé »** (remplace les commentaires `contractPdfService.js:72-74` et `:85-87`) : « Un document contractuel produit par le serveur hors signature (aperçu du wizard, contrat régénéré, avenant legacy) est rendu avec la configuration, les tarifs et le vocabulaire COURANTS du compte destinataire. Il reproduit au caractère près le document de la signature tant que ces trois éléments n'ont pas changé, hors les corrections typographiques du §11.1.2. La pièce qui fait foi est le PDF signé conservé par DocuSeal, toujours servi en priorité ; le régénéré n'est qu'un repli. »

### 8.3 PDF
- `generateAvenantPdf` (legacy) passe en vocabulaire complet, valeurs et libellés `:94-97` et `:131-135`, comme son jumeau écran `contractPdf.ts` au 2a.
- `generateContratPdf` : la valeur `:299` seulement ; objet « pour la restauration » et libellés : lot 3.
- **Facture d'appro** : les libellés sont calculés dans `src/services/factureApproPdf.js`, `buildFactureApproPdf(f, lignes, voc)`, et passés à `buildFactureAppro` dans `data.libelles`. `generate.js` garde ses littéraux comme valeurs par défaut : CLI et identité. Un seul appel change (`facturesController.js:285`, `req.voc`).
  - Correction : le sous-titre d'un transfert labo→labo disait « Transfert labo → activité ». Il dit maintenant le bon sens (écart `faute-corrigee`, §11.1).
- **`pdfTexte` au serveur, en OPTION.** La table du front (`src/utils/pdfTexte.ts` : « → » devient « › », etc.) est portée au serveur.
  - Dans `generate.js` : option `makeCtx(info, { pdfTexte: true })`. `buildFactureAppro` la passe toujours. `buildContrat` la reçoit par une option de `contractPdfService.generate`, posée SEULEMENT par `regenerateContratPdf` (`abonnementController.js:2247`) et l'aperçu du wizard (`:2407`).
  - Dans `pdfService.js` (qui n'utilise pas `makeCtx`) : une aide locale appliquée par `generateAvenantPdf` et `generateContratPdf`.
  - Ne la passent JAMAIS : les documents à signer (`clientsController.js:88`, `supportController.js:46`), `buildFactureAcheteur`, `generateFacturePdf` / `buildFacture` (abonnement) et `buildResiliation`. Leurs octets ne changent pas ; preuve : compte C, facture avec remise « − » et acheteur hors Windows-1252.
  - Elle ne s'applique jamais aux valeurs envoyées à DocuSeal.
  - Les retraits de `()` et `« »` vides ne s'appliquent que si la chaîne contenait un caractère décoratif retiré. Test : `txt('Sauce ()')` inchangé.
  - Défaut ancien corrigé dans ces documents : pdfkit écrit « → » comme « !’ », et une donnée hors Windows-1252 en octets illisibles (§11.1).
- Facture acheteur et facture d'abonnement : inchangées (exceptions `fiscal`).

## 9. Messages et données des contrôleurs (lots B3, B4, B5)

- Les messages à terme reçoivent des balises (E2, §6.4 à §6.6), y compris les 45 que l'écran ne montre pas (401/403 masqués, téléchargements) : `residuels` reste à 0 sans exception, et le texte reste juste si l'intercepteur change.
- Un même texte reçoit la même balise partout. Exemple : « Labo hors de votre périmètre », 6 sites dans 3 fichiers (`acheteurVentesController.js` ×4, `laboController.js:1191`, `ventesController.js:44`).
- Tables : `quotaService.LIBELLES` en balises littérales par entrée (§6.6). `CODES` de `unitesOperationnellesService` : idem. `configComposantsService` : 4 `push`. `messageSupplement` : balises dans les deux branches.
- **Tableau de bord v2** (`dashboardV2Controller.js`), traduit au serveur avec `const voc = req.voc ?? vocabDefaut` (`requireClientOwner`) :
  - `:100` repli « Prestataire » (`GROUP BY 1`) → `lCanal(n)`, paramètre propre à la requête `:356` (§6.1) ;
  - `:357-371`, préfixes :
    - le SQL renvoie `cpn.nom` et `cpn.type_produit`, déjà dans le `GROUP BY`, et garde `ORDER BY` sur l'expression du chiffre d'affaires, jamais par position ;
    - le JS rend `cpn.nom == null ? 'Sans catégorie' : (préfixe(type) ?? '') + cpn.nom`, avec `voc.Nom('produit_vendable_abr')`, `voc.Nom('supplement')`, `voc.Nom('produit_valorise_abr')`, et un préfixe vide pour un type hors des trois ;
  - `:525`, `:546`, `'Activité'` / `'Labo'` AS site_type → codes `'activite'` / `'labo'` :
    - la clé de regroupement `:571` devient `code|nom` : un domaine où les formes courtes d'activité et de labo seraient égales ne fusionne pas deux sites ;
    - le libellé `` `${voc.Court(cle)} · ${nom}` `` est calculé après le regroupement, par une table littérale (`{ activite: voc.Court('activite'), labo: voc.Court('labo') }`) : jamais de clé non littérale ;
  - `:666` « (labo) » → §6.2 ;
  - catégories PT : valeur par défaut (traduite à l'écran).
- **Routes que l'écran n'appelle plus** (`dashboardController`, `rapportsController`, `gerantDashboardController.getDashboard`) : même traitement que les autres (messages, SQL). Pas de suppression dans ce lot.
- `stockUtils.js` : `ptCategorie` et `ptCategorieSql` restent la source des libellés par défaut (codes stables de l'API).
- Les tests à faux `req` sans `req.voc` (`test/laboVentesAcces.test.js`, `test/gerantDashboardSql.test.js`) restent verts grâce à l'idiome `req.voc ?? vocabDefaut`. `gerantDashboardController.getDashboard` n'a aucun libellé en SQL.

## 10. Lots, vagues et fichiers partagés

### 10.1 Propriété exclusive
Écart assumé à la décision 11 de REPRISE §4 : la propriété se fait par FICHIER, mesurée par `vocab-lots.mjs`, et non par thème (un même fichier porte messages, exports et catégories PT). `exportController.js` va en B3b, `reportService.js` en B1, `authController.js` en B2, `middleware/auth.js` au socle ; B6 s'ajoute pour l'écran.

Le socle (étapes O, S0, S1, S2) passe avant et peut toucher tous les fichiers. Pendant une vague, chaque fichier a UN propriétaire. Un agent :
- écrit ses manques dans `scripts/vocab-besoins/<lot>.json`, et laisse le texte avec un écart `provisoire` ;
- ne modifie ni le moteur, ni le lexique, ni le middleware, ni `vocabCompte.js`, ni `excelNoms.js`, ni `auth.js`, ni un fichier partagé (§10.4).

La répartition qui fait foi est celle de `scripts/vocab-lots.mjs` (§3.1). Elle est reprise ci-dessous avec les charges mesurées à `bfb590a` (unités de l'outil + hors outil).

| Vague | Lot | Fichiers (backend `src/` sauf mention) | Charge |
|---|---|---|---|
| 1 | **B3a Labo** | `controllers/laboController.js` | 87 + 1 SQL |
| 1 | **B3b Produits et transferts** | `controllers/produitsController.js`, `produitTransformeController.js`, `exportController.js`, `categoriesProduitController.js`, `unitesOperationnellesController.js` ; `services/transfertService.js`, `unitesOperationnellesService.js` ; `routes/produits.js` | 105 |
| 1 | **B4 Stock, ventes, tableaux de bord** | `controllers/stockController.js`, `inventaireController.js`, `pertesController.js`, `ventesController.js`, `dashboardV2Controller.js`, `dashboardController.js`, `rapportsController.js`, `gerantDashboardController.js` ; `utils/stockUtils.js` ; `services/stockService.js` | 120 + environ 8 SQL et la refonte du tableau de bord |
| 1 | **B5 Comptes et tiers** | `controllers/entrepriseController.js`, `gerantController.js`, `acheteursController.js`, `acheteurVentesController.js`, `portailController.js`, `fournisseurController.js`, `articlesController.js`, `referentielController.js`, `categoriesController.js`, `unitesController.js`, `famillesController.js` ; `services/quotaService.js`, `configComposantsService.js` | 109 + 2 SQL + lecteur du référentiel |
| 2 | **B1 Assistant** | `services/aiService.js`, `aiToolHandlers.js`, `aiFormatter.js`, `onboardingEtat.js`, `clientConfigService.js`, `messengerService.js`, `reportService.js` ; `controllers/aiAssistantController.js`, `aiKnowledgeController.js` | 100 + glossaire + 57 chaînes du guide + 3 SQL |
| 2 | **B2 Documents** | `services/emailService.js`, `pdfService.js`, `contractPdfService.js`, `factureApproPdf.js`, `factureAcheteurPdf.js`, `docusealService.js` ; `docuseal-templates/generate.js`, `CHAMPS.md` ; `controllers/clientsController.js`, `abonnementController.js`, `supportController.js`, `webhookController.js`, `authController.js`, `facturesController.js` | 74 + 57 de `generate.js` + `pdfTexte` |
| 2 | **B6 Écrans** (frontend) | `src/components/client/ClientDashboard.tsx`, `MonAbonnementPage.tsx`, `ActivitesPage.tsx` ; `src/components/admin/AdminDomaineEditPage.tsx` | voir §10.2 |

**Socle seulement**, puis l'intégrateur (jamais un agent de vague) :
- backend :
  - `src/` : `app.js`, `middleware/rendreMessages.js`, `middleware/auth.js`, `utils/vocab.js` (généré), `config/lexiqueDefaut.js` (généré), `utils/vocabCompte.js`, `utils/excelNoms.js`, `utils/lexiqueValidation.js`, `services/domaineProfilService.js`, `controllers/domainesController.js` ;
  - `migrations/192_*` ;
  - tests : `test/vocab.test.js`, `test/authVoc.test.js`, `test/vocab-vecteurs.json`, `test/vocab-lexiques-test.json`, `test/rendreMessages.test.js`, `test/emailVoc.test.js` ;
  - scripts : `scripts/start-test-backend.js`, `scripts/lib/bouchons-test.js`, `scripts/capture-vocab-baseline.js`, `scripts/check-invariant-vocab.js`, `scripts/vocab-baseline/*`, `scripts/vocab-rendu.json`, `scripts/vocab-lots.mjs`, `scripts/vocab-allow/{_global,socle}.json`, `scripts/VOCAB-GUIDE-SERVEUR.md`, `scripts/controle-avant-192.js`, `scripts/vocab-reference-lot2`, `scripts/test-vocabulaire-domaine.js` ;
- frontend :
  - `src/vocab/*`, `src/types/index.ts` ;
  - `scripts/vocab-check.mjs`, `vocab-check.test.mjs`, `vocab.test.mjs`, `sync-vocab-back.mjs`, `controle-avenant.mjs`, `controle-contexte.mjs`, `vocab-lexiques-test.json`, `vocab-vecteurs.json`, `vocab-gel.json`, `scripts/vocab-allow/*` (archives), `scripts/vocab-reference-lot2`.

### 10.2 B6
- `AdminDomaineEditPage` :
  - onglet Composants : colonne « Genre » (Masculin / Féminin) et colonne « Élision » (auto / oui / non) après « Pluriel », défauts `m` et auto ;
  - onglet Lexique : 4 libellés dans `LEXIQUE_LABELS` ; refus de `<` et `>` à la saisie.
- `ClientDashboard`, export Excel :
  - une table `libelleCleExport(voc, clé)` limitée aux clés à terme, qui rend EXACTEMENT `human(clé)` par défaut, avec repli sur `human(clé)` ;
  - `libelleCategoriePt` et `perteLabel` sur les valeurs ;
  - préfixes « P. Vendable / P. Valorisé » de `:249` par les clés `*_abr` ;
  - « Cout matiere », « Activite », « Production pt » : écart `faute-corrigee` (§11.1).
  - (v2.3) État final. `libelleCleExport`, `libelleCategoriePt` et les préfixes `*_abr` : faits. **`perteLabel` sur les valeurs : NON appliqué.** Il changerait l'export d'un compte restauration (« avarie » → « Avarie(s) », « dechet » → « Déchet(s) »), changement absent du §11.1 (I1) ; décision posée au client (besoin B6[1]), code laissé tel quel. Deux libellés de la table gardent la forme de l'existant pour l'identité restauration : « Transferts par activite » (`voc.ex('Transferts par activite', …)`, accent rendu seulement hors restauration) et « Acheteurs factures » (`${voc.Pl('acheteur')} factures`) ; leur correction est aussi une décision du client.
  - (v2.3) `src/types/index.ts` : `Composant` porte `genre?` et `elision?` (§11.2.2, besoin B6[0]) ; la page admin n'a plus de type local.
- `MonAbonnementPage`, `ActivitesPage` : `libelleComposant` (§4.2) pour les lignes de composants.

### 10.3 Règles d'une vague
- Un agent n'a aucune commande git d'écriture. Il ne lance ni `npm start`, ni migration, ni `npm test`, ni l'oracle, ni les scripts E2E : ils chargent les fichiers des autres lots en cours d'écriture.
- Il contrôle SES fichiers :
  - `node scripts/vocab-check.mjs identite|residuels|accords --root ../fiche-technique-backend <fichiers>`, lancé depuis le front ;
  - `node --check <fichier>` ;
  - pour un SQL modifié, un test à faux pool sur le modèle de `placeholdersCoherents` (`test/gerantDashboardSql.test.js`), écrit dans `test/<lot>-*.test.js`.
  - B6 : `npx tsc --noEmit -p tsconfig.app.json` sur ses fichiers.
- Il relit les lignes miroir de ses fichiers et rend mentalement chaque texte modifié avec les lexiques Hôtellerie et Céramique.
- **L'intégrateur de la vague** est le seul à écrire ensuite. Il :
  - lance tout : `npm test`, l'outil complet, l'oracle (restauration, et hors restauration sur la famille de la vague), les E2E du §12.4, et `npm run build` en vague 2 ;
  - relit chaque squelette SQL « à relire » (E4) ;
  - conteste chaque écart admis ;
  - met à jour les fichiers partagés (§10.4) ;
  - répare ;
  - committe un point de restauration, la seule commande git d'écriture permise.

### 10.4 Fichiers partagés : tenus par l'intégrateur
Chaque agent écrit ses besoins sur ces fichiers dans `vocab-besoins/<lot>.json`. L'intégrateur les applique :
- `scripts/test-transferts-chaine.js` (`:502` B1, `:506` B4, `:516` et `:520` B3a) ;
- `scripts/test-vocabulaire-domaine.js` (extension du §12.4) ;
- `scripts/capture-vocab-baseline.js` (signatures, §2.7) ;
- `scripts/vocab-baseline/ecarts-restauration-attendus.json` et `exceptions-hors-restauration.json` ;
- `scripts/vocab-allow/_global.json` ;
- `scripts/vocab-accords.txt` (backend).

## 11. Changements pour un compte restauration

### 11.1 Changements visibles
Ces textes changent pour un compte restauration. Ils sont à faire valider par le client, avec le compte rendu de livraison.
1. Facture d'appro d'un transfert labo→labo : sous-titre corrigé. Il disait « Transfert labo → activité ».
2. Dans la facture d'appro, l'avenant legacy, le contrat legacy joint à l'email de bienvenue (repli sans DocuSeal), et le contrat en aperçu ou régénéré (jamais dans un document à signer, ni dans la facture acheteur, ni dans la facture d'abonnement) :
   - « → » s'écrivait « !’ », il s'écrit « › » ;
   - une donnée saisie hors Windows-1252 (arabe, emoji) s'écrivait en caractères illisibles, elle s'écrit « ? ».
3. Export Excel du tableau de bord (écran) : « Cout matiere » → « Coût matière », « Activite » → « Activité », « Production pt » → « Production PT ».
4. Exports Inventaire (activité et labo), Historique d'appro labo, Historique des transferts labo et Historique des pertes labo, pour un nom contenant un caractère hors Latin-1 (« — », « ’ ») : ils renvoyaient une erreur, ils se téléchargent. Pour les 4 premiers, le nom de fichier est assaini ; pour les pertes labo, l'en-tête mort qui levait l'erreur est supprimé. (v2.2) Pour les 4 premiers aussi, un nom qui contient un guillemet droit « " » : l'export se téléchargeait déjà, mais avec un nom de fichier coupé par le navigateur (`filename="Inventaire-Le "Chef".xlsx"`) ; le guillemet devient « - » (`Inventaire-Le -Chef-.xlsx`). Les autres noms de fichiers ne changent pas.
5. Noms d'onglets qui contiennent un nom saisi : une espace finale ou un double blanc peut disparaître, et une espace insécable (U+00A0) devient une espace simple (invisible à l'écran ; `nomFichierSur` garde l'insécable dans le nom de fichier).
6. Import du référentiel : un fichier dont la colonne 1 a été renommée n'importe plus son bandeau comme des articles.
7. Exports Inventaire (activité et labo), Historique d'appro labo et Historique des transferts labo, pour un nom qui contient `* ? : \ / [ ]` ou finit par une apostrophe : ils renvoyaient une erreur, ils se téléchargent. Le caractère devient une espace dans le nom de l'onglet.
8. (v2.4, conditionnel) Guide de mise en route, question d'un composant qui n'est pas un composant identité (code ni `activite` ni `labo`) : avant `Comment créer mon ${libellé.toLowerCase()} ?`, après `voc.avec(entreeComposantVoc(voc, c)).mon('_', n)`. Les majuscules internes et les sigles sont gardés (« Comment créer mon ECO labo ? » au lieu de « … mon eco labo ? ») et le déterminant suit le genre posé dans l'admin (« ma » pour un composant féminin). Ne concerne la restauration que si son domaine de production a un composant hors identité : à vérifier sur la lecture (4) de `controle-avant-192` (§13.2). En base locale, la restauration n'a que ses 4 composants identité : la référence ne passe pas par cette branche.

### 11.2 Changements de forme, non affichés
1. `/auth/login`, `/auth/me`, `GET /api/domaines` (client, gérant, acheteur), `GET /api/entreprise` : `domaine.lexique` vaut `null` pour un compte restauration (§5.7).
2. Chaque composant (`composants[]` du profil, `config.composants` de l'abonnement) porte deux clés de plus : `genre` et `elision`.

Un ancien écran les ignore (mesuré). L'oracle les compare EXPLICITEMENT (§2.6).

Aucun autre écart. Le reste est prouvé à l'identique par l'outil et par l'oracle.

### 11.3 Effets hors restauration, acceptés
- Un nom d'onglet qui joint un terme long et un nom saisi peut réduire la part du nom après la coupe à 31.
- « Cuisine (cuisine) » quand le nom du labo contient déjà la forme courte.
- Pendant la bascule (nouveau serveur, ancien écran), un compte de test Hôtellerie lit « P. Vendable / X » dans le filtre du tableau de bord et « Prestation vendue / X » dans le graphique.

## 12. Preuves

1. **Outil** (dans les deux dépôts) :
   - `identite` : 0 écart hors écarts admis, `generate.js` compris ; chaque squelette SQL « à relire » relu par l'intégrateur ;
   - `residuels` : 0 hors écarts admis, SQL compris (E3) ;
   - `accords` : 0, et `vocab-accords.txt` relu ;
   - `lexique` : à jour et regelé ;
   - aucun écart `provisoire` ; (v2.3) aucun besoin ouvert (`compterBesoins`) ;
   - `scripts/vocab-lots.mjs` : chaque fichier à résidus dans un seul lot.
2. **Oracle** :
   - `check-invariant-vocab.js` : restauration identique à la référence hors `ecarts-restauration-attendus.json`, aucune entrée sans emploi, aucune clé vide ;
   - `--domaine hotellerie|ceramique|miroir` : 0 forme par défaut hors exceptions typées, sites d'appel des emails et `promptReel` compris ;
   - contrôle en base locale : aucun composant identité au libellé par défaut dans un domaine non restauration, hors `miroir` avant renommage.
3. **Tests** :
   - backend : `npm test`, dont `test/rendreMessages.test.js`, `test/emailVoc.test.js`, les tests de `toolsFor(vocabDefaut)` (JSON identique) et du glossaire (absent par défaut ; en Hôtellerie, une seule ligne qui commence par « « ingrédient » », et le mot « Spa »), et les vecteurs ;
   - frontend : `vocab.test.mjs`, `vocab-check.test.mjs`, `controle-contexte.mjs`, `controle-avenant.mjs`, `npm run build`.
4. **E2E** (backend de test `node scripts/start-test-backend.js`) :
   - `test-vocabulaire-domaine.js`, étendu :
     - les messages de l'oracle sur un compte restauration (texte exact) et un compte Hôtellerie (aucune forme par défaut) ;
     - `GET /api/ai-assistant/onboarding` en Hôtellerie : « Comment créer ma cuisine ? », aucune forme « activité » ni « labo » (titres, détails, questions) ; aussi en test unitaire à faux pool, `test/B1-guide-rapport.test.js` ;
     - `/auth/me` allégé ;
     - migration 192 rejouée en transaction annulée, sur les vraies tables : composants visés remis au masculin, 1er passage (NOTICE = nombre remis par libellé), 2e passage « 0 / 0 / 0 », genres et élisions inchangés après le ROLLBACK ; la forme du SQL est aussi testée à faux pool (`test/socle-composants.test.js`) ;
     - purge de l'assistant seulement au changement de domaine : test unitaire à faux pool `test/purgeConversationsIA.test.js` (pas dans l'E2E), dont (v2.4) le cas d'une configuration sans domaine (`domaine_id` NULL, antérieure au backfill de la 187) : la rattacher au domaine par défaut ne purge rien ;
   - `test-transferts-chaine.js`, avec les attentes du §6.2 ;
   - non-régression : `check-invariant-config`, `check-invariant-stock` (il compte des sous-chaînes SQL exactes : ne pas reformater les requêtes voisines), `test-composants`, `test-onboarding-etapes`, `test-bot-onboarding` (questions restauration inchangées), `test-contrat-admin`, `test-manuel-filtre`.
   - (v2.2) Référence connue de `test-bot-onboarding` sur le backend de test, mesurée AVANT le socle (`d03cc68`) et après : 14/17. Les 3 échecs sont anciens : « chat 200 pendant la mise en route » et « le bot cite l'étape manquante » demandent un vrai appel Gemini (bouchonné) ; « questions capacités : création d'activités proposée » monte `nb_activites` alors que les questions se calculent par composant. Toute autre baisse est une régression. B1 compare la liste des contrôles verts, pas seulement leur nombre.
5. **Parcours navigateur** (complément, scripts de `labflow-reprise/lot-2/parcours-2a/`) :
   - compte Hôtellerie : tableau de bord, guide et assistant, exports, messages d'erreur visibles, onglet Composants de l'admin ;
   - compte restauration : mêmes écrans identiques à la référence.
6. **Recherche finale** des mots de la restauration hors lexique (§2.5, point 6), qui n'est pas un terme du lexique : seuls restent le texte fixe du contrat (lot 3), la description de `search_knowledge_base` et de son paramètre `query` (2c), les exemples de `voc.ex` et les seeds.

## 13. Déploiement

1. **Pré-requis** : `origin/main` contient les deux correctifs de sécurité du 02/10 (`6f6b15b`).
2. **Lecture de la production**, avant de déployer : `node scripts/controle-avant-192.js`, en lecture seule, avec les variables `DB_*` de la production. C'est une commande à lancer par le client. Garder la sortie avec le compte rendu.
   - (v2.4) Le script n'existe pas dans le conteneur de production avant la bascule (main = `0865172`). Si la base n'est joignable que dans le réseau Coolify, coller à la place **`scripts/controle-avant-192.sql`** dans le terminal psql du service Postgres : mêmes six lectures, dans `BEGIN TRANSACTION READ ONLY` … `ROLLBACK`.
   - (v2.4) Vérifier d'abord la ligne « Base lue » : `hote_serveur`, `port_serveur`, `DB_HOST` et son origine. Une variable `DB_*` absente de l'environnement est complétée par le `.env` LOCAL : le script l'annonce (« DB_HOST ne vient pas de l'environnement »). `derniere_migration` doit valoir `191_…` avant la bascule ; le script avertit si elle vaut déjà 192.
   - (v2.4) Codes de sortie : 0 = rien à corriger ; 1 = une ligne en (2), (3), (5) ou (6) ; 2 = base injoignable ou lecture impossible (rien n'a été lu).
   - (1) Composants identité renommés :

     ```sql
     SELECT d.slug, dc.code, dc.libelle, dc.libelle_pluriel
       FROM domaine_composants dc
       JOIN domaines_activite d ON d.id = dc.domaine_id
      WHERE dc.code = dc.type_technique
        AND (dc.libelle, COALESCE(dc.libelle_pluriel, '')) NOT IN
            (('Activité','Activités'), ('Labo','Labos'), ('Gérant','Gérants'), ('Base acheteurs','Base acheteurs'));
     ```

     Pour information : ils garderont leur libellé (§4.2).
   - (2) Valeurs de lexique qui contiennent `<` ou `>`.
   - (3) Libellés de composant qui contiennent `[`, `]` ou `|`.
   - (4) Composants de TOUS les domaines, avec leur libellé : liste des genres et élisions à poser dans l'admin après le déploiement de l'écran, pour ceux que la garde de la 192 n'a pas touchés (composant renommé, nouveau domaine).

   - (6) (v2.4) Noms saisis qui contiennent « [[ » ou « ]] » (articles, produits, labos, activités, fournisseurs, catégories, familles, prestataires, acheteurs, utilisateurs) : le « 0 cas en base » accepté au §5.1 n'était mesuré qu'en local.

   Si (2) ou (3) trouve une ligne : la corriger dans l'admin AVANT le déploiement, et noter la valeur avant et après dans le compte rendu. Sinon l'admin ne pourra plus enregistrer ce domaine (400). Si (6) trouve une ligne : renommer la donnée avant le déploiement (sinon elle serait rendue comme une balise dans un message, §5.1).
   Garder aussi la lecture (4) : le nombre de lignes marquées « f (posé par la 192) », par libellé (« Activité », « Base acheteurs », « Cuisine »), est la valeur attendue des trois NOTICE de la 192 (point 4).
3. **Backend d'abord.** (v2.4) La fusion dans `main` EST le déclenchement : Coolify déploie `main` à chaque poussée. Ordre :
   1. `npm test` vert, puis fusion `--no-ff` du serveur dans `develop` et `main`, et poussée de `main` du **backend** ;
   2. attendre `/health` et, dans les journaux Coolify, la ligne « Migration appliquee: 192_composants_genre_elision.sql » et ses trois NOTICE ;
   3. seulement alors : `npm run build` vert, fusion de l'écran dans `develop` et `main`, poussée de `main` du **frontend**.

   Jamais les deux builds en même temps.
4. **Contrôles après bascule** :
   - `/health` ;
   - connexion d'un compte restauration : `lexique: null`, écrans inchangés ;
   - un message d'erreur visible ;
   - un export ;
   - l'onglet Composants de l'admin : genre et élision ;
   - le guide et l'assistant d'un compte de test Hôtellerie ;
   - (v2.2) aucun composant identité féminin resté masculin. Un composant identité créé à la volée par l'ANCIEN serveur après la 192 (fenêtre où l'ancien conteneur sert encore) prend le défaut `'m'`, et la 192 ne repasse jamais. Requête de contrôle (lecture (5) de `node scripts/controle-avant-192.js`, en lecture seule), à relancer après chaque bascule et chaque redéploiement :

     ```sql
     SELECT d.slug, dc.id, dc.code, dc.libelle, dc.genre
       FROM domaine_composants dc
       JOIN domaines_activite d ON d.id = dc.domaine_id
      WHERE dc.code = dc.type_technique AND dc.genre = 'm'
        AND (dc.code, dc.libelle) IN (('activite', 'Activité'), ('acheteurs', 'Base acheteurs'));
     ```

     Une ligne trouvée se corrige dans l'onglet Composants de l'admin (genre Féminin).
   - (v2.4) les trois NOTICE de la 192 (« 192 : genre f posé sur N composant(s) « Activité » », « … « Base acheteurs » », « … « Cuisine » ») : N doit égaler, par libellé, le nombre de lignes « f (posé par la 192) » de la lecture (4) faite avant la bascule. Calcul d'après les migrations 187, 191 et 192, non mesuré : 3 / 3 / 1 si le domaine Hôtellerie a reçu le brouillon de la 187, sinon 4 / 4 / 0. La lecture (4) fait foi ;
   - (v2.4) une heure après la bascule, chercher dans les journaux Coolify du serveur : « [vocab] » (balise invalide, clé de lexique inconnue, déterminant inconnu, profil de domaine / domaine du compte / utilisateur indisponible) et « [email] voc manquant ». Attendu : 0 ligne. Ce sont les seuls signaux d'une régression silencieuse du rendu ;
   - (v2.4) connecter un **gérant** et un **acheteur** d'un compte restauration (ou demander un essai au client) : messages d'erreur et portail identiques à avant la bascule (le gérant lit le domaine du compte parent, l'acheteur celui du vendeur).
5. **Effets d'un décalage** :
   - nouveau serveur + ancien écran : lexique `null` pour la restauration (sans effet) ; un ancien onglet admin enregistre des composants sans genre ni élision, et l'upsert les garde ;
   - ancien serveur + nouvel écran (ordre interdit) : vocabulaire mêlé pour un compte de test ; les 4 clés `*_abr` d'un compte Hôtellerie prendraient le défaut.
6. **Retour arrière** : l'écran d'abord, puis le serveur. Jamais l'ancien serveur derrière le nouvel écran. La colonne `genre` reste, inoffensive. (v2.2) Mais l'ancien serveur crée ses composants identité sans genre (défaut `'m'`) : au redéploiement du nouveau, relancer la requête de contrôle du point 4 et corriger dans l'admin.
   (v2.4) Cibles : frontend `main` revenu au contenu de `62979aa`, poussé et déployé ; puis backend `main` revenu au contenu de `0865172`. Par `git revert -m 1 <commit de fusion>` sur `main`, poussé normalement : jamais de `push --force`. La migration 192 n'est pas défaite (colonnes `genre` et `elision` laissées en place).
7. **Fusion** `--no-ff` dans `develop` puis `main` dans chaque dépôt ; `npm test` avant tout push du serveur, `npm run build` avant tout push de l'écran. (v2.4) La fusion dans `main` et sa poussée SONT le déploiement du point 3 : les faire dans l'ordre du point 3, pas après.

## 14. À transmettre au client avec la livraison

- Les changements du §11.1, à valider.
- Les remarques de vocabulaire, dans les brouillons de lexique (à corriger dans l'admin, pas dans le code) :
  - Hôtellerie : « Prestation vendue » se lit « déjà vendue » (onglets, catégories, préfixes) : « Prestation vendable » ou « Prestation à la carte » serait plus juste ;
  - Hôtellerie : le composant « Cuisine » et le terme « Cuisine centrale » désignent la même chose sous deux noms ;
  - Hôtellerie et Céramique : `transfert` = « Livraison interne », alors que les commandes acheteurs parlent de « livraison » ;
  - Céramique : `supplement` = « Option », alors que « Option Revendeurs » est une option d'abonnement ;
  - les lexiques n'ont pas d'icônes : un domaine hérite des icônes de la restauration (🍔, 🍲, 🥕) ;
  - en industrie, « sous-produit » veut dire « déchet valorisable » : la locution reste au 2b, à revoir au 2c ;
  - catégorie PT « Consommables » et une éventuelle catégorie d'articles du même nom, en Hôtellerie ;
  - Céramique, et tout domaine sans `regles.types_perte`, hérite des types de perte « Avarie / Déchet » de la restauration : à fixer dans l'admin.
- Après le déploiement, poser dans l'admin le genre et l'élision des composants que la migration n'a pas touchés (§13.2, lecture 4).
- (v2.4) Espace admin : le texte de TOUTE erreur `LEXIQUE_CARACTERE_INTERDIT` change (liste des caractères refusés « [ ] | * \ ` { } $ < >, le retour à la ligne… »), et l'onglet Composants refuse désormais (400) un libellé ou un pluriel qui contient `[ ] |`, un genre ou une élision invalides. Un domaine qui en porte déjà ne s'enregistre plus : c'est l'objet des lectures (2) et (3) du §13.2.
- (v2.4) Contrats et avenants d'un compte hors restauration (texte fixe = lot 3) : une même ligne mêle les deux vocabulaires (« Option Acheteurs » | « palier jusqu'à 20 clients professionnels ») et l'objet du contrat reste « gestion pour la restauration et les métiers de bouche », y compris pour un compte Céramique. Recommandation : faire le lot 3 avant de signer le premier client hors restauration.
- (v2.4) Manuel d'utilisation (`/client/guide`) d'un compte hors restauration : entièrement en vocabulaire restauration jusqu'au lot 2c.
