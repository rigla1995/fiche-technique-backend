require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET manquant dans .env');
  process.exit(1);
}
if (process.env.JWT_SECRET === 'changez_moi_en_production') {
  console.error('FATAL: JWT_SECRET est encore la valeur d\'exemple. Générez-en un fort : node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.warn('[secu] JWT_SECRET court (<32 caractères) — utilisez ≥64 octets aléatoires en production.');
}

const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const migrate = require('./config/migrate');
const logger = require('./utils/logger');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const unitesRoutes = require('./routes/unites');
const articlesRoutes = require('./routes/articles');
const famillesRoutes = require('./routes/familles');
const produitsRoutes = require('./routes/produits');
const categoriesRoutes = require('./routes/categories');
const categoriesProduitRoutes = require('./routes/categoriesProduit');
const dashboardRoutes = require('./routes/dashboard');
const entrepriseRoutes = require('./routes/entreprise');
const stockRoutes = require('./routes/stock');
const domainesRoutes = require('./routes/domaines');
const laboRoutes = require('./routes/labo');
const abonnementsRoutes = require('./routes/abonnements');
const rapportsRoutes = require('./routes/rapports');
const notificationsRoutes = require('./routes/notifications');
const aiAssistantRoutes = require('./routes/aiAssistant');
const ventesRoutes = require('./routes/ventes');
const referentielRoutes = require('./routes/referentiel');
const gerantRoutes = require('./routes/gerant');
const facturesRoutes = require('./routes/factures');
const manuelRoutes = require('./routes/manuel');
const { verifyWebhook, receiveWebhook } = require('./services/messengerService');
const { docusealWebhook } = require('./controllers/webhookController');

const { authenticate, requireWriteAccess } = require('./middleware/auth');

const app = express();

// Derrière le reverse proxy (Coolify/nginx) : faire confiance au 1er hop
// pour que req.ip / X-Forwarded-For soient corrects (requis par express-rate-limit).
app.set('trust proxy', 1);

app.use(cors());
// Capture the raw request body so webhook handlers can verify HMAC/secret signatures.
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// Swagger UI — exposed only outside production to avoid handing a full API map to
// attackers. Set NODE_ENV=production in the deployment env (Coolify) to disable it.
if (process.env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Fiche Technique API',
    swaggerOptions: { persistAuthorization: true },
  }));
  app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));
}

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
app.use('/api/categories-produit', categoriesProduitRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/entreprise', entrepriseRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/domaines', domainesRoutes);
app.use('/api/labo', laboRoutes);
app.use('/api/abonnements', abonnementsRoutes);
app.use('/api/rapports', rapportsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/ai-assistant', aiAssistantRoutes);
app.get('/api/messenger/webhook', verifyWebhook);
app.post('/api/messenger/webhook', receiveWebhook);
app.post('/api/webhooks/docuseal', docusealWebhook);
app.use('/api', ventesRoutes);
app.use('/api/referentiel', referentielRoutes);
app.use('/api/gerant', gerantRoutes);
app.use('/api/factures', facturesRoutes);
app.use('/api/manuel', manuelRoutes);

app.use('/api/products', produitsRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use((req, res) => res.status(404).json({ message: 'Route introuvable' }));

app.use((err, req, res, next) => {
  logger.error('unhandled_request_error', {
    method: req.method,
    path: req.originalUrl,
    userId: req.user?.id || null,
    error: err.message,
    stack: err.stack,
  });
  res.status(500).json({ message: 'Erreur serveur interne' });
});

// Never let an unhandled async error silently crash the process without a trace.
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', { error: reason?.message || String(reason), stack: reason?.stack });
});
process.on('uncaughtException', (err) => {
  logger.error('uncaught_exception', { error: err?.message, stack: err?.stack });
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
  })
  .catch((err) => {
    console.error('Échec des migrations, serveur non démarré:', err.message);
    process.exit(1);
  });

module.exports = app;
