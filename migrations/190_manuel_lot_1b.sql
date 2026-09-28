-- 190 — Lot 1b : mise à jour du manuel (spec docs/lot-1b-spec.md §6).
-- REPLACE ciblés (contenu + contenu_defaut, pattern 172/182-186) sur 11 fiches existantes :
--   transferts, calc-transferts (labo → activités ET labos rattachés), stock-labo (multi-labo,
--   réceptions, production selon l'unité), activites (type d'unité, « Alimentée/Alimenté par »),
--   ventes-labo (destination), historique + factures (envois/réceptions), pertes (types selon le
--   domaine), dashboard (seuil coût matière selon le domaine, cessions labo→labo),
--   onboarding-suivi + assistant-ia (capacités par type d'unité, étapes cliquables).
-- Aucun nouveau slug. Idempotente : un REPLACE dont la cible est absente ne change rien.

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'Cet écran envoie les articles et les produits transformés (PT) du labo vers vos activités : le stock du labo diminue, celui de chaque activité de destination augmente d''autant.', 'Cet écran envoie les articles et les produits transformés (PT) du labo vers vos activités **et vers les labos qu''il alimente** (un économat vers une cuisine, par exemple) : le stock du labo diminue, celui de chaque destination augmente d''autant.'),
  contenu_defaut = REPLACE(contenu_defaut, 'Cet écran envoie les articles et les produits transformés (PT) du labo vers vos activités : le stock du labo diminue, celui de chaque activité de destination augmente d''autant.', 'Cet écran envoie les articles et les produits transformés (PT) du labo vers vos activités **et vers les labos qu''il alimente** (un économat vers une cuisine, par exemple) : le stock du labo diminue, celui de chaque destination augmente d''autant.'),
  updated_at = NOW()
WHERE slug = 'transferts';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'puis **une colonne de quantité par activité**.', 'puis **une colonne de quantité par destination** (activité ou labo rattaché).'),
  contenu_defaut = REPLACE(contenu_defaut, 'puis **une colonne de quantité par activité**.', 'puis **une colonne de quantité par destination** (activité ou labo rattaché).'),
  updated_at = NOW()
WHERE slug = 'transferts';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '2. Saisissez les quantités dans les colonnes des activités de destination ; ajustez le prix de cession si nécessaire.', '2. Saisissez les quantités dans les colonnes des destinations (activités ou labos rattachés) ; ajustez le prix de cession si nécessaire.'),
  contenu_defaut = REPLACE(contenu_defaut, '2. Saisissez les quantités dans les colonnes des activités de destination ; ajustez le prix de cession si nécessaire.', '2. Saisissez les quantités dans les colonnes des destinations (activités ou labos rattachés) ; ajustez le prix de cession si nécessaire.'),
  updated_at = NOW()
WHERE slug = 'transferts';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'récapitule les lignes groupées par activité (quantités, prix HT/TTC, totaux).', 'récapitule les lignes groupées par destination (quantités, prix HT/TTC, totaux).'),
  contenu_defaut = REPLACE(contenu_defaut, 'récapitule les lignes groupées par activité (quantités, prix HT/TTC, totaux).', 'récapitule les lignes groupées par destination (quantités, prix HT/TTC, totaux).'),
  updated_at = NOW()
WHERE slug = 'transferts';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '(filtres Du/Au, Activité, Catégorie)', '(filtres Du/Au, Destination, Catégorie)'),
  contenu_defaut = REPLACE(contenu_defaut, '(filtres Du/Au, Activité, Catégorie)', '(filtres Du/Au, Destination, Catégorie)'),
  updated_at = NOW()
WHERE slug = 'transferts';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'Un article ou un PT ne peut être transféré que vers une activité où il est **affecté** : sinon la case de quantité est remplacée par « — ».', 'Un article ou un PT ne peut être transféré que vers une destination (activité ou labo rattaché) où il est **affecté** : sinon la case de quantité est remplacée par « — ». Si aucune destination n''apparaît, rattachez d''abord vos activités ou labos à ce labo depuis [Activités & labos](#activites).'),
  contenu_defaut = REPLACE(contenu_defaut, 'Un article ou un PT ne peut être transféré que vers une activité où il est **affecté** : sinon la case de quantité est remplacée par « — ».', 'Un article ou un PT ne peut être transféré que vers une destination (activité ou labo rattaché) où il est **affecté** : sinon la case de quantité est remplacée par « — ». Si aucune destination n''apparaît, rattachez d''abord vos activités ou labos à ce labo depuis [Activités & labos](#activites).'),
  updated_at = NOW()
