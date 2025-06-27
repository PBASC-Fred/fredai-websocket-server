// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const axios = require('axios');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const multer = require('multer');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Environment printout for debugging
console.log('--- ENV CHECK ---');
console.log('GEMINI_API_KEY:', !!process.env.GEMINI_API_KEY);
console.log('OPENAI_API_KEY:', !!process.env.OPENAI_API_KEY);
console.log('STABILITY_API_KEY:', !!process.env.STABILITY_API_KEY);
console.log('DATABASE_URL:', !!process.env.DATABASE_URL);
console.log('EMAIL_ADDRESS:', !!process.env.EMAIL_ADDRESS);
console.log('EMAIL_PASSWORD:', !!process.env.EMAIL_PASSWORD);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('-----------------');

// List ALL allowed origins for WebSocket clients
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3002",
  "https://gitlab-importer-nladay2f.devinapps.com",
  "https://fredai-pbasc-trustedadvisor-project-2025-kfzj7qzsn.vercel.app",
  "https://fredai-drab.vercel.app"
];

// WebSocket server with strict origin check & debugging log
const wss = new WebSocket.Server({
  server,
  verifyClient: (info) => {
    const origin = info.origin;
    const allowed = allowedOrigins.includes(origin) || !origin;
    console.log('[WS] Incoming connection from:', origin, '-> allowed:', allowed);
    return allowed;
  }
});

console.log('WebSocket server configured with CORS for:', allowedOrigins);

app.use(cors());
app.use(express.json());

// Health check endpoint for Railway/Vercel/GitHub bots
app.get('/', (req, res) => {
  res.send('FredAI WebSocket server is running.');
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, PNG, and JPEG files are allowed.'));
    }
  }
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// ---- WebSocket Chat Handler ----
wss.on('connection', (ws, req) => {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log('[WS] New client connected:', sessionId);
  console.log('[WS] Total clients:', wss.clients.size);

  ws.send(JSON.stringify({
    type: 'welcome',
    content: "Welcome! I'm your Trusted AI Advisor.",
    timestamp: new Date().toISOString()
  }));

  ws.on('message', async (data) => {
    console.log('[WS] Message received:', data);

    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (err) {
      console.error('[WS] Invalid JSON:', err, data);
      ws.send(JSON.stringify({
        type: 'bot',
        content: 'Internal error: invalid message format.',
        timestamp: new Date().toISOString()
      }));
      return;
    }

    if (message.type === 'chat') {
      try {
        const userMessage = message.message;
        await saveMessage(sessionId, 'user', userMessage);

        // Replace with your actual AI provider logic as needed
        const aiResponse = await generateGeminiResponse(userMessage);
        console.log('[WS] AI Response:', aiResponse);

        await saveMessage(sessionId, 'bot', aiResponse);

        ws.send(JSON.stringify({
          type: 'bot',
          content: aiResponse,
          timestamp: new Date().toISOString()
        }));
        console.log('[WS] Sent bot response');
      } catch (err) {
        console.error('[WS] Error in chat handling:', err);
        ws.send(JSON.stringify({
          type: 'bot',
          content: 'Sorry, an error occurred processing your message.',
          timestamp: new Date().toISOString()
        }));
      }
    } else {
      ws.send(JSON.stringify({
        type: 'bot',
        content: 'Unknown message type.',
        timestamp: new Date().toISOString()
      }));
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected:', sessionId);
  });

  ws.on('error', (error) => {
    console.error('[WS] WebSocket error:', error);
  });
});

// ---- HTTP routes as before ----
// ... (your app.get('/api/faq'), app.post('/api/suggestions'), etc.)

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});
