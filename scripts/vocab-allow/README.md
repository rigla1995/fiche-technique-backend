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

Un fichier par lot : `S3.json` (socle 2a du backend : `req.voc`, validation du lexique, domaine de l'acheteur),
puis `B1.json` … `B5.json` au sous-lot 2b. Un agent n'écrit que dans le fichier de son lot ; chaque entrée est
typée, justifiée et relue.