WHERE slug = 'transferts';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'Si un transfert existe déjà le même jour vers la même activité, une fenêtre de vérification', 'Si un transfert existe déjà le même jour vers la même destination, une fenêtre de vérification'),
  contenu_defaut = REPLACE(contenu_defaut, 'Si un transfert existe déjà le même jour vers la même activité, une fenêtre de vérification', 'Si un transfert existe déjà le même jour vers la même destination, une fenêtre de vérification'),
  updated_at = NOW()
WHERE slug = 'transferts';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'Côté activité, la réception apparaît dans le stock comme un approvisionnement de type « Transfert », avec le **labo comme fournisseur**, au prix de cession saisi.', 'Côté destination (activité ou labo rattaché), la réception apparaît dans le stock comme un approvisionnement de type « Transfert », avec le **labo source comme fournisseur**, au prix de cession saisi ; côté labo source, la sortie porte le badge « ↗ Transf. → destination ».'),
  contenu_defaut = REPLACE(contenu_defaut, 'Côté activité, la réception apparaît dans le stock comme un approvisionnement de type « Transfert », avec le **labo comme fournisseur**, au prix de cession saisi.', 'Côté destination (activité ou labo rattaché), la réception apparaît dans le stock comme un approvisionnement de type « Transfert », avec le **labo source comme fournisseur**, au prix de cession saisi ; côté labo source, la sortie porte le badge « ↗ Transf. → destination ».'),
  updated_at = NOW()
WHERE slug = 'transferts';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'Quand votre labo envoie des articles ou des produits transformés vers une activité, chaque ligne est valorisée', 'Quand votre labo envoie des articles ou des produits transformés vers une activité ou vers un labo qu''il alimente, chaque ligne est valorisée'),
  contenu_defaut = REPLACE(contenu_defaut, 'Quand votre labo envoie des articles ou des produits transformés vers une activité, chaque ligne est valorisée', 'Quand votre labo envoie des articles ou des produits transformés vers une activité ou vers un labo qu''il alimente, chaque ligne est valorisée'),
  updated_at = NOW()
WHERE slug = 'calc-transferts';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '- **Côté activité** : entrée de stock au nom du **fournisseur-labo**', '- **Côté destination** (activité ou labo rattaché) : entrée de stock au nom du **fournisseur-labo**'),
  contenu_defaut = REPLACE(contenu_defaut, '- **Côté activité** : entrée de stock au nom du **fournisseur-labo**', '- **Côté destination** (activité ou labo rattaché) : entrée de stock au nom du **fournisseur-labo**'),
  updated_at = NOW()
WHERE slug = 'calc-transferts';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'Pour un article, cette entrée alimente le **PMP de l''activité** exactement comme un achat fournisseur.', 'Pour un article, cette entrée alimente le **PMP de la destination** exactement comme un achat fournisseur — un labo alimenté par un autre labo fabrique donc ses produits transformés au coût réel des matières reçues.'),
  contenu_defaut = REPLACE(contenu_defaut, 'Pour un article, cette entrée alimente le **PMP de l''activité** exactement comme un achat fournisseur.', 'Pour un article, cette entrée alimente le **PMP de la destination** exactement comme un achat fournisseur — un labo alimenté par un autre labo fabrique donc ses produits transformés au coût réel des matières reçues.'),
  updated_at = NOW()
WHERE slug = 'calc-transferts';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '- Un produit transformé ne peut être transféré que vers une activité à laquelle il est **affecté** ; sinon le transfert est refusé.', '- Un produit transformé ne peut être transféré que vers une activité ou un labo rattaché auquel il est **affecté** ; sinon le transfert est refusé.'),
  contenu_defaut = REPLACE(contenu_defaut, '- Un produit transformé ne peut être transféré que vers une activité à laquelle il est **affecté** ; sinon le transfert est refusé.', '- Un produit transformé ne peut être transféré que vers une activité ou un labo rattaché auquel il est **affecté** ; sinon le transfert est refusé.'),
  updated_at = NOW()
