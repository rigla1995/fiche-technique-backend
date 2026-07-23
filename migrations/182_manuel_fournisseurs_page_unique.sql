-- Page unique Fournisseurs : l'écran « Fournisseurs Labo » (/client/fournisseurs-labo)
-- est SUPPRIMÉ du front — la page Fournisseurs gère déjà les affectations activités ET labos.
-- La fiche du manuel est réécrite (contenu ET contenu_defaut : elle ne doit plus documenter
-- un écran disparu, y compris pour le RAG de l'assistant IA).
UPDATE manuel_sections SET contenu = '## 🚚 Fournisseurs

Un seul écran gère vos fournisseurs : **Fournisseurs** (menu latéral 🚚) — le répertoire général du compte et ses affectations aux activités **et aux labos**.

### Ce que vous voyez

Le bandeau affiche le nombre total de fournisseurs. La barre de filtres permet une recherche par nom, téléphone ou adresse, et porte le bouton **+ Nouveau fournisseur**. Le tableau principal présente :

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

-- L'écran « Tableau de bord du gérant » a été supprimé (2026-07-23) : fiche désactivée.
UPDATE manuel_sections SET actif = false, updated_at = NOW() WHERE slug = 'dashboard-gerant';
