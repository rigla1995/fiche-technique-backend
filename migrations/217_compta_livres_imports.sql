-- LabFlow Compta, étape S6c « Les livres et les imports » (labflow-reprise/achats-compta/PLAN-S6.md §1 ligne S6c, §2
-- « S6c », §4 « Livres » et « Imports » ; réponse 7 du client du 08/10 : grand livre et balance calculés en SQL à la
-- demande, mesurés sur 50 000 lignes le 08/10 — balance de l'exercice 22 ms, grand livre d'un collectif 20 ms, page
-- Écritures 1 à 4 ms : AUCUNE table de soldes ni index nouveau ; les index de la 215 suffisent). Migration du manuel
-- seul : aucune table, aucune écriture, aucune période ne change (vocabulaire comptable fixe, jamais balisé).
-- 1) Fiches existantes : texte remplacé seulement s'il est encore celui de la migration 216 (« Écritures », « Fiche du
--    dossier ») ; garde md5 du texte par défaut, sans \r ; le texte servi suit seulement s'il n'a pas été retouché dans
--    l'admin. Idempotent : au 2e passage, la garde ne correspond plus.
UPDATE manuel_sections
   SET contenu = CASE WHEN contenu = contenu_defaut THEN f.texte ELSE contenu END,
       contenu_defaut = f.texte
  FROM (VALUES ($f217a$## ✍️ Écritures

Les écritures d'un dossier sont ses opérations comptables : chacune porte une date, un journal, la référence de sa pièce justificative, un libellé et au moins deux lignes dont le total des débits égale le total des crédits (partie double). Cette page les saisit **en brouillard** (modifiables, supprimables), puis les **valide** : une écriture validée est définitive, reçoit son numéro définitif et ne se corrige plus que par **contre-passation**. Vous ouvrez cette page depuis la fiche du dossier, carte **Tenue**, ligne **Écritures**, bouton **Ouvrir**.

### Ce que vous voyez

- **Les filtres** : le journal (tous ou un), la période (un mois de l'exercice ouvert, le mois en cours par défaut, ou toutes), l'état (toutes, brouillard, validées) et la recherche : un mot du libellé, la référence de la pièce ou un montant (par exemple 1190,500 : le total de l'écriture ou l'une de ses lignes).
- **La liste**, par pages de 25 (**Afficher plus** charge les suivantes), de la plus récente à la plus ancienne : numéro (provisoire B-000012 en brouillard, définitif AC-2026-000001 une fois validée), date (et la vraie date de l'opération quand elle diffère), journal, pièce, libellé, total et état (**Brouillard** ou **Validée**). Cliquez sur une écriture pour voir ses lignes : compte, tiers, libellé, débit, crédit, code de taxe, échéance ; puis qui l'a saisie, qui l'a validée et quand, et son lien de contre-passation s'il existe.
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
$f217a$, 'compta-ecritures', '5f681d4acc8726e864c604c521b771f5'),
($f217b$## 🗂️ Fiche du dossier

Cette page présente un dossier : son identité, son régime fiscal, son exercice en cours, sa configuration et les personnes qui y ont accès. Vous l'ouvrez depuis la page **Dossiers** (cabinet), **Cabinet** (collaborateur d'un cabinet), **Ma comptabilité** (client LabFlow) ou **Comptabilité de …** (comptable d'un client).

### Ce que vous voyez

- **Identité** : raison sociale, nom commercial, forme juridique, matricule fiscal, RNE, adresse, représentant légal. **Modifier** ouvre le formulaire, lecture de la patente comprise. Le dossier **« Mon entreprise »** d'un client LabFlow porte la mention **LabFlow** : son identité a été copiée de son compte LabFlow le jour de sa création.
- **Régime fiscal** : personne, impôt, TVA, exportateur total, télédéclaration, début d'activité. **Modifier** le change.
- **Exercice en cours** : ses dates et ses périodes mensuelles, avec leur état (ouverte ou close : page **Périodes**). **Modifier** change ses dates tant qu'aucune écriture n'est enregistrée ; les périodes sont refaites. Dès la première écriture, ce bouton disparaît.
- **Configuration** : le **plan de comptes** du dossier (nombre de comptes actifs), ses **journaux**, ses **codes de taxe** et ses **tiers** (fournisseurs et clients ; nombre de chacun) ; **Ouvrir** mène aux pages **Plan de comptes**, **Journaux**, **Taxes** et **Tiers** (voir leurs fiches dans ce manuel).
- **Tenue** : les **écritures** du dossier (en brouillard, validées), ses **périodes** (ouvertes, closes) et ses **livres** — grand livre, balance, journaux ; **Ouvrir** mène aux pages **Écritures**, **Périodes** et **Livres** (fiches de ce manuel).
- **Accès** : les personnes qui voient ce dossier (titulaire et gérants), avec leur niveau.

### Actions pas à pas

1. **Archiver** (titulaire) : le dossier sort de la liste courante ; rien n'est effacé. **Désarchiver** le remet dans la liste.
2. **Supprimer** (titulaire) : possible seulement pour un dossier sans écriture ; une confirmation est demandée. Le journal de la comptabilité garde la trace de la suppression.
3. **Reprendre l'identité de LabFlow** (dossier « Mon entreprise » d'un client LabFlow) : recopie dans le dossier les champs que le compte LabFlow connaît (un champ vide dans LabFlow n'efface rien) ; utile après une correction dans LabFlow, page **Mon entreprise**. Dans l'autre sens, rien ne change : modifier le dossier ne touche pas au compte LabFlow. Ce dossier ne se supprime pas : il s'archive.

### Points d'attention

:::attention
Un dossier qui a des écritures ne se supprime jamais : il s'archive. Un dossier archivé ne se modifie pas tant qu'il n'est pas désarchivé : sa configuration non plus.
:::

:::attention
Quand l'abonnement de la comptabilité attend un paiement, les dossiers restent consultables mais ne se modifient plus.
:::$f217b$, 'compta-dossier', '155ce69c6486981803ed2b33ad366649')
  ) AS f(texte, slug, garde)
 WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'
   AND md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde;

-- 2) Nouvelle fiche : la page « Livres » d'un dossier (son bouton « ? ») — grand livre, balance, livre-journal, exports.
WITH fiche (slug, titre, icone, ordre, contenu, mots_cles, ecran) AS (VALUES
  ('compta-livres', 'Grand livre et balance', '📚', 1072, $f217c$## 📚 Grand livre et balance

Les livres d'un dossier se lisent sur la page **Livres**, calculés à la demande à partir des écritures : le **grand livre** (toutes les lignes d'un compte — ou d'un tiers sur un compte collectif — avec le solde d'ouverture et le solde après chaque ligne), la **balance** (générale par compte ; auxiliaire par fournisseur ou par client) et le **livre-journal** (les écritures d'un journal sur une période, avec leurs lignes et leurs totaux). Vous ouvrez cette page depuis la fiche du dossier, carte **Tenue**, lignes **Grand livre**, **Balance** ou **Journaux**, bouton **Ouvrir**.

### Ce que vous voyez

- **La sélection**, commune aux trois onglets : l'**exercice** (l'exercice ouvert par défaut), la **période** (un mois, ou l'exercice entier) et la case **Brouillard compris** : cochée, les écritures en brouillard entrent dans les livres et sont signalées (le nombre de lignes en brouillard comprises est indiqué) ; décochée, seules les écritures validées comptent.
- **Grand livre** : choisissez un compte (parmi ceux qui ont des lignes) ou un tiers (fournisseur, client) ; la page montre le **solde d'ouverture** (les à-nouveaux de l'exercice et les mouvements d'avant la période choisie), puis chaque ligne dans l'ordre chronologique — date, journal, numéro de l'écriture (définitif, ou provisoire en brouillard), pièce, libellé, débit, crédit, **solde après la ligne** —, par pages de 100 (**Afficher plus**), puis les totaux des mouvements et le solde final.
- **Balance** : **générale** (une rangée par compte mouvementé : solde d'ouverture, mouvements débit et crédit de la période, solde) ou **auxiliaire** (fournisseurs ou clients : une rangée par tiers) ; les totaux en bas. Sous la balance générale, les **contrôles** de la norme : le total des journaux (centralisation sur la sélection) égale le total des lignes du grand livre et le total des écritures (NC 01 §37, §40) ; sous une balance auxiliaire, l'égalité avec les comptes collectifs correspondants.
- **Journaux** : un journal et la sélection : ses écritures dans l'ordre chronologique, chacune avec ses lignes, le nombre d'écritures et leurs totaux (débit = crédit), par pages de 50.
- **Qui peut quoi** : toute personne à qui le dossier est ouvert lit les livres et les exporte (titulaire, Complet, Saisie, Consultation) ; un dossier archivé se lit aussi.

### Actions pas à pas

1. **Lire le grand livre d'un fournisseur** : onglet **Grand livre**, choisissez le tiers (recherche par code ou par nom) ; laissez le compte vide pour avoir toutes ses lignes, ou choisissez aussi le compte collectif. Le solde final au crédit est ce qui lui reste dû ; au débit, ce qu'il vous doit.
2. **Lire la balance d'un mois** : onglet **Balance**, période = le mois ; le solde d'ouverture de chaque compte reprend les à-nouveaux et les mois précédents de l'exercice.
3. **Exporter (Excel)** : chaque onglet s'exporte à la charte LabFlow avec la sélection en cours (balance : une rangée par compte ou par tiers ; grand livre : toutes les lignes avec le solde d'ouverture et les soldes successifs ; journal : une rangée par ligne d'écriture). 10 000 lignes au plus par export : au-delà, choisissez une période plus courte.
4. **Importer une balance d'ouverture** ou **importer des écritures** : page **Écritures** (fiche « Écritures », actions 9 et 10).

### Points d'attention

:::attention
Les livres se lisent sur les écritures **validées et en brouillard** (le brouillard distingué) : pour un état définitif, décochez **Brouillard compris**, ou validez d'abord (pages Écritures et Périodes). Les à-nouveaux (journal AN) n'entrent jamais dans les mouvements : ils forment le solde d'ouverture (NC 01 §35, §36).
:::

:::astuce
Les écritures sont passées sur les comptes imputables : un compte subdivisé se lit sous-compte par sous-compte. Total des journaux = total du grand livre = balance : la page le vérifie à chaque lecture et signale tout écart.
:::
$f217c$, 'livres, grand livre, grand livre auxiliaire, balance, balance générale, balance auxiliaire, fournisseurs, clients, livre-journal, journaux, solde d''ouverture, à-nouveaux, mouvements, solde, cumuls, exercice, période, brouillard compris, contrôles, total des journaux, centralisation, exporter, Excel, NC 01', '/livres')
)
INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
SELECT f.slug, f.titre, f.icone, 'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'
  FROM fiche f
ON CONFLICT (slug) DO NOTHING;