WHERE slug = 'calc-transferts';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'Le prix de cession devient le coût d''entrée définitif côté activité :', 'Le prix de cession devient le coût d''entrée définitif côté destination (activité ou labo) :'),
  contenu_defaut = REPLACE(contenu_defaut, 'Le prix de cession devient le coût d''entrée définitif côté activité :', 'Le prix de cession devient le coût d''entrée définitif côté destination (activité ou labo) :'),
  updated_at = NOW()
WHERE slug = 'calc-transferts';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'une rangée de pastilles en haut de page permet de passer de l''un à l''autre.', 'une rangée de pastilles en haut de page permet de passer de l''un à l''autre — le menu latéral suit alors le labo affiché.'),
  contenu_defaut = REPLACE(contenu_defaut, 'une rangée de pastilles en haut de page permet de passer de l''un à l''autre.', 'une rangée de pastilles en haut de page permet de passer de l''un à l''autre — le menu latéral suit alors le labo affiché.'),
  updated_at = NOW()
WHERE slug = 'stock-labo';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'propose le bouton **↗ Transfert** vers l''écran d''envoi aux activités.', 'propose le bouton **↗ Transfert** vers l''écran d''envoi aux activités et aux labos rattachés.'),
  contenu_defaut = REPLACE(contenu_defaut, 'propose le bouton **↗ Transfert** vers l''écran d''envoi aux activités.', 'propose le bouton **↗ Transfert** vers l''écran d''envoi aux activités et aux labos rattachés.'),
  updated_at = NOW()
WHERE slug = 'stock-labo';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'les 5 derniers mouvements avec leur type : Manuel, Transfert, PT, Perte… |', 'les 5 derniers mouvements avec leur type : Manuel, Transfert (↗ envoyé ou ↙ reçu du labo qui vous alimente), PT, Perte… |'),
  contenu_defaut = REPLACE(contenu_defaut, 'les 5 derniers mouvements avec leur type : Manuel, Transfert, PT, Perte… |', 'les 5 derniers mouvements avec leur type : Manuel, Transfert (↗ envoyé ou ↙ reçu du labo qui vous alimente), PT, Perte… |'),
  updated_at = NOW()
WHERE slug = 'stock-labo';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '↑ appro, ⇄ transferts, ↘ pertes, consommation PT |', '↑ appro (achats et réceptions d''un labo source), ⇄ transferts, ↘ pertes, consommation PT |'),
  contenu_defaut = REPLACE(contenu_defaut, '↑ appro, ⇄ transferts, ↘ pertes, consommation PT |', '↑ appro (achats et réceptions d''un labo source), ⇄ transferts, ↘ pertes, consommation PT |'),
  updated_at = NOW()
WHERE slug = 'stock-labo';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'Produire un PT :' || chr(10) || chr(10) || '1. Saisissez', 'Produire un PT (labos de production uniquement — un labo configuré sans production, tel un économat, n''affiche pas de PT) :' || chr(10) || chr(10) || '1. Saisissez'),
  contenu_defaut = REPLACE(contenu_defaut, 'Produire un PT :' || chr(10) || chr(10) || '1. Saisissez', 'Produire un PT (labos de production uniquement — un labo configuré sans production, tel un économat, n''affiche pas de PT) :' || chr(10) || chr(10) || '1. Saisissez'),
  updated_at = NOW()
WHERE slug = 'stock-labo';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'puis quantité, type (Avarie ou Déchet) et date ;', 'puis quantité, type (selon votre domaine : Avarie ou Déchet par défaut) et date ;'),
  contenu_defaut = REPLACE(contenu_defaut, 'puis quantité, type (Avarie ou Déchet) et date ;', 'puis quantité, type (selon votre domaine : Avarie ou Déchet par défaut) et date ;'),
  updated_at = NOW()
