-- LabFlow Compta, étape S5c « Les tiers et les imports » (labflow-reprise/achats-compta/PLAN-S5.md §1, §2, §4 ; SPEC-SOCLE
-- D18 ; réponses du client du 07/10 — questions 4, 5 et 6 : codes préfixe + chiffres réglables par dossier, tiers sans
-- compte individuel dans le plan, import au modèle Excel de LabFlow Compta — et du 08/10 — « ok pour les 4 » : modèle des
-- codes réglé sur la page Tiers, retenue par défaut = un code de taxe de type retenue, import du plan de comptes dans
-- S5c, le niveau Saisie crée et modifie des tiers). Migration additive : aucun compte, accès, plan, journal ni code de
-- taxe existant ne change.
-- 1) Le modèle des codes de tiers du dossier : préfixe des fournisseurs (F), préfixe des clients (C), nombre de chiffres
--    (4) → F0001, C0001 ; préfixe vide permis (codes tout en chiffres) ; préfixe (0 à 3) + chiffres (3 à 7) ≤ 10
--    caractères, la longueur d'un code. Réglable depuis la page Tiers (titulaire ou Complet) ; les codes déjà attribués
--    ne changent pas.
ALTER TABLE compta.dossiers ADD COLUMN IF NOT EXISTS tiers_prefixe_fournisseur VARCHAR(3) NOT NULL DEFAULT 'F' CHECK (tiers_prefixe_fournisseur ~ '^[A-Z0-9]{0,3}$');
ALTER TABLE compta.dossiers ADD COLUMN IF NOT EXISTS tiers_prefixe_client VARCHAR(3) NOT NULL DEFAULT 'C' CHECK (tiers_prefixe_client ~ '^[A-Z0-9]{0,3}$');
ALTER TABLE compta.dossiers ADD COLUMN IF NOT EXISTS tiers_chiffres SMALLINT NOT NULL DEFAULT 4 CHECK (tiers_chiffres BETWEEN 3 AND 7);

-- 2) Les tiers d'un dossier : fournisseurs et clients (réponse 5 du 07/10 : le tiers est une dimension de la ligne
--    d'écriture — compte collectif + tiers —, aucun compte individuel dans le plan). Code unique par dossier et par type
--    (2 à 10 lettres majuscules ou chiffres, saisi ou généré) ; matricule contrôlé en forme, jamais unique ; compte
--    collectif = un compte du plan de nature fournisseurs ou clients (clé étrangère sans action : le code refuse de
--    désactiver ou de supprimer un compte porté — planComptes.compteUtilise ; la suppression d'un dossier vide emporte
--    tout, CASCADE, la vérification des clés se faisant en fin d'ordre) ; retenue par défaut = un code de taxe de type
--    retenue du dossier (SET NULL : un code ne se supprime jamais, le lien tient) ; délai de paiement en jours (0 =
--    comptant) ; origine « saisi » ou « import ». Un tiers se désactive ; il ne se supprime que sans écriture.
CREATE TABLE IF NOT EXISTS compta.tiers (
  id               SERIAL PRIMARY KEY,
  dossier_id       INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE,
  type             VARCHAR(12) NOT NULL CHECK (type IN ('fournisseur', 'client')),
  code             VARCHAR(10) NOT NULL CHECK (code ~ '^[A-Z0-9]{2,10}$'),
  nom              VARCHAR(255) NOT NULL,
  matricule_fiscal VARCHAR(50),
  adresse          VARCHAR(300),
  ville            VARCHAR(120),
  telephone        VARCHAR(30),
  email            VARCHAR(255),
  compte_id        INTEGER NOT NULL REFERENCES compta.comptes(id),
  regime_tva       VARCHAR(15) NOT NULL DEFAULT 'assujetti' CHECK (regime_tva IN ('assujetti', 'non_assujetti', 'exonere', 'suspension')),
  retenue_id       INTEGER REFERENCES compta.taxes(id) ON DELETE SET NULL,
  delai_paiement   SMALLINT NOT NULL DEFAULT 0 CHECK (delai_paiement BETWEEN 0 AND 365),
  origine          VARCHAR(10) NOT NULL DEFAULT 'saisi' CHECK (origine IN ('saisi', 'import')),
  actif            BOOLEAN NOT NULL DEFAULT true,
  cree_par         INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dossier_id, type, code)
);
CREATE INDEX IF NOT EXISTS idx_compta_tiers_compte ON compta.tiers (compte_id);
CREATE INDEX IF NOT EXISTS idx_compta_tiers_retenue ON compta.tiers (retenue_id);

