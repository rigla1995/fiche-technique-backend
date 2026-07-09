-- 163 — Manuel : fiches Ventes & Portail mises à jour pour le flux en 4 états
-- (en attente → expédiée → livrée / annulée) + quantités ajustables à l'expédition.

UPDATE manuel_sections SET contenu =
'## 🧾 Ventes & commandes acheteurs

### Le cycle de vie d''une commande

| État | Ce qui se passe |
| --- | --- |
| ⏳ En attente | commande envoyée depuis le portail, rien n''est encore déduit |
| 🚚 Expédiée | le stock labo est déduit, la facture FA- est générée |
| ✅ Livrée | jalon logistique : la date de livraison est enregistrée |
| ✕ Annulée | le stock est réintégré et la facture supprimée |

Chaque commande garde l''**historique complet de ses états** (qui, quand, avec quelle date d''effet) — visible dans le détail.

### Vente manuelle (Vente Acheteur)

Comme un transfert, mais vers un acheteur : choisissez l''**acheteur**, le **labo source** et la date ; les lignes se pré-remplissent au tarif HT (modifiable ligne à ligne). Saisissez si besoin une **remise %**, activez le **timbre fiscal**, puis choisissez l''état initial : **Expédiée** (date d''expédition) ou directement **Livrée** (avec sa date de livraison).

À l''enregistrement, le système :

1. contrôle le stock labo (blocage détaillé si insuffisant) ;
2. déduit le stock (articles et produits, en unités) ;
3. fige les coûts matière (PMP TTC) pour vos marges ;
4. génère la **facture** numérotée (FA-ANNÉE-NNNN) en PDF : HT − remise + TVA + timbre.

### Commandes du portail

Quand un acheteur commande en ligne, vous recevez une **notification 🤝** et la commande apparaît **En attente** (badge 🌐 portail). Vos actions :

- **🚚 Expédier** — choisissez le labo source, **ajustez les quantités** si nécessaire, fixez la remise éventuelle et la date d''expédition ; le stock est contrôlé puis déduit, la facture est générée et l''acheteur est prévenu par email.
- **✅ Livrer** — sur une commande expédiée : enregistrez la date de livraison.
- **↩️ Refuser / Annuler** — avec un motif ; l''acheteur est prévenu par email (commandes portail).

### Annulation

Une commande expédiée ou livrée peut être annulée (motif à l''appui) : le **stock est réintégré automatiquement** et la facture est supprimée.

:::attention
L''annulation supprime la facture : un trou peut apparaître dans la numérotation. Réservez-la aux erreurs de saisie.
:::

L''historique du Stock Labo affiche ces mouvements avec le badge **Vente**, et l''export Excel de l''écran Commandes reprend la liste filtrée.'
WHERE slug = 'acheteurs-ventes';

UPDATE manuel_sections SET contenu =
'## 🛍️ Le portail acheteur

Le portail est l''espace en ligne de **vos acheteurs** (adresse `/portail`, accessible après activation de leur compte).

### Ce que voit l''acheteur

- Le **catalogue** de vos offres actives, regroupé **par catégorie** avec recherche, filtres et pagination, les prix TTC à l''unité et un badge **Disponible / Rupture**. La rupture s''affiche quand votre stock atteint le seuil configuré — l''acheteur ne voit **jamais vos quantités**.
- **Mes commandes** : le statut de chaque commande (En attente / Expédiée / Livrée / Annulée avec motif), le **détail complet** (lignes, remise appliquée, TVA, timbre, total, référence de facture) et l''**historique des états**, avec les **factures** en PDF.

### Le flux

1. L''acheteur compose son panier et envoie sa commande — **les prix sont figés** au tarif du moment, il ne peut pas les modifier.
2. Vous recevez la notification et **expédiez** (ou refusez) depuis [Commandes](#acheteurs-ventes) — c''est à l''expédition que vous pouvez **ajuster les quantités** et décider d''une **remise** éventuelle.
3. Le stock n''est déduit **qu''à l''expédition** — aucune réservation avant.
4. L''acheteur est prévenu par email et récupère sa facture sur le portail ; vous clôturez la commande en la passant **Livrée**.

:::astuce
Le seuil de rupture se règle par article dans le Stock Labo (seuil min). Un article sans seuil passe en rupture quand son stock tombe à zéro.
:::'
WHERE slug = 'acheteurs-portail';
