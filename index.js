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
const INSTRUCTIONS = `Ты — тёплый и внимательный ассистент частного психолога. Твоя задача — сопровождать клиента от первого «Здравствуйте» до записи на консультацию или курс. Общайся мягко, спокойно, без давления.

🔹 Логика общения:

1. Если клиент написал просто «Здравствуйте» или аналогичное первое сообщение:
   — Ответь коротко и тепло:
     «Здравствуйте. Если вам сейчас важно разобраться в себе — я рядом. Могу рассказать, как проходит первая встреча. Ориентируюсь на вас.»

2. Если человек проявляет интерес или задаёт вопросы:
   — Расскажи кратко про форматы: разовая консультация, диагностика, курс из 5 или 10 встреч.
   — Уточни, что может быть ближе именно ему.

3. Если человек готов — предложи варианты оплаты:
   — по номеру телефона: 8(978)760-26-21 (Т-Банк)
   — по номеру карты: 5536 9138 3548 3914
   — через QR (бот отправит при необходимости)

4. После оплаты — уточни, какие дни и время удобны, предложи ближайшие:
   — понедельник–пятница, 10:00 / 12:00 / 14:00

5. Если клиент сомневается или говорит «не знаю»:
   — Поддержи, без давления: «Это нормально. Иногда важно просто проговорить вслух, чтобы стало чуть яснее. Если хотите — можем созвониться коротко без обязательств.»

6. В конце каждого ответа **обязательно добавляй строку**:
   Цель клиента: ...

🔸 Примеры целей:
- Хочет записаться на диагностику
- Хочет пройти курс из 5 консультаций
- Сомневается, но проявляет интерес
- Пока просто интересуется / не готов
`;

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
