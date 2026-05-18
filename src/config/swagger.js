const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Fiche Technique API',
      version: '1.0.0',
      description: 'API de gestion des fiches techniques, stock, activités et labos.',
      contact: { name: 'Support', email: 'support@fichetechnique.app' },
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Développement' },
      { url: 'https://api.fichetechnique.app', description: 'Production' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT obtenu via POST /auth/login',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Erreur serveur' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['super_admin', 'client', 'gerant'] },
            onboardingStep: { type: 'integer', description: '0=terminé, 1=chgt mdp, 2=créer activités, 3=sélectionner ingrédients' },
            entrepriseName: { type: 'string', nullable: true },
            modeCompte: { type: 'string', enum: ['actif', 'read_only', 'desactive', 'archive', 'bloque'] },
            gerantParentId: { type: 'integer', nullable: true },
            gerantActiviteId: { type: 'integer', nullable: true },
            gerantActiviteType: { type: 'string', enum: ['activite', 'labo'], nullable: true },
          },
        },
        Activite: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            nom: { type: 'string' },
            adresse: { type: 'string', nullable: true },
            telephone: { type: 'string', nullable: true },
            email: { type: 'string', nullable: true },
            laboId: { type: 'integer', nullable: true },
            ingredientCount: { type: 'integer' },
          },
        },
        Labo: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            nom: { type: 'string' },
            adresse: { type: 'string', nullable: true },
            telephone: { type: 'string', nullable: true },
            ingredientCount: { type: 'integer' },
          },
        },
        Ingredient: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            nom: { type: 'string' },
            unite: { type: 'string' },
            categorie: { type: 'string', nullable: true },
            prixUnitaire: { type: 'number', format: 'float', nullable: true },
          },
        },
        StockEntry: {
          type: 'object',
          properties: {
            ingredientId: { type: 'integer' },
            nom: { type: 'string' },
            categorie: { type: 'string', nullable: true },
            unite: { type: 'string' },
            quantite: { type: 'number' },
            prixUnitaire: { type: 'number', nullable: true },
            seuilMin: { type: 'number', nullable: true },
          },
        },
        CatalogueIngredient: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            nom: { type: 'string' },
            unite: { type: 'string' },
            categorie: { type: 'string' },
            contexts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['activite', 'labo'] },
                  id: { type: 'integer' },
                  nom: { type: 'string' },
                  assigned: { type: 'boolean' },
                },
              },
            },
          },
        },
        Fournisseur: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            nom: { type: 'string' },
            adresse: { type: 'string', nullable: true },
            telephone: { type: 'string', nullable: true },
            activiteIds: { type: 'array', items: { type: 'integer' } },
            laboIds: { type: 'array', items: { type: 'integer' } },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentification et profil utilisateur' },
      { name: 'Entreprise', description: 'Profil entreprise, activités, catalogue global' },
      { name: 'Labo', description: 'Gestion des laboratoires' },
      { name: 'Stock', description: 'Stock par activité et historique appros' },
      { name: 'Fournisseurs', description: 'Gestion des fournisseurs' },
      { name: 'Produits', description: 'Fiches techniques et recettes' },
      { name: 'Rapports', description: 'Rapports pertes, appros, valorisation' },
      { name: 'Admin', description: 'Administration (super_admin uniquement)' },
    ],
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
