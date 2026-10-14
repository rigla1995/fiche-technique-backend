-- 239 — Conditions des prestataires et chiffre net (P2) : commission, TVA sur la commission et mode de paiement saisis à l’activation, figés sur chaque vente ; net des prestataires et filtre par mode de paiement au tableau de bord.
-- Généré par scripts/manuel/generer-maintenance.mjs depuis scripts/manuel/revisions.json — ne pas éditer à la main.
--
-- Migration de maintenance du manuel balisé (modèle de la 194, scripts/VOCAB-GUIDE-SERVEUR.md §9). Fiche : texte balisé
-- entier, gardé par le md5 (sans \r) du texte précédent ; contenu remplacé seulement s'il égale encore contenu_defaut
-- (une fiche retouchée dans l'admin garde sa retouche) ; titre gardé par égalité exacte ; updated_at, mots_cles et icone
-- ne sont pas écrits. Base de connaissances : clé lower(titre), garde = md5 du contenu. Variantes : seuls les brouillons
-- jamais retouchés sont mis à jour (et base_md5 avec eux) ; une variante validée ou retouchée passe « à revoir ».
-- Idempotente : au 2e passage, tout est « déjà fait ».
--
-- inventaire : {"fiches":["configuration-vente","saisie-ventes","dashboard"],"titres":[],"entrees":[],"variantes":[]}

DO $m239$
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
  t := $m239_configuration_vente$## 💲 Configuration [[Court:vente]]

Cet écran est le point de départ [[du:espace_vente:Nom]] : vous y choisissez les articles proposés [[au:vente]] et fixez leurs prix, pour [[le:vente]] [[acc:vente:direct:directe]] au comptoir comme pour chaque [[nom:prestataire]] de livraison. Vous le trouvez dans le menu **[[Nom:espace_vente]] → Configuration [[Court:vente]]**.

### Activer le module [[Court:vente]]

[[Le:espace_vente:Nom]] est une option de votre abonnement. Tant qu'[[acc:espace_vente:il:elle]] n'est pas [[acc:espace_vente:activé:activée]], un écran « Module [[Court:vente]] non activé » s'affiche à la place :

1. Cliquez sur **🚀 Demander l'activation**.
2. Un message « Demande envoyée — en attente de validation » confirme l'envoi ; l'activation est réalisée par l'administrateur sous 24 h.
3. Suivez le statut de votre demande dans [Mon Abonnement](#abonnement).

### Ce que vous voyez

- Un **sélecteur [[de:activite]]** : chaque [[nom:activite]] a sa propre configuration de prix.
- Deux raccourcis dans l'en-tête : **🛵 [[Pl:prestataire]]** et **🏗️ Charges**.
- Quatre onglets : **🛍️ [[Nom:vente]] [[Court:produit:pl]]**, **🧂 [[Pl:vente]] [[Court:supplement:pl]]** et **💎 [[Pl:vente]] [[acc:vente:Valorisés:Valorisées]]** (chacun avec son compteur d'articles), plus **📋 Historique config**.
- Dans chaque onglet de saisie, un tableau groupé par **catégorie [[de:produit]]** avec les colonnes *[[Nom:produit]]*, *Vendable* (case à cocher), *🏪 Prix direct*, puis une colonne *🛵* par [[nom:prestataire]] [[acc:prestataire:actif:active]].
- Une barre d'outils : recherche par nom, filtre par [[nom:prestataire]], bouton **✕ Réinitialiser**, compteur d'articles et bouton **💾 Enregistrer** affichant le nombre de modifications en attente.

### Actions pas à pas

Rendre un article vendable et fixer son prix :

1. Cochez la case **Vendable** : l'article entre au catalogue [[de:vente]], encore inactif.
2. Saisissez son **prix direct** en DT, puis cliquez sur **💾 Enregistrer**.
3. Cochez à nouveau **Vendable** pour l'activer : tant qu'aucun prix supérieur à 0 n'est enregistré, la case reste bloquée.
4. Une fois l'article actif, saisissez si besoin un **prix dédié par [[nom:prestataire]]**, puis enregistrez.

Gérer les canaux [[nom:prestataire:pl]] (bouton **🛵 [[Pl:prestataire]]**) :

1. Sélectionnez [[le:activite]] [[acc:activite:concerné:concernée]].
2. Activez chaque [[nom:prestataire]] de livraison avec l'interrupteur : une fenêtre demande ses **conditions** — la **commission** (%), la **TVA** (%) sur cette commission et le **mode de paiement** (Espèces, Virement… liste tenue par l'administrateur). Un exemple sur 100 DT montre le net obtenu.
3. Les conditions s'affichent sous le nom [[du:prestataire]] ; **✏️ Modifier les conditions** les change pour [[le:vente:pl]] à venir. [[Le:vente:pl]] déjà [[acc:vente:enregistrés:enregistrées]] gardent les conditions du jour de leur saisie.
4. Désactiver [[un:prestataire]] **efface ses conditions et ses prix** pour [[le:activite]] : une confirmation le rappelle, avec le nombre de prix concernés.
5. La liste [[du:prestataire:pl]] disponibles et celle des modes de paiement sont gérées par l'administrateur : si elles sont vides, contactez le [support](#support).

[[Un:prestataire]] [[acc:prestataire:activé:activée]] avant l'arrivée des conditions porte la mention **⚠ Conditions à renseigner** : tant qu'elles manquent, la saisie [[du:vente:pl]] sur ce canal est refusée.

Consulter l'onglet **📋 Historique config** : chaque enregistrement de prix y est tracé ([[nom:produit]], type, prix enregistré, date, auteur). Vous pouvez filtrer par nom, type et période, actualiser la liste, supprimer une entrée, et exporter en Excel avec **Exporter XLS** — en cochant des lignes au préalable, seules celles-ci sont exportées.

### Points d'attention

:::attention
Le prix de chaque [[nom:prestataire]] est **saisi manuellement**, article par article : la commission ne calcule aucun prix. Elle sert, avec la TVA, au **chiffre net** [[du:prestataire]] dans le [tableau de bord](#dashboard) : net = prix [[de:vente]] − commission − TVA sur la commission. Un prix [[nom:prestataire]] non renseigné empêche de valoriser correctement [[le:vente:pl]] [[acc:vente:passé:passée:pl]] par ce canal.
:::

:::attention
Sans [[nom:prestataire]] [[acc:prestataire:actif:active]] pour [[le:activite]], les colonnes [[nom:prestataire:pl]] n'apparaissent pas : un bandeau vous propose alors de configurer [[le:prestataire:pl]].
:::

:::astuce
Le bouton 💾 Enregistrer affiche le nombre de prix modifiés non sauvegardés : enregistrez avant de changer d'onglet ou [[de:activite]] pour ne rien perdre.
:::

### Voir aussi

- [Saisie [[du:vente:pl]]](#saisie-ventes) — utiliser ces prix au quotidien
- [[[Nom:produit_vendable:pl]]](#produits-vendables) et [[[Nom:article:pl]] [[acc:article:valorisé:valorisée:pl]]](#articles-valorises) — créer les articles à vendre
- [Charges](#charges) — compléter votre configuration de rentabilité
- [Comprendre les prix](#calc-prix) et [HT / TTC](#calc-ht-ttc)$m239_configuration_vente$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'configuration-vente'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '0fc9974b2af0b1b6fdd36c054d0d9e27';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'configuration-vente'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'configuration-vente'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'configuration-vente' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'configuration-vente'::TEXT; END IF;
  -- ── saisie-ventes ──
  t := $m239_saisie_ventes$## 🛒 Saisie [[du:vente:pl]]

Cet écran vous permet d'enregistrer [[le:vente:pl]] [[acc:vente:quotidien:quotidienne:pl]] de chaque [[nom:activite]] — en [[nom:vente]] [[acc:vente:direct:directe]] au comptoir comme via [[votre:prestataire:pl]] de livraison — puis d'en consulter l'historique complet. Vous le trouvez dans le menu **[[Nom:espace_vente]] → [[Pl:vente]] [[Court:activite:pl]]**.

### Ce que vous voyez

- Un **sélecteur [[de:activite]]** et deux raccourcis : **⚙️ Configuration** et **📊 Rapport**.
- Quatre onglets : **📝 Saisie [[du:vente:pl]] [[court:produit:pl]]**, **🧂 Saisie [[du:vente:pl]] [[court:supplement:pl]]**, **💎 Saisie [[du:vente:pl]] [[acc:vente:valorisés:valorisées]]** et **📋 Historique**.
- Dans chaque onglet de saisie, un tableau groupé par **catégorie** avec les colonnes *Article* (et son unité), *Prix vente*, *🏪 Qté directe*, puis une colonne *🛵* par [[nom:prestataire]] [[acc:prestataire:actif:active]].
- Une barre d'outils : recherche par nom, champ **Date [[de:vente]]** et bouton **✓ Confirmer [[le:vente:pl]]**.
- En bas du tableau, le **CA total** de votre saisie, mis à jour en direct.

### Actions pas à pas

Enregistrer [[le:vente:pl]] d'une journée :

1. Choisissez [[le:activite]], puis l'onglet correspondant au type d'article ([[nom:produit:pl]], [[nom:supplement:pl]] ou valorisés).
2. Vérifiez la **date [[de:vente]]** : la date du jour est proposée par défaut, modifiable pour une saisie a posteriori.
3. Saisissez les quantités vendues dans la colonne **🏪 Qté directe** et/ou dans la colonne de chaque [[nom:prestataire]].
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
Configurez le **prix [[nom:prestataire]]** de chaque article avant de saisir des quantités sur ce canal : une quantité saisie sans prix configuré est valorisée à 0 DT dans le chiffre d'affaires. [[Un:prestataire]] dont les **conditions** (commission, TVA, mode de paiement) ne sont pas renseignées refuse la saisie : renseignez-les d'abord dans Config [[Court:prestataire:pl]].
:::

:::attention
La confirmation déduit immédiatement [[le:stock]]. En cas d'erreur, utilisez le bouton **Annuler** dans l'historique : [[le:vente]] est [[acc:vente:supprimé:supprimée]] et [[le:stock]] [[acc:stock:réintégré:réintégrée]]. [[Un:gerant]] ne peut annuler que [[le:vente:pl]] qu'[[acc:gerant:il:elle]] a [[acc:gerant:lui-même:elle-même]] [[acc:vente:saisi:saisie:pl]].
:::

:::astuce
Seuls les articles **activés** en Configuration [[Court:vente]] apparaissent dans les tableaux de saisie. Si un tableau est vide, un lien vous mène directement à l'écran de configuration des prix.
:::

### Voir aussi

- [Configuration [[Court:vente]]](#configuration-vente) — activer les articles et fixer les prix
- [[[Pl:vente]] [[Court:labo]]](#ventes-labo) — le pendant côté [[nom:labo_long]]
- [Rapports [[de:vente]]](#rapports-vente) — analyser CA et [[nom:marge:pl]]
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites) et [[[Nom:fiche_technique:pl]]](#fiches-techniques) — comprendre le déstockage$m239_saisie_ventes$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'saisie-ventes'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'f1c9a4ae36dfd65f8d5a5bd982b62256';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'saisie-ventes'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'saisie-ventes'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'saisie-ventes' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'saisie-ventes'::TEXT; END IF;
  -- ── dashboard ──
  t := $m239_dashboard$## 📊 Le Tableau de bord

Le tableau de bord est votre poste de pilotage : [[nom:vente:pl]], [[nom:marge:pl]], achats, [[nom:stock:pl]], [[nom:perte:pl]] et [[nom:labo]], réunis sur une seule page. Tous les montants sont exprimés en **TTC**. Vous y accédez depuis le menu latéral, entrée **Tableau de bord**.

### Les cinq onglets

- **Vue d'ensemble** — les indicateurs clés de la période avec leur évolution par rapport à la période précédente (dont le **Net [[nom:prestataire:pl]]** : leur CA moins les commissions et la TVA sur les commissions), les alertes ([[nom:stock]] sous seuil, [[nom:food_cost]] [[acc:food_cost:élevé:élevée]] — au-delà du **seuil [[de:cout_matiere]] de votre domaine**, 40 % par défaut —, [[nom:inventaire]] [[acc:inventaire:ancien:ancienne]]) et la courbe d'évolution du CA et [[du:marge:pl]].
- **[[Nom:vente:pl]] & [[nom:marge:pl]]** — l'analyse fine de votre rentabilité : [[nom:marge:pl]] par canal de vente, par catégorie [[de:produit:pl]], par type ([[nom:produit:pl]], [[nom:supplement:pl]], valorisés), [[acc:marge:meilleurs:meilleures]] et plus faibles [[nom:marge:pl]], et le détail triable [[nom:produit]] par [[nom:produit]].
- **Achats & [[nom:stock]]** — vos achats par catégorie et par [[nom:fournisseur]], les réceptions en provenance [[du:labo]], la valeur [[du:stock]] par catégorie, les alertes de seuil détaillées et les [[acc:inventaire:derniers:dernières]] [[nom:inventaire:pl]].
- **[[Nom:perte:pl]]** — [[le:perte:pl]] **[[acc:perte:consolidé:consolidée:pl]] de [[votre:activite:pl]] et de [[votre:labo:pl]]** : par type (les types [[de:perte]] de votre domaine : avarie/déchet par défaut), par site, par catégorie, [[nom:article:pl]] les plus [[acc:article:perdu:perdue:pl]], et leur poids par rapport au CA.
- **[[Court:labo]]** — la production [[de:pt:pl]], [[le:transfert:pl]] [[acc:transfert:émis:émise:pl]] vers chaque [[nom:activite]], les cessions internes vers [[le:labo:pl]] [[acc:labo:rattaché:rattachée:pl]], [[le:stock]], [[le:perte:pl]] et [[le:vente:pl]] [[du:labo]]. (Cet onglet n'apparaît que si vous avez [[un:labo]].)

### Les filtres

Chaque filtre est **multi-sélection** : cochez une ou plusieurs valeurs ([[nom:activite:pl]], types de vente, [[nom:prestataire:pl]], modes de paiement, catégories [[de:produit:pl]] ou [[de:article:pl]], familles, [[nom:fournisseur:pl]]…). Sans coche, tout est pris en compte. Les filtres proposés s'adaptent à l'onglet affiché. Le filtre **Mode de paiement** retient [[le:vente:pl]] par [[nom:prestataire]] dont le mode (Espèces, Virement…) était celui-là le jour de la saisie.

1. Choisissez la **période** : mois en cours, 7 ou 30 jours, mois dernier, trimestre, année, ou des dates personnalisées.
2. Combinez les filtres, par exemple : *[[nom:marge:pl]] des catégories « Pâtisseries » et « Boissons » vendues via [[nom:prestataire]] sur le trimestre*.
3. Le bouton **✕ Réinitialiser** efface tous les filtres. Vos choix sont conservés (et l'adresse de la page peut être partagée telle quelle).

### [[Le:marge]] à trois étages

:::formule Du CA [[au:marge]] [[acc:marge:net:nette]]
[[Nom:marge]] [[acc:marge:brut:brute]] = CA − [[nom:cout_matiere]]
[[Nom:marge]] après commissions = [[nom:marge]] [[acc:marge:brut:brute]] − commissions [[nom:prestataire:pl]] − TVA sur ces commissions
[[Nom:marge]] [[acc:marge:net estimé:nette estimée]] = [[nom:marge]] après commissions − prorata des charges fixes
note: commission et TVA aux taux figés sur chaque [[nom:vente]] le jour de sa saisie (conditions [[du:prestataire]] pour [[le:activite]]) ; charges = charges fixes annuelles ramenées à la période.
:::

:::formule Net [[nom:prestataire:pl]]
Net [[nom:prestataire:pl]] = CA [[du:vente:pl]] par [[nom:prestataire]] − commissions − TVA sur les commissions
note: la carte de la vue d'ensemble et de l'onglet [[Nom:vente:pl]] & [[nom:marge:pl]] ; le tableau par canal donne la commission, la TVA et le net de chaque [[nom:prestataire]]. Filtrez par [[nom:prestataire]] ou par mode de paiement pour suivre un canal.
:::

- [[Det:cout_matiere:le]]**[[nom:cout_matiere]]** de chaque [[nom:vente]] est [[acc:cout_matiere:figé:figée]] au moment [[du:vente]] (voir [Coût de revient d'[[un:recette]]](#calc-cout-recette)) ; le badge [[de:cout_matiere]] d'[[un:produit]] passe au vert, à l'orange puis au rouge selon le seuil de votre domaine (40 % par défaut : orange dès seuil − 10 points, rouge au-delà du seuil).
- La **cascade** de l'onglet [[Nom:vente:pl]] & [[nom:marge:pl]] visualise chaque étage, du CA jusqu'[[au:marge]] [[acc:marge:net:nette]].

:::astuce
Chaque indicateur affiche son évolution (▲/▼) par rapport à la période précédente de même durée. Le bouton **📥 Exporter (Excel)** télécharge les données de l'onglet affiché, filtres compris.
:::

:::attention
[[Le:marge]] [[acc:marge:net:nette]] est une **estimation** : [[acc:marge:il:elle]] répartit vos charges fixes annuelles au prorata de la période, indépendamment des filtres de catégories ou de canaux.
:::

### Voir aussi

- [Comprendre la valeur [[du:stock]]](#calc-valeur-stock)
- [Les prix et le PV](#calc-prix)
- [Saisie [[du:vente:pl]]](#saisie-ventes)$m239_dashboard$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'dashboard'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '09d3ea4edca2fff295ae78c62ca373e7';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'dashboard'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'dashboard'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'dashboard' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'dashboard'::TEXT; END IF;
  RAISE NOTICE '239 : % fiche(s) réécrite(s), % déjà faite(s), % gardée(s) : % ; titres gardés : % ; retouchées dans l''admin (texte servi inchangé, à corriger dans l''admin) : % ; base : % réécrite(s), % déjà faite(s), gardée(s) : % ; variantes (brouillons) : % mise(s) à jour, % déjà faite(s), non touchée(s) (validée, retouchée ou absente : à revoir dans l''admin) : %',
    faites, deja, cardinality(gardees),
    COALESCE(NULLIF(array_to_string(gardees, ', '), ''), 'aucune'),
    COALESCE(NULLIF(array_to_string(titres_gardes, ', '), ''), 'aucun'),
    COALESCE(NULLIF(array_to_string(retouchees, ', '), ''), 'aucune'),
    b_faites, b_deja,
    COALESCE(NULLIF(array_to_string(b_gardees, ', '), ''), 'aucune'),
    v_faites, v_deja,
    COALESCE(NULLIF(array_to_string(v_gardees, ', '), ''), 'aucune');
END
$m239$;
