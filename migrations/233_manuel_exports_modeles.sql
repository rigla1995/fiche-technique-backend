-- 233 — Exports « dans le modèle » : Articles (référentiel) et Fournisseurs exportés au format du modèle d'import, réimportables tels quels par l'Ajout dynamique ; Correspondances exportées en Excel (consultation).
-- Généré par scripts/manuel/generer-maintenance.mjs depuis scripts/manuel/revisions.json — ne pas éditer à la main.
--
-- Migration de maintenance du manuel balisé (modèle de la 194, scripts/VOCAB-GUIDE-SERVEUR.md §9). Fiche : texte balisé
-- entier, gardé par le md5 (sans \r) du texte précédent ; contenu remplacé seulement s'il égale encore contenu_defaut
-- (une fiche retouchée dans l'admin garde sa retouche) ; titre gardé par égalité exacte ; updated_at, mots_cles et icone
-- ne sont pas écrits. Base de connaissances : clé lower(titre), garde = md5 du contenu. Variantes : seuls les brouillons
-- jamais retouchés sont mis à jour (et base_md5 avec eux) ; une variante validée ou retouchée passe « à revoir ».
-- Idempotente : au 2e passage, tout est « déjà fait ».
--
-- inventaire : {"fiches":["referentiel-articles","referentiel-import","fournisseurs"],"titres":[],"entrees":[],"variantes":[]}

DO $m233$
DECLARE
  t TEXT;
  n INTEGER;
  faites INTEGER := 0;
  deja INTEGER := 0;
  gardees TEXT[] := ARRAY[]::TEXT[];
  titres_gardes TEXT[] := ARRAY[]::TEXT[];
  retouchees TEXT[] := ARRAY[]::TEXT[];
  b_faites INTEGER := 0;
  b_deja INTEGER := 0;
  b_gardees TEXT[] := ARRAY[]::TEXT[];
  v_faites INTEGER := 0;
  v_deja INTEGER := 0;
  v_gardees TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- ── referentiel-articles ──
  t := $m233_referentiel_articles$## 🧂 [[Nom:article:pl]]

[[Le:article:pl]] sont vos matières premières et [[nom:ingredient:pl]] : c'est le cœur [[du:referentiel]], utilisé pour [[le:stock]], [[le:appro:pl]] et [[le:fiche_technique:pl]]. Vous les gérez depuis le menu **[[Nom:referentiel]] → [[Nom:article:pl]]**.

### Ce que vous voyez

- Un bandeau d'en-tête avec le **nombre total [[de:article:pl]]**.
- Une barre de filtres : champ **Recherche**, liste **Famille**, liste **Catégorie** (elle se limite aux catégories de la famille choisie), compteur de résultats (ex. « 12 [[nom:article:pl]] sur 87 » quand un filtre est actif) et bouton **Réinitialiser**.
- Deux boutons d'action : **+ Ajout multiple** et **+ [[Nouveau:article]]**, et le bouton **Exporter (modèle Excel)** : tout [[votre:referentiel]], unités, catégories et familles comprises, dans le fichier du modèle d'import — les filtres ne s'y appliquent pas.
- Une liste **groupée par famille puis par catégorie** : chaque famille forme une carte avec son nombre de catégories ; chaque catégorie se déplie d'un clic sur la flèche ▶ et affiche son nombre [[de:article:pl]] ([[le:article:pl]] non [[acc:article:classé:classée:pl]] apparaissent sous « Sans catégorie »). Chaque ligne [[de:article]] affiche son nom, un badge avec son **unité**, et les boutons **✏️ Modifier** et corbeille 🗑️.

### Actions pas à pas

Créer [[un:article]] (assistant en deux étapes) :

1. Cliquez sur **+ [[Nouveau:article]]**.
2. Étape **Informations** : saisissez le **nom**, choisissez l'**unité** et la **catégorie** (présentée sous la forme Famille › Catégorie). Si aucune catégorie n'existe, un message vous invite à en créer d'abord dans [[le:referentiel]]. Cliquez sur **Suivant →**.
3. Étape **Affectation** : cochez [[le:activite:pl]] 📍 et/ou [[nom:labo:pl]] 🏭 où [[le:article]] sera [[acc:article:utilisé:utilisée]] — **au moins un est requis**. Le bouton **Tout sélectionner** coche tout d'un coup et un compteur suit votre sélection.
4. Cliquez sur **Créer [[le:article]]**. Le bouton **← Retour** permet de revenir à l'étape 1.

Créer plusieurs [[nom:article:pl]] d'un coup :

1. Cliquez sur **+ Ajout multiple**.
2. Remplissez chaque ligne : **Nom**, **Unité**, **Catégorie**, puis cliquez sur **+ Affecter** pour cocher [[le:activite:pl]] 📍 et [[nom:labo:pl]] 🏭 de la ligne (le bouton affiche ensuite le nombre d'affectations).
3. Ajoutez des lignes avec **+ Ajouter une ligne**, puis cliquez sur **Créer**. Chaque ligne doit être complète (affectation comprise) pour valider.

Modifier [[un:article]] et ses affectations :

1. Cliquez sur **✏️ Modifier** : ajustez le nom, l'unité, la catégorie (ou « Sans catégorie »), puis **Enregistrer**.
2. Dans la section **Affectations** de la même fenêtre, cliquez sur [[un:activite]] ou [[un:labo]] pour l'ajouter ou [[acc:labo:le:la]] retirer : chaque clic est **enregistré immédiatement**, sans passer par Enregistrer.

Supprimer [[un:article]] :

1. Cliquez sur la corbeille 🗑️ puis confirmez avec **Supprimer**. [[Le:stock:pl]] et historiques liés sont conservés.

### Points d'attention

:::attention
La corbeille est **grisée** si [[le:article]] a [[un:appro:pl]] [[acc:appro:enregistré:enregistrée:pl]] : la suppression est bloquée.
:::

:::attention
[[Un:article]] non [[acc:article:affecté:affectée]] à [[un:activite]] ou [[un:labo]] n'y apparaît ni en [[nom:stock]], ni en [[nom:appro]], ni dans [[le:fiche_technique:pl]]. L'affectation est la clé qui rend [[le:article]] utilisable sur le terrain.
:::

:::astuce
Pour un gros volume [[de:article:pl]], préférez l'[Ajout dynamique](#referentiel-import) par fichier Excel, puis affinez les affectations depuis la fiche de chaque [[nom:article]]. Le fichier exporté se réimporte tel quel par l'Ajout dynamique, par exemple dans un autre compte.
:::

### Voir aussi

- [Unités](#referentiel-unites) et [Catégories](#referentiel-categories) — à préparer avant de créer [[votre:article:pl]]
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites) et [[[Nom:fiche_technique:pl]]](#fiches-techniques) — où [[votre:article:pl]] sont [[acc:article:utilisé:utilisée:pl]]$m233_referentiel_articles$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'referentiel-articles'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'd48fbbcca81c0548e771737c071ff81c';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-articles'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'referentiel-articles'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-articles' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'referentiel-articles'::TEXT; END IF;
  -- ── referentiel-import ──
  t := $m233_referentiel_import$## 📥 Ajout dynamique (import Excel)

L'Ajout Dynamique permet d'importer en masse [[votre:article:pl]] — et en même temps leurs unités, catégories et familles — depuis un fichier Excel. Vous y accédez depuis le menu **[[Nom:referentiel]] → Ajout Dynamique**. C'est le moyen le plus rapide de constituer [[votre:referentiel]] au démarrage.

### Ce que vous voyez

L'écran se présente en étapes numérotées :

- **1️⃣ Téléchargez le modèle** : bouton **📄 Télécharger modele_referentiel.xlsx**, un fichier Excel avec les colonnes **[[Nom:article]] / Unité / Catégorie / Famille**.
- **2️⃣ Uploadez votre fichier rempli** : une zone où **glisser-déposer** le fichier (ou cliquer pour le sélectionner), avec une limite de **1 000 lignes par fichier**. Une fois le fichier choisi, son nom et sa taille s'affichent, avec les boutons **Changer de fichier** et **🚀 Lancer l'import**.
- **Le bilan d'import** : un récapitulatif « Import terminé » avec le nombre de lignes traitées, des compteurs par type (**[[Nom:article:pl]]**, **Auto-[[acc:article:affecté:affectée:pl]]**, **Catégories**, **Familles**, **Unités**, **Erreurs**) et un tableau détaillé ligne par ligne : **Ligne / [[Nom:article]] / Créé / Existant / Affectation / Statut**.

### Actions pas à pas

1. Cliquez sur **📄 Télécharger modele_referentiel.xlsx** et ouvrez le fichier dans Excel.
2. Remplissez **une ligne par [[nom:article]]** : nom [[du:article]], unité, catégorie et famille. Les unités, catégories et familles qui n'existent pas encore dans [[votre:referentiel]] seront **créées automatiquement**.
3. Glissez le fichier rempli dans la zone d'import (format Excel .xlsx) puis cliquez sur **🚀 Lancer l'import**.
4. Lisez le bilan : la colonne **Créé** liste les éléments ajoutés par la ligne, la colonne **Existant** ceux qui ont été reconnus et réutilisés. Les lignes en erreur sont surlignées ; survolez le symbole ❌ pour lire la cause exacte.
5. Corrigez si besoin les lignes en erreur dans votre fichier, puis cliquez sur **Importer un autre fichier** pour relancer.

[[Le:article:pl]] [[acc:article:importé:importée:pl]] sont **automatiquement [[acc:article:affecté:affectée:pl]]** à [[votre:activite:pl]] et [[nom:labo:pl]] : [[acc:article:il:elle:pl]] sont immédiatement utilisables en [[nom:stock]] et en [[nom:appro]]. Si [[un:article]] existait déjà mais n'était [[acc:article:affecté:affectée]] nulle part, [[acc:article:il:elle]] est [[acc:article:assigné:assignée]] automatiquement et [[acc:article:signalé:signalée]] par le badge **🔗 auto** dans la colonne Affectation.

### Points d'attention

:::attention
Respectez l'orthographe des unités, familles et catégories déjà présentes dans [[votre:referentiel]] : toute variante d'écriture (accent, pluriel…) peut créer un doublon. Seules les différences de majuscules/minuscules et les espaces en début ou fin de nom sont tolérées pour [[le:article:pl]], unités et familles.
:::

:::attention
Le fichier doit être au format Excel (.xlsx) et ne pas dépasser **1 000 lignes**. Au-delà, découpez votre catalogue en plusieurs fichiers.

Le fichier obtenu par **Exporter (modèle Excel)** (écran [[[Nom:article:pl]]](#referentiel-articles)) est déjà au format du modèle : il se réimporte tel quel. Ce qui manque est créé ; [[un:article]] déjà [[acc:article:présent:présente]] n'est pas [[acc:article:modifié:modifiée]] (ni son unité, ni sa catégorie).
:::

:::astuce
Après un import, ajustez finement [[acc:activite:quel:quelle:pl]] [[nom:activite:pl]] et [[acc:labo:quel:quelle:pl]] [[nom:labo:pl]] utilisent chaque [[nom:article]] depuis sa fiche ([[[Nom:article:pl]]](#referentiel-articles)).
:::

### Voir aussi

- [[[Nom:article:pl]]](#referentiel-articles) — création manuelle à l'unité ou en série
- [[[Nom:article:pl]]](#referentiel-articles) — ajuster les affectations après import
- [Unités](#referentiel-unites), [Familles](#referentiel-familles), [Catégories](#referentiel-categories)
- [Bien démarrer](#demarrage)$m233_referentiel_import$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'referentiel-import'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'd7c3c554a14c327a602e515661a0934a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-import'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'referentiel-import'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-import' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'referentiel-import'::TEXT; END IF;
  -- ── fournisseurs ──
  t := $m233_fournisseurs$## 🚚 [[Nom:fournisseur:pl]]

Un seul écran gère [[votre:fournisseur:pl]] : **[[Nom:fournisseur:pl]]** (menu latéral 🚚) — le répertoire général du compte et ses affectations [[au:activite:pl]] **et [[au:labo:pl]]**.

### Ce que vous voyez

Le bandeau affiche le nombre total [[de:fournisseur:pl]]. La barre de filtres permet une recherche par nom, matricule fiscal, téléphone ou ville, et porte les boutons **Exporter (modèle Excel)**, **📥 Ajout Dynamique** et **+ [[Nouveau:fournisseur]]**. Le tableau principal présente :

| Colonne | Contenu |
|---|---|
| Nom | Nom [[du:fournisseur]] ; dessous, sa raison sociale et son matricule fiscal s'ils sont renseignés |
| Téléphone | Numéro de téléphone (et email) |
| Adresse | Adresse et ville [[du:fournisseur]] |
| [[Pl:activite]] [[acc:activite:liés:liées]] | Pastilles [[du:activite:pl]] où [[acc:fournisseur:il:elle]] est [[acc:fournisseur:proposé:proposée]] [[au:appro:court]] |
| [[Court:labo:pl]] [[acc:labo:liés:liées]] | Pastilles 🏭 [[du:labo:pl]] où [[acc:fournisseur:il:elle]] est [[acc:fournisseur:proposé:proposée]] |
| [[Court:appro:pl]] | Nombre [[de:appro:pl]] [[acc:appro:enregistré:enregistrée:pl]], détaillé par [[nom:activite]] |
| Actions | ✏️ modifier · 🗑️ supprimer (uniquement [[acc:fournisseur:s'il:si elle]] ne figure dans [[aucun:appro:court]] ni dans aucune facture) |

Le tableau est paginé par 10. Une section à part, **🏭 [[Pl:fournisseur]] [[Court:labo]] (auto-[[acc:fournisseur:gérés:gérées]])**, liste [[le:fournisseur:pl]] [[acc:fournisseur:créé:créée:pl]] automatiquement pour chaque [[nom:labo]] — c'est sous ce nom que les livraisons [[du:labo]] apparaissent dans [[le:appro:pl:court]] de [[votre:activite:pl]]. [[acc:fournisseur:Ils:Elles]] affichent leurs [[nom:activite:pl]] [[acc:activite:lié:liée:pl]] mais ne se modifient pas ici.

### Actions pas à pas

1. **Créer [[un:fournisseur]]** : *+ [[Nouveau:fournisseur]]* → nom (obligatoire), raison sociale, **matricule fiscal**, téléphone, email, adresse, ville. Le bouton **📄 Lire la patente** lit la carte d'identification fiscale ou l'extrait du RNE [[du:fournisseur]] (PDF ou photo) et remplit les champs vides, marqués « lu » — la lecture se fait sur cet ordinateur, rien n'est envoyé. Le matricule fiscal est contrôlé (forme 1234567A/A/M/000) et n'appartient qu'à [[un:fournisseur]] du compte : c'est par lui que les factures déposées reconnaissent [[le:fournisseur]]. À la création, [[tous:activite:vos]] sont [[acc:activite:coché:cochée:pl]] par défaut : décochez [[acc:activite:ceux:celles]] qui ne travaillent pas avec [[acc:fournisseur:lui:elle]], et cochez [[le:labo:pl]] [[acc:labo:concerné:concernée:pl]].
2. **Modifier les affectations** : ✏️ sur la ligne, puis cochez/décochez [[nom:activite:pl]] et [[nom:labo:pl]] — c'est ici que vous choisissez [[le:fournisseur:pl]] [[acc:fournisseur:proposé:proposée:pl]] [[au:appro]] de chaque [[nom:labo]].
3. **Supprimer** : le bouton 🗑️ n'apparaît que si [[le:fournisseur]] ne figure dans [[aucun:appro]] — [[du:activite:pl]] comme [[du:labo:pl]] — ni dans aucune facture ; une confirmation est demandée.

### Ajout dynamique (import Excel)

Le bouton **📥 Ajout Dynamique** importe [[votre:fournisseur:pl]] en masse :

1. Téléchargez le **modèle Excel** (colonnes Nom / Téléphone / Adresse / Ville / Matricule fiscal / Email — seul le nom est obligatoire, 500 lignes maximum ; l'ancien modèle à trois colonnes reste accepté).
2. Remplissez-le, puis déposez le fichier dans la zone d'import.
3. Chaque [[nom:fournisseur]] [[acc:fournisseur:importé:importée]] est **automatiquement [[acc:fournisseur:assigné:assignée]] à l'ensemble de [[votre:activite:pl]] et [[nom:labo:pl]]** : [[acc:fournisseur:il:elle]] est immédiatement [[acc:fournisseur:proposé:proposée]] partout [[au:appro]]. Ajustez ensuite les affectations [[nom:fournisseur]] par [[nom:fournisseur]] (✏️) si nécessaire.

Le rapport d'import détaille chaque ligne : les noms déjà présents dans votre répertoire (ou en double dans le fichier), les matricules fiscaux invalides ou déjà présents sont ignorés et signalés, le reste est créé.

**Exporter (modèle Excel)** télécharge tout votre répertoire (sans les [[nom:labo:pl]] internes) dans ce même modèle : il se réimporte tel quel, par exemple dans un autre compte. [[Un:gerant]] n'exporte que [[le:fournisseur:pl]] de ses [[nom:activite:pl]] et [[nom:labo:pl]].

### Correspondances

L'écran **🔗 Correspondances** (menu latéral, ou bouton en haut de cet écran) montre ce que LabFlow a appris des factures validées, [[nom:fournisseur]] par [[nom:fournisseur]] : chaque ligne de facture mène à [[un:article]] et sa conversion (« 1 sac = 25 kg »), ou reste hors [[nom:stock]]. La colonne **Confirmée** dit sur combien de factures, la dernière fois et par qui.

La colonne **Code [[nom:fournisseur]]** montre le code que [[le:fournisseur]] imprime sur sa facture (colonne « Réf. » ou « Code », par exemple P310) : ce code reconnaît la ligne la fois suivante, même si la désignation est écrite autrement. Sans code, la ligne est reconnue par sa désignation. Un numéro d'un ou deux chiffres (n° de ligne) n'est jamais pris pour un code ; un même code avec une désignation sans rapport est seulement proposé, jamais reconnu d'office.

- **✏️ Corriger** : cherchez [[le:article]] juste (tapez quelques lettres), sa conversion, ou une nature hors [[nom:stock]]. Avant d'enregistrer, une alerte rappelle que la correction vaut pour les **prochaines** factures.
- **🗑️ Oublier** : la ligne ne sera plus reconnue, la prochaine facture la redemandera.
- **Exporter (Excel)** : toutes les correspondances dans un fichier Excel ([[nom:fournisseur]], matricule, code, désignation, unité facturée, [[nom:article]] et conversion, ou nature hors [[nom:stock]]). Ce fichier se consulte : les correspondances s'apprennent des factures, elles ne s'importent pas.

**Les factures déjà validées ne changent pas** — ni leur [[nom:stock]], ni la facture, ni l'historique. Pour en refaire une, supprimez-la depuis l'écran [Factures [[de:appro:court]]](#factures), puis déposez-la de nouveau : elle suivra la correspondance corrigée. [[Un:gerant]] voit les correspondances [[du:fournisseur:pl]] [[du:activite:pl]] et [[du:labo:pl]] qui lui sont [[acc:labo:affecté:affectée:pl]].

### Points d'attention

:::attention
[[Un:fournisseur]] n'est [[acc:fournisseur:proposé:proposée]] [[au:appro]] que [[acc:fournisseur:s'il:si elle]] est [[acc:fournisseur:affecté:affectée]] [[au:activite]] ou [[au:labo]] [[acc:labo:concerné:concernée]]. Si vous ne [[acc:fournisseur:le:la]] voyez pas dans la liste au moment d'une saisie, vérifiez ses affectations ici.
:::

:::astuce
Renseignez le matricule fiscal de [[votre:fournisseur:pl]] : chaque facture déposée à la saisie [[du:appro:court]] reconnaît alors d'office son émetteur. Sinon, la première facture lue propose d'ajouter le matricule à la fiche.
:::

:::astuce
Renseignez le téléphone : il s'affiche dans les listes et facilite les commandes. La colonne [[Court:appro:pl]] vous montre d'un coup d'œil [[acc:fournisseur:quels:quelles]] [[nom:fournisseur:pl]] sont réellement [[acc:fournisseur:actif:active:pl]].
:::

### Voir aussi

- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites) et [[[Nom:stock]] [[du:labo]]](#stock-labo) — où l'on choisit [[le:fournisseur]] [[au:appro:court]]
- [Factures [[de:appro]]](#factures)
- [Historique des mouvements](#historique) · [[[Nom:transfert:pl]]](#transferts)$m233_fournisseurs$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'fournisseurs'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '239112c79eb4a9c756d9a11169762274';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'fournisseurs'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'fournisseurs'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'fournisseurs' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'fournisseurs'::TEXT; END IF;
  RAISE NOTICE '233 : % fiche(s) réécrite(s), % déjà faite(s), % gardée(s) : % ; titres gardés : % ; retouchées dans l''admin (texte servi inchangé, à corriger dans l''admin) : % ; base : % réécrite(s), % déjà faite(s), gardée(s) : % ; variantes (brouillons) : % mise(s) à jour, % déjà faite(s), non touchée(s) (validée, retouchée ou absente : à revoir dans l''admin) : %',
    faites, deja, cardinality(gardees),
    COALESCE(NULLIF(array_to_string(gardees, ', '), ''), 'aucune'),
    COALESCE(NULLIF(array_to_string(titres_gardes, ', '), ''), 'aucun'),
    COALESCE(NULLIF(array_to_string(retouchees, ', '), ''), 'aucune'),
    b_faites, b_deja,
    COALESCE(NULLIF(array_to_string(b_gardees, ', '), ''), 'aucune'),
    v_faites, v_deja,
    COALESCE(NULLIF(array_to_string(v_gardees, ', '), ''), 'aucune');
END
$m233$;
