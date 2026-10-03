## 📇 Carnet d'Acheteurs

Le carnet regroupe vos clients B2B. Chaque fiche porte : nom, entreprise, email, téléphone, adresse, **matricule fiscal** (repris sur les factures) et des notes.

La **remise** n'est plus attachée à la fiche : elle se décide **à chaque commande** (vente manuelle ou validation d'une commande portail).

### Ajouter des acheteurs

- **➕ Ajouter un acheteur** — le même formulaire sert à l'ajout et à la modification ; cochez **Créer le compte portail** pour envoyer une invitation par email.
- **📥 Ajout Dynamique** — import Excel en masse : téléchargez le modèle, remplissez-le (seul le Nom est obligatoire) et uploadez-le. L'option « Créer les comptes portail » invite chaque ligne ayant un email.

Le compteur du haut affiche votre progression vers le **quota** (ex. 12 / 20). Quota atteint : demandez une augmentation à l'administrateur.

### Comptes portail

Le badge de la colonne « Compte portail » indique l'état :

| Badge | Signification |
| --- | --- |
| Sans compte | fiche seule, pas d'accès en ligne |
| ✉️ Invité | invitation envoyée (valable 48 h), compte pas encore activé |
| ✅ Compte actif | l'acheteur se connecte et commande sur le portail |

Le bouton ✉️ crée le compte (ou renvoie l'invitation si elle a expiré). L'email d'un acheteur **avec compte** ne peut plus être modifié : c'est son identifiant de connexion.

:::attention
Désactiver un acheteur (interrupteur « Actif ») coupe immédiatement son accès au portail. Supprimer sa fiche supprime aussi son compte de connexion, **annule ses commandes encore en attente** (transition tracée dans l'historique des états) et **conserve ses commandes expédiées ou livrées avec leurs factures fiscales** : elles restent dans l'historique avec la mention « (supprimé) », le stock ne bouge pas, et le filtre « Acheteurs supprimés » de l'écran Commandes permet de les retrouver.
:::