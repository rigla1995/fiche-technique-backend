## 📇 Carnet [[de:acheteur:pl:Nom]]

Le carnet regroupe vos clients, **professionnels (B2B)** ou **particuliers (B2C)**. Chaque fiche porte son type, puis : nom, entreprise (raison sociale), email, téléphone, adresse, **matricule fiscal** et **identifiant RNE** (repris sur les factures) et des notes.

La **remise** n'est plus attachée à la fiche : elle se décide **à chaque commande** ([[nom:vente]] [[acc:vente:manuel:manuelle]] ou validation d'une commande portail).

### Ajouter [[un:acheteur:pl]]

- **➕ Ajouter [[un:acheteur]]** — choisissez d'abord **Professionnel (B2B)** ou **Particulier (B2C)**.
  - **Professionnel** : **📄 Lire la patente** (carte d'identification fiscale, extrait RNE, carte auto-entrepreneur — PDF ou photo, lu sur votre ordinateur, rien n'est envoyé) remplit la raison sociale, le matricule fiscal, le RNE et l'adresse ; vous pouvez aussi les saisir à la main. **Raison sociale, matricule fiscal et adresse sont obligatoires** : la facture de [[nom:vente]] en dépend.
  - **Particulier** : **nom et téléphone** suffisent ; la facture porte ces deux mentions.
  - Le même formulaire sert à la modification (le type se change) ; cochez **Créer le compte portail** pour envoyer une invitation par email.
- **📥 Ajout Dynamique** — import Excel en masse : téléchargez le modèle, remplissez-le et uploadez-le. Colonnes : Nom, Entreprise, Email, Téléphone, Adresse, Matricule fiscal, **Type** (Professionnel ou Particulier) et RNE ; les champs obligatoires sont ceux du type, une ligne incomplète est refusée avec son motif. L'option « Créer les comptes portail » invite chaque ligne ayant un email.

Le compteur du haut affiche votre progression vers le **quota** (ex. 12 / 20). Quota atteint : demandez une augmentation à l'administrateur.

### Fiches « à préciser »

Les fiches créées avant cette version sont classées **professionnelles** si elles ont un matricule fiscal, sinon **« à préciser »** : un bandeau du carnet les compte, et **aucune facture ne peut leur être émise** tant que leur type n'est pas choisi. Ouvrez la fiche (✏️), choisissez le type et complétez les champs obligatoires.

### Comptes portail

Le badge de la colonne « Compte portail » indique l'état :

| Badge | Signification |
| --- | --- |
| Sans compte | fiche seule, pas d'accès en ligne |
| ✉️ Invité | invitation envoyée (valable 48 h), compte pas encore activé |
| ✅ Compte actif | [[le:acheteur]] se connecte et commande sur le portail |

Le bouton ✉️ crée le compte (ou renvoie l'invitation si elle a expiré). L'email d'[[un:acheteur]] **avec compte** ne peut plus être modifié : c'est son identifiant de connexion.

:::attention
Désactiver [[un:acheteur]] (interrupteur « Actif ») coupe immédiatement son accès au portail. Supprimer sa fiche supprime aussi son compte de connexion, **annule ses commandes encore en attente** (transition tracée dans l'historique des états) et **conserve ses commandes expédiées ou livrées avec leurs factures fiscales** : elles restent dans l'historique avec la mention « (supprimé) », [[le:stock]] ne bouge pas, et le filtre « [[Pl:acheteur]] [[acc:acheteur:supprimés:supprimées]] » de l'écran Commandes permet de les retrouver.
:::
