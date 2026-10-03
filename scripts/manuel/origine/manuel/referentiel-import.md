## 📥 Ajout dynamique (import Excel)

L'Ajout Dynamique permet d'importer en masse vos articles — et en même temps leurs unités, catégories et familles — depuis un fichier Excel. Vous y accédez depuis le menu **Référentiel → Ajout Dynamique**. C'est le moyen le plus rapide de constituer votre référentiel au démarrage.

### Ce que vous voyez

L'écran se présente en étapes numérotées :

- **1️⃣ Téléchargez le modèle** : bouton **📄 Télécharger modele_referentiel.xlsx**, un fichier Excel avec les colonnes **Article / Unité / Catégorie / Famille**.
- **2️⃣ Uploadez votre fichier rempli** : une zone où **glisser-déposer** le fichier (ou cliquer pour le sélectionner), avec une limite de **1 000 lignes par fichier**. Une fois le fichier choisi, son nom et sa taille s'affichent, avec les boutons **Changer de fichier** et **🚀 Lancer l'import**.
- **Le bilan d'import** : un récapitulatif « Import terminé » avec le nombre de lignes traitées, des compteurs par type (**Articles**, **Auto-affectés**, **Catégories**, **Familles**, **Unités**, **Erreurs**) et un tableau détaillé ligne par ligne : **Ligne / Article / Créé / Existant / Affectation / Statut**.

### Actions pas à pas

1. Cliquez sur **📄 Télécharger modele_referentiel.xlsx** et ouvrez le fichier dans Excel.
2. Remplissez **une ligne par article** : nom de l'article, unité, catégorie et famille. Les unités, catégories et familles qui n'existent pas encore dans votre référentiel seront **créées automatiquement**.
3. Glissez le fichier rempli dans la zone d'import (format Excel .xlsx) puis cliquez sur **🚀 Lancer l'import**.
4. Lisez le bilan : la colonne **Créé** liste les éléments ajoutés par la ligne, la colonne **Existant** ceux qui ont été reconnus et réutilisés. Les lignes en erreur sont surlignées ; survolez le symbole ❌ pour lire la cause exacte.
5. Corrigez si besoin les lignes en erreur dans votre fichier, puis cliquez sur **Importer un autre fichier** pour relancer.

Les articles importés sont **automatiquement affectés** à vos activités et labos : ils sont immédiatement utilisables en stock et en approvisionnement. Si un article existait déjà mais n'était affecté nulle part, il est assigné automatiquement et signalé par le badge **🔗 auto** dans la colonne Affectation.

### Points d'attention

:::attention
Respectez l'orthographe des unités, familles et catégories déjà présentes dans votre référentiel : toute variante d'écriture (accent, pluriel…) peut créer un doublon. Seules les différences de majuscules/minuscules et les espaces en début ou fin de nom sont tolérées pour les articles, unités et familles.
:::

:::attention
Le fichier doit être au format Excel (.xlsx) et ne pas dépasser **1 000 lignes**. Au-delà, découpez votre catalogue en plusieurs fichiers.
:::

:::astuce
Après un import, ajustez finement quelles activités et quels labos utilisent chaque article depuis sa fiche ([Articles](#referentiel-articles)).
:::

### Voir aussi

- [Articles](#referentiel-articles) — création manuelle à l'unité ou en série
- [Articles](#referentiel-articles) — ajuster les affectations après import
- [Unités](#referentiel-unites), [Familles](#referentiel-familles), [Catégories](#referentiel-categories)
- [Bien démarrer](#demarrage)