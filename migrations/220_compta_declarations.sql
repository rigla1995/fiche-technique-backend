-- LabFlow Compta, étape S7c « Déclaration mensuelle » (labflow-reprise/achats-compta/PLAN-S7.md §1 ligne S7c, §2 « S7c »,
-- §4 ; réponses du client du 09/10 — « ok pour les 9 » ; question 7 : pas de vente à l'export pour l'instant).
-- 1) Les déclarations mensuelles : une par période d'un dossier — montants saisis à la main (salaires…), TCL corrigée,
--    écriture de liquidation de la TVA proposée (brouillard), marque « déclarée le » avec l'état figé (lignes, total).
-- 2) Manuel : fiches « Fiche du dossier » et « Taxes du mois et certificats » complétées sous garde md5 des textes de la
--    219 ; nouvelle fiche « Déclaration mensuelle » (1075, /declaration).
-- Additive et rejouable (IF NOT EXISTS, ON CONFLICT DO NOTHING, gardes md5).

-- 1) Les déclarations.
CREATE TABLE IF NOT EXISTS compta.declarations (
  id            SERIAL PRIMARY KEY,
  dossier_id    INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE,
  periode_id    INTEGER NOT NULL REFERENCES compta.periodes(id) ON DELETE CASCADE,
  saisies       JSONB NOT NULL DEFAULT '{}'::jsonb,
  tcl           NUMERIC(18,3) CHECK (tcl IS NULL OR tcl >= 0),
  ecriture_id   INTEGER REFERENCES compta.ecritures(id) ON DELETE SET NULL,
  declaree_le   DATE,
  declaree_par  INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  marquee_le    TIMESTAMPTZ,
  montants      JSONB,
  total         NUMERIC(18,3),
  modifie_par   INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dossier_id, periode_id),
  CHECK ((declaree_le IS NULL) = (marquee_le IS NULL)),
  CHECK ((declaree_le IS NULL) = (montants IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_compta_declarations_ecriture ON compta.declarations (ecriture_id) WHERE ecriture_id IS NOT NULL;

-- 2) Manuel : fiches existantes, texte remplacé seulement s'il est encore celui de la migration 219 ; garde md5 du texte
--    par défaut, sans \r ; le texte servi suit seulement s'il n'a pas été retouché dans l'admin. Idempotent : au 2e
--    passage, la garde ne correspond plus.
UPDATE manuel_sections
   SET contenu = CASE WHEN contenu = contenu_defaut THEN f.texte ELSE contenu END,
       contenu_defaut = f.texte
  FROM (VALUES ($f220a$## 🗂️ Fiche du dossier

Cette page présente un dossier : son identité, son régime fiscal, son exercice en cours, sa configuration et les personnes qui y ont accès. Vous l'ouvrez depuis la page **Dossiers** (cabinet), **Cabinet** (collaborateur d'un cabinet), **Ma comptabilité** (client LabFlow) ou **Comptabilité de …** (comptable d'un client).

### Ce que vous voyez

- **Identité** : raison sociale, nom commercial, forme juridique, matricule fiscal, RNE, adresse, représentant légal. **Modifier** ouvre le formulaire, lecture de la patente comprise. Le dossier **« Mon entreprise »** d'un client LabFlow porte la mention **LabFlow** : son identité a été copiée de son compte LabFlow le jour de sa création.
- **Régime fiscal** : personne, impôt, TVA, exportateur total, télédéclaration, début d'activité. **Modifier** le change.
- **Exercice en cours** : ses dates et ses périodes mensuelles, avec leur état (ouverte ou close : page **Périodes**). **Modifier** change ses dates tant qu'aucune écriture n'est enregistrée ; les périodes sont refaites. Dès la première écriture, ce bouton disparaît.
- **Configuration** : le **plan de comptes** du dossier (nombre de comptes actifs), ses **journaux**, ses **codes de taxe** et ses **tiers** (fournisseurs et clients ; nombre de chacun) ; **Ouvrir** mène aux pages **Plan de comptes**, **Journaux**, **Taxes** et **Tiers** (voir leurs fiches dans ce manuel).
- **Tenue** : les **écritures** du dossier (en brouillard, validées), ses **périodes** (ouvertes, closes), ses **livres** — grand livre, balance, journaux —, le **lettrage** (lignes validées à lettrer) et l'**échéancier** (ce qui reste dû aux fournisseurs et par les clients, dont la part échue) ; **Ouvrir** mène aux pages **Écritures**, **Périodes**, **Livres**, **Lettrage** et **Échéancier** (fiches de ce manuel).
- **Taxes** : les **taxes du mois** de la période en cours — TVA à payer ou crédit à reporter, pièces à retenue qui attendent leur certificat, certificats produits — ; **Ouvrir** mène à la page **Taxes du mois** (fiche « Taxes du mois et certificats »). La ligne **Déclaration mensuelle** montre le mois à déclarer et son échéance, ou la date de sa déclaration ; **Ouvrir** mène à la page **Déclaration mensuelle** (fiche « Déclaration mensuelle »).
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
:::$f220a$, 'compta-dossier', 'c3af5cef30aaaeaf61dcf74daec418e2'),
($f220b$## 🧾 Taxes du mois et certificats

La page **Taxes du mois** rassemble, pour une période (un mois de l'exercice), l'**état de TVA**, les **retenues à la source** opérées sur vos fournisseurs et leurs **certificats**, le **fichier de la plateforme TEJ** et les retenues **subies** (celles que vos clients ont faites sur vous). Vous l'ouvrez depuis la fiche du dossier, carte **Taxes**, ligne **Taxes du mois**, bouton **Ouvrir**.

### Ce que vous voyez

- **La période** : le mois en cours par défaut ; choisissez-en un autre dans la liste. La case **Brouillard compris** (cochée par défaut) fait entrer les écritures en brouillard dans l'état de TVA et dans les retenues subies ; les certificats, eux, ne se produisent que sur des écritures **validées**.
- **L'état de TVA** : la TVA collectée par code (avec sa base hors taxes), la TVA déductible sur biens et services et sur immobilisations, les retenues de TVA subies (secteur public), le **crédit reporté** du mois précédent (au premier mois de l'exercice : les à-nouveaux du compte 43667), puis le résultat : **TVA à payer** ou **crédit à reporter** (il passe au mois suivant). La TVA est exigible aux débits : une facture compte dans la période de son écriture. Seules les lignes qui portent un code de taxe comptent ; une ligne de TVA sans code (liquidation, régularisation, saisie sans code) est signalée avec ses montants ; l'écriture de liquidation proposée par la page **Déclaration mensuelle** ne l'est pas. Sans à-nouveau sur le compte 43667 alors que l'exercice précédent finissait en crédit, la page le signale aussi : le crédit n'est jamais ajouté d'office.
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
$f220b$, 'compta-taxes-mois', '84f97453e31f9186d94621f75e90611c')
  ) AS f(texte, slug, garde)
 WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'
   AND md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde;

-- 3) Nouvelle fiche : la page « Déclaration mensuelle » d'un dossier (son bouton « ? »).
WITH fiche (slug, titre, icone, ordre, contenu, mots_cles, ecran) AS (VALUES
  ('compta-declaration', 'Déclaration mensuelle', '🗓️', 1075, $f220c$## 🗓️ Déclaration mensuelle

La page **Déclaration mensuelle** prépare, pour une période (un mois de l'exercice), l'**état à recopier** sur le portail de la Direction générale des impôts (impots.finances.gov.tn) : la déclaration mensuelle s'y saisit en ligne, aucun dépôt par fichier n'existe. Vous l'ouvrez depuis la fiche du dossier, carte **Taxes**, ligne **Déclaration mensuelle**, bouton **Ouvrir**.

### Ce que vous voyez

- **La période** : le dernier mois fini par défaut ; choisissez-en un autre dans la liste. Seules les écritures **validées** comptent ; une période encore ouverte ou des écritures en brouillard sont signalées. **L'échéance** : au mois suivant, le 15 pour une personne physique, le 20 pour une personne morale télédéclarante, le 28 sinon ; reportée au lundi quand elle tombe un samedi ou un dimanche (les jours fériés ne sont pas pris en compte).
- **Les lignes de la déclaration**, dans l'ordre du portail : **TVA à payer** (l'état de TVA du mois, comme sur la page Taxes du mois) ; **retenues à la source par nature** (code TEJ) sur les paiements du mois — certifiées ou encore à certifier — et **retenues de TVA** opérées ; avances facturées (articles 51 quater et 51 septies) s'il y en a ; **droit de timbre collecté** ; FODEC collecté s'il y en a ; **TCL** ; les lignes **saisies à la main** (retenues sur salaires, contribution sociale de solidarité, TFP, FOPROLOS, autres impôts et taxes) ; enfin le **total à payer**. Un crédit de TVA à reporter ne s'impute pas sur les autres impôts.
- **TVA** : la TVA collectée par code, la TVA déductible (biens et services, immobilisations), les retenues de TVA subies, le crédit reporté et le résultat.
- **Retenues par nature** : code TEJ, base TTC, part déjà certifiée et part encore à certifier ; une pièce à retenue bloquée n'est pas comptée (elle est signalée).
- **TCL** : 0,2 % du chiffre d'affaires brut du mois (comptes 70, TVA collectée comprise ; 0,1 % pour un exportateur total). Le minimum (taxe sur les immeubles bâtis) et le plafond annuel de 100 000 D ne sont pas calculés : **corrigez le montant** si besoin.
- **Écriture de TVA** : l'aperçu de l'écriture de liquidation — chaque compte de TVA du mois soldé, le crédit reporté imputé, la **TVA à payer** au compte 43651 ou le **crédit à reporter** au compte 43667.
- **Historique** : les mois de l'exercice, leur échéance, la date de déclaration, le total déclaré et l'écriture de TVA.
- **Signalements** : rien n'est passé d'office (période ouverte, brouillards, retenues bloquées, lignes de TVA sans code, échéance dépassée, montants changés depuis la déclaration…).
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** préparent, proposent l'écriture de TVA et marquent la déclaration ; tout le monde lit la page, l'imprime et l'exporte ; un dossier archivé se lit seulement.

### Actions pas à pas

1. **Préparer** : saisissez les montants des lignes à la main (salaires…), corrigez la TCL si besoin (vide : le calcul), puis **Enregistrer**.
2. **Proposer l'écriture de TVA** (après la fin du mois, sans écriture en brouillard dans la période) : une écriture en **brouillard** dans le journal des opérations diverses, datée du dernier jour du mois — ou, si la période est close, du premier jour de la période ouverte suivante avec sa vraie date. Vérifiez-la puis validez-la sur la page **Écritures** ; supprimée tant qu'elle est en brouillard, elle se propose de nouveau.
3. **Imprimer (PDF)** ou **Exporter (Excel)** : l'état à recopier sur le portail.
4. **Marquer comme déclarée** : la date du dépôt sur le portail ; l'état est figé dans l'historique, sans effet comptable. Si les montants changent ensuite, la page le signale (une déclaration rectificative peut être nécessaire). **Retirer la marque** rend la déclaration de nouveau modifiable.

### Points d'attention

:::attention
LabFlow Compta prépare la déclaration, il ne la dépose pas : recopiez chaque ligne sur impots.finances.gov.tn et payez avant l'échéance. Clôturez la période (page **Périodes**) avant de déclarer : une écriture ajoutée ensuite changerait les montants.
:::

:::attention
Points à faire valider par un comptable : l'assiette de la TCL (chiffre d'affaires brut, TVA comprise), le report de l'échéance un week-end ou un jour férié, les retenues déclarées sur les paiements du mois (date du règlement lettré, comme les certificats).
:::

:::astuce
Produisez d'abord les certificats de retenue du mois (page **Taxes du mois**) ; liquidez la TVA chaque mois dans l'ordre : le crédit à reporter passe d'un mois à l'autre par le compte 43667.
:::
$f220c$, 'déclaration mensuelle, déclaration, impôts, portail, impots.finances.gov.tn, échéance, TVA à payer, crédit de TVA, liquidation, écriture de TVA, retenues à la source, droit de timbre, FODEC, TCL, TFP, FOPROLOS, salaires, total à payer, déclarée, historique, exporter, PDF', '/declaration')
)
INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
SELECT f.slug, f.titre, f.icone, 'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'
  FROM fiche f
ON CONFLICT (slug) DO NOTHING;
