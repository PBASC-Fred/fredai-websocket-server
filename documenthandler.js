// documenthandler.js
// WebSocket-based document upload, analysis, and Q&A handler

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');
const { Configuration, OpenAIApi } = require('openai');
const { multiProviderDocAnalysis } = require('./ai');
require('dotenv').config();

// === OpenAI Vision client ===
const openai = new OpenAIApi(
  new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);

// Map MIME types to our document_type and confidence
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

// Use OpenAI Vision to extract & summarize image content
async function analyzeImageWithOpenAI(buffer, mimetype) {
  const b64 = buffer.toString('base64');
  const dataUrl = `data:${mimetype};base64,${b64}`;
  const resp = await openai.createChatCompletion({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are an expert at understanding document images.' },
      { role: 'user', content: 'Please extract any text and summarize the content of this document image.' },
      {
        type: 'input_image',
        image_url: dataUrl,
        detail: 'high'
      }
    ]
  });
  return resp.data.choices?.[0]?.message?.content || '';
}

// Handle an upload_document message
async function handleUpload(ws, data) {
  try {
    const { filename, mimetype, content: b64 } = data;
    const buffer = Buffer.from(b64, 'base64');
    const { document_type, confidence_score } = detectDocType(mimetype);

    let text = '';
    let analysis = '';

    if (document_type === 'pdf') {
      const parsed = await pdfParse(buffer);
      text = parsed.text;
      analysis = await multiProviderDocAnalysis(text);

    } else if (document_type === 'docx') {
      const res = await mammoth.extractRawText({ buffer });
      text = res.value;
      analysis = await multiProviderDocAnalysis(text);

    } else if (['png', 'jpeg', 'jpg'].includes(document_type)) {
      // Use OpenAI Vision for images
      analysis = await analyzeImageWithOpenAI(buffer, mimetype);
      text = '[Image processed by OpenAI Vision]';

    } else {
      throw new Error('Unsupported file type');
    }

    ws.send(JSON.stringify({
      type: 'upload_ack',
      filename,
      text,
      analysis,
      document_type,
      confidence_score
    }));

  } catch (err) {
    console.error('Upload handler error:', err);
    ws.send(JSON.stringify({
      type: 'upload_error',
      error: err.message || 'Failed to process document'
    }));
  }
}

// Handle an ask_question message
async function handleQuestion(ws, data) {
  try {
    const prompt = `${data.doc_text}\n\nUSER QUESTION: ${data.question}`;
    const answer = await multiProviderDocAnalysis(prompt);
    ws.send(JSON.stringify({
      type: 'chat_response',
      answer
    }));
  } catch (err) {
    console.error('Question handler error:', err);
    ws.send(JSON.stringify({
      type: 'chat_response',
      answer: 'Error answering your question.'
    }));
  }
}

// Attach handlers to a WebSocket connection
function setupDocumentHandler(ws) {
  ws.on('message', async raw => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return ws.send(JSON.stringify({
        type: 'upload_error',
        error: 'Invalid message format'
      }));
    }

    if (data.type === 'upload_document') {
      await handleUpload(ws, data);
    } else if (data.type === 'ask_question') {
      await handleQuestion(ws, data);
    }
    // other message types (e.g. /imagine) can be handled elsewhere
  });
}

module.exports = { setupDocumentHandler };
