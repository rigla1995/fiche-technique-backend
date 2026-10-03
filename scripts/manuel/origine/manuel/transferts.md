## 🔄 Transferts

Cet écran envoie les articles et les produits transformés (PT) du labo vers vos activités **et vers les labos qu'il alimente** (un économat vers une cuisine, par exemple) : le stock du labo diminue, celui de chaque destination augmente d'autant. Vous y accédez par le bouton **↗ Transfert** du Stock Labo ou depuis l'espace labo ; les pastilles en haut de page permettent de changer de labo.

### Ce que vous voyez

Le bandeau propose un retour vers le **Stock Labo** et le bouton **📋 Historique Transferts** (grisé tant qu'aucun transfert n'existe). Suivent la barre de filtres (Activité, Catégorie, Article, Nom) et le bloc **Transfert** : la Date Transfert et la **Réf. Facture / BL** (toutes deux obligatoires), puis les boutons **↗ Transférer** et **↺ Réinitialiser**.

Le tableau, par catégories repliables, affiche pour chaque article : le stock disponible au labo (vert, orange ou rouge selon le niveau), le **prix unitaire TTC** de cession, puis **une colonne de quantité par destination** (activité ou labo rattaché). Le bouton 📋 Historique déplie les 5 derniers transferts de l'article (dates, quantités par activité, prix, référence). Un panneau « Aperçu saisie » totalise en direct, en TTC, les montants de votre saisie.

Le prix de cession est proposé automatiquement au coût du labo : coût de production TTC pour un PT, prix moyen pondéré converti en TTC pour un article. Vous pouvez l'ajuster, mais il reste obligatoire pour toute ligne transférée.

### Actions pas à pas

1. Sélectionnez le labo, choisissez la date du transfert et saisissez le n° de bon de livraison.
2. Saisissez les quantités dans les colonnes des destinations (activités ou labos rattachés) ; ajustez le prix de cession si nécessaire.
3. Cliquez sur **↗ Transférer** : la fenêtre « Confirmation de transfert » récapitule les lignes groupées par destination (quantités, prix HT/TTC, totaux).
4. Cliquez sur **Confirmer le transfert** : les stocks sont mis à jour immédiatement.

Pour corriger ou exporter : ouvrez l'**Historique Transferts** (filtres Du/Au, Destination, Catégorie), sélectionnez des lignes si besoin (elles seront surlignées dans le fichier), exportez en Excel, modifiez une quantité (✏️) ou supprimez un transfert (🗑️ — les stocks du labo et de l'activité sont alors recalculés).

### Points d'attention

:::regle
Un article ou un PT ne peut être transféré que vers une destination (activité ou labo rattaché) où il est **affecté** : sinon la case de quantité est remplacée par « — ». Si aucune destination n'apparaît, rattachez d'abord vos activités ou labos à ce labo depuis [Activités & labos](#activites). Pour un PT fabriqué au labo, le transfert est le **seul** moyen d'approvisionner une activité. Si aucun article n'apparaît, affectez d'abord vos articles aux activités liées au labo depuis la fiche de chaque article ([Articles](#referentiel-articles)).
:::

:::attention
Impossible de transférer plus que le stock du labo : la ligne passe en rouge avec l'excédent affiché, et l'enregistrement est bloqué avec le détail Disponible / Demandé / Excédent.
:::

:::attention
Si un transfert existe déjà le même jour vers la même destination, une fenêtre de vérification détaille « Déjà envoyé / Nouveau transfert / Total après ». Ne confirmez que s'il s'agit bien d'un envoi complémentaire : les quantités s'additionnent.
:::

:::astuce
Côté destination (activité ou labo rattaché), la réception apparaît dans le stock comme un approvisionnement de type « Transfert », avec le **labo source comme fournisseur**, au prix de cession saisi ; côté labo source, la sortie porte le badge « ↗ Transf. → destination ».
:::

### Voir aussi

- [Le calcul des transferts](#calc-transferts) · [Le prix moyen pondéré](#calc-pmp)
- [Stock Labo](#stock-labo) · [Stock des activités](#stock-activites)
- [Factures d'appro](#factures) · [Historique des mouvements](#historique)