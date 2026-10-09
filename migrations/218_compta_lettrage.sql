-- LabFlow Compta, étape S7a « Lettrage, échéancier, relevés » (labflow-reprise/achats-compta/PLAN-S7.md §1 ligne S7a,
-- §2 « S7a », §3, §4 « Lettrage », « Échéance », « Relevé et relance », « Droits » ; réponses du client du 09/10 — « ok
-- pour les 9 » : seules les lignes d'écritures VALIDÉES se lettrent, une lettre = somme nulle (un règlement partiel reste
-- non lettré jusqu'au solde), relevé de compte et lettre de relance en PDF envoyés par le comptable lui-même). Le lettrage
-- est une marque, jamais une écriture (NC 01) : une lettre (AAA à ZZZ, propre à chaque tiers) réunit des lignes d'un même
-- tiers sur un même compte collectif dont le total des débits égale le total des crédits. Migration additive.
-- 1) Les lettres d'un dossier : tiers, compte collectif, lettre unique par tiers, montant (le total des débits = celui des
--    crédits), nombre de lignes, auteur et date de traitement. CASCADE sur le dossier (modèle 208) ; clés vers le tiers et
--    le compte sans action (un tiers ou un compte porté par une ligne ne se supprime jamais : hooks de S6a).
CREATE TABLE IF NOT EXISTS compta.lettrages (
  id          SERIAL PRIMARY KEY,
  dossier_id  INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE,
  tiers_id    INTEGER NOT NULL REFERENCES compta.tiers(id),
  compte_id   INTEGER NOT NULL REFERENCES compta.comptes(id),
  lettre      CHAR(3) NOT NULL CHECK (lettre ~ '^[A-Z]{3}$'),
  montant     NUMERIC(18,3) NOT NULL CHECK (montant > 0),
  nb_lignes   INTEGER NOT NULL CHECK (nb_lignes >= 2),
  cree_par    INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tiers_id, lettre)
);
CREATE INDEX IF NOT EXISTS idx_compta_lettrages_dossier ON compta.lettrages (dossier_id, tiers_id, id);
-- 2) La lettre d'une ligne (NULL = non lettrée) ; délettrer remet NULL (la lettre est supprimée, le journal en garde la
--    trace) ; ON DELETE SET NULL n'agit qu'en cascade d'un dossier. Index partiels : les lignes d'une lettre ; les lignes non
--    lettrées des tiers (échéancier, page Lettrage).
ALTER TABLE compta.lignes ADD COLUMN IF NOT EXISTS lettrage_id INTEGER REFERENCES compta.lettrages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_compta_lignes_lettrage ON compta.lignes (lettrage_id) WHERE lettrage_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compta_lignes_non_lettrees ON compta.lignes (dossier_id, tiers_id, date) WHERE tiers_id IS NOT NULL AND lettrage_id IS NULL;

