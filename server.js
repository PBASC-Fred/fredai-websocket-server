// server.js - Multi-provider AI, user never sees [AI Provider] in chat

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const axios = require('axios');
const { Pool } = require('pg');
const multer = require('multer');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3002",
  "https://gitlab-importer-nladay2f.devinapps.com",
  "https://fredai-pbasc-trustedadvisor-project-2025-kfzj7qzsn.vercel.app",
  "https://fredai-drab.vercel.app",
  "https://fredai-pbasc-trustedadvisor-git-63d81c-pbasc-trustadvisor-chat.vercel.app",
  "https://fredai-pbasc-trustedadvisor-project.vercel.app",
  "https://fredai-pbasc-trustedadvisor-project-202-pbasc-trustadvisor-chat.vercel.app"
];

// ----- Provider Callers -----

async function callGemini(prompt) {
  try {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + process.env.GEMINI_API_KEY;
    const response = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }] });
    return response.data.candidates?.[0]?.content?.parts?.[0]?.text || "[Gemini] No response.";
  } catch (err) {
    console.error("Gemini error:", err?.response?.data || err.message);
    return "[Gemini] Error processing your message.";
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
      {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
      }
    );
    return response.data.choices?.[0]?.message?.content || "[OpenAI] No response.";
  } catch (err) {
    console.error("OpenAI error:", err?.response?.data || err.message);
    return "[OpenAI] Error processing your message.";
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
    return response.data?.content?.[0]?.text || "[Anthropic] No response.";
  } catch (err) {
    console.error("Anthropic error:", err?.response?.data || err.message);
    return "[Anthropic] Error processing your message.";
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
    return response.data.choices?.[0]?.message?.content || "[Mistral] No response.";
  } catch (err) {
    console.error("Mistral error:", err?.response?.data || err.message);
    return "[Mistral] Error processing your message.";
  }
}

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
    return response.data?.image || "[Stability] No image returned.";
  } catch (err) {
    console.error("Stability error:", err?.response?.data || err.message);
    return "[Stability] Error generating image.";
  }
}

async function analyzeDocument(text) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert in document analysis. Summarize or extract key information as requested."
          },
          {
            role: "user",
            content: text
          }
        ]
      },
      {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
      }
    );
    return response.data.choices?.[0]?.message?.content || "[OpenAI] No analysis returned.";
  } catch (err) {
    console.error("OpenAI Doc Analysis error:", err?.response?.data || err.message);
    return "[OpenAI] Error analyzing document.";
  }
}

// ----- Fallback Chat Handler (no provider label in user reply) -----
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
      if (
        reply &&
        !reply.startsWith(`[${provider.name}] Error`) &&
        !reply.startsWith(`[${provider.name}] No response`)
      ) {
        // Log for your admin/debugging
        console.log(`[AI reply] via ${provider.name}: ${reply}`);
        // Return just the AI reply, no provider label
        return reply;
      }
      console.warn(`Provider ${provider.name} failed, trying next...`);
    } catch (err) {
      console.warn(`Provider ${provider.name} threw error:`, err.message);
    }
  }
  return "Sorry, all AI providers failed to respond. Please try again later.";
}

// ----- Express and Middleware -----
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).send('FredAI WebSocket server is running.');
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, PNG, and JPEG files are allowed.'));
    }
  }
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

async function saveMessage(sessionId, role, message) {
  // Implement database save here if needed.
  console.log(`[saveMessage] [${sessionId}] ${role}: ${message}`);
}

// ----- WebSocket Server -----
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
      let userMessage = message.message || "";
      // User must use /imagine to generate images
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
      } else if (message.type === "doc") {
        const analysis = await analyzeDocument(userMessage);
        ws.send(JSON.stringify({
          type: "bot",
          content: analysis,
          timestamp: new Date().toISOString()
        }));
      } else { // fallback chat!
        await saveMessage(sessionId, 'user', userMessage);
        const botResponse = await fallbackAIChat(userMessage);
        await saveMessage(sessionId, 'bot', botResponse);
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

// ----- Document Upload HTTP endpoint -----
app.post('/api/document', upload.single('file'), async (req, res) => {
  try {
    let fileText = "";
    if (req.file.mimetype === "application/pdf") {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(req.file.buffer);
      fileText = data.text;
    } else if (req.file.mimetype === "image/png" || req.file.mimetype === "image/jpeg") {
      const Tesseract = require('tesseract.js');
      const result = await Tesseract.recognize(req.file.buffer, 'eng');
      fileText = result.data.text;
    }
    const analysis = await analyzeDocument(fileText);
    res.json({ analysis });
  } catch (err) {
    console.error('Doc upload error:', err);
    res.status(500).json({ error: "Failed to analyze document." });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});
