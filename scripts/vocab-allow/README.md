# scripts/vocab-allow — écarts admis par l'outil de preuve (dépôt backend)

L'outil de preuve du vocabulaire vit dans le dépôt frontend (`scripts/vocab-check.mjs`, spec `docs/lot-2-spec.md` §2.5).
Il s'applique au backend par `--root` et lit les écarts admis de CE dossier :

```
cd ../fiche-technique-frontend
node scripts/vocab-check.mjs identite  --root ../fiche-technique-backend
node scripts/vocab-check.mjs residuels --root ../fiche-technique-backend
```

Attendu : `identite` 0 écart hors des entrées de ce dossier. Le format des entrées, les types et les règles
(une entrée « avant: null » ou « apres: null » n'absorbe que `occurrences` unités, 1 par défaut ; un extrait
admis porte le terme avec un mot plein) sont décrits dans `fiche-technique-frontend/scripts/vocab-allow/README.md`.

Un fichier par lot du sous-lot 2b (spec `docs/lot-2b-spec.md` §3.1, §10) : `socle.json`, `B1.json`, `B2.json`,
`B3a.json`, `B3b.json`, `B4.json`, `B5.json` (B6, les écrans, est au frontend). Un agent n'écrit que dans le
fichier de son lot ; chaque entrée est typée, justifiée et relue. `_global.json` (entrées `"fichier": "*"`,
mode residuels) n'est écrit QUE par l'intégrateur : un agent qui a besoin d'une entrée globale l'écrit dans ses
`besoins`. La répartition des fichiers entre lots est celle de `scripts/vocab-lots.mjs`.

`archives-2a/S3.json` : les 88 écarts du socle 2a (`req.voc`, validation du lexique, domaine de l'acheteur),
tous sans objet depuis le réépinglage de `scripts/vocab-check.base` sur la tête du 2a. Archivés, NON lus par
l'outil : une entrée `avant: null` sans objet absorberait en silence un nouveau littéral identique.

Autres fichiers lus par l'outil dans ce dépôt : `scripts/vocab-rendu.json` (points de rendu déclarés des
balises, E2 : liste fermée tenue par le socle) ; il écrit `scripts/vocab-accords.txt` (mode `accords`, passage
complet, régénéré par l'intégrateur seulement).
