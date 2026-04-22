# Fiche Technique Backend

API REST pour l'application de fiches techniques restaurants.

## Stack technique

- **Node.js + Express** — serveur REST
- **PostgreSQL** — base de données relationnelle
- **JWT** — authentification multi-rôles
- **exceljs** — génération Excel professionnelle

## Prérequis

- Node.js 18+
- PostgreSQL 14+

## Installation

```bash
cd backend
npm install
```

## Configuration

Copier `.env.example` en `.env` et renseigner les valeurs :

```bash
cp .env.example .env
```

Variables requises :

| Variable | Description | Exemple |
|---|---|---|
| `PORT` | Port du serveur | `3000` |
| `DB_HOST` | Hôte PostgreSQL | `localhost` |
| `DB_PORT` | Port PostgreSQL | `5432` |
| `DB_NAME` | Nom de la base | `fiche_technique` |
| `DB_USER` | Utilisateur PostgreSQL | `postgres` |
| `DB_PASSWORD` | Mot de passe PostgreSQL | `secret` |
| `JWT_SECRET` | Clé secrète JWT (longue) | `change-this-key` |
| `JWT_EXPIRES_IN` | Durée token | `24h` |

## Base de données

Créer la base puis exécuter les migrations :

```bash
createdb fiche_technique
npm run migrate
```

Le script de migration crée toutes les tables et insère un Super Admin par défaut :
- **Email :** `admin@fiche-technique.tn`
- **Mot de passe :** `Admin@1234`

## Démarrage

```bash
# Production
npm start

# Développement (rechargement automatique)
npm run dev
```

## Endpoints API

### Authentification

| Méthode | Endpoint | Accès | Description |
|---|---|---|---|
| `POST` | `/auth/login` | Public | Connexion |
| `POST` | `/auth/register` | Super Admin | Créer un compte client |
| `GET` | `/auth/me` | Authentifié | Profil courant |

### Unités (paramétrage)

| Méthode | Endpoint | Accès | Description |
|---|---|---|---|
| `GET` | `/api/unites` | Authentifié | Liste des unités |
| `POST` | `/api/unites` | Authentifié | Créer une unité |
| `PUT` | `/api/unites/:id` | Authentifié | Modifier une unité |
| `DELETE` | `/api/unites/:id` | Authentifié | Supprimer une unité |

### Ingrédients (paramétrage)

| Méthode | Endpoint | Accès | Description |
|---|---|---|---|
| `GET` | `/api/ingredients` | Authentifié | Liste des ingrédients |
| `GET` | `/api/ingredients/:id` | Client | Détail d'un ingrédient |
| `POST` | `/api/ingredients` | Client | Créer un ingrédient |
| `PUT` | `/api/ingredients/:id` | Client | Modifier un ingrédient |
| `DELETE` | `/api/ingredients/:id` | Client | Supprimer un ingrédient |

### Produits

| Méthode | Endpoint | Accès | Description |
|---|---|---|---|
| `GET` | `/api/produits` | Client | Liste des produits |
| `GET` | `/api/produits/:id` | Client | Détail + composition |
| `POST` | `/api/produits` | Client | Créer un produit |
| `PUT` | `/api/produits/:id` | Client | Modifier un produit |
| `DELETE` | `/api/produits/:id` | Client | Supprimer un produit |
| `POST` | `/api/produits/:id/ingredients` | Client | Ajouter/mettre à jour un ingrédient |
| `DELETE` | `/api/produits/:id/ingredients/:ingredientId` | Client | Retirer un ingrédient |
| `POST` | `/api/produits/:id/sous-produits` | Client | Ajouter un sous-produit |
| `DELETE` | `/api/produits/:id/sous-produits/:sousProduitId` | Client | Retirer un sous-produit |
| `GET` | `/api/produits/:id/cout` | Client | Calcul du coût (récursif) |
| `GET` | `/api/produits/:id/export` | Client | Export fiche technique Excel |

## Exemple de requêtes

### Connexion
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@fiche-technique.tn","mot_de_passe":"Admin@1234"}'
```

### Créer un client (Super Admin)
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"nom":"Restaurant Tunis","email":"client@restaurant.tn","mot_de_passe":"Pass@1234","telephone":"+21621000000"}'
```

### Exporter une fiche technique
```bash
curl -X GET http://localhost:3000/api/produits/1/export \
  -H "Authorization: Bearer <TOKEN>" \
  --output fiche-technique.xlsx
```

## Architecture multi-tenant

Chaque client (rôle `client`) ne voit que ses propres données. L'isolation est assurée au niveau des requêtes SQL via le `client_id` extrait du token JWT.

Le Super Admin a accès en lecture à toutes les données (unités, ingrédients) mais ne peut pas créer de produits.

## Modèle de données

```
utilisateurs (id, nom, email, mot_de_passe, telephone, role, actif)
     │
     ├── unites (id, nom, client_id)
     │
     ├── ingredients (id, nom, prix, unite_id, client_id)
     │
     └── produits (id, nom, description, client_id)
          ├── produit_ingredients (produit_id, ingredient_id, portion, unite_id)
          └── produit_sous_produits (produit_id, sous_produit_id, portion)
```