-- 3) Manuel de LabFlow Compta (vocabulaire comptable fixe, jamais balisé). Fiches existantes : texte remplacé seulement
--    s'il est encore celui de la migration 213 (« Fiche du dossier », « Dossiers », « Plan de comptes », « Taxes » ;
--    garde md5 du texte par défaut, sans \r) ; le texte servi suit seulement s'il n'a pas été retouché dans l'admin.
--    Idempotent : au 2e passage, la garde ne correspond plus.
UPDATE manuel_sections
   SET contenu = CASE WHEN contenu = contenu_defaut THEN f.texte ELSE contenu END,
       contenu_defaut = f.texte
  FROM (VALUES ($f214a$## 🗂️ Fiche du dossier

Cette page présente un dossier : son identité, son régime fiscal, son exercice en cours, sa configuration et les personnes qui y ont accès. Vous l'ouvrez depuis la page **Dossiers** (cabinet), **Cabinet** (collaborateur d'un cabinet), **Ma comptabilité** (client LabFlow) ou **Comptabilité de …** (comptable d'un client).

### Ce que vous voyez

- **Identité** : raison sociale, nom commercial, forme juridique, matricule fiscal, RNE, adresse, représentant légal. **Modifier** ouvre le formulaire, lecture de la patente comprise. Le dossier **« Mon entreprise »** d'un client LabFlow porte la mention **LabFlow** : son identité a été copiée de son compte LabFlow le jour de sa création.
- **Régime fiscal** : personne, impôt, TVA, exportateur total, télédéclaration, début d'activité. **Modifier** le change.
- **Exercice en cours** : ses dates et ses périodes mensuelles, toutes ouvertes pour l'instant. **Modifier** change ses dates tant qu'aucune écriture n'est enregistrée ; les périodes sont refaites.
- **Configuration** : le **plan de comptes** du dossier (nombre de comptes actifs), ses **journaux**, ses **codes de taxe** et ses **tiers** (fournisseurs et clients ; nombre de chacun) ; **Ouvrir** mène aux pages **Plan de comptes**, **Journaux**, **Taxes** et **Tiers** (voir leurs fiches dans ce manuel).
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
:::$f214a$, 'compta-dossier', '5e8ce74951b390f0e5e3f539b3076f04'),
($f214b$## 📁 Dossiers

Un dossier est une entreprise dont vous tenez la comptabilité : une entité juridique, avec son identité légale, son régime fiscal et ses exercices. Cette page réunit les dossiers de votre cabinet. Vous la trouvez dans le menu de gauche, entrée **Dossiers**.

### Ce que vous voyez

- **La liste des dossiers** : pour chacun, son nom, son matricule fiscal, sa forme juridique et son exercice en cours. Un dossier dont l'identité est incomplète porte la mention **Identité à compléter**. Un dossier archivé porte la mention **Archivé** et n'apparaît que si vous cochez **Afficher les archivés**. La liste s'affiche par pages de 25 : **Afficher plus** charge les suivants.
- **La recherche** : tapez un nom, une raison sociale, un nom commercial ou un matricule ; la recherche porte sur tous les dossiers du cabinet, pas seulement sur ceux affichés.
- **Qui peut quoi** : le titulaire du cabinet et les gérants de niveau **Complet** créent et modifient des dossiers ; les gérants de niveau **Saisie** ou **Consultation** les consultent. Archiver, désarchiver et supprimer un dossier sont réservés au titulaire.

### Actions pas à pas

1. **Créer un dossier** : cliquez sur **+ Dossier**. L'assistant comporte quatre étapes.
   - **Identité** : raison sociale, forme juridique, matricule fiscal, RNE, adresse, représentant légal. **Lire la patente** (PDF, photo ou code QR) remplit les champs vides ; vous pouvez tout corriger. Seule la raison sociale est obligatoire.
   - **Régime fiscal** : personne morale ou physique, impôt (IS ou IRPP), régime de TVA (réel, forfaitaire ou non assujetti), exportateur total, télédéclaration, date de début d'activité. Les deux premiers sont proposés d'après la forme juridique.
   - **Premier exercice** : l'année civile en cours est proposée ; vous pouvez choisir d'autres dates (la fin doit être le dernier jour d'un mois, douze mois au plus). Les périodes mensuelles sont créées avec l'exercice.
   - **Récapitulatif**, puis **Créer le dossier**.
2. **Ouvrir un dossier** : cliquez sur sa carte ; sa fiche s'ouvre (voir la fiche **Fiche du dossier** de ce manuel).

### Points d'attention

:::attention
Un matricule fiscal déjà porté par un autre dossier du cabinet n'est pas refusé (groupes, franchises) : un avertissement vous le signale.
:::

:::astuce
Chaque dossier reçoit à sa création le plan de comptes de la norme NC 01, six journaux et les codes de taxe de son régime (TVA, retenues à la source, droit de timbre…), à adapter depuis sa fiche (voir les fiches **Plan de comptes**, **Journaux** et **Taxes** de ce manuel) ; ses fournisseurs et ses clients se saisissent ou s'importent d'un fichier Excel (fiche **Tiers**).
:::$f214b$, 'compta-dossiers', '2401af472751f09993d7c954b3ca5f7f'),
($f214c$## 📑 Plan de comptes

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
Un compte qui a des écritures, ou porté par un journal, un code de taxe ou un tiers (compte collectif), ne se désactive pas et ne se supprime pas (changez d'abord le compte du journal, du code ou du tiers). Aucune écriture n'existe encore : la saisie arrivera après la configuration du dossier.
:::

:::astuce
Seuls les comptes sans sous-compte actif (les « feuilles » de l'arbre) recevront des écritures : subdivisez les comptes de banque (un par compte bancaire) et de caisse, puis rattachez chaque journal de banque ou de caisse à son compte (page **Journaux**).
:::$f214c$, 'compta-plan-comptes', '43854c3d8b5b8da9be5fdf706231f02c'),
($f214d$## 🧾 Taxes

Les codes de taxe sont les taxes qu'une ligne d'écriture pourra porter : TVA par taux, retenues à la source, droit de timbre, FODEC, avances. Chaque code connaît son taux (ou son montant), son assiette et ses comptes : à la saisie, choisir un code suffira pour passer la taxe sur le bon compte. Chaque dossier reçoit à sa création les codes de son régime de TVA. Vous ouvrez cette page depuis la fiche du dossier, carte **Configuration**, ligne **Taxes**, bouton **Ouvrir**.

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
Les retenues à la source se calculent sur le montant TTC hors timbre, et le seuil de 1 000 D des retenues sur achats s'apprécie par paiement : ces règles s'appliqueront à la saisie. Le taux de la retenue sur achats (1,5 %, 1 % ou 0,5 %) dépend du régime du fournisseur : le code par défaut de chaque fournisseur se règle dans sa fiche (page **Tiers**, retenue par défaut).
:::

:::astuce
Depuis le 1ᵉʳ janvier 2026, les certificats de retenue passent par la plateforme TEJ : chaque code de retenue porte déjà son code d'opération TEJ (quand il existe), pour les produire à l'étape « Taxes et déclarations ».
:::$f214d$, 'compta-taxes', '66e5318c8c448d581f4ad4508ded6eea')
  ) AS f(texte, slug, garde)
 WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'
   AND md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde;

-- Nouvelle fiche : la page « Tiers » d'un dossier (son bouton « ? »).
WITH fiche (slug, titre, icone, ordre, contenu, mots_cles, ecran) AS (VALUES
  ('compta-tiers', 'Tiers', '📇', 1063, $f214e$## 📇 Tiers

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
Un tiers qui a des écritures ne se supprime pas (désactivez-le) et son code ne change plus. Aucune écriture n'existe encore : la saisie arrivera après la configuration du dossier.
:::

:::astuce
Dans le modèle Excel, les colonnes sont en texte : un code « 0012 » reste « 0012 ». Si vous préparez le fichier depuis un autre logiciel, gardez les en-têtes du modèle tels quels.
:::

:::astuce
Un compte collectif porté par un tiers ne se désactive pas et ne se supprime pas dans le plan : changez d'abord le compte du tiers. Le taux de la retenue sur achats (1,5 %, 1 % ou 0,5 %) dépend du régime du fournisseur : réglez sa retenue par défaut dans sa fiche.
:::$f214e$, 'tiers, fournisseurs, clients, code, F0001, C0001, modèle des codes, matricule, compte collectif, 4011, 4111, régime de TVA, retenue par défaut, délai de paiement, importer, import Excel, exporter, désactiver, supprimer', '/tiers')
)
INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
SELECT f.slug, f.titre, f.icone, 'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'
  FROM fiche f
ON CONFLICT (slug) DO NOTHING;
