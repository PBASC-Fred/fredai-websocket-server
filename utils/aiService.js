const axios = require('axios');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

function logStep(provider, status, extra = '') {
  console.log(`[AI:${provider}] ${status}${extra ? ` - ${extra}` : ''}`);
}

async function tryGemini(message) {
  if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");

  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
  const payload = {
    contents: [{
      parts: [{
        text: `You are FredAi, a trusted AI advisor specializing in taxes, budgeting, savings, and financial planning. Please provide helpful, accurate financial advice. User question: ${message}`
      }]
    }]
  };

  const res = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000
  });

  const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini response missing content");
  return text;
}

async function tryOpenAI(message) {
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are FredAi, a trusted AI advisor specializing in taxes, budgeting, savings, and financial planning."
        },
        {
          role: "user",
          content: message
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    }
  );

  const text = res.data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI response missing content");
  return text;
}

async function tryClaude(message) {
  if (!ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");

  const res = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-3-haiku-20240307",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `You are FredAi, a trusted AI advisor. User question: ${message}`
        }
      ]
    },
    {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      timeout: 10000
    }
  );

  const text = res.data?.content?.[0]?.text;
  if (!text) throw new Error("Claude response missing content");
  return text;
}

async function tryMistral(message) {
  if (!MISTRAL_API_KEY) throw new Error("Missing MISTRAL_API_KEY");

  const res = await axios.post(
    "https://api.mistral.ai/v1/chat/completions",
    {
      model: "mistral-medium",
      messages: [
        {
          role: "system",
          content: "You are FredAi, a trusted AI advisor in finance."
        },
        {
          role: "user",
          content: message
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    }
  );

  const text = res.data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Mistral response missing content");
  return text;
}

function isInEU() {
  const locale = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  return /Europe\//.test(locale);
}

const fallbackChain = isInEU()
  ? ['Claude', 'Mistral', 'OpenAI', 'Gemini']
  : ['Gemini', 'OpenAI', 'Claude', 'Mistral'];

const providers = {
  Gemini: tryGemini,
  OpenAI: tryOpenAI,
  Claude: tryClaude,
  Mistral: tryMistral
};

async function generateTrustedResponse(message) {
  for (const name of fallbackChain) {
    try {
      logStep(name, "Trying");
      const result = await providers[name](message);
      logStep(name, "Success");
      return result;
    } catch (err) {
      logStep(name, "Failed", err.message);
    }
  }

  return "I'm sorry, none of the AI providers were able to respond. Please try again later.";
}

module.exports = { generateTrustedResponse };
