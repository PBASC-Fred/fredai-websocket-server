// server.js

const express = require('express');
const http = require('http');
const cors = require('cors');
const WebSocket = require('ws');
const axios = require('axios');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');
const { Configuration, OpenAIApi } = require('openai');
const { multiProviderDocAnalysis } = require('./ai');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// --------- Allowed Origins ---------
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3002',
  'https://fredai-pbasc-trustedadvisor-project.vercel.app',
  'https://fredai-pbasc-trustedadvisor-project-202-pbasc-trustadvisor-chat.vercel.app',
  'https://fredai-pnxkiveu1-pbasc-trustadvisor-chat.vercel.app',
  'https://fredai-pbasc-trustedadvisor-project-2025-lff7121at.vercel.app',
  'https://websocket-server-production-433e.up.railway.app',
  'wss://websocket-server-production-433e.up.railway.app'
];

// --------- OpenAI Vision Client ---------
const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_API_KEY
}));

// --------- Helpers ---------
function detectDocType(mimetype) {
  const map = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'image/png': 'png',
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpg'
  };
  const document_type = map[mimetype] || 'unknown';
  const confidence_score = document_type === 'unknown' ? 0.5 : 1.0;
  return { document_type, confidence_score };
}

async function analyzeImageWithOpenAI(buffer, mimetype) {
  const b64 = buffer.toString('base64');
  const dataUrl = `data:${mimetype};base64,${b64}`;
  const resp = await openai.createChatCompletion({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are an expert at understanding document images.' },
      { role: 'user', content: 'Extract any text and summarize the content of this document image.' },
      {
        type: 'input_image',
        image_url: dataUrl,
        detail: 'high'
      }
    ]
  });
  return resp.data.choices?.[0]?.message?.content || '';
}

async function fallbackAIChat(userMessage) {
  const providers = [
    { name: 'OpenAI', fn: async (p) => (await openai.createChatCompletion({ model: 'gpt-4o', messages: [{ role: 'user', content: p }] })).data.choices[0].message.content, key: process.env.OPENAI_API_KEY },
    // add Gemini, Anthropic, Mistral here if desired…
  ];
  for (const prov of providers) {
    if (!prov.key) continue;
    try {
      const reply = await prov.fn(userMessage);
      if (reply) return reply;
    } catch { /* ignore */ }
  }
  return 'Sorry, all AI providers failed.';
}

// --------- CORS & JSON ---------
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());

// --------- Multer for HTTP Uploads ---------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/png','image/jpeg'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// --------- HTTP Endpoints ---------
// Upload & analyze document
app.post('/api/document', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file.' });
    const { document_type, confidence_score } = detectDocType(req.file.mimetype);
    let text = '', analysis = '';

    if (document_type === 'pdf') {
      text = (await pdfParse(req.file.buffer)).text;
      analysis = await multiProviderDocAnalysis(text);

    } else if (document_type === 'docx') {
      text = (await mammoth.extractRawText({ buffer: req.file.buffer })).value;
      analysis = await multiProviderDocAnalysis(text);

    } else {
      text = '[Image]';
      analysis = await analyzeImageWithOpenAI(req.file.buffer, req.file.mimetype);
    }

    res.json({ text, analysis, document_type, confidence_score });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analysis failed.' });
  }
});

// Analyze raw text
app.post('/api/analyze-document', async (req, res) => {
  try {
    const { doc_text } = req.body;
    if (!doc_text) return res.status(400).json({ error: 'No text.' });
    const analysis = await multiProviderDocAnalysis(doc_text);
    res.json({ analysis });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analysis failed.' });
  }
});

// Health check
app.get('/', (req, res) => res.send('FredAI server running'));

// --------- WebSocket Server ---------
const wss = new WebSocket.Server({
  server,
  verifyClient: info => !info.origin || allowedOrigins.includes(info.origin)
});

// Handle all WS messages in one place
wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'welcome', content: 'Connected to FredAI.' }));

  ws.on('message', async raw => {
    let msg;
    try { msg = JSON.parse(raw); }
    catch { return ws.send(JSON.stringify({ type: 'bot', content: 'Bad JSON.' })); }

    if (msg.type === 'upload_document') {
      // decode
      const buf = Buffer.from(msg.content, 'base64');
      const { document_type, confidence_score } = detectDocType(msg.mimetype);
      let text = '', analysis = '';

      try {
        if (document_type === 'pdf') {
          text = (await pdfParse(buf)).text;
          analysis = await multiProviderDocAnalysis(text);
        } else if (document_type === 'docx') {
          text = (await mammoth.extractRawText({ buffer: buf })).value;
          analysis = await multiProviderDocAnalysis(text);
        } else {
          text = '[Image]';
          analysis = await analyzeImageWithOpenAI(buf, msg.mimetype);
        }
        ws.send(JSON.stringify({
          type: 'upload_ack',
          filename: msg.filename,
          text,
          analysis,
          document_type,
          confidence_score
        }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'upload_error', error: e.message }));
      }

    } else if (msg.type === 'ask_question') {
      try {
        const prompt = `${msg.doc_text}\n\nUSER: ${msg.question}`;
        const answer = await multiProviderDocAnalysis(prompt);
        ws.send(JSON.stringify({ type: 'chat_response', answer }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'chat_response', answer: 'Error answering.' }));
      }

    } else if (typeof msg.message === 'string') {
      // fallback chat
      const reply = await fallbackAIChat(msg.message);
      ws.send(JSON.stringify({ type: 'bot', content: reply }));
    }
  });
});

// Start listening
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server live on port ${PORT}`);
});
