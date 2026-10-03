## 📥 Ajout dynamique (import Excel)

L'Ajout Dynamique permet d'importer en masse [[votre:article:pl]] — et en même temps leurs unités, catégories et familles — depuis un fichier Excel. Vous y accédez depuis le menu **[[Nom:referentiel]] → Ajout Dynamique**. C'est le moyen le plus rapide de constituer [[votre:referentiel]] au démarrage.

### Ce que vous voyez

L'écran se présente en étapes numérotées :

- **1️⃣ Téléchargez le modèle** : bouton **📄 Télécharger modele_referentiel.xlsx**, un fichier Excel avec les colonnes **[[Nom:article]] / Unité / Catégorie / Famille**.
- **2️⃣ Uploadez votre fichier rempli** : une zone où **glisser-déposer** le fichier (ou cliquer pour le sélectionner), avec une limite de **1 000 lignes par fichier**. Une fois le fichier choisi, son nom et sa taille s'affichent, avec les boutons **Changer de fichier** et **🚀 Lancer l'import**.
- **Le bilan d'import** : un récapitulatif « Import terminé » avec le nombre de lignes traitées, des compteurs par type (**[[Nom:article:pl]]**, **Auto-[[acc:article:affecté:affectée:pl]]**, **Catégories**, **Familles**, **Unités**, **Erreurs**) et un tableau détaillé ligne par ligne : **Ligne / [[Nom:article]] / Créé / Existant / Affectation / Statut**.

### Actions pas à pas

1. Cliquez sur **📄 Télécharger modele_referentiel.xlsx** et ouvrez le fichier dans Excel.
2. Remplissez **une ligne par [[nom:article]]** : nom [[du:article]], unité, catégorie et famille. Les unités, catégories et familles qui n'existent pas encore dans [[votre:referentiel]] seront **créées automatiquement**.
3. Glissez le fichier rempli dans la zone d'import (format Excel .xlsx) puis cliquez sur **🚀 Lancer l'import**.
4. Lisez le bilan : la colonne **Créé** liste les éléments ajoutés par la ligne, la colonne **Existant** ceux qui ont été reconnus et réutilisés. Les lignes en erreur sont surlignées ; survolez le symbole ❌ pour lire la cause exacte.
5. Corrigez si besoin les lignes en erreur dans votre fichier, puis cliquez sur **Importer un autre fichier** pour relancer.

[[Le:article:pl]] [[acc:article:importé:importée:pl]] sont **automatiquement [[acc:article:affecté:affectée:pl]]** à [[votre:activite:pl]] et [[nom:labo:pl]] : [[acc:article:il:elle:pl]] sont immédiatement utilisables en [[nom:stock]] et en [[nom:appro]]. Si [[un:article]] existait déjà mais n'était [[acc:article:affecté:affectée]] nulle part, [[acc:article:il:elle]] est [[acc:article:assigné:assignée]] automatiquement et [[acc:article:signalé:signalée]] par le badge **🔗 auto** dans la colonne Affectation.

### Points d'attention

:::attention
Respectez l'orthographe des unités, familles et catégories déjà présentes dans [[votre:referentiel]] : toute variante d'écriture (accent, pluriel…) peut créer un doublon. Seules les différences de majuscules/minuscules et les espaces en début ou fin de nom sont tolérées pour [[le:article:pl]], unités et familles.
:::

:::attention
Le fichier doit être au format Excel (.xlsx) et ne pas dépasser **1 000 lignes**. Au-delà, découpez votre catalogue en plusieurs fichiers.
:::

:::astuce
Après un import, ajustez finement [[acc:activite:quel:quelle:pl]] [[nom:activite:pl]] et [[acc:labo:quel:quelle:pl]] [[nom:labo:pl]] utilisent chaque [[nom:article]] depuis sa fiche ([[[Nom:article:pl]]](#referentiel-articles)).
:::

### Voir aussi

- [[[Nom:article:pl]]](#referentiel-articles) — création manuelle à l'unité ou en série
- [[[Nom:article:pl]]](#referentiel-articles) — ajuster les affectations après import
- [Unités](#referentiel-unites), [Familles](#referentiel-familles), [Catégories](#referentiel-categories)
- [Bien démarrer](#demarrage)