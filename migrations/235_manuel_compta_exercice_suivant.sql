-- Migration 235 : manuel de LabFlow Compta, étape X1 « L'exercice suivant » (labflow-reprise/achats-compta/PLAN-EXERCICES.md
-- §2 ligne X1, §3 ; réponses du client du 13/10 — « ok pour les 5 ») : deux exercices ouverts, ouverture de l'exercice
-- suivant à la main ou d'elle-même, millésime des numéros, choix de l'exercice (Écritures, Périodes, Livres), soldes
-- d'ouverture et crédit de TVA provisoires, balance d'ouverture importée dans le premier exercice. Migration du manuel seul
-- (vocabulaire comptable fixe, jamais balisé). Fiches existantes : texte remplacé seulement s'il est encore celui des
-- migrations précédentes ; garde md5 du texte par défaut, sans \r ; le texte servi suit seulement s'il n'a pas été retouché
-- dans l'admin. Idempotent : au 2e passage, la garde ne correspond plus.
UPDATE manuel_sections
   SET contenu = CASE WHEN contenu = contenu_defaut THEN f.texte ELSE contenu END,
       contenu_defaut = f.texte
  FROM (VALUES ($f235a$## 🗂️ Fiche du dossier

Cette page présente un dossier : son identité, son régime fiscal, ses exercices, sa configuration et les personnes qui y ont accès. Vous l'ouvrez depuis la page **Dossiers** (cabinet), **Cabinet** (collaborateur d'un cabinet), **Ma comptabilité** (client LabFlow) ou **Comptabilité de …** (comptable d'un client).

### Ce que vous voyez

- **Identité** : raison sociale, nom commercial, forme juridique, matricule fiscal, RNE, adresse, représentant légal. **Modifier** ouvre le formulaire, lecture de la patente comprise. Le dossier **« Mon entreprise »** d'un client LabFlow porte la mention **LabFlow** : son identité a été copiée de son compte LabFlow le jour de sa création.
- **Régime fiscal** : personne, impôt, TVA, exportateur total, télédéclaration, début d'activité. **Modifier** le change.
- **Exercices** : l'exercice en cours (celui qui contient la date du jour) et, quand il est ouvert, l'exercice suivant, chacun avec ses dates, son année — le **millésime** de ses numéros définitifs (AC-2027-000001) — et ses périodes mensuelles, avec leur état (ouverte ou close : page **Périodes**). **Modifier les dates** change les dates du premier exercice tant qu'aucune écriture n'est enregistrée et que l'exercice suivant n'est pas ouvert ; les périodes sont refaites.
- **Configuration** : le **plan de comptes** du dossier (nombre de comptes actifs), ses **journaux**, ses **codes de taxe** et ses **tiers** (fournisseurs et clients ; nombre de chacun) ; **Ouvrir** mène aux pages **Plan de comptes**, **Journaux**, **Taxes** et **Tiers** (voir leurs fiches dans ce manuel).
- **Tenue** : les **écritures** du dossier (en brouillard, validées), ses **périodes** (ouvertes, closes), ses **livres** — grand livre, balance, journaux —, le **lettrage** (lignes validées à lettrer) et l'**échéancier** (ce qui reste dû aux fournisseurs et par les clients, dont la part échue) ; **Ouvrir** mène aux pages **Écritures**, **Périodes**, **Livres**, **Lettrage** et **Échéancier** (fiches de ce manuel).
- **Taxes** : les **taxes du mois** de la période en cours — TVA à payer ou crédit à reporter, pièces à retenue qui attendent leur certificat, certificats produits — ; **Ouvrir** mène à la page **Taxes du mois** (fiche « Taxes du mois et certificats »). La ligne **Déclaration mensuelle** montre le mois à déclarer et son échéance, ou la date de sa déclaration ; **Ouvrir** mène à la page **Déclaration mensuelle** (fiche « Déclaration mensuelle »).
- **Comptes d'achat** (dossier « Mon entreprise » d'un client LabFlow, carte **Configuration**) : où sont imputées les factures fournisseur envoyées depuis LabFlow ; **Ouvrir** mène à la page **Comptes d'achat** (ci-dessous).
- **Accès** : les personnes qui voient ce dossier (titulaire et gérants), avec leur niveau.

### Actions pas à pas

1. **Archiver** (titulaire) : le dossier sort de la liste courante ; rien n'est effacé. **Désarchiver** le remet dans la liste.
2. **Supprimer** (titulaire) : possible seulement pour un dossier sans écriture ; une confirmation est demandée. Le journal de la comptabilité garde la trace de la suppression.
3. **Reprendre l'identité de LabFlow** (dossier « Mon entreprise » d'un client LabFlow) : recopie dans le dossier les champs que le compte LabFlow connaît (un champ vide dans LabFlow n'efface rien) ; utile après une correction dans LabFlow, page **Mon entreprise**. Dans l'autre sens, rien ne change : modifier le dossier ne touche pas au compte LabFlow. Ce dossier ne se supprime pas : il s'archive.
4. **Ouvrir l'exercice suivant** (titulaire, Complet ; carte **Exercices**) : ouvre l'exercice qui suit le dernier — à partir du lendemain de sa fin, sur 12 mois (une fin plus proche peut être choisie : changement de date de clôture) —, avec ses périodes mensuelles ouvertes. Inutile d'y penser au 1ᵉʳ janvier : il s'ouvre **de lui-même** à la première écriture datée de la nouvelle année (saisie, import, contre-passation, facture envoyée depuis LabFlow), pourvu que cette date soit passée. Le journal de la comptabilité garde chaque ouverture : à la main ou d'elle-même, et ce qui l'a déclenchée.

### Comptes d'achat (client LabFlow)

Quand le client LabFlow envoie une facture fournisseur à la comptabilité (case **Envoyer à la comptabilité**, ou bouton de sa page Factures), l'écriture d'achat arrive **en brouillard** dans le journal des achats du dossier « Mon entreprise » : pièce = n° de la facture, montants exacts de la facture (HT par compte et par code de TVA, remise répartie, FODEC, TVA déductible par taux, timbre), le fournisseur au crédit du TTC — devenu **tiers** du dossier, retrouvé par son matricule fiscal (les 7 chiffres de l'identifiant, quelle que soit sa forme), sinon créé (F0001…). Dossier au régime **forfaitaire** ou **non assujetti** : la TVA payée n'est pas déductible, elle s'ajoute aux comptes d'achat (aucune ligne de TVA déductible). Vous la vérifiez puis la validez comme toute écriture (page **Écritures**).

La page **Comptes d'achat** règle le compte imputé, sans toucher aux écritures déjà faites :

1. **Catégories** : le compte d'une catégorie vaut pour tous ses articles ; ouvrez une catégorie pour régler un **article** à part (son réglage l'emporte).
2. **Frais hors stock** : transport, frais de livraison, consigne, prestation, autre frais.
3. **Choisir le compte** ouvre la recherche d'un compte de charges (classe 6 ; pour la consigne, aussi un compte fournisseurs comme 4096) ; **Revenir au compte par défaut** efface le réglage.

Sans réglage, le compte par défaut vient de la famille de l'article dans LabFlow : **601** pour les ingrédients (famille utilisée dans les recettes) et les articles sans famille, **607** pour ce qui est revendu en l'état (famille vendue, non utilisée dans les recettes), **6022** pour les fournitures (ni l'une ni l'autre) ; transport et livraison **6241**, consigne **4096**, prestation **604**, autre frais **606**. Le titulaire et le niveau **Complet** règlent ; les autres niveaux lisent.

:::attention
Un compte subdivisé ou désactivé ne reçoit pas d'écriture : l'envoi de la facture est refusé dans LabFlow avec le nom du compte, jusqu'à ce qu'un compte imputable soit choisi ici. Un taux de TVA sans code actif (6 % ou 12 % par exemple) est refusé de même : créez le code (page **Taxes**).
:::

### Points d'attention

:::attention
Un dossier tient **deux exercices ouverts au plus** : pendant que l'exercice qui se termine attend son bilan, on saisit déjà dans le suivant (choix de l'exercice sur les pages Écritures, Périodes et Livres). Un troisième ne s'ouvre qu'une fois le plus ancien clos (la clôture de l'exercice arrive à une étape ultérieure). Tant que l'exercice précédent n'est pas clos, les soldes d'ouverture du suivant (balance, grand livre, crédit de TVA) sont **provisoires** : repris de ses soldes de fin, calculés, rien n'est écrit.
:::

:::attention
Un dossier qui a des écritures ne se supprime jamais : il s'archive. Un dossier archivé ne se modifie pas tant qu'il n'est pas désarchivé : sa configuration non plus.
:::

:::attention
Quand l'abonnement de la comptabilité attend un paiement, les dossiers restent consultables mais ne se modifient plus.
:::$f235a$, 'compta-dossier', '8ce4632f8aabd99db49759e6de7b1d59'),
($f235b$## ✍️ Écritures

Les écritures d'un dossier sont ses opérations comptables : chacune porte une date, un journal, la référence de sa pièce justificative, un libellé et au moins deux lignes dont le total des débits égale le total des crédits (partie double). Cette page les saisit **en brouillard** (modifiables, supprimables), puis les **valide** : une écriture validée est définitive, reçoit son numéro définitif et ne se corrige plus que par **contre-passation**. Vous ouvrez cette page depuis la fiche du dossier, carte **Tenue**, ligne **Écritures**, bouton **Ouvrir**.

### Ce que vous voyez

- **Les filtres** : le journal (tous ou un), l'**exercice** (quand le dossier en a deux ouverts : celui du jour par défaut ; la liste ne montre que ses écritures), la période (un mois de cet exercice, le mois en cours par défaut, ou toutes), l'état (toutes, brouillard, validées) et la recherche : un mot du libellé, la référence de la pièce ou un montant (par exemple 1190,500 : le total de l'écriture ou l'une de ses lignes).
- **La liste**, par pages de 25 (**Afficher plus** charge les suivantes), de la plus récente à la plus ancienne : numéro (provisoire B-000012 en brouillard, définitif AC-2026-000001 une fois validée), date (et la vraie date de l'opération quand elle diffère), journal, pièce, libellé, total et état (**Brouillard** ou **Validée**). Cliquez sur une écriture pour voir ses lignes : compte, tiers, libellé, débit, crédit, code de taxe, échéance ; puis qui l'a saisie, qui l'a validée et quand, et son lien de contre-passation s'il existe.
- **Les écritures venues de LabFlow** (dossier « Mon entreprise » d'un client LabFlow) : une facture fournisseur envoyée depuis LabFlow arrive **en brouillard** dans le journal des achats, d'origine **LabFlow (facture fournisseur)** ; **📎 Voir la pièce** ouvre la facture déposée dans LabFlow. Vous la modifiez et la validez comme toute écriture. Supprimée en brouillard, la facture redevient « à envoyer » dans LabFlow ; une fois l'écriture validée, la facture ne se supprime plus dans LabFlow. Les comptes imputés se règlent page **Comptes d'achat** (fiche du dossier).
- **Le bandeau** : le nombre d'écritures en brouillard et validées du dossier ; quand une période est choisie, le nombre d'écritures en brouillard qu'elle contient encore.
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** ou **Saisie** saisissent, modifient et suppriment les écritures en brouillard ; le titulaire et le niveau **Complet** valident, valident la période, contre-passent et **importent** (écritures, balance d'ouverture) ; le niveau **Consultation** lit. Un dossier archivé se lit, ne se saisit pas.

### Actions pas à pas

1. **Saisir une écriture** : **+ Écriture**. Choisissez le journal, la date (dans une période ouverte d'un exercice ouvert ; une date déjà passée de la nouvelle année ouvre l'exercice suivant, action 11), la **référence de la pièce** (numéro de facture, de relevé… obligatoire, 80 caractères au plus), le libellé ; puis les **lignes** : le compte (recherche par numéro ou par mot du libellé ; seuls les comptes imputables, actifs et sans sous-compte actif, sont proposés), le tiers quand le compte est collectif (fournisseurs ou clients : obligatoire alors, choisi parmi les tiers actifs du même type), le libellé de la ligne (celui de l'écriture par défaut), le débit **ou** le crédit (en dinars, trois décimales au plus, la virgule est acceptée), le code de taxe (facultatif) et l'échéance (facultative ; proposée d'après le délai de paiement du tiers). Le pied affiche le total des débits, le total des crédits et l'écart : **Enregistrer** n'est possible qu'à écart nul. L'écriture reçoit un numéro provisoire et la date de traitement du serveur.
2. **Ajouter la TVA** : sur une ligne hors taxes qui porte un code de TVA (TVA19…), ce bouton crée la ligne de taxe, calculée au millime près (le demi-millime arrondi vers le haut), sur le compte du code : à l'achat ou à la vente selon le journal, sur immobilisations quand le compte de la ligne en est une. Même chose pour un droit de timbre (montant fixe) ou le FODEC. La ligne créée reste modifiable.
3. **Ajouter la retenue** : sur un journal d'achats ou de ventes, pour un tiers qui a une retenue par défaut (ou avec le code que vous choisissez), ce bouton crée la ligne de retenue à la source, calculée sur le **TTC hors timbre** (toutes les lignes sauf celles du tiers, du timbre, des retenues et des avances), au crédit du compte des retenues opérées à l'achat (432), au débit du compte des retenues subies à la vente (4341) ; la ligne du tiers passe au net. Le même bouton sert aux **retenues de TVA** (RSTVA25, RSTVA100 : calculées sur les lignes de TVA, ajoutez la TVA d'abord) et aux **avances** (AV_FORF1, AV_ALC5 : sur le TTC hors timbre, du même côté que la pièce ; la ligne du tiers augmente). Le seuil de 1 000 D des retenues sur achats s'apprécie par paiement : retirez la ligne quand la retenue n'est pas due.
4. **Modifier** / **Supprimer** une écriture en brouillard : depuis ses lignes. Le journal de la comptabilité garde la valeur d'avant et celle d'après, et le contenu d'une écriture supprimée.
5. **Valider** une écriture (titulaire, Complet) : depuis ses lignes ; une confirmation rappelle que c'est **définitif**. L'écriture reçoit son **numéro définitif**, continu par journal et par exercice (AC-2026-000001, AC-2026-000002… ; l'année est le **millésime** de l'exercice), l'auteur et l'heure de la validation ; elle ne se modifie plus et ne se supprime plus.
6. **Valider la période** : choisissez une période dans les filtres ; le bouton valide **toutes** ses écritures en brouillard, dans l'ordre des dates puis des numéros provisoires (la numérotation suit ainsi la chronologie). La validation a lieu au plus tard à la fin de chaque mois (NC 01 §54).
7. **Contre-passer** une écriture validée (titulaire, Complet) : une erreur dans une écriture validée se corrige par une écriture inverse — mêmes comptes, mêmes tiers, mêmes codes, débits et crédits échangés —, dans le même journal, datée du jour (ou de la date que vous choisissez, dans une période ouverte, jamais avant l'écriture d'origine), libellée « Contre-passation de … », validée aussitôt avec le numéro suivant et liée à l'écriture d'origine (le lien se voit sur les deux). Saisissez ensuite l'écriture correcte. Une écriture ne se contre-passe qu'une fois.
8. **Opération d'une période close** : si la date choisie tombe dans une période close, la fenêtre propose de l'enregistrer **au premier jour de la période ouverte suivante en gardant sa vraie date** (NC 01 §61) ; la liste montre les deux dates. La vraie date sert aussi au contrôle des échéances.
9. **Importer (Excel)** (titulaire, Complet) : des écritures préparées dans le **modèle** téléchargeable — une rangée par ligne d'écriture ; les rangées d'une même écriture se suivent et portent le même repère dans la colonne **Écriture** (1, 2, 3…) ; journal (par son code), date (JJ/MM/AAAA), pièce et libellé sur la première rangée ; compte par son numéro, tiers par son code (obligatoire sur un compte collectif), code de taxe par son code, un débit ou un crédit par rangée, échéance facultative. Chaque écriture obéit aux règles de la saisie (partie double, période ouverte, comptes imputables…) et naît **en brouillard** avec son numéro provisoire : vous les relisez, puis les validez. **Toutes les écritures sont contrôlées avant d'écrire : à la moindre erreur, rien n'est importé** et le rapport dit, rangée par rangée, ce qu'il faut corriger. 2 000 rangées au plus par fichier.
10. **Importer une balance d'ouverture** (titulaire, Complet) : pour un dossier repris d'un autre logiciel, les soldes au premier jour de l'exercice, préparés dans le **modèle** (une rangée par compte, et par tiers sur un compte collectif : compte, tiers, libellé, débit ou crédit). L'import crée **une écriture d'à-nouveaux** dans le journal **AN**, datée du premier jour du **premier exercice** du dossier, pièce AN-AAAA, **en brouillard** : relisez-la, puis validez-la. Le total des débits doit égaler le total des crédits ; un exercice qui a déjà des à-nouveaux refuse l'import (supprimez l'écriture en brouillard, ou corrigez-la). Les à-nouveaux forment le solde d'ouverture des comptes dans le grand livre et la balance (page **Livres**). Dans les exercices suivants, ils viendront de la clôture de l'exercice précédent : le journal AN n'y reçoit aucune écriture.
11. **La nouvelle année** : la première écriture datée de la nouvelle année ouvre **d'elle-même** l'exercice suivant (12 mois, à partir du lendemain de la fin de l'exercice), si sa date est passée ; une date à venir, ou une année mal tapée, reste refusée (le message dit pourquoi). L'exercice suivant peut aussi s'ouvrir d'avance depuis la fiche du dossier. Les deux exercices restent ouverts : la saisie accepte une date de l'un ou de l'autre, le filtre **Exercice** montre les écritures de chacun.

### Points d'attention

:::attention
Une écriture refusée le dit : débits et crédits différents, moins de deux lignes ou un seul compte, date hors des exercices ouverts ou dans une période close, journal désactivé, compte non imputable (désactivé ou avec des sous-comptes actifs), tiers manquant sur un compte collectif ou posé sur un autre compte, code de taxe désactivé, échéance avant la date de l'écriture (ou sa vraie date).
:::

:::attention
Validé = définitif (NC 01 §54, §56) : une écriture validée ne se modifie ni ne se supprime ; elle se contre-passe. Dès qu'une écriture existe, le dossier ne se supprime plus et les dates de son exercice ne changent plus ; un compte, un journal ou un code de taxe porté par une écriture ne se désactive ni ne se supprime plus ; un tiers porté par une écriture ne se supprime plus (il se désactive), son code et son compte collectif ne changent plus. La date de traitement est celle du serveur, jamais modifiable (NC 01).
:::

:::astuce
Le numéro provisoire (B-000012) n'est pas le numéro définitif : celui-ci, continu par journal et par exercice (AC-2026-000001), est attribué à la validation. Un brouillard supprimé ne laisse donc aucun trou dans la série définitive ; pour une numérotation dans l'ordre des dates, validez par période. La clôture des périodes, leur réouverture et le journal général imprimable sont sur la page **Périodes** (fiche « Validation et périodes ») ; le grand livre, la balance et le livre-journal, sur la page **Livres** (fiche « Grand livre et balance »).
:::
$f235b$, 'compta-ecritures', '9ee3e4e7b7d01a8d75398d03d4f06ab9'),
($f235c$## 🔏 Validation et périodes

Une écriture naît en brouillard et devient définitive à sa **validation** ; chaque mois de l'exercice est une **période** qui, une fois toutes ses écritures validées, se **clôt** : sa chronologie est figée et son **journal général** s'imprime pour être coté et paraphé (norme comptable NC 01, §54 à §61). Cette page montre les périodes d'un exercice ouvert — celui du jour ; quand le dossier a deux exercices ouverts, le choix **Exercice** montre l'autre — et les actions qui les concernent. Vous l'ouvrez depuis la fiche du dossier, carte **Tenue**, ligne **Périodes**, bouton **Ouvrir**.

### Ce que vous voyez

- **Les mois de l'exercice**, du premier au dernier : pour chacun, son état (**Ouverte** ou **Close**, avec qui l'a close et quand ; une période rouverte montre aussi qui l'a rouverte et quand, jusqu'à sa prochaine clôture), le nombre d'écritures **en brouillard** et **validées**, le total des écritures validées, et ses boutons.
- **Le détail d'une période** (cliquez dessus) : la **centralisation** de ses journaux auxiliaires — pour chaque journal (achats, ventes, banque, caisse, opérations diverses, à-nouveaux), le nombre d'écritures validées et leurs totaux débit et crédit ; le total général, égal des deux côtés.
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** valident et clôturent ; **le titulaire seul rouvre** une période ; les niveaux **Saisie** et **Consultation** lisent et impriment.

### Actions pas à pas

1. **Valider tout** : valide d'un coup toutes les écritures en brouillard de la période, dans l'ordre des dates puis des numéros provisoires ; chacune reçoit son numéro définitif, continu par journal et par exercice (AC-2026-000001…). Même action que **Valider la période** sur la page **Écritures**. C'est **définitif** : une confirmation est demandée.
2. **Clore** : possible quand la période n'a plus aucune écriture en brouillard (sinon le bouton reste fermé et le nombre restant est indiqué). Une période close n'accepte plus d'écriture datée dedans : ni saisie, ni modification, ni contre-passation. La norme veut la clôture au plus tard avant la fin de la période suivante.
3. **Rouvrir** (titulaire seul) : rend la période ouverte, tant que l'exercice est ouvert ; la réouverture est journalisée (qui, quand) et se voit sur la page. Les écritures validées restent validées : rouvrir sert à enregistrer une opération oubliée, pas à défaire ce qui est validé.
4. **Journal général (PDF)** : imprime le journal général de la période — en-tête (dossier, matricule, période, date d'édition), **centralisation** des journaux auxiliaires, puis toutes les écritures validées dans l'ordre chronologique avec leurs lignes (compte, tiers, libellé, débit, crédit), les totaux de la période et des **pages numérotées** ; les écritures en brouillard n'y figurent pas (leur nombre est indiqué). C'est ce document, coté et paraphé, que la norme demande (NC 01 §47, §48).
5. **Écritures** : ouvre la page **Écritures** filtrée sur la période.

### Points d'attention

:::attention
Une opération datée d'une période close s'enregistre au **premier jour de la période ouverte suivante**, avec sa vraie date (NC 01 §61) : la fenêtre de saisie le propose d'elle-même. Rouvrir une période n'est à faire qu'à titre exceptionnel.
:::

:::attention
Clore une période ne clôt pas l'exercice : la clôture de l'exercice (résultat, à-nouveaux, états financiers) arrive à une étape ultérieure. Les périodes se clôturent une à une ; clôturez-les dans l'ordre des mois pour une chronologie sans trou.
:::

:::astuce
Le journal des événements de la comptabilité garde chaque validation (par écriture ou par période), chaque contre-passation, chaque clôture et chaque réouverture, avec son auteur et son heure : c'est la piste d'audit.
:::
$f235c$, 'compta-periodes', '1dd2198d5761607d9b9f899d84369ff7'),
($f235d$## 📚 Grand livre et balance

Les livres d'un dossier se lisent sur la page **Livres**, calculés à la demande à partir des écritures : le **grand livre** (toutes les lignes d'un compte — ou d'un tiers sur un compte collectif — avec le solde d'ouverture et le solde après chaque ligne), la **balance** (générale par compte ; auxiliaire par fournisseur ou par client) et le **livre-journal** (les écritures d'un journal sur une période, avec leurs lignes et leurs totaux). Vous ouvrez cette page depuis la fiche du dossier, carte **Tenue**, lignes **Grand livre**, **Balance** ou **Journaux**, bouton **Ouvrir**.

### Ce que vous voyez

- **La sélection**, commune aux trois onglets : l'**exercice** (celui du jour par défaut), la **période** (un mois, ou l'exercice entier) et la case **Brouillard compris** : cochée, les écritures en brouillard entrent dans les livres et sont signalées (le nombre de lignes en brouillard comprises est indiqué) ; décochée, seules les écritures validées comptent.
- **Grand livre** : choisissez un compte (parmi ceux qui ont des lignes) ou un tiers (fournisseur, client) ; la page montre le **solde d'ouverture** (les à-nouveaux de l'exercice et les mouvements d'avant la période choisie), puis chaque ligne dans l'ordre chronologique — date, journal, numéro de l'écriture (définitif, ou provisoire en brouillard), pièce, libellé, débit, crédit, **solde après la ligne**, **lettre** (la marque du lettrage, page **Lettrage**) —, par pages de 100 (**Afficher plus**), puis les totaux des mouvements et le solde final.
- **Balance** : **générale** (une rangée par compte mouvementé : solde d'ouverture, mouvements débit et crédit de la période, solde) ou **auxiliaire** (fournisseurs ou clients : une rangée par tiers) ; les totaux en bas. Sous la balance générale, les **contrôles** de la norme : le total des journaux (centralisation sur la sélection) égale le total des lignes du grand livre et le total des écritures (NC 01 §37, §40) ; sous une balance auxiliaire, l'égalité avec les comptes collectifs correspondants.
- **Journaux** : un journal et la sélection : ses écritures dans l'ordre chronologique, chacune avec ses lignes, le nombre d'écritures et leurs totaux (débit = crédit), par pages de 50.
- **Qui peut quoi** : toute personne à qui le dossier est ouvert lit les livres et les exporte (titulaire, Complet, Saisie, Consultation) ; un dossier archivé se lit aussi.

### Actions pas à pas

1. **Lire le grand livre d'un fournisseur** : onglet **Grand livre**, choisissez le tiers (recherche par code ou par nom) ; laissez le compte vide pour avoir toutes ses lignes, ou choisissez aussi le compte collectif. Le solde final au crédit est ce qui lui reste dû ; au débit, ce qu'il vous doit.
2. **Lire la balance d'un mois** : onglet **Balance**, période = le mois ; le solde d'ouverture de chaque compte reprend les à-nouveaux et les mois précédents de l'exercice.
3. **Exporter (Excel)** : chaque onglet s'exporte à la charte LabFlow avec la sélection en cours (balance : une rangée par compte ou par tiers ; grand livre : toutes les lignes avec le solde d'ouverture, les soldes successifs et la lettre ; journal : une rangée par ligne d'écriture). 10 000 lignes au plus par export : au-delà, choisissez une période plus courte.
4. **Importer une balance d'ouverture** ou **importer des écritures** : page **Écritures** (fiche « Écritures », actions 9 et 10).

### Points d'attention

:::attention
Les livres se lisent sur les écritures **validées et en brouillard** (le brouillard distingué) : pour un état définitif, décochez **Brouillard compris**, ou validez d'abord (pages Écritures et Périodes). Les à-nouveaux (journal AN) n'entrent jamais dans les mouvements : ils forment le solde d'ouverture (NC 01 §35, §36).
:::

:::attention
**Soldes d'ouverture provisoires** : tant que l'exercice précédent n'est pas clos, la balance et le grand livre de l'exercice suivant partent de ses soldes de fin — comptes de bilan repris, résultat (produits − charges) porté au compte **131** (bénéfice) ou **135** (perte) —, calculés à la lecture et marqués « provisoires » ; rien n'est écrit, et une écriture ajoutée à l'exercice précédent se reporte aussitôt. La clôture de l'exercice passera les vrais à-nouveaux. Les contrôles (total des journaux = total des lignes) ne comptent pas ce report, qu'aucune ligne ne porte.
:::

:::astuce
Les écritures sont passées sur les comptes imputables : un compte subdivisé se lit sous-compte par sous-compte. Total des journaux = total du grand livre = balance : la page le vérifie à chaque lecture et signale tout écart.
:::
$f235d$, 'compta-livres', '4f04a519c83e0f50ef83906f7d40593b'),
($f235e$## 🧾 Taxes du mois et certificats

La page **Taxes du mois** rassemble, pour une période (un mois de l'exercice), l'**état de TVA**, les **retenues à la source** opérées sur vos fournisseurs et leurs **certificats**, le **fichier de la plateforme TEJ** et les retenues **subies** (celles que vos clients ont faites sur vous). Vous l'ouvrez depuis la fiche du dossier, carte **Taxes**, ligne **Taxes du mois**, bouton **Ouvrir**.

### Ce que vous voyez

- **La période** : le mois en cours par défaut ; choisissez-en un autre dans la liste. La case **Brouillard compris** (cochée par défaut) fait entrer les écritures en brouillard dans l'état de TVA et dans les retenues subies ; les certificats, eux, ne se produisent que sur des écritures **validées**.
- **L'état de TVA** : la TVA collectée par code (avec sa base hors taxes), la TVA déductible sur biens et services et sur immobilisations, les retenues de TVA subies (secteur public), le **crédit reporté** du mois précédent (au premier mois de l'exercice : les à-nouveaux du compte 43667 ; tant que l'exercice précédent n'est pas clos, son solde de fin, **provisoire**), puis le résultat : **TVA à payer** ou **crédit à reporter** (il passe au mois suivant). La TVA est exigible aux débits : une facture compte dans la période de son écriture. Seules les lignes qui portent un code de taxe comptent ; une ligne de TVA sans code (liquidation, régularisation, saisie sans code) est signalée avec ses montants ; l'écriture de liquidation proposée par la page **Déclaration mensuelle** ne l'est pas. Sans à-nouveau sur le compte 43667 alors que l'exercice précédent finissait en crédit, la page le signale aussi : le crédit n'est jamais ajouté d'office (exercice précédent non clos : c'est l'écriture de TVA de son dernier mois qui manque).
- **Retenues à certifier** : une rangée par **paiement** — un fournisseur et une date —, avec ses pièces : facture, nature et code TEJ, hors taxes, TVA, TTC (hors timbre), taux, retenue, net servi. La date proposée est celle du **règlement lettré** avec la facture (page **Lettrage**) ; sans règlement lettré, celle de la facture ; vous la corrigez avant de produire. Une rangée bloquée dit ce qui manque (fiche du fournisseur à compléter, pièce à plusieurs fournisseurs, code sans code TEJ…). La retenue se saisit sur la **facture d'achat** : une retenue passée sur un règlement (banque, caisse) ou une opération diverse est bloquée. Une facture réglée en plusieurs fois propose la date du dernier règlement, et la page le signale. Les paiements des autres mois et les pièces en brouillard sont comptés à part.
- **Certificats du mois** : numéro (2026-000001…, sans trou par année de paiement), date du paiement, bénéficiaire, retenue, état : **produit**, **dans le fichier …** (le fichier TEJ qui le contient) ou **annulé**.
- **Fichier TEJ** : ce que contiendra le prochain fichier du mois — dépôt **initial** (acte 0) ou **rectificatif** (acte 1) — et les fichiers déjà produits, avec leur date.
- **Retenues subies** : les lignes des comptes de retenues subies (4341) de la période, avec le client de la pièce : un crédit d'impôt, à rapprocher des certificats que vos clients vous remettent.
- **Signalements** : rien n'est passé d'office ; la page signale une retenue sur achats sous le seuil de 1 000 D TTC par paiement, une retenue manquante (achat d'un fournisseur à retenue sans ligne de retenue), un taux qui ne suit pas le régime fiscal du fournisseur, un certificat dont une pièce a été contre-passée (il n'entre pas dans un fichier tant qu'il n'est pas annulé), des lignes de TVA sans code, un crédit de TVA de l'exercice précédent non repris, une identité de dossier ou une fiche de fournisseur incomplète pour la plateforme.
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** produisent et annulent les certificats et produisent le fichier ; tout le monde lit la page, télécharge les certificats et les fichiers déjà produits et exporte ; un dossier archivé se lit seulement.

### Actions pas à pas

1. **Produire les certificats** : cochez les paiements (tous ceux qui ne sont pas bloqués le sont d'office), corrigez une date si besoin, puis **Produire les certificats** ; une confirmation est demandée. Chaque paiement reçoit un certificat numéroté, avec ses pièces, son bénéficiaire et l'identité du dossier figés : il se retélécharge toujours à l'identique.
2. **Certificat (PDF)** : le certificat classique — payeur, retenues effectuées, bénéficiaire, cachet et signature —, un par un ; **Certificats du mois (PDF)** : tous ceux du mois en un fichier.
3. **Fichier TEJ (XML)** : le fichier du mois au format de la plateforme (MATRICULE-AAAA-MM-0.xml), avec les certificats qui ne sont encore dans aucun fichier ; ensuite, les nouveaux certificats et les annulations du mois partent dans un **rectificatif** (acte 1). Déposez-le sur tej.finances.gov.tn. Chaque fichier produit se retélécharge à l'identique.
4. **Annuler** un certificat : avec un motif ; il garde son numéro et se marque annulé ; ses pièces redeviennent à certifier (corrigez, puis produisez-en un nouveau). S'il est déjà dans un fichier, l'annulation part dans le fichier suivant (rectificatif).
5. **Retirer** un fichier **refusé par la plateforme** : avec un motif ; le dernier fichier du mois seulement ; ses certificats redeviennent « à mettre dans un fichier » (un dépôt initial retiré se refait) ; le fichier reste téléchargeable, marqué retiré.
6. **Exporter (Excel)** : l'état de TVA, les retenues opérées (à produire et certifiées), les retenues subies et les signalements, à la charte LabFlow.

### Points d'attention

:::attention
Depuis le 1ᵉʳ janvier 2026, le certificat de retenue qui fait foi s'établit sur la plateforme **TEJ** (article 55 du code de l'IRPP et de l'IS) : le PDF de LabFlow Compta en reprend le contenu, il ne la remplace pas. Le fichier XML suit le cahier des charges TEJ v2.0 (juin 2024) ; un nouveau schéma est exigé depuis septembre 2026 et n'est pas encore publié : **le fichier est à essayer sur la plateforme** avant de compter dessus — en cas de refus, saisissez les certificats sur la plateforme à partir des PDF.
:::

:::attention
La plateforme exige, pour chaque bénéficiaire, son matricule fiscal avec sa lettre de clé (ou, à défaut, sa CIN, son passeport ou sa carte de séjour, avec sa date de naissance), son régime fiscal (personne morale ou physique), son adresse, son email et son téléphone ; et, pour le dossier, son matricule fiscal avec sa lettre de clé. Complétez la fiche du fournisseur (page **Tiers**) ou l'identité du dossier avant de produire. Les textes du fichier s'écrivent sans accent ni signe interdit, comme le demande la plateforme.
:::

:::astuce
Lettrez les factures avec leurs règlements au fil de l'eau (page **Lettrage**) : la date du paiement se propose seule. Le certificat s'établit au plus tard à la fin du mois qui suit le paiement ; la TVA à payer du mois se reporte sur la déclaration mensuelle (page **Déclaration mensuelle**).
:::
$f235e$, 'compta-taxes-mois', '5ba81687cdd87a423f4b7871912e2658')
  ) AS f(texte, slug, garde)
 WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'
   AND md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde;
