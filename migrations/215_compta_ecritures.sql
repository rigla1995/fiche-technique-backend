-- LabFlow Compta, étape S6a « Les écritures en brouillard » (labflow-reprise/achats-compta/PLAN-S6.md §1 ligne S6a, §2, §4 ;
-- réponses du client du 08/10 — « ok pour les 8 » : numéro définitif à la validation (S6b), provisoire en brouillard ;
-- pièce = sa référence ; Saisie saisit en brouillard ; aide TVA / retenue sur demande ; dinar seul ; CADRAGE §4 : partie
-- double, pièce justificative, date de traitement système, montants sans arrondi ; SPEC-SOCLE §0 : NUMERIC(18,3) en
-- millimes). Migration additive : aucun dossier, compte, journal, code de taxe ni tiers existant ne change.
-- 1) Les écritures d'un dossier : exercice et période de leur date (lus à la saisie : une date hors de l'exercice ouvert
--    ou dans une période close est refusée par le code), journal actif, référence de la pièce (obligatoire), libellé,
--    état brouillard / validée (la validation, le numéro définitif — continu par journal et par exercice — et la
--    contre-passation arrivent avec S6b : numero, valide_par, valide_le, origine « contrepassation », origine_id, date
--    réelle d'une opération d'une période close, NC 01 §61), numéro provisoire par dossier (B-000012), totaux débit et
--    crédit égaux (partie double), date de traitement = created_at (serveur, jamais modifiable). Clés vers l'exercice, la
--    période et le journal sans action : le code refuse de changer les dates d'un exercice ou de désactiver un journal
--    mouvementé (hooks « mouvementé ») ; la suppression d'un dossier vide emporte tout (CASCADE, la vérification des clés
--    se faisant en fin d'ordre), un dossier qui a une écriture ne se supprime jamais (D10). Le numéro provisoire vient
--    d'un compteur du dossier (prochain_provisoire, lu sous le verrou du dossier) : un brouillard supprimé ne rend pas
--    son numéro, le journal des événements le désigne sans ambiguïté.
ALTER TABLE compta.dossiers ADD COLUMN IF NOT EXISTS prochain_provisoire INTEGER NOT NULL DEFAULT 1 CHECK (prochain_provisoire >= 1);
CREATE TABLE IF NOT EXISTS compta.ecritures (
  id                SERIAL PRIMARY KEY,
  dossier_id        INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE,
  exercice_id       INTEGER NOT NULL REFERENCES compta.exercices(id),
  periode_id        INTEGER NOT NULL REFERENCES compta.periodes(id),
  journal_id        INTEGER NOT NULL REFERENCES compta.journaux(id),
  date              DATE NOT NULL,
  date_reelle       DATE,
  numero_provisoire INTEGER NOT NULL CHECK (numero_provisoire >= 1),
  numero            VARCHAR(20),
  reference         VARCHAR(80) NOT NULL,
  libelle           VARCHAR(255) NOT NULL,
  etat              VARCHAR(10) NOT NULL DEFAULT 'brouillard' CHECK (etat IN ('brouillard', 'validee')),
  total_debit       NUMERIC(18,3) NOT NULL CHECK (total_debit >= 0),
  total_credit      NUMERIC(18,3) NOT NULL CHECK (total_credit >= 0),
  origine           VARCHAR(16) NOT NULL DEFAULT 'saisie' CHECK (origine IN ('saisie', 'import', 'contrepassation')),
  origine_id        INTEGER REFERENCES compta.ecritures(id),
  cree_par          INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valide_par        INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  valide_le         TIMESTAMPTZ,
  CHECK (total_debit = total_credit),
  CHECK ((etat = 'validee') = (numero IS NOT NULL)),
  CHECK ((etat = 'validee') = (valide_le IS NOT NULL)),
  UNIQUE (dossier_id, numero_provisoire)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_compta_ecritures_numero ON compta.ecritures (dossier_id, numero) WHERE numero IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compta_ecritures_date ON compta.ecritures (dossier_id, date, id);
CREATE INDEX IF NOT EXISTS idx_compta_ecritures_journal ON compta.ecritures (dossier_id, journal_id, date);
CREATE INDEX IF NOT EXISTS idx_compta_ecritures_periode ON compta.ecritures (periode_id);
CREATE INDEX IF NOT EXISTS idx_compta_ecritures_etat ON compta.ecritures (dossier_id, etat);

-- 2) Les lignes d'une écriture (suivent leur écriture, CASCADE) : dossier et date dénormalisés pour le grand livre et la
--    balance (S6c : index par compte et par tiers), rang, compte imputable (feuille active, exigé par le code), tiers sur
--    un compte collectif seulement (fournisseurs, clients), libellé (NULL = celui de l'écriture), débit ou crédit (jamais
--    les deux, l'un des deux strictement positif), code de taxe facultatif, échéance facultative. Clés vers le compte, le
--    tiers et le code de taxe sans action : un compte, un tiers ou un code porté par une ligne ne se désactive ni ne se
--    supprime plus (hooks « mouvementé » : planComptes.compteMouvemente, tiers.tiersMouvemente, taxes.taxeMouvementee).
CREATE TABLE IF NOT EXISTS compta.lignes (
  id          SERIAL PRIMARY KEY,
  ecriture_id INTEGER NOT NULL REFERENCES compta.ecritures(id) ON DELETE CASCADE,
  dossier_id  INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  rang        SMALLINT NOT NULL CHECK (rang >= 1),
  compte_id   INTEGER NOT NULL REFERENCES compta.comptes(id),
  tiers_id    INTEGER REFERENCES compta.tiers(id),
  libelle     VARCHAR(255),
  debit       NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit      NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  taxe_id     INTEGER REFERENCES compta.taxes(id),
  echeance    DATE,
  CHECK ((debit > 0) <> (credit > 0)),
  UNIQUE (ecriture_id, rang)
);
CREATE INDEX IF NOT EXISTS idx_compta_lignes_ecriture ON compta.lignes (ecriture_id, rang);
CREATE INDEX IF NOT EXISTS idx_compta_lignes_compte ON compta.lignes (dossier_id, compte_id, date);
CREATE INDEX IF NOT EXISTS idx_compta_lignes_tiers ON compta.lignes (dossier_id, tiers_id, date) WHERE tiers_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compta_lignes_taxe ON compta.lignes (taxe_id) WHERE taxe_id IS NOT NULL;

-- 3) Manuel de LabFlow Compta (vocabulaire comptable fixe, jamais balisé). Fiches existantes : texte remplacé seulement
--    s'il est encore celui de la migration 214 (« Fiche du dossier », « Plan de comptes », « Taxes », « Tiers ») ou de la
--    213 (« Journaux ») ; garde md5 du texte par défaut, sans \r ; le texte servi suit seulement s'il n'a pas été retouché
--    dans l'admin. Idempotent : au 2e passage, la garde ne correspond plus.
UPDATE manuel_sections
   SET contenu = CASE WHEN contenu = contenu_defaut THEN f.texte ELSE contenu END,
       contenu_defaut = f.texte
  FROM (VALUES ($f215a$## 🗂️ Fiche du dossier

Cette page présente un dossier : son identité, son régime fiscal, son exercice en cours, sa configuration et les personnes qui y ont accès. Vous l'ouvrez depuis la page **Dossiers** (cabinet), **Cabinet** (collaborateur d'un cabinet), **Ma comptabilité** (client LabFlow) ou **Comptabilité de …** (comptable d'un client).

### Ce que vous voyez

- **Identité** : raison sociale, nom commercial, forme juridique, matricule fiscal, RNE, adresse, représentant légal. **Modifier** ouvre le formulaire, lecture de la patente comprise. Le dossier **« Mon entreprise »** d'un client LabFlow porte la mention **LabFlow** : son identité a été copiée de son compte LabFlow le jour de sa création.
- **Régime fiscal** : personne, impôt, TVA, exportateur total, télédéclaration, début d'activité. **Modifier** le change.
- **Exercice en cours** : ses dates et ses périodes mensuelles (toutes ouvertes jusqu'à l'étape de la clôture). **Modifier** change ses dates tant qu'aucune écriture n'est enregistrée ; les périodes sont refaites. Dès la première écriture, ce bouton disparaît.
- **Configuration** : le **plan de comptes** du dossier (nombre de comptes actifs), ses **journaux**, ses **codes de taxe** et ses **tiers** (fournisseurs et clients ; nombre de chacun) ; **Ouvrir** mène aux pages **Plan de comptes**, **Journaux**, **Taxes** et **Tiers** (voir leurs fiches dans ce manuel).
- **Tenue** : les **écritures** du dossier (en brouillard, validées) ; **Ouvrir** mène à la page **Écritures** (fiche de ce manuel). Les périodes, le grand livre et la balance arrivent aux étapes suivantes.
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
:::$f215a$, 'compta-dossier', '15bee4b51f99a47231ecfc89611fd0a8'),
($f215b$## 📑 Plan de comptes

Le plan de comptes d'un dossier est la liste des comptes sur lesquels ses écritures seront passées. À la création du dossier, LabFlow Compta y copie la **nomenclature de la norme comptable générale NC 01** (plus de 600 comptes, classes 1 à 7) ; vous l'adaptez ensuite à l'entreprise. Vous ouvrez cette page depuis la fiche du dossier, carte **Configuration**, bouton **Ouvrir**.

### Ce que vous voyez

- **Les sept classes** (1 Capitaux propres et passifs non courants … 7 Produits), chacune dépliable ; sous chaque classe, l'arbre des comptes avec leur numéro, leur libellé et leur nature (fournisseurs, clients, banque, caisse, TVA collectée, TVA déductible…).
- **Les mentions** : **Ajouté** pour un compte créé par vous, **Renommé** quand le libellé n'est plus celui de la norme, **Désactivé** pour un compte mis de côté (affiché seulement si vous cochez **Afficher les désactivés**).
- **Trois comptes ajoutés par LabFlow Compta** avec les codes de taxe, expliqués au survol : 4375 Droit de timbre collecté, 4376 FODEC collecté, 43665 TVA retenue à la source. La norme ne les prévoit pas ; si votre cabinet code autrement, changez le compte des codes TIMBRE, FODEC et RSTVA25 (page **Taxes**), puis supprimez-les.
- **La recherche** : tapez un numéro ou un mot du libellé ; la liste des comptes qui correspondent (avec leur classe) remplace l'arbre, avec les mêmes actions ; **Effacer la recherche** rend l'arbre.
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** modifient le plan ; les niveaux **Saisie** et **Consultation** le consultent.

### Actions pas à pas

1. **Subdiviser un compte** : cliquez sur **Subdiviser** sur le compte parent (par exemple 532 Banques → 5321 Comptes en dinars → 53211 « BIAT »). Le numéro proposé prolonge celui du parent ; vous pouvez le changer tant qu'il commence par le numéro du parent (2 à 8 chiffres). Donnez un libellé, gardez ou changez la nature, et expliquez l'ajout si vous le souhaitez (la norme le demande, 3ᵉ partie §3).
2. **Renommer** : changez le libellé d'un compte ; **Rétablir** remet celui de la norme.
3. **Désactiver** : un compte dont vous n'avez pas l'usage sort de la saisie, sans être effacé ; ses sous-comptes doivent être désactivés avant lui. **Réactiver** le remet (son compte parent doit être actif).
4. **Supprimer** : seulement un compte que vous avez ajouté, sans sous-compte ni écriture ; un compte de la norme ne se supprime jamais, il se désactive.
5. **Exporter (Excel)** : le plan complet, à la charte LabFlow.
6. **Importer (Excel)** : le plan d'un autre logiciel, préparé dans le modèle téléchargeable (colonnes Numéro, Libellé, Nature facultative). Un numéro déjà dans le plan est renommé ; un numéro inconnu est ajouté sous le compte dont il prolonge le numéro (nature héritée sauf indication, explication « Importé d'un autre logiciel »). Toutes les lignes sont contrôlées avant d'écrire : à la moindre erreur, rien n'est importé et le rapport dit, ligne par ligne, ce qu'il faut corriger. L'import ne désactive ni ne supprime jamais un compte.

### Points d'attention

:::attention
Un compte qui a des écritures, ou porté par un journal, un code de taxe ou un tiers (compte collectif), ne se désactive pas et ne se supprime pas (changez d'abord le compte du journal, du code ou du tiers).
:::

:::astuce
Seuls les comptes sans sous-compte actif (les « feuilles » de l'arbre) reçoivent des écritures (page **Écritures**) : subdivisez les comptes de banque (un par compte bancaire) et de caisse, puis rattachez chaque journal de banque ou de caisse à son compte (page **Journaux**).
:::$f215b$, 'compta-plan-comptes', 'b9eaae9b696e3a4cf1223b654f9e1185'),
($f215c$## 📒 Journaux

Un journal est un registre où les écritures s'enregistrent par nature d'opération : achats, ventes, banque, caisse, opérations diverses, à-nouveaux. Chaque dossier reçoit six journaux à sa création ; vous en ajoutez autant que nécessaire, par exemple un journal par compte bancaire. Vous ouvrez cette page depuis la fiche du dossier, carte **Configuration**, ligne **Journaux**, bouton **Ouvrir**.

### Ce que vous voyez

- **La liste des journaux** : code, libellé, type, compte de contrepartie (banque et caisse), mention **Ajouté** pour un journal créé par vous, **Désactivé** pour un journal mis de côté (affiché si vous cochez **Afficher les désactivés**).
- **Les six journaux par défaut** : AC Achats, VT Ventes, BQ Banque (compte 5321), CA Caisse (compte 5411), OD Opérations diverses, AN À-nouveaux.
- **Le compte de contrepartie** d'un journal de banque ou de caisse : un compte de nature banque ou caisse du plan. Quand ce compte a des sous-comptes actifs (par exemple 5321 après que vous l'avez subdivisé par banque), la mention **Compte à préciser** vous invite à choisir le sous-compte.
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** modifient les journaux ; les niveaux **Saisie** et **Consultation** les consultent.

### Actions pas à pas

1. **Ajouter un journal de banque** : subdivisez d'abord le compte 5321 dans le **Plan de comptes** (un sous-compte par banque : 53211 « BIAT »…), puis cliquez sur **+ Journal** : type **Banque**, code (2 à 4 lettres ou chiffres, par exemple BQ2), libellé, compte de contrepartie choisi dans la liste. Même chose pour une caisse (compte 5411 ou un sous-compte).
2. **Ajouter un autre journal** (achats, ventes, opérations diverses) : **+ Journal**, le type voulu, code et libellé ; pas de compte de contrepartie. Il n'y a qu'un journal d'à-nouveaux par dossier.
3. **Modifier** : le libellé, et le compte de contrepartie d'un journal de banque ou de caisse (tant que le journal n'a pas d'écriture). Le code ne change pas : désactivez le journal et créez-en un autre.
4. **Désactiver** : un journal dont vous n'avez pas l'usage sort de la saisie, sans être effacé ; **Réactiver** le remet (son compte doit être actif).

### Points d'attention

:::attention
Un journal qui a des écritures ne se désactive pas et son compte ne change plus ; un journal ne se supprime jamais. À la saisie (page **Écritures**), chaque écriture choisit son journal parmi les journaux actifs.
:::

:::astuce
Un compte porté par un journal ne se désactive pas et ne se supprime pas dans le plan : changez d'abord le compte du journal.
:::$f215c$, 'compta-journaux', '118bd5652357e9ef1747f9aae856804b'),
($f215d$## 🧾 Taxes

Les codes de taxe sont les taxes qu'une ligne d'écriture pourra porter : TVA par taux, retenues à la source, droit de timbre, FODEC, avances. Chaque code connaît son taux (ou son montant), son assiette et ses comptes : à la saisie, choisir un code suffit pour passer la taxe sur le bon compte (page **Écritures**, bouton **Ajouter la TVA**). Chaque dossier reçoit à sa création les codes de son régime de TVA. Vous ouvrez cette page depuis la fiche du dossier, carte **Configuration**, ligne **Taxes**, bouton **Ouvrir**.

### Ce que vous voyez

- **La liste des codes par type** (TVA, retenues à la source, retenues de TVA, droit de timbre, FODEC, avances) : code, libellé, taux ou montant, assiette, compte à l'achat, compte à la vente, compte sur immobilisations, mention **Ajouté** pour un code personnalisé, **Désactivé** pour un code mis de côté (affiché si vous cochez **Afficher les désactivés**).
- **Les codes selon le régime du dossier** : au régime réel, TVA 19 %, 13 %, 7 %, 0 %, exonéré, TVA non récupérable, puis les retenues, le timbre, le FODEC et les avances ; un exportateur total reçoit en plus **Achats en suspension de TVA** ; un dossier forfaitaire ou non assujetti ne reçoit aucun code de TVA (la TVA reste dans le coût), seulement les retenues, le timbre, le FODEC et les avances.
- **Les comptes** : TVA déductible 43666 (43662 sur immobilisations), TVA collectée 436711, retenues opérées 432, retenues subies 4341, timbre 6654 à l'achat. Trois comptes que la norme ne prévoit pas sont ajoutés au plan avec leur explication : 4375 Droit de timbre collecté, 4376 FODEC collecté, 43665 TVA retenue à la source ; remplacez-les si votre cabinet code autrement.
- **Compte à préciser** : un code dont le compte a des sous-comptes actifs ou est désactivé porte cette mention ; choisissez un autre compte (**Modifier**) ou rendez-le imputable dans le plan.
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** modifient les codes ; les niveaux **Saisie** et **Consultation** les consultent.

### Actions pas à pas

1. **Ajouter depuis le paquet** : la liste des codes du paquet Tunisie que le dossier n'a pas encore (TVA non récupérable 13 % et 7 %, retenues sur artistes, jetons de présence, intérêts, dividendes, non-résidents à régime privilégié, livraison en ligne, timbre des grandes surfaces, suspension de TVA) ; un clic le copie avec ses comptes. Un dossier dont le régime a changé retrouve ici les codes qui lui manquent.
2. **Ajouter un code personnalisé** : code (2 à 12 lettres, chiffres ou _), libellé, type, taux ou montant fixe, assiette, comptes.
3. **Modifier** : le libellé et les comptes de tout code ; le type, le taux, le montant et l'assiette d'un code personnalisé seulement, tant qu'il n'a pas d'écriture. Un code du paquet garde les siens : un taux qui change est un nouveau code, apporté par une nouvelle version du paquet.
4. **Désactiver** / **Réactiver** : un code mis de côté sort de la saisie, sans être effacé ; un code ne se supprime jamais.

### Points d'attention

:::attention
Les retenues à la source se calculent sur le montant TTC hors timbre, et le seuil de 1 000 D des retenues sur achats s'apprécie par paiement : à la saisie (page **Écritures**, bouton **Ajouter la retenue**), la retenue est calculée sur le TTC hors timbre ; le seuil reste à votre appréciation (retirez la ligne quand la retenue n'est pas due). Le taux de la retenue sur achats (1,5 %, 1 % ou 0,5 %) dépend du régime du fournisseur : le code par défaut de chaque fournisseur se règle dans sa fiche (page **Tiers**, retenue par défaut).
:::

:::astuce
Depuis le 1ᵉʳ janvier 2026, les certificats de retenue passent par la plateforme TEJ : chaque code de retenue porte déjà son code d'opération TEJ (quand il existe), pour les produire à l'étape « Taxes et déclarations ».
:::$f215d$, 'compta-taxes', '2bd58ce6258f99da7be70d789bfcbbb3'),
($f215e$## 📇 Tiers

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

### Points d'attention

:::attention
Un tiers qui a des écritures ne se supprime pas (désactivez-le) ; son code et son compte collectif ne changent plus. À la saisie (page **Écritures**), le tiers se choisit sur chaque ligne passée sur un compte collectif.
:::

:::astuce
Dans le modèle Excel, les colonnes sont en texte : un code « 0012 » reste « 0012 ». Si vous préparez le fichier depuis un autre logiciel, gardez les en-têtes du modèle tels quels.
:::

:::astuce
Un compte collectif porté par un tiers ne se désactive pas et ne se supprime pas dans le plan : changez d'abord le compte du tiers. Le taux de la retenue sur achats (1,5 %, 1 % ou 0,5 %) dépend du régime du fournisseur : réglez sa retenue par défaut dans sa fiche.
:::$f215e$, 'compta-tiers', 'e5f36d27d72d4c0747abcc0e7b2dcdd1')
  ) AS f(texte, slug, garde)
 WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'
   AND md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde;

