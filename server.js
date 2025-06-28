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
const OpenAI = require('openai');

//
// ——— EXPRESS + HTTP SETUP ———
//
const app = express();
const server = http.createServer(app);

// CORS for your front end
const allowedOrigins = [
  'http://localhost:3000',
  'https://your-frontend-domain.com',
  'https://websocket-server-production-433e.up.railway.app'
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

// Helper: fallback AI — tries OpenAI → Gemini → Anthropic → Mistral
async function callOpenAI(prompt) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }]
  });
  return resp.choices[0].message.content;
}
// (For brevity, I’ve omitted Gemini/Anthropic/Mistral stubs — you can add them here as `async function callGemini(...) { … }` etc.)
async function fallbackAI(prompt) {
  // Try OpenAI
  if (process.env.OPENAI_API_KEY) {
    try { return await callOpenAI(prompt); } catch (e) { console.warn('OpenAI failed:', e); }
  }
  // ... then Gemini, Anthropic, Mistral if you’ve set their API keys
  return 'Sorry, all AI providers failed to respond.';
}

// HTTP endpoint: upload a document via Multipart-Form
app.post('/api/document', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const { mimetype, buffer, originalname: filename } = req.file;

    // 1) extract text
    let text = '';
    if (mimetype.includes('pdf')) {
      text = (await pdfParse(buffer)).text;
    } else if (mimetype.includes('word')) {
      text = (await mammoth.extractRawText({ buffer })).value;
    } else {
      // image: just OCR
      text = (await Tesseract.recognize(buffer, 'eng')).data.text;
    }

    // 2) analysis
    const analysis = await fallbackAI(text);

    // 3) respond
    let docType = 'unknown';
    if (mimetype.includes('pdf')) docType = 'pdf';
    else if (mimetype.includes('word')) docType = 'docx';
    else if (mimetype.includes('png')) docType = 'png';
    else if (mimetype.includes('jpeg') || mimetype.includes('jpg')) docType = 'jpeg';

    res.json({
      text,
      analysis,
      document_type: docType,
      confidence_score: 1.0
    });
  } catch (err) {
    console.error('HTTP /api/document error:', err);
    res.status(500).json({ error: 'Failed to analyze document.' });
  }
});

// HTTP endpoint: analyze raw text
app.post('/api/analyze-document', async (req, res) => {
  try {
    const { doc_text } = req.body;
    if (!doc_text) return res.status(400).json({ error: 'No doc_text provided.' });
    const analysis = await fallbackAI(doc_text);
    res.json({ analysis });
  } catch (err) {
    console.error('HTTP /api/analyze-document error:', err);
    res.status(500).json({ error: 'Failed to analyze document text.' });
  }
});

//
// ——— WEBSOCKET SETUP ———
//
const wss = new WebSocket.Server({
  server,
  verifyClient: info => !info.origin || allowedOrigins.includes(info.origin)
});

wss.on('connection', ws => {
  ws.send(JSON.stringify({
    type: 'welcome',
    content: "Welcome! You're connected to FredAI WebSocket server.",
    timestamp: new Date().toISOString()
  }));

  ws.on('message', async raw => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return ws.send(JSON.stringify({ type: 'bot', content: 'Invalid JSON', timestamp: new Date().toISOString() }));
    }

    try {
      // 1) Document upload over WS
      if (msg.type === 'upload_document') {
        const buffer = Buffer.from(msg.content, 'base64');
        let text = '';
        if (msg.mimetype.includes('pdf')) {
          text = (await pdfParse(buffer)).text;
        } else if (msg.mimetype.includes('word')) {
          text = (await mammoth.extractRawText({ buffer })).value;
        } else {
          text = (await Tesseract.recognize(buffer, 'eng')).data.text;
        }
        const analysis = await fallbackAI(text);
        return ws.send(JSON.stringify({
          type: 'upload_ack',
          filename: msg.filename,
          text,
          analysis,
          document_type: msg.mimetype.includes('pdf') ? 'pdf'
                          : msg.mimetype.includes('word') ? 'docx'
                          : 'image',
          confidence_score: 1.0
        }));
      }

      // 2) Ask a question about a document
      if (msg.type === 'ask_question') {
        const prompt = `${msg.doc_text}\n\nUSER QUESTION: ${msg.question}`;
        const answer = await fallbackAI(prompt);
        return ws.send(JSON.stringify({ type: 'chat_response', answer }));
      }

      // 3) General chat fallback
      if (typeof msg.message === 'string') {
        const reply = await fallbackAI(msg.message);
        return ws.send(JSON.stringify({
          type: 'bot',
          content: reply,
          timestamp: new Date().toISOString()
        }));
      }

      // Unknown
      ws.send(JSON.stringify({
        type: 'bot',
        content: "I didn't understand that message format.",
        timestamp: new Date().toISOString()
      }));

    } catch (err) {
      console.error('WS handler error:', err);
      ws.send(JSON.stringify({ type: 'bot', content: 'Internal server error.' }));
    }
  });
});

//
// ——— START SERVER ———
//
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
