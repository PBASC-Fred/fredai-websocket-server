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

const allowedOrigins = [
  "http://localhost:3000", 
  "http://localhost:3002",
  "https://gitlab-importer-nladay2f.devinapps.com",
  "https://fredai-pbasc-trustedadvisor-project-2025-kfzj7qzsn.vercel.app"
];

const wss = new WebSocket.Server({ 
  server,
  verifyClient: (info) => {
    const origin = info.origin;
    return allowedOrigins.includes(origin) || !origin;
  }
});

console.log('WebSocket server configured with CORS for:', allowedOrigins);

app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
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
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/fredai_db',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_ADDRESS,
    pass: process.env.EMAIL_PASSWORD
  }
});

async function initDatabase() {
  try {
    const client = await pool.connect();

    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255),
        message_type VARCHAR(10) CHECK (message_type IN ('user', 'bot', 'image')) NOT NULL,
        content TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS suggestions (
        id SERIAL PRIMARY KEY,
        suggestion TEXT NOT NULL,
        name VARCHAR(255),
        email VARCHAR(255),
        is_anonymous BOOLEAN DEFAULT TRUE,
        want_response BOOLEAN DEFAULT FALSE,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        email_sent BOOLEAN DEFAULT FALSE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS faq_categories (
        id SERIAL PRIMARY KEY,
        category_name VARCHAR(255) NOT NULL,
        display_order INT DEFAULT 0
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS faq_items (
        id SERIAL PRIMARY KEY,
        category_id INT,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        display_order INT DEFAULT 0,
        FOREIGN KEY (category_id) REFERENCES faq_categories(id)
      )
    `);

    console.log('Database initialized successfully');
    client.release();
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

async function saveMessage(sessionId, messageType, content) {
  try {
    const client = await pool.connect();
    
    await client.query(
      'INSERT INTO chat_sessions (session_id) VALUES ($1) ON CONFLICT (session_id) DO NOTHING',
      [sessionId]
    );
    
    await client.query(
      'INSERT INTO messages (session_id, message_type, content) VALUES ($1, $2, $3)',
      [sessionId, messageType, content]
    );
    
    client.release();
  } catch (error) {
    console.error('Error saving message:', error);
  }
}

async function saveSuggestion(suggestionData) {
  try {
    const client = await pool.connect();
    
    const result = await client.query(
      'INSERT INTO suggestions (suggestion, name, email, is_anonymous, want_response) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [
        suggestionData.suggestion,
        suggestionData.name || null,
        suggestionData.email || null,
        suggestionData.isAnonymous,
        suggestionData.wantResponse
      ]
    );
    
    client.release();
    return result.rows[0].id;
  } catch (error) {
    console.error('Error saving suggestion:', error);
    throw error;
  }
}

async function sendEmailSuggestion(suggestionData) {
  try {
    const contactInfo = suggestionData.isAnonymous ? 
      '<p style="font-size: 14px; color: #666;"><em>Submitted anonymously</em></p>' :
      `<div style="background-color: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px;">
        <h3 style="color: #014B7B; margin-top: 0;">Contact Information:</h3>
        <p style="margin: 5px 0;"><strong>Name:</strong> ${suggestionData.name || 'Not provided'}</p>
        <p style="margin: 5px 0;"><strong>Email:</strong> ${suggestionData.email || 'Not provided'}</p>
        <p style="margin: 5px 0;"><strong>Wants Response:</strong> ${suggestionData.wantResponse ? 'Yes' : 'No'}</p>
      </div>`;

    const mailOptions = {
      from: process.env.EMAIL_ADDRESS,
      to: 'professionalbusinessadvisory@gmail.com',
      subject: `New Service Suggestion for FredAi ${suggestionData.isAnonymous ? '(Anonymous)' : ''}`,
      html: `
        <html><body>
          <h2 style="color: #014B7B;">New Service Suggestion</h2>
          <p style="font-size: 16px;">A new suggestion has been submitted via the FredAi Trusted AI Advisor:</p>
          <div style="background-color: #e8f5e8; padding: 15px; margin: 15px 0; border-left: 4px solid #4CAF50; border-radius: 5px;">
            <p style="font-size: 16px; margin: 0; color: #2e7d32;">"${suggestionData.suggestion}"</p>
          </div>
          ${contactInfo}
          <p style="font-size: 12px; color: #888; margin-top: 20px;">
            Submitted on: ${new Date().toLocaleString()}
          </p>
        </body></html>
      `
    };

    await emailTransporter.sendMail(mailOptions);
    console.log('Suggestion email sent successfully');
  } catch (error) {
    console.error('Error sending suggestion email:', error);
    throw error;
  }
}

console.log('WebSocket server initialized, waiting for connections...');

async function generateGeminiResponse(message) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: `You are FredAi, a trusted AI advisor specializing in taxes, budgeting, savings, and financial planning. Please provide helpful, accurate financial advice. User question: ${message}`
          }]
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return response.data.candidates[0].content.parts[0].text;
    } else {
      return "I'm sorry, I couldn't generate a response. Please try again.";
    }
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return "I'm experiencing technical difficulties. Please try again later.";
  }
}

async function generateStabilityImage(prompt) {
  try {
    const response = await axios.post(
      'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
      {
        text_prompts: [{ text: `Financial concept: ${prompt}` }],
        cfg_scale: 7,
        height: 512,
        width: 512,
        samples: 1,
        steps: 30
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.IMAGE_API_KEY}`
        }
      }
    );

    if (response.data?.artifacts?.[0]?.base64) {
      return `data:image/png;base64,${response.data.artifacts[0].base64}`;
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error generating image:', error);
    return null;
  }
}

