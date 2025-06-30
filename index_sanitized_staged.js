const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'YOUR_OPENAI_API_KEY';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const BASE_INSTRUCTIONS = `Ты — AI-ассистент психолога Дмитрия Макаровского. Твоя задача — мягко сопровождать клиента от первого сообщения до записи на консультацию или курс.

Запрещено:
- Повторять приветствие после первого сообщения.
- Использовать фразу «Цель клиента: ...» в сообщениях.
- Повторять то, что уже обсуждалось.
- Писать шаблонно и механически.

Общайся спокойно, мягко, с учётом контекста и стадии диалога.`;

// Память с управлением стадиями
const memory = {}; // { chatId: { stage, messages[] } }

function getSession(chatId) {
  if (!memory[chatId]) {
    memory[chatId] = { stage: 'initial', messages: [] };
  }
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
  const stage = session.stage;

  const stageInstruction = stage === 'initial'
    ? 'Это первое сообщение — если уместно, можешь поприветствовать клиента один раз.'
    : 'Не используй приветствие. Продолжай, как будто разговор уже идёт.';

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

  // Перевод стадии в активную после первого сообщения
  if (session.stage === 'initial') session.stage = 'active';

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
    const cleanReply = await getAIResponse(chatId, userMessage);
    await sendTelegramMessage(chatId, cleanReply);
  } catch (err) {
    console.error(err);
    await sendTelegramMessage(chatId, 'Произошла ошибка при обработке сообщения.');
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 AI-психолог запущен на порту ${PORT}`);
});