WHERE slug = 'stock-labo';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '- [Transferts vers les activités](#transferts)', '- [Transferts vers les activités et labos rattachés](#transferts)'),
  contenu_defaut = REPLACE(contenu_defaut, '- [Transferts vers les activités](#transferts)', '- [Transferts vers les activités et labos rattachés](#transferts)'),
  updated_at = NOW()
WHERE slug = 'stock-labo';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'et labos utilisés / inclus si votre abonnement en prévoit.', 'et labos utilisés / inclus si votre abonnement en prévoit ; si votre domaine distingue plusieurs types d''unités (Restaurant, Bar, Cuisine, Économat…), la répartition par type s''affiche à titre indicatif et chaque fiche porte un badge de type.'),
  contenu_defaut = REPLACE(contenu_defaut, 'et labos utilisés / inclus si votre abonnement en prévoit.', 'et labos utilisés / inclus si votre abonnement en prévoit ; si votre domaine distingue plusieurs types d''unités (Restaurant, Bar, Cuisine, Économat…), la répartition par type s''affiche à titre indicatif et chaque fiche porte un badge de type.'),
  updated_at = NOW()
WHERE slug = 'activites';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'le *Labo* de rattachement (pastille 🏭 cliquable qui ouvre la fiche du labo)', 'le *Labo* qui l''alimente (pastille 🏭 cliquable qui ouvre la fiche du labo)'),
  contenu_defaut = REPLACE(contenu_defaut, 'le *Labo* de rattachement (pastille 🏭 cliquable qui ouvre la fiche du labo)', 'le *Labo* qui l''alimente (pastille 🏭 cliquable qui ouvre la fiche du labo)'),
  updated_at = NOW()
WHERE slug = 'activites';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'choisissez **Avec labo** (puis sélectionnez lequel) ou **Sans labo** (gestion autonome).', 'choisissez **Avec labo** (puis sélectionnez lequel : c''est le labo qui l''alimente) ou **Sans labo** (gestion autonome). Si votre domaine propose plusieurs types d''activités, choisissez aussi le **type** (Restaurant, Bar…) : il préconfigure la vente et la production de l''unité.'),
  contenu_defaut = REPLACE(contenu_defaut, 'choisissez **Avec labo** (puis sélectionnez lequel) ou **Sans labo** (gestion autonome).', 'choisissez **Avec labo** (puis sélectionnez lequel : c''est le labo qui l''alimente) ou **Sans labo** (gestion autonome). Si votre domaine propose plusieurs types d''activités, choisissez aussi le **type** (Restaurant, Bar…) : il préconfigure la vente et la production de l''unité.'),
  updated_at = NOW()
WHERE slug = 'activites';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '3. **Créer un labo** : nom, **référence unique** (demandée uniquement à la création), adresse ; vous pouvez cocher', '3. **Créer un labo** : nom, **référence unique** (demandée uniquement à la création), adresse, et le champ **Alimenté par** pour désigner un autre labo qui l''approvisionne (un économat alimente une cuisine, par exemple ; les boucles sont refusées) ; vous pouvez cocher'),
  contenu_defaut = REPLACE(contenu_defaut, '3. **Créer un labo** : nom, **référence unique** (demandée uniquement à la création), adresse ; vous pouvez cocher', '3. **Créer un labo** : nom, **référence unique** (demandée uniquement à la création), adresse, et le champ **Alimenté par** pour désigner un autre labo qui l''approvisionne (un économat alimente une cuisine, par exemple ; les boucles sont refusées) ; vous pouvez cocher'),
  updated_at = NOW()
WHERE slug = 'activites';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '4. **Modifier** une activité ou un labo avec ✏️ ; le rattachement au labo se change dans la même fenêtre.', '4. **Modifier** une activité ou un labo avec ✏️ ; le rattachement d''une activité (« Alimentée par ») ou la source d''un labo (« Alimenté par ») se change dans la même fenêtre.'),
  contenu_defaut = REPLACE(contenu_defaut, '4. **Modifier** une activité ou un labo avec ✏️ ; le rattachement au labo se change dans la même fenêtre.', '4. **Modifier** une activité ou un labo avec ✏️ ; le rattachement d''une activité (« Alimentée par ») ou la source d''un labo (« Alimenté par ») se change dans la même fenêtre.'),
  updated_at = NOW()
