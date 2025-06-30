const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'YOUR_OPENAI_API_KEY';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// === Инструкция для GPT-4 ===
const BASE_INSTRUCTIONS = `Ты — AI-ассистент частного психолога. Задача: мягко и спокойно сопровождать клиента от первого обращения до записи на консультацию или курс.

❗ Правила:
1. Приветствие допустимо ТОЛЬКО в первом сообщении, если клиент первым написал «Здравствуйте», «Добрый день» и т.п.
2. Если ты уже приветствовал клиента — больше НЕ используй приветствие.
3. Никогда не включай в сообщение фразу “Цель клиента: …”.
4. Используй последние 10 сообщений (от клиента и свои), чтобы отвечать с учётом контекста.
5. Не повторяй то, что уже обсуждалось. Будь живым, мягким, вежливым, но не формальным.`;

// === Память на 10 сообщений + greeted флаг
const memory = {}; // { [chatId]: { greeted: boolean, messages: [ { role, content } ] } }

function getSession(chatId) {
  if (!memory[chatId]) {
    memory[chatId] = { greeted: false, messages: [] };
  }
  return memory[chatId];
}

function remember(chatId, role, content) {
  const session = getSession(chatId);
  session.messages.push({ role, content });
  if (session.messages.length > 10) session.messages.shift();
}

// === Отправка в Telegram
async function sendTelegramMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

// === Получение ответа от GPT
async function getAIResponse(chatId, userMessage) {
  const session = getSession(chatId);

  remember(chatId, 'user', userMessage);

  const greetingContext = session.greeted
    ? 'Ты уже поздоровался ранее. Не начинай сообщение с приветствия.'
    : 'Это первое сообщение. Если уместно, можешь поприветствовать клиента один раз.';

  const messages = [
    { role: 'system', content: `${BASE_INSTRUCTIONS}\n\n${greetingContext}` },
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
  const reply = data.choices?.[0]?.message?.content || 'Произошла ошибка при генерации ответа.';
  remember(chatId, 'assistant', reply);

  // Если в ответе GPT есть приветствие — ставим флаг
  if (/(здравствуй|добрый день|привет)/i.test(reply)) {
    session.greeted = true;
  }

  return reply;
}

// === Обработка Telegram webhook
app.post('/webhook', async (req, res) => {
  const message = req.body?.message;
  if (!message) return res.sendStatus(200);

  const chatId = message.chat.id;
  const userMessage = message.text;

  try {
    const reply = await getAIResponse(chatId, userMessage);
    await sendTelegramMessage(chatId, reply);
  } catch (err) {
    console.error('Ошибка:', err);
    await sendTelegramMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
  }

  res.sendStatus(200);
});

// === Запуск
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 AI-ассистент работает на порту ${PORT}`);
});
