const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'fredai_db'
};

const emailTransporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_ADDRESS,
    pass: process.env.EMAIL_PASSWORD
  }
});

async function initDatabase() {
  try {
    const connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password
    });

    await connection.execute(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
    await connection.end();

    const db = await mysql.createConnection(dbConfig);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(255),
        message_type ENUM('user', 'bot', 'image') NOT NULL,
        content TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS suggestions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        suggestion TEXT NOT NULL,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        email_sent BOOLEAN DEFAULT FALSE
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS faq_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_name VARCHAR(255) NOT NULL,
        display_order INT DEFAULT 0
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS faq_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        display_order INT DEFAULT 0,
        FOREIGN KEY (category_id) REFERENCES faq_categories(id)
      )
    `);

    console.log('Database initialized successfully');
    await db.end();
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

async function saveMessage(sessionId, messageType, content) {
  try {
    const db = await mysql.createConnection(dbConfig);
    
    await db.execute(
      'INSERT IGNORE INTO chat_sessions (session_id) VALUES (?)',
      [sessionId]
    );
    
    await db.execute(
      'INSERT INTO messages (session_id, message_type, content) VALUES (?, ?, ?)',
      [sessionId, messageType, content]
    );
    
    await db.end();
  } catch (error) {
    console.error('Error saving message:', error);
  }
}

async function saveSuggestion(suggestion) {
  try {
    const db = await mysql.createConnection(dbConfig);
    
    const [result] = await db.execute(
      'INSERT INTO suggestions (suggestion) VALUES (?)',
      [suggestion]
    );
    
    await db.end();
    return result.insertId;
  } catch (error) {
    console.error('Error saving suggestion:', error);
    throw error;
  }
}

async function sendEmailSuggestion(suggestion) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_ADDRESS,
      to: 'professionalbusinessadvisory@gmail.com',
      subject: 'New Service Suggestion for PBASC',
      html: `
        <html><body>
          <h2 style="color: #014B7B;">New Service Suggestion</h2>
          <p style="font-size: 16px;">A new suggestion has been submitted via the PBASC chatbot:</p>
          <p style="font-size: 16px; color: #4CAF50;">"${suggestion}"</p>
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

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  const sessionId = socket.id;

  socket.on('user_message', async (data) => {
    const { message } = data;
    console.log('Received user message:', message);

    await saveMessage(sessionId, 'user', message);

    try {
      const response = await axios.post('http://localhost:5005/webhooks/rest/webhook', {
        sender: sessionId,
        message: message
      });

      if (response.data && response.data.length > 0) {
        const botResponse = response.data[0];
        await saveMessage(sessionId, 'bot', botResponse.text);
        
        socket.emit('bot_response', {
          text: botResponse.text,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Error communicating with Rasa:', error);
      socket.emit('bot_response', {
        text: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      });
    }
  });

  socket.on('image_request', async (data) => {
    const { prompt } = data;
    console.log('Received image request:', prompt);

    await saveMessage(sessionId, 'user', `/imagine ${prompt}`);

    try {
      const response = await axios.post('http://localhost:5005/webhooks/rest/webhook', {
        sender: sessionId,
        message: `/imagine ${prompt}`
      });

      if (response.data && response.data.length > 0) {
        const botResponse = response.data[0];
        if (botResponse.image) {
          await saveMessage(sessionId, 'image', botResponse.image);
          socket.emit('image_response', {
            image_url: botResponse.image,
            timestamp: new Date()
          });
        }
      }
    } catch (error) {
      console.error('Error generating image:', error);
      socket.emit('bot_response', {
        text: 'Sorry, I encountered an error generating the image. Please try again.',
        timestamp: new Date()
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

app.get('/api/faq', async (req, res) => {
  try {
    const db = await mysql.createConnection(dbConfig);
    
    const [categories] = await db.execute(`
      SELECT fc.id, fc.category_name, fi.question, fi.answer
      FROM faq_categories fc
      LEFT JOIN faq_items fi ON fc.id = fi.category_id
      ORDER BY fc.display_order, fi.display_order
    `);
    
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
    
    await db.end();
    res.json(faqData);
  } catch (error) {
    console.error('Error fetching FAQ:', error);
    res.status(500).json({ error: 'Failed to fetch FAQ data' });
  }
});

app.post('/api/suggestions', async (req, res) => {
  try {
    const { suggestion } = req.body;
    
    if (!suggestion || !suggestion.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Suggestion is required' 
      });
    }

    const suggestionId = await saveSuggestion(suggestion.trim());
    await sendEmailSuggestion(suggestion.trim());

    const db = await mysql.createConnection(dbConfig);
    await db.execute(
      'UPDATE suggestions SET email_sent = TRUE WHERE id = ?',
      [suggestionId]
    );
    await db.end();

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

const PORT = process.env.WEBSOCKET_PORT || 3001;

initDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`WebSocket server running on port ${PORT}`);
  });
});
