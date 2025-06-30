// ai-documenthandler.js
require('dotenv').config();
const axios = require('axios');
const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');

// ——— AI Providers ———
async function callOpenAI(prompt) {
  if (!process.env.OPENAI_API_KEY) return '';
  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    { model: 'gpt-4o', messages: [{ role: 'user', content: prompt }] },
    { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
  );
  return res.data.choices?.[0]?.message?.content || '';
}

async function callGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) return '';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + process.env.GEMINI_API_KEY;
  const r = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }] });
  return r.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callAnthropic(prompt) {
  if (!process.env.ANTHROPIC_API_KEY) return '';
  const r = await axios.post(
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
  return r.data?.content?.[0]?.text || '';
}

async function callMistral(prompt) {
  if (!process.env.MISTRAL_API_KEY) return '';
  const r = await axios.post(
    'https://api.mistral.ai/v1/chat/completions',
    { model: 'mistral-large-latest', messages: [{ role: 'user', content: prompt }] },
    { headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` } }
  );
  return r.data.choices?.[0]?.message?.content || '';
}

const providers = [
  { name: 'OpenAI', fn: callOpenAI, key: process.env.OPENAI_API_KEY },
  { name: 'Gemini', fn: callGemini, key: process.env.GEMINI_API_KEY },
  { name: 'Anthropic', fn: callAnthropic, key: process.env.ANTHROPIC_API_KEY },
  { name: 'Mistral', fn: callMistral, key: process.env.MISTRAL_API_KEY },
];

// ——— Fallback chain ———
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
      console.warn(`❌ ${p.name} failed:`, e?.message || e);
    }
  }
  return 'Sorry, all AI providers failed to respond. Please try again later.';
}

// ——— Multer setup ———
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
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

// ——— Mime type mapping ———
function detectDocType(mime) {
  const map = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'image/png': 'png',
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpg'
  };
  const type = map[mime] || 'unknown';
  return { document_type: type, confidence_score: type === 'unknown' ? 0.5 : 1.0 };
}

// ——— OpenAI Vision for images ———
const openaiVision = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
async function analyzeImageWithOpenAI(buffer, mimetype) {
  const dataUrl = `data:${mimetype};base64,${buffer.toString('base64')}`;
  // For GPT-4o/gpt-4-vision models, see OpenAI docs for latest API
  const resp = await openaiVision.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract any text and summarize this document image.' },
          { type: 'image_url', image_url: { url: dataUrl }, detail: 'high' }
        ]
      }
    ]
  });
  return resp.choices?.[0]?.message?.content || '';
}

// ——— Express Route Handlers ———

// HTTP: file upload handler
const handleDocumentUpload = [
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
      const { document_type, confidence_score } = detectDocType(req.file.mimetype);
      let text = '', analysis = '';

      if (document_type === 'pdf') {
        const pdf = await pdfParse(req.file.buffer);
        text = pdf.text;
        analysis = await multiProviderDocAnalysis(text);
      } else if (document_type === 'docx') {
        const doc = await mammoth.extractRawText({ buffer: req.file.buffer });
        text = doc.value;
        analysis = await multiProviderDocAnalysis(text);
      } else if (['png', 'jpeg', 'jpg'].includes(document_type)) {
        analysis = await analyzeImageWithOpenAI(req.file.buffer, req.file.mimetype);
        text = '[Image content processed by vision model]';
      } else {
        return res.status(400).json({ error: 'Unsupported type.' });
      }

      res.json({ text, analysis, document_type, confidence_score });
    } catch (err) {
      console.error('Doc handler error:', err);
      res.status(500).json({ error: 'Failed to analyze document.' });
    }
  }
];

// HTTP: raw-text analysis
async function handleAnalyzeDocument(req, res) {
  try {
    const { doc_text } = req.body;
    if (!doc_text) return res.status(400).json({ error: 'No document text provided.' });
    const analysis = await multiProviderDocAnalysis(doc_text);
    res.json({ analysis });
  } catch (err) {
    console.error('Analyze endpoint error:', err);
    res.status(500).json({ error: 'Failed to analyze text.' });
  }
}

module.exports = { handleDocumentUpload, handleAnalyzeDocument, multiProviderDocAnalysis };
