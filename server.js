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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

// ---------------------- MULTI PROVIDER FALLBACK LOGIC -----------------------
console.log('AI Provider Keys:');
['GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'MISTRAL_API_KEY'].forEach(k => {
  console.log(`  ${k}:`, process.env[k] ? '✅' : '❌');
});

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
  const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
  const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini response missing content");
  return text;
}

async function tryOpenAI(message) {
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are FredAi, a trusted AI advisor specializing in taxes, budgeting, savings, and financial planning." },
        { role: "user", content: message }
      ]
    },
    { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 10000 }
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
      messages: [{ role: "user", content: `You are FredAi, a trusted AI advisor. User question: ${message}` }]
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
        { role: "system", content: "You are FredAi, a trusted AI advisor in finance." },
        { role: "user", content: message }
      ]
    },
    { headers: { Authorization: `Bearer ${MISTRAL_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 10000 }
  );
  const text = res.data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Mistral response missing content");
  return text;
}

const providers = {
  Gemini: tryGemini,
  OpenAI: tryOpenAI,
  Claude: tryClaude,
  Mistral: tryMistral
};

const metrics = {}; // { provider: { success, fail, totalMs } }

async function generateTrustedResponse(message, fallbackChain = null) {
  const chain = fallbackChain || ['Gemini', 'OpenAI', 'Claude', 'Mistral'];
  for (const name of chain) {
    const start = Date.now();
    try {
      console.log(`[AI:${name}] Trying`);
      const result = await providers[name](message);
      const duration = Date.now() - start;
      metrics[name] = metrics[name] || { success: 0, fail: 0, totalMs: 0 };
      metrics[name].success++;
      metrics[name].totalMs += duration;
      console.log(`[AI:${name}] Success in ${duration}ms`);
      return { result, provider: name, duration };
    } catch (err) {
      const duration = Date.now() - start;
      metrics[name] = metrics[name] || { success: 0, fail: 0, totalMs: 0 };
      metrics[name].fail++;
      metrics[name].totalMs += duration;
      console.log(`[AI:${name}] Failed in ${duration}ms: ${err.message}`);
    }
  }
  return {
    result: "I'm sorry, none of the AI providers were able to respond. Please try again later.",
    provider: null,
    duration: 0
  };
}

function getMetrics() {
  return metrics;
}
// -----------------------------------------------------------------------------


// --------------- Express & WebSocket Setup ---------------
const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://localhost:3000',
  'https://your-frontend-domain.com',
  'https://websocket-server-production-433e.up.railway.app',
  "fredai-pbasc-trustedadvisor-project.vercel.app",
  "fredai-pbasc-trustedadvisor-project-202-pbasc-trustadvisor-chat.vercel.app"
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());

// Multer for HTTP uploads (10 MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/jpg'
    ];
    cb(null, allowed.includes(file.mimetype));
  }
});

// Helper to detect doc type
function detectDocType(mimetype) {
  if (mimetype.includes('pdf')) return 'pdf';
  if (mimetype.includes('word')) return 'docx';
  if (mimetype.includes('png'))  return 'png';
  if (mimetype.includes('jpeg') || mimetype.includes('jpg')) return 'jpeg';
  return 'unknown';
}

// HTTP POST /api/document — file upload & analysis
app.post('/api/document', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const { buffer, mimetype, originalname: filename } = req.file;
    let text = '', analysis = '';

    // Extract text
    if (mimetype.includes('pdf')) {
      text = (await pdfParse(buffer)).text;
    } else if (mimetype.includes('word')) {
      text = (await mammoth.extractRawText({ buffer })).value;
    } else {
      // OCR image
      text = (await Tesseract.recognize(buffer, 'eng')).data.text;
    }

    // Analyze via AI
    const aiResp = await generateTrustedResponse(text);
    analysis = aiResp.result;

    const document_type = detectDocType(mimetype);
    return res.json({
      text,
      analysis,
      document_type,
      confidence_score: 1.0,
      ai_provider: aiResp.provider
    });
  } catch (err) {
    console.error('HTTP /api/document error:', err);
    return res.status(500).json({ error: 'Failed to analyze document.' });
  }
});

// HTTP POST /api/analyze-document — raw text analysis
app.post('/api/analyze-document', async (req, res) => {
  try {
    const { doc_text } = req.body;
    if (!doc_text) return res.status(400).json({ error: 'No doc_text provided.' });
    const aiResp = await generateTrustedResponse(doc_text);
    return res.json({ analysis: aiResp.result, ai_provider: aiResp.provider });
  } catch (err) {
    console.error('HTTP /api/analyze-document error:', err);
    return res.status(500).json({ error: 'Failed to analyze text.' });
  }
});

// ------------------- WebSocket server -------------------
const wss = new WebSocket.Server({
  server,
  verifyClient: info => !info.origin || allowedOrigins.includes(info.origin)
});

wss.on('connection', ws => {
  ws.send(JSON.stringify({
    type: 'welcome',
    content: "Welcome! You're connected to the AI WebSocket.",
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
      // 1) upload_document over WS
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

        const aiResp = await generateTrustedResponse(text);
        analysis = aiResp.result;

        return ws.send(JSON.stringify({
          type: 'upload_ack',
          filename: msg.filename,
          text,
          analysis,
          document_type: detectDocType(msg.mimetype),
          confidence_score: 1.0,
          ai_provider: aiResp.provider
        }));
      }

      // 2) ask_question about a document
      if (msg.type === 'ask_question') {
        const prompt = `${msg.doc_text}\n\nUSER QUESTION: ${msg.question}`;
        const aiResp = await generateTrustedResponse(prompt);
        return ws.send(JSON.stringify({ type: 'chat_response', answer: aiResp.result, ai_provider: aiResp.provider }));
      }

      // 3) general chat fallback
      if (typeof msg.message === 'string') {
        const aiResp = await generateTrustedResponse(msg.message);
        return ws.send(JSON.stringify({
          type: 'bot',
          content: aiResp.result,
          provider: aiResp.provider,
          timestamp: new Date().toISOString()
        }));
      }

      // unknown
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

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
