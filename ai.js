// ai.js
require('dotenv').config();
const axios = require('axios');

// ——— Providers ———
async function callOpenAI(prompt) {
  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    { model: 'gpt-4o', messages: [{ role: 'user', content: prompt }] },
    { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
  );
  return res.data.choices?.[0]?.message?.content || '';
}

async function callGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) return '';
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' +
    process.env.GEMINI_API_KEY;
  const res = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }] });
  return res.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callAnthropic(prompt) {
  if (!process.env.ANTHROPIC_API_KEY) return '';
  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-3-opus-20240229',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    }
  );
  return res.data?.content?.[0]?.text || '';
}

async function callMistral(prompt) {
  if (!process.env.MISTRAL_API_KEY) return '';
  const res = await axios.post(
    'https://api.mistral.ai/v1/chat/completions',
    { model: 'mistral-large-latest', messages: [{ role: 'user', content: prompt }] },
    { headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` } }
  );
  return res.data.choices?.[0]?.message?.content || '';
}

// ——— Fallback Orchestrator ———
const providers = [
  { name: 'OpenAI', fn: callOpenAI, key: process.env.OPENAI_API_KEY },
  { name: 'Gemini', fn: callGemini, key: process.env.GEMINI_API_KEY },
  { name: 'Anthropic', fn: callAnthropic, key: process.env.ANTHROPIC_API_KEY },
  { name: 'Mistral', fn: callMistral, key: process.env.MISTRAL_API_KEY },
];

async function multiProviderDocAnalysis(prompt) {
  for (const p of providers) {
    if (!p.key) continue;
    try {
      const reply = await p.fn(prompt);
      if (reply && !reply.startsWith('[')) {
        console.log(`[AI] answered via ${p.name}`);
        return reply;
      }
    } catch (e) {
      console.warn(`❌ ${p.name} failed:`, e.message);
    }
  }
  return 'Sorry, all AI providers failed to respond. Please try again later.';
}

module.exports = { multiProviderDocAnalysis };

