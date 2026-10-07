-- LabFlow Compta, étape S4b « Le dossier du client LabFlow » (labflow-reprise/achats-compta/PLAN-S4.md §1, §4 ; réponses
-- 3 et 4 du client du 07/10). Migration additive : aucune table ne change (un index d'unicité s'ajoute).
-- 0) Un seul dossier « Mon entreprise » par comptabilité (filet sous le code, qui le vérifie avant de créer).
CREATE UNIQUE INDEX IF NOT EXISTS compta_dossiers_labflow_unique ON compta.dossiers (espace_id) WHERE source = 'labflow';

-- 1) Dossier « Mon entreprise » des clients LabFlow dont la comptabilité est déjà ouverte (module Comptabilité actif) et
--    qui n'en ont pas encore : identité copiée de leur compte LabFlow (profil_entreprise ; raison sociale = nom
--    commercial, sinon nom du contact, sinon « Mon entreprise » — jamais un refus, le dossier reste « à compléter »),
--    régime proposé d'après la forme juridique (EI et auto-entrepreneur : personne physique à l'IRPP ; sinon personne
--    morale à l'IS ; TVA au réel), premier exercice = année civile en cours et ses 12 périodes mensuelles, journal.
--    Les comptabilités fermées (module désactivé) recevront le leur à la réactivation (moduleClient.basculer →
--    dossierLabflow.assurerDossierLabflow). Idempotent : au 2e passage, chaque comptabilité a déjà son dossier.
WITH cibles AS (
  SELECT e.id AS espace_id, e.titulaire_id, u.nom AS contact,
         pe.raison_sociale, pe.nom_commercial, pe.forme_juridique, pe.matricule_fiscal, pe.rne, pe.adresse, pe.ville,
         pe.representant_nom, pe.representant_qualite
    FROM compta.espaces e
    JOIN utilisateurs u ON u.id = e.titulaire_id
    LEFT JOIN profil_entreprise pe ON pe.client_id = u.id
   WHERE e.type = 'client_labflow' AND e.etat = 'actif'
     AND NOT EXISTS (SELECT 1 FROM compta.dossiers d WHERE d.espace_id = e.id AND d.source = 'labflow')
), inseres AS (
  INSERT INTO compta.dossiers (espace_id, nom, raison_sociale, nom_commercial, forme_juridique, matricule_fiscal, rne, adresse, ville,
                               representant_nom, representant_qualite, personne, impot, tva, source, client_labflow_id)
  SELECT espace_id,
         LEFT(COALESCE(NULLIF(TRIM(nom_commercial), ''), NULLIF(TRIM(raison_sociale), ''), NULLIF(TRIM(contact), ''), 'Mon entreprise'), 255),
         LEFT(COALESCE(NULLIF(TRIM(raison_sociale), ''), NULLIF(TRIM(nom_commercial), ''), NULLIF(TRIM(contact), ''), 'Mon entreprise'), 255),
         NULLIF(TRIM(nom_commercial), ''), forme_juridique, matricule_fiscal, rne, LEFT(TRIM(adresse), 300), ville,
         representant_nom, representant_qualite,
         CASE WHEN forme_juridique IN ('EI', 'AUTO_ENTREPRENEUR') THEN 'physique' ELSE 'morale' END,
         CASE WHEN forme_juridique IN ('EI', 'AUTO_ENTREPRENEUR') THEN 'IRPP' ELSE 'IS' END,
         'reel', 'labflow', titulaire_id
    FROM cibles
  RETURNING id, espace_id, nom, matricule_fiscal
), exercices AS (
  INSERT INTO compta.exercices (dossier_id, debut, fin)
  SELECT id, date_trunc('year', (NOW() AT TIME ZONE 'Africa/Tunis'))::date, (date_trunc('year', (NOW() AT TIME ZONE 'Africa/Tunis')) + interval '1 year' - interval '1 day')::date
    FROM inseres
  RETURNING id, dossier_id, debut, fin
), periodes AS (
  INSERT INTO compta.periodes (exercice_id, debut, fin)
  SELECT x.id, m::date, (m + interval '1 month' - interval '1 day')::date
    FROM exercices x, generate_series(x.debut::timestamp, x.fin::timestamp, interval '1 month') AS m
  RETURNING 1
), journal_dossiers AS (
  INSERT INTO compta.evenements (espace_id, auteur_id, type, details)
  SELECT espace_id, NULL, 'dossier_cree', jsonb_build_object('dossier', id, 'nom', nom, 'matricule', matricule_fiscal, 'source', 'labflow', 'migration', 209)
    FROM inseres
  RETURNING 1
)
INSERT INTO compta.evenements (espace_id, auteur_id, type, details)
SELECT i.espace_id, NULL, 'exercice_cree', jsonb_build_object('dossier', i.id, 'exercice', x.id, 'debut', x.debut, 'fin', x.fin, 'migration', 209)
  FROM inseres i
  JOIN exercices x ON x.dossier_id = i.id;

