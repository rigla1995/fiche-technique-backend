## 🧾 [[Pl:vente]] & commandes [[compl:acheteur:pl]]

### Le cycle de vie d'une commande

| État | Ce qui se passe |
| --- | --- |
| ⏳ En attente | commande envoyée depuis le portail, rien n'est encore déduit |
| 🚚 Expédiée | [[le:stock]] [[compl:labo]] est [[acc:stock:déduit:déduite]], la facture FA- est générée |
| ✅ Livrée | jalon logistique : la date de livraison est enregistrée |
| ✕ Annulée | [[le:stock]] est [[acc:stock:réintégré:réintégrée]] et la facture supprimée |

Chaque commande garde l'**historique complet de ses états** (qui, quand, avec quelle date d'effet) — visible dans le détail.

### [[Nom:vente]] [[acc:vente:manuel:manuelle]] ([[Nom:vente]] [[Court:acheteur]])

Comme [[un:transfert]], mais vers [[un:acheteur]] : choisissez [[det:acheteur:le]]**[[nom:acheteur]]**, [[det:labo:le:court]]**[[court:labo]] source** et la date ; les lignes se pré-remplissent au tarif HT (modifiable ligne à ligne). Saisissez si besoin une **remise %**, activez le **timbre fiscal**, puis choisissez l'état initial : **Expédiée** (date d'expédition) ou directement **Livrée** (avec sa date de livraison).

À l'enregistrement, le système :

1. contrôle [[le:stock]] [[compl:labo]] (blocage détaillé si insuffisant) ;
2. déduit [[le:stock]] ([[nom:article:pl]] et [[nom:produit:pl]], en unités) ;
3. fige [[le:cout_matiere:pl]] (PMP TTC) pour [[votre:marge:pl]] ;
4. génère la **facture** numérotée (FA-ANNÉE-NNNN) en PDF : HT − remise + TVA + timbre.

### Commandes du portail

Quand [[un:acheteur]] commande en ligne, vous recevez une **notification 🤝** et la commande apparaît **En attente** (badge 🌐 portail). Vos actions :

- **🚚 Expédier** — choisissez [[le:labo]] source, **ajustez les quantités** — voire **retirez des lignes** (quantité servie nulle) — si nécessaire, fixez la remise éventuelle et la date d'expédition ; [[le:stock]] est [[acc:stock:contrôlé:contrôlée]] puis [[acc:stock:déduit:déduite]] et la facture est générée ; [[le:acheteur]] suit sa commande et récupère sa facture dans « Mes commandes » sur son portail.
- **✅ Livrer** — sur une commande expédiée : enregistrez la date de livraison.
- **↩️ Refuser / Annuler** — avec un motif ; le motif s'affiche [[au:acheteur]] dans « Mes commandes » sur son portail (commandes portail).

### Annulation

Une commande expédiée ou livrée peut être annulée (motif à l'appui) : [[det:stock:le]]**[[nom:stock]] est [[acc:stock:réintégré:réintégrée]] automatiquement** et la facture est supprimée.

:::attention
L'annulation supprime la facture : un trou peut apparaître dans la numérotation. Réservez-la aux erreurs de saisie.
:::

L'historique [[du:stock:Nom]] [[Court:labo]] affiche ces mouvements avec le badge **[[Court:vente]]**, et l'export Excel de l'écran Commandes reprend la liste filtrée.