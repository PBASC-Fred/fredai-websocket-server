// documenthandler.js - All modular AI and file upload logic

const axios = require('axios');
const multer = require('multer');
const mammoth = require('mammoth');

// ---- Multer upload config ----
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/jpg'
    ];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only PDF, DOCX, PNG, and JPEG allowed.'));
  }
});

// ---- Detect doc type ----
function detectDocType(file) {
  const typeMap = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'image/png': 'png',
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpg'
  };
  const document_type = typeMap[file.mimetype] || 'unknown';
  const confidence_score = document_type !== 'unknown' ? 1.0 : 0.5;
  return { document_type, confidence_score };
}

// ---- Universal OpenAI doc analysis ----
async function analyzeDocument(text) {
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
    return response.data.choices?.[0]?.message?.content || "[No analysis returned]";
  } catch (err) {
    console.error("OpenAI Doc Analysis error:", err?.response?.data || err.message);
    return "[Error analyzing document]";
  }
}

// ---- Stability AI Image Generation ----
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
    if (response.data && response.data.image) {
      if (/^[A-Za-z0-9+/=]+$/.test(response.data.image.trim())) {
        return `data:image/png;base64,${response.data.image}`;
      }
      if (response.data.image.startsWith("http")) {
        return response.data.image;
      }
    }
    if (response.data && response.data.url) {
      return response.data.url;
    }
    return "[Image not generated]";
  } catch (err) {
    console.error("Stability error:", err?.response?.data || err.message);
    return "[Error generating image]";
  }
}

// ---- AI Fallback Chat Handler ----
async function callGemini(prompt) {
  try {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + process.env.GEMINI_API_KEY;
    const response = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }] });
    return response.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch (err) {
    console.error("Gemini error:", err?.response?.data || err.message);
    return "";
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
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );
    return response.data.choices?.[0]?.message?.content || "";
  } catch (err) {
    console.error("OpenAI error:", err?.response?.data || err.message);
    return "";
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
    return response.data?.content?.[0]?.text || "";
  } catch (err) {
    console.error("Anthropic error:", err?.response?.data || err.message);
    return "";
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
    return response.data.choices?.[0]?.message?.content || "";
  } catch (err) {
    console.error("Mistral error:", err?.response?.data || err.message);
    return "";
  }
}

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
      if (reply && !reply.startsWith("[")) {
        console.log(`[AI reply] via ${provider.name}`);
        return reply;
      }
    } catch (err) {
      console.warn(`Provider ${provider.name} threw error:`, err.message);
    }
  }
  return "Sorry, all AI providers failed to respond. Please try again later.";
}

// ---- API HANDLERS ----
const handleDocumentUpload = [
  upload.single('file'),
  async (req, res) => {
    try {
      let fileText = "";
      const { document_type, confidence_score } = detectDocType(req.file);

      if (req.file.mimetype === "application/pdf") {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(req.file.buffer);
        fileText = data.text;
      } else if (req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        fileText = result.value;
      } else if (
        req.file.mimetype === "image/png" ||
        req.file.mimetype === "image/jpeg" ||
        req.file.mimetype === "image/jpg"
      ) {
        const Tesseract = require('tesseract.js');
        const result = await Tesseract.recognize(req.file.buffer, 'eng');
        fileText = result.data.text;
      }

      const analysis = await analyzeDocument(fileText);

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

const handleAnalyzeDocument = async (req, res) => {
  try {
    const { doc_text } = req.body;
    if (!doc_text || typeof doc_text !== 'string' || !doc_text.trim()) {
      return res.status(400).json({ error: "No document text provided." });
    }
    const analysis = await analyzeDocument(doc_text);
    res.json({ analysis });
  } catch (err) {
    console.error('Analyze endpoint error:', err);
    res.status(500).json({ error: "Failed to analyze document text." });
  }
};

module.exports = {
  handleDocumentUpload,
  handleAnalyzeDocument,
  analyzeDocument,
  fallbackAIChat,
  callStability
};
