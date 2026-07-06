-- 144 : Base de connaissances IA — audit et mise à jour du contenu obsolète
-- (seed migration 118 antérieur aux évolutions : 3 catégories PT, HT/TTC, seuils
-- par activité, fin de la distinction indépendant/entreprise, onboarding DocuSeal...).
-- Ciblage par titre (index unique LOWER(titre)) : portable local/PROD.

UPDATE ai_knowledge_base SET contenu = 'La fiche technique est le coût détaillé d''un produit (recette). Elle additionne le coût de chaque ingrédient et sous-produit selon sa quantité. Le coût d''un ingrédient est calculé en prix TTC selon le mode choisi : prix moyen pondéré du stock (PMP TTC depuis le dernier inventaire), dernier prix d''achat, ou prix manuels saisis (simulation). Elle sert à connaître le coût de revient d''un produit et à fixer son prix de vente.', mots_cles = 'fiche technique, recette, cout de revient, cout detaille, formule, simulation prix, prix moyen pondere, pmp, ttc', updated_at = NOW()
WHERE LOWER(titre) = LOWER('Fiche technique');

UPDATE ai_knowledge_base SET contenu = 'La valeur du stock = somme (quantité en stock × prix moyen pondéré TTC) de chaque article à une date donnée. Elle représente l''argent immobilisé en marchandises. Toutes les valeurs de stock affichées dans LabFlow sont en TTC.', mots_cles = 'valeur stock, valeur du stock, stock valorise, argent immobilise, ttc, pmp', updated_at = NOW()
WHERE LOWER(titre) = LOWER('Valeur du stock');

UPDATE ai_knowledge_base SET contenu = 'Un approvisionnement (appro) est une entrée de stock : un achat d''ingrédient avec quantité, prix unitaire saisi HT + taux de TVA (affiché en TTC) et fournisseur. Les appros alimentent le stock et mettent à jour le prix moyen pondéré (PMP TTC). Les produits transformés d''origine labo ne s''approvisionnent pas directement côté activité : ils arrivent uniquement par transfert depuis le labo.', mots_cles = 'appro, approvisionnement, achat, entree stock, fournisseur, ht, tva, ttc, pmp', updated_at = NOW()
WHERE LOWER(titre) = LOWER('Approvisionnement (appro)');

UPDATE ai_knowledge_base SET contenu = 'L''inventaire est le comptage réel des quantités en stock à une date. L''écart entre le stock théorique et le stock compté révèle des pertes non déclarées, des erreurs de saisie ou du gaspillage. L''inventaire sert aussi de point de départ au calcul du prix moyen pondéré : le PMP TTC est calculé sur les entrées enregistrées depuis le dernier inventaire.', mots_cles = 'inventaire, comptage, ecart stock, stock theorique, pmp, prix moyen pondere', updated_at = NOW()
WHERE LOWER(titre) = LOWER('Inventaire');

UPDATE ai_knowledge_base SET contenu = 'Un transfert déplace du stock du LABO (production centrale) vers une ACTIVITÉ (point de vente). Le labo s''approvisionne en gros puis alimente les activités. C''est la seule voie d''approvisionnement des activités en produits transformés d''origine labo.', mots_cles = 'transfert, transferts, labo vers activite, approvisionnement interne, pt', updated_at = NOW()
WHERE LOWER(titre) = LOWER('Transferts');

UPDATE ai_knowledge_base SET contenu = 'Un produit valorisé (anciennement « article valorisé ») est vendu tel quel, sans décomposition en ingrédients à la vente. Il peut être simple (un article déduit directement du stock à la vente) ou composé au labo (« composé valorisé » : sa fabrication au labo déduit les ingrédients de sa recette). On lui affecte une catégorie et un prix de vente.', mots_cles = 'produit valorise, article valorise, valorises, compose valorise, vente directe, non decompose', updated_at = NOW()
WHERE LOWER(titre) = LOWER('Article valorisé');

UPDATE ai_knowledge_base SET contenu = 'Un produit VENDABLE est vendu au client final (a un prix de vente) ; il peut en option être géré en stock. Un produit UTILISABLE (sous-produit) est fabriqué puis intégré dans d''autres produits ; il est mis en stock et géré comme un ingrédient. Les produits transformés se répartissent en trois catégories : Utilisables, Vendables et Composés Valorisés.', mots_cles = 'produit vendable, produit utilisable, sous-produit, supplement, compose valorise, categories pt, stock vendable', updated_at = NOW()
WHERE LOWER(titre) = LOWER('Produits vendables et utilisables');

UPDATE ai_knowledge_base SET contenu = 'Le seuil minimum est la quantité plancher d''un article ou d''un produit transformé. Il se définit séparément par activité et par labo : chaque site a ses propres seuils. En dessous, l''article passe en alerte (à réapprovisionner). Sert à éviter les ruptures de stock.', mots_cles = 'seuil minimum, seuil, alerte stock, rupture, plancher, par activite, par labo', updated_at = NOW()
WHERE LOWER(titre) = LOWER('Seuil minimum');

UPDATE ai_knowledge_base SET contenu = 'Les prix d''achat sont saisis HT (hors taxe) avec un taux de TVA ; le TTC = HT × (1 + TVA). LabFlow affiche les valeurs en TTC partout : coûts, stocks, rapports et tableaux de bord. Les produits transformés sont valorisés en TTC avec une TVA à 0 (leur coût intègre déjà les prix TTC des ingrédients).', mots_cles = 'tva, ht, ttc, hors taxe, taxe, affichage ttc', updated_at = NOW()
WHERE LOWER(titre) = LOWER('TVA (HT / TTC)');

UPDATE ai_knowledge_base SET contenu = 'Une activité est un point de vente du client (restaurant, café, kiosque…). Elle a son propre stock, ses approvisionnements, ses ventes et ses pertes. Un compte client gère une ou plusieurs activités (et éventuellement un ou plusieurs labos), sans distinction de type de compte. Les données peuvent être filtrées par activité.', mots_cles = 'activite, activites, point de vente, restaurant, cafe, branche, etablissement, compte client', updated_at = NOW()
WHERE LOWER(titre) = LOWER('Activité (point de vente)');

UPDATE ai_knowledge_base SET contenu = 'Le labo (laboratoire central) est l''unité de production d''un compte client ; un compte peut en avoir zéro, un ou plusieurs. Il détient son propre stock d''ingrédients, fabrique des produits transformés (PT) et approvisionne les activités via des transferts. Le stock du labo est distinct du stock des activités.', mots_cles = 'labo, laboratoire, labo central, production, cuisine centrale, transfert vers activite', updated_at = NOW()
WHERE LOWER(titre) = LOWER('Labo central');

UPDATE ai_knowledge_base SET contenu = 'Un gérant est un utilisateur délégué, rattaché à un compte client et affecté à une ou plusieurs activités et/ou labos. Il ne voit et ne gère que le périmètre qui lui est assigné. Il consulte/saisit le stock, les appros, les pertes de ses activités/labos.', mots_cles = 'gerant, gerants, delegue, responsable, affectation, perimetre', updated_at = NOW()
WHERE LOWER(titre) = LOWER('Gérant');

UPDATE ai_knowledge_base SET contenu = 'Un fournisseur est un partenaire d''approvisionnement du compte (nom, adresse, téléphone). Chaque ligne d''appro peut être rattachée à un fournisseur et à une référence de facture. Les fournisseurs sont partagés au niveau du compte et affectables aux activités. Un fournisseur système « AUTO » est rattaché automatiquement aux mouvements de stock créés lors des productions de produits transformés, avec une référence automatique (initiales du produit + année).', mots_cles = 'fournisseur, fournisseurs, achat, appro, facture, partenaire, auto, tracabilite', updated_at = NOW()
WHERE LOWER(titre) = LOWER('Fournisseur');

