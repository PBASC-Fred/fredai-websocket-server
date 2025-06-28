// documenthandler.js

const multer = require('multer');
const mammoth = require("mammoth");
const axios = require("axios");
const path = require("path");

// ---- Multer File Upload Setup ----
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
    else cb(new Error('Invalid file type. Only PDF, DOCX, PNG, and JPEG files are allowed.'));
  }
});

// ---- Document Type Detection ----
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

// ---- OpenAI Document Analysis ----
async function analyzeDocument(docText) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an expert in document analysis. Summarize or extract key information as requested." },
          { role: "user", content: docText }
        ]
      },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );
    // Optionally try to parse out a JSON structure if you want (not required)
    let summary = response.data.choices?.[0]?.message?.content || "[No analysis returned]";
    return {
      summary
    };
  } catch (err) {
    console.error("OpenAI Doc Analysis error:", err?.response?.data || err.message);
    return {
      summary: "[Error analyzing document]"
    };
  }
}

// ---- Handle File Upload ----
const handleDocumentUpload = [
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
      }

      let fileText = "";
      const { document_type, confidence_score } = detectDocType(req.file);

      if (req.file.mimetype === "application/pdf") {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(req.file.buffer);
        fileText = data.text;
      } else if (req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        fileText = result.value;
      } else if (req.file.mimetype === "image/png" || req.file.mimetype === "image/jpeg") {
        const Tesseract = require('tesseract.js');
        const result = await Tesseract.recognize(req.file.buffer, 'eng');
        fileText = result.data.text;
      } else {
        fileText = "[Unable to extract text: Unsupported file type]";
      }

      // Always use OpenAI for analysis
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

// ---- Handle Document Analysis (Text Only) ----
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

// ---- Exports ----
module.exports = {
  handleDocumentUpload,
  handleAnalyzeDocument,
  analyzeDocument // if you need it elsewhere
};
