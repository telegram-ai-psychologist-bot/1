const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'YOUR_OPENAI_API_KEY';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// === ЖЁСТКАЯ СИСТЕМНАЯ ИНСТРУКЦИЯ ===
const INSTRUCTIONS = `# Роль: AI-ассистент психолога
Ты — AI-ассистент частного психолога. Задача: мягко сопровождать клиента от первого обращения до записи на встречу.

## Правила:
1. Приветствие допустимо ТОЛЬКО в первом сообщении, если клиент первым написал "Здравствуйте", "Добрый день", "Привет" и т.п.
2. В остальных ответах строго ЗАПРЕЩЕНО использовать любые приветствия.
3. Фраза “Цель клиента:” ЗАПРЕЩЕНА в любом виде. Не включай её в сообщения.
4. Храни контекст 10 последних сообщений (и клиента, и свои). Не повторяй то, что уже было сказано.
5. Общайся как живой человек: спокойно, тепло, без шаблонов, без давления.`;

// === Telegram-ответ
async function sendTelegramMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

// === Память сообщений на 10 (сессия на chatId)
const memory = {};

function getSessionMessages(chatId) {
  if (!memory[chatId]) memory[chatId] = [];
  return memory[chatId];
}

function rememberMessage(chatId, role, content) {
  const session = getSessionMessages(chatId);
  session.push({ role, content });
  if (session.length > 10) session.shift();
}

// === Получение ответа от GPT
async function getAIResponse(chatId, userMessage) {
  rememberMessage(chatId, 'user', userMessage);

  const messages = [
    { role: 'system', content: INSTRUCTIONS },
    ...getSessionMessages(chatId)
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
  const reply = data.choices?.[0]?.message?.content || 'Произошла ошибка при генерации ответа.';
  rememberMessage(chatId, 'assistant', reply);
  return reply;
}

// === Обработка Webhook
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
    await sendTelegramMessage(chatId, 'Произошла ошибка. Попробуйте ещё раз позже.');
  }

  res.sendStatus(200);
});

// === Запуск
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 AI-психолог запущен на порту ${PORT}`);
});