WHERE slug = 'activites';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'La suppression d''un labo fait passer ses activités en gestion séparée et met fin aux transferts depuis ce labo.', 'La suppression d''un labo fait passer ses activités en gestion séparée, retire leur source aux labos qu''il alimentait et met fin aux transferts depuis ce labo ; elle est refusée tant que ce labo a émis ou reçu des transferts.'),
  contenu_defaut = REPLACE(contenu_defaut, 'La suppression d''un labo fait passer ses activités en gestion séparée et met fin aux transferts depuis ce labo.', 'La suppression d''un labo fait passer ses activités en gestion séparée, retire leur source aux labos qu''il alimentait et met fin aux transferts depuis ce labo ; elle est refusée tant que ce labo a émis ou reçu des transferts.'),
  updated_at = NOW()
WHERE slug = 'activites';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'c''est le mode de fonctionnement recommandé quand vous produisez en central.', 'c''est le mode de fonctionnement recommandé quand vous produisez en central ; un labo peut lui aussi être alimenté par un autre labo : les articles reçus entrent à son stock au prix de cession et servent de base au coût de ses productions.'),
  contenu_defaut = REPLACE(contenu_defaut, 'c''est le mode de fonctionnement recommandé quand vous produisez en central.', 'c''est le mode de fonctionnement recommandé quand vous produisez en central ; un labo peut lui aussi être alimenté par un autre labo : les articles reçus entrent à son stock au prix de cession et servent de base au coût de ses productions.'),
  updated_at = NOW()
WHERE slug = 'activites';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '- [Transferts labo → activité](#transferts)', '- [Transferts labo → activités et labos rattachés](#transferts)'),
  contenu_defaut = REPLACE(contenu_defaut, '- [Transferts labo → activité](#transferts)', '- [Transferts labo → activités et labos rattachés](#transferts)'),
  updated_at = NOW()
WHERE slug = 'activites';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'correspond aux **transferts valorisés** vers vos activités — articles comme produits transformés', 'correspond aux **transferts valorisés** vers vos activités et vers les labos qu''il alimente — articles comme produits transformés'),
  contenu_defaut = REPLACE(contenu_defaut, 'correspond aux **transferts valorisés** vers vos activités — articles comme produits transformés', 'correspond aux **transferts valorisés** vers vos activités et vers les labos qu''il alimente — articles comme produits transformés'),
  updated_at = NOW()
WHERE slug = 'ventes-labo';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'et **Activité** destinataire ;', 'et **Destination** (activité 🏪 ou labo rattaché 🏭) ;'),
  contenu_defaut = REPLACE(contenu_defaut, 'et **Activité** destinataire ;', 'et **Destination** (activité 🏪 ou labo rattaché 🏭) ;'),
  updated_at = NOW()
WHERE slug = 'ventes-labo';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '*Article* (unité et date), *Activité*, *Qté*,', '*Article* (unité et date), *Destination*, *Qté*,'),
  contenu_defaut = REPLACE(contenu_defaut, '*Article* (unité et date), *Activité*, *Qté*,', '*Article* (unité et date), *Destination*, *Qté*,'),
  updated_at = NOW()
WHERE slug = 'ventes-labo';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'les filtres catégorie, article et activité s''appliquent, eux, instantanément.', 'les filtres catégorie, article et destination s''appliquent, eux, instantanément.'),
  contenu_defaut = REPLACE(contenu_defaut, 'les filtres catégorie, article et activité s''appliquent, eux, instantanément.', 'les filtres catégorie, article et destination s''appliquent, eux, instantanément.'),
  updated_at = NOW()
WHERE slug = 'ventes-labo';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '| Client | Consommateur final | Vos propres activités |', '| Client | Consommateur final | Vos propres activités et labos rattachés |'),
  contenu_defaut = REPLACE(contenu_defaut, '| Client | Consommateur final | Vos propres activités |', '| Client | Consommateur final | Vos propres activités et labos rattachés |'),
  updated_at = NOW()
