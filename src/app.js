require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET manquant dans .env');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const migrate = require('./config/migrate');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const unitesRoutes = require('./routes/unites');
const articlesRoutes = require('./routes/articles');
const famillesRoutes = require('./routes/familles');
const produitsRoutes = require('./routes/produits');
const categoriesRoutes = require('./routes/categories');
const entrepriseRoutes = require('./routes/entreprise');
const stockRoutes = require('./routes/stock');
const domainesRoutes = require('./routes/domaines');
const laboRoutes = require('./routes/labo');
const abonnementsRoutes = require('./routes/abonnements');
const fournisseursIndepRoutes = require('./routes/fournisseurs');
const rapportsRoutes = require('./routes/rapports');
const notificationsRoutes = require('./routes/notifications');
const aiAssistantRoutes = require('./routes/aiAssistant');
const ventesRoutes = require('./routes/ventes');
const referentielRoutes = require('./routes/referentiel');
const gerantRoutes = require('./routes/gerant');
const { initTelegram } = require('./services/telegramService');
const { verifyWebhook, receiveWebhook } = require('./services/messengerService');

const { authenticate, requireWriteAccess } = require('./middleware/auth');

const app = express();

app.use(cors());
app.use(express.json());

// Swagger UI — available at /api-docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Fiche Technique API',
  swaggerOptions: { persistAuthorization: true },
}));
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

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
app.use('/api/articles', articlesRoutes);
app.use('/api/familles', famillesRoutes);
// Legacy alias kept for compatibility during FE migration
app.use('/api/ingredients', articlesRoutes);
app.use('/api/produits', produitsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/entreprise', entrepriseRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/domaines', domainesRoutes);
app.use('/api/labo', laboRoutes);
app.use('/api/abonnements', abonnementsRoutes);
app.use('/api/fournisseurs', fournisseursIndepRoutes);
app.use('/api/rapports', rapportsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/ai-assistant', aiAssistantRoutes);
app.get('/api/messenger/webhook', verifyWebhook);
app.post('/api/messenger/webhook', receiveWebhook);
app.use('/api', ventesRoutes);
app.use('/api/referentiel', referentielRoutes);
app.use('/api/gerant', gerantRoutes);

app.use('/api/products', produitsRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use((req, res) => res.status(404).json({ message: 'Route introuvable' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Erreur serveur interne' });
});

const PORT = process.env.PORT || 3000;
migrate()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`Serveur démarré sur le port ${PORT}`);
    });
    // Daily job at 01:00 to enforce subscription payment deadlines (no external dep)
    const { enforcerStatuts } = require('./controllers/abonnementController');
    let dailyInterval = null;
    const scheduleDailyCheck = () => {
      const now = new Date();
      const next = new Date(now);
      next.setDate(next.getDate() + (now.getHours() >= 1 ? 1 : 0));
      next.setHours(1, 0, 0, 0);
      const delay = next.getTime() - now.getTime();
      setTimeout(() => {
        console.log('[daily] Vérification des statuts abonnements...');
        enforcerStatuts();
        if (dailyInterval) clearInterval(dailyInterval);
        dailyInterval = setInterval(() => {
          console.log('[daily] Vérification des statuts abonnements...');
          enforcerStatuts();
        }, 24 * 60 * 60 * 1000);
      }, delay);
    };
    scheduleDailyCheck();
    process.on('SIGTERM', () => { if (dailyInterval) clearInterval(dailyInterval); server.close(() => process.exit(0)); });
    process.on('SIGINT', () => { if (dailyInterval) clearInterval(dailyInterval); server.close(() => process.exit(0)); });
    // Initialize Telegram bot (requires TELEGRAM_BOT_TOKEN in .env)
    initTelegram();
  })
  .catch((err) => {
    console.error('Échec des migrations, serveur non démarré:', err.message);
    process.exit(1);
  });

module.exports = app;
