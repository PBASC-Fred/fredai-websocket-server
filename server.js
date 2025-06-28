// server.js - Modular AI chat/image/websocket, document upload routed to documenthandler

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
require('dotenv').config();

const {
  handleDocumentUpload,
  handleAnalyzeDocument,
  fallbackAIChat,
  callStability,
} = require('./documenthandler');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3002",
  "https://fredai-pbasc-trustedadvisor-project.vercel.app",
  "https://fredai-pbasc-trustedadvisor-project-202-pbasc-trustadvisor-chat.vercel.app",
  "https://websocket-server-production-433e.up.railway.app",
  "wss://websocket-server-production-433e.up.railway.app"
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());

// --------- Health Check ---------
app.get('/', (req, res) => {
  res.status(200).send('FredAI WebSocket server is running.');
});

// --------- Document Analysis Routes (NO multer here) ---------
app.post('/api/document', handleDocumentUpload);
app.post('/api/analyze-document', handleAnalyzeDocument);

// --------- WebSocket Server ---------
const wss = new WebSocket.Server({
  server,
  verifyClient: (info) => {
    const origin = info.origin;
    const allowed = allowedOrigins.includes(origin) || !origin;
    console.log('[WS] Incoming connection from:', origin, '-> allowed:', allowed);
    return allowed;
  }
});

wss.on('connection', (ws) => {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log('[WS] New client connected:', sessionId);

  ws.send(JSON.stringify({
    type: 'welcome',
    content: "Welcome! I'm your Trusted AI Advisor.",
    timestamp: new Date().toISOString()
  }));

  ws.on('message', async (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'bot',
        content: 'Internal error: invalid message format.',
        timestamp: new Date().toISOString()
      }));
      return;
    }
    try {
      let userMessage = message.message || "";
      if (typeof userMessage === "string" && userMessage.trim().toLowerCase().startsWith("/imagine")) {
        const imgPrompt = userMessage.replace(/^\/imagine\s*/i, "").trim();
        if (imgPrompt.length === 0) {
          ws.send(JSON.stringify({
            type: "bot",
            content: "Please provide a prompt after `/imagine` for image generation.",
            timestamp: new Date().toISOString()
          }));
          return;
        }
        const img = await callStability(imgPrompt);
        ws.send(JSON.stringify({
          type: "image",
          content: img,
          timestamp: new Date().toISOString()
        }));
      } else {
        const botResponse = await fallbackAIChat(userMessage);
        ws.send(JSON.stringify({
          type: 'bot',
          content: botResponse,
          timestamp: new Date().toISOString()
        }));
      }
    } catch (err) {
      console.error('[WS] Error in chat handling:', err);
      ws.send(JSON.stringify({
        type: 'bot',
        content: "Sorry, an error occurred processing your message.",
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

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});