-- 2) Manuel de LabFlow Compta (vocabulaire comptable fixe, jamais balisé). Fiches existantes : texte remplacé seulement
--    s'il est encore celui des migrations 205 et 208 (garde md5 du texte par défaut, sans \r) ; le texte servi suit
--    seulement s'il n'a pas été retouché dans l'admin. Idempotent : au 2e passage, la garde ne correspond plus.
UPDATE manuel_sections
   SET contenu = CASE WHEN contenu = contenu_defaut THEN f.texte ELSE contenu END,
       contenu_defaut = f.texte
  FROM (VALUES ($f209a$## 📒 Ma comptabilité

Cette page présente la comptabilité de votre entreprise dans LabFlow Compta. Elle existe dès que le **module Comptabilité** est activé sur votre compte LabFlow. Vous la trouvez dans le menu de gauche, entrée **Ma comptabilité**, ou depuis l'accueil.

### Ce que vous voyez

- **Votre module** : le prix mensuel du module (et des gérants comptables supplémentaires s'il y en a) et le mois à partir duquel il est facturé, avec votre abonnement LabFlow, sur la même facture.
- **Votre comptable** : le module comprend l'accès d'un comptable. Tant que vous ne l'avez pas désigné, il apparaît « À désigner » ; ensuite, vous voyez son nom, son adresse, son niveau et « Invitation envoyée » tant qu'il n'a pas activé son compte.
- **Gérants comptables supplémentaires** : les autres accès comptables, dans la limite achetée.
- **Mes dossiers** : le dossier **« Mon entreprise »** a été créé d'office d'après l'identité de votre compte LabFlow (raison sociale, matricule fiscal, adresse) ; s'il lui manque quelque chose, il porte la mention **Identité à compléter**. Vous pouvez ouvrir d'autres dossiers pour vos autres entités (bouton **+ Dossier**). Chaque carte ouvre la fiche du dossier.

### Actions pas à pas

1. **Activer le module** : dans LabFlow, page **Mon abonnement**, carte **Module Comptabilité**, cliquez sur **Demander l'activation** ; l'équipe LabFlow valide votre demande.
2. **Venir ici** : dans LabFlow, bouton **📒 Comptabilité** de la barre du haut (ou l'écran de choix après la connexion) : vous arrivez ici sans ressaisir votre mot de passe ; le bouton **📦 Stock / Vente** vous ramène dans LabFlow.
3. **Désigner votre comptable** : cliquez sur **Gérer sur LabFlow**. La page **Gérants** de LabFlow s'ouvre, partie **Gérants Comptabilité** : indiquez son nom, son adresse email et son niveau.
4. **Créer un dossier** : cliquez sur **+ Dossier**. L'assistant comporte quatre étapes : identité (avec **Lire la patente**), régime fiscal, premier exercice, récapitulatif. Seule la raison sociale est obligatoire.

### Les niveaux

| Niveau | Ce que la personne pourra faire |
|---|---|
| Consultation | tout lire, sans rien écrire |
| Saisie | saisir les pièces et les écritures, sans valider, clôturer ni configurer |
| Complet | tout, y compris valider, clôturer et configurer le dossier |

Sur les dossiers : votre comptable et vos gérants comptables de niveau **Complet** créent et modifient des dossiers ; ceux de niveau **Saisie** ou **Consultation** les consultent. Archiver, désarchiver et supprimer un dossier vous sont réservés ; le dossier « Mon entreprise » ne se supprime pas, il s'archive.

### Points d'attention

:::attention
Le module est facturé à son prix, à partir du mois qui suit son activation. Les promotions de votre abonnement LabFlow ne s'y appliquent pas.
:::

:::astuce
Le dossier « Mon entreprise » a copié votre identité LabFlow le jour de sa création. Si vous la corrigez ensuite dans LabFlow (page **Mon entreprise**), le bouton **Reprendre l'identité de LabFlow** de sa fiche la recopie dans le dossier.
:::$f209a$, 'compta-ma-comptabilite', 'db8c12b7116113d0d568d4307f28c689'),
($f209b$## 🤝 Comptabilité confiée

Cette page présente une comptabilité qu'un client LabFlow vous a confiée. Vous l'ouvrez depuis l'accueil, groupe **Comptabilités confiées par des clients LabFlow**.

### Ce que vous voyez

- **Le client** : son identité (raison sociale, forme juridique, matricule fiscal, adresse) et son contact (nom, adresse email, téléphone).
- **Votre accès** : votre niveau (Consultation, Saisie ou Complet) et la date à laquelle la comptabilité vous a été confiée.
- **Les dossiers** : les dossiers du client qui vous sont ouverts — son dossier **« Mon entreprise »** (créé d'office d'après son compte LabFlow) et ses autres entités. Chaque carte ouvre la fiche du dossier. Avec le niveau **Complet**, vous pouvez créer des dossiers (bouton **+ Dossier**) et les modifier ; avec les niveaux **Saisie** et **Consultation**, vous les consultez. Archiver, désarchiver et supprimer un dossier sont réservés au client.

### Actions pas à pas

1. **Ouvrir un dossier** : cliquez sur sa carte ; sa fiche s'ouvre (voir la fiche **Fiche du dossier** de ce manuel).
2. **Quitter cet accès** : cliquez sur **Quitter cet accès**, puis confirmez. La comptabilité disparaît de votre accueil et le client en est prévenu.

### Points d'attention

:::attention
Une comptabilité confiée suit l'abonnement de son client : si cet abonnement est suspendu, la page l'indique et la comptabilité n'est plus modifiable.
:::

:::astuce
Seul le client peut vous redonner un accès que vous avez quitté.
:::$f209b$, 'compta-confiee', 'fb3299a7d9a6eb72b6098bcf6b6a57da'),
($f209c$## 🗂️ Fiche du dossier

Cette page présente un dossier : son identité, son régime fiscal, son exercice en cours et les personnes qui y ont accès. Vous l'ouvrez depuis la page **Dossiers** (cabinet), **Cabinet** (collaborateur d'un cabinet), **Ma comptabilité** (client LabFlow) ou **Comptabilité de …** (comptable d'un client).

### Ce que vous voyez

- **Identité** : raison sociale, nom commercial, forme juridique, matricule fiscal, RNE, adresse, représentant légal. **Modifier** ouvre le formulaire, lecture de la patente comprise. Le dossier **« Mon entreprise »** d'un client LabFlow porte la mention **LabFlow** : son identité a été copiée de son compte LabFlow le jour de sa création.
- **Régime fiscal** : personne, impôt, TVA, exportateur total, télédéclaration, début d'activité. **Modifier** le change.
- **Exercice en cours** : ses dates et ses périodes mensuelles, toutes ouvertes pour l'instant. **Modifier** change ses dates tant qu'aucune écriture n'est enregistrée ; les périodes sont refaites.
- **Accès** : les personnes qui voient ce dossier (titulaire et gérants), avec leur niveau.

### Actions pas à pas

1. **Archiver** (titulaire) : le dossier sort de la liste courante ; rien n'est effacé. **Désarchiver** le remet dans la liste.
2. **Supprimer** (titulaire) : possible seulement pour un dossier sans écriture ; une confirmation est demandée. Le journal de la comptabilité garde la trace de la suppression.
3. **Reprendre l'identité de LabFlow** (dossier « Mon entreprise » d'un client LabFlow) : recopie dans le dossier les champs que le compte LabFlow connaît (un champ vide dans LabFlow n'efface rien) ; utile après une correction dans LabFlow, page **Mon entreprise**. Dans l'autre sens, rien ne change : modifier le dossier ne touche pas au compte LabFlow. Ce dossier ne se supprime pas : il s'archive.

### Points d'attention

:::attention
Un dossier qui a des écritures ne se supprime jamais : il s'archive. Un dossier archivé ne se modifie pas tant qu'il n'est pas désarchivé.
:::

:::attention
Quand l'abonnement de la comptabilité attend un paiement, les dossiers restent consultables mais ne se modifient plus.
:::$f209c$, 'compta-dossier', 'ba7a6ecd18b7f210ca3d9a535ee0ab4e')
  ) AS f(texte, slug, garde)
 WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'
   AND md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde;
