const TelegramBot = require('node-telegram-bot-api');
const pool = require('../config/database');
const { chatWithDeepSeek } = require('./deepseekService');
const { sendRapportEmail } = require('./emailService');

let bot = null;
let botUsername = null;

const EMAIL_TRIGGER = ['email', 'mail', 'rapport par email', 'envoie le rapport', 'envoyer le rapport'];

const findClientByToken = async (token) => {
  const result = await pool.query(
    `SELECT aic.client_id, aic.confidence_threshold, u.nom, u.email
     FROM ai_assistant_config aic
     JOIN utilisateurs u ON u.id = aic.client_id
     WHERE aic.invite_token = $1 AND aic.enabled = true`,
    [token]
  );
  return result.rows[0] || null;
};

const findClientByChatId = async (chatId) => {
  const result = await pool.query(
    `SELECT aic.client_id, aic.confidence_threshold, u.nom, u.email
     FROM ai_assistant_config aic
     JOIN utilisateurs u ON u.id = aic.client_id
     WHERE aic.telegram_chat_id = $1 AND aic.enabled = true`,
    [String(chatId)]
  );
  return result.rows[0] || null;
};

const handleStart = async (msg, match) => {
  const chatId = msg.chat.id;
  const token = match?.[1]?.trim();

  if (!token) {
    return bot.sendMessage(chatId, '👋 Bonjour ! Ce lien semble invalide. Contactez votre administrateur LabFlow.');
  }

  const client = await findClientByToken(token);
  if (!client) {
    return bot.sendMessage(chatId, '❌ Lien expiré ou déjà utilisé. Contactez votre administrateur LabFlow.');
  }

  // Store telegram_chat_id and clear invite_token (single-use)
  await pool.query(
    `UPDATE ai_assistant_config
     SET telegram_chat_id = $1, invite_token = NULL, updated_at = NOW()
     WHERE client_id = $2`,
    [String(chatId), client.client_id]
  );

  await bot.sendMessage(
    chatId,
    `👋 Bonjour ${client.nom} ! Je suis votre agent LabFlow.\n\nComment puis-je vous aider ? (stock, inventaire, pertes, rapport...)`
  );
};

const handleMessage = async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  if (!text || text.startsWith('/')) return;

  const client = await findClientByChatId(chatId);
  if (!client) return;

  // Typing indicator
  await bot.sendChatAction(chatId, 'typing');

  try {
    const { assistantMessage, confidence, clientEmail } = await chatWithDeepSeek(
      client.client_id,
      String(chatId),
      text,
      client.confidence_threshold
    );

    // Update last_confidence in conversation
    await pool.query(
      `UPDATE ai_conversations SET last_confidence = $1
       WHERE id = (
         SELECT id FROM ai_conversations
         WHERE client_id = $2 AND whatsapp_number = $3
         ORDER BY updated_at DESC LIMIT 1
       )`,
      [confidence, client.client_id, String(chatId)]
    );

    // Confidence disclaimer if below threshold
    let reply = assistantMessage;
    if (confidence !== null && confidence < client.confidence_threshold) {
      reply += `\n\n⚠️ _Confiance faible (${Math.round(confidence * 100)}%) — vérifiez dans LabFlow._`;
    }

    await bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });

    // Email report trigger
    const lower = text.toLowerCase();
    if (EMAIL_TRIGGER.some(kw => lower.includes(kw)) && clientEmail) {
      try {
        await sendRapportEmail({ to: clientEmail, clientNom: client.nom, rapportText: assistantMessage });
        await bot.sendMessage(chatId, `✅ Rapport envoyé à ${clientEmail}`);
      } catch (e) {
        console.error('[Telegram] Email rapport error:', e.message);
      }
    }
  } catch (err) {
    console.error('[Telegram] handleMessage error:', err.message);
    await bot.sendMessage(chatId, 'Désolé, une erreur est survenue. Réessayez dans quelques instants.');
  }
};

const initTelegram = () => {
  if (bot) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN non défini — bot désactivé');
    return;
  }

  bot = new TelegramBot(token, { polling: true });

  bot.getMe().then((info) => {
    botUsername = info.username;
    console.log(`[Telegram] Bot connecté : @${botUsername}`);
  });

  bot.onText(/\/start(.*)/, handleStart);
  bot.on('message', handleMessage);

  bot.on('polling_error', (err) => {
    console.error('[Telegram] polling error:', err.message);
  });
};

const getBotUsername = () => botUsername;

const sendWelcomeMessage = async (chatId, clientNom) => {
  if (!bot) throw new Error('Bot Telegram non initialisé');
  await bot.sendMessage(
    chatId,
    `👋 Bonjour ${clientNom} ! Je suis votre agent LabFlow.\n\nComment puis-je vous aider ? (stock, inventaire, pertes, rapport...)`
  );
};

module.exports = { initTelegram, getBotUsername, sendWelcomeMessage };
