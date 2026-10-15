-- Migration 244 : manuel de LabFlow Compta, étape E2 « Les flux de trésorerie, les notes et le jeu complet »
-- (labflow-reprise/achats-compta/PLAN-ETATS-FINANCIERS.md §2 ligne E2 ; réponses 3 et 4 du client du 14/10) : la fiche
-- « États financiers » décrit l'état des flux (méthode indirecte), les notes (soldes intermédiaires de gestion, détail des
-- postes, texte libre), le jeu complet en PDF. Migration du manuel seul (vocabulaire comptable fixe, jamais balisé) : texte
-- remplacé seulement s'il est encore celui de la migration 242 ; garde md5 du texte par défaut, sans \r ; le texte servi
-- suit seulement s'il n'a pas été retouché dans l'admin ; les mots-clés suivent. Idempotente : au 2e passage, la garde ne
-- correspond plus.
UPDATE manuel_sections
   SET contenu = CASE WHEN contenu = contenu_defaut THEN f.texte ELSE contenu END,
       contenu_defaut = f.texte,
       mots_cles = f.mots
  FROM (VALUES ($f244a$## 📊 États financiers

Le **bilan** (annexe 1 de la NC 01), l'**état de résultat** (annexe 3, présentation autorisée par nature), l'**état des flux de trésorerie** (annexe 5, méthode indirecte) et les **notes** (soldes intermédiaires de gestion, détail des postes, texte libre) d'un exercice, calculés à la demande sur les écritures du dossier : seul le texte libre des notes s'enregistre. Vous ouvrez cette page depuis la fiche du dossier (carte **Tenue**, ligne **États financiers**), depuis la page **Livres** ou depuis l'assistant de clôture.

### Ce que vous voyez

- **L'exercice** : choisissez-le, clos ou en cours. Un exercice **clos** donne des états définitifs (« Exercice clos le 31/12/2025 ») ; un exercice **non clos** donne une **situation provisoire**, dite sur chaque page ; cochez **Brouillard compris** pour y inclure les écritures en brouillard (provisoire aussi).
- **Deux colonnes** : l'exercice choisi et l'exercice précédent du dossier, calculé de la même façon (NC 01 §20). Pour le premier exercice tenu dans LabFlow Compta, la seconde colonne est vide.
- **Le bilan** : actifs non courants (immobilisations et leurs amortissements), actifs courants (stocks, clients, autres actifs courants, placements, liquidités) ; capitaux propres (capital, réserves, autres capitaux propres, résultats reportés, **résultat de l'exercice**), passifs non courants et courants. Les postes à zéro sur les deux exercices ne sont pas présentés.
- **L'état de résultat** par nature : revenus et autres produits d'exploitation, charges d'exploitation (achats consommés, personnel, dotations, autres charges), résultat d'exploitation, charges financières et produits des placements, gains et pertes ordinaires, impôt, éléments extraordinaires, **résultat net**.
- **L'état des flux de trésorerie** (méthode indirecte) : du résultat net à la variation de trésorerie (amortissements et provisions, variation des stocks, des créances et des dettes), puis les activités d'investissement (acquisitions et cessions d'immobilisations, à leur valeur d'origine) et de financement (apports, dividendes, emprunts reçus et remboursés, comptes courants des associés) ; trésorerie au début et à la fin (banques, caisses, concours bancaires courants). Son contrôle : la somme des flux égale la variation de trésorerie.
- **Les notes** : les **soldes intermédiaires de gestion** (annexe 8 : marge commerciale, production, marge sur coût matières, valeur ajoutée, excédent brut d'exploitation, résultat des activités ordinaires, résultat net), le **détail des postes** (chaque poste déplié sur ses comptes) et un **texte libre** par exercice (méthodes comptables, faits marquants), rédigé par le titulaire ou un gérant de niveau Complet, même après la clôture.
- **Chaque poste s'ouvre** sur les comptes qui le composent, avec leurs montants sur les deux exercices : c'est le renvoi des notes (NC 01 §39 et §55).
- **Les contrôles** : bilan équilibré, résultat de l'état de résultat égal au résultat des comptes (et au résultat figé à la clôture), tous les comptes à solde rattachés à un poste, flux de trésorerie bouclés.
- **Les mentions** de la NC 01 (§19) : entreprise, matricule fiscal, date d'arrêté ou situation provisoire, unité monétaire — sur la page et sur chaque page du PDF.

### Actions pas à pas

1. **Choisir l'exercice** et, s'il le faut, **Brouillard compris**. Les états se relisent aussitôt.
2. **Relire les contrôles**. Un compte **sans poste** (un compte ajouté hors de la nomenclature, « 19 » par exemple) déséquilibre le bilan : remplacez-le par un compte de la nomenclature ou un de ses sous-comptes (page **Plan de comptes**), puis reprenez les écritures qui le portent.
3. **PDF** : le bilan et l'état de résultat en A4 ; **Jeu complet (PDF)** : bilan, état de résultat, flux de trésorerie et notes en un seul document paginé, à transcrire au livre d'inventaire.
4. **Rédiger les notes** (titulaire, Complet) : le texte libre de l'exercice (méthodes comptables, faits marquants, 20 000 caractères au plus), puis **Enregistrer** ; il figure dans le jeu complet. Le journal de la comptabilité garde chaque enregistrement.

### Points d'attention

:::attention
La correspondance entre les comptes et les postes vient du paquet tunisien et ne se règle pas dossier par dossier : un sous-compte suit son compte ; un compte de tiers va à l'actif s'il est débiteur et au passif s'il est créditeur, compte par compte (pas de compensation). Le compte 13 (résultat de l'exercice précédent non encore affecté) va en **Résultats reportés** ; le **Résultat de l'exercice** vient des comptes de charges et de produits.
:::

:::astuce
Après la clôture, l'écriture de détermination du résultat est **exclue** de la lecture : les charges et les produits de l'exercice clos restent lisibles tels qu'ils étaient. Dans les flux, une cession d'immobilisation figure à sa valeur d'origine (la plus ou moins-value reste dans le résultat net) et les transferts de charges dans la variation des postes qu'ils touchent.
:::
$f244a$, 'compta-etats', 'c38ff9b4750dd7e0e86ed0b3872ea15f', 'états financiers, bilan, état de résultat, flux de trésorerie, notes, soldes intermédiaires de gestion, SIG, marge commerciale, valeur ajoutée, excédent brut d''exploitation, jeu complet, livre d''inventaire, actifs, passifs, capitaux propres, résultat de l''exercice, résultat net, NC 01, annexe 1, annexe 3, annexe 5, annexe 8, situation provisoire, exercice clos, exercice précédent, PDF, postes, compte sans poste, immobilisations, amortissements, stocks, clients, fournisseurs, liquidités, emprunts, revenus, charges d''exploitation, méthodes comptables, faits marquants')
  ) AS f(texte, slug, garde, mots)
 WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'
   AND md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde;