WHERE slug = 'ventes-labo';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '| Date | date + badge du type : Manuel, Transfert, 💰 Vente, ↩️ Annul. vente, 🔄 PT |', '| Date | date + badge du type : Manuel, Transfert (côté labo : « ↗ Transf. → X » pour un envoi, « ↙ Reçu ← X » pour une réception depuis le labo qui vous alimente), 💰 Vente, ↩️ Annul. vente, 🔄 PT |'),
  contenu_defaut = REPLACE(contenu_defaut, '| Date | date + badge du type : Manuel, Transfert, 💰 Vente, ↩️ Annul. vente, 🔄 PT |', '| Date | date + badge du type : Manuel, Transfert (côté labo : « ↗ Transf. → X » pour un envoi, « ↙ Reçu ← X » pour une réception depuis le labo qui vous alimente), 💰 Vente, ↩️ Annul. vente, 🔄 PT |'),
  updated_at = NOW()
WHERE slug = 'historique';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '| Fourn. / Réf | fournisseur et n° de facture |', '| Fourn. / Réf | fournisseur et n° de facture (pour un transfert : la destination ou le labo source) |'),
  contenu_defaut = REPLACE(contenu_defaut, '| Fourn. / Réf | fournisseur et n° de facture |', '| Fourn. / Réf | fournisseur et n° de facture (pour un transfert : la destination ou le labo source) |'),
  updated_at = NOW()
WHERE slug = 'historique';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '2. Pour une ligne de type **Transfert**, le fournisseur (le labo) n''est pas modifiable, et un changement de quantité ajuste le stock du labo.', '2. Une ligne de type **Transfert** (envoi ou réception) ne se modifie ni ne se supprime ici : passez par l''**Historique Transferts** du labo émetteur ([Transferts](#transferts)), qui ajuste les deux stocks.'),
  contenu_defaut = REPLACE(contenu_defaut, '2. Pour une ligne de type **Transfert**, le fournisseur (le labo) n''est pas modifiable, et un changement de quantité ajuste le stock du labo.', '2. Une ligne de type **Transfert** (envoi ou réception) ne se modifie ni ne se supprime ici : passez par l''**Historique Transferts** du labo émetteur ([Transferts](#transferts)), qui ajuste les deux stocks.'),
  updated_at = NOW()
WHERE slug = 'historique';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '3. **🗑️ Supprimer** : le stock de l''article est recalculé ; pour un transfert, la quantité est restituée au stock du labo. L''action est **irréversible**.', '3. **🗑️ Supprimer** : le stock de l''article est recalculé. L''action est **irréversible**.'),
  contenu_defaut = REPLACE(contenu_defaut, '3. **🗑️ Supprimer** : le stock de l''article est recalculé ; pour un transfert, la quantité est restituée au stock du labo. L''action est **irréversible**.', '3. **🗑️ Supprimer** : le stock de l''article est recalculé. L''action est **irréversible**.'),
  updated_at = NOW()
WHERE slug = 'historique';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'Filtre supplémentaire **Type** (Avarie / Déchet), badges colorés par type,', 'Filtre supplémentaire **Type** (les types de perte de votre domaine : Avarie / Déchet par défaut), badges colorés par type,'),
  contenu_defaut = REPLACE(contenu_defaut, 'Filtre supplémentaire **Type** (Avarie / Déchet), badges colorés par type,', 'Filtre supplémentaire **Type** (les types de perte de votre domaine : Avarie / Déchet par défaut), badges colorés par type,'),
  updated_at = NOW()
WHERE slug = 'historique';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'l''écran labo ajoute un filtre **Activité** pour isoler les factures liées à une activité de destination.', 'l''écran labo ajoute un filtre **Destination / Origine** pour isoler les factures liées à une activité ou à un labo (transferts émis ou reçus).'),
  contenu_defaut = REPLACE(contenu_defaut, 'l''écran labo ajoute un filtre **Activité** pour isoler les factures liées à une activité de destination.', 'l''écran labo ajoute un filtre **Destination / Origine** pour isoler les factures liées à une activité ou à un labo (transferts émis ou reçus).'),
  updated_at = NOW()
