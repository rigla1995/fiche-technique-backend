-- 257 — Canaux de vente (C1) : chaque canal (vente directe, prestataires) a sa case et son prix ; produit vendu chez un prestataire seulement ; copie d'un canal avec majoration ; cases de saisie fermées hors canal.
-- Généré par scripts/manuel/generer-maintenance.mjs depuis scripts/manuel/revisions.json — ne pas éditer à la main.
--
-- Migration de maintenance du manuel balisé (modèle de la 194, scripts/VOCAB-GUIDE-SERVEUR.md §9). Fiche : texte balisé
-- entier, gardé par le md5 (sans \r) du texte précédent ; contenu remplacé seulement s'il égale encore contenu_defaut
-- (une fiche retouchée dans l'admin garde sa retouche) ; titre gardé par égalité exacte ; updated_at, mots_cles et icone
-- ne sont pas écrits. Base de connaissances : clé lower(titre), garde = md5 du contenu. Variantes : seuls les brouillons
-- jamais retouchés sont mis à jour (et base_md5 avec eux) ; une variante validée ou retouchée passe « à revoir ».
-- Idempotente : au 2e passage, tout est « déjà fait ».
--
-- inventaire : {"fiches":["configuration-vente","saisie-ventes"],"titres":[],"entrees":[],"variantes":[]}

DO $m257$
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
  -- ── configuration-vente ──
  t := $m257_configuration_vente$## 💲 Configuration [[Court:vente]]

Cet écran est le point de départ [[du:espace_vente:Nom]] : vous y choisissez, **canal par canal**, les articles proposés [[au:vente]] et leurs prix. [[Le:vente]] [[acc:vente:direct:directe]] au comptoir est un canal, chaque [[nom:prestataire]] de livraison en est un autre : chacun a sa propre liste et ses propres prix. Vous le trouvez dans le menu **[[Nom:espace_vente]] → Configuration [[Court:vente]]**.

### Activer le module [[Court:vente]]

[[Le:espace_vente:Nom]] est une option de votre abonnement. Tant qu'[[acc:espace_vente:il:elle]] n'est pas [[acc:espace_vente:activé:activée]], un écran « Module [[Court:vente]] non activé » s'affiche à la place :

1. Cliquez sur **🚀 Demander l'activation**.
2. Un message « Demande envoyée — en attente de validation » confirme l'envoi ; l'activation est réalisée par l'administrateur sous 24 h.
3. Suivez le statut de votre demande dans [Mon Abonnement](#abonnement).

### Ce que vous voyez

- Un **sélecteur [[de:activite]]** : chaque [[nom:activite]] a sa propre configuration de prix.
- Deux raccourcis dans l'en-tête : **🛵 [[Pl:prestataire]]** et **🏗️ Charges**.
- Quatre onglets : **🛍️ [[Nom:vente]] [[Court:produit:pl]]**, **🧂 [[Pl:vente]] [[Court:supplement:pl]]** et **💎 [[Pl:vente]] [[acc:vente:Valorisés:Valorisées]]** (chacun avec son compteur d'articles), plus **📋 Historique config**.
- Dans chaque onglet de saisie, un tableau groupé par **catégorie [[de:produit]]** avec la colonne *[[Nom:produit]]*, puis une colonne par **canal** : *🏪 [[Nom:vente]] [[acc:vente:direct:directe]]* et une colonne *🛵* par [[nom:prestataire]] [[acc:prestataire:actif:active]]. Chaque cellule porte une **case** (la ligne se vend sur ce canal) et un **prix** en DT.
- Sous le titre de chaque canal, **✓ Tout** coche toutes les lignes qui y ont un prix et **✕ Aucun** les décoche (les prix sont gardés).
- Une barre d'outils : recherche par nom, filtre par canal (ce qui s'y vend), bouton **✕ Réinitialiser**, compteur d'articles et bouton **💾 Enregistrer** affichant le nombre de modifications en attente.
- Le bouton **📋 Copier un canal**, dès qu'[[un:prestataire]] est [[acc:prestataire:actif:active]].

### Actions pas à pas

Vendre une ligne sur un canal et fixer son prix :

1. Saisissez son **prix** dans la colonne du canal : la case se coche d'elle-même au premier prix.
2. Pour retirer la ligne d'un canal sans perdre son prix, décochez la case ; recochez-la pour l'y remettre.
3. Cliquez sur **💾 Enregistrer** : toutes les cellules modifiées partent ensemble. Si l'une est refusée, rien n'est enregistré et un message en donne la raison.

Vendre une ligne chez [[un:prestataire]] seulement : laissez la colonne *🏪 [[Nom:vente]] [[acc:vente:direct:directe]]* vide ou décochée et renseignez le prix dans la colonne [[du:prestataire]]. Aucun prix direct n'est demandé.

Copier un canal vers un autre (bouton **📋 Copier un canal**) :

1. Choisissez le canal **Depuis** et le canal **Vers**.
2. Indiquez si besoin une **majoration** en % (par exemple pour couvrir la commission) et l'**arrondi** du prix : au centième, à 100 millimes, à 500 millimes ou au dinar.
3. La fenêtre annonce le nombre de lignes à copier et de prix remplacés ; validez avec **📋 Copier**.
4. L'option « Retirer du canal d'arrivée… » y décoche ce que le canal d'origine ne vend pas (les prix sont gardés).

Dès que vous activez [[un:prestataire]], LabFlow propose de copier vers lui ce qui se vend en direct.

Gérer les canaux [[nom:prestataire:pl]] (bouton **🛵 [[Pl:prestataire]]**) :

1. Sélectionnez [[le:activite]] [[acc:activite:concerné:concernée]].
2. Activez chaque [[nom:prestataire]] de livraison avec l'interrupteur : une fenêtre demande ses **conditions** — la **commission** (%), la **TVA** (%) sur cette commission et le **mode de paiement** (Espèces, Virement… liste tenue par l'administrateur). Un exemple sur 100 DT montre le net obtenu.
3. Les conditions s'affichent sous le nom [[du:prestataire]] ; **✏️ Modifier les conditions** les change pour [[le:vente:pl]] à venir. [[Le:vente:pl]] déjà [[acc:vente:enregistrés:enregistrées]] gardent les conditions du jour de leur saisie.
4. Désactiver [[un:prestataire]] **efface ses conditions et ses prix** pour [[le:activite]] : une confirmation le rappelle, avec le nombre de prix concernés. Ce qui ne se vendait que sur ce canal n'est alors plus proposé [[au:vente]].
5. La liste [[du:prestataire:pl]] disponibles et celle des modes de paiement sont gérées par l'administrateur : si elles sont vides, contactez le [support](#support).

[[Un:prestataire]] [[acc:prestataire:activé:activée]] avant l'arrivée des conditions porte la mention **⚠ Conditions à renseigner** : tant qu'elles manquent, la saisie [[du:vente:pl]] sur ce canal est refusée.

Consulter l'onglet **📋 Historique config** : chaque enregistrement de prix y est tracé ([[nom:produit]], type, prix enregistré, date, auteur). Vous pouvez filtrer par nom, type et période, actualiser la liste, supprimer une entrée, et exporter en Excel avec **Exporter XLS** — en cochant des lignes au préalable, seules celles-ci sont exportées.

### Points d'attention

:::attention
Le prix de chaque [[nom:prestataire]] est **saisi par vous**, article par article ou d'un coup avec **📋 Copier un canal** : la commission ne calcule aucun prix. Elle sert, avec la TVA, au **chiffre net** [[du:prestataire]] dans le [tableau de bord](#dashboard) : net = prix [[de:vente]] − commission − TVA sur la commission.
:::

:::attention
Une case ne se coche qu'avec un **prix supérieur à 0** ; effacer le prix d'une case cochée la décoche. Une ligne sans case cochée sur un canal ne s'y vend pas : dans la [saisie [[du:vente:pl]]](#saisie-ventes), sa case de quantité est fermée et [[le:vente]] est [[acc:vente:refusé:refusée]].
:::

:::attention
Sans [[nom:prestataire]] [[acc:prestataire:actif:active]] pour [[le:activite]], les colonnes [[nom:prestataire:pl]] n'apparaissent pas : un bandeau vous propose alors de configurer [[le:prestataire:pl]].
:::

:::astuce
Le bouton 💾 Enregistrer affiche le nombre de cellules modifiées non sauvegardées : enregistrez avant de changer [[de:activite]] ou de copier un canal pour ne rien perdre.
:::

### Voir aussi

- [Saisie [[du:vente:pl]]](#saisie-ventes) — utiliser ces prix au quotidien
- [[[Nom:produit_vendable:pl]]](#produits-vendables) et [[[Nom:article:pl]] [[acc:article:valorisé:valorisée:pl]]](#articles-valorises) — créer les articles à vendre
- [Charges](#charges) — compléter votre configuration de rentabilité
- [Comprendre les prix](#calc-prix) et [HT / TTC](#calc-ht-ttc)$m257_configuration_vente$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'configuration-vente'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '1fead35456e67d9b2dbe1893001ccb8e';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'configuration-vente'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'configuration-vente'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'configuration-vente' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'configuration-vente'::TEXT; END IF;
  -- ── saisie-ventes ──
  t := $m257_saisie_ventes$## 🛒 Saisie [[du:vente:pl]]

Cet écran vous permet d'enregistrer [[le:vente:pl]] [[acc:vente:quotidien:quotidienne:pl]] de chaque [[nom:activite]] — en [[nom:vente]] [[acc:vente:direct:directe]] au comptoir comme via [[votre:prestataire:pl]] de livraison — puis d'en consulter l'historique complet. Vous le trouvez dans le menu **[[Nom:espace_vente]] → [[Pl:vente]] [[Court:activite:pl]]**.

### Ce que vous voyez

- Un **sélecteur [[de:activite]]** et deux raccourcis : **⚙️ Configuration** et **📊 Rapport**.
- Quatre onglets : **📝 Saisie [[du:vente:pl]] [[court:produit:pl]]**, **🧂 Saisie [[du:vente:pl]] [[court:supplement:pl]]**, **💎 Saisie [[du:vente:pl]] [[acc:vente:valorisés:valorisées]]** et **📋 Historique**.
- Dans chaque onglet de saisie, un tableau groupé par **catégorie** avec les colonnes *Article* (et son unité), *Prix vente*, *🏪 Qté directe*, puis une colonne *🛵* par [[nom:prestataire]] [[acc:prestataire:actif:active]]. Une case de quantité n'est ouverte que sur les canaux où la ligne se vend ; ailleurs un tiret la remplace.
- Une barre d'outils : recherche par nom, champ **Date [[de:vente]]** et bouton **✓ Confirmer [[le:vente:pl]]**.
- En bas du tableau, le **CA total** de votre saisie, mis à jour en direct.

### Actions pas à pas

Enregistrer [[le:vente:pl]] d'une journée :

1. Choisissez [[le:activite]], puis l'onglet correspondant au type d'article ([[nom:produit:pl]], [[nom:supplement:pl]] ou valorisés).
2. Vérifiez la **date [[de:vente]]** : la date du jour est proposée par défaut, modifiable pour une saisie a posteriori.
3. Saisissez les quantités vendues dans la colonne **🏪 Qté directe** et/ou dans la colonne de chaque [[nom:prestataire]], là où la case est ouverte.
4. Contrôlez le **CA total** en bas de tableau.
5. Cliquez sur **✓ Confirmer [[le:vente:pl]]** : une fenêtre rappelle que [[le:vente]] déduira directement [[le:stock]] [[du:activite]] ; validez avec **✓ Confirmer**.

Consulter et gérer l'historique (onglet 📋) :

1. Filtrez par période (**Du / Au**), **type de vente** (directe ou [[nom:prestataire]]), **type [[de:produit]]** ([[nom:produit]], [[nom:supplement]], valorisé) et **[[nom:prestataire]]**.
2. Chaque ligne détaille l'article, son badge de type, le canal (🏪 Directe ou 🛵 nom [[du:prestataire]], avec la commission, la TVA et le mode de paiement figés le jour de la saisie), la quantité, le CA avec le prix unitaire appliqué, et l'auteur de la saisie.
3. Cliquez sur **Exporter XLS** pour télécharger l'historique en Excel (CA, commission, TVA sur la commission, net, mode de paiement) ; cochez d'abord des lignes pour n'exporter que celles-ci.
4. Le bouton **Annuler** d'une ligne supprime [[le:vente]] et **réintègre les quantités en [[nom:stock]]** (une confirmation est demandée).

### Calculs

:::formule Chiffre d'affaires d'une ligne
CA = quantité vendue × prix de vente du canal
note: prix direct pour [[le:vente]] au comptoir, prix [[nom:prestataire]] configuré pour chaque [[nom:prestataire]].
:::

:::formule Chiffre net d'[[un:vente]] par [[nom:prestataire]]
Net = CA − commission − TVA sur la commission
note: aux taux [[du:prestataire]] le jour de la saisie (30 DT à 25 % et TVA 19 % : commission 7,500, TVA 1,425, net 21,075). Changer les conditions ensuite ne touche pas [[le:vente:pl]] [[acc:vente:passé:passée:pl]].
:::

À la confirmation, les quantités vendues sont déduites [[du:stock]] [[du:activite]] : [[le:article:pl]] [[acc:article:valorisé:valorisée:pl]] directement, [[le:produit:pl]] et [[nom:supplement:pl]] via la décomposition de leur [[nom:fiche_technique]] ([[nom:article:pl]] et sous-produits transformés) ; [[un:produit]] [[acc:produit:préparé:préparée]] [[au:labo]] est, [[acc:produit:lui:elle]], [[acc:produit:déduit:déduite]] [[acc:produit:tel quel:telle quelle]] [[du:stock]] [[de:pt:pl]] [[du:activite]]. [[Le:marge]] [[acc:marge:dégagé:dégagée]] est ensuite [[acc:marge:analysé:analysée]] dans le [rapport [[de:vente]]](#rapports-vente).

### Points d'attention

:::attention
Une ligne ne se saisit que sur les canaux où elle se vend : dans Configuration [[Court:vente]], cochez sa case sur le canal voulu, avec un prix. Un tiret à la place de la case signifie que la ligne n'est pas proposée sur ce canal ; [[le:vente]] y est [[acc:vente:refusé:refusée]]. [[Un:prestataire]] dont les **conditions** (commission, TVA, mode de paiement) ne sont pas renseignées refuse la saisie : renseignez-les d'abord dans Config [[Court:prestataire:pl]].
:::

:::attention
La confirmation déduit immédiatement [[le:stock]]. En cas d'erreur, utilisez le bouton **Annuler** dans l'historique : [[le:vente]] est [[acc:vente:supprimé:supprimée]] et [[le:stock]] [[acc:stock:réintégré:réintégrée]]. [[Un:gerant]] ne peut annuler que [[le:vente:pl]] qu'[[acc:gerant:il:elle]] a [[acc:gerant:lui-même:elle-même]] [[acc:vente:saisi:saisie:pl]].
:::

:::astuce
Seuls les articles qui se vendent sur **au moins un canal** en Configuration [[Court:vente]] apparaissent dans les tableaux de saisie. Si un tableau est vide, un lien vous mène directement à l'écran de configuration des prix.
:::

### Voir aussi

- [Configuration [[Court:vente]]](#configuration-vente) — choisir ce qui se vend sur chaque canal et fixer les prix
- [[[Pl:vente]] [[Court:labo]]](#ventes-labo) — le pendant côté [[nom:labo_long]]
- [Rapports [[de:vente]]](#rapports-vente) — analyser CA et [[nom:marge:pl]]
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites) et [[[Nom:fiche_technique:pl]]](#fiches-techniques) — comprendre le déstockage$m257_saisie_ventes$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'saisie-ventes'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'a629d8ffe5c6ce331d2158b5385fc0c8';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'saisie-ventes'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'saisie-ventes'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'saisie-ventes' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'saisie-ventes'::TEXT; END IF;
  RAISE NOTICE '257 : % fiche(s) réécrite(s), % déjà faite(s), % gardée(s) : % ; titres gardés : % ; retouchées dans l''admin (texte servi inchangé, à corriger dans l''admin) : % ; base : % réécrite(s), % déjà faite(s), gardée(s) : % ; variantes (brouillons) : % mise(s) à jour, % déjà faite(s), non touchée(s) (validée, retouchée ou absente : à revoir dans l''admin) : %',
    faites, deja, cardinality(gardees),
    COALESCE(NULLIF(array_to_string(gardees, ', '), ''), 'aucune'),
    COALESCE(NULLIF(array_to_string(titres_gardes, ', '), ''), 'aucun'),
    COALESCE(NULLIF(array_to_string(retouchees, ', '), ''), 'aucune'),
    b_faites, b_deja,
    COALESCE(NULLIF(array_to_string(b_gardees, ', '), ''), 'aucune'),
    v_faites, v_deja,
    COALESCE(NULLIF(array_to_string(v_gardees, ', '), ''), 'aucune');
END
$m257$;
