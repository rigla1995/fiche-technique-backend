const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const pool = require('../config/database');
const { chatWithDeepSeek } = require('./deepseekService');
const { sendRapportEmail } = require('./emailService');
const { fetchClientContext, buildSystemPrompt } = require('./deepseekService');

let whatsappClient = null;
let currentQR = null;
let isReady = false;
let botNumber = null;

// Keywords that trigger email report sending
const EMAIL_TRIGGER_KEYWORDS = ['envoie', 'rapport', 'email', 'mail', 'bilan', 'résumé', 'rapport par email'];

const normalizeNumber = (num) => (num || '').replace(/[\s+\-().]/g, '');

const findClientByWhatsApp = async (senderRaw) => {
  // sender is like '21698765432@c.us'
  const senderNum = senderRaw.replace('@c.us', '');
  const result = await pool.query(
    `SELECT u.id, u.nom, u.email, aic.whatsapp_number
     FROM ai_assistant_config aic
     JOIN utilisateurs u ON u.id = aic.client_id
     WHERE aic.enabled = true
       AND aic.whatsapp_number IS NOT NULL
       AND REGEXP_REPLACE(aic.whatsapp_number, '[^0-9]', '', 'g') = $1`,
    [senderNum]
  );
  return result.rows[0] || null;
};

const handleMessage = async (msg) => {
  if (msg.isGroupMsg || msg.fromMe) return;

  const client = await findClientByWhatsApp(msg.from);
  if (!client) return;

  const userText = msg.body?.trim();
  if (!userText) return;

  // Acknowledge receipt
  const chat = await msg.getChat();

  try {
    const { assistantMessage, clientEmail } = await chatWithDeepSeek(
      client.id,
      msg.from.replace('@c.us', ''),
      userText
    );

    await whatsappClient.sendMessage(msg.from, assistantMessage);

    // If message is about email report, send it
    const lower = userText.toLowerCase();
    const wantsEmail = EMAIL_TRIGGER_KEYWORDS.some(kw => lower.includes(kw)) && lower.includes('email');
    if (wantsEmail && clientEmail) {
      try {
        await sendRapportEmail({ to: clientEmail, clientNom: client.nom, rapportText: assistantMessage });
        await whatsappClient.sendMessage(msg.from, `✅ Rapport envoyé à ${clientEmail}`);
      } catch (e) {
        console.error('[WhatsApp] Email rapport error:', e.message);
      }
    }
  } catch (err) {
    console.error('[WhatsApp] handleMessage error:', err.message);
    await whatsappClient.sendMessage(msg.from, 'Désolé, une erreur est survenue. Réessayez dans quelques instants.');
  }
};

const initWhatsApp = () => {
  if (whatsappClient) return;

  console.log('[WhatsApp] Initialisation du client...');

  whatsappClient = new Client({
    authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
      ],
      ...(process.env.PUPPETEER_EXECUTABLE_PATH
        ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
        : {}),
    },
  });

  whatsappClient.on('qr', async (qr) => {
    currentQR = qr;
    isReady = false;
    console.log('[WhatsApp] QR code généré — scannez via l\'interface admin');
  });

  whatsappClient.on('authenticated', () => {
    console.log('[WhatsApp] Authentifié');
    currentQR = null;
  });

  whatsappClient.on('ready', async () => {
    isReady = true;
    currentQR = null;
    const info = whatsappClient.info;
    botNumber = info?.wid?.user || null;
    console.log(`[WhatsApp] Prêt — numéro bot: ${botNumber}`);
  });

  whatsappClient.on('disconnected', (reason) => {
    console.log('[WhatsApp] Déconnecté:', reason);
    isReady = false;
    whatsappClient = null;
    // Reconnect after delay
    setTimeout(initWhatsApp, 10000);
  });

  whatsappClient.on('message', handleMessage);

  whatsappClient.initialize().catch((err) => {
    console.error('[WhatsApp] Init error:', err.message);
  });
};

const getStatus = async () => {
  let qrDataUrl = null;
  if (currentQR) {
    try {
      qrDataUrl = await qrcode.toDataURL(currentQR, { errorCorrectionLevel: 'M', margin: 2, scale: 6 });
    } catch (e) {
      console.error('[WhatsApp] QR generation error:', e.message);
    }
  }
  return {
    ready: isReady,
    hasQR: !!currentQR,
    qrDataUrl,
    botNumber,
  };
};

const sendMessage = async (toNumber, text) => {
  if (!isReady || !whatsappClient) throw new Error('WhatsApp non prêt');
  const chatId = normalizeNumber(toNumber) + '@c.us';
  await whatsappClient.sendMessage(chatId, text);
};

module.exports = { initWhatsApp, getStatus, sendMessage };