WHERE slug = 'factures';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'badge **Manuel** ou **↗ Transfert**, et les montants', 'badge **Manuel**, **↗ Transfert émis → X** (cession vers une activité ou un labo rattaché) ou **↙ Transfert reçu ← X** (réception depuis le labo qui vous alimente), et les montants'),
  contenu_defaut = REPLACE(contenu_defaut, 'badge **Manuel** ou **↗ Transfert**, et les montants', 'badge **Manuel**, **↗ Transfert émis → X** (cession vers une activité ou un labo rattaché) ou **↙ Transfert reçu ← X** (réception depuis le labo qui vous alimente), et les montants'),
  updated_at = NOW()
WHERE slug = 'factures';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'Le badge « ↗ Transfert » signale une facture issue d''un transfert du labo : côté activité, le fournisseur affiché est alors le **labo lui-même**.', 'Les badges « ↗ Transfert émis » et « ↙ Transfert reçu » signalent une facture interne issue d''un transfert : côté destination (activité ou labo), le fournisseur affiché est alors le **labo source lui-même**.'),
  contenu_defaut = REPLACE(contenu_defaut, 'Le badge « ↗ Transfert » signale une facture issue d''un transfert du labo : côté activité, le fournisseur affiché est alors le **labo lui-même**.', 'Les badges « ↗ Transfert émis » et « ↙ Transfert reçu » signalent une facture interne issue d''un transfert : côté destination (activité ou labo), le fournisseur affiché est alors le **labo source lui-même**.'),
  updated_at = NOW()
WHERE slug = 'factures';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '### Les deux types de perte', '### Les types de perte'),
  contenu_defaut = REPLACE(contenu_defaut, '### Les deux types de perte', '### Les types de perte'),
  updated_at = NOW()
WHERE slug = 'pertes';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '| **Déchet** | pertes de production, parures, casse |' || chr(10), '| **Déchet** | pertes de production, parures, casse (domaine Restauration) |' || chr(10) || chr(10) || 'Un autre domaine d''activité peut définir ses propres types de perte (par exemple *casse* ou *rebut*) : ce sont alors ceux-là qui apparaissent dans la fenêtre de saisie, les filtres et les badges.' || chr(10)),
  contenu_defaut = REPLACE(contenu_defaut, '| **Déchet** | pertes de production, parures, casse |' || chr(10), '| **Déchet** | pertes de production, parures, casse (domaine Restauration) |' || chr(10) || chr(10) || 'Un autre domaine d''activité peut définir ses propres types de perte (par exemple *casse* ou *rebut*) : ce sont alors ceux-là qui apparaissent dans la fenêtre de saisie, les filtres et les badges.' || chr(10)),
  updated_at = NOW()
WHERE slug = 'pertes';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '3. Choisissez le **type** (Avarie ou Déchet) et la **date de la perte**', '3. Choisissez le **type** (Avarie ou Déchet par défaut — selon votre domaine) et la **date de la perte**'),
  contenu_defaut = REPLACE(contenu_defaut, '3. Choisissez le **type** (Avarie ou Déchet) et la **date de la perte**', '3. Choisissez le **type** (Avarie ou Déchet par défaut — selon votre domaine) et la **date de la perte**'),
  updated_at = NOW()
WHERE slug = 'pertes';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '**Article** et **Type** (Avarie / Déchet), bouton **Rechercher**.', '**Article** et **Type** (les types de votre domaine), bouton **Rechercher**.'),
  contenu_defaut = REPLACE(contenu_defaut, '**Article** et **Type** (Avarie / Déchet), bouton **Rechercher**.', '**Article** et **Type** (les types de votre domaine), bouton **Rechercher**.'),
  updated_at = NOW()
WHERE slug = 'pertes';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'les alertes (stock sous seuil, food cost élevé, inventaire ancien)', 'les alertes (stock sous seuil, food cost élevé — au-delà du **seuil de coût matière de votre domaine**, 40 % par défaut —, inventaire ancien)'),
  contenu_defaut = REPLACE(contenu_defaut, 'les alertes (stock sous seuil, food cost élevé, inventaire ancien)', 'les alertes (stock sous seuil, food cost élevé — au-delà du **seuil de coût matière de votre domaine**, 40 % par défaut —, inventaire ancien)'),
  updated_at = NOW()