-- Nouvelle fiche : la page « Écritures » d'un dossier (son bouton « ? »).
WITH fiche (slug, titre, icone, ordre, contenu, mots_cles, ecran) AS (VALUES
  ('compta-ecritures', 'Écritures', '✍️', 1070, $f215f$## ✍️ Écritures

Les écritures d'un dossier sont ses opérations comptables : chacune porte une date, un journal, la référence de sa pièce justificative, un libellé et au moins deux lignes dont le total des débits égale le total des crédits (partie double). Cette page les saisit et les tient **en brouillard** : une écriture en brouillard se modifie et se supprime ; sa validation (définitive, avec le numéro définitif), la contre-passation et la clôture des périodes arrivent à l'étape suivante. Vous ouvrez cette page depuis la fiche du dossier, carte **Tenue**, ligne **Écritures**, bouton **Ouvrir**.

### Ce que vous voyez

- **Les filtres** : le journal (tous ou un), la période (un mois de l'exercice ouvert, le mois en cours par défaut, ou toutes), l'état (toutes, brouillard, validées) et la recherche : un mot du libellé, la référence de la pièce ou un montant (par exemple 1190,500 : le total de l'écriture ou l'une de ses lignes).
- **La liste**, par pages de 25 (**Afficher plus** charge les suivantes), de la plus récente à la plus ancienne : numéro provisoire (B-000012), date, journal, pièce, libellé, total et état (**Brouillard** ou **Validée**). Cliquez sur une écriture pour voir ses lignes : compte, tiers, libellé, débit, crédit, code de taxe, échéance.
- **Le bandeau** : le nombre d'écritures en brouillard et validées du dossier.
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** ou **Saisie** saisissent, modifient et suppriment les écritures en brouillard ; le niveau **Consultation** lit. Un dossier archivé se lit, ne se saisit pas.

### Actions pas à pas

1. **Saisir une écriture** : **+ Écriture**. Choisissez le journal, la date (dans une période ouverte de l'exercice ouvert), la **référence de la pièce** (numéro de facture, de relevé… obligatoire, 80 caractères au plus), le libellé ; puis les **lignes** : le compte (recherche par numéro ou par mot du libellé ; seuls les comptes imputables, actifs et sans sous-compte actif, sont proposés), le tiers quand le compte est collectif (fournisseurs ou clients : obligatoire alors, choisi parmi les tiers actifs du même type), le libellé de la ligne (celui de l'écriture par défaut), le débit **ou** le crédit (en dinars, trois décimales au plus, la virgule est acceptée), le code de taxe (facultatif) et l'échéance (facultative ; proposée d'après le délai de paiement du tiers). Le pied affiche le total des débits, le total des crédits et l'écart : **Enregistrer** n'est possible qu'à écart nul. L'écriture reçoit un numéro provisoire et la date de traitement du serveur.
2. **Ajouter la TVA** : sur une ligne hors taxes qui porte un code de TVA (TVA19…), ce bouton crée la ligne de taxe, calculée au millime près (le demi-millime arrondi vers le haut), sur le compte du code : à l'achat ou à la vente selon le journal, sur immobilisations quand le compte de la ligne en est une. Même chose pour un droit de timbre (montant fixe) ou le FODEC. La ligne créée reste modifiable.
3. **Ajouter la retenue** : sur un journal d'achats ou de ventes, pour un tiers qui a une retenue par défaut (ou avec le code que vous choisissez), ce bouton crée la ligne de retenue à la source, calculée sur le **TTC hors timbre** (toutes les lignes sauf celles du tiers, du timbre, des retenues et des avances), au crédit du compte des retenues opérées à l'achat (432), au débit du compte des retenues subies à la vente (4341) ; la ligne du tiers passe au net. Le même bouton sert aux **retenues de TVA** (RSTVA25, RSTVA100 : calculées sur les lignes de TVA, ajoutez la TVA d'abord) et aux **avances** (AV_FORF1, AV_ALC5 : sur le TTC hors timbre, du même côté que la pièce ; la ligne du tiers augmente). Le seuil de 1 000 D des retenues sur achats s'apprécie par paiement : retirez la ligne quand la retenue n'est pas due.
4. **Modifier** / **Supprimer** une écriture en brouillard : depuis ses lignes. Le journal de la comptabilité garde la valeur d'avant et celle d'après, et le contenu d'une écriture supprimée.

### Points d'attention

:::attention
Une écriture refusée le dit : débits et crédits différents, moins de deux lignes ou un seul compte, date hors de l'exercice ouvert ou dans une période close, journal désactivé, compte non imputable (désactivé ou avec des sous-comptes actifs), tiers manquant sur un compte collectif ou posé sur un autre compte, code de taxe désactivé, échéance avant la date de l'écriture.
:::

:::attention
Dès qu'une écriture existe, le dossier ne se supprime plus et les dates de son exercice ne changent plus ; un compte, un journal ou un code de taxe porté par une écriture ne se désactive ni ne se supprime plus ; un tiers porté par une écriture ne se supprime plus (il se désactive : ses écritures en brouillard restent modifiables), son code et son compte collectif ne changent plus. La date de traitement est celle du serveur, jamais modifiable (NC 01).
:::

:::astuce
Le numéro provisoire (B-000012) n'est pas le numéro définitif : celui-ci, continu par journal et par exercice (AC-2026-000001), sera attribué à la validation, à l'étape suivante, avec la contre-passation, la clôture des périodes et le journal général. Un brouillard supprimé ne laisse donc aucun trou dans la série définitive.
:::
$f215f$, 'écritures, saisie, brouillard, journal, pièce, référence, libellé, lignes, débit, crédit, partie double, équilibre, compte imputable, tiers, code de taxe, échéance, ajouter la TVA, ajouter la retenue, retenue à la source, timbre, numéro provisoire, B-000001, modifier, supprimer, période, exercice', '/ecritures')
)
INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
SELECT f.slug, f.titre, f.icone, 'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'
  FROM fiche f
ON CONFLICT (slug) DO NOTHING;
