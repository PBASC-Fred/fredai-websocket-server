// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const WebSocket = require('ws');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
const server = http.createServer(app);

// --- CORS ---
const allowedOrigins = [
  'http://localhost:3000',
  'https://fredai-pbasc-trustedadvisor-project-202-pbasc-trustadvisor-chat.vercel.app',
  'https://fredai-pbasc-trustedadvisor-project.vercel.app',
  'https://websocket-server-production-433e.up.railway.app',
  'https://fredai-drab.vercel.app/',
  'https://fredai-drab.vercel.app',
  'https://fredai.io',
  'https://websocket-server-production-433e.up.railway.app/ws'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());

// --- Multer for file uploads ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// --- AI Provider Fallback Chain ---
async function aiChatFallback(prompt) {
  const providers = [
    {
      name: 'OpenAI',
      fn: async (q) => {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const resp = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: q }]
        });
        return resp.choices[0].message.content;
      }
    },
    {
      name: 'Gemini',
      fn: async (q) => {
        if (!process.env.GEMINI_API_KEY) throw new Error('No Gemini key');
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const payload = { contents: [{ parts: [{ text: q }] }] };
        const r = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        return r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      }
    },
    {
      name: 'Anthropic',
      fn: async (q) => {
        if (!process.env.ANTHROPIC_API_KEY) throw new Error('No Anthropic key');
        const r = await axios.post(
          "https://api.anthropic.com/v1/messages",
          {
            model: "claude-3-haiku-20240307",
            max_tokens: 1000,
            messages: [{ role: "user", content: q }]
          },
          {
            headers: {
              'x-api-key': process.env.ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json'
            }
          }
        );
        return r.data?.content?.[0]?.text;
      }
    },
    {
      name: 'Mistral',
      fn: async (q) => {
        if (!process.env.MISTRAL_API_KEY) throw new Error('No Mistral key');
        const r = await axios.post(
          "https://api.mistral.ai/v1/chat/completions",
          {
            model: "mistral-medium",
            messages: [
              { role: "system", content: "You are FredAi, a trusted AI advisor." },
              { role: "user", content: q }
            ]
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
        return r.data?.choices?.[0]?.message?.content;
      }
    }
  ];

  for (const p of providers) {
    try {
      const result = await p.fn(prompt);
      if (result && result.trim()) {
        return result;
      }
    } catch (e) {
      console.log(`[AI Fallback] ${p.name} failed:`, e.message);
    }
  }
  return "Sorry, all AI providers failed to respond. Please try again later.";
}

// --- Image Generation ---
async function generateImage({ prompt, provider }) {
  if (provider === "dalle" || provider === "openai") {
    // OpenAI DALL·E
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const resp = await openai.images.generate({
      prompt,
      n: 1,
      size: "512x512"
    });
    return resp.data[0].url;
  } else if (provider === "stability" || provider === "stabilityai") {
    // Stability (DreamStudio)
    const url = 'https://api.stability.ai/v2beta/stable-image/generate/core';
    const res = await axios.post(url, {
      prompt,
      steps: 25,
      cfg_scale: 8
    }, {
      headers: {
        Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      }
    });
    return res.data?.artifacts?.[0]?.url;
  }
  throw new Error("No valid image provider found.");
}

// --- File type helpers ---
function detectDocType(mimetype) {
  if (mimetype.includes('pdf')) return 'pdf';
  if (mimetype.includes('word')) return 'docx';
  if (mimetype.includes('png'))  return 'png';
  if (mimetype.includes('jpeg') || mimetype.includes('jpg')) return 'jpeg';
  return 'unknown';
}

// --- HTTP API: document upload & analysis ---
app.post('/api/document', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const { buffer, mimetype } = req.file;
    let text = '', analysis = '';
    if (mimetype.includes('pdf')) {
      text = (await pdfParse(buffer)).text;
    } else if (mimetype.includes('word')) {
      text = (await mammoth.extractRawText({ buffer })).value;
    } else {
      text = (await Tesseract.recognize(buffer, 'eng')).data.text;
    }
    analysis = await aiChatFallback(text);
    res.json({
      text,
      analysis,
      document_type: detectDocType(mimetype),
      confidence_score: 1.0
    });
  } catch (err) {
    console.error('HTTP /api/document error:', err);
    res.status(500).json({ error: 'Failed to analyze document.' });
  }
});

app.post('/api/analyze-document', async (req, res) => {
  try {
    const { doc_text } = req.body;
    if (!doc_text) return res.status(400).json({ error: 'No doc_text provided.' });
    const analysis = await aiChatFallback(doc_text);
    res.json({ analysis });
  } catch (err) {
    res.status(500).json({ error: 'Failed to analyze text.' });
  }
});

// --- HTTP API: image generation ---
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, provider } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt.' });
    const url = await generateImage({ prompt, provider: provider || "dalle" });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate image.' });
  }
});

// --- WebSocket Server ---
const wss = new WebSocket.Server({
  server,
  path: '/ws',
  verifyClient: info => !info.origin || allowedOrigins.includes(info.origin)
});

wss.on('connection', ws => {
  ws.send(JSON.stringify({
    type: 'welcome',
    content: "Welcome! You're connected to the Fred AI.",
    timestamp: new Date().toISOString()
  }));

  ws.on('message', async raw => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return ws.send(JSON.stringify({ type: 'bot', content: 'Invalid JSON.' }));
    }

    try {
      // 1) upload_document
      if (msg.type === 'upload_document') {
        const buf = Buffer.from(msg.content, 'base64');
        let text = '', analysis = '';
        if (msg.mimetype.includes('pdf')) {
          text = (await pdfParse(buf)).text;
        } else if (msg.mimetype.includes('word')) {
          text = (await mammoth.extractRawText({ buffer: buf })).value;
        } else {
          text = (await Tesseract.recognize(buf, 'eng')).data.text;
        }
        analysis = await aiChatFallback(text);
        return ws.send(JSON.stringify({
          type: 'upload_ack',
          filename: msg.filename,
          text,
          analysis,
          document_type: detectDocType(msg.mimetype),
          confidence_score: 1.0
        }));
      }

      // 2) ask_question about a document
      if (msg.type === 'ask_question') {
        const prompt = `${msg.doc_text}\n\nUSER QUESTION: ${msg.question}`;
        const answer = await aiChatFallback(prompt);
        return ws.send(JSON.stringify({ type: 'chat_response', answer }));
      }

      // 3) image generation
      if (msg.type === 'imagine') {
        if (!msg.prompt) return ws.send(JSON.stringify({ type: 'bot', content: 'No prompt provided.' }));
        try {
          // default to dalle, fallback to stability if requested
          const url = await generateImage({ prompt: msg.prompt, provider: msg.provider || "dalle" });
          return ws.send(JSON.stringify({ type: 'image', url, prompt: msg.prompt }));
        } catch (e) {
          return ws.send(JSON.stringify({ type: 'bot', content: 'Image generation failed.' }));
        }
      }

      // 4) fallback: normal chat
      if (typeof msg.message === 'string') {
        const reply = await aiChatFallback(msg.message);
        return ws.send(JSON.stringify({
          type: 'bot',
          content: reply,
          timestamp: new Date().toISOString()
        }));
      }

      // unknown type
      ws.send(JSON.stringify({
        type: 'bot',
        content: "I didn't understand that message.",
        timestamp: new Date().toISOString()
      }));

    } catch (err) {
      console.error('WS handler error:', err);
      ws.send(JSON.stringify({ type: 'bot', content: 'Server error.' }));
    }
  });
});

// --- Start Server ---
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
