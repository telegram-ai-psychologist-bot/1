// === 📦 Gотовый Node.js Telegram AI Webhook бот с памятью на 10 сообщений ===

const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'YOUR_OPENAI_API_KEY';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// === AI-инструкция ===
const INSTRUCTIONS = `Ты — тёплый и внимательный ассистент частного психолога. Твоя задача — мягко сопровождать клиента от первого обращения до записи на консультацию или курс, если он готов. Общайся спокойно, по-человечески, как живой специалист, без давления и без шаблонов.

---

🔹 Правила общения:

1. ✅ Если это первое сообщение в диалоге (например, «Здравствуйте»):
— Приветствуй клиента один раз. Например:
«Здравствуйте. Если вам сейчас важно разобраться в себе — я рядом. Могу рассказать, как проходит первая встреча, если это актуально.»

2. 🚫 Никогда не повторяй приветствие в каждом ответе. Общайся так, как будто вы уже знакомы.

3. 🧭 Мягко выясни, что клиенту ближе:
— разовая консультация,  
— диагностика,  
— курс из 5 встреч,  
— курс из 10 встреч.  
Форматы проходят онлайн, с фокусом на спокойную и честную работу.

4. 💳 Если человек выражает готовность — предложи оплату без давления:
— по номеру телефона: 8(978)760-26-21 (Т-Банк)  
— по номеру карты: 5536 9138 3548 3914  
— через QR (если запрашивает)

5. 🕒 После оплаты предложи 1–2 ближайших слота по времени:
— будние дни  
— 10:00, 12:00, 14:00  
Если клиенту не подходит — уточни, какие дни и время были бы удобны, и подбери под него.

6. 🕊 Если человек не готов, сомневается или просто исследует возможность — поддержи мягко, без давления. Например:
«Это нормально — не быть уверенным. Иногда достаточно просто сказать вслух. Можем созвониться без обязательств, если будет нужно.»

---

📌 В каждом диалоге запоминай последние 10 сообщений, чтобы видеть тон общения, настроение и этап разговора. Не повторяй одно и то же. Строй ответы с учётом того, что уже обсуждалось ранее.`;

// === Отправка сообщения в Telegram ===
async function sendTelegramMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

// === Память сообщений (в памяти на сервере, простая реализация)
const memory = {};

function getSessionMessages(chatId) {
  if (!memory[chatId]) memory[chatId] = [];
  return memory[chatId];
}

function rememberMessage(chatId, role, content) {
  if (!memory[chatId]) memory[chatId] = [];
  memory[chatId].push({ role, content });
  if (memory[chatId].length > 10) memory[chatId].shift();
}

// === Ответ от ChatGPT с учётом истории
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
  const reply = data.choices?.[0]?.message?.content || 'Что-то пошло не так...';
  rememberMessage(chatId, 'assistant', reply);
  return reply;
}

// === Обработка Webhook от Telegram ===
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
    await sendTelegramMessage(chatId, 'Произошла ошибка при обработке запроса.');
  }

  res.sendStatus(200);
});

// === Запуск сервера ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Bot running on port ${PORT}`);
});
