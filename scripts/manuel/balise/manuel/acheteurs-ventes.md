## 🧾 [[Pl:vente]] & commandes [[compl:acheteur:pl]]

### Le cycle de vie d'une commande

| État | Ce qui se passe |
| --- | --- |
| ⏳ En attente | commande envoyée depuis le portail, rien n'est encore déduit |
| 🚚 Expédiée | [[le:stock]] [[compl:labo]] est [[acc:stock:déduit:déduite]], la facture FA- est générée |
| ✅ Livrée | jalon logistique : la date de livraison est enregistrée (par vous, ou par le livreur depuis son téléphone avec la facture signée) |
| ⚠️ Non livrée | le livreur n'a pas pu livrer (motif et note) : [[le:stock]] revient si la marchandise est rapportée au dépôt ; vous relancez ou annulez |
| ✕ Annulée | [[le:stock]] est [[acc:stock:réintégré:réintégrée]] et la facture supprimée |

Chaque commande garde l'**historique complet de ses états** (qui, quand, avec quelle date d'effet) — visible dans le détail.

### [[Nom:vente]] [[acc:vente:manuel:manuelle]] ([[Nom:vente]] [[Court:acheteur]])

Comme [[un:transfert]], mais vers [[un:acheteur]] : choisissez [[det:acheteur:le]]**[[nom:acheteur]]**, [[det:labo:le:court]]**[[court:labo]] source** et la date ; les lignes se pré-remplissent au tarif HT (modifiable ligne à ligne). Saisissez si besoin une **remise %**, activez le **timbre fiscal**, puis choisissez l'état initial : **Expédiée** (date d'expédition) ou directement **Livrée** (avec sa date de livraison).

À l'enregistrement, le système :

1. contrôle [[le:stock]] [[compl:labo]] (blocage détaillé si insuffisant) ;
2. déduit [[le:stock]] ([[nom:article:pl]] et [[nom:produit:pl]], en unités) ;
3. fige [[le:cout_matiere:pl]] (PMP TTC) pour [[votre:marge:pl]] ;
4. génère la **facture** numérotée (FA-ANNÉE-NNNN) en PDF : HT − remise + TVA + timbre.

Le bloc **« Facturé à »** de la facture suit le type de la fiche : **professionnel (B2B)** — raison sociale et contact, matricule fiscal, identifiant RNE, adresse ; **particulier (B2C)** — nom, mention « Particulier », téléphone.

:::attention
Aucune facture n'est émise à une fiche **« à préciser »** ni à un professionnel **sans matricule fiscal** : complétez la fiche dans le carnet avant [[le:vente]] [[acc:vente:manuel:manuelle]] ou l'expédition d'une commande.
:::

### Commandes du portail

Quand [[un:acheteur]] commande en ligne, vous recevez une **notification 🤝** et la commande apparaît **En attente** (badge 🌐 portail). Vos actions :

- **🚚 Expédier** — choisissez [[le:labo]] source, **ajustez les quantités** — voire **retirez des lignes** (quantité servie nulle) — si nécessaire, fixez la remise éventuelle et la date d'expédition ; [[le:stock]] est [[acc:stock:contrôlé:contrôlée]] puis [[acc:stock:déduit:déduite]] et la facture est générée ; [[le:acheteur]] suit sa commande et récupère sa facture dans « Mes commandes » sur son portail. Si vous avez des **livreurs** ([[Nom:espace_acheteurs]] → Livreurs), confiez-lui la commande dans le champ **Livreur** : elle apparaît aussitôt dans son espace sur son téléphone, et [[le:acheteur]] voit « en cours de livraison ».
- **🏍️ Livreur** — sur une commande expédiée : confiez-la à un livreur, changez de livreur ou retirez-le. La colonne et le filtre **Livreur** de la liste montrent qui livre quoi ; le détail indique qui a fait l'affectation et quand.
- **✅ Livrer** — sur une commande expédiée : enregistrez la date de livraison (ou laissez le livreur la valider depuis son téléphone : sa **📎 Facture signée** s'ouvre ensuite depuis le détail 👁️).
- **🔁 Relancer** — sur une commande **⚠️ Non livrée** : nouvelle tentative avec le même livreur, un autre, ou sans ; la facture est conservée et [[le:stock]] ressort si la marchandise avait été rapportée au dépôt. Le détail montre le motif et la note du livreur. Sinon, **↩️ Annuler** (voir [Livrer avec son téléphone](#livreurs-livraison)).
- **↩️ Refuser / Annuler** — avec un motif ; le motif s'affiche [[au:acheteur]] dans « Mes commandes » sur son portail (commandes portail).

### Annulation

Une commande expédiée ou livrée peut être annulée (motif à l'appui) : [[det:stock:le]]**[[nom:stock]] est [[acc:stock:réintégré:réintégrée]] automatiquement** et la facture est supprimée.

:::attention
L'annulation supprime la facture : un trou peut apparaître dans la numérotation. Réservez-la aux erreurs de saisie.
:::

L'historique [[du:stock:Nom]] [[Court:labo]] affiche ces mouvements avec le badge **[[Court:vente]]**, et l'export Excel de l'écran Commandes reprend la liste filtrée.
