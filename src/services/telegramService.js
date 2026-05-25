const { Bot } = require('grammy');
const pool = require('../config/database');
const { chatWithClaude } = require('./claudeService');
const { chatWithDeepSeek } = require('./deepseekService');
const { generateAndSendReport } = require('./reportService');

async function chatWithAI(clientId, chatSessionId, userMessage, confidenceThreshold) {
  if (process.env.ANTHROPIC_API_KEY) {
    return chatWithClaude(clientId, chatSessionId, userMessage, confidenceThreshold);
  }
  return chatWithDeepSeek(clientId, chatSessionId, userMessage, confidenceThreshold);
}

let bot = null;
let botUsername = null;

const findClientByToken = async (token) => {
  const { rows } = await pool.query(
    `SELECT aic.client_id, aic.confidence_threshold, u.nom, u.email
     FROM ai_assistant_config aic
     JOIN utilisateurs u ON u.id = aic.client_id
     WHERE aic.invite_token = $1 AND aic.enabled = true`,
    [token]
  );
  return rows[0] || null;
};

const findClientByChatId = async (chatId) => {
  const { rows } = await pool.query(
    `SELECT aic.client_id, aic.confidence_threshold, u.nom, u.email
     FROM ai_assistant_config aic
     JOIN utilisateurs u ON u.id = aic.client_id
     WHERE aic.telegram_chat_id = $1 AND aic.enabled = true`,
    [String(chatId)]
  );
  return rows[0] || null;
};

// Detect explicit report generation requests (Excel/PDF by email)
const REPORT_PATTERNS = [
  { format: 'excel', keywords: ['rapport excel', 'fichier excel', 'export excel', 'envoie excel'] },
  { format: 'pdf',   keywords: ['rapport pdf', 'fichier pdf', 'export pdf', 'envoie pdf'] },
];

function detectExplicitReportRequest(text) {
  const lower = text.toLowerCase();
  for (const { format, keywords } of REPORT_PATTERNS) {
    if (keywords.some(kw => lower.includes(kw))) return format;
  }
  return null;
}

async function sendMarkdown(ctx, text) {
  try {
    await ctx.reply(text, { parse_mode: 'Markdown' });
  } catch {
    // Fall back to plain text if Markdown parse fails
    await ctx.reply(text.replace(/[*_`]/g, ''));
  }
}

const initTelegram = () => {
  if (bot) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN non défini — bot désactivé');
    return;
  }

  bot = new Bot(token);

  // ── /start TOKEN ──────────────────────────────────────────────────────────
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
      `👋 *Bonjour ${client.nom} !*\n\nJe suis votre agent LabFlow. Je peux vous aider avec :\n\n` +
      `📦 *Stock* — état actuel, historique\n` +
      `🛒 *Appros* — approvisionnements et prix\n` +
      `📉 *Pertes* — suivi et analyse\n` +
      `📊 *Inventaires* — historique et écarts\n` +
      `🔄 *Transferts* — labo vers activités\n` +
      `📄 *Rapports* — Excel ou PDF par email\n\n` +
      `Posez-moi votre question !`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── Messages texte ────────────────────────────────────────────────────────
  bot.on('message:text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text?.trim();
    if (!text || text.startsWith('/')) return;

    const client = await findClientByChatId(chatId);
    if (!client) return;

    await ctx.api.sendChatAction(chatId, 'typing');

    try {
      // Explicit Excel/PDF report request → generate and email directly
      const reportFormat = detectExplicitReportRequest(text);
      if (reportFormat && client.email) {
        await ctx.reply(`⏳ Génération de votre rapport *${reportFormat.toUpperCase()}* en cours...`, { parse_mode: 'Markdown' });
        try {
          const filename = await generateAndSendReport(client.client_id, client.email, client.nom, reportFormat);
          await ctx.reply(
            `✅ *Rapport ${reportFormat.toUpperCase()} envoyé*\n\n📧 Destinataire : ${client.email}\n📎 Fichier : \`${filename}\``,
            { parse_mode: 'Markdown' }
          );
        } catch (e) {
          console.error('[Telegram] Report error:', e.message);
          await ctx.reply('❌ Erreur lors de la génération du rapport. Veuillez réessayer.');
        }
        return;
      }

      const { assistantMessage, confidence } = await chatWithAI(
        client.client_id,
        String(chatId),
        text,
        client.confidence_threshold
      );

      if (confidence !== null) {
        await pool.query(
          `UPDATE ai_conversations SET last_confidence = $1
           WHERE id = (
             SELECT id FROM ai_conversations
             WHERE client_id = $2 AND whatsapp_number = $3
             ORDER BY updated_at DESC LIMIT 1
           )`,
          [confidence, client.client_id, String(chatId)]
        );
      }

      await sendMarkdown(ctx, assistantMessage);
    } catch (err) {
      console.error('[Telegram] handleMessage error:', err.message);
      await ctx.reply('⚠️ Une erreur est survenue. Veuillez réessayer dans quelques instants.');
    }
  });

  bot.catch((err) => {
    console.error('[Telegram] polling error:', err.message);
  });

  bot.api.getMe().then((info) => {
    botUsername = info.username;
    console.log(`[Telegram] Bot connecté : @${botUsername}`);
  });

  bot.start({ drop_pending_updates: true }).catch((err) => {
    console.error('[Telegram] Fatal polling error:', err.message);
  });
};

const getBotUsername = () => botUsername;

const sendWelcomeMessage = async (chatId, clientNom) => {
  if (!bot) throw new Error('Bot Telegram non initialisé');
  await bot.api.sendMessage(
    chatId,
    `👋 *Bonjour ${clientNom} !*\n\nVotre agent LabFlow est de nouveau actif. Comment puis-je vous aider ?`,
    { parse_mode: 'Markdown' }
  );
};

module.exports = { initTelegram, getBotUsername, sendWelcomeMessage };
