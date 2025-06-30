import express from 'express';
import bodyParser from 'body-parser';

const app = express();
app.use(bodyParser.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'YOUR_OPENAI_API_KEY';
const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL || 'YOUR_SHEETS_WEBHOOK_URL';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const BASE_INSTRUCTIONS = `Ты — AI-ассистент частного психолога. Помогаешь клиенту выбрать формат (диагностика / курс), оплатить и записаться. Общайся по-человечески, мягко и честно.

✅ Форматы:
1. Диагностическая консультация — 10 000₽
2. Курс из 5 консультаций — 50 000₽
3. Курс из 10 консультаций — 100 000₽

❗ Запрещено:
- Упоминать семейную, групповую или парную терапию
- Использовать фразы вроде "пробная консультация", "всё индивидуально", "виды помощи"
- Использовать шаблоны, медицинские термины и давление

📅 Расписание:
- По будням: 10:00, 12:00, 14:00
- Показывай только ближайшие 1–2 доступных слота (по запросу)
- Запись на курс: предлагай выбрать 5 или 10 слотов с интервалом минимум 2 дня, максимум 14

💳 Условия записи:
- Возможность записи открывается ТОЛЬКО после оплаты и подтверждения чека
- Оплата: карта 5536 9138 3548 3914, телефон 8(978)760-26-21
- После подтверждения чека в чате — предложи клиенту выбрать слоты

📊 Логируй в Google Sheets: имя/ник клиента, сообщение, дата, стадия.`;

const memory = {};

function getSession(chatId) {
  if (!memory[chatId]) memory[chatId] = { stage: 'initial', messages: [], paid: false, bookingCount: 0 };
  return memory[chatId];
}

function remember(chatId, role, content) {
  const session = getSession(chatId);
  session.messages.push({ role, content });
  if (session.messages.length > 10) session.messages.shift();
}

function sanitizeReply(text) {
  const filters = [
    [/^здравствуй[.!]?\s*/i, ''],
    [/^привет[.!]?\s*/i, ''],
    [/^добрый (день|вечер|утро)[.!]?\s*/i, ''],
    [/цель клиента:.*/gi, ''],
    [/семейн(ая|ые|ый|ое)/gi, ''],
    [/парн(ая|ые|ый|ое)/gi, ''],
    [/группов(ая|ые|ой)/gi, ''],
    [/все индивидуально/gi, ''],
    [/вид(ы)? психологической помощи/gi, ''],
    [/пробн(ая|ую|ое|ые)/gi, '']
  ];
  for (const [pattern, replacement] of filters) {
    text = text.replace(pattern, replacement);
  }
  return text.trim();
}

async function sendTelegramMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

async function logToGoogleSheets(chatId, username, message, stage) {
  await fetch(SHEETS_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatId,
      username,
      message,
      stage,
      timestamp: new Date().toISOString()
    })
  });
}

async function getAIResponse(chatId, userMessage, username) {
  const session = getSession(chatId);
  const stageInstruction = session.stage === 'initial'
    ? 'Это первое сообщение. Если уместно — можешь поприветствовать.'
    : 'Ты уже в диалоге. Не используй приветствие.';

  const messages = [
    { role: 'system', content: BASE_INSTRUCTIONS + '\n' + stageInstruction },
    ...session.messages
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages
    })
  });

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content || 'Произошла ошибка.';
  session.stage = 'active';

  remember(chatId, 'user', userMessage);
  remember(chatId, 'assistant', reply);

  await logToGoogleSheets(chatId, username, userMessage, session.stage);

  return sanitizeReply(reply);
}

app.post('/webhook', async (req, res) => {
  const message = req.body?.message;
  if (!message) return res.sendStatus(200);

  const chatId = message.chat.id;
  const username = message.chat.username || 'неизвестно';
  const userMessage = message.text;

  try {
    const reply = await getAIResponse(chatId, userMessage, username);
    await sendTelegramMessage(chatId, reply);
  } catch (err) {
    console.error(err);
    await sendTelegramMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🚀 AI-ассистент психолога запущен');
});
