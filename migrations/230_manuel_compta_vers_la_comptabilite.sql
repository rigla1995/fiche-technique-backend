-- Migration 230 : manuel de LabFlow Compta, étape F4 des factures fournisseur « Vers la comptabilité »
-- (labflow-reprise/achats-compta/PLAN-FACTURES.md §4, ETAPE-F4.md) : les écritures venues de LabFlow (origine, pièce) et
-- la page « Comptes d'achat » du dossier « Mon entreprise ». Migration du manuel seul (vocabulaire comptable fixe, jamais
-- balisé). Fiches existantes : texte remplacé seulement s'il est encore celui des migrations précédentes ; garde md5 du
-- texte par défaut, sans \r ; le texte servi suit seulement s'il n'a pas été retouché dans l'admin. Idempotent : au 2e
-- passage, la garde ne correspond plus.
UPDATE manuel_sections
   SET contenu = CASE WHEN contenu = contenu_defaut THEN f.texte ELSE contenu END,
       contenu_defaut = f.texte
  FROM (VALUES ($f230a$## ✍️ Écritures

Les écritures d'un dossier sont ses opérations comptables : chacune porte une date, un journal, la référence de sa pièce justificative, un libellé et au moins deux lignes dont le total des débits égale le total des crédits (partie double). Cette page les saisit **en brouillard** (modifiables, supprimables), puis les **valide** : une écriture validée est définitive, reçoit son numéro définitif et ne se corrige plus que par **contre-passation**. Vous ouvrez cette page depuis la fiche du dossier, carte **Tenue**, ligne **Écritures**, bouton **Ouvrir**.

### Ce que vous voyez

- **Les filtres** : le journal (tous ou un), la période (un mois de l'exercice ouvert, le mois en cours par défaut, ou toutes), l'état (toutes, brouillard, validées) et la recherche : un mot du libellé, la référence de la pièce ou un montant (par exemple 1190,500 : le total de l'écriture ou l'une de ses lignes).
- **La liste**, par pages de 25 (**Afficher plus** charge les suivantes), de la plus récente à la plus ancienne : numéro (provisoire B-000012 en brouillard, définitif AC-2026-000001 une fois validée), date (et la vraie date de l'opération quand elle diffère), journal, pièce, libellé, total et état (**Brouillard** ou **Validée**). Cliquez sur une écriture pour voir ses lignes : compte, tiers, libellé, débit, crédit, code de taxe, échéance ; puis qui l'a saisie, qui l'a validée et quand, et son lien de contre-passation s'il existe.
- **Les écritures venues de LabFlow** (dossier « Mon entreprise » d'un client LabFlow) : une facture fournisseur envoyée depuis LabFlow arrive **en brouillard** dans le journal des achats, d'origine **LabFlow (facture fournisseur)** ; **📎 Voir la pièce** ouvre la facture déposée dans LabFlow. Vous la modifiez et la validez comme toute écriture. Supprimée en brouillard, la facture redevient « à envoyer » dans LabFlow ; une fois l'écriture validée, la facture ne se supprime plus dans LabFlow. Les comptes imputés se règlent page **Comptes d'achat** (fiche du dossier).
- **Le bandeau** : le nombre d'écritures en brouillard et validées du dossier ; quand une période est choisie, le nombre d'écritures en brouillard qu'elle contient encore.
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** ou **Saisie** saisissent, modifient et suppriment les écritures en brouillard ; le titulaire et le niveau **Complet** valident, valident la période, contre-passent et **importent** (écritures, balance d'ouverture) ; le niveau **Consultation** lit. Un dossier archivé se lit, ne se saisit pas.

### Actions pas à pas

1. **Saisir une écriture** : **+ Écriture**. Choisissez le journal, la date (dans une période ouverte de l'exercice ouvert), la **référence de la pièce** (numéro de facture, de relevé… obligatoire, 80 caractères au plus), le libellé ; puis les **lignes** : le compte (recherche par numéro ou par mot du libellé ; seuls les comptes imputables, actifs et sans sous-compte actif, sont proposés), le tiers quand le compte est collectif (fournisseurs ou clients : obligatoire alors, choisi parmi les tiers actifs du même type), le libellé de la ligne (celui de l'écriture par défaut), le débit **ou** le crédit (en dinars, trois décimales au plus, la virgule est acceptée), le code de taxe (facultatif) et l'échéance (facultative ; proposée d'après le délai de paiement du tiers). Le pied affiche le total des débits, le total des crédits et l'écart : **Enregistrer** n'est possible qu'à écart nul. L'écriture reçoit un numéro provisoire et la date de traitement du serveur.
2. **Ajouter la TVA** : sur une ligne hors taxes qui porte un code de TVA (TVA19…), ce bouton crée la ligne de taxe, calculée au millime près (le demi-millime arrondi vers le haut), sur le compte du code : à l'achat ou à la vente selon le journal, sur immobilisations quand le compte de la ligne en est une. Même chose pour un droit de timbre (montant fixe) ou le FODEC. La ligne créée reste modifiable.
3. **Ajouter la retenue** : sur un journal d'achats ou de ventes, pour un tiers qui a une retenue par défaut (ou avec le code que vous choisissez), ce bouton crée la ligne de retenue à la source, calculée sur le **TTC hors timbre** (toutes les lignes sauf celles du tiers, du timbre, des retenues et des avances), au crédit du compte des retenues opérées à l'achat (432), au débit du compte des retenues subies à la vente (4341) ; la ligne du tiers passe au net. Le même bouton sert aux **retenues de TVA** (RSTVA25, RSTVA100 : calculées sur les lignes de TVA, ajoutez la TVA d'abord) et aux **avances** (AV_FORF1, AV_ALC5 : sur le TTC hors timbre, du même côté que la pièce ; la ligne du tiers augmente). Le seuil de 1 000 D des retenues sur achats s'apprécie par paiement : retirez la ligne quand la retenue n'est pas due.
4. **Modifier** / **Supprimer** une écriture en brouillard : depuis ses lignes. Le journal de la comptabilité garde la valeur d'avant et celle d'après, et le contenu d'une écriture supprimée.
5. **Valider** une écriture (titulaire, Complet) : depuis ses lignes ; une confirmation rappelle que c'est **définitif**. L'écriture reçoit son **numéro définitif**, continu par journal et par exercice (AC-2026-000001, AC-2026-000002…), l'auteur et l'heure de la validation ; elle ne se modifie plus et ne se supprime plus.
6. **Valider la période** : choisissez une période dans les filtres ; le bouton valide **toutes** ses écritures en brouillard, dans l'ordre des dates puis des numéros provisoires (la numérotation suit ainsi la chronologie). La validation a lieu au plus tard à la fin de chaque mois (NC 01 §54).
7. **Contre-passer** une écriture validée (titulaire, Complet) : une erreur dans une écriture validée se corrige par une écriture inverse — mêmes comptes, mêmes tiers, mêmes codes, débits et crédits échangés —, dans le même journal, datée du jour (ou de la date que vous choisissez, dans une période ouverte, jamais avant l'écriture d'origine), libellée « Contre-passation de … », validée aussitôt avec le numéro suivant et liée à l'écriture d'origine (le lien se voit sur les deux). Saisissez ensuite l'écriture correcte. Une écriture ne se contre-passe qu'une fois.
8. **Opération d'une période close** : si la date choisie tombe dans une période close, la fenêtre propose de l'enregistrer **au premier jour de la période ouverte suivante en gardant sa vraie date** (NC 01 §61) ; la liste montre les deux dates. La vraie date sert aussi au contrôle des échéances.
9. **Importer (Excel)** (titulaire, Complet) : des écritures préparées dans le **modèle** téléchargeable — une rangée par ligne d'écriture ; les rangées d'une même écriture se suivent et portent le même repère dans la colonne **Écriture** (1, 2, 3…) ; journal (par son code), date (JJ/MM/AAAA), pièce et libellé sur la première rangée ; compte par son numéro, tiers par son code (obligatoire sur un compte collectif), code de taxe par son code, un débit ou un crédit par rangée, échéance facultative. Chaque écriture obéit aux règles de la saisie (partie double, période ouverte, comptes imputables…) et naît **en brouillard** avec son numéro provisoire : vous les relisez, puis les validez. **Toutes les écritures sont contrôlées avant d'écrire : à la moindre erreur, rien n'est importé** et le rapport dit, rangée par rangée, ce qu'il faut corriger. 2 000 rangées au plus par fichier.
10. **Importer une balance d'ouverture** (titulaire, Complet) : pour un dossier repris d'un autre logiciel, les soldes au premier jour de l'exercice, préparés dans le **modèle** (une rangée par compte, et par tiers sur un compte collectif : compte, tiers, libellé, débit ou crédit). L'import crée **une écriture d'à-nouveaux** dans le journal **AN**, datée du premier jour de l'exercice ouvert, pièce AN-AAAA, **en brouillard** : relisez-la, puis validez-la. Le total des débits doit égaler le total des crédits ; un exercice qui a déjà des à-nouveaux refuse l'import (supprimez l'écriture en brouillard, ou corrigez-la). Les à-nouveaux forment le solde d'ouverture des comptes dans le grand livre et la balance (page **Livres**).

### Points d'attention

:::attention
Une écriture refusée le dit : débits et crédits différents, moins de deux lignes ou un seul compte, date hors de l'exercice ouvert ou dans une période close, journal désactivé, compte non imputable (désactivé ou avec des sous-comptes actifs), tiers manquant sur un compte collectif ou posé sur un autre compte, code de taxe désactivé, échéance avant la date de l'écriture (ou sa vraie date).
:::

:::attention
Validé = définitif (NC 01 §54, §56) : une écriture validée ne se modifie ni ne se supprime ; elle se contre-passe. Dès qu'une écriture existe, le dossier ne se supprime plus et les dates de son exercice ne changent plus ; un compte, un journal ou un code de taxe porté par une écriture ne se désactive ni ne se supprime plus ; un tiers porté par une écriture ne se supprime plus (il se désactive), son code et son compte collectif ne changent plus. La date de traitement est celle du serveur, jamais modifiable (NC 01).
:::

:::astuce
Le numéro provisoire (B-000012) n'est pas le numéro définitif : celui-ci, continu par journal et par exercice (AC-2026-000001), est attribué à la validation. Un brouillard supprimé ne laisse donc aucun trou dans la série définitive ; pour une numérotation dans l'ordre des dates, validez par période. La clôture des périodes, leur réouverture et le journal général imprimable sont sur la page **Périodes** (fiche « Validation et périodes ») ; le grand livre, la balance et le livre-journal, sur la page **Livres** (fiche « Grand livre et balance »).
:::
$f230a$, 'compta-ecritures', '1122d0a9589e99b3c2839a221d6c599e'),
($f230b$## 🗂️ Fiche du dossier

Cette page présente un dossier : son identité, son régime fiscal, son exercice en cours, sa configuration et les personnes qui y ont accès. Vous l'ouvrez depuis la page **Dossiers** (cabinet), **Cabinet** (collaborateur d'un cabinet), **Ma comptabilité** (client LabFlow) ou **Comptabilité de …** (comptable d'un client).

### Ce que vous voyez

- **Identité** : raison sociale, nom commercial, forme juridique, matricule fiscal, RNE, adresse, représentant légal. **Modifier** ouvre le formulaire, lecture de la patente comprise. Le dossier **« Mon entreprise »** d'un client LabFlow porte la mention **LabFlow** : son identité a été copiée de son compte LabFlow le jour de sa création.
- **Régime fiscal** : personne, impôt, TVA, exportateur total, télédéclaration, début d'activité. **Modifier** le change.
- **Exercice en cours** : ses dates et ses périodes mensuelles, avec leur état (ouverte ou close : page **Périodes**). **Modifier** change ses dates tant qu'aucune écriture n'est enregistrée ; les périodes sont refaites. Dès la première écriture, ce bouton disparaît.
- **Configuration** : le **plan de comptes** du dossier (nombre de comptes actifs), ses **journaux**, ses **codes de taxe** et ses **tiers** (fournisseurs et clients ; nombre de chacun) ; **Ouvrir** mène aux pages **Plan de comptes**, **Journaux**, **Taxes** et **Tiers** (voir leurs fiches dans ce manuel).
- **Tenue** : les **écritures** du dossier (en brouillard, validées), ses **périodes** (ouvertes, closes), ses **livres** — grand livre, balance, journaux —, le **lettrage** (lignes validées à lettrer) et l'**échéancier** (ce qui reste dû aux fournisseurs et par les clients, dont la part échue) ; **Ouvrir** mène aux pages **Écritures**, **Périodes**, **Livres**, **Lettrage** et **Échéancier** (fiches de ce manuel).
- **Taxes** : les **taxes du mois** de la période en cours — TVA à payer ou crédit à reporter, pièces à retenue qui attendent leur certificat, certificats produits — ; **Ouvrir** mène à la page **Taxes du mois** (fiche « Taxes du mois et certificats »). La ligne **Déclaration mensuelle** montre le mois à déclarer et son échéance, ou la date de sa déclaration ; **Ouvrir** mène à la page **Déclaration mensuelle** (fiche « Déclaration mensuelle »).
- **Comptes d'achat** (dossier « Mon entreprise » d'un client LabFlow, carte **Configuration**) : où sont imputées les factures fournisseur envoyées depuis LabFlow ; **Ouvrir** mène à la page **Comptes d'achat** (ci-dessous).
- **Accès** : les personnes qui voient ce dossier (titulaire et gérants), avec leur niveau.

### Actions pas à pas

1. **Archiver** (titulaire) : le dossier sort de la liste courante ; rien n'est effacé. **Désarchiver** le remet dans la liste.
2. **Supprimer** (titulaire) : possible seulement pour un dossier sans écriture ; une confirmation est demandée. Le journal de la comptabilité garde la trace de la suppression.
3. **Reprendre l'identité de LabFlow** (dossier « Mon entreprise » d'un client LabFlow) : recopie dans le dossier les champs que le compte LabFlow connaît (un champ vide dans LabFlow n'efface rien) ; utile après une correction dans LabFlow, page **Mon entreprise**. Dans l'autre sens, rien ne change : modifier le dossier ne touche pas au compte LabFlow. Ce dossier ne se supprime pas : il s'archive.

### Comptes d'achat (client LabFlow)

Quand le client LabFlow envoie une facture fournisseur à la comptabilité (case **Envoyer à la comptabilité**, ou bouton de sa page Factures), l'écriture d'achat arrive **en brouillard** dans le journal des achats du dossier « Mon entreprise » : pièce = n° de la facture, montants exacts de la facture (HT par compte et par code de TVA, remise répartie, FODEC, TVA déductible par taux, timbre), le fournisseur au crédit — devenu **tiers** du dossier, retrouvé par son matricule, sinon créé (F0001…). Vous la vérifiez puis la validez comme toute écriture (page **Écritures**).

La page **Comptes d'achat** règle le compte imputé, sans toucher aux écritures déjà faites :

1. **Catégories** : le compte d'une catégorie vaut pour tous ses articles ; ouvrez une catégorie pour régler un **article** à part (son réglage l'emporte).
2. **Frais hors stock** : transport, frais de livraison, consigne, prestation, autre frais.
3. **Choisir le compte** ouvre la recherche d'un compte de charges (classe 6 ; un compte collectif fournisseurs ne convient qu'à la consigne) ; **Revenir au compte par défaut** efface le réglage.

Sans réglage, le compte par défaut vient de la famille de l'article dans LabFlow : **601** pour les ingrédients (famille utilisée dans les recettes) et les articles sans famille, **607** pour ce qui est revendu en l'état (famille vendue, non utilisée dans les recettes), **6022** pour les fournitures (ni l'une ni l'autre) ; transport et livraison **6241**, consigne **4096**, prestation **604**, autre frais **606**. Le titulaire et le niveau **Complet** règlent ; les autres niveaux lisent.

:::attention
Un compte subdivisé ou désactivé ne reçoit pas d'écriture : l'envoi de la facture est refusé dans LabFlow avec le nom du compte, jusqu'à ce qu'un compte imputable soit choisi ici. Un taux de TVA sans code actif (6 % ou 12 % par exemple) est refusé de même : créez le code (page **Taxes**).
:::

### Points d'attention

:::attention
Un dossier qui a des écritures ne se supprime jamais : il s'archive. Un dossier archivé ne se modifie pas tant qu'il n'est pas désarchivé : sa configuration non plus.
:::

:::attention
Quand l'abonnement de la comptabilité attend un paiement, les dossiers restent consultables mais ne se modifient plus.
:::$f230b$, 'compta-dossier', 'ca589f149cd4f458d2b4bffed4922870')
  ) AS f(texte, slug, garde)
 WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'
   AND md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde;