WHERE slug = 'dashboard';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'les transferts émis vers chaque activité, le stock, les pertes et les ventes du labo.', 'les transferts émis vers chaque activité, les cessions internes vers les labos rattachés, le stock, les pertes et les ventes du labo.'),
  contenu_defaut = REPLACE(contenu_defaut, 'les transferts émis vers chaque activité, le stock, les pertes et les ventes du labo.', 'les transferts émis vers chaque activité, les cessions internes vers les labos rattachés, le stock, les pertes et les ventes du labo.'),
  updated_at = NOW()
WHERE slug = 'dashboard';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'par type (avarie/déchet), par site,', 'par type (les types de perte de votre domaine : avarie/déchet par défaut), par site,'),
  contenu_defaut = REPLACE(contenu_defaut, 'par type (avarie/déchet), par site,', 'par type (les types de perte de votre domaine : avarie/déchet par défaut), par site,'),
  updated_at = NOW()
WHERE slug = 'dashboard';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '(voir [Coût de revient d''une recette](#calc-cout-recette)).', '(voir [Coût de revient d''une recette](#calc-cout-recette)) ; le badge de coût matière d''un produit passe au vert, à l''orange puis au rouge selon le seuil de votre domaine (40 % par défaut : orange dès seuil − 10 points, rouge au-delà du seuil).'),
  contenu_defaut = REPLACE(contenu_defaut, '(voir [Coût de revient d''une recette](#calc-cout-recette)).', '(voir [Coût de revient d''une recette](#calc-cout-recette)) ; le badge de coût matière d''un produit passe au vert, à l''orange puis au rouge selon le seuil de votre domaine (40 % par défaut : orange dès seuil − 10 points, rouge au-delà du seuil).'),
  updated_at = NOW()
WHERE slug = 'dashboard';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'vous créez vos activités et votre labo, constituez votre référentiel d''articles', 'vous créez vos unités — activités et labos, ou les types propres à votre domaine : la liste de contrôle affiche l''avancement par type, par exemple « 1/2 Restaurant · 0/1 Cuisine » —, constituez votre référentiel d''articles'),
  contenu_defaut = REPLACE(contenu_defaut, 'vous créez vos activités et votre labo, constituez votre référentiel d''articles', 'vous créez vos unités — activités et labos, ou les types propres à votre domaine : la liste de contrôle affiche l''avancement par type, par exemple « 1/2 Restaurant · 0/1 Cuisine » —, constituez votre référentiel d''articles'),
  updated_at = NOW()
WHERE slug = 'onboarding-suivi';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'la liste de contrôle vous indique toujours la prochaine action à réaliser, et se met à jour à chaque visite', 'chaque étape est cliquable et vous conduit à l''écran concerné ; la liste vous indique toujours la prochaine action à réaliser et se met à jour à chaque visite'),
  contenu_defaut = REPLACE(contenu_defaut, 'la liste de contrôle vous indique toujours la prochaine action à réaliser, et se met à jour à chaque visite', 'chaque étape est cliquable et vous conduit à l''écran concerné ; la liste vous indique toujours la prochaine action à réaliser et se met à jour à chaque visite'),
  updated_at = NOW()
WHERE slug = 'onboarding-suivi';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'étape par étape (activités & labos, référentiel, articles,', 'étape par étape (vos unités par type — par exemple « 1/2 Restaurant · 0/1 Cuisine » selon votre domaine —, référentiel, articles,'),
  contenu_defaut = REPLACE(contenu_defaut, 'étape par étape (activités & labos, référentiel, articles,', 'étape par étape (vos unités par type — par exemple « 1/2 Restaurant · 0/1 Cuisine » selon votre domaine —, référentiel, articles,'),
  updated_at = NOW()
WHERE slug = 'assistant-ia';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '« Comment fonctionne un transfert entre labo et activité ? »', '« Comment fonctionne un transfert entre labo et activité, ou entre deux labos ? »'),
  contenu_defaut = REPLACE(contenu_defaut, '« Comment fonctionne un transfert entre labo et activité ? »', '« Comment fonctionne un transfert entre labo et activité, ou entre deux labos ? »'),
  updated_at = NOW()
WHERE slug = 'assistant-ia';
