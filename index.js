import express from 'express';
import bodyParser from 'body-parser';

const app = express();
app.use(bodyParser.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'YOUR_OPENAI_API_KEY';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const BASE_INSTRUCTIONS = `Ты — AI-ассистент частного психолога. Твоя задача — мягко, спокойно, без давления сопровождать клиента от первого сообщения до записи на консультацию или курс.

Правила:
1. Приветствие допустимо ТОЛЬКО в первом сообщении.
2. После этого приветствия ЗАПРЕЩЕНЫ.
3. Запрещено писать «Цель клиента: …»
4. Не повторяй уже сказанное.
5. Общайся как человек.`;

const memory = {};

function getSession(chatId) {
  if (!memory[chatId]) memory[chatId] = { stage: 'initial', messages: [] };
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
    [/цель клиента:.*/gi, '']
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

async function getAIResponse(chatId, userMessage) {
  const session = getSession(chatId);
  const stageInstruction = session.stage === 'initial'
    ? 'Ты можешь поприветствовать, если это первое сообщение.'
    : 'Не используй приветствие. Продолжай диалог.';

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

  return sanitizeReply(reply);
}

app.post('/webhook', async (req, res) => {
  const message = req.body?.message;
  if (!message) return res.sendStatus(200);

  const chatId = message.chat.id;
  const userMessage = message.text;

  try {
    const reply = await getAIResponse(chatId, userMessage);
    await sendTelegramMessage(chatId, reply);
  } catch (err) {
    console.error(err);
    await sendTelegramMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🚀 AI-ассистент запущен');
});
