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
const laboRoutes = require('./routes/labo');
const abonnementsRoutes = require('./routes/abonnements');

const { authenticate, requireWriteAccess } = require('./middleware/auth');

const app = express();

app.use(cors());
app.use(express.json());

// Enforce read-only / suspended mode for all mutating API calls (non-GET, non-auth, non-admin)
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  // Allow demandes creation even in read_only (so client can request to unblock account)
  if (req.path === '/abonnements/demandes' && req.method === 'POST') return next();
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();
  authenticate(req, res, () => requireWriteAccess(req, res, next));
});

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
app.use('/api/labo', laboRoutes);
app.use('/api/abonnements', abonnementsRoutes);

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
    // Daily job at 01:00 to enforce subscription payment deadlines (no external dep)
    const { enforcerStatuts } = require('./controllers/abonnementController');
    const scheduleDailyCheck = () => {
      const now = new Date();
      const next = new Date(now);
      next.setDate(next.getDate() + (now.getHours() >= 1 ? 1 : 0));
      next.setHours(1, 0, 0, 0);
      const delay = next.getTime() - now.getTime();
      setTimeout(() => {
        console.log('[daily] Vérification des statuts abonnements...');
        enforcerStatuts();
        setInterval(() => {
          console.log('[daily] Vérification des statuts abonnements...');
          enforcerStatuts();
        }, 24 * 60 * 60 * 1000);
      }, delay);
    };
    scheduleDailyCheck();
  })
  .catch((err) => {
    console.error('Échec des migrations, serveur non démarré:', err.message);
    process.exit(1);
  });

module.exports = app;
