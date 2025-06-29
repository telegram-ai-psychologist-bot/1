// === 📦 Gотовый Node.js Telegram AI Webhook бот ===

const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'YOUR_OPENAI_API_KEY';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// === AI-инструкция ===
const INSTRUCTIONS = `Ты — тёплый, внимательный ассистент-психолога.
Твоя задача — мягко, спокойно, по-человечески сопровождать клиента от первого сообщения до записи на консультацию.
Варианты: разовая консультация, диагностика, курс из 5 или 10 встреч.
Если клиент готов — предложи способы оплаты: карта, номер телефона, QR-код.
После оплаты — предложи ближайшие слоты: будни, 10:00 / 12:00 / 14:00.
В конце каждого ответа добавь строку: Цель клиента: ...`;

// === Отправка сообщения в Telegram ===
async function sendTelegramMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

// === Ответ от ChatGPT ===
async function getAIResponse(userMessage) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: INSTRUCTIONS },
        { role: 'user', content: userMessage }
      ]
    })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || 'Что-то пошло не так...';
}

// === Обработка Webhook от Telegram ===
app.post('/webhook', async (req, res) => {
  const message = req.body?.message;
  if (!message) return res.sendStatus(200);

  const chatId = message.chat.id;
  const userMessage = message.text;

  try {
    const reply = await getAIResponse(userMessage);
    await sendTelegramMessage(chatId, reply);
  } catch (err) {
    console.error(err);
    await sendTelegramMessage(chatId, 'Произошла ошибка при обработке запроса.');
  }

  res.sendStatus(200);
});

// === Для Render или локального запуска ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Bot running on port ${PORT}`);
});
