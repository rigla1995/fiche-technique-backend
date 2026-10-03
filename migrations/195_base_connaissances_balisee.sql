-- 195 — Lot 2c : la base de connaissances balisée (docs/lot-2c-spec.md §4.3).
-- Généré par scripts/manuel/generer-migrations.mjs — ne pas éditer à la main.
--
-- Pour chaque entrée qui porte un terme : contenu (et titre, s'il est encore celui d'origine) reçoivent le texte
-- balisé. Clé : lower(titre) d'origine (index idx_ai_kb_titre) ; garde : md5 du contenu d'origine, sans \r (R4.3.1).
-- Au 2e passage, le titre balisé n'est plus la clé : « déjà balisée » cherche sous les deux titres. updated_at,
-- mots_cles et categorie ne sont pas écrits. NOTICE attendue : N / 0 / 0, puis 0 / N / 0 (R4.3.3).
--
-- inventaire : {"entrees":["abonnement et capacité","activité (point de vente)","approvisionnement (appro)","article valorisé","article vendable","catégorie de produit","charges fixes","coût matière","famille et catégorie d'article","fiche technique","food cost","fournisseur","gérant","inventaire","labo central","marge brute","mode de prix d'une fiche technique","panier moyen","pertes","prestataire de livraison","produit transformé (pt)","produits vendables et utilisables","rapport (excel / pdf)","référentiel articles","seuil minimum","supplément","timbre fiscal","transferts","tva (ht / ttc)","unité de mesure","valeur du stock","vente"],"sansTerme":[]}

