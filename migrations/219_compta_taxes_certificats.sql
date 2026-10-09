-- LabFlow Compta, étape S7b « TVA, retenues et certificats » (labflow-reprise/achats-compta/PLAN-S7.md §1 ligne S7b,
-- §2 « S7b », §3 points 3 à 8, §4 « TVA », « Retenues », « Seuil des retenues sur achats », « Droits », « Paquet pays » ;
-- réponses du client du 09/10 — « ok pour les 9 » : date de paiement des retenues = règlement lettré, sinon facture,
-- modifiable avant de produire ; fichier XML au cahier des charges TEJ v2.0, « à essayer sur TEJ » faute d'accès à la
-- plateforme). Migration additive : aucun tiers, code de taxe ni écriture existant ne change.
-- 1) Le tiers complété : régime fiscal d'un fournisseur (valeur d'une liste du paquet pays — fiscalite.regimesFiscaux —,
--    contrôlée par le serveur ; NULL = non renseigné), résidence, identifiant de secours d'un bénéficiaire sans matricule
--    fiscal (CIN, passeport, carte de séjour, autre ; numéro ; date de naissance ; pays) : la plateforme TEJ les exige.
ALTER TABLE compta.tiers ADD COLUMN IF NOT EXISTS regime_fiscal VARCHAR(20) CHECK (regime_fiscal IS NULL OR regime_fiscal ~ '^[a-z0-9_]{2,20}$');
ALTER TABLE compta.tiers ADD COLUMN IF NOT EXISTS resident BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE compta.tiers ADD COLUMN IF NOT EXISTS id_type VARCHAR(12) CHECK (id_type IS NULL OR id_type IN ('cin', 'passeport', 'carte_sejour', 'autre'));
ALTER TABLE compta.tiers ADD COLUMN IF NOT EXISTS id_numero VARCHAR(30);
ALTER TABLE compta.tiers ADD COLUMN IF NOT EXISTS id_naissance DATE;
ALTER TABLE compta.tiers ADD COLUMN IF NOT EXISTS id_pays CHAR(2) CHECK (id_pays IS NULL OR id_pays ~ '^[A-Z]{2}$');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_compta_tiers_identifiant') THEN
    ALTER TABLE compta.tiers ADD CONSTRAINT ck_compta_tiers_identifiant CHECK ((id_type IS NULL) = (id_numero IS NULL) AND (id_type IS NOT NULL OR (id_naissance IS NULL AND id_pays IS NULL)));
  END IF;
END $$;

