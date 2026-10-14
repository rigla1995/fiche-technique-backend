-- Migration 241 : manuel de LabFlow Compta, étape X2 « La clôture de l'exercice » (labflow-reprise/achats-compta/PLAN-EXERCICES.md
-- §2 ligne X2, §3 ; réponses du client du 13/10 — « ok pour les 5 ») : clôture définitive depuis la fiche du dossier (contrôles,
-- résultat, écriture de résultat, périodes closes, à-nouveaux dans l'exercice suivant), affectation du résultat en brouillard ;
-- les soldes provisoires deviennent définitifs. Migration du manuel seul (vocabulaire comptable fixe, jamais balisé). Fiches
-- existantes : texte remplacé seulement s'il est encore celui de la migration 235 ; garde md5 du texte par défaut, sans \r ;
-- le texte servi suit seulement s'il n'a pas été retouché dans l'admin. Nouvelle fiche « Clôture de l'exercice » (bouton « ? »
-- de l'assistant). Idempotent : au 2e passage, la garde ne correspond plus et la fiche existe.
UPDATE manuel_sections
   SET contenu = CASE WHEN contenu = contenu_defaut THEN f.texte ELSE contenu END,
       contenu_defaut = f.texte
  FROM (VALUES ($f241a$## 🗂️ Fiche du dossier

Cette page présente un dossier : son identité, son régime fiscal, ses exercices, sa configuration et les personnes qui y ont accès. Vous l'ouvrez depuis la page **Dossiers** (cabinet), **Cabinet** (collaborateur d'un cabinet), **Ma comptabilité** (client LabFlow) ou **Comptabilité de …** (comptable d'un client).

### Ce que vous voyez

- **Identité** : raison sociale, nom commercial, forme juridique, matricule fiscal, RNE, adresse, représentant légal. **Modifier** ouvre le formulaire, lecture de la patente comprise. Le dossier **« Mon entreprise »** d'un client LabFlow porte la mention **LabFlow** : son identité a été copiée de son compte LabFlow le jour de sa création.
- **Régime fiscal** : personne, impôt, TVA, exportateur total, télédéclaration, début d'activité. **Modifier** le change.
- **Exercices** : l'exercice en cours (celui qui contient la date du jour) et, quand il est ouvert, l'exercice suivant, chacun avec ses dates, son année — le **millésime** de ses numéros définitifs (AC-2027-000001) — et ses périodes mensuelles, avec leur état (ouverte ou close : page **Périodes**). Un exercice **fini** (date de fin passée) porte le bouton **Clôturer l'exercice** (titulaire) ; un exercice **clos** dit qui l'a clos, quand, son **résultat** (bénéfice ou perte) et si l'affectation du résultat est préparée, avec **Voir la clôture**. **Modifier les dates** change les dates du premier exercice tant qu'aucune écriture n'est enregistrée et que l'exercice suivant n'est pas ouvert ; les périodes sont refaites.
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
5. **Clôturer l'exercice** (titulaire ; carte **Exercices**, exercice fini) : ouvre l'assistant de clôture — contrôles, résultat, aperçu des écritures de résultat et d'à-nouveaux, clôture définitive, puis affectation du résultat (fiche « Clôture de l'exercice »).

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
Un dossier tient **deux exercices ouverts au plus** : pendant que l'exercice qui se termine attend son bilan, on saisit déjà dans le suivant (choix de l'exercice sur les pages Écritures, Périodes et Livres). Un troisième ne s'ouvre qu'une fois le plus ancien clos (bouton **Clôturer l'exercice**, fiche « Clôture de l'exercice »). Tant que l'exercice précédent n'est pas clos, les soldes d'ouverture du suivant (balance, grand livre, crédit de TVA) sont **provisoires** : repris de ses soldes de fin, calculés, rien n'est écrit ; la clôture écrit les vrais à-nouveaux et les rend définitifs.
:::

:::attention
Un dossier qui a des écritures ne se supprime jamais : il s'archive. Un dossier archivé ne se modifie pas tant qu'il n'est pas désarchivé : sa configuration non plus.
:::

:::attention
Quand l'abonnement de la comptabilité attend un paiement, les dossiers restent consultables mais ne se modifient plus.
:::$f241a$, 'compta-dossier', '493ae903eba50e5ebc686e4b5cb6d8b9'),
($f241b$## 🔏 Validation et périodes

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
Clore une période ne clôt pas l'exercice : la clôture de l'exercice (résultat, à-nouveaux) se fait depuis la fiche du dossier, carte **Exercices**, bouton **Clôturer l'exercice** (fiche « Clôture de l'exercice ») ; elle demande tous les mois clos sauf le dernier, qu'elle clôt elle-même. Les périodes se clôturent une à une ; clôturez-les dans l'ordre des mois pour une chronologie sans trou. Les périodes d'un exercice clos ne rouvrent plus.
:::

:::astuce
Le journal des événements de la comptabilité garde chaque validation (par écriture ou par période), chaque contre-passation, chaque clôture et chaque réouverture, avec son auteur et son heure : c'est la piste d'audit.
:::
$f241b$, 'compta-periodes', '19a35c9f8320158efa4d23d20e99b71a'),
($f241c$## 📚 Grand livre et balance

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
**Soldes d'ouverture provisoires** : tant que l'exercice précédent n'est pas clos, la balance et le grand livre de l'exercice suivant partent de ses soldes de fin — comptes de bilan repris, résultat (produits − charges) porté au compte **131** (bénéfice) ou **135** (perte) —, calculés à la lecture et marqués « provisoires » ; rien n'est écrit, et une écriture ajoutée à l'exercice précédent se reporte aussitôt. La clôture de l'exercice (fiche « Clôture de l'exercice ») écrit les vrais à-nouveaux (journal AN, premier jour de l'exercice suivant) : le report provisoire disparaît et les soldes deviennent définitifs ; la balance de l'exercice clos montre alors ses comptes de charges et de produits soldés par l'écriture de résultat, et le résultat au 131 ou au 135. Les contrôles (total des journaux = total des lignes) ne comptent pas ce report, qu'aucune ligne ne porte.
:::

:::astuce
Les écritures sont passées sur les comptes imputables : un compte subdivisé se lit sous-compte par sous-compte. Total des journaux = total du grand livre = balance : la page le vérifie à chaque lecture et signale tout écart.
:::
$f241c$, 'compta-livres', '31b685c15ba1ca1eed1e3998f25d176f')
  ) AS f(texte, slug, garde)
 WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'
   AND md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde;

