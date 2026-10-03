## 🏢 Activités & labos

Cet écran vous permet de créer et gérer vos **activités** (points de vente) et vos **labos** de production, dans la limite de votre abonnement. Vous le trouvez dans le menu latéral, entrée **Mes activités**. Un compte peut gérer une ou plusieurs activités, avec ou sans labo central.

### Ce que vous voyez

Le bandeau affiche vos **compteurs de quota** : activités utilisées / incluses, et labos utilisés / inclus si votre abonnement en prévoit ; si votre domaine distingue plusieurs types d'unités (Restaurant, Bar, Cuisine, Économat…), la répartition par type s'affiche à titre indicatif et chaque fiche porte un badge de type. Une barre de recherche filtre activités et labos par nom.

- **Section Activités** : un tableau avec le *Nom*, l'*Adresse*, le *Labo* qui l'alimente (pastille 🏭 cliquable qui ouvre la fiche du labo) et les boutons ✏️ modifier / 🗑 supprimer. Le bouton **+ Nouvelle activité** est remplacé par **⚡ Ajouter activités** quand le quota est atteint : il ouvre alors une demande de supplément auprès du support.
- **Section Espace Labos** (si votre abonnement inclut au moins un labo) : tableau *Nom*, *Réf.*, *Adresse*, avec **+ Nouveau labo** ou **⚡ Ajouter labos** au quota atteint.

À la toute première visite, quand rien n'existe encore, un écran de démarrage propose **✨ Créer mon business** (si un labo est inclus) ou **+ Ajouter mon activité**.

### Actions pas à pas

1. **Premier démarrage avec le wizard « Créer mon business »** : à l'étape *Laboratoire*, saisissez le nom, la référence (unique) et l'adresse du labo — ou cochez *Passer cette étape*. À l'étape *Activités*, remplissez un bloc par activité (nom obligatoire, adresse, choix **Avec labo** / **Sans labo**), ajoutez des blocs avec *+ Ajouter une activité* dans la limite du quota, puis validez avec **✅ Enregistrer tout**.
2. **Créer une activité** : *+ Nouvelle activité* → nom (un doublon de nom est signalé immédiatement), adresse facultative. Si des labos existent, choisissez **Avec labo** (puis sélectionnez lequel : c'est le labo qui l'alimente) ou **Sans labo** (gestion autonome). Si votre domaine propose plusieurs types d'activités, choisissez aussi le **type** (Restaurant, Bar…) : il préconfigure la vente et la production de l'unité. Quand tous les emplacements prévus par votre abonnement sont créés, LabFlow vous emmène automatiquement vers le Référentiel (page Unités) pour créer vos articles.
3. **Créer un labo** : nom, **référence unique** (demandée uniquement à la création), adresse, et le champ **Alimenté par** pour désigner un autre labo qui l'approvisionne (un économat alimente une cuisine, par exemple ; les boucles sont refusées) ; vous pouvez cocher directement les activités sans labo à lui rattacher.
4. **Modifier** une activité ou un labo avec ✏️ ; le rattachement d'une activité (« Alimentée par ») ou la source d'un labo (« Alimenté par ») se change dans la même fenêtre.

### Points d'attention

:::attention
La suppression est bloquée (message 🔒) tant que des articles sont affectés à l'activité ou au labo : retirez d'abord ces articles. La suppression d'un labo fait passer ses activités en gestion séparée, retire leur source aux labos qu'il alimentait et met fin aux transferts depuis ce labo ; elle est refusée tant que ce labo a émis ou reçu des transferts. Ces suppressions sont irréversibles.
:::

:::astuce
Rattacher une activité à un labo signifie que ses produits transformés d'origine labo arriveront uniquement par transfert — c'est le mode de fonctionnement recommandé quand vous produisez en central ; un labo peut lui aussi être alimenté par un autre labo : les articles reçus entrent à son stock au prix de cession et servent de base au coût de ses productions.
:::

### Voir aussi

- [Compte, activités et labos](#compte-activites-labos) — le modèle général
- [Transferts labo → activités et labos rattachés](#transferts)
- [Articles du référentiel](#referentiel-articles) — l'affectation des articles par activité
- [Mon abonnement](#abonnement) · [Comptes gérants](#gerants)