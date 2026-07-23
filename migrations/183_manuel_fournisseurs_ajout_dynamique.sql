-- Ajout dynamique des fournisseurs (import Excel) : la fiche du manuel documente
-- la nouvelle fonctionnalité (bouton 📥 Ajout Dynamique de la page Fournisseurs,
-- affectation automatique à l'ensemble des activités et labos, modifiable ensuite).
UPDATE manuel_sections SET contenu = '## 🚚 Fournisseurs

Un seul écran gère vos fournisseurs : **Fournisseurs** (menu latéral 🚚) — le répertoire général du compte et ses affectations aux activités **et aux labos**.

### Ce que vous voyez

Le bandeau affiche le nombre total de fournisseurs. La barre de filtres permet une recherche par nom, téléphone ou adresse, et porte les boutons **📥 Ajout Dynamique** et **+ Nouveau fournisseur**. Le tableau principal présente :

| Colonne | Contenu |
|---|---|
| Nom | Nom du fournisseur |
| Téléphone | Numéro de téléphone |
| Adresse | Adresse du fournisseur |
| Activités liées | Pastilles des activités où il est proposé à l''appro |
| Labos liés | Pastilles 🏭 des labos où il est proposé |
| Appros | Nombre d''approvisionnements enregistrés, détaillé par activité |
| Actions | ✏️ modifier · 🗑️ supprimer (uniquement s''il n''a aucun appro) |

Le tableau est paginé par 10. Une section à part, **🏭 Fournisseurs Labo (auto-gérés)**, liste les fournisseurs créés automatiquement pour chaque labo — c''est sous ce nom que les livraisons du labo apparaissent dans les appros de vos activités. Ils affichent leurs activités liées mais ne se modifient pas ici.

### Actions pas à pas

1. **Créer un fournisseur** : *+ Nouveau fournisseur* → nom (obligatoire), téléphone, adresse. À la création, toutes vos activités sont cochées par défaut : décochez celles qui ne travaillent pas avec lui, et cochez les labos concernés.
2. **Modifier les affectations** : ✏️ sur la ligne, puis cochez/décochez activités et labos — c''est ici que vous choisissez les fournisseurs proposés à l''approvisionnement de chaque labo.
3. **Supprimer** : le bouton 🗑️ n''apparaît que si le fournisseur n''a servi à aucun approvisionnement ; une confirmation est demandée.

### Ajout dynamique (import Excel)

Le bouton **📥 Ajout Dynamique** importe vos fournisseurs en masse :

1. Téléchargez le **modèle Excel** (colonnes Nom / Téléphone / Adresse — seul le nom est obligatoire, 500 lignes maximum).
2. Remplissez-le, puis déposez le fichier dans la zone d''import.
3. Chaque fournisseur importé est **automatiquement assigné à l''ensemble de vos activités et labos** : il est immédiatement proposé partout à l''approvisionnement. Ajustez ensuite les affectations fournisseur par fournisseur (✏️) si nécessaire.

Le rapport d''import détaille chaque ligne : les noms déjà présents dans votre répertoire (ou en double dans le fichier) sont ignorés et signalés, le reste est créé.

### Points d''attention

:::attention
Un fournisseur n''est proposé à l''approvisionnement que s''il est affecté à l''activité ou au labo concerné. Si vous ne le voyez pas dans la liste au moment d''une saisie, vérifiez ses affectations ici.
:::

:::astuce
Renseignez le téléphone : il s''affiche dans les listes et facilite les commandes. La colonne Appros vous montre d''un coup d''œil quels fournisseurs sont réellement actifs.
:::

### Voir aussi

- [Stock des activités](#stock-activites) et [Stock du labo](#stock-labo) — où l''on choisit le fournisseur à l''appro
- [Factures d''approvisionnement](#factures)
- [Historique des mouvements](#historique) · [Transferts](#transferts)', updated_at = NOW()
WHERE slug = 'fournisseurs';

UPDATE manuel_sections SET contenu_defaut = contenu WHERE slug = 'fournisseurs';
