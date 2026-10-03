## 🏢 [[Nom:activite:pl]] & [[nom:labo:pl]]

Cet écran vous permet de créer et gérer [[det:activite:votre:pl]]**[[nom:activite:pl]]** (points de vente) et [[det:labo:votre:pl]]**[[nom:labo:pl]]** de production, dans la limite de votre abonnement. Vous le trouvez dans le menu latéral, entrée **[[Mon:activite:pl]]**. Un compte peut gérer [[acc:activite:un:une]] ou plusieurs [[nom:activite:pl]], avec ou sans [[nom:labo]][[acc:labo: central:]].

### Ce que vous voyez

Le bandeau affiche vos **compteurs de quota** : [[nom:activite:pl]] [[acc:activite:utilisé:utilisée:pl]] / [[acc:activite:inclus:incluse:pl]], et [[nom:labo:pl]] [[acc:labo:utilisé:utilisée:pl]] / [[acc:labo:inclus:incluse:pl]] si votre abonnement en prévoit ; si votre domaine distingue plusieurs types d'unités (Restaurant, Bar, Cuisine, Économat…), la répartition par type s'affiche à titre indicatif et chaque fiche porte un badge de type. Une barre de recherche filtre [[nom:activite:pl]] et [[nom:labo:pl]] par nom.

- **Section [[Pl:activite]]** : un tableau avec le *Nom*, l'*Adresse*, [[det:labo:le]]*[[Nom:labo]]* qui l'alimente (pastille 🏭 cliquable qui ouvre la fiche [[du:labo]]) et les boutons ✏️ modifier / 🗑 supprimer. Le bouton **+ [[Nouveau:activite]]** est remplacé par **⚡ Ajouter [[pl:activite]]** quand le quota est atteint : il ouvre alors une demande de supplément auprès du support.
- **Section Espace [[Court:labo:pl]]** (si votre abonnement inclut au moins [[un:labo]]) : tableau *Nom*, *Réf.*, *Adresse*, avec **+ [[Nouveau:labo]]** ou **⚡ Ajouter [[pl:labo]]** au quota atteint.

À la toute première visite, quand rien n'existe encore, un écran de démarrage propose **✨ Créer mon business** (si [[un:labo]] est [[acc:labo:inclus:incluse]]) ou **+ Ajouter [[mon:activite]]**.

### Actions pas à pas

1. **Premier démarrage avec le wizard « Créer mon business »** : à l'étape *[[Nom:labo_long]]*, saisissez le nom, la référence (unique) et l'adresse [[du:labo]] — ou cochez *Passer cette étape*. À l'étape *[[Pl:activite]]*, remplissez un bloc par [[nom:activite]] (nom obligatoire, adresse, choix **Avec [[nom:labo]]** / **Sans [[nom:labo]]**), ajoutez des blocs avec *+ Ajouter [[un:activite]]* dans la limite du quota, puis validez avec **✅ Enregistrer tout**.
2. **Créer [[un:activite]]** : *+ [[Nouveau:activite]]* → nom (un doublon de nom est signalé immédiatement), adresse facultative. Si [[un:labo:pl]] existent, choisissez **Avec [[nom:labo]]** (puis sélectionnez [[acc:labo:lequel:laquelle]] : c'est [[le:labo]] qui l'alimente) ou **Sans [[nom:labo]]** (gestion autonome). Si votre domaine propose plusieurs types [[de:activite:pl]], choisissez aussi le **type** (Restaurant, Bar…) : il préconfigure [[le:vente]] et la production de l'unité. Quand tous les emplacements prévus par votre abonnement sont créés, LabFlow vous emmène automatiquement vers [[le:referentiel:Nom]] (page Unités) pour créer [[votre:article:pl]].
3. **Créer [[un:labo]]** : nom, **référence unique** (demandée uniquement à la création), adresse, et le champ **[[acc:labo:Alimenté:Alimentée]] par** pour désigner [[acc:labo:un autre:une autre]] [[nom:labo]] qui l'approvisionne (un économat alimente une cuisine, par exemple ; les boucles sont refusées) ; vous pouvez cocher directement [[le:activite:pl]] sans [[nom:labo]] à lui rattacher.
4. **Modifier** [[un:activite]] ou [[un:labo]] avec ✏️ ; le rattachement d'[[un:activite]] (« [[acc:activite:Alimenté:Alimentée]] par ») ou la source d'[[un:labo]] (« [[acc:labo:Alimenté:Alimentée]] par ») se change dans la même fenêtre.

### Points d'attention

:::attention
La suppression est bloquée (message 🔒) tant que [[un:article:pl]] sont [[acc:article:affecté:affectée:pl]] [[au:activite]] ou [[au:labo]] : retirez d'abord [[ce:article:pl]]. La suppression d'[[un:labo]] fait passer [[son:activite:pl]] en gestion séparée, retire leur source [[au:labo:pl]] qu'[[acc:labo:il:elle]] alimentait et met fin [[au:transfert:pl]] depuis [[ce:labo]] ; elle est refusée tant que [[ce:labo]] a émis ou reçu [[un:transfert:pl]]. Ces suppressions sont irréversibles.
:::

:::astuce
Rattacher [[un:activite]] à [[un:labo]] signifie que [[son:pt:pl]] d'origine [[nom:labo]] arriveront uniquement par [[nom:transfert]] — c'est le mode de fonctionnement recommandé quand vous produisez en central ; [[un:labo]] peut [[acc:labo:lui:elle]] aussi être [[acc:labo:alimenté:alimentée]] par [[acc:labo:un autre:une autre]] [[nom:labo]] : [[le:article:pl]] [[acc:article:reçu:reçue:pl]] entrent à [[son:stock]] au prix de cession et servent de base au coût de ses productions.
:::

### Voir aussi

- [Compte, [[nom:activite:pl]] et [[nom:labo:pl]]](#compte-activites-labos) — le modèle général
- [[[Nom:transfert:pl]] [[compl:labo]] → [[nom:activite:pl]] et [[nom:labo:pl]] rattachés](#transferts)
- [[[Nom:article:pl]] [[du:referentiel]]](#referentiel-articles) — l'affectation [[du:article:pl]] par [[nom:activite]]
- [Mon abonnement](#abonnement) · [Comptes [[court:gerant:pl]]](#gerants)