-- Refonte Espace Produits : enrichit la base de connaissances IA avec les nouveaux concepts
-- (origine labo/activité, Produits Labo / PU Labo / Produits Activité / PU Activité, règle transfert-only).
-- Sans ça, l'agent Messenger/Telegram continuerait de décrire l'ancien modèle.

INSERT INTO ai_knowledge_base (titre, contenu, mots_cles, categorie) VALUES
('Origine d''un produit (labo ou activité)',
 $$Chaque produit a une ORIGINE. Origine ACTIVITÉ : le produit est créé au niveau d'une ou plusieurs activités ; sa recette n'utilise que les articles consommables affectés à ces activités. Origine LABO : le produit est créé au niveau d'un ou plusieurs labos ; sa recette n'utilise que les articles consommables affectés à ces labos. L'origine détermine quels articles sont proposés à la création et comment le produit circule (transfert ou non).$$,
 $$origine produit, produit labo, produit activite, perimetre, articles consommables, intersection$$, 'concept'),
('Produit Labo',
 $$Un Produit Labo est un produit VENDABLE fabriqué au labo. Cycle : on l'approvisionne au labo (la fabrication déstocke les articles du labo selon les portions de la recette), puis on le transfère vers les activités rattachées au labo (le transfert déstocke le PT du labo et stocke le PT de l'activité), enfin il est vendu à l'activité comme produit VALORISÉ (déstockage direct du PT à la vente). Côté activité il s'approvisionne UNIQUEMENT par transfert : pas d'appro manuel. Il apparaît sous les produits transformés du labo et des activités liées.$$,
 $$produit labo, produit transforme labo, valorise labo, transfert, fabrication labo, vente valorise$$, 'process'),
('Produit Utilisable Labo (PU Labo)',
 $$Un Produit Utilisable Labo (PU Labo) est un sous-produit fabriqué au labo à partir des articles du labo, destiné à être intégré dans d'autres produits. Il apparaît sous les produits transformés du labo et des activités rattachées, mais côté activité il s'approvisionne uniquement par transfert (pas d'appro manuel).$$,
 $$pu labo, produit utilisable labo, sous-produit labo, transfert$$, 'process'),
('Produit Activité',
 $$Un Produit Activité est un produit vendable créé au niveau d'une ou plusieurs activités. Sa recette n'utilise que les articles consommables affectés à ces activités (et, à l'étape produits utilisables, les PU des activités choisies ainsi que les PU des labos liés). Vendu via sa recette : à la vente, le stock des articles de l'activité est déduit. C'est la "vente produits" ; un supplément (exactement 1 élément) est une "vente suppléments".$$,
 $$produit activite, vente produits, recette activite, supplement$$, 'process'),
('Produit Utilisable Activité (PU Activité)',
 $$Un Produit Utilisable Activité (PU Activité) est un sous-produit créé au niveau d'une ou plusieurs activités, à partir des articles consommables de ces activités. Il est dédié aux activités : il NE peut PAS être transféré depuis un labo. Il apparaît sous les produits transformés des activités concernées.$$,
 $$pu activite, produit utilisable activite, sous-produit activite, pas de transfert$$, 'process'),
('Réception en activité : transfert uniquement',
 $$Les Produits Labo et PU Labo s'approvisionnent en activité UNIQUEMENT par transfert depuis le labo. On ne peut pas créer d'appro manuel pour ces produits côté activité. Seuls les PU Activité (dédiés activité) se fabriquent localement. Au labo, la fabrication d'un produit labo déstocke ses articles selon les portions.$$,
 $$transfert uniquement, pas appro manuel, reception activite, fabrication labo$$, 'regle')
ON CONFLICT ((lower(titre))) DO UPDATE
  SET contenu = EXCLUDED.contenu,
      mots_cles = EXCLUDED.mots_cles,
      categorie = EXCLUDED.categorie,
      updated_at = NOW();
