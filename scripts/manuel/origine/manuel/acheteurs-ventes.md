## 🧾 Ventes & commandes acheteurs

### Le cycle de vie d'une commande

| État | Ce qui se passe |
| --- | --- |
| ⏳ En attente | commande envoyée depuis le portail, rien n'est encore déduit |
| 🚚 Expédiée | le stock labo est déduit, la facture FA- est générée |
| ✅ Livrée | jalon logistique : la date de livraison est enregistrée |
| ✕ Annulée | le stock est réintégré et la facture supprimée |

Chaque commande garde l'**historique complet de ses états** (qui, quand, avec quelle date d'effet) — visible dans le détail.

### Vente manuelle (Vente Acheteur)

Comme un transfert, mais vers un acheteur : choisissez l'**acheteur**, le **labo source** et la date ; les lignes se pré-remplissent au tarif HT (modifiable ligne à ligne). Saisissez si besoin une **remise %**, activez le **timbre fiscal**, puis choisissez l'état initial : **Expédiée** (date d'expédition) ou directement **Livrée** (avec sa date de livraison).

À l'enregistrement, le système :

1. contrôle le stock labo (blocage détaillé si insuffisant) ;
2. déduit le stock (articles et produits, en unités) ;
3. fige les coûts matière (PMP TTC) pour vos marges ;
4. génère la **facture** numérotée (FA-ANNÉE-NNNN) en PDF : HT − remise + TVA + timbre.

### Commandes du portail

Quand un acheteur commande en ligne, vous recevez une **notification 🤝** et la commande apparaît **En attente** (badge 🌐 portail). Vos actions :

- **🚚 Expédier** — choisissez le labo source, **ajustez les quantités** — voire **retirez des lignes** (quantité servie nulle) — si nécessaire, fixez la remise éventuelle et la date d'expédition ; le stock est contrôlé puis déduit et la facture est générée ; l'acheteur suit sa commande et récupère sa facture dans « Mes commandes » sur son portail.
- **✅ Livrer** — sur une commande expédiée : enregistrez la date de livraison.
- **↩️ Refuser / Annuler** — avec un motif ; le motif s'affiche à l'acheteur dans « Mes commandes » sur son portail (commandes portail).

### Annulation

Une commande expédiée ou livrée peut être annulée (motif à l'appui) : le **stock est réintégré automatiquement** et la facture est supprimée.

:::attention
L'annulation supprime la facture : un trou peut apparaître dans la numérotation. Réservez-la aux erreurs de saisie.
:::

L'historique du Stock Labo affiche ces mouvements avec le badge **Vente**, et l'export Excel de l'écran Commandes reprend la liste filtrée.