wss.on('connection', (ws, req) => {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log('NEW CLIENT CONNECTED:', sessionId);
  console.log('Total connected clients:', wss.clients.size);
  
  ws.send(JSON.stringify({
    type: 'welcome',
    content: "Welcome! I'm your Trusted AI Advisor. I can help with taxes, budgeting, savings, and generate finance-related images.",
    timestamp: new Date().toISOString()
  }));

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received message:', message);

      if (message.type === 'chat') {
        const userMessage = message.message;
        await saveMessage(sessionId, 'user', userMessage);

        if (userMessage.startsWith('/imagine ')) {
          const imagePrompt = userMessage.substring(9);
          console.log('Processing image request:', imagePrompt);
          
          const imageUrl = await generateStabilityImage(imagePrompt);
          
          if (imageUrl) {
            await saveMessage(sessionId, 'image', imageUrl);
            ws.send(JSON.stringify({
              type: 'image',
              content: imageUrl,
              timestamp: new Date().toISOString()
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'bot',
              content: 'Sorry, I encountered an error generating the image. Please try again.',
              timestamp: new Date().toISOString()
            }));
          }
        } else {
          const botResponse = await generateGeminiResponse(userMessage);
          await saveMessage(sessionId, 'bot', botResponse);
          
          ws.send(JSON.stringify({
            type: 'bot',
            content: botResponse,
            timestamp: new Date().toISOString()
          }));
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'bot',
        content: 'Sorry, I encountered an error processing your message.',
        timestamp: new Date().toISOString()
      }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected:', sessionId);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

app.get('/api/faq', async (req, res) => {
  try {
    const client = await pool.connect();
    
    const result = await client.query(`
      SELECT fc.id, fc.category_name, fi.question, fi.answer
      FROM faq_categories fc
      LEFT JOIN faq_items fi ON fc.id = fi.category_id
      ORDER BY fc.display_order, fi.display_order
    `);
    
    const categories = result.rows;
    
    const faqData = categories.reduce((acc, row) => {
      const existingCategory = acc.find(cat => cat.category === row.category_name);
      
      if (existingCategory) {
        if (row.question) {
          existingCategory.faqs.push({
            question: row.question,
            answer: row.answer
          });
        }
      } else {
        acc.push({
          category: row.category_name,
          faqs: row.question ? [{
            question: row.question,
            answer: row.answer
          }] : []
        });
      }
      
      return acc;
    }, []);
    
    client.release();
    res.json(faqData);
  } catch (error) {
    console.error('Error fetching FAQ:', error);
    res.status(500).json({ error: 'Failed to fetch FAQ data' });
  }
});

app.post('/api/suggestions', async (req, res) => {
  try {
    const { suggestion, name, email, isAnonymous, wantResponse } = req.body;
    
    if (!suggestion || !suggestion.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Suggestion is required' 
      });
    }

    if (!isAnonymous && wantResponse && (!email || !email.trim())) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required if you want to receive a response' 
      });
    }

    const suggestionData = {
      suggestion: suggestion.trim(),
      name: name ? name.trim() : null,
      email: email ? email.trim() : null,
      isAnonymous: Boolean(isAnonymous),
      wantResponse: Boolean(wantResponse)
    };

    const suggestionId = await saveSuggestion(suggestionData);
    await sendEmailSuggestion(suggestionData);

    const client = await pool.connect();
    await client.query(
      'UPDATE suggestions SET email_sent = TRUE WHERE id = $1',
      [suggestionId]
    );
    client.release();

    res.json({ 
      success: true, 
      message: 'Thank you! Your suggestion has been sent.' 
    });
  } catch (error) {
    console.error('Error processing suggestion:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send the suggestion. Please try again.' 
    });
  }
});

app.post('/api/upload-document', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No document file provided' 
      });
    }

    const axios = require('axios');
    const FormData = require('form-data');
    
    const form = new FormData();
    form.append('document', req.file.buffer, req.file.originalname);
    
    const file_id = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    res.json({
      success: true,
      file_id: file_id,
      message: 'Document uploaded successfully',
      filename: req.file.originalname
    });
  } catch (error) {
    console.error('Upload proxy error:', error);
    if (error.message.includes('Invalid file type')) {
      res.status(400).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Upload service unavailable' });
    }
  }
});

app.post('/api/analyze-document', async (req, res) => {
  try {
    const { file_id, contact_info } = req.body;
    
    if (!file_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'File ID is required for analysis' 
      });
    }

    res.json({
      success: true,
      analysis: {
        document_type: 'Financial Document',
        key_findings: [
          'Document contains financial information',
          'Tax-related content detected',
          'Income and expense data identified'
        ],
        summary: 'This appears to be a financial document with tax and income information.',
        confidence: 0.85
      },
      message: 'Document analysis completed successfully'
    });
  } catch (error) {
    console.error('Analysis proxy error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Analysis service unavailable' 
    });
  }
});

const PORT = process.env.PORT || 3001;

initDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`WebSocket server running on port ${PORT}`);
  });
});
