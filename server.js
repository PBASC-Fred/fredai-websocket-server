// server.js - Modular AI chat/image/websocket, file upload routed to documenthandler

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const {
  handleDocumentUpload,
  handleAnalyzeDocument
} = require('./documenthandler');

const app = express();
const server = http.createServer(app);

// --------- Allowed Origins ---------
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3002",
  "https://fredai-pbasc-trustedadvisor-project.vercel.app",
  "https://fredai-pbasc-trustedadvisor-project-202-pbasc-trustadvisor-chat.vercel.app",
  "https://fredai-pnxkiveu1-pbasc-trustadvisor-chat.vercel.app",
  "https://fredai-pbasc-trustedadvisor-project-2025-lff7121at.vercel.app",
  "https://websocket-server-production-433e.up.railway.app",
  "wss://websocket-server-production-433e.up.railway.app"
];

// --------- AI PROVIDERS ---------
async function callGemini(prompt) {
  try {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + process.env.GEMINI_API_KEY;
    const response = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }] });
    return response.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch (err) {
    console.error("Gemini error:", err?.response?.data || err.message);
    return "";
  }
}

async function callOpenAI(prompt) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }]
      },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );
    return response.data.choices?.[0]?.message?.content || "";
  } catch (err) {
    console.error("OpenAI error:", err?.response?.data || err.message);
    return "";
  }
}

async function callAnthropic(prompt) {
  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-3-opus-20240229",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }]
      },
      {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        }
      }
    );
    return response.data?.content?.[0]?.text || "";
  } catch (err) {
    console.error("Anthropic error:", err?.response?.data || err.message);
    return "";
  }
}

async function callMistral(prompt) {
  try {
    const response = await axios.post(
      "https://api.mistral.ai/v1/chat/completions",
      {
        model: "mistral-large-latest",
        messages: [{ role: "user", content: prompt }]
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    return response.data.choices?.[0]?.message?.content || "";
  } catch (err) {
    console.error("Mistral error:", err?.response?.data || err.message);
    return "";
  }
}

// --------- Stability AI IMAGE GENERATION ---------
async function callStability(prompt) {
  try {
    const response = await axios.post(
      "https://api.stability.ai/v2beta/stable-image/generate/core",
      {
        prompt,
        output_format: "png",
        aspect_ratio: "1:1"
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
          Accept: "application/json"
        }
      }
    );
    if (response.data && response.data.image) {
      if (/^[A-Za-z0-9+/=]+$/.test(response.data.image.trim())) {
        return `data:image/png;base64,${response.data.image}`;
      }
      if (response.data.image.startsWith("http")) {
        return response.data.image;
      }
    }
    if (response.data && response.data.url) {
      return response.data.url;
    }
    return "[Image not generated]";
  } catch (err) {
    console.error("Stability error:", err?.response?.data || err.message);
    return "[Error generating image]";
  }
}

// --------- AI Fallback Chat Handler ---------
async function fallbackAIChat(userMessage) {
  const providers = [
    { name: "Gemini",    fn: callGemini,    key: process.env.GEMINI_API_KEY },
    { name: "OpenAI",    fn: callOpenAI,    key: process.env.OPENAI_API_KEY },
    { name: "Anthropic", fn: callAnthropic, key: process.env.ANTHROPIC_API_KEY },
    { name: "Mistral",   fn: callMistral,   key: process.env.MISTRAL_API_KEY }
  ];
  for (const provider of providers) {
    if (!provider.key) continue;
    try {
      const reply = await provider.fn(userMessage);
      if (reply && !reply.startsWith("[")) {
        console.log(`[AI reply] via ${provider.name}`);
        return reply;
      }
    } catch (err) {
      console.warn(`Provider ${provider.name} threw error:`, err.message);
    }
  }
  return "Sorry, all AI providers failed to respond. Please try again later.";
}

// --------- EXPRESS SETUP ---------
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());

// --------- Health Check ---------
app.get('/', (req, res) => {
  res.status(200).send('FredAI WebSocket server is running.');
});

// --------- Document Analysis Routes ---------
app.post('/api/document', handleDocumentUpload);
app.post('/api/analyze-document', handleAnalyzeDocument);

// --------- WEBSOCKET SERVER ---------
const wss = new WebSocket.Server({
  server,
  verifyClient: (info) => {
    const origin = info.origin;
    const allowed = allowedOrigins.includes(origin) || !origin;
    console.log('[WS] Incoming connection from:', origin, '-> allowed:', allowed);
    return allowed;
  }
});

wss.on('connection', (ws, req) => {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log('[WS] New client connected:', sessionId);

  ws.send(JSON.stringify({
    type: 'welcome',
    content: "Welcome! I'm your Trusted AI Advisor.",
    timestamp: new Date().toISOString()
  }));

  ws.on('message', async (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'bot',
        content: 'Internal error: invalid message format.',
        timestamp: new Date().toISOString()
      }));
      return;
    }
    try {
      // /imagine image generation
      let userMessage = message.message || "";
      if (typeof userMessage === "string" && userMessage.trim().toLowerCase().startsWith("/imagine")) {
        const imgPrompt = userMessage.replace(/^\/imagine\s*/i, "").trim();
        if (imgPrompt.length === 0) {
          ws.send(JSON.stringify({
            type: "bot",
            content: "Please provide a prompt after `/imagine` for image generation.",
            timestamp: new Date().toISOString()
          }));
          return;
        }
        const img = await callStability(imgPrompt);
        ws.send(JSON.stringify({
          type: "image",
          content: img,
          timestamp: new Date().toISOString()
        }));
      } else {
        // fallback chat!
        const botResponse = await fallbackAIChat(userMessage);
        ws.send(JSON.stringify({
          type: 'bot',
          content: botResponse,
          timestamp: new Date().toISOString()
        }));
      }
    } catch (err) {
      console.error('[WS] Error in chat handling:', err);
      ws.send(JSON.stringify({
        type: 'bot',
        content: "Sorry, an error occurred processing your message.",
        timestamp: new Date().toISOString()
      }));
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected:', sessionId);
  });

  ws.on('error', (error) => {
    console.error('[WS] WebSocket error:', error);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});
