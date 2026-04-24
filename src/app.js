require('dotenv').config();
const express = require('express');
const cors = require('cors');
const migrate = require('./config/migrate');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const unitesRoutes = require('./routes/unites');
const ingredientsRoutes = require('./routes/ingredients');
const produitsRoutes = require('./routes/produits');
const categoriesRoutes = require('./routes/categories');
const entrepriseRoutes = require('./routes/entreprise');
const stockRoutes = require('./routes/stock');
const domainesRoutes = require('./routes/domaines');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);

// French routes
app.use('/api/unites', unitesRoutes);
app.use('/api/ingredients', ingredientsRoutes);
app.use('/api/produits', produitsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/entreprise', entrepriseRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/domaines', domainesRoutes);

// English aliases (B5)
app.use('/api/units', unitesRoutes);
app.use('/api/ingredients', ingredientsRoutes); // already mounted
app.use('/api/products', produitsRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Root aliases without /api/ prefix (B-NEW-4)
app.use('/units', unitesRoutes);
app.use('/ingredients', ingredientsRoutes);
app.use('/products', produitsRoutes);
app.use('/categories', categoriesRoutes);

app.use((req, res) => res.status(404).json({ message: 'Route introuvable' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Erreur serveur interne' });
});

const PORT = process.env.PORT || 3000;
migrate()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Serveur démarré sur le port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Échec des migrations, serveur non démarré:', err.message);
    process.exit(1);
  });

module.exports = app;
