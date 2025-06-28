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
const { Configuration, OpenAIApi } = require('openai');

// ——— OpenAI client ———
const openai = new OpenAIApi(
  new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);

// ——— Express + CORS + JSON ———
const app = express();
const server = http.createServer(app);

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

// ——— Multer for HTTP uploads ———
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ok = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/jpg'
    ].includes(file.mimetype);
    cb(null, ok);
  }
});

// ——— Helpers ———
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

async function fallbackAI(prompt) {
  const resp = await openai.createChatCompletion({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }]
  });
  return resp.data.choices[0].message.content;
}

// ——— HTTP Endpoints ———
// Health-check
app.get('/', (req, res) => {
  res.send('FredAI server is up.');
});

// Upload + analyze document (HTTP)
app.post('/api/document', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const { mimetype, buffer, originalname: filename } = req.file;
    const { document_type, confidence_score } = detectDocType(mimetype);

    // 1) Extract text
    let text = '';
    if (mimetype.includes('pdf')) {
      text = (await pdfParse(buffer)).text;
    } else if (mimetype.includes('word')) {
      text = (await mammoth.extractRawText({ buffer })).value;
    } else {
      text = (await Tesseract.recognize(buffer, 'eng')).data.text;
    }

    // 2) Analyze
    const analysis = await fallbackAI(text);

    return res.json({ text, analysis, document_type, confidence_score });
  } catch (err) {
    console.error('HTTP /api/document error:', err);
    return res.status(500).json({ error: 'Failed to analyze document.' });
  }
});

// Analyze raw text (HTTP)
app.post('/api/analyze-document', async (req, res) => {
  try {
    const { doc_text } = req.body;
    if (!doc_text) return res.status(400).json({ error: 'No doc_text provided.' });
    const analysis = await fallbackAI(doc_text);
    return res.json({ analysis });
  } catch (err) {
    console.error('HTTP /api/analyze-document error:', err);
    return res.status(500).json({ error: 'Failed to analyze document text.' });
  }
});

// ——— WebSocket Server on `/ws` ———
const wss = new WebSocket.Server({
  server,
  path: '/ws',
  verifyClient: info => !info.origin || allowedOrigins.includes(info.origin)
});

wss.on('connection', ws => {
  // send welcome
  ws.send(JSON.stringify({
    type: 'welcome',
    content: "Welcome! You're connected to FredAI.",
    timestamp: new Date().toISOString()
  }));

  ws.on('message', async raw => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return ws.send(JSON.stringify({
        type: 'bot',
        content: '❌ Invalid JSON',
        timestamp: new Date().toISOString()
      }));
    }

    try {
      // 1) Document upload via WS
      if (msg.type === 'upload_document') {
        const buffer = Buffer.from(msg.content, 'base64');
        const { document_type, confidence_score } = detectDocType(msg.mimetype);
        let text = '', analysis = '';

        if (document_type === 'pdf') {
          text = (await pdfParse(buffer)).text;
        } else if (document_type === 'docx') {
          text = (await mammoth.extractRawText({ buffer })).value;
        } else {
          text = (await Tesseract.recognize(buffer, 'eng')).data.text;
        }
        analysis = await fallbackAI(text);

        return ws.send(JSON.stringify({
          type: 'upload_ack',
          filename: msg.filename,
          text,
          analysis,
          document_type,
          confidence_score
        }));
      }

      // 2) Ask a question about a doc
      if (msg.type === 'ask_question') {
        const prompt = `${msg.doc_text}\n\nUSER QUESTION: ${msg.question}`;
        const answer = await fallbackAI(prompt);
        return ws.send(JSON.stringify({
          type: 'chat_response',
          answer
        }));
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

      // unknown
      ws.send(JSON.stringify({
        type: 'bot',
        content: "❓ I didn't understand that message format.",
        timestamp: new Date().toISOString()
      }));
    } catch (err) {
      console.error('WS handler error:', err);
      ws.send(JSON.stringify({ type: 'bot', content: '⚠️ Internal server error.' }));
    }
  });

  ws.on('close', () => console.log('Client disconnected'));
});

// ——— Start HTTP+WS on same port ———
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
