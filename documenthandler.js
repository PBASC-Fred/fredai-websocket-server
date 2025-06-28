const multer = require('multer');
const mammoth = require("mammoth");
const axios = require('axios');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');

// Multer upload config
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg'
    ];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only PDF, DOCX, PNG, and JPEG allowed.'));
  }
});

// Helper: Detect doc type
function detectDocType(file) {
  const typeMap = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'image/png': 'png',
    'image/jpeg': 'jpeg'
  };
  const document_type = typeMap[file.mimetype] || 'unknown';
  const confidence_score = document_type !== 'unknown' ? 1.0 : 0.5;
  return { document_type, confidence_score };
}

// ==== AI PROVIDERS ====

// 1. OpenAI
async function callOpenAI(text) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an expert in document analysis. Summarize or extract key information as requested." },
          { role: "user", content: text }
        ]
      },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );
    return response.data.choices?.[0]?.message?.content || "";
  } catch (err) {
    console.error("OpenAI Doc Analysis error:", err?.response?.data || err.message);
    return "";
  }
}

// 2. Gemini (Google)
async function callGemini(text) {
  try {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + process.env.GEMINI_API_KEY;
    const response = await axios.post(url, { contents: [{ parts: [{ text }] }] });
    return response.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch (err) {
    console.error("Gemini Doc Analysis error:", err?.response?.data || err.message);
    return "";
  }
}

// 3. Anthropic
async function callAnthropic(text) {
  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-3-opus-20240229",
        max_tokens: 2048,
        messages: [
          { role: "user", content: text }
        ]
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
    console.error("Anthropic Doc Analysis error:", err?.response?.data || err.message);
    return "";
  }
}

// 4. Mistral
async function callMistral(text) {
  try {
    const response = await axios.post(
      "https://api.mistral.ai/v1/chat/completions",
      {
        model: "mistral-large-latest",
        messages: [{ role: "user", content: text }]
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
    console.error("Mistral Doc Analysis error:", err?.response?.data || err.message);
    return "";
  }
}

// ==== Multi-provider fallback ====
async function multiProviderDocAnalysis(text) {
  const providers = [
    { name: "OpenAI",    fn: callOpenAI,    key: process.env.OPENAI_API_KEY },
    { name: "Gemini",    fn: callGemini,    key: process.env.GEMINI_API_KEY },
    { name: "Anthropic", fn: callAnthropic, key: process.env.ANTHROPIC_API_KEY },
    { name: "Mistral",   fn: callMistral,   key: process.env.MISTRAL_API_KEY }
  ];
  for (const provider of providers) {
    if (!provider.key) continue;
    try {
      const result = await provider.fn(text);
      if (result && result.trim() && !result.startsWith("[")) {
        console.log(`[Doc Analysis] Provided by: ${provider.name}`);
        return result;
      }
    } catch (err) {
      // Already logged above
    }
  }
  return "Sorry, all AI providers failed to respond. Please try again later.";
}

// ==== /api/document handler ====
const handleDocumentUpload = [
  upload.single('file'),
  async (req, res) => {
    try {
      let fileText = "";
      const { document_type, confidence_score } = detectDocType(req.file);

      if (req.file.mimetype === "application/pdf") {
        const data = await pdfParse(req.file.buffer);
        fileText = data.text;
      } else if (req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        fileText = result.value;
      } else if (req.file.mimetype === "image/png" || req.file.mimetype === "image/jpeg") {
        const result = await Tesseract.recognize(req.file.buffer, 'eng');
        fileText = result.data.text;
      }

      const analysis = await multiProviderDocAnalysis(fileText);

      res.json({
        text: fileText,
        analysis,
        document_type,
        confidence_score
      });
    } catch (err) {
      console.error('Doc upload error:', err);
      res.status(500).json({ error: "Failed to analyze document." });
    }
  }
];

// ==== /api/analyze-document handler ====
const handleAnalyzeDocument = async (req, res) => {
  try {
    const { doc_text } = req.body;
    if (!doc_text || typeof doc_text !== 'string' || !doc_text.trim()) {
      return res.status(400).json({ error: "No document text provided." });
    }
    const analysis = await multiProviderDocAnalysis(doc_text);
    res.json({ analysis });
  } catch (err) {
    console.error('Analyze endpoint error:', err);
    res.status(500).json({ error: "Failed to analyze document text." });
  }
};

module.exports = {
  handleDocumentUpload,
  handleAnalyzeDocument,
  multiProviderDocAnalysis // for advanced chat flows if needed
};
