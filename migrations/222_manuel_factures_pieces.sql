-- 222 — Factures fournisseur, étape F1 : la vraie facture du fournisseur jointe à la saisie (zone « Facture du fournisseur »), enregistrement d'un seul coup, facture déjà saisie signalée ; écran Factures : Voir / Joindre / Remplacer / Supprimer, PDF fabriqué réservé aux transferts.
-- Généré par scripts/manuel/generer-maintenance.mjs depuis scripts/manuel/revisions.json — ne pas éditer à la main.
--
-- Migration de maintenance du manuel balisé (modèle de la 194, scripts/VOCAB-GUIDE-SERVEUR.md §9). Fiche : texte balisé
-- entier, gardé par le md5 (sans \r) du texte précédent ; contenu remplacé seulement s'il égale encore contenu_defaut
-- (une fiche retouchée dans l'admin garde sa retouche) ; titre gardé par égalité exacte ; updated_at, mots_cles et icone
-- ne sont pas écrits. Base de connaissances : clé lower(titre), garde = md5 du contenu. Variantes : seuls les brouillons
-- jamais retouchés sont mis à jour (et base_md5 avec eux) ; une variante validée ou retouchée passe « à revoir ».
-- Idempotente : au 2e passage, tout est « déjà fait ».
--
-- inventaire : {"fiches":["factures","stock-activites","stock-labo"],"titres":[],"entrees":[],"variantes":[]}

DO $m222$
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
  -- ── factures ──
  t := $m222_factures$## 🧾 Factures [[de:appro]]

Ces écrans regroupent [[votre:appro:pl]] par **facture [[nom:fournisseur]]**, pour rapprocher vos achats des documents reçus et suivre vos décaissements. Il en existe deux, jumeaux : l'un pour [[det:activite:le:pl]]**[[nom:activite:pl]]** (menu [[Nom:stock]]) et l'autre pour [[det:labo:le]]**[[nom:labo]]** ([[nom:espace_labo]]), qui présente les mêmes informations à l'échelle [[du:labo_long]].

### Ce que vous voyez

En haut, des pastilles pour choisir [[le:activite]] 🏪 (ou [[le:labo]] 🏭). Puis la barre de filtres : période **Du / Au** (l'année en cours par défaut), **[[Nom:fournisseur]]** et **Réf. Facture** (recherche partielle) — l'écran [[compl:labo]] ajoute un filtre **Destination / Origine** pour isoler les factures liées à [[un:activite]] ou à [[un:labo]] ([[nom:transfert:pl]] [[acc:transfert:émis:émise:pl]] ou [[acc:transfert:reçu:reçue:pl]]).

Chaque facture est une carte repliée : [[nom:fournisseur]], référence, date, badge **[[acc:appro:Manuel:Manuelle]]**, **↗ [[Court:transfert]] [[acc:transfert:émis:émise]] → X** (cession vers [[un:activite]] ou [[un:labo]] [[acc:labo:rattaché:rattachée]]) ou **↙ [[Court:transfert]] [[acc:transfert:reçu:reçue]] ← X** (réception depuis [[le:labo]] qui vous alimente), et les montants **Total HT** et **Total TTC** en DT. À droite, le bouton de la facture [[du:fournisseur]] : **📎 Voir la facture** (avec le nombre de fichiers s'il y en a plusieurs) quand elle est jointe, **📎 Joindre la facture** (cadre orangé) sinon ; une facture interne [[de:transfert]] garde son document **📄 PDF** fabriqué par LabFlow. Un clic sur la carte déplie le détail ligne par ligne : [[nom:article]] (avec son unité), catégorie, quantité, prix HT à l'unité, taux de TVA, prix TTC à l'unité, totaux HT et TTC — suivi d'un sous-total par facture. Les colonnes TVA n'apparaissent que si la facture en comporte.

Les boutons **Tout ouvrir / Tout fermer** déplient ou replient toutes les cartes de la page. En bas : le compteur de factures avec la pagination, le bouton **Charger plus**, et un bandeau **Total général HT / TTC** cumulant les factures chargées.

### Actions pas à pas

1. Choisissez [[le:activite]] (ou [[le:labo]]), puis la période.
2. Filtrez par [[nom:fournisseur]], ou saisissez quelques caractères de la référence pour retrouver une livraison précise.
3. Cliquez sur une carte pour vérifier les lignes (quantités, prix, TVA) face au document papier.
4. Les factures se chargent par lots : utilisez **Charger plus** en bas de liste si la période est longue.

Gérer la facture [[du:fournisseur]] :

1. Cliquez sur **📎 Voir la facture** (ou **📎 Joindre la facture**) : une fenêtre liste les fichiers joints — nom, taille, date et auteur de l'ajout.
2. **Ouvrir** affiche le fichier dans un nouvel onglet ; pour une photo HEIC, c'est sa copie lisible partout, et **Original** télécharge la photo d'origine.
3. Pour ajouter un fichier, glissez-le dans la zone **📎 Facture [[du:fournisseur]]** (5 fichiers au plus par facture), puis **Joindre**.
4. **Remplacer** dépose un nouveau fichier à la place de l'ancien ; **Supprimer** retire un fichier. Dans les deux cas, l'ancien fichier est **effacé définitivement** (une confirmation le rappelle) ; les lignes de la facture ne changent pas.

### Points d'attention

:::regle
Les factures ne se saisissent pas ici : elles sont construites automatiquement à partir de [[votre:appro:pl]]. C'est le **n° de facture saisi au moment [[du:appro:court]]** qui relie les lignes entre elles — utilisez toujours la même référence pour une même livraison.
:::

:::attention
La pièce jointe est la vraie facture [[du:fournisseur]] : LabFlow ne fabrique plus de PDF pour [[votre:appro:pl]] [[acc:appro:saisi:saisie:pl]]. Une facture dont on supprime la **dernière ligne** (écran Historique) disparaît avec ses fichiers : LabFlow demande alors une confirmation. [[Un:gerant]] ne voit et ne gère que les factures [[du:activite:pl]] et [[du:labo:pl]] qui lui sont [[acc:labo:affecté:affectée:pl]] ; un compte en lecture seule consulte les fichiers sans pouvoir en ajouter ni en supprimer.
:::

:::formule Total facture TTC
Total TTC = Σ ( quantité × prix HT × ( 1 + TVA ÷ 100 ) )
note: Calculé ligne par ligne, selon le taux de TVA propre à chaque [[nom:article]].
:::

:::astuce
Les badges « ↗ [[Court:transfert]] [[acc:transfert:émis:émise]] » et « ↙ [[Court:transfert]] [[acc:transfert:reçu:reçue]] » signalent une facture interne issue d'[[un:transfert]] : côté destination ([[nom:activite]] ou [[nom:labo]]), [[le:fournisseur]] [[acc:fournisseur:affiché:affichée]] est alors [[det:labo:le]]**[[nom:labo]] source [[acc:labo:lui-même:elle-même]]**. Le filtre [[Nom:fournisseur]] de l'écran [[compl:activite:pl]] ne liste, lui, que [[votre:fournisseur:pl]] externes.
:::

### Voir aussi

- [HT et TTC dans LabFlow](#calc-ht-ttc) · [[[Nom:fournisseur:pl]]](#fournisseurs)
- [[[Nom:transfert:pl]] [[nom:labo]] → [[nom:activite:pl]]](#transferts) · [Historique [[du:appro:pl]]](#historique)
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites) · [[[Nom:stock]] [[Court:labo]]](#stock-labo)$m222_factures$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'factures'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'da374cdb135cc62811f1dc616e52bd53';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'factures'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'factures'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'factures' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'factures'::TEXT; END IF;
  -- ── stock-activites ──
  t := $m222_stock_activites$## 📦 [[Nom:stock]] [[Court:activite:pl]]

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
2. Facultatif : glissez dans la zone **📎 Facture [[du:fournisseur]]** le PDF, le scan ou la photo de la facture reçue (sur un téléphone, touchez la zone pour prendre la photo). Une vignette s'affiche ; la croix ✕ retire un fichier avant l'envoi.
3. Ouvrez les catégories concernées et saisissez, ligne par ligne, la **quantité** et le **prix HT** unitaire (et le taux de TVA si vous le connaissez).
4. Contrôlez l'**Aperçu saisie** flottant en bas à droite : il cumule les lignes et le total TTC.
5. Cliquez sur **Enregistrer (N)** : une fenêtre récapitulative façon facture s'ouvre (lignes, Total HT, Total TTC, case **Timbre Fiscal** ajoutant 1,000 DT, cochée par défaut, et le nombre de fichiers joints). Confirmez : toutes les lignes et la facture jointe s'enregistrent ensemble — si l'une est refusée, rien n'est enregistré et le message dit pourquoi.
6. Si une facture portant **le même numéro** existe déjà chez [[ce:fournisseur]], LabFlow l'affiche (date, lieu, montant) : vérifiez que vous ne la saisissez pas deux fois avant de choisir **Enregistrer quand même**.
7. Si [[un:appro:court]] existe déjà à cette date pour [[un:article]], une confirmation supplémentaire affiche le cumul avant validation.

Produire [[un:pt]] : saisissez la quantité sur sa ligne — l'indication **Max** montre le maximum réalisable avec [[le:stock]] [[de:ingredient:pl]], et le prix se calcule automatiquement depuis [[le:recette]] ([production [[de:pt:pl:court]]](#calc-production-pt)). Le bouton **⚙️ Personnaliser** permet d'ajuster les quantités [[de:ingredient:pl]] réellement consommées.

Configurer un seuil : bouton **🔧 Seuil**, saisissez la valeur minimale (laisser vide pour désactiver), puis Enregistrer. Le seuil d'[[un:pt]] se règle aussi [[nom:activite]] par [[nom:activite]].

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
- [[[Nom:perte:pl]]](#pertes) · [Historiques](#historique) · [[[Nom:transfert:pl]]](#transferts) · [Factures [[de:appro:court]]](#factures)$m222_stock_activites$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'stock-activites'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'ebac3dc335cb5cd178a4695c1437bfb1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'stock-activites'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'stock-activites'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'stock-activites' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'stock-activites'::TEXT; END IF;
  -- ── stock-labo ──
  t := $m222_stock_labo$## 🏭 [[Nom:stock]] [[Court:labo]]

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
2. Facultatif : glissez dans la zone **📎 Facture [[du:fournisseur]]** le PDF, le scan ou la photo de la facture reçue (sur un téléphone, touchez la zone pour prendre la photo). Une vignette s'affiche ; la croix ✕ retire un fichier avant l'envoi.
3. Saisissez quantité et prix HT (TVA facultative) sur chaque ligne concernée.
4. Cliquez sur **Enregistrer** : une fenêtre récapitule la facture, avec une case **Timbre Fiscal** (+1,000 DT, cochée par défaut) et le nombre de fichiers joints ; confirmez. Toutes les lignes et la facture jointe s'enregistrent ensemble ; une facture du même numéro déjà saisie chez [[ce:fournisseur]] est signalée avant l'enregistrement.

Produire [[un:pt:court]] ([[nom:labo:pl]] de production uniquement — [[un:labo]] [[acc:labo:configuré:configurée]] sans production, tel un économat, n'affiche pas [[de:pt:pl:court]]) :

1. Saisissez la **quantité produite** sur la ligne [[du:pt:court]] — aucun prix à saisir, son coût est calculé d'après les prix [[du:article:pl]] [[du:labo]].
2. Enregistrez : [[le:ingredient:pl]] [[du:recette]] **et les sous-PT** qu'[[acc:recette:il:elle]] contient sont déduits automatiquement [[du:stock]] [[du:labo]].
3. Au besoin, le bouton **⚙️ Personnaliser** permet d'ajuster [[le:portion:pl]] réellement [[acc:portion:utilisé:utilisée:pl]] pour cette production.

Déclarer [[un:perte]] : bouton **📉 [[Court:perte]]**, puis quantité, type (selon votre domaine : Avarie ou Déchet par défaut) et date ; la fenêtre affiche [[le:stock]] disponible, le prix unitaire retenu et le coût total [[du:perte]].

Définir un seuil : bouton **🔧 Seuil**. [[Le:stock]] s'affiche ensuite en 🔴 (au seuil ou en dessous), 🟠 (jusqu'à seuil + 10 %) ou 🟢 (au-dessus).

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
- [[[Nom:transfert:pl]] vers [[le:activite:pl]] et [[nom:labo:pl]] rattachés](#transferts) · [Factures [[de:appro:court]]](#factures) · [[[Nom:perte:pl]]](#pertes)$m222_stock_labo$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'stock-labo'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '4ed5581be3f54811713c88fc2b2c85fa';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'stock-labo'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'stock-labo'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'stock-labo' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'stock-labo'::TEXT; END IF;
  RAISE NOTICE '222 : % fiche(s) réécrite(s), % déjà faite(s), % gardée(s) : % ; titres gardés : % ; retouchées dans l''admin (texte servi inchangé, à corriger dans l''admin) : % ; base : % réécrite(s), % déjà faite(s), gardée(s) : % ; variantes (brouillons) : % mise(s) à jour, % déjà faite(s), non touchée(s) (validée, retouchée ou absente : à revoir dans l''admin) : %',
    faites, deja, cardinality(gardees),
    COALESCE(NULLIF(array_to_string(gardees, ', '), ''), 'aucune'),
    COALESCE(NULLIF(array_to_string(titres_gardes, ', '), ''), 'aucun'),
    COALESCE(NULLIF(array_to_string(retouchees, ', '), ''), 'aucune'),
    b_faites, b_deja,
    COALESCE(NULLIF(array_to_string(b_gardees, ', '), ''), 'aucune'),
    v_faites, v_deja,
    COALESCE(NULLIF(array_to_string(v_gardees, ', '), ''), 'aucune');
END
$m222$;
