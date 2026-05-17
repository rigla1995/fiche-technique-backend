const { Bot } = require('grammy');
const pool = require('../config/database');
const { chatWithDeepSeek } = require('./deepseekService');
const { generateAndSendReport } = require('./reportService');

let bot = null;
let botUsername = null;

const EXCEL_TRIGGER = ['rapport excel', 'fichier excel', 'export excel', 'envoie excel', 'excel'];
const PDF_TRIGGER   = ['rapport pdf', 'fichier pdf', 'export pdf', 'envoie pdf'];
const EMAIL_TRIGGER = ['rapport', 'email', 'mail', 'envoie', 'send'];

function detectReportFormat(text) {
  const lower = text.toLowerCase();
  if (EXCEL_TRIGGER.some(kw => lower.includes(kw))) return 'excel';
  if (PDF_TRIGGER.some(kw => lower.includes(kw))) return 'pdf';
  return null;
}

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

const initTelegram = () => {
  if (bot) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN non défini — bot désactivé');
    return;
  }

  bot = new Bot(token);

  // ── /start TOKEN ────────────────────────────────────────────────────────
  bot.command('start', async (ctx) => {
    const chatId = ctx.chat.id;
    const inviteToken = ctx.match?.trim();

    if (!inviteToken) {
      return ctx.reply('👋 Bonjour ! Ce lien semble invalide. Contactez votre administrateur LabFlow.');
    }

    const client = await findClientByToken(inviteToken);
    if (!client) {
      return ctx.reply('❌ Lien expiré ou déjà utilisé. Contactez votre administrateur LabFlow.');
    }

    await pool.query(
      `UPDATE ai_assistant_config
       SET telegram_chat_id = $1, invite_token = NULL, updated_at = NOW()
       WHERE client_id = $2`,
      [String(chatId), client.client_id]
    );

    await ctx.reply(
      `👋 Bonjour ${client.nom} ! Je suis votre agent LabFlow.\n\nComment puis-je vous aider ? (stock, inventaire, pertes, rapport...)`
    );
  });

  // ── Messages texte ───────────────────────────────────────────────────────
  bot.on('message:text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text?.trim();
    if (!text || text.startsWith('/')) return;

    const client = await findClientByChatId(chatId);
    if (!client) return;

    await ctx.api.sendChatAction(chatId, 'typing');

    try {
      const { assistantMessage, confidence, clientEmail } = await chatWithDeepSeek(
        client.client_id,
        String(chatId),
        text,
        client.confidence_threshold
      );

      await pool.query(
        `UPDATE ai_conversations SET last_confidence = $1
         WHERE id = (
           SELECT id FROM ai_conversations
           WHERE client_id = $2 AND whatsapp_number = $3
           ORDER BY updated_at DESC LIMIT 1
         )`,
        [confidence, client.client_id, String(chatId)]
      );

      const format = detectReportFormat(text);
      const lower = text.toLowerCase();
      const wantsEmail = EMAIL_TRIGGER.some(kw => lower.includes(kw));

      if (format && wantsEmail && clientEmail) {
        await ctx.reply(`⏳ Je génère votre rapport ${format.toUpperCase()}...`);
        try {
          const filename = await generateAndSendReport(client.client_id, clientEmail, client.nom, format);
          await ctx.reply(`✅ Rapport ${format.toUpperCase()} envoyé à ${clientEmail} (${filename})`);
        } catch (e) {
          console.error('[Telegram] Report generation error:', e.message);
          await ctx.reply('❌ Erreur lors de la génération du rapport. Réessayez.');
        }
      } else {
        await ctx.reply(assistantMessage, { parse_mode: 'Markdown' });
      }
    } catch (err) {
      console.error('[Telegram] handleMessage error:', err.message);
      await ctx.reply('Désolé, une erreur est survenue. Réessayez dans quelques instants.');
    }
  });

  bot.catch((err) => {
    console.error('[Telegram] polling error:', err.message);
  });

  bot.api.getMe().then((info) => {
    botUsername = info.username;
    console.log(`[Telegram] Bot connecté : @${botUsername}`);
  });

  // Start polling (non-blocking)
  bot.start({ drop_pending_updates: true }).catch((err) => {
    console.error('[Telegram] Fatal polling error:', err.message);
  });
};

const getBotUsername = () => botUsername;

const sendWelcomeMessage = async (chatId, clientNom) => {
  if (!bot) throw new Error('Bot Telegram non initialisé');
  await bot.api.sendMessage(
    chatId,
    `👋 Bonjour ${clientNom} ! Je suis votre agent LabFlow.\n\nComment puis-je vous aider ? (stock, inventaire, pertes, rapport...)`
  );
};

module.exports = { initTelegram, getBotUsername, sendWelcomeMessage };