-- Nouvelle fiche : l'assistant « Clôturer l'exercice » (son bouton « ? ») — contrôles, résultat, écritures, affectation.
WITH fiche (slug, titre, icone, ordre, contenu, mots_cles, ecran) AS (VALUES
  ('compta-cloture', 'Clôture de l''exercice', '🔒', 1076, $f241d$## 🔒 Clôture de l'exercice

Un exercice fini se **clôture** : son résultat est déterminé et ses comptes de charges et de produits soldés (écriture de **détermination du résultat**, journal OD, dernier jour de l'exercice), ses périodes sont closes, il devient **définitif**, et ses soldes de bilan sont repris dans l'exercice suivant par une écriture d'**à-nouveaux** (journal AN, premier jour), le résultat en attente d'affectation au compte **131** (bénéfice) ou **135** (perte). Ensuite, un formulaire prépare l'**affectation du résultat** (réserves, report à nouveau, dividendes, compte de l'exploitant) en brouillard dans l'exercice suivant. Vous ouvrez cet assistant depuis la fiche du dossier, carte **Exercices**, bouton **Clôturer l'exercice** (exercice fini) ou **Voir la clôture** (exercice clos).

### Ce que vous voyez

- **Les contrôles**, chacun au vert ou au rouge avec quoi faire : toutes les écritures validées ; les périodes closes sauf la dernière (la clôture la clôt) ; balance équilibrée ; comptes collectifs (fournisseurs, clients) détaillés par tiers ; exercice précédent clos (les exercices se clôturent dans l'ordre) ; exercice suivant ouvert (il reçoit les à-nouveaux) ; journaux OD et AN actifs ; compte du résultat (131 ou 135) imputable.
- **Le résultat** : produits, charges et résultat (bénéfice ou perte) sur les écritures validées, et le compte qui le portera.
- **L'aperçu des deux écritures**, avant de clôturer : la détermination du résultat (chaque compte de charges ou de produits soldé, contrepartie au 131 ou au 135) et les à-nouveaux (chaque compte de bilan pour son solde de fin, **par tiers** sur les comptes collectifs, le résultat au 131 ou au 135). Rien n'est écrit tant que vous ne clôturez pas.
- **Exercice clos** : qui l'a clos et quand, les deux écritures passées (avec leurs numéros définitifs et leurs lignes) et l'**affectation du résultat** : préparée (l'écriture en brouillard) ou à préparer.
- **Qui peut quoi** : **le titulaire seul clôture** ; le titulaire et le niveau **Complet** préparent l'affectation ; les niveaux **Saisie** et **Consultation** lisent.

### Actions pas à pas

1. **Mettre l'exercice en ordre** : validez ou supprimez les écritures en brouillard (page **Écritures**), clôturez les mois (page **Périodes**), ouvrez l'exercice suivant s'il ne l'est pas (fiche du dossier). Les contrôles passent au vert.
2. **Clôturer l'exercice** (titulaire) : une confirmation rappelle que c'est **définitif**. L'écriture de résultat est passée et validée (OD-2026-000012…), la dernière période est close, l'exercice est clos, l'écriture d'à-nouveaux est passée et validée dans l'exercice suivant (AN-2027-000001) — même si son premier mois est déjà clos : les à-nouveaux reprennent des soldes, ce n'est pas une opération du mois. Le journal de la comptabilité garde la clôture (résultat, numéros des deux écritures).
3. **Vérifier** : la balance et le grand livre de l'exercice suivant (page **Livres**) partent des à-nouveaux écrits, sans plus rien de provisoire ; le crédit de TVA du premier mois (page **Taxes du mois**) est définitif.
4. **Affecter le résultat** (titulaire, Complet) : indiquez la date (dans l'exercice suivant, dans une période ouverte) et les parts — bénéfice : réserve légale (111), réserves (112, 1181), report à nouveau (121), dividendes à payer (447), compte de l'exploitant (108) ; perte : report à nouveau (121) ou compte de l'exploitant (108) —, dont la somme doit égaler le résultat. **Préparer l'écriture** l'enregistre **en brouillard** dans le journal OD de l'exercice suivant (131 débité ou 135 crédité, les parts en contrepartie) : vous la relisez, la complétez ou la corrigez sur la page **Écritures** (un autre compte de capitaux, par exemple), puis la validez comme toute écriture. Tant qu'elle existe, aucune autre ne se prépare ; supprimée, le formulaire reparaît.

### Points d'attention

:::attention
La clôture est **définitive** (NC 01) : plus aucune écriture dans l'exercice clos — saisie, import, contre-passation datée dedans ; une facture envoyée depuis LabFlow et datée de l'exercice clos s'enregistre au premier jour ouvert de l'exercice suivant avec sa vraie date — et aucune période ne rouvre. Une erreur découverte ensuite se corrige dans l'exercice suivant, au compte 128 « modifications comptables affectant les résultats reportés ».
:::

:::attention
Les lignes d'à-nouveaux de la clôture **ne se lettrent pas** et ne comptent pas dans l'échéancier : les factures et les règlements de l'exercice clos restent les pièces à lettrer (le lettrage couvre tout le dossier). Les à-nouveaux d'une balance d'ouverture importée, eux, y comptent : ce sont les seules traces des factures d'avant.
:::

:::astuce
Après la clôture, la balance de l'exercice clos montre ses comptes de charges et de produits **soldés** par l'écriture de résultat et le résultat au 131 ou au 135. Les états financiers (bilan, état de résultat), qui lisent le résultat avant cette écriture, arrivent à une étape ultérieure.
:::
$f241d$, 'clôture, clôturer, clore l''exercice, exercice clos, fin d''exercice, résultat de l''exercice, bénéfice, perte, 131, 135, détermination du résultat, à-nouveaux, AN, report à nouveau, affectation du résultat, réserve légale, 111, réserves, 121, dividendes, 447, compte de l''exploitant, 108, définitif, contrôles, soldes définitifs, 128, NC 01', '/cloture')
)
INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
SELECT f.slug, f.titre, f.icone, 'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'
  FROM fiche f
ON CONFLICT (slug) DO NOTHING;
