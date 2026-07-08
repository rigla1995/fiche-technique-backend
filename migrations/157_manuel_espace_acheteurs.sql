-- 157 — Manuel : fiches de l'Espace Acheteurs (module Acheteurs, lots 1-4).
-- Nouvelles fiches (partie « Espace Acheteurs », ordre 65-69, après l'Espace Vente).
-- ON CONFLICT DO NOTHING : ne jamais écraser une édition admin si rejouée.

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES
('acheteurs-module', 'Le module Acheteurs', '🤝', 'Espace Acheteurs', 65,
'## 🤝 Le module Acheteurs

Le module Acheteurs transforme votre labo en **point de vente B2B** : vous gérez un carnet d''acheteurs (restaurants, superettes, grossistes…), vous leur vendez des articles et des produits composés depuis votre **stock labo**, et chaque vente génère une **facture fiscale** numérotée.

Il permet aussi le **compte dépôt** : un compte LabFlow composé uniquement d''un labo et d''un carnet d''acheteurs, sans aucune activité.

### Activation

Le module est **optionnel** et désactivé par défaut. Deux façons de l''activer :

1. Depuis l''écran verrouillé de l''Espace Acheteurs, envoyez une **demande d''activation** — l''administrateur la valide sous 24 h.
2. L''administrateur peut l''activer directement sur votre compte.

À l''activation, un **quota d''acheteurs** est défini sur votre abonnement : c''est le nombre maximum de fiches dans votre carnet. Pour l''augmenter, contactez l''administrateur.

### Ce que le module ajoute

| Élément | Rôle |
| --- | --- |
| Carnet d''Acheteurs | vos clients B2B (fiches, remises, comptes portail) |
| Tarifs Acheteurs | les articles proposés et leurs prix (unité et lot) |
| Vente Acheteur | la vente manuelle depuis le stock labo |
| Commandes | le suivi des ventes et des commandes du portail |
| Portail acheteur | l''espace où vos acheteurs commandent en ligne |

:::regle
Toutes les ventes aux acheteurs partent du **stock labo** (jamais du stock d''une activité). Le labo source est choisi à chaque vente.
:::',
NULL,
'acheteurs, module, activation, quota, depot, b2b, carnet, vente labo', '/client/acheteurs', true),

('acheteurs-carnet', 'Carnet d''Acheteurs', '📇', 'Espace Acheteurs', 66,
'## 📇 Carnet d''Acheteurs

Le carnet regroupe vos clients B2B. Chaque fiche porte : nom, entreprise, email, téléphone, adresse, **matricule fiscal** (repris sur les factures), **remise %** (appliquée par défaut à ses ventes) et des notes.

### Ajouter des acheteurs

- **➕ Ajouter des acheteurs** — saisie en lignes multiples ; cochez **Compte** pour envoyer une invitation par email.
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
:::',
NULL,
'carnet, acheteur, ajout, import excel, invitation, compte, remise, matricule fiscal, quota', '/client/acheteurs', true),

('acheteurs-tarifs', 'Tarifs Acheteurs', '💲', 'Espace Acheteurs', 67,
'## 💲 Tarifs Acheteurs

Cet écran définit **ce que vous proposez** à vos acheteurs et à quel prix. Le tarif est le même pour tous les acheteurs — la personnalisation passe par la **remise %** de chaque fiche du carnet.

### Qui est proposable ?

- **Articles** dont la famille est marquée **Achetable** (interrupteur violet dans [Familles](#referentiel-familles), visible quand le module est actif).
- **Produits composés** fabriqués au labo (origine labo).

### Les deux prix

Chaque offre porte un prix **TTC à l''unité** et, en option, un prix **par lot** avec sa taille (ex. lot de 12 à 30 DT). À la vente, chaque ligne se saisit à l''unité ou au lot.

Le **taux de TVA** saisi sur l''offre sert à décomposer la facture (HT + TVA dérivés du TTC — les montants ne sont jamais re-taxés).

:::regle
Une offre ne peut être **Proposée** (active) que si son prix unitaire est supérieur à 0 — même règle que la Configuration Vente. Chaque changement de prix est historisé.
:::

:::astuce
Seules les offres **actives** apparaissent dans la Vente Acheteur et sur le portail. Désactivez une offre pour la retirer du catalogue sans perdre ses prix.
:::',
NULL,
'tarifs, offres, prix unité, prix lot, taille de lot, tva, achetable, famille, actif', '/client/acheteurs/tarifs', true),

('acheteurs-ventes', 'Ventes & commandes acheteurs', '🧾', 'Espace Acheteurs', 68,
'## 🧾 Ventes & commandes acheteurs

### Vente manuelle (Vente Acheteur)

Comme un transfert, mais vers un acheteur : choisissez l''**acheteur**, le **labo source** et la date ; les lignes se pré-remplissent au tarif (modifiable ligne à ligne), à l''unité ou au lot. La **remise** de la fiche acheteur est proposée par défaut (ajustable pour cette vente), le **timbre fiscal** est activable.

À l''enregistrement, le système :

1. contrôle le stock labo (blocage détaillé si insuffisant) ;
2. déduit le stock (articles et produits composés, en unités) ;
3. fige les coûts matière (PMP TTC) pour vos marges ;
4. génère la **facture** numérotée (FA-ANNÉE-NNNN) en PDF.

### Commandes du portail

Quand un acheteur commande en ligne, vous recevez une **notification 🤝** et la commande apparaît **En attente** dans l''écran Commandes (badge 🌐 portail). Deux actions :

- **✅ Valider** — choisissez le labo source ; le stock est contrôlé puis déduit, la facture est générée et l''acheteur est prévenu par email.
- **↩️ Refuser** — avec un motif ; l''acheteur est prévenu par email.

### Annulation

Une vente validée peut être annulée (motif à l''appui) : le **stock est réintégré automatiquement** et la facture est supprimée.

:::attention
L''annulation supprime la facture : un trou peut apparaître dans la numérotation. Réservez-la aux erreurs de saisie.
:::

L''historique du Stock Labo affiche ces mouvements avec le badge **Vente**, et l''export Excel de l''écran Commandes reprend la liste filtrée.',
NULL,
'vente acheteur, commande, valider, refuser, annuler, facture, timbre, stock labo, notification, portail', '/client/acheteurs/commandes', true),

('acheteurs-portail', 'Le portail acheteur', '🛍️', 'Espace Acheteurs', 69,
'## 🛍️ Le portail acheteur

Le portail est l''espace en ligne de **vos acheteurs** (adresse `/portail`, accessible après activation de leur compte).

### Ce que voit l''acheteur

- Le **catalogue** de vos offres actives, avec les prix à l''unité et par lot, et un badge **Disponible / Rupture**. La rupture s''affiche quand votre stock atteint le seuil configuré — l''acheteur ne voit **jamais vos quantités**.
- Sa **remise personnelle** et une estimation du total au moment de composer son panier.
- **Mes commandes** : le statut de chaque commande (En attente / Validée / Annulée avec motif) et ses **factures** en PDF.

### Le flux

1. L''acheteur compose son panier (unités ou lots) et envoie sa commande — **les prix sont figés** au tarif du moment, il ne peut pas les modifier.
2. Vous recevez la notification et validez (ou refusez) depuis [Commandes](#acheteurs-ventes).
3. Le stock n''est déduit **qu''à la validation** — aucune réservation avant.
4. L''acheteur est prévenu par email et récupère sa facture sur le portail.

:::astuce
Le seuil de rupture se règle par article dans le Stock Labo (seuil min). Un article sans seuil passe en rupture quand son stock tombe à zéro.
:::',
NULL,
'portail, catalogue, panier, disponible, rupture, commande en ligne, facture pdf, statut', '/portail', true)

ON CONFLICT (slug) DO NOTHING;
