-- 224 — Factures fournisseur, étape F2 : fiche fournisseur avec identité légale (matricule fiscal contrôlé et unique, raison sociale, email, ville, lecture de la patente), import Excel à six colonnes, suppression refusée pour un fournisseur cité ; saisie des appros : la facture déposée est lue (fournisseur reconnu par son matricule, numéro, date, totaux, timbre 1 / 1,5 / 2 DT).
-- Généré par scripts/manuel/generer-maintenance.mjs depuis scripts/manuel/revisions.json — ne pas éditer à la main.
--
-- Migration de maintenance du manuel balisé (modèle de la 194, scripts/VOCAB-GUIDE-SERVEUR.md §9). Fiche : texte balisé
-- entier, gardé par le md5 (sans \r) du texte précédent ; contenu remplacé seulement s'il égale encore contenu_defaut
-- (une fiche retouchée dans l'admin garde sa retouche) ; titre gardé par égalité exacte ; updated_at, mots_cles et icone
-- ne sont pas écrits. Base de connaissances : clé lower(titre), garde = md5 du contenu. Variantes : seuls les brouillons
-- jamais retouchés sont mis à jour (et base_md5 avec eux) ; une variante validée ou retouchée passe « à revoir ».
-- Idempotente : au 2e passage, tout est « déjà fait ».
--
-- inventaire : {"fiches":["fournisseurs","stock-activites","stock-labo"],"titres":[],"entrees":[],"variantes":[]}

DO $m224$
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
  -- ── fournisseurs ──
  t := $m224_fournisseurs$## 🚚 [[Nom:fournisseur:pl]]

Un seul écran gère [[votre:fournisseur:pl]] : **[[Nom:fournisseur:pl]]** (menu latéral 🚚) — le répertoire général du compte et ses affectations [[au:activite:pl]] **et [[au:labo:pl]]**.

### Ce que vous voyez

Le bandeau affiche le nombre total [[de:fournisseur:pl]]. La barre de filtres permet une recherche par nom, matricule fiscal, téléphone ou ville, et porte les boutons **📥 Ajout Dynamique** et **+ [[Nouveau:fournisseur]]**. Le tableau principal présente :

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
- [Historique des mouvements](#historique) · [[[Nom:transfert:pl]]](#transferts)$m224_fournisseurs$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'fournisseurs'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'e36e008ec18d2c4d351cc66340276127';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'fournisseurs'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'fournisseurs'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'fournisseurs' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'fournisseurs'::TEXT; END IF;
  -- ── stock-activites ──
  t := $m224_stock_activites$## 📦 [[Nom:stock]] [[Court:activite:pl]]

L'écran **[[Nom:stock]] [[Court:activite:pl]]** (menu **[[Nom:espace_activites]] → [[Nom:stock]] [[Court:activite:pl]]**) est le poste central de chaque [[nom:activite_desc]] : quantités disponibles, saisie [[du:appro:pl]], seuils d'alerte et déclaration [[du:perte:pl]]. [[Le:stock]] se consulte **[[nom:activite]] par [[nom:activite]]** : sélectionnez [[le:activite_desc]] grâce aux pastilles 🏪 en haut de l'écran — il n'existe pas de vue globale « [[acc:activite:Tous:Toutes]] ». [[Un:gerant]] ne voit que [[le:activite:pl]] qui lui sont [[acc:activite:affecté:affectée:pl]].

### Ce que vous voyez

Une barre de filtres cible les lignes affichées : **Catégorie**, **[[Nom:article]]** ([[acc:article:débloqué:débloquée]] après le choix d'une catégorie), **Nom** (recherche libre), **[[Nom:fournisseur]]** et **Réf. Facture**, avec un bouton **Réinitialiser**.

Le bloc bleu **[[Nom:appro]]** regroupe les informations communes à la saisie : **Date [[de:appro:court]]** (obligatoire, entre le 1er janvier de l'année en cours et aujourd'hui), **[[Nom:fournisseur]]**, **Réf Facture** (obligatoire), puis le bouton **Enregistrer (N)** — N compte les lignes prêtes. Sous ces champs, la zone **📎 Facture [[du:fournisseur]]** reçoit la vraie facture : PDF, scan ou photo (y compris la photo HEIC d'un iPhone), jusqu'à 5 fichiers de 15 Mo — facultatif.

[[Le:article:pl]] sont [[acc:article:groupé:groupée:pl]] par **catégories repliables** (cliquez sur l'en-tête pour ouvrir). [[Le:pt:pl]] apparaissent dans leurs propres catégories : **[[Nom:cat_pt_utilisable]]**, **[[Nom:cat_pt_vendable]]** et **[[Nom:cat_pt_valorise]]** (voir [le lexique [[du:pt:pl:court]]](#lexique-pt)).

| Colonne | Contenu |
|---|---|
| [[Nom:article]] | nom, unité, lien 📋 Historique, date et quantité [[acc:inventaire:du dernier:de la dernière]] [[nom:inventaire]] 📦 |
| [[Nom:stock]] [[acc:stock:Actuel:Actuelle]] | quantité disponible + détail : ↑ [[court:appro]], ⇄ transf, ↘ [[court:perte:pl]], [[Court:pt]] (consommé par vos productions), 💰 [[MAJ:vente]] |
| Coût Total | valeur [[du:stock]] en TTC (le montant HT s'affiche en dessous) |
| Quantité | saisie de la nouvelle quantité approvisionnée |
| Prix | prix d'achat HT unitaire (calculé automatiquement pour [[un:pt]]) |
| TVA (%) | taux de TVA, optionnel |
| Actions | 🔧 Seuil, 📉 [[Court:perte]], ⚙️ Personnaliser ([[nom:pt:pl]]) |

La couleur [[du:stock]] reflète le **seuil minimum** : 🔴 [[nom:stock]] [[acc:stock:inférieur:inférieure]] ou [[acc:stock:égal:égale]] au seuil, 🟠 juste au-dessus (jusqu'à seuil + 10 %), 🟢 au-delà.

:::formule [[Nom:stock]] [[acc:stock:actuel:actuelle]]
[[Nom:stock]] = [[Nom:appro:pl]] + [[Nom:transfert:pl]] [[acc:transfert:entrant:entrante:pl]] − Consommations ([[nom:vente:pl]], productions) − [[Nom:perte:pl]] ± Ajustements [[de:inventaire]]
:::

### Actions pas à pas

Enregistrer [[un:appro]] :

1. Sélectionnez [[le:activite]], puis renseignez le bloc [[Nom:appro]] : date, [[nom:fournisseur]] et n° de facture.
2. Facultatif : glissez dans la zone **📎 Facture [[du:fournisseur]]** le PDF, le scan ou la photo de la facture reçue (sur un téléphone, touchez la zone pour prendre la photo). Une vignette s'affiche ; la croix ✕ retire un fichier avant l'envoi. LabFlow lit aussitôt la facture et remplit les champs vides du bloc (voir « La facture lue »).
3. Ouvrez les catégories concernées et saisissez, ligne par ligne, la **quantité** et le **prix HT** unitaire (et le taux de TVA si vous le connaissez).
4. Contrôlez l'**Aperçu saisie** flottant en bas à droite : il cumule les lignes et le total TTC.
5. Cliquez sur **Enregistrer (N)** : une fenêtre récapitulative façon facture s'ouvre (lignes, Total HT, Total TTC, case **Timbre Fiscal** cochée par défaut, de 1,000 DT — 1,500 ou 2,000 DT pour une facture de grande surface —, le nombre de fichiers joints et, si la facture a été lue, la comparaison avec son total). Confirmez : toutes les lignes et la facture jointe s'enregistrent ensemble — si l'une est refusée, rien n'est enregistré et le message dit pourquoi.
6. Si une facture portant **le même numéro** existe déjà chez [[ce:fournisseur]], LabFlow l'affiche (date, lieu, montant) : vérifiez que vous ne la saisissez pas deux fois avant de choisir **Enregistrer quand même**.
7. Si [[un:appro:court]] existe déjà à cette date pour [[un:article]], une confirmation supplémentaire affiche le cumul avant validation.

Produire [[un:pt]] : saisissez la quantité sur sa ligne — l'indication **Max** montre le maximum réalisable avec [[le:stock]] [[de:ingredient:pl]], et le prix se calcule automatiquement depuis [[le:recette]] ([production [[de:pt:pl:court]]](#calc-production-pt)). Le bouton **⚙️ Personnaliser** permet d'ajuster les quantités [[de:ingredient:pl]] réellement consommées.

Configurer un seuil : bouton **🔧 Seuil**, saisissez la valeur minimale (laisser vide pour désactiver), puis Enregistrer. Le seuil d'[[un:pt]] se règle aussi [[nom:activite]] par [[nom:activite]].

### La facture lue

Dès qu'une facture est déposée dans la zone **📎 Facture [[du:fournisseur]]**, LabFlow la **lit** : le panneau **🔎 Lu sur la facture** apparaît sous la zone. La lecture se fait sur cet appareil — rien n'est envoyé ailleurs — en quelques secondes pour un PDF, un peu plus pour un scan ou une photo. Elle donne :

- **[[Nom:fournisseur]]** : [[acc:fournisseur:reconnu:reconnue]] par son **matricule fiscal** (✓, [[acc:fournisseur:choisi:choisie]] d'office dans le bloc) ; à défaut, [[un:fournisseur]] au nom voisin est [[acc:fournisseur:proposé:proposée]] (**Oui, c'est [[acc:fournisseur:lui:elle]]** lui ajoute le matricule lu) ; si [[aucun:fournisseur]] ne correspond, **Créer [[le:fournisseur]]…** ouvre une fiche pré-remplie d'après la facture, à relire avant de la créer — ou à rattacher à [[un:fournisseur]] déjà [[acc:fournisseur:enregistré:enregistrée]] sous un autre nom ;
- le **n° de facture** et la **date**, recopiés dans les champs vides — une valeur saisie à la main n'est jamais remplacée ;
- les **totaux** (HT, TVA, timbre, TTC) : la fenêtre récapitulative compare le total de votre saisie au TTC lu et règle le timbre (1, 1,5 ou 2 DT).

Chaque champ rempli porte la pastille **lu — à relire** jusqu'à ce que vous le modifiiez. Rien n'est enregistré avant **Enregistrer**. Une facture écrite à la main, ou une photo trop floue, ne se lit pas : saisissez alors l'en-tête vous-même — la facture est jointe quand même.

### Points d'attention

:::attention
[[Un:pt]] [[acc:pt:fabriqué:fabriquée]] [[det:labo:au]]**[[nom:labo]]** porte le badge **⇄ [[Court:transfert]] uniquement** : sa quantité ne se saisit pas ici, [[acc:pt:il:elle]] n'entre en [[nom:stock]] [[de:activite]] que par [[[nom:transfert]]](#transferts). Par ailleurs, une même validation ne peut pas mélanger production [[de:pt:pl:court]] et [[court:appro]] [[de:article:pl]] : dès qu'une quantité [[de:pt:court]] est saisie, les champs [[Nom:fournisseur]] et Réf Facture se désactivent — enregistrez les deux séparément. Enfin, si le champ [[Nom:fournisseur]] affiche « ⚠ [[Aucun:fournisseur]] », créez d'abord [[det:fournisseur:votre:pl]][[[nom:fournisseur:pl]]](#fournisseurs) : le n° de facture est toujours exigé, et le choix d'[[un:fournisseur]] devient obligatoire dès qu'au moins [[un:fournisseur]] existe.
:::

:::formule Prix TTC
TTC = HT × ( 1 + TVA ÷ 100 )
note: [[Un:article]] [[acc:article:acheté:achetée]] 10 DT HT avec 19 % de TVA revient à 11,900 DT TTC.
:::

:::astuce
La facture jointe se retrouve sur l'écran [Factures [[de:appro:court]]](#factures) : **📎 Voir la facture** l'ouvre. Une facture oubliée se joint plus tard, depuis le même écran, avec **📎 Joindre la facture**.
:::

:::astuce
Le lien **📋 Historique** sous chaque [[nom:article]] affiche ses derniers mouvements (date, type, quantité, prix HT et TTC, [[nom:fournisseur]], réf. facture) sans quitter l'écran, avec un bouton vers l'historique complet.
:::

### Voir aussi

- [Valeur [[du:stock]]](#calc-valeur-stock) — comment [[le:stock]] [[acc:stock:actuel:actuelle]] est [[acc:stock:calculé:calculée]]
- [HT et TTC](#calc-ht-ttc) · [Seuils d'alerte](#calc-seuils)
- [[[Nom:perte:pl]]](#pertes) · [Historiques](#historique) · [[[Nom:transfert:pl]]](#transferts) · [Factures [[de:appro:court]]](#factures)$m224_stock_activites$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'stock-activites'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '6a2b8b7a412132629a5d2209420f10b1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'stock-activites'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'stock-activites'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'stock-activites' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'stock-activites'::TEXT; END IF;
  -- ── stock-labo ──
  t := $m224_stock_labo$## 🏭 [[Nom:stock]] [[Court:labo]]

Cet écran gère [[le:stock]] de [[votre:labo_long]][[acc:labo_long: central:]] : [[le:article:pl]] que vous y achetez et [[det:pt:le:pl]][[avecCourt:pt:pl]] que vous y fabriquez. Vous y accédez depuis [[le:espace_labo]] ; si vous possédez plusieurs [[nom:labo:pl]], une rangée de pastilles en haut de page permet de passer de [[acc:labo:l'un:l'une]] à l'autre — le menu latéral suit alors [[le:labo]] [[acc:labo:affiché:affichée]].

### Ce que vous voyez

Un bandeau rappelle le nom [[du:labo]] et propose le bouton **↗ Transfert** vers l'écran d'envoi [[au:activite:pl]] et [[au:labo:pl]] rattachés. En dessous : une barre de filtres (Catégorie, [[Nom:article]], Nom, [[Nom:fournisseur]], Réf. Facture), puis le bloc **[[Nom:appro]]** avec la Date [[de:appro:court]], [[le:fournisseur:Nom]], la Réf Facture et les boutons **Enregistrer** (le nombre de lignes prêtes s'affiche entre parenthèses) et **Réinitialiser**. Sous ces champs, la zone **📎 Facture [[du:fournisseur]]** reçoit la vraie facture : PDF, scan ou photo (y compris la photo HEIC d'un iPhone), jusqu'à 5 fichiers de 15 Mo — facultatif.

[[Le:stock]] est [[acc:stock:présenté:présentée]] par catégories repliables :

| Colonne | Contenu |
|---|---|
| [[Nom:article]] | nom, unité, badge **[[Court:pt]]** (et « ◆ Composé valorisé » pour les composés fabriqués [[au:labo]]), bouton 📋 Historique — les 5 derniers mouvements avec leur type : [[acc:appro:Manuel:Manuelle]], [[Court:transfert]] (↗ [[acc:transfert:envoyé:envoyée]] ou ↙ [[acc:transfert:reçu:reçue]] [[du:labo]] qui vous alimente), [[Court:pt]], [[Court:perte]]… |
| [[Nom:stock]] [[acc:stock:Actuel:Actuelle]] | quantité restante et sa ventilation depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]] : ↑ [[court:appro]] (achats et réceptions d'[[un:labo]] source), ⇄ [[nom:transfert:pl]], ↘ [[court:perte:pl]], consommation [[court:pt]] |
| Coût Total | valeur [[du:stock]] en DT (TTC, avec rappel du HT) |
| Quantité · Prix · TVA (%) | saisie d'[[acc:appro:un:une]] [[nouveau:appro:court]] — le prix d'[[un:pt:court]] est calculé automatiquement, il ne se saisit pas |
| Actions | 🔧 Seuil, 📉 [[Court:perte]], ⚙️ Personnaliser ([[court:pt:pl]] uniquement) |

Un panneau « Aperçu saisie » totalise en direct, en TTC, ce que vous êtes en train d'enregistrer.

### Actions pas à pas

Approvisionner [[un:article:pl]] :

1. Renseignez la date, [[le:fournisseur]] et le n° de facture dans le bloc [[Nom:appro]].
2. Facultatif : glissez dans la zone **📎 Facture [[du:fournisseur]]** le PDF, le scan ou la photo de la facture reçue (sur un téléphone, touchez la zone pour prendre la photo). Une vignette s'affiche ; la croix ✕ retire un fichier avant l'envoi. LabFlow lit aussitôt la facture et remplit les champs vides du bloc (voir « La facture lue »).
3. Saisissez quantité et prix HT (TVA facultative) sur chaque ligne concernée.
4. Cliquez sur **Enregistrer** : une fenêtre récapitule la facture, avec une case **Timbre Fiscal** (cochée par défaut, 1,000 DT — 1,500 ou 2,000 DT pour une facture de grande surface), le nombre de fichiers joints et, si la facture a été lue, la comparaison avec son total ; confirmez. Toutes les lignes et la facture jointe s'enregistrent ensemble ; une facture du même numéro déjà saisie chez [[ce:fournisseur]] est signalée avant l'enregistrement.

Produire [[un:pt:court]] ([[nom:labo:pl]] de production uniquement — [[un:labo]] [[acc:labo:configuré:configurée]] sans production, tel un économat, n'affiche pas [[de:pt:pl:court]]) :

1. Saisissez la **quantité produite** sur la ligne [[du:pt:court]] — aucun prix à saisir, son coût est calculé d'après les prix [[du:article:pl]] [[du:labo]].
2. Enregistrez : [[le:ingredient:pl]] [[du:recette]] **et les sous-PT** qu'[[acc:recette:il:elle]] contient sont déduits automatiquement [[du:stock]] [[du:labo]].
3. Au besoin, le bouton **⚙️ Personnaliser** permet d'ajuster [[le:portion:pl]] réellement [[acc:portion:utilisé:utilisée:pl]] pour cette production.

Déclarer [[un:perte]] : bouton **📉 [[Court:perte]]**, puis quantité, type (selon votre domaine : Avarie ou Déchet par défaut) et date ; la fenêtre affiche [[le:stock]] disponible, le prix unitaire retenu et le coût total [[du:perte]].

Définir un seuil : bouton **🔧 Seuil**. [[Le:stock]] s'affiche ensuite en 🔴 (au seuil ou en dessous), 🟠 (jusqu'à seuil + 10 %) ou 🟢 (au-dessus).

### La facture lue

Dès qu'une facture est déposée dans la zone **📎 Facture [[du:fournisseur]]**, LabFlow la **lit** : le panneau **🔎 Lu sur la facture** apparaît sous la zone. La lecture se fait sur cet appareil — rien n'est envoyé ailleurs — en quelques secondes pour un PDF, un peu plus pour un scan ou une photo. Elle donne :

- **[[Nom:fournisseur]]** : [[acc:fournisseur:reconnu:reconnue]] par son **matricule fiscal** (✓, [[acc:fournisseur:choisi:choisie]] d'office dans le bloc) ; à défaut, [[un:fournisseur]] au nom voisin est [[acc:fournisseur:proposé:proposée]] (**Oui, c'est [[acc:fournisseur:lui:elle]]** lui ajoute le matricule lu) ; si [[aucun:fournisseur]] ne correspond, **Créer [[le:fournisseur]]…** ouvre une fiche pré-remplie d'après la facture, à relire avant de la créer — ou à rattacher à [[un:fournisseur]] déjà [[acc:fournisseur:enregistré:enregistrée]] sous un autre nom ;
- le **n° de facture** et la **date**, recopiés dans les champs vides — une valeur saisie à la main n'est jamais remplacée ;
- les **totaux** (HT, TVA, timbre, TTC) : la fenêtre récapitulative compare le total de votre saisie au TTC lu et règle le timbre (1, 1,5 ou 2 DT).

Chaque champ rempli porte la pastille **lu — à relire** jusqu'à ce que vous le modifiiez. Rien n'est enregistré avant **Enregistrer**. Une facture écrite à la main, ou une photo trop floue, ne se lit pas : saisissez alors l'en-tête vous-même — la facture est jointe quand même.

### Points d'attention

:::astuce
La facture jointe se retrouve sur l'écran [Factures [[de:appro:court]]](#factures) : **📎 Voir la facture** l'ouvre. Une facture oubliée se joint plus tard, depuis le même écran, avec **📎 Joindre la facture**.
:::

:::attention
On ne mélange pas [[court:appro]] [[de:article:pl]] et production [[de:pt:pl:court]] dans un même enregistrement : dès qu'une quantité est saisie sur [[un:pt:court]], les champs [[Nom:fournisseur]] et Réf Facture se grisent (et inversement). Procédez en deux enregistrements séparés.
:::

:::attention
[[Un:perte]] ne peut pas dépasser [[le:stock]] disponible, ni porter une date antérieure [[acc:appro:au premier:à la première]] [[nom:appro]] [[du:article]].
:::

:::astuce
Si la date choisie correspond déjà à [[un:appro:court]] [[acc:appro:existant:existante]] pour [[un:article]], ses champs de saisie s'entourent d'orange : consultez l'historique 📋 avant d'enregistrer, car les quantités s'additionnent.
:::

L'affectation [[du:article:pl]] [[au:activite:pl]] (cases à cocher) se gère depuis la fiche [[du:article]] ([[[Nom:article:pl]]](#referentiel-articles)) ; elle est réservée au propriétaire du compte.

### Voir aussi

- [[[Le:pt:pl]]](#lexique-pt) · [Le calcul d'une production](#calc-production-pt)
- [Les seuils d'alerte](#calc-seuils) · [La valeur [[du:stock]]](#calc-valeur-stock)
- [[[Nom:transfert:pl]] vers [[le:activite:pl]] et [[nom:labo:pl]] rattachés](#transferts) · [Factures [[de:appro:court]]](#factures) · [[[Nom:perte:pl]]](#pertes)$m224_stock_labo$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'stock-labo'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'b1d9d793dc669a8b2903981cedec3da3';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'stock-labo'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'stock-labo'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'stock-labo' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'stock-labo'::TEXT; END IF;
  RAISE NOTICE '224 : % fiche(s) réécrite(s), % déjà faite(s), % gardée(s) : % ; titres gardés : % ; retouchées dans l''admin (texte servi inchangé, à corriger dans l''admin) : % ; base : % réécrite(s), % déjà faite(s), gardée(s) : % ; variantes (brouillons) : % mise(s) à jour, % déjà faite(s), non touchée(s) (validée, retouchée ou absente : à revoir dans l''admin) : %',
    faites, deja, cardinality(gardees),
    COALESCE(NULLIF(array_to_string(gardees, ', '), ''), 'aucune'),
    COALESCE(NULLIF(array_to_string(titres_gardes, ', '), ''), 'aucun'),
    COALESCE(NULLIF(array_to_string(retouchees, ', '), ''), 'aucune'),
    b_faites, b_deja,
    COALESCE(NULLIF(array_to_string(b_gardees, ', '), ''), 'aucune'),
    v_faites, v_deja,
    COALESCE(NULLIF(array_to_string(v_gardees, ', '), ''), 'aucune');
END
$m224$;
