# Oracle du vocabulaire (lot 2b, étape O)

Spécification : `docs/lot-2b-spec.md` §2. Seul l'intégrateur lance ces commandes : une capture charge
l'application dans son processus, ce qui APPLIQUE les migrations en attente à la base locale.

## Fichiers

| Fichier | Rôle |
|---|---|
| `restauration.json` | Référence commitée : captures du domaine restauration (`meta`, `comptes` par clé, `captures` masquées). `meta.rangsTri` : rangs de la clé de tri des listes d'`ordre-libre.json` à `cleTri`, calculés avant masquage. |
| `ecarts-restauration-attendus.json` | Écarts admis, un par entrée `{ cle, chemin, avant, apres, raison: '§11.1.n' \| '§11.2.n' }`, plus `type: 'ordre-cles'` pour une permutation de clés. Vide à l'étape O. Tenu par l'intégrateur. |
| `ordre-libre.json` | Listes dont l'ordre peut changer `{ cle, chemin, raison, cleTri? }` (voir « Ordre » ci-dessous). |
| `exceptions-hors-restauration.json` | Exceptions typées du scan hors restauration `{ cle, chemin (motif), texte, type, justification, domaines? }`. |
| `hors-restauration-avant.json` | Liste de travail de l'étape O : formes par défaut trouvées par domaine, chiffrées par famille. Complète depuis S1 (clés `*_abr` comprises) pour hotellerie, ceramique et miroir ; son `_lisezmoi` ne la dit « incomplète » que si un domaine a encore des clés absentes du moteur de son passage. |

## Commandes (depuis la racine du dépôt backend)

```
node scripts/capture-vocab-baseline.js --reference            # recapture la référence (restauration)
node scripts/check-invariant-vocab.js                          # nouvelle capture, comparée à la référence
node scripts/check-invariant-vocab.js --domaine hotellerie     # idem ceramique, miroir : scan des formes par défaut
node scripts/check-invariant-vocab.js --domaine miroir --liste-avant   # réécrit la section du domaine dans la liste de travail
```

Options : `--capture <fichier>` (analyser une capture déjà faite), `--reference <fichier>`, `--rapport <fichier>`, `--port <n>`.

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