-- 2) Les fichiers de la plateforme TEJ produits pour un dossier : mois de paiement, acte (0 = dépôt initial, un seul par
--    mois ; 1 = rectificatif), nom (MATRICULE-AAAA-MM-acte.xml), contenu gardé tel quel et son empreinte SHA-256 (il se
--    retélécharge à l'identique), nombre de certificats ajoutés et annulés, auteur et date de traitement. CASCADE sur le
--    dossier (modèle 208).
CREATE TABLE IF NOT EXISTS compta.fichiers_tej (
  id              SERIAL PRIMARY KEY,
  dossier_id      INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE,
  annee           SMALLINT NOT NULL CHECK (annee BETWEEN 2000 AND 2099),
  mois            SMALLINT NOT NULL CHECK (mois BETWEEN 1 AND 12),
  acte            SMALLINT NOT NULL CHECK (acte IN (0, 1)),
  nom             VARCHAR(40) NOT NULL,
  contenu         TEXT NOT NULL,
  empreinte       CHAR(64) NOT NULL,
  nb_ajouts       INTEGER NOT NULL DEFAULT 0 CHECK (nb_ajouts >= 0),
  nb_annulations  INTEGER NOT NULL DEFAULT 0 CHECK (nb_annulations >= 0),
  produit_par     INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (nb_ajouts + nb_annulations > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_compta_fichiers_tej_initial ON compta.fichiers_tej (dossier_id, annee, mois) WHERE acte = 0;
CREATE INDEX IF NOT EXISTS idx_compta_fichiers_tej_mois ON compta.fichiers_tej (dossier_id, annee, mois, id);

-- 3) Les certificats de retenue : un bénéficiaire (tiers, sans action : un tiers mouvementé ne se supprime jamais) et une
--    date de paiement ; numéro continu par dossier et par année de paiement (référence « 2026-000001 », celle du
--    certificat chez le déclarant) ; d'où vient la date (règlement lettré, facture, saisie) ; bénéficiaire, déclarant et
--    opérations FIGÉS (JSON : le certificat se reproduit à l'identique) ; totaux NUMERIC(18,3) ; état produit / annulé
--    (annulé : auteur, date, motif ; le numéro reste pris) ; fichier où il a été déposé, rectificatif qui porte son
--    annulation. CASCADE sur le dossier.
CREATE TABLE IF NOT EXISTS compta.certificats (
  id                     SERIAL PRIMARY KEY,
  dossier_id             INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE,
  tiers_id               INTEGER NOT NULL REFERENCES compta.tiers(id),
  annee                  SMALLINT NOT NULL CHECK (annee BETWEEN 2000 AND 2099),
  numero                 INTEGER NOT NULL CHECK (numero > 0),
  reference              VARCHAR(30) NOT NULL,
  date_paiement          DATE NOT NULL,
  source_date            VARCHAR(10) NOT NULL CHECK (source_date IN ('reglement', 'facture', 'saisie')),
  beneficiaire           JSONB NOT NULL,
  declarant              JSONB NOT NULL,
  operations             JSONB NOT NULL,
  total_ht               NUMERIC(18,3) NOT NULL,
  total_tva              NUMERIC(18,3) NOT NULL,
  total_ttc              NUMERIC(18,3) NOT NULL,
  total_rs               NUMERIC(18,3) NOT NULL CHECK (total_rs > 0),
  total_taxes            NUMERIC(18,3) NOT NULL DEFAULT 0,
  total_net              NUMERIC(18,3) NOT NULL,
  etat                   VARCHAR(10) NOT NULL DEFAULT 'produit' CHECK (etat IN ('produit', 'annule')),
  fichier_id             INTEGER REFERENCES compta.fichiers_tej(id),
  annulation_fichier_id  INTEGER REFERENCES compta.fichiers_tej(id),
  annule_par             INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  annule_le              TIMESTAMPTZ,
  motif_annulation       VARCHAR(255),
  produit_par            INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dossier_id, annee, numero),
  CHECK ((etat = 'annule') = (annule_le IS NOT NULL)),
  CHECK (annulation_fichier_id IS NULL OR (etat = 'annule' AND fichier_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_compta_certificats_mois ON compta.certificats (dossier_id, date_paiement);
CREATE INDEX IF NOT EXISTS idx_compta_certificats_fichier ON compta.certificats (fichier_id) WHERE fichier_id IS NOT NULL;

-- 4) Les lignes de retenue qu'un certificat couvre : une ligne n'est que dans un seul certificat ACTIF (index unique
--    partiel) ; l'annulation les rend (actif = false) sans effacer la trace.
CREATE TABLE IF NOT EXISTS compta.certificat_lignes (
  certificat_id  INTEGER NOT NULL REFERENCES compta.certificats(id) ON DELETE CASCADE,
  ligne_id       INTEGER NOT NULL REFERENCES compta.lignes(id) ON DELETE CASCADE,
  actif          BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (certificat_id, ligne_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_compta_certificat_lignes_actives ON compta.certificat_lignes (ligne_id) WHERE actif;

-- 5) Manuel : fiches existantes, texte remplacé seulement s'il est encore celui des migrations 218 (« Tiers », « Fiche du
--    dossier ») et 215 (« Taxes ») ; garde md5 du texte par défaut, sans \r ; le texte servi suit seulement s'il n'a pas
--    été retouché dans l'admin. Idempotent : au 2e passage, la garde ne correspond plus.
UPDATE manuel_sections
   SET contenu = CASE WHEN contenu = contenu_defaut THEN f.texte ELSE contenu END,
       contenu_defaut = f.texte
  FROM (VALUES ($f219a$## 📇 Tiers

Les tiers d'un dossier sont ses **fournisseurs** et ses **clients** : chaque ligne d'écriture passée sur un compte collectif (401 Fournisseurs, 411 Clients) portera son tiers, et le grand livre auxiliaire se lira par tiers. Le plan de comptes reste celui de la norme : aucun compte individuel n'y est créé. Vous ouvrez cette page depuis la fiche du dossier, carte **Configuration**, ligne **Tiers**, bouton **Ouvrir**.

### Ce que vous voyez

- **Deux onglets**, **Fournisseurs** et **Clients**, avec le nombre de tiers actifs de chacun ; la liste s'affiche par pages de 25 (**Afficher plus** charge les suivants) ; **Afficher les désactivés** les ajoute, après les actifs.
- **La recherche** : tapez un code, un nom ou un matricule ; elle porte sur tous les tiers de l'onglet, pas seulement sur ceux affichés.
- **Chaque tiers** : son code, son nom, son matricule fiscal (ou son identifiant de secours), sa ville, son compte collectif, sa retenue par défaut, son délai de paiement et, pour un fournisseur, son régime fiscal ; mention **Importé** pour un tiers venu d'un fichier Excel, **Désactivé** pour un tiers mis de côté, **Retenue désactivée** quand son code de retenue a été désactivé (page **Taxes**).
- **Le modèle des codes** : un code se compose d'un préfixe et d'un numéro (F0001 et C0001 par défaut : préfixe F ou C, 4 chiffres). Le bouton **Modèle des codes** le règle pour le dossier (préfixe de 0 à 3 lettres ou chiffres, 3 à 7 chiffres) ; les codes déjà attribués ne changent pas.
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** ou **Saisie** créent et modifient les tiers (un fournisseur nouveau arrive souvent avec sa facture) ; le modèle des codes, l'import et la suppression sont réservés au titulaire et au niveau **Complet** ; le niveau **Consultation** lit.

### Actions pas à pas

1. **Ajouter un tiers** : **+ Fournisseur** ou **+ Client**. Laissez le code vide pour qu'il soit généré d'après le modèle (le prochain numéro libre), ou saisissez-le (2 à 10 lettres majuscules ou chiffres, unique dans l'onglet). Seul le nom est obligatoire. Renseignez le matricule fiscal (même contrôle que l'identité du dossier ; un matricule déjà porté par un autre tiers est signalé, jamais refusé), l'adresse, la ville, le téléphone, l'email, le **compte collectif** (4011 pour un fournisseur, 4111 pour un client ; remplaçable par tout compte actif de même nature, par exemple 404 pour un fournisseur d'immobilisations), le **régime de TVA** (assujetti, non assujetti, exonéré, en suspension), la **retenue par défaut** (un code de retenue à la source du dossier, proposé à la saisie, jamais imposé) et le **délai de paiement** en jours (0 = comptant). Pour un fournisseur, renseignez aussi son **régime fiscal** (personne morale à l'IS de 25 % ou plus, de 20 %, de 15 % ou de 10 % ; personne physique au régime réel, à déduction des 2/3 ou au forfait) : il propose la retenue par défaut — sur achats 1,5 %, 1 % ou 0,5 % ; sur honoraires 3 % ou 10 % — et donne sa catégorie (personne morale ou physique) sur la plateforme TEJ ; s'il est **résident** en Tunisie (oui par défaut) ; et, pour un bénéficiaire sans matricule fiscal, son **identifiant** : CIN (8 chiffres), passeport, carte de séjour ou autre identifiant, avec sa date de naissance et le pays qui l'a délivré.
2. **Modifier** : tous les champs ; le code aussi, tant que le tiers n'a pas d'écriture.
3. **Désactiver** : le tiers sort de la saisie, sans être effacé ; **Réactiver** le remet. **Supprimer** : seulement un tiers sans écriture ; une confirmation est demandée.
4. **Importer (Excel)** : téléchargez le **modèle** depuis l'onglet (fournisseurs ou clients), remplissez une ligne par tiers (code en première colonne, vide = généré ; compte collectif par son numéro, vide = celui par défaut ; régime de TVA en toutes lettres ; retenue par son code, par exemple RS_MAR15 ; délai en jours ; colonnes facultatives à la suite : régime fiscal en toutes lettres, résident oui ou non, identifiant de secours, date de naissance JJ/MM/AAAA, pays en deux lettres — un fichier fait sur l'ancien modèle s'importe toujours), puis importez le fichier. **Toutes les lignes sont contrôlées avant d'écrire : à la moindre erreur, rien n'est importé** et le rapport donne, ligne par ligne, ce qu'il faut corriger. 2 000 lignes au plus par fichier.
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
Un compte collectif porté par un tiers ne se désactive pas et ne se supprime pas dans le plan : changez d'abord le compte du tiers. Le taux de la retenue sur achats (1,5 %, 1 % ou 0,5 %) dépend du régime du fournisseur : choisissez son régime fiscal, la retenue par défaut se propose d'après lui (et la saisie la propose quand la fiche n'en a pas).
:::

:::attention
Pour produire un certificat de retenue (page **Taxes du mois**), la plateforme TEJ exige du fournisseur : son matricule fiscal avec sa lettre de clé (ou, à défaut, sa CIN, son passeport ou sa carte de séjour avec sa date de naissance), son régime fiscal, son adresse, son email et son téléphone.
:::$f219a$, 'compta-tiers', '781b95be28a4ac87606638791cb9cf8f'),
($f219b$## 🗂️ Fiche du dossier

Cette page présente un dossier : son identité, son régime fiscal, son exercice en cours, sa configuration et les personnes qui y ont accès. Vous l'ouvrez depuis la page **Dossiers** (cabinet), **Cabinet** (collaborateur d'un cabinet), **Ma comptabilité** (client LabFlow) ou **Comptabilité de …** (comptable d'un client).

### Ce que vous voyez

- **Identité** : raison sociale, nom commercial, forme juridique, matricule fiscal, RNE, adresse, représentant légal. **Modifier** ouvre le formulaire, lecture de la patente comprise. Le dossier **« Mon entreprise »** d'un client LabFlow porte la mention **LabFlow** : son identité a été copiée de son compte LabFlow le jour de sa création.
- **Régime fiscal** : personne, impôt, TVA, exportateur total, télédéclaration, début d'activité. **Modifier** le change.
- **Exercice en cours** : ses dates et ses périodes mensuelles, avec leur état (ouverte ou close : page **Périodes**). **Modifier** change ses dates tant qu'aucune écriture n'est enregistrée ; les périodes sont refaites. Dès la première écriture, ce bouton disparaît.
- **Configuration** : le **plan de comptes** du dossier (nombre de comptes actifs), ses **journaux**, ses **codes de taxe** et ses **tiers** (fournisseurs et clients ; nombre de chacun) ; **Ouvrir** mène aux pages **Plan de comptes**, **Journaux**, **Taxes** et **Tiers** (voir leurs fiches dans ce manuel).
- **Tenue** : les **écritures** du dossier (en brouillard, validées), ses **périodes** (ouvertes, closes), ses **livres** — grand livre, balance, journaux —, le **lettrage** (lignes validées à lettrer) et l'**échéancier** (ce qui reste dû aux fournisseurs et par les clients, dont la part échue) ; **Ouvrir** mène aux pages **Écritures**, **Périodes**, **Livres**, **Lettrage** et **Échéancier** (fiches de ce manuel).
- **Taxes** : les **taxes du mois** de la période en cours — TVA à payer ou crédit à reporter, pièces à retenue qui attendent leur certificat, certificats produits — ; **Ouvrir** mène à la page **Taxes du mois** (fiche « Taxes du mois et certificats »).
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
:::$f219b$, 'compta-dossier', '0a03ea4ebb227aa14f4bf341aa2386bf'),
($f219c$## 🧾 Taxes

Les codes de taxe sont les taxes qu'une ligne d'écriture pourra porter : TVA par taux, retenues à la source, droit de timbre, FODEC, avances. Chaque code connaît son taux (ou son montant), son assiette et ses comptes : à la saisie, choisir un code suffit pour passer la taxe sur le bon compte (page **Écritures**, bouton **Ajouter la TVA**). Chaque dossier reçoit à sa création les codes de son régime de TVA. Vous ouvrez cette page depuis la fiche du dossier, carte **Configuration**, ligne **Taxes**, bouton **Ouvrir**.

### Ce que vous voyez

- **La liste des codes par type** (TVA, retenues à la source, retenues de TVA, droit de timbre, FODEC, avances) : code, libellé, taux ou montant, assiette, compte à l'achat, compte à la vente, compte sur immobilisations, mention **Ajouté** pour un code personnalisé, **Désactivé** pour un code mis de côté (affiché si vous cochez **Afficher les désactivés**).
- **Les codes selon le régime du dossier** : au régime réel, TVA 19 %, 13 %, 7 %, 0 %, exonéré, TVA non récupérable, puis les retenues, le timbre, le FODEC et les avances ; un exportateur total reçoit en plus **Achats en suspension de TVA** ; un dossier forfaitaire ou non assujetti ne reçoit aucun code de TVA (la TVA reste dans le coût), seulement les retenues, le timbre, le FODEC et les avances.
- **Les comptes** : TVA déductible 43666 (43662 sur immobilisations), TVA collectée 436711, retenues opérées 432, retenues subies 4341, timbre 6654 à l'achat. Trois comptes que la norme ne prévoit pas sont ajoutés au plan avec leur explication : 4375 Droit de timbre collecté, 4376 FODEC collecté, 43665 TVA retenue à la source ; remplacez-les si votre cabinet code autrement.
- **Compte à préciser** : un code dont le compte a des sous-comptes actifs ou est désactivé porte cette mention ; choisissez un autre compte (**Modifier**) ou rendez-le imputable dans le plan.
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** modifient les codes ; les niveaux **Saisie** et **Consultation** les consultent.

### Actions pas à pas

1. **Ajouter depuis le paquet** : la liste des codes du paquet Tunisie que le dossier n'a pas encore (TVA non récupérable 13 % et 7 %, retenues sur artistes, jetons de présence, intérêts, dividendes, non-résidents à régime privilégié, livraison en ligne, timbre des grandes surfaces, suspension de TVA) ; un clic le copie avec ses comptes. Un dossier dont le régime a changé retrouve ici les codes qui lui manquent.
2. **Ajouter un code personnalisé** : code (2 à 12 lettres, chiffres ou _), libellé, type, taux ou montant fixe, assiette, comptes ; pour une retenue à la source, son **code TEJ** (la nature de l'opération sur la plateforme, liste du cahier des charges) ; pour une retenue de TVA, RSTVA25 ou RSTVA100.
3. **Modifier** : le libellé et les comptes de tout code ; le type, le taux, le montant et l'assiette d'un code personnalisé seulement, tant qu'il n'a pas d'écriture. Un code du paquet garde les siens : un taux qui change est un nouveau code, apporté par une nouvelle version du paquet. Le code TEJ d'un code personnalisé se choisit à tout moment ; celui d'un code du paquet est figé.
4. **Désactiver** / **Réactiver** : un code mis de côté sort de la saisie, sans être effacé ; un code ne se supprime jamais.

### Points d'attention

:::attention
Les retenues à la source se calculent sur le montant TTC hors timbre, et le seuil de 1 000 D des retenues sur achats s'apprécie par paiement : à la saisie (page **Écritures**, bouton **Ajouter la retenue**), la retenue est calculée sur le TTC hors timbre ; le seuil reste à votre appréciation (retirez la ligne quand la retenue n'est pas due) ; la page **Taxes du mois** signale les retenues sous le seuil et celles qui manquent. Le taux de la retenue sur achats (1,5 %, 1 % ou 0,5 %) dépend du régime du fournisseur : le code par défaut de chaque fournisseur se règle dans sa fiche (page **Tiers**, retenue par défaut).
:::

:::astuce
Depuis le 1ᵉʳ janvier 2026, les certificats de retenue passent par la plateforme TEJ : chaque code de retenue porte son code d'opération TEJ (quand il existe) : les certificats et le fichier de la plateforme se produisent depuis la page **Taxes du mois** (fiche « Taxes du mois et certificats »). Un code sans code TEJ ne donne pas de certificat.
:::$f219c$, 'compta-taxes', 'acbe213e363aae2b3f1ed457f290c8a7')
  ) AS f(texte, slug, garde)
 WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'
   AND md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde;

-- 6) Nouvelle fiche : la page « Taxes du mois » d'un dossier (son bouton « ? »).
WITH fiche (slug, titre, icone, ordre, contenu, mots_cles, ecran) AS (VALUES
  ('compta-taxes-mois', 'Taxes du mois et certificats', '🧾', 1074, $f219d$## 🧾 Taxes du mois et certificats

La page **Taxes du mois** rassemble, pour une période (un mois de l'exercice), l'**état de TVA**, les **retenues à la source** opérées sur vos fournisseurs et leurs **certificats**, le **fichier de la plateforme TEJ** et les retenues **subies** (celles que vos clients ont faites sur vous). Vous l'ouvrez depuis la fiche du dossier, carte **Taxes**, ligne **Taxes du mois**, bouton **Ouvrir**.

### Ce que vous voyez

- **La période** : le mois en cours par défaut ; choisissez-en un autre dans la liste. La case **Brouillard compris** (cochée par défaut) fait entrer les écritures en brouillard dans l'état de TVA et dans les retenues subies ; les certificats, eux, ne se produisent que sur des écritures **validées**.
- **L'état de TVA** : la TVA collectée par code (avec sa base hors taxes), la TVA déductible sur biens et services et sur immobilisations, les retenues de TVA subies (secteur public), le **crédit reporté** du mois précédent (au premier mois de l'exercice : les à-nouveaux du compte 43667), puis le résultat : **TVA à payer** ou **crédit à reporter** (il passe au mois suivant). La TVA est exigible aux débits : une facture compte dans la période de son écriture. Seules les lignes qui portent un code de taxe comptent ; une ligne de TVA sans code (liquidation, régularisation) est signalée.
- **Retenues à certifier** : une rangée par **paiement** — un fournisseur et une date —, avec ses pièces : facture, nature et code TEJ, hors taxes, TVA, TTC (hors timbre), taux, retenue, net servi. La date proposée est celle du **règlement lettré** avec la facture (page **Lettrage**) ; sans règlement lettré, celle de la facture ; vous la corrigez avant de produire. Une rangée bloquée dit ce qui manque (fiche du fournisseur à compléter, pièce à plusieurs fournisseurs, code sans code TEJ…). Les paiements des autres mois et les pièces en brouillard sont comptés à part.
- **Certificats du mois** : numéro (2026-000001…, sans trou par année de paiement), date du paiement, bénéficiaire, retenue, état : **produit**, **déposé** (dans quel fichier) ou **annulé**.
- **Fichier TEJ** : ce que contiendra le prochain fichier du mois — dépôt **initial** (acte 0) ou **rectificatif** (acte 1) — et les fichiers déjà produits, avec leur date.
- **Retenues subies** : les lignes des comptes de retenues subies (4341) de la période, avec le client de la pièce : un crédit d'impôt, à rapprocher des certificats que vos clients vous remettent.
- **Signalements** : rien n'est passé d'office ; la page signale une retenue sur achats sous le seuil de 1 000 D TTC par paiement, une retenue manquante (achat d'un fournisseur à retenue sans ligne de retenue), un taux qui ne suit pas le régime fiscal du fournisseur, un certificat dont une pièce a été contre-passée, une identité de dossier ou une fiche de fournisseur incomplète pour la plateforme.
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** produisent et annulent les certificats et produisent le fichier ; tout le monde lit la page, télécharge les certificats et les fichiers déjà produits et exporte ; un dossier archivé se lit seulement.

### Actions pas à pas

1. **Produire les certificats** : cochez les paiements (tous ceux qui ne sont pas bloqués le sont d'office), corrigez une date si besoin, puis **Produire les certificats** ; une confirmation est demandée. Chaque paiement reçoit un certificat numéroté, avec ses pièces, son bénéficiaire et l'identité du dossier figés : il se retélécharge toujours à l'identique.
2. **Certificat (PDF)** : le certificat classique — payeur, retenues effectuées, bénéficiaire, cachet et signature —, un par un ; **Certificats du mois (PDF)** : tous ceux du mois en un fichier.
3. **Fichier TEJ (XML)** : le fichier du mois au format de la plateforme (MATRICULE-AAAA-MM-0.xml), avec les certificats pas encore déposés ; ensuite, les nouveaux certificats et les annulations du mois partent dans un **rectificatif** (acte 1). Déposez-le sur tej.finances.gov.tn. Chaque fichier produit se retélécharge à l'identique.
4. **Annuler** un certificat : avec un motif ; il garde son numéro et se marque annulé ; ses pièces redeviennent à certifier (corrigez, puis produisez-en un nouveau). S'il a déjà été déposé, l'annulation part dans le rectificatif suivant.
5. **Exporter (Excel)** : l'état de TVA, les retenues opérées (à produire et certifiées), les retenues subies et les signalements, à la charte LabFlow.

### Points d'attention

:::attention
Depuis le 1ᵉʳ janvier 2026, le certificat de retenue qui fait foi s'établit sur la plateforme **TEJ** (article 55 du code de l'IRPP et de l'IS) : le PDF de LabFlow Compta en reprend le contenu, il ne la remplace pas. Le fichier XML suit le cahier des charges TEJ v2.0 (juin 2024) ; un nouveau schéma est exigé depuis septembre 2026 et n'est pas encore publié : **le fichier est à essayer sur la plateforme** avant de compter dessus — en cas de refus, saisissez les certificats sur la plateforme à partir des PDF.
:::

:::attention
La plateforme exige, pour chaque bénéficiaire, son matricule fiscal avec sa lettre de clé (ou, à défaut, sa CIN, son passeport ou sa carte de séjour, avec sa date de naissance), son régime fiscal (personne morale ou physique), son adresse, son email et son téléphone ; et, pour le dossier, son matricule fiscal avec sa lettre de clé. Complétez la fiche du fournisseur (page **Tiers**) ou l'identité du dossier avant de produire. Les textes du fichier s'écrivent sans accent ni signe interdit, comme le demande la plateforme.
:::

:::astuce
Lettrez les factures avec leurs règlements au fil de l'eau (page **Lettrage**) : la date du paiement se propose seule. Le certificat s'établit au plus tard à la fin du mois qui suit le paiement ; la TVA à payer du mois se reporte sur la déclaration mensuelle.
:::
$f219d$, 'taxes du mois, TVA, état de TVA, TVA collectée, TVA déductible, crédit de TVA, TVA à payer, retenue à la source, retenues opérées, retenues subies, certificat de retenue, certificats, TEJ, plateforme TEJ, fichier XML, rectificatif, annuler, seuil 1 000 D, régime fiscal, bénéficiaire, PDF, exporter, Excel', '/taxes-mois')
)
INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
SELECT f.slug, f.titre, f.icone, 'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'
  FROM fiche f
ON CONFLICT (slug) DO NOTHING;
