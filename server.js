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
const { OpenAI } = require('openai');
const axios = require('axios');

// If you have a multiProviderDocAnalysis helper, keep it:
// const { multiProviderDocAnalysis } = require('./ai');

const app = express();
const server = http.createServer(app);

// CORS setup
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

// Instantiate new v4 OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Fallback AI chat (you can extend this to other providers)
async function fallbackAI(prompt) {
  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }]
    });
    return resp.choices[0].message.content;
  } catch (err) {
    console.error('OpenAI error:', err);
    return 'Sorry, AI request failed.';
  }
}

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
    analysis = await fallbackAI(text);

    const document_type = detectDocType(mimetype);
    return res.json({
      text,
      analysis,
      document_type,
      confidence_score: 1.0
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
    const analysis = await fallbackAI(doc_text);
    return res.json({ analysis });
  } catch (err) {
    console.error('HTTP /api/analyze-document error:', err);
    return res.status(500).json({ error: 'Failed to analyze text.' });
  }
});

// WebSocket server
const wss = new WebSocket.Server({
  server,
  verifyClient: info => !info.origin || allowedOrigins.includes(info.origin)
});

wss.on('connection', ws => {
  // welcome message
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

        analysis = await fallbackAI(text);
        return ws.send(JSON.s
