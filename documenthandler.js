// documenthandler.js
const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');
const { multiProviderDocAnalysis } = require('./ai');
require('dotenv').config();

// instantiate v4 SDK
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Multer config
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

// map mime → type/confidence
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

// use OpenAI vision for images
async function analyzeImageWithOpenAI(buffer, mimetype) {
  const dataUrl = `data:${mimetype};base64,${buffer.toString('base64')}`;
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    input: [
      { type: 'input_text', role: 'user', content: 'Extract any text and summarize this document image.' },
      { type: 'input_image', image_url: dataUrl, detail: 'high' }
    ]
  });
  return resp.choices?.[0]?.message?.content || '';
}

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
      } else if (['png','jpeg','jpg'].includes(document_type)) {
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

module.exports = { handleDocumentUpload, handleAnalyzeDocument };
