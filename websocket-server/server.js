const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:3000", 
      "http://localhost:3002",
      "https://fredai-pbasc-trustedadvisor-project-2025-kfzj7qzsn.vercel.app",
      /\.railway\.app$/,
      /\.vercel\.app$/
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

console.log('Socket.IO server configured with CORS for:', ["http://localhost:3000", "http://localhost:3002"]);

app.use(cors());
app.use(express.json());

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
    const client = await db.connect();

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
    const client = await db.connect();
    
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
    const client = await db.connect();
    
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

async function callGeminiAPI(message) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: `You are FredAi, a trusted AI advisor specializing in taxes, budgeting, savings, and financial planning. Provide helpful, accurate financial advice. User message: ${message}`
          }]
        }]
      }
    );
    
    return response.data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return 'Sorry, I encountered an error processing your request. Please try again.';
  }
}

async function generateImage(prompt) {
  try {
    const response = await axios.post(
      'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
      {
        text_prompts: [{ text: `Financial concept: ${prompt}` }],
        cfg_scale: 7,
        height: 1024,
        width: 1024,
        samples: 1,
        steps: 30
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.IMAGE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.artifacts && response.data.artifacts.length > 0) {
      return `data:image/png;base64,${response.data.artifacts[0].base64}`;
    }
    return null;
  } catch (error) {
    console.error('Error generating image:', error);
    return null;
  }
}

wss.on('connection', ws => {
  console.log('WebSocket client connected');
  const sessionId = Math.random().toString(36).substring(7);

  ws.on('message', async message => {
    try {
      const data = JSON.parse(message);
      console.log('Received:', data);

      if (data.type === 'chat') {
        await saveMessage(sessionId, 'user', data.message);
        
        if (data.message.startsWith('/imagine ')) {
          const prompt = data.message.substring(9);
          const imageUrl = await generateImage(prompt);
          
          if (imageUrl) {
            await saveMessage(sessionId, 'image', imageUrl);
            ws.send(JSON.stringify({
              type: 'image',
              content: imageUrl,
              timestamp: new Date()
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'bot',
              content: 'Sorry, I could not generate an image for that prompt.',
              timestamp: new Date()
            }));
          }
        } else {
          const botResponse = await callGeminiAPI(data.message);
          await saveMessage(sessionId, 'bot', botResponse);
          
          ws.send(JSON.stringify({
            type: 'bot',
            content: botResponse,
            timestamp: new Date()
          }));
        }
      }
    } catch (err) {
      console.error('Message processing error:', err);
      ws.send(JSON.stringify({
        type: 'error',
        content: 'Error processing message',
        timestamp: new Date()
      }));
    }
  });

  ws.send(JSON.stringify({
    type: 'welcome',
    content: 'Welcome to FredAi - Trusted AI Advisor! I can help with taxes, budgeting, savings, and financial planning. Use /imagine [prompt] for financial concept images.',
    timestamp: new Date()
  }));
});

app.get('/api/faq', async (req, res) => {
  try {
    const client = await db.connect();
    
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

    const client = await db.connect();
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

const PORT = process.env.PORT || 3000;

initDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