DO $k195$
DECLARE
  t TEXT;
  n INTEGER;
  balisees INTEGER := 0;
  deja INTEGER := 0;
  gardees TEXT[] := ARRAY[]::TEXT[];
  titres_gardes TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- ── abonnement et capacité ──
  t := $k195_1$L'abonnement définit la capacité souscrite du client : nombre [[de:activite:pl]], [[de:labo:pl]] et [[de:gerant:pl]], plus le forfait mensuel et l'onboarding. À la création du compte, le client reçoit d'abord le contrat à signer électroniquement (DocuSeal) ; l'email d'activation n'est envoyé qu'après signature. Le mode du compte (actif, lecture seule, désactivé) dépend du paiement. Augmenter la capacité se fait via un avenant signé électroniquement, appliqué automatiquement après signature.$k195_1$;
  UPDATE ai_knowledge_base SET
    contenu = t
  WHERE lower(titre) = 'abonnement et capacité'
    AND md5(replace(contenu, E'\r', '')) = '24c7b9c77a4774df3cf718e5ec921322';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('abonnement et capacité')
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'abonnement et capacité'::TEXT;
  END IF;
  -- ── activité (point de vente) ──
  t := $k195_2$[[Un:activite]] est [[un:activite_desc]] du client (restaurant, café, kiosque…). [[acc:activite:Il:Elle]] a [[acc:stock:son propre:sa propre]] [[nom:stock]], [[son:appro:pl]], [[son:vente:pl]] et [[son:perte:pl]]. Un compte client gère [[acc:activite:un:une]] ou plusieurs [[nom:activite:pl]] (et éventuellement [[acc:labo:un:une]] ou plusieurs [[nom:labo:pl]]), sans distinction de type de compte. Les données peuvent être filtrées par [[nom:activite]].$k195_2$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Activité (point de vente)' THEN '[[Nom:activite]] ([[nom:activite_desc]])' ELSE titre END
  WHERE lower(titre) = 'activité (point de vente)'
    AND md5(replace(contenu, E'\r', '')) = '78fbd7fec69905421b1b9f7eab21245d';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('activité (point de vente)', lower('[[Nom:activite]] ([[nom:activite_desc]])'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'activité (point de vente)'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = '[[Nom:activite]] ([[nom:activite_desc]])') THEN titres_gardes := titres_gardes || 'activité (point de vente)'::TEXT; END IF;
  -- ── approvisionnement (appro) ──
  t := $k195_3$[[Det:appro:un]][[avecCourt:appro]] est une entrée [[de:stock]] : un achat [[de:article_ingredient]] avec quantité, prix unitaire saisi HT + taux de TVA (affiché en TTC) et [[nom:fournisseur]]. [[Le:appro:pl:court]] alimentent [[le:stock]] et mettent à jour le prix moyen pondéré (PMP TTC). [[Le:pt:pl]] d'origine [[nom:labo]] ne s'approvisionnent pas directement côté [[nom:activite]] : [[acc:pt:il:elle:pl]] arrivent uniquement par [[nom:transfert]] depuis [[le:labo]].$k195_3$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Approvisionnement (appro)' THEN '[[Nom:appro]] ([[court:appro]])' ELSE titre END
  WHERE lower(titre) = 'approvisionnement (appro)'
    AND md5(replace(contenu, E'\r', '')) = '5cf9e8192cdc82e538598f1ae018d1dd';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('approvisionnement (appro)', lower('[[Nom:appro]] ([[court:appro]])'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'approvisionnement (appro)'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = '[[Nom:appro]] ([[court:appro]])') THEN titres_gardes := titres_gardes || 'approvisionnement (appro)'::TEXT; END IF;
  -- ── article valorisé ──
  t := $k195_4$[[Un:produit_valorise]] (anciennement « article valorisé ») est [[acc:produit_valorise:vendu tel quel:vendue telle quelle]], sans décomposition en [[nom:ingredient:pl]] [[au:vente]]. [[acc:produit_valorise:Il:Elle]] peut être simple ([[un:article]] [[acc:article:déduit:déduite]] directement [[du:stock]] [[au:vente]]) ou [[acc:produit_valorise:composé:composée]] [[au:labo]] (« composé valorisé » : sa fabrication [[au:labo]] déduit [[le:ingredient:pl]] de [[son:recette]]). On lui affecte une catégorie et un prix de vente.$k195_4$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Article valorisé' THEN '[[Nom:article]] [[acc:article:valorisé:valorisée]]' ELSE titre END
  WHERE lower(titre) = 'article valorisé'
    AND md5(replace(contenu, E'\r', '')) = '16f54d78ee6ebad2d2c2b6a6997b09db';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('article valorisé', lower('[[Nom:article]] [[acc:article:valorisé:valorisée]]'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'article valorisé'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = '[[Nom:article]] [[acc:article:valorisé:valorisée]]') THEN titres_gardes := titres_gardes || 'article valorisé'::TEXT; END IF;
  -- ── article vendable ──
  t := $k195_5$Un article vendable est [[un:produit]] ou [[un:article]] [[acc:article:configuré:configurée]] [[au:vente]] sur [[un:activite]], avec un prix de vente et un statut actif. Il peut s'agir d'[[un:fiche_technique]] ([[nom:produit_vendable]]), d'[[un:pt]] vendable ou d'[[un:produit_valorise]]. Les vendables peuvent en option être gérés en [[nom:stock]]. Les prix de vente sont historisés à chaque modification.$k195_5$;
  UPDATE ai_knowledge_base SET
    contenu = t
  WHERE lower(titre) = 'article vendable'
    AND md5(replace(contenu, E'\r', '')) = '9a8a72aa2d7c46ef25cc817e40203500';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('article vendable')
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'article vendable'::TEXT;
  END IF;
  -- ── catégorie de produit ──
  t := $k195_6$Les catégories [[de:produit]] classent [[le:produit_vendable:pl]], distinctes des catégories [[de:article:pl]]. Elles sont typées : vendable, [[nom:supplement]] ou valorisé. La catégorie est obligatoire à la création d'[[un:produit_vendable]] ou d'[[un:supplement]] et sert au regroupement dans la saisie [[de:vente]] et les rapports.$k195_6$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Catégorie de produit' THEN 'Catégorie [[de:produit]]' ELSE titre END
  WHERE lower(titre) = 'catégorie de produit'
    AND md5(replace(contenu, E'\r', '')) = '3771e451b87f011355070fef2a68f8e0';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('catégorie de produit', lower('Catégorie [[de:produit]]'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'catégorie de produit'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = 'Catégorie [[de:produit]]') THEN titres_gardes := titres_gardes || 'catégorie de produit'::TEXT; END IF;
  -- ── charges fixes ──
  t := $k195_7$Les charges fixes d'[[un:activite]] (loyer, charges de personnel, électricité/gaz, eau…) sont saisies soit en montant global, soit en détail. Elles servent au calcul de la rentabilité au-delà [[du:cout_matiere]].$k195_7$;
  UPDATE ai_knowledge_base SET
    contenu = t
  WHERE lower(titre) = 'charges fixes'
    AND md5(replace(contenu, E'\r', '')) = '4096a1b0d345092ffb80e4f82fd1241a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('charges fixes')
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'charges fixes'::TEXT;
  END IF;
  -- ── coût matière ──
  t := $k195_8$[[Le:cout_matiere]] est la valeur [[du:ingredient:pl]] [[acc:ingredient:consommé:consommée:pl]] pour réaliser [[le:vente:pl]] d'une période. C'est le numérateur [[du:food_cost]].$k195_8$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Coût matière' THEN '[[Nom:cout_matiere]]' ELSE titre END
  WHERE lower(titre) = 'coût matière'
    AND md5(replace(contenu, E'\r', '')) = '5ecd730569e04bca4a5c552e4c09fcc0';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('coût matière', lower('[[Nom:cout_matiere]]'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'coût matière'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = '[[Nom:cout_matiere]]') THEN titres_gardes := titres_gardes || 'coût matière'::TEXT; END IF;
  -- ── famille et catégorie d'article ──
  t := $k195_9$[[Le:referentiel]] [[nom:article:pl]] est [[acc:referentiel:organisé:organisée]] en deux niveaux : la famille (niveau 1, ex : Fruits, Légumes, Viandes) puis la catégorie (niveau 2 sous la famille). Chaque [[nom:article]] appartient à une catégorie. Cette arborescence sert au filtrage et aux regroupements.$k195_9$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Famille et catégorie d''article' THEN 'Famille et catégorie [[de:article]]' ELSE titre END
  WHERE lower(titre) = 'famille et catégorie d''article'
    AND md5(replace(contenu, E'\r', '')) = '47ee702d40c6bec535c55bd83bfd4072';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('famille et catégorie d''article', lower('Famille et catégorie [[de:article]]'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'famille et catégorie d''article'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = 'Famille et catégorie [[de:article]]') THEN titres_gardes := titres_gardes || 'famille et catégorie d''article'::TEXT; END IF;
  -- ── fiche technique ──
  t := $k195_10$[[Le:fiche_technique]] est le coût détaillé d'[[un:produit]] ([[nom:recette]]). [[acc:fiche_technique:Il:Elle]] additionne le coût de chaque [[nom:ingredient]] et sous-produit selon sa quantité. Le coût d'[[un:ingredient]] est calculé en prix TTC selon le mode choisi : prix moyen pondéré [[du:stock]] (PMP TTC depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]]), dernier prix d'achat, ou prix manuels saisis (simulation). [[acc:fiche_technique:Il:Elle]] sert à connaître le coût de revient d'[[un:produit]] et à fixer son prix de vente.$k195_10$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Fiche technique' THEN '[[Nom:fiche_technique]]' ELSE titre END
  WHERE lower(titre) = 'fiche technique'
    AND md5(replace(contenu, E'\r', '')) = '063dded7bd48ee4bc31aa1727cd516da';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('fiche technique', lower('[[Nom:fiche_technique]]'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'fiche technique'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = '[[Nom:fiche_technique]]') THEN titres_gardes := titres_gardes || 'fiche technique'::TEXT; END IF;
  -- ── food cost ──
  t := $k195_11$[[Le:food_cost]] (ratio [[de:cout_matiere]]) = [[nom:cout_matiere]] ÷ chiffre d'affaires, en %. Repères LabFlow : moins de 30% = [[acc:food_cost:sain:saine]], 30 à 40% = à surveiller, plus de 40% = [[acc:food_cost:élevé:élevée]] (revoir prix ou [[nom:portion:pl]]). Plus [[acc:food_cost:il:elle]] est [[acc:food_cost:bas:basse]], plus [[le:marge]] est [[acc:marge:élevé:élevée]].$k195_11$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Food cost' THEN '[[Nom:food_cost]]' ELSE titre END
  WHERE lower(titre) = 'food cost'
    AND md5(replace(contenu, E'\r', '')) = 'b280c423295a5ffec304f64a43b14ed9';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('food cost', lower('[[Nom:food_cost]]'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'food cost'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = '[[Nom:food_cost]]') THEN titres_gardes := titres_gardes || 'food cost'::TEXT; END IF;
  -- ── fournisseur ──
  t := $k195_12$[[Un:fournisseur]] est un partenaire d'approvisionnement du compte (nom, adresse, téléphone). Chaque ligne [[de:appro:court]] peut être rattachée à [[un:fournisseur]] et à une référence de facture. [[Le:fournisseur:pl]] sont [[acc:fournisseur:partagé:partagée:pl]] au niveau du compte et affectables [[au:activite:pl]]. [[Un:fournisseur]] système « AUTO » est [[acc:fournisseur:rattaché:rattachée]] automatiquement aux mouvements [[de:stock]] créés lors des productions [[de:pt:pl]], avec une référence automatique (initiales [[du:produit]] + année).$k195_12$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Fournisseur' THEN '[[Nom:fournisseur]]' ELSE titre END
  WHERE lower(titre) = 'fournisseur'
    AND md5(replace(contenu, E'\r', '')) = '48391a266c7574caa53ac4e467feefb3';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('fournisseur', lower('[[Nom:fournisseur]]'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'fournisseur'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = '[[Nom:fournisseur]]') THEN titres_gardes := titres_gardes || 'fournisseur'::TEXT; END IF;
  -- ── gérant ──
  t := $k195_13$[[Un:gerant]] est un utilisateur délégué, rattaché à un compte client et affecté à [[acc:activite:un:une]] ou plusieurs [[nom:activite:pl]] et/ou [[nom:labo:pl]]. [[acc:gerant:Il:Elle]] ne voit et ne gère que le périmètre qui lui est assigné. [[acc:gerant:Il:Elle]] consulte/saisit [[le:stock]], [[le:appro:pl:court]], [[le:perte:pl]] de [[son:activite:pl]]/[[nom:labo:pl]].$k195_13$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Gérant' THEN '[[Nom:gerant]]' ELSE titre END
  WHERE lower(titre) = 'gérant'
    AND md5(replace(contenu, E'\r', '')) = 'b399b6fdfcd2158b367992e2c628da51';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('gérant', lower('[[Nom:gerant]]'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'gérant'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = '[[Nom:gerant]]') THEN titres_gardes := titres_gardes || 'gérant'::TEXT; END IF;
  -- ── inventaire ──
  t := $k195_14$[[Le:inventaire]] est le comptage réel des quantités en [[nom:stock]] à une date. L'écart entre [[le:stock]] théorique et [[le:stock]] [[acc:stock:compté:comptée]] révèle [[un:perte:pl]] non [[acc:perte:déclaré:déclarée:pl]], des erreurs de saisie ou du gaspillage. [[Le:inventaire]] sert aussi de point de départ au calcul du prix moyen pondéré : le PMP TTC est calculé sur les entrées enregistrées depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]].$k195_14$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Inventaire' THEN '[[Nom:inventaire]]' ELSE titre END
  WHERE lower(titre) = 'inventaire'
    AND md5(replace(contenu, E'\r', '')) = 'e281f894c4477b208a00a6a640fb29be';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('inventaire', lower('[[Nom:inventaire]]'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'inventaire'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = '[[Nom:inventaire]]') THEN titres_gardes := titres_gardes || 'inventaire'::TEXT; END IF;
  -- ── labo central ──
  t := $k195_15$[[Le:labo]] ([[nom:labo_long]][[acc:labo_long: central:]]) est l'unité de production d'un compte client ; un compte peut en avoir zéro, [[acc:labo:un:une]] ou plusieurs. [[acc:labo:Il:Elle]] détient [[acc:stock:son propre:sa propre]] [[nom:stock]] [[de:article_ingredient:pl]], fabrique [[det:pt:un:pl]][[avecCourt:pt:pl]] et approvisionne [[le:activite:pl]] via [[un:transfert:pl]]. [[Le:stock]] [[du:labo]] est [[acc:stock:distinct:distincte]] [[du:stock]] [[du:activite:pl]].$k195_15$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Labo central' THEN '[[Nom:labo]][[acc:labo: central:]]' ELSE titre END
  WHERE lower(titre) = 'labo central'
    AND md5(replace(contenu, E'\r', '')) = '8e173130a3042a197373bb5bddcd59c8';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('labo central', lower('[[Nom:labo]][[acc:labo: central:]]'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'labo central'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = '[[Nom:labo]][[acc:labo: central:]]') THEN titres_gardes := titres_gardes || 'labo central'::TEXT; END IF;
  -- ── marge brute ──
  t := $k195_16$[[Le:marge]] [[acc:marge:brut:brute]] = chiffre d'affaires − [[nom:cout_matiere]]. Le taux [[de:marge]] = [[nom:marge]] ÷ CA. C'est ce qui reste après le coût [[du:ingredient:pl]] pour couvrir les charges.$k195_16$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Marge brute' THEN '[[Nom:marge]] [[acc:marge:brut:brute]]' ELSE titre END
  WHERE lower(titre) = 'marge brute'
    AND md5(replace(contenu, E'\r', '')) = '56fd5b85c2c11154eeab1c938e76eef0';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('marge brute', lower('[[Nom:marge]] [[acc:marge:brut:brute]]'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'marge brute'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = '[[Nom:marge]] [[acc:marge:brut:brute]]') THEN titres_gardes := titres_gardes || 'marge brute'::TEXT; END IF;
  -- ── mode de prix d'une fiche technique ──
  t := $k195_17$Le coût d'[[un:fiche_technique]] peut être calculé selon plusieurs modes de prix [[du:ingredient:pl]] : le dernier prix d'achat (DP), la moyenne des prix [[du:stock]] (MP : prix moyen pondéré TTC calculé depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]]), ou des prix saisis manuellement (simulation). DP et MP peuvent être affichés ensemble pour comparaison. Tous les prix sont en TTC. Cela permet de simuler le coût de revient selon différents scénarios d'achat.$k195_17$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Mode de prix d''une fiche technique' THEN 'Mode de prix d''[[un:fiche_technique]]' ELSE titre END
  WHERE lower(titre) = 'mode de prix d''une fiche technique'
    AND md5(replace(contenu, E'\r', '')) = '7701a14d6a49e40a8a77854762bb601c';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('mode de prix d''une fiche technique', lower('Mode de prix d''[[un:fiche_technique]]'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'mode de prix d''une fiche technique'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = 'Mode de prix d''[[un:fiche_technique]]') THEN titres_gardes := titres_gardes || 'mode de prix d''une fiche technique'::TEXT; END IF;
  -- ── panier moyen ──
  t := $k195_18$Le panier moyen = chiffre d'affaires ÷ nombre [[de:vente:pl]]. Il indique le montant moyen dépensé par transaction.$k195_18$;
  UPDATE ai_knowledge_base SET
    contenu = t
  WHERE lower(titre) = 'panier moyen'
    AND md5(replace(contenu, E'\r', '')) = '9781827300cf5677bccd53bbc73cedde';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('panier moyen')
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'panier moyen'::TEXT;
  END IF;
  -- ── pertes ──
  t := $k195_19$[[Un:perte]] est une sortie [[de:stock]] non vendue : avarie ([[nom:produit]] [[acc:produit:abîmé:abîmée]] ou [[acc:produit:périmé:périmée]]) ou déchet (épluchures, casse). [[Le:perte:pl]] réduisent [[le:stock]] et la rentabilité. On les suit par type et par catégorie.$k195_19$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Pertes' THEN '[[Nom:perte:pl]]' ELSE titre END
  WHERE lower(titre) = 'pertes'
    AND md5(replace(contenu, E'\r', '')) = '0cc269066e1a9fe4e6d06f0534f77c68';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('pertes', lower('[[Nom:perte:pl]]'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'pertes'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = '[[Nom:perte:pl]]') THEN titres_gardes := titres_gardes || 'pertes'::TEXT; END IF;
  -- ── prestataire de livraison ──
  t := $k195_20$[[Un:prestataire]] de livraison (ex : Uber Eats, Talabat, Glovo) est une plateforme tierce via laquelle [[un:vente:pl]] sont [[acc:vente:réalisé:réalisée:pl]], avec une commission en pourcentage. [[Le:prestataire:pl]] sont [[acc:prestataire:activé:activée:pl]] au niveau du compte et le canal de vente "[[nom:prestataire]]" s'oppose [[au:vente]] "[[acc:vente:direct:directe]]".$k195_20$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Prestataire de livraison' THEN '[[Nom:prestataire]] de livraison' ELSE titre END
  WHERE lower(titre) = 'prestataire de livraison'
    AND md5(replace(contenu, E'\r', '')) = '8c76a80bc585a5a7aae96dc84e88b0c1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('prestataire de livraison', lower('[[Nom:prestataire]] de livraison'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'prestataire de livraison'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = '[[Nom:prestataire]] de livraison') THEN titres_gardes := titres_gardes || 'prestataire de livraison'::TEXT; END IF;
  -- ── produit transformé (pt) ──
  t := $k195_21$[[Det:pt:un]][[avecCourt:pt]] est [[acc:pt:fabriqué:fabriquée]] à partir d'[[un:recette]] [[de:ingredient:pl]] et éventuellement d'autres [[court:pt:pl]], [[au:labo]] ou directement sur [[un:activite]] selon son origine. Sa production déduit automatiquement [[du:stock]] du site de production [[le:ingredient:pl]] ET les sous-PT [[du:recette]], et crée [[un:stock]] [[de:pt:pl:court]] [[acc:stock:valorisé:valorisée]] au coût TTC [[du:recette]] (sans TVA supplémentaire, les prix [[du:ingredient:pl]] étant déjà en TTC). [[Le:pt:pl:court]] se répartissent en trois catégories : Utilisables ([[acc:pt:intégré:intégrée:pl]] dans d'autres [[nom:produit:pl]]), Vendables ([[acc:pt:vendu:vendue:pl]] au client final) et [[acc:pt:Composés Valorisés:Composées Valorisées]] ([[acc:pt:fabriqué:fabriquée:pl]] [[au:labo]] et [[acc:pt:vendu:vendue:pl]] [[acc:pt:tel:telle:pl]] [[acc:pt:quel:quelle:pl]]). Les mouvements de production sont rattachés [[au:fournisseur]] AUTO avec une référence automatique (initiales [[du:produit]] + année). [[Un:pt:court]] [[acc:pt:fabriqué:fabriquée]] [[au:labo]] arrive dans [[le:activite:pl]] uniquement par [[nom:transfert]].$k195_21$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Produit transformé (PT)' THEN '[[Nom:pt]] ([[court:pt]])' ELSE titre END
  WHERE lower(titre) = 'produit transformé (pt)'
    AND md5(replace(contenu, E'\r', '')) = '028707888d6e824dd23eaaa5e3052f97';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('produit transformé (pt)', lower('[[Nom:pt]] ([[court:pt]])'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'produit transformé (pt)'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = '[[Nom:pt]] ([[court:pt]])') THEN titres_gardes := titres_gardes || 'produit transformé (pt)'::TEXT; END IF;
  -- ── produits vendables et utilisables ──
  t := $k195_22$[[Un:produit]] VENDABLE est [[acc:produit:vendu:vendue]] au client final (a un prix de vente) ; [[acc:produit:il:elle]] peut en option être [[acc:produit:géré:gérée]] en [[nom:stock]]. [[Un:produit]] UTILISABLE (sous-produit) est [[acc:produit:fabriqué:fabriquée]] puis [[acc:produit:intégré:intégrée]] dans d'autres [[nom:produit:pl]] ; [[acc:produit:il:elle]] est [[acc:produit:mis:mise]] en [[nom:stock]] et [[acc:produit:géré:gérée]] comme [[un:article_ingredient]]. [[Le:pt:pl]] se répartissent en trois catégories : Utilisables, Vendables et [[acc:pt:Composés Valorisés:Composées Valorisées]].$k195_22$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Produits vendables et utilisables' THEN '[[Pl:produit]] vendables et utilisables' ELSE titre END
  WHERE lower(titre) = 'produits vendables et utilisables'
    AND md5(replace(contenu, E'\r', '')) = '35b5ad3dcbf514e0eb472c0e7619e940';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('produits vendables et utilisables', lower('[[Pl:produit]] vendables et utilisables'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'produits vendables et utilisables'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = '[[Pl:produit]] vendables et utilisables') THEN titres_gardes := titres_gardes || 'produits vendables et utilisables'::TEXT; END IF;
  -- ── rapport (excel / pdf) ──
  t := $k195_23$L'agent peut générer et envoyer par email un rapport Excel ou PDF récapitulant [[le:stock]], [[le:perte:pl]], [[le:inventaire:pl]] et [[le:transfert:pl]] du client. Le client peut le demander explicitement (ex : « envoie-moi le rapport Excel ») et l'agent peut aussi proposer de l'envoyer par email.$k195_23$;
  UPDATE ai_knowledge_base SET
    contenu = t
  WHERE lower(titre) = 'rapport (excel / pdf)'
    AND md5(replace(contenu, E'\r', '')) = 'df95117206919ff0cc32b1ee557366b0';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('rapport (excel / pdf)')
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'rapport (excel / pdf)'::TEXT;
  END IF;
  -- ── référentiel articles ──
  t := $k195_24$[[Le:referentiel]] regroupe [[le:article:pl]]/[[nom:article_ingredient:pl]] du client avec leur unité, leur famille/catégorie et leur prix de référence. C'est la base à partir de laquelle on construit [[le:stock]], [[le:fiche_technique:pl]] et [[le:vente:pl]].$k195_24$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Référentiel articles' THEN '[[Nom:referentiel]] [[nom:article:pl]]' ELSE titre END
  WHERE lower(titre) = 'référentiel articles'
    AND md5(replace(contenu, E'\r', '')) = '6d508edd4b479aab3536a341a932a357';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('référentiel articles', lower('[[Nom:referentiel]] [[nom:article:pl]]'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'référentiel articles'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = '[[Nom:referentiel]] [[nom:article:pl]]') THEN titres_gardes := titres_gardes || 'référentiel articles'::TEXT; END IF;
  -- ── seuil minimum ──
  t := $k195_25$Le seuil minimum est la quantité plancher d'[[un:article]] ou d'[[un:pt]]. Il se définit séparément par [[nom:activite]] et par [[nom:labo]] : chaque site a ses propres seuils. En dessous, [[le:article]] passe en alerte (à réapprovisionner). Sert à éviter les ruptures [[de:stock]].$k195_25$;
  UPDATE ai_knowledge_base SET
    contenu = t
  WHERE lower(titre) = 'seuil minimum'
    AND md5(replace(contenu, E'\r', '')) = 'f6e0357a8f5dadcfeef01029828eae49';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('seuil minimum')
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'seuil minimum'::TEXT;
  END IF;
  -- ── supplément ──
  t := $k195_26$[[Un:supplement]] est [[un:produit]] [[acc:produit:vendu:vendue]] en plus d'[[un:produit]] [[acc:produit:principal:principale]] et [[acc:produit:facturé:facturée]] séparément (ex : sauce, extra fromage). [[acc:supplement:Il:Elle]] a sa propre catégorie de type "[[nom:supplement]]" et entre dans le calcul du chiffre d'affaires.$k195_26$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Supplément' THEN '[[Nom:supplement]]' ELSE titre END
  WHERE lower(titre) = 'supplément'
    AND md5(replace(contenu, E'\r', '')) = 'cd3624d3d99d8cf25b7112dd197645ce';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('supplément', lower('[[Nom:supplement]]'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'supplément'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = '[[Nom:supplement]]') THEN titres_gardes := titres_gardes || 'supplément'::TEXT; END IF;
  -- ── timbre fiscal ──
  t := $k195_27$Le timbre fiscal est une taxe fixe (1 DT en Tunisie) ajoutée au montant TTC d'une facture lorsqu'il s'applique. Il est suivi par LabFlow sur les factures [[de:appro]].$k195_27$;
  UPDATE ai_knowledge_base SET
    contenu = t
  WHERE lower(titre) = 'timbre fiscal'
    AND md5(replace(contenu, E'\r', '')) = 'c899030935fd2de44b20b2de926cae9a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('timbre fiscal')
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'timbre fiscal'::TEXT;
  END IF;
  -- ── transferts ──
  t := $k195_28$[[Un:transfert]] déplace [[du:stock]] [[det:labo:du]][[MAJ:labo]] (production centrale) vers [[det:activite:un]][[MAJ:activite]] ([[nom:activite_desc]]). [[Le:labo]] s'approvisionne en gros puis alimente [[le:activite:pl]]. C'est la seule voie [[de:appro]] [[du:activite:pl]] en [[nom:pt:pl]] d'origine [[nom:labo]].$k195_28$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Transferts' THEN '[[Nom:transfert:pl]]' ELSE titre END
  WHERE lower(titre) = 'transferts'
    AND md5(replace(contenu, E'\r', '')) = '4c41172452ec69f7f72d2f711a36b533';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('transferts', lower('[[Nom:transfert:pl]]'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'transferts'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = '[[Nom:transfert:pl]]') THEN titres_gardes := titres_gardes || 'transferts'::TEXT; END IF;
  -- ── tva (ht / ttc) ──
  t := $k195_29$Les prix d'achat sont saisis HT (hors taxe) avec un taux de TVA ; le TTC = HT × (1 + TVA). LabFlow affiche les valeurs en TTC partout : coûts, [[nom:stock:pl]], rapports et tableaux de bord. [[Le:pt:pl]] sont [[acc:pt:valorisé:valorisée:pl]] en TTC avec une TVA à 0 (leur coût intègre déjà les prix TTC [[du:ingredient:pl]]).$k195_29$;
  UPDATE ai_knowledge_base SET
    contenu = t
  WHERE lower(titre) = 'tva (ht / ttc)'
    AND md5(replace(contenu, E'\r', '')) = 'ff5c7c504c87dd99a195641600f195ee';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('tva (ht / ttc)')
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'tva (ht / ttc)'::TEXT;
  END IF;
  -- ── unité de mesure ──
  t := $k195_30$Chaque [[nom:article]] a une unité de mesure (kg, L, pièce, g…) utilisée pour [[le:stock]], [[le:portion:pl]] [[du:fiche_technique:pl]] et les prix unitaires. Les unités sont propres à chaque client.$k195_30$;
  UPDATE ai_knowledge_base SET
    contenu = t
  WHERE lower(titre) = 'unité de mesure'
    AND md5(replace(contenu, E'\r', '')) = 'f59437b5d737575e10f8c94cf2f7bf00';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('unité de mesure')
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'unité de mesure'::TEXT;
  END IF;
  -- ── valeur du stock ──
  t := $k195_31$La valeur [[du:stock]] = somme (quantité en [[nom:stock]] × prix moyen pondéré TTC) de chaque [[nom:article]] à une date donnée. Elle représente l'argent immobilisé en marchandises. Toutes les valeurs [[de:stock]] affichées dans LabFlow sont en TTC.$k195_31$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Valeur du stock' THEN 'Valeur [[du:stock]]' ELSE titre END
  WHERE lower(titre) = 'valeur du stock'
    AND md5(replace(contenu, E'\r', '')) = '381b323a586c8d6dc4b30b41fdb752ee';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('valeur du stock', lower('Valeur [[du:stock]]'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'valeur du stock'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = 'Valeur [[du:stock]]') THEN titres_gardes := titres_gardes || 'valeur du stock'::TEXT; END IF;
  -- ── vente ──
  t := $k195_32$[[Un:vente]] est une transaction enregistrée sur [[un:activite]], à une date, avec un statut (confirmée/annulée) et un canal : directe (sur place) ou via [[un:prestataire]] de livraison. Chaque [[nom:vente]] contient des lignes (article vendu, quantité, prix de vente, [[nom:cout_matiere]] unitaire). Le chiffre d'affaires (CA) est la somme des prix de vente.$k195_32$;
  UPDATE ai_knowledge_base SET
    contenu = t,
    titre = CASE WHEN titre = 'Vente' THEN '[[Nom:vente]]' ELSE titre END
  WHERE lower(titre) = 'vente'
    AND md5(replace(contenu, E'\r', '')) = 'b5187c276f85b1754a72265c88efc0c2';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN balisees := balisees + 1;
  ELSIF EXISTS (SELECT 1 FROM ai_knowledge_base WHERE lower(titre) IN ('vente', lower('[[Nom:vente]]'))
                  AND md5(replace(contenu, E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'vente'::TEXT;
  END IF;
  IF n = 1 AND NOT EXISTS (SELECT 1 FROM ai_knowledge_base WHERE titre = '[[Nom:vente]]') THEN titres_gardes := titres_gardes || 'vente'::TEXT; END IF;
  RAISE NOTICE '195 : % entrée(s) balisée(s), % déjà balisée(s), % gardée(s) : % ; titres gardés : % ; sans terme : %',
    balisees, deja, cardinality(gardees),
    COALESCE(NULLIF(array_to_string(gardees, ', '), ''), 'aucune'),
    COALESCE(NULLIF(array_to_string(titres_gardes, ', '), ''), 'aucun'),
    'aucune';
END
$k195$;