-- 3) Manuel : fiches existantes, texte remplacé seulement s'il est encore celui des migrations 215 (« Tiers ») et 217
--    (« Fiche du dossier », « Grand livre et balance ») ; garde md5 du texte par défaut, sans \r ; le texte servi suit
--    seulement s'il n'a pas été retouché dans l'admin. Idempotent : au 2e passage, la garde ne correspond plus.
UPDATE manuel_sections
   SET contenu = CASE WHEN contenu = contenu_defaut THEN f.texte ELSE contenu END,
       contenu_defaut = f.texte
  FROM (VALUES ($f218a$## 📇 Tiers

Les tiers d'un dossier sont ses **fournisseurs** et ses **clients** : chaque ligne d'écriture passée sur un compte collectif (401 Fournisseurs, 411 Clients) portera son tiers, et le grand livre auxiliaire se lira par tiers. Le plan de comptes reste celui de la norme : aucun compte individuel n'y est créé. Vous ouvrez cette page depuis la fiche du dossier, carte **Configuration**, ligne **Tiers**, bouton **Ouvrir**.

### Ce que vous voyez

- **Deux onglets**, **Fournisseurs** et **Clients**, avec le nombre de tiers actifs de chacun ; la liste s'affiche par pages de 25 (**Afficher plus** charge les suivants) ; **Afficher les désactivés** les ajoute, après les actifs.
- **La recherche** : tapez un code, un nom ou un matricule ; elle porte sur tous les tiers de l'onglet, pas seulement sur ceux affichés.
- **Chaque tiers** : son code, son nom, son matricule fiscal, sa ville, son compte collectif, sa retenue par défaut et son délai de paiement ; mention **Importé** pour un tiers venu d'un fichier Excel, **Désactivé** pour un tiers mis de côté, **Retenue désactivée** quand son code de retenue a été désactivé (page **Taxes**).
- **Le modèle des codes** : un code se compose d'un préfixe et d'un numéro (F0001 et C0001 par défaut : préfixe F ou C, 4 chiffres). Le bouton **Modèle des codes** le règle pour le dossier (préfixe de 0 à 3 lettres ou chiffres, 3 à 7 chiffres) ; les codes déjà attribués ne changent pas.
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** ou **Saisie** créent et modifient les tiers (un fournisseur nouveau arrive souvent avec sa facture) ; le modèle des codes, l'import et la suppression sont réservés au titulaire et au niveau **Complet** ; le niveau **Consultation** lit.

### Actions pas à pas

1. **Ajouter un tiers** : **+ Fournisseur** ou **+ Client**. Laissez le code vide pour qu'il soit généré d'après le modèle (le prochain numéro libre), ou saisissez-le (2 à 10 lettres majuscules ou chiffres, unique dans l'onglet). Seul le nom est obligatoire. Renseignez le matricule fiscal (même contrôle que l'identité du dossier ; un matricule déjà porté par un autre tiers est signalé, jamais refusé), l'adresse, la ville, le téléphone, l'email, le **compte collectif** (4011 pour un fournisseur, 4111 pour un client ; remplaçable par tout compte actif de même nature, par exemple 404 pour un fournisseur d'immobilisations), le **régime de TVA** (assujetti, non assujetti, exonéré, en suspension), la **retenue par défaut** (un code de retenue à la source du dossier, proposé à la saisie, jamais imposé) et le **délai de paiement** en jours (0 = comptant).
2. **Modifier** : tous les champs ; le code aussi, tant que le tiers n'a pas d'écriture.
3. **Désactiver** : le tiers sort de la saisie, sans être effacé ; **Réactiver** le remet. **Supprimer** : seulement un tiers sans écriture ; une confirmation est demandée.
4. **Importer (Excel)** : téléchargez le **modèle** depuis l'onglet (fournisseurs ou clients), remplissez une ligne par tiers (code en première colonne, vide = généré ; compte collectif par son numéro, vide = celui par défaut ; régime de TVA en toutes lettres ; retenue par son code, par exemple RS_MAR15 ; délai en jours), puis importez le fichier. **Toutes les lignes sont contrôlées avant d'écrire : à la moindre erreur, rien n'est importé** et le rapport donne, ligne par ligne, ce qu'il faut corriger. 2 000 lignes au plus par fichier.
5. **Exporter (Excel)** : les tiers de l'onglet, à la charte LabFlow ; le classeur reprend les colonnes du modèle d'import.
6. **Lettrage** : le bouton d'un tiers ouvre la page **Lettrage** sur lui : ses lignes non lettrées, ses lettres, les rapprochements proposés (fiche « Lettrage et échéancier »). Ce qu'il vous doit ou ce que vous lui devez, échéance par échéance, se lit sur la page **Échéancier**.

### Points d'attention

:::attention
Un tiers qui a des écritures ne se supprime pas (désactivez-le) ; son code et son compte collectif ne changent plus. À la saisie (page **Écritures**), le tiers se choisit sur chaque ligne passée sur un compte collectif. Son délai de paiement donne l'échéance proposée, et celle de l'échéancier quand la ligne n'en porte pas.
:::

:::astuce
Dans le modèle Excel, les colonnes sont en texte : un code « 0012 » reste « 0012 ». Si vous préparez le fichier depuis un autre logiciel, gardez les en-têtes du modèle tels quels.
:::

:::astuce
Un compte collectif porté par un tiers ne se désactive pas et ne se supprime pas dans le plan : changez d'abord le compte du tiers. Le taux de la retenue sur achats (1,5 %, 1 % ou 0,5 %) dépend du régime du fournisseur : réglez sa retenue par défaut dans sa fiche.
:::$f218a$, 'compta-tiers', 'c31543340861f0ba89aa001a16065907'),
($f218b$## 🗂️ Fiche du dossier

Cette page présente un dossier : son identité, son régime fiscal, son exercice en cours, sa configuration et les personnes qui y ont accès. Vous l'ouvrez depuis la page **Dossiers** (cabinet), **Cabinet** (collaborateur d'un cabinet), **Ma comptabilité** (client LabFlow) ou **Comptabilité de …** (comptable d'un client).

### Ce que vous voyez

- **Identité** : raison sociale, nom commercial, forme juridique, matricule fiscal, RNE, adresse, représentant légal. **Modifier** ouvre le formulaire, lecture de la patente comprise. Le dossier **« Mon entreprise »** d'un client LabFlow porte la mention **LabFlow** : son identité a été copiée de son compte LabFlow le jour de sa création.
- **Régime fiscal** : personne, impôt, TVA, exportateur total, télédéclaration, début d'activité. **Modifier** le change.
- **Exercice en cours** : ses dates et ses périodes mensuelles, avec leur état (ouverte ou close : page **Périodes**). **Modifier** change ses dates tant qu'aucune écriture n'est enregistrée ; les périodes sont refaites. Dès la première écriture, ce bouton disparaît.
- **Configuration** : le **plan de comptes** du dossier (nombre de comptes actifs), ses **journaux**, ses **codes de taxe** et ses **tiers** (fournisseurs et clients ; nombre de chacun) ; **Ouvrir** mène aux pages **Plan de comptes**, **Journaux**, **Taxes** et **Tiers** (voir leurs fiches dans ce manuel).
- **Tenue** : les **écritures** du dossier (en brouillard, validées), ses **périodes** (ouvertes, closes), ses **livres** — grand livre, balance, journaux —, le **lettrage** (lignes validées à lettrer) et l'**échéancier** (ce qui reste dû aux fournisseurs et par les clients, dont la part échue) ; **Ouvrir** mène aux pages **Écritures**, **Périodes**, **Livres**, **Lettrage** et **Échéancier** (fiches de ce manuel).
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
:::$f218b$, 'compta-dossier', '7809d5d1bf2f86f9b51997cc41d4dc83'),
($f218c$## 📚 Grand livre et balance

Les livres d'un dossier se lisent sur la page **Livres**, calculés à la demande à partir des écritures : le **grand livre** (toutes les lignes d'un compte — ou d'un tiers sur un compte collectif — avec le solde d'ouverture et le solde après chaque ligne), la **balance** (générale par compte ; auxiliaire par fournisseur ou par client) et le **livre-journal** (les écritures d'un journal sur une période, avec leurs lignes et leurs totaux). Vous ouvrez cette page depuis la fiche du dossier, carte **Tenue**, lignes **Grand livre**, **Balance** ou **Journaux**, bouton **Ouvrir**.

### Ce que vous voyez

- **La sélection**, commune aux trois onglets : l'**exercice** (l'exercice ouvert par défaut), la **période** (un mois, ou l'exercice entier) et la case **Brouillard compris** : cochée, les écritures en brouillard entrent dans les livres et sont signalées (le nombre de lignes en brouillard comprises est indiqué) ; décochée, seules les écritures validées comptent.
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

:::astuce
Les écritures sont passées sur les comptes imputables : un compte subdivisé se lit sous-compte par sous-compte. Total des journaux = total du grand livre = balance : la page le vérifie à chaque lecture et signale tout écart.
:::
$f218c$, 'compta-livres', '3494623f8505ff40fcf52a27594ea1ae')
  ) AS f(texte, slug, garde)
 WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'
   AND md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde;

-- 4) Nouvelle fiche : les pages « Lettrage » et « Échéancier » d'un dossier (leur bouton « ? »).
WITH fiche (slug, titre, icone, ordre, contenu, mots_cles, ecran) AS (VALUES
  ('compta-lettrage', 'Lettrage et échéancier', '🔗', 1073, $f218d$## 🔗 Lettrage et échéancier

Le **lettrage** rapproche, sur le compte d'un tiers, les lignes qui se soldent : une facture et son règlement, une facture et son avoir, plusieurs factures et un règlement global. Les lignes rapprochées reçoivent une même **lettre** (AAA, AAB…, propre à chaque tiers) ; ce qui reste **non lettré** est ce qui reste à payer ou à encaisser. L'**échéancier** présente ces lignes non lettrées, fournisseur par fournisseur et client par client, avec leur échéance et leur retard (**balance âgée**) ; le **relevé de compte** et la **lettre de relance** s'en impriment. Vous ouvrez ces pages depuis la fiche du dossier, carte **Tenue**, lignes **Lettrage** et **Échéancier** (ou depuis la page **Tiers**, bouton **Lettrage** d'un tiers).

### Ce que vous voyez

- **Page Lettrage** : le choix du **tiers** (recherche par code ou par nom ; le nombre de ses lignes à lettrer est indiqué) ; ses lignes **non lettrées** — date, journal, numéro de l'écriture, pièce, libellé, compte, débit, crédit, échéance — à cocher ; le pied donne le total coché au débit, au crédit et l'**écart** ; en dessous, les **lettres** du tiers (les plus récentes d'abord), repliées : dépliez-en une pour voir ses lignes.
- **Page Échéancier** : deux onglets, **Fournisseurs** (ce que vous devez) et **Clients** (ce qu'on vous doit) ; une rangée par tiers : le montant non lettré et sa répartition **non échu**, **1 à 30 jours**, **31 à 60**, **61 à 90** et **plus de 90 jours** de retard, au jour de la lecture ; les totaux en bas. Dépliez un tiers : ses lignes avec leur échéance et leur retard.
- **L'échéance** d'une ligne est celle saisie sur la ligne ; à défaut, la date de la pièce (sa vraie date quand l'opération a été enregistrée plus tard) plus le délai de paiement du tiers (0 = comptant). Un règlement ou un avoir non lettré échoit à sa date et s'impute sur les échéances les plus anciennes : la part échue ne dépasse jamais ce qui reste dû.
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** ou **Saisie** lettrent et délettrent ; tout le monde lit l'échéancier, imprime les relevés et les relances et exporte ; un dossier archivé se lit seulement.

### Actions pas à pas

1. **Lettrer** : sur la page Lettrage, choisissez le tiers, cochez les lignes qui se soldent (par exemple la facture au crédit et son règlement au débit) ; quand l'écart est nul, **Lettrer** leur donne la lettre suivante du tiers. Seules les lignes d'écritures **validées** se lettrent (une écriture en brouillard peut encore changer : elle se lettre une fois validée — page **Écritures**, par le titulaire ou un gérant de niveau Complet) ; les lignes d'une même lettre sont sur le même compte collectif.
2. **Proposer** : le logiciel cherche les rapprochements évidents parmi les lignes validées non lettrées — une écriture contre-passée avec sa contre-passation, les lignes d'une même pièce qui se soldent, puis une ligne au débit et une ligne au crédit du même montant (la plus ancienne avec la plus ancienne) — et les liste ; **Cocher** reporte une proposition dans le tableau, **Lettrer les propositions** les lettre toutes, une lettre chacune. Relisez-les : un même montant ne désigne pas toujours la même facture.
3. **Délettrer** : dépliez la lettre, puis **Délettrer** ; toutes ses lignes redeviennent non lettrées. Une écriture contre-passée (page Écritures) est délettrée d'office : lettrez-la ensuite avec sa contre-passation (**Proposer** la trouve).
4. **Lire l'échéancier** : onglet **Fournisseurs** ou **Clients** ; décochez **Brouillard compris** pour ne garder que les écritures validées (les lignes en brouillard sont signalées).
5. **Relevé de compte (PDF)** : depuis un tiers déplié ; le document, à la charte, porte l'identité du dossier et celle du tiers, ses lignes non lettrées avec leur échéance et leur retard, et le solde.
6. **Lettre de relance (PDF)** : pour un client qui a des lignes échues ; une fenêtre montre le texte type, que vous pouvez modifier avant d'imprimer la lettre (identité du dossier et du client, lignes échues, règlements non lettrés déduits, montant échu, solde). LabFlow Compta n'envoie rien par email : vous envoyez le relevé et la relance vous-même.
7. **Exporter (Excel)** : la balance âgée de l'onglet (une rangée par tiers) et le détail des lignes non lettrées, à la charte LabFlow.

### Points d'attention

:::attention
Le lettrage est une marque, jamais une écriture (NC 01) : lettrer ou délettrer ne change aucun solde ni aucun livre. Une lettre se fait à écart nul : un règlement partiel reste non lettré, avec sa facture, jusqu'au règlement du solde.
:::

:::astuce
Lettrez au fil des règlements : l'échéancier, les relevés et les relances ne montrent que le non lettré. La colonne **Lettre** apparaît aussi dans le grand livre (page **Livres**).
:::
$f218d$, 'lettrage, lettrer, délettrer, lettre, rapprochement, facture, règlement, avoir, non lettré, proposer, échéancier, échéance, retard, balance âgée, non échu, relevé de compte, lettre de relance, relance, fournisseurs, clients, tiers, PDF, exporter, Excel', '/lettrage')
)
INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
SELECT f.slug, f.titre, f.icone, 'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'
  FROM fiche f
ON CONFLICT (slug) DO NOTHING;
