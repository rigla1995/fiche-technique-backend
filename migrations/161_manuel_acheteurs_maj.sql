-- 161 — Manuel : mise à jour des fiches Espace Acheteurs après la refonte tarifs.
--   • remise : plus sur la fiche acheteur, saisie à chaque commande ;
--   • « Commandable » porté par les ARTICLES (plus par les familles) ;
--   • tarifs saisis en HT + TVA, plus de vente par lot ;
--   • éligibilité étendue aux produits utilisables liés à un labo ;
--   • carnet : ajout un acheteur à la fois (l'import Excel reste pour le volume).
-- On écrase le contenu (fiches seedées par la migration 157 la veille).

UPDATE manuel_sections SET contenu =
'## 🤝 Le module Acheteurs

Le module Acheteurs transforme votre labo en **point de vente B2B** : vous gérez un carnet d''acheteurs (restaurants, superettes, grossistes…), vous leur vendez des articles et des produits depuis votre **stock labo**, et chaque vente génère une **facture fiscale** numérotée.

Il permet aussi le **compte dépôt** : un compte LabFlow composé uniquement d''un labo et d''un carnet d''acheteurs, sans aucune activité.

### Activation

Le module est **optionnel** et désactivé par défaut. Deux façons de l''activer :

1. Depuis l''écran verrouillé de l''Espace Acheteurs, envoyez une **demande d''activation** — l''administrateur la valide sous 24 h.
2. L''administrateur peut l''activer directement sur votre compte.

À l''activation, un **quota d''acheteurs** est défini sur votre abonnement : c''est le nombre maximum de fiches dans votre carnet. Pour l''augmenter, contactez l''administrateur.

### Ce que le module ajoute

| Élément | Rôle |
| --- | --- |
| Carnet d''Acheteurs | vos clients B2B (fiches, comptes portail) |
| Tarifs Acheteurs | les articles proposés et leurs prix HT (+ TVA) |
| Vente Acheteur | la vente manuelle depuis le stock labo |
| Commandes | le suivi des ventes et des commandes du portail |
| Portail acheteur | l''espace où vos acheteurs commandent en ligne |

:::regle
Toutes les ventes aux acheteurs partent du **stock labo** (jamais du stock d''une activité). Le labo source est choisi à chaque vente, et la **remise** éventuelle se décide à chaque commande.
:::'
WHERE slug = 'acheteurs-module';

UPDATE manuel_sections SET contenu =
'## 📇 Carnet d''Acheteurs

Le carnet regroupe vos clients B2B. Chaque fiche porte : nom, entreprise, email, téléphone, adresse, **matricule fiscal** (repris sur les factures) et des notes.

La **remise** n''est plus attachée à la fiche : elle se décide **à chaque commande** (vente manuelle ou validation d''une commande portail).

### Ajouter des acheteurs

- **➕ Ajouter un acheteur** — le même formulaire sert à l''ajout et à la modification ; cochez **Créer le compte portail** pour envoyer une invitation par email.
- **📥 Ajout Dynamique** — import Excel en masse : téléchargez le modèle, remplissez-le (seul le Nom est obligatoire) et uploadez-le. L''option « Créer les comptes portail » invite chaque ligne ayant un email.

Le compteur du haut affiche votre progression vers le **quota** (ex. 12 / 20). Quota atteint : demandez une augmentation à l''administrateur.

### Comptes portail

Le badge de la colonne « Compte portail » indique l''état :

| Badge | Signification |
| --- | --- |
| Sans compte | fiche seule, pas d''accès en ligne |
| ✉️ Invité | invitation envoyée (valable 48 h), compte pas encore activé |
| ✅ Compte actif | l''acheteur se connecte et commande sur le portail |

Le bouton ✉️ crée le compte (ou renvoie l''invitation si elle a expiré). L''email d''un acheteur **avec compte** ne peut plus être modifié : c''est son identifiant de connexion.

:::attention
Désactiver un acheteur (interrupteur « Actif ») coupe immédiatement son accès au portail. Supprimer sa fiche supprime aussi son compte de connexion.
:::'
WHERE slug = 'acheteurs-carnet';

UPDATE manuel_sections SET contenu =
'## 💲 Tarifs Acheteurs

Cet écran définit **ce que vous proposez** à vos acheteurs et à quel prix. Le tarif est le même pour tous les acheteurs — la personnalisation passe par la **remise** saisie à chaque commande.

### Qui est proposable ?

- **Articles** marqués **Commandable** (interrupteur violet dans la page [Articles](#referentiel-articles), visible quand le module est actif).
- **Produits composés** fabriqués au labo (section « Produits Composés »).
- **Produits utilisables** rattachés à au moins un labo (section « Produits Utilisables »).

Les articles sont regroupés **par catégorie** (sections repliées par défaut) ; la recherche et les filtres aident à retrouver une ligne.

### Le prix

Chaque offre porte un **prix HT à l''unité** et son **taux de TVA** — le prix TTC correspondant s''affiche automatiquement. La vente se fait toujours à l''unité (pas de lots).

:::regle
Une offre ne peut être **Proposée** (active) que si son prix unitaire HT est supérieur à 0. Chaque changement de prix est historisé.
:::

:::astuce
Seules les offres **actives** apparaissent dans la Vente Acheteur et sur le portail. Désactivez une offre pour la retirer du catalogue sans perdre ses prix.
:::'
WHERE slug = 'acheteurs-tarifs';

UPDATE manuel_sections SET contenu =
'## 🧾 Ventes & commandes acheteurs

### Vente manuelle (Vente Acheteur)

Comme un transfert, mais vers un acheteur : choisissez l''**acheteur**, le **labo source** et la date ; les lignes se pré-remplissent au tarif HT (modifiable ligne à ligne). Saisissez si besoin une **remise %** pour cette commande, activez le **timbre fiscal**.

À l''enregistrement, le système :

1. contrôle le stock labo (blocage détaillé si insuffisant) ;
2. déduit le stock (articles et produits, en unités) ;
3. fige les coûts matière (PMP TTC) pour vos marges ;
4. génère la **facture** numérotée (FA-ANNÉE-NNNN) en PDF : HT − remise + TVA + timbre.

### Commandes du portail

Quand un acheteur commande en ligne, vous recevez une **notification 🤝** et la commande apparaît **En attente** dans l''écran Commandes (badge 🌐 portail). Deux actions :

- **✅ Valider** — choisissez le labo source et la **remise éventuelle** ; le stock est contrôlé puis déduit, la facture est générée et l''acheteur est prévenu par email.
- **↩️ Refuser** — avec un motif ; l''acheteur est prévenu par email.

### Annulation

Une vente validée peut être annulée (motif à l''appui) : le **stock est réintégré automatiquement** et la facture est supprimée.

:::attention
L''annulation supprime la facture : un trou peut apparaître dans la numérotation. Réservez-la aux erreurs de saisie.
:::

L''historique du Stock Labo affiche ces mouvements avec le badge **Vente**, et l''export Excel de l''écran Commandes reprend la liste filtrée.'
WHERE slug = 'acheteurs-ventes';

UPDATE manuel_sections SET contenu =
'## 🛍️ Le portail acheteur

Le portail est l''espace en ligne de **vos acheteurs** (adresse `/portail`, accessible après activation de leur compte).

### Ce que voit l''acheteur

- Le **catalogue** de vos offres actives, regroupé **par catégorie** (10 articles par page), avec les prix TTC à l''unité et un badge **Disponible / Rupture**. La rupture s''affiche quand votre stock atteint le seuil configuré — l''acheteur ne voit **jamais vos quantités**.
- **Mes commandes** : le statut de chaque commande (En attente / Validée / Annulée avec motif) et ses **factures** en PDF.

### Le flux

1. L''acheteur compose son panier et envoie sa commande — **les prix sont figés** au tarif du moment, il ne peut pas les modifier.
2. Vous recevez la notification et validez (ou refusez) depuis [Commandes](#acheteurs-ventes) — c''est à la validation que vous décidez d''une **remise** éventuelle.
3. Le stock n''est déduit **qu''à la validation** — aucune réservation avant.
4. L''acheteur est prévenu par email et récupère sa facture sur le portail.

:::astuce
Le seuil de rupture se règle par article dans le Stock Labo (seuil min). Un article sans seuil passe en rupture quand son stock tombe à zéro.
:::'
WHERE slug = 'acheteurs-portail';
