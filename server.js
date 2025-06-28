// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const WebSocket = require('ws');
const {
  handleDocumentUpload,
  handleAnalyzeDocument
} = require('./documenthandler');
const { multiProviderDocAnalysis } = require('./ai');

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

// --------- EXPRESS / CORS / JSON SETUP ---------
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.send('FredAI server is up.');
});

// HTTP endpoints for your React front end
app.post('/api/document', handleDocumentUpload);
app.post('/api/analyze-document', handleAnalyzeDocument);

// --------- WEBSOCKET SERVER ---------
const wss = new WebSocket.Server({
  server,
  verifyClient: (info, done) => {
    const origin = info.origin;
    done(allowedOrigins.includes(origin) || !origin);
  }
});

wss.on('connection', ws => {
  // Send a friendly welcome
  ws.send(JSON.stringify({
    type: 'welcome',
    content: "📡 WebSocket connected. You’re all set!",
    timestamp: new Date().toISOString()
  }));

  ws.on('message', async raw => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return ws.send(JSON.stringify({
        type: 'bot',
        content: '❌ Invalid message format.',
        timestamp: new Date().toISOString()
      }));
    }

    try {
      // --- 1) DOCUMENT UPLOAD OVER WS ---
      if (data.type === 'upload_document') {
        const buffer = Buffer.from(data.content, 'base64');
        // delegate to your HTTP handler logic
        // we temporarily mount req.file style and call handleDocumentUpload directly:
        // easier: re-implement extraction here:
        const { handleDocumentUpload } = require('./documenthandler');
        // for simplicity, call the same code path as HTTP:
        // but since handleDocumentUpload is an Express middleware array,
        // better to inline parse+analyze:
        const { multiProviderDocAnalysis } = require('./ai');
        const pdfParse   = require('pdf-parse');
        const mammoth    = require('mammoth');
        const Tesseract  = require('tesseract.js');

        let text = '';
        let analysis = '';
        // detect type
        const mt = data.mimetype || '';
        if (mt.includes('pdf')) {
          text = (await pdfParse(buffer)).text;
          analysis = await multiProviderDocAnalysis(text);
        } else if (mt.includes('word')) {
          text = (await mammoth.extractRawText({ buffer })).value;
          analysis = await multiProviderDocAnalysis(text);
        } else if (mt.includes('image')) {
          text = '[image processed]';
          analysis = await multiProviderDocAnalysis(text);
        } else {
          return ws.send(JSON.stringify({
            type: 'upload_error',
            error: 'Unsupported file type.'
          }));
        }

        return ws.send(JSON.stringify({
          type: 'upload_ack',
          filename: data.filename,
          text,
          analysis,
          document_type: mt.includes('pdf') ? 'pdf'
                          : mt.includes('word') ? 'docx'
                          : mt.includes('png')  ? 'png'
                          : 'jpeg',
          confidence_score: 1.0
        }));
      }

      // --- 2) ASK A QUESTION ABOUT A DOCUMENT ---
      if (data.type === 'ask_question') {
        const prompt = `${data.doc_text}\n\nUSER QUESTION: ${data.question}`;
        const answer = await multiProviderDocAnalysis(prompt);
        return ws.send(JSON.stringify({
          type: 'chat_response',
          answer
        }));
      }

      // --- 3) GENERAL CHAT FALLBACK ---
      if (typeof data.message === 'string') {
        const reply = await multiProviderDocAnalysis(data.message);
        return ws.send(JSON.stringify({
          type: 'bot',
          content: reply,
          timestamp: new Date().toISOString()
        }));
      }

      // fallback
      ws.send(JSON.stringify({
        type: 'bot',
        content: '❓ Unknown message type.',
        timestamp: new Date().toISOString()
      }));
    } catch (err) {
      console.error('WS handler error:', err);
      ws.send(JSON.stringify({
        type: 'upload_error',
        error: err.message
      }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Start HTTP+WS on same port
const PORT = process.env.PORT || 8080;
server.listen(PORT, () =>
  console.log(`🚀 Server listening on port ${PORT}`)
);