UPDATE ai_knowledge_base SET contenu = 'L''abonnement définit la capacité souscrite du client : nombre d''activités, de labos et de gérants, plus le forfait mensuel et l''onboarding. À la création du compte, le client reçoit d''abord le contrat à signer électroniquement (DocuSeal) ; l''email d''activation n''est envoyé qu''après signature. Le mode du compte (actif, lecture seule, désactivé) dépend du paiement. Augmenter la capacité se fait via un avenant signé électroniquement, appliqué automatiquement après signature.', mots_cles = 'abonnement, plan, capacite, forfait, mensuel, nb activites, nb labos, nb gerants, paiement, mode compte, avenant, contrat, docuseal, activation', updated_at = NOW()
WHERE LOWER(titre) = LOWER('Abonnement et capacité');

UPDATE ai_knowledge_base SET contenu = 'Un article vendable est un produit ou un article configuré à la vente sur une activité, avec un prix de vente et un statut actif. Il peut s''agir d''une fiche technique (produit vendable), d''un produit transformé vendable ou d''un produit valorisé. Les vendables peuvent en option être gérés en stock. Les prix de vente sont historisés à chaque modification.', mots_cles = 'article vendable, vendable, prix de vente, catalogue, carte, menu, configuration vente, pt vendable, produit valorise', updated_at = NOW()
WHERE LOWER(titre) = LOWER('Article vendable');

UPDATE ai_knowledge_base SET contenu = 'Un prestataire de livraison (ex : Uber Eats, Talabat, Glovo) est une plateforme tierce via laquelle des ventes sont réalisées, avec une commission en pourcentage. Les prestataires sont activés au niveau du compte et le canal de vente "prestataire" s''oppose à la vente "directe".', mots_cles = 'prestataire, livraison, uber eats, talabat, glovo, commission, plateforme, canal', updated_at = NOW()
WHERE LOWER(titre) = LOWER('Prestataire de livraison');

UPDATE ai_knowledge_base SET contenu = 'Un produit transformé (PT) est fabriqué à partir d''une recette d''ingrédients et éventuellement d''autres PT, au labo ou directement sur une activité selon son origine. Sa production déduit automatiquement du stock du site de production les ingrédients ET les sous-PT de la recette, et crée un stock de PT valorisé au coût TTC de la recette (sans TVA supplémentaire, les prix des ingrédients étant déjà en TTC). Les PT se répartissent en trois catégories : Utilisables (intégrés dans d''autres produits), Vendables (vendus au client final) et Composés Valorisés (fabriqués au labo et vendus tels quels). Les mouvements de production sont rattachés au fournisseur AUTO avec une référence automatique (initiales du produit + année). Un PT fabriqué au labo arrive dans les activités uniquement par transfert.', mots_cles = 'produit transforme, pt, fabrication, production labo, recette, transformation, utilisable, vendable, compose valorise, sous-pt, auto', updated_at = NOW()
WHERE LOWER(titre) = LOWER('Produit transformé (PT)');

UPDATE ai_knowledge_base SET contenu = 'Le coût d''une fiche technique peut être calculé selon plusieurs modes de prix des ingrédients : le dernier prix d''achat (DP), la moyenne des prix du stock (MP : prix moyen pondéré TTC calculé depuis le dernier inventaire), ou des prix saisis manuellement (simulation). DP et MP peuvent être affichés ensemble pour comparaison. Tous les prix sont en TTC. Cela permet de simuler le coût de revient selon différents scénarios d''achat.', mots_cles = 'mode de prix, prix moyen pondere, pmp, moyenne des prix, dernier prix, prix manuel, simulation, cout de revient, fiche technique, ttc, dp, mp', updated_at = NOW()
WHERE LOWER(titre) = LOWER('Mode de prix d''une fiche technique');